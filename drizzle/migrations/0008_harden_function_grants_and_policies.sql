-- 1. Pin search_path on the only function that lacked it.
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

-- 2. Tighten EXECUTE on SECURITY DEFINER functions.
--    Default PUBLIC grants made every definer function callable over the API.
--    Trigger functions and the internal rate limiter must not be API-callable.
REVOKE ALL ON FUNCTION public.audit_stamp() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_rate_limit(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, text, integer, integer) TO service_role;

--    Privileged administrative / workflow routines: signed-in callers only
--    (each one already re-verifies the caller's role internally).
REVOKE ALL ON FUNCTION public.grant_role(uuid, public.app_role, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_role(uuid, public.app_role, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_role_invitation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_supervisor_decision(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_inspection_amendment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.grant_role(uuid, public.app_role, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_role(uuid, public.app_role, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_role_invitation(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_supervisor_decision(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_inspection_amendment(uuid) TO authenticated, service_role;

--    RLS helper predicates: evaluated as the querying role, so signed-in
--    users keep EXECUTE, but anonymous callers do not need them.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_gov_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_authority_staff(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_authority_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_manufacturer_id() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_inspection(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_manufacturer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.owns_product(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.product_is_active(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_complaint(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_inspection(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_authority_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_gov_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_authority_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_authority_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_manufacturer_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_inspection(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_manufacturer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.owns_product(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.product_is_active(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_complaint(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_inspection(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_authority_request(uuid) TO authenticated, service_role;

--    The two genuinely public read-only lookups stay callable by guests.
REVOKE ALL ON FUNCTION public.public_barcode_lookup(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.track_complaint(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_barcode_lookup(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.track_complaint(text) TO anon, authenticated, service_role;

-- 3. Guest complaint tracking: the definer lookup is the only guest read path.
--    It never returns complainant identity/contact data, and it now refuses
--    short/guessable tokens instead of matching them.
CREATE OR REPLACE FUNCTION public.track_complaint(_token text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    WHERE length(btrim(_token)) >= 16
      AND c.tracking_token = btrim(_token)
    LIMIT 1
  ) s
$function$;
REVOKE ALL ON FUNCTION public.track_complaint(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_complaint(text) TO anon, authenticated, service_role;

-- 4. Supervisor updates: re-verify authority AND role in WITH CHECK so a row
--    cannot be moved or rewritten outside the supervisor's own authority.
DROP POLICY IF EXISTS "inspections supervisor update open" ON public.inspections;
CREATE POLICY "inspections supervisor update open"
ON public.inspections FOR UPDATE TO authenticated
USING (
  authority_id IS NOT NULL
  AND authority_id = public.my_authority_id()
  AND finalized_at IS NULL
  AND (public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'authority_admin'))
)
WITH CHECK (
  authority_id IS NOT NULL
  AND authority_id = public.my_authority_id()
  AND finalized_at IS NULL
  AND (public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'authority_admin'))
);

-- Also close the same gap on the inspector's own-draft update policy.
DROP POLICY IF EXISTS "inspections update own draft" ON public.inspections;
CREATE POLICY "inspections update own draft"
ON public.inspections FOR UPDATE TO authenticated
USING (inspector_id = auth.uid() AND finalized_at IS NULL)
WITH CHECK (inspector_id = auth.uid());

-- 5. Products: stop exposing every active manufacturer SKU (MRP, packer,
--    importer, SKU code) to any signed-in account. Owners and government
--    staff keep full reads; guests and other signed-in users get the
--    column-limited public_barcode_lookup projection instead.
DROP POLICY IF EXISTS "products read scoped" ON public.products;
CREATE POLICY "products read scoped"
ON public.products FOR SELECT TO authenticated
USING (public.is_gov_staff(auth.uid()) OR public.owns_product(id));