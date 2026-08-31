-- ============================================================================
-- Server-side authorization primitives.
-- Privileged roles can only ever be granted through these functions, never by
-- a client insert. Finalized inspections can only change through the
-- amendment workflow.
-- ============================================================================

-- ---------- ownership / scope helpers ----------
CREATE OR REPLACE FUNCTION public.my_manufacturer_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.manufacturers WHERE owner_id = auth.uid() ORDER BY created_at LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.owns_manufacturer(_manufacturer_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.manufacturers m
                 WHERE m.id = _manufacturer_id AND m.owner_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.owns_product(_product_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.products p
    LEFT JOIN public.manufacturers m ON m.id = p.manufacturer_id
    WHERE p.id = _product_id AND (m.owner_id = auth.uid() OR p.created_by = auth.uid())
  )
$$;

CREATE OR REPLACE FUNCTION public.product_is_active(_product_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.products p WHERE p.id = _product_id AND p.status = 'active')
$$;

CREATE OR REPLACE FUNCTION public.is_authority_staff(_authority_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _authority_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.authority_members m
    WHERE m.user_id = auth.uid() AND m.authority_id = _authority_id AND m.is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_authority_request(_request_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.authority_requests r
    LEFT JOIN public.manufacturers m ON m.id = r.manufacturer_id
    WHERE r.id = _request_id
      AND (m.owner_id = auth.uid()
           OR r.created_by = auth.uid()
           OR public.is_authority_staff(r.authority_id)
           OR public.has_role(auth.uid(),'system_admin'))
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_complaint(_complaint_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.complaints c WHERE c.id = _complaint_id AND (
      c.complainant_id = auth.uid()
      OR public.has_role(auth.uid(),'system_admin')
      OR (public.is_gov_staff(auth.uid())
          AND (c.authority_id IS NULL OR c.authority_id = public.my_authority_id()))
    )
  )
$$;

-- ---------- abuse protection ----------
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _bucket TEXT, _subject TEXT, _limit INTEGER, _window_seconds INTEGER)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _win TIMESTAMPTZ := to_timestamp(floor(extract(epoch FROM now()) / GREATEST(_window_seconds,1)) * GREATEST(_window_seconds,1));
  _count INTEGER;
BEGIN
  INSERT INTO public.rate_limits (bucket, subject, window_start, count)
  VALUES (_bucket, left(_subject, 200), _win, 1)
  ON CONFLICT (bucket, subject, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1, updated_at = now()
  RETURNING count INTO _count;

  IF random() < 0.02 THEN
    DELETE FROM public.rate_limits WHERE window_start < now() - interval '2 days';
  END IF;
  RETURN _count <= GREATEST(_limit, 1);
END;
$$;
REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- ---------- audit trail: always stamp actor + authority ----------
CREATE OR REPLACE FUNCTION public.audit_stamp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.actor_id IS NULL THEN NEW.actor_id := auth.uid(); END IF;
  IF NEW.authority_id IS NULL THEN NEW.authority_id := public.my_authority_id(); END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER audit_logs_stamp BEFORE INSERT ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_stamp();

-- ---------- signup can never self-assign a privileged role ----------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _requested TEXT;
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), COALESCE(NEW.email,''),
          NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;

  -- Every public signup is a citizen account. Privileged roles are granted
  -- only by an authorized administrator or a valid provisioning invitation.
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'citizen')
  ON CONFLICT (user_id, role) DO NOTHING;

  _requested := NEW.raw_user_meta_data->>'requested_role';
  IF _requested IN ('inspector','supervisor','manufacturer','authority_admin','retailer') THEN
    INSERT INTO public.role_requests (user_id, requested_role, justification)
    VALUES (NEW.id, _requested::public.app_role,
            NULLIF(NEW.raw_user_meta_data->>'role_justification',''))
    ON CONFLICT (user_id, requested_role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- ---------- provisioning: invitation redemption ----------
CREATE OR REPLACE FUNCTION public.redeem_role_invitation(_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inv public.role_invitations; _uid UUID := auth.uid(); _email TEXT;
BEGIN
  IF _uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_signed_in'); END IF;
  IF NOT public.consume_rate_limit('invite_redeem', _uid::text, 10, 3600) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limited');
  END IF;

  SELECT * INTO _inv FROM public.role_invitations
   WHERE upper(code) = upper(btrim(_code)) AND is_active AND expires_at > now() AND uses < max_uses
   FOR UPDATE;
  IF _inv.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
  IF _inv.role = 'system_admin' THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;

  SELECT email INTO _email FROM public.profiles WHERE id = _uid;
  IF _inv.email IS NOT NULL AND lower(_inv.email) <> lower(COALESCE(_email,'')) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, _inv.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF _inv.authority_id IS NOT NULL
     AND _inv.role IN ('inspector','supervisor','authority_admin') THEN
    INSERT INTO public.authority_members (authority_id, user_id, office_id, member_role, is_active)
    VALUES (_inv.authority_id, _uid, _inv.office_id, _inv.role, true)
    ON CONFLICT (authority_id, user_id)
    DO UPDATE SET is_active = true, member_role = EXCLUDED.member_role,
                  office_id = COALESCE(EXCLUDED.office_id, authority_members.office_id);
  END IF;

  UPDATE public.role_invitations SET uses = uses + 1 WHERE id = _inv.id;
  INSERT INTO public.role_grants (user_id, role, granted_by, authority_id, reason)
  VALUES (_uid, _inv.role, _inv.created_by, _inv.authority_id, 'invitation:' || _inv.code);
  UPDATE public.role_requests SET status = 'approved', decided_at = now()
   WHERE user_id = _uid AND requested_role = _inv.role AND status = 'pending';

  INSERT INTO public.audit_logs (actor_id, authority_id, action, entity, entity_id, new_value)
  VALUES (_uid, _inv.authority_id, 'role.granted_by_invitation', 'user_roles', _uid::text,
          jsonb_build_object('role', _inv.role, 'invitation', _inv.code));

  RETURN jsonb_build_object('ok', true, 'role', _inv.role, 'authority_id', _inv.authority_id);
END;
$$;
REVOKE ALL ON FUNCTION public.redeem_role_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_role_invitation(TEXT) TO authenticated, service_role;

-- ---------- provisioning: administrator grant / revoke ----------
CREATE OR REPLACE FUNCTION public.grant_role(_user_id UUID, _role public.app_role, _reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me UUID := auth.uid(); _authority UUID := public.my_authority_id();
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF public.has_role(_me, 'system_admin') THEN
    NULL; -- system administrators may grant any role
  ELSIF public.has_role(_me, 'authority_admin') THEN
    IF _role NOT IN ('inspector','supervisor','authority_admin') THEN
      RAISE EXCEPTION 'An authority administrator may only grant inspector, supervisor or authority administrator roles';
    END IF;
    IF _authority IS NULL THEN RAISE EXCEPTION 'You are not attached to an authority'; END IF;
  ELSE
    RAISE EXCEPTION 'Administrator role required';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (_user_id, _role)
  ON CONFLICT (user_id, role) DO NOTHING;

  IF _role IN ('inspector','supervisor','authority_admin') AND _authority IS NOT NULL THEN
    INSERT INTO public.authority_members (authority_id, user_id, member_role, is_active)
    VALUES (_authority, _user_id, _role, true)
    ON CONFLICT (authority_id, user_id)
    DO UPDATE SET is_active = true, member_role = EXCLUDED.member_role;
  END IF;

  INSERT INTO public.role_grants (user_id, role, granted_by, authority_id, reason)
  VALUES (_user_id, _role, _me, _authority, _reason);
  UPDATE public.role_requests SET status = 'approved', decided_by = _me, decided_at = now()
   WHERE user_id = _user_id AND requested_role = _role AND status = 'pending';
  INSERT INTO public.audit_logs (actor_id, authority_id, action, entity, entity_id, new_value, reason)
  VALUES (_me, _authority, 'role.granted', 'user_roles', _user_id::text,
          jsonb_build_object('role', _role), _reason);
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.grant_role(UUID, public.app_role, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.grant_role(UUID, public.app_role, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revoke_role(_user_id UUID, _role public.app_role, _reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me UUID := auth.uid(); _authority UUID := public.my_authority_id();
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _role = 'citizen' THEN RAISE EXCEPTION 'The citizen role cannot be revoked'; END IF;
  IF NOT (public.has_role(_me,'system_admin')
          OR (public.has_role(_me,'authority_admin')
              AND _role IN ('inspector','supervisor','authority_admin')
              AND EXISTS (SELECT 1 FROM public.authority_members m
                          WHERE m.user_id = _user_id AND m.authority_id = _authority))) THEN
    RAISE EXCEPTION 'Administrator role required for this authority';
  END IF;

  DELETE FROM public.user_roles WHERE user_id = _user_id AND role = _role;
  UPDATE public.role_grants SET revoked_at = now(), revoked_by = _me
   WHERE user_id = _user_id AND role = _role AND revoked_at IS NULL;
  IF _role IN ('inspector','supervisor','authority_admin') THEN
    UPDATE public.authority_members SET is_active = false
     WHERE user_id = _user_id AND authority_id = _authority AND member_role = _role;
  END IF;
  INSERT INTO public.audit_logs (actor_id, authority_id, action, entity, entity_id, previous_value, reason)
  VALUES (_me, _authority, 'role.revoked', 'user_roles', _user_id::text,
          jsonb_build_object('role', _role), _reason);
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.revoke_role(UUID, public.app_role, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_role(UUID, public.app_role, TEXT) TO authenticated, service_role;

-- ---------- supervisor review of a finalized inspection ----------
CREATE OR REPLACE FUNCTION public.record_supervisor_decision(
  _inspection_id UUID, _decision TEXT, _notes TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me UUID := auth.uid(); _authority UUID; _prev JSONB;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF _decision NOT IN ('approved','rejected','returned','pending') THEN
    RAISE EXCEPTION 'Unknown supervisor decision';
  END IF;
  SELECT authority_id INTO _authority FROM public.inspections WHERE id = _inspection_id;
  IF _authority IS NULL OR _authority <> public.my_authority_id() THEN
    RAISE EXCEPTION 'This inspection belongs to another authority';
  END IF;
  IF NOT (public.has_role(_me,'supervisor') OR public.has_role(_me,'authority_admin')) THEN
    RAISE EXCEPTION 'Supervisor role required';
  END IF;

  SELECT jsonb_build_object('supervisor_decision', supervisor_decision,
                            'supervisor_notes', supervisor_notes,
                            'supervisor_id', supervisor_id)
    INTO _prev FROM public.inspections WHERE id = _inspection_id;

  UPDATE public.inspections
     SET supervisor_decision = _decision,
         supervisor_notes = COALESCE(NULLIF(btrim(_notes), ''), supervisor_notes),
         supervisor_id = _me,
         supervisor_reviewed_at = now(),
         review_requested = (_decision = 'pending' OR _decision = 'returned')
   WHERE id = _inspection_id;

  INSERT INTO public.audit_logs (actor_id, authority_id, action, entity, entity_id, previous_value, new_value)
  VALUES (_me, _authority, 'inspection.supervisor_decision', 'inspection', _inspection_id::text, _prev,
          jsonb_build_object('supervisor_decision', _decision, 'supervisor_notes', _notes));
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.record_supervisor_decision(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_supervisor_decision(UUID, TEXT, TEXT) TO authenticated, service_role;

-- ---------- controlled amendment of a finalized inspection ----------
CREATE OR REPLACE FUNCTION public.apply_inspection_amendment(_amendment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _me UUID := auth.uid(); _am public.inspection_amendments; _authority UUID; _prev JSONB;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO _am FROM public.inspection_amendments WHERE id = _amendment_id FOR UPDATE;
  IF _am.id IS NULL THEN RAISE EXCEPTION 'Amendment not found'; END IF;
  IF _am.status <> 'pending' THEN RAISE EXCEPTION 'This amendment has already been decided'; END IF;

  SELECT authority_id INTO _authority FROM public.inspections WHERE id = _am.inspection_id;
  IF NOT (public.has_role(_me,'system_admin')
          OR (public.has_role(_me,'authority_admin') AND _authority = public.my_authority_id())) THEN
    RAISE EXCEPTION 'Only an authority administrator may approve an amendment';
  END IF;

  SELECT jsonb_build_object('inspector_notes', inspector_notes,
                            'supervisor_notes', supervisor_notes,
                            'location_label', location_label,
                            'product_name', product_name,
                            'manufacturer_name', manufacturer_name)
    INTO _prev FROM public.inspections WHERE id = _am.inspection_id;

  UPDATE public.inspections SET
     inspector_notes   = COALESCE(_am.changes->>'inspector_notes', inspector_notes),
     supervisor_notes  = COALESCE(_am.changes->>'supervisor_notes', supervisor_notes),
     location_label    = COALESCE(_am.changes->>'location_label', location_label),
     product_name      = COALESCE(_am.changes->>'product_name', product_name),
     manufacturer_name = COALESCE(_am.changes->>'manufacturer_name', manufacturer_name),
     amended_count     = amended_count + 1
   WHERE id = _am.inspection_id;

  UPDATE public.inspection_amendments
     SET status = 'approved', approved_by = _me, decided_at = now(), applied_at = now()
   WHERE id = _amendment_id;

  INSERT INTO public.audit_logs (actor_id, authority_id, action, entity, entity_id,
                                 previous_value, new_value, reason)
  VALUES (_me, _authority, 'inspection.amended', 'inspection', _am.inspection_id::text,
          _prev, _am.changes, _am.reason);
  RETURN jsonb_build_object('ok', true);
END;
$$;
REVOKE ALL ON FUNCTION public.apply_inspection_amendment(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_inspection_amendment(UUID) TO authenticated, service_role;

-- ---------- public, column-limited registry lookup ----------
-- Exposes only the information that the 2011 Rules require to be printed on
-- the package itself. Government inspection records are never included.
CREATE OR REPLACE FUNCTION public.public_barcode_lookup(_barcode TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_agg(payload) -> 0 FROM (
    SELECT jsonb_build_object(
      'product_id', p.id,
      'name', p.name,
      'sku_code', p.sku_code,
      'category', p.category,
      'declared_mrp', p.declared_mrp,
      'declared_net_quantity', p.declared_net_quantity,
      'country_of_origin', p.country_of_origin,
      'packer_name', p.packer_name,
      'importer_name', p.importer_name,
      'manufacturer_name', m.name,
      'manufacturer_address', m.address,
      'manufacturer_country', m.country,
      'barcode', b.barcode,
      'barcode_format', b.barcode_format,
      'declarations', (SELECT COALESCE(jsonb_object_agg(d.field_key, d.value), '{}'::jsonb)
                         FROM public.product_declarations d
                        WHERE d.product_id = p.id AND d.value IS NOT NULL),
      'batches', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                            'id', bt.id, 'batch_code', bt.batch_code,
                            'production_date', bt.production_date,
                            'packing_date', bt.packing_date,
                            'declared_mrp', bt.declared_mrp,
                            'declared_net_quantity', bt.declared_net_quantity,
                            'status', bt.status) ORDER BY bt.created_at DESC), '[]'::jsonb)
                    FROM public.batches bt
                   WHERE bt.product_id = p.id AND bt.status IN ('active','submitted'))
    ) AS payload
    FROM public.product_barcodes b
    JOIN public.products p ON p.id = b.product_id
    LEFT JOIN public.manufacturers m ON m.id = p.manufacturer_id
    WHERE btrim(b.barcode) = btrim(_barcode) AND p.status = 'active'
    LIMIT 1
  ) s
$$;
REVOKE ALL ON FUNCTION public.public_barcode_lookup(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_barcode_lookup(TEXT) TO anon, authenticated, service_role;

-- ---------- public complaint tracking by token ----------
CREATE OR REPLACE FUNCTION public.track_complaint(_token TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_agg(payload) -> 0 FROM (
    SELECT jsonb_build_object(
      'complaint_code', c.complaint_code,
      'status', c.status,
      'priority', c.priority,
      'product_name', c.product_name,
      'created_at', c.created_at,
      'updated_at', c.updated_at,
      'resolution_note', c.resolution_note,
      'updates', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
                          'status', u.status, 'note', u.note, 'created_at', u.created_at)
                          ORDER BY u.created_at), '[]'::jsonb)
                    FROM public.complaint_updates u
                   WHERE u.complaint_id = c.id AND u.is_public)
    ) AS payload
    FROM public.complaints c
    WHERE c.tracking_token = btrim(_token)
    LIMIT 1
  ) s
$$;
REVOKE ALL ON FUNCTION public.track_complaint(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_complaint(TEXT) TO anon, authenticated, service_role;