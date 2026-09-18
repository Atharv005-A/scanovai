-- 1. Audit trail can no longer be written directly by signed-in users.
DROP POLICY IF EXISTS "audit insert" ON public.audit_logs;

CREATE OR REPLACE FUNCTION public.write_audit_log(
  _action text,
  _entity text,
  _entity_id text DEFAULT NULL,
  _previous jsonb DEFAULT NULL,
  _new jsonb DEFAULT NULL,
  _reason text DEFAULT NULL,
  _authority uuid DEFAULT NULL,
  _actor uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
  _effective_actor UUID;
  _effective_authority UUID;
BEGIN
  IF _uid IS NULL THEN
    IF current_user <> 'service_role' THEN
      RAISE EXCEPTION 'Not signed in';
    END IF;
    _effective_actor := _actor;
    _effective_authority := _authority;
  ELSE
    _effective_actor := _uid; -- never trust a client supplied actor
    _effective_authority := CASE
      WHEN _authority IS NOT NULL AND _authority = public.my_authority_id() THEN _authority
      ELSE public.my_authority_id()
    END;
  END IF;

  IF _action !~ '^[a-z][a-z_]*\.[a-z][a-z_]*$' THEN
    RAISE EXCEPTION 'Unsupported audit action';
  END IF;
  IF _entity !~ '^[a-z][a-z_]*$' THEN
    RAISE EXCEPTION 'Unsupported audit entity';
  END IF;

  INSERT INTO public.audit_logs (actor_id, authority_id, action, entity, entity_id,
                                 previous_value, new_value, reason)
  VALUES (_effective_actor, _effective_authority, _action, _entity,
          NULLIF(left(COALESCE(_entity_id, ''), 200), ''), _previous, _new,
          NULLIF(left(COALESCE(_reason, ''), 2000), ''));
END;
$$;

REVOKE ALL ON FUNCTION public.write_audit_log(text, text, text, jsonb, jsonb, text, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.write_audit_log(text, text, text, jsonb, jsonb, text, uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.write_audit_log(text, text, text, jsonb, jsonb, text, uuid, uuid) TO authenticated, service_role;

-- 2. Complaint update visibility is for signed-in users only. Anonymous
--    tracking keeps working through the track_complaint definer function.
DROP POLICY IF EXISTS "complaint updates read" ON public.complaint_updates;
CREATE POLICY "complaint updates read" ON public.complaint_updates
  FOR SELECT TO authenticated
  USING (public.can_view_complaint(complaint_id) AND (is_public = true OR public.is_gov_staff(auth.uid())));

-- 3. Role requests must name a real authority and cannot be spammed.
CREATE OR REPLACE FUNCTION public.can_request_role(_authority uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE _pending INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF _authority IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.authorities a WHERE a.id = _authority) THEN
    RETURN false;
  END IF;
  SELECT count(*) INTO _pending FROM public.role_requests r
   WHERE r.user_id = auth.uid() AND r.status = 'pending';
  RETURN _pending < 5;
END;
$$;

REVOKE ALL ON FUNCTION public.can_request_role(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_request_role(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_request_role(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "role requests insert own" ON public.role_requests;
CREATE POLICY "role requests insert own" ON public.role_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND requested_role <> 'system_admin'::public.app_role
    AND public.can_request_role(authority_id)
  );

-- 4. Definer functions are no longer reachable by anonymous callers.
REVOKE EXECUTE ON FUNCTION public.public_barcode_lookup(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.track_complaint(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.track_complaint(text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.product_is_active(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_authority_staff(uuid) FROM anon;