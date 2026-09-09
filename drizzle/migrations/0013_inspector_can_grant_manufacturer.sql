CREATE OR REPLACE FUNCTION public.grant_role(_user_id uuid, _role app_role, _reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _me UUID := auth.uid(); _authority UUID := public.my_authority_id();
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF public.has_role(_me, 'system_admin') THEN
    NULL; -- system administrators may grant any role
  ELSIF public.has_role(_me, 'authority_admin') THEN
    IF _role NOT IN ('inspector','supervisor','authority_admin','manufacturer','retailer') THEN
      RAISE EXCEPTION 'An authority administrator may not grant that role';
    END IF;
    IF _authority IS NULL THEN RAISE EXCEPTION 'You are not attached to an authority'; END IF;
  ELSIF public.has_role(_me, 'inspector') THEN
    -- Inspectors verify companies/packers only; they cannot create staff accounts.
    IF _role NOT IN ('manufacturer','retailer') THEN
      RAISE EXCEPTION 'An inspector may only approve company or retail accounts';
    END IF;
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

REVOKE ALL ON FUNCTION public.grant_role(uuid, app_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_role(uuid, app_role, text) TO authenticated;