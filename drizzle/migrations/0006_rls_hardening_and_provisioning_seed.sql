-- ============================================================================
-- Row level security hardening + policies for the new registry / scan tables.
-- ============================================================================

-- Public access happens only through the column-limited SECURITY DEFINER
-- lookup functions, so the anonymous role gets no direct table privileges.
REVOKE SELECT ON public.product_barcodes FROM anon;
REVOKE SELECT ON public.product_declarations FROM anon;
REVOKE SELECT ON public.batches FROM anon;

-- ---------------- role provisioning ----------------
CREATE POLICY "invitations admin read" ON public.role_invitations FOR SELECT TO authenticated
  USING (created_by = auth.uid()
    OR (public.has_role(auth.uid(),'authority_admin') AND authority_id = public.my_authority_id())
    OR public.has_role(auth.uid(),'system_admin'));
CREATE POLICY "invitations admin insert" ON public.role_invitations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND role <> 'system_admin'
    AND (public.has_role(auth.uid(),'system_admin')
      OR (public.has_role(auth.uid(),'authority_admin') AND authority_id = public.my_authority_id())));
CREATE POLICY "invitations admin update" ON public.role_invitations FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'system_admin')
    OR (public.has_role(auth.uid(),'authority_admin') AND authority_id = public.my_authority_id()));

CREATE POLICY "grants read scoped" ON public.role_grants FOR SELECT TO authenticated
  USING (user_id = auth.uid()
    OR (public.has_role(auth.uid(),'authority_admin') AND authority_id = public.my_authority_id())
    OR public.has_role(auth.uid(),'system_admin'));

CREATE POLICY "role requests read scoped" ON public.role_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid()
    OR public.has_role(auth.uid(),'authority_admin')
    OR public.has_role(auth.uid(),'system_admin'));
CREATE POLICY "role requests insert own" ON public.role_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND requested_role <> 'system_admin');

-- ---------------- product registry ----------------
CREATE POLICY "barcodes read" ON public.product_barcodes FOR SELECT TO authenticated
  USING (public.owns_product(product_id) OR public.is_gov_staff(auth.uid()));
CREATE POLICY "barcodes insert" ON public.product_barcodes FOR INSERT TO authenticated
  WITH CHECK (public.owns_product(product_id) AND created_by = auth.uid());
CREATE POLICY "barcodes update" ON public.product_barcodes FOR UPDATE TO authenticated
  USING (public.owns_product(product_id));
CREATE POLICY "barcodes delete" ON public.product_barcodes FOR DELETE TO authenticated
  USING (public.owns_product(product_id));

CREATE POLICY "product declarations read" ON public.product_declarations FOR SELECT TO authenticated
  USING (public.owns_product(product_id) OR public.is_gov_staff(auth.uid()));
CREATE POLICY "product declarations insert" ON public.product_declarations FOR INSERT TO authenticated
  WITH CHECK (public.owns_product(product_id));
CREATE POLICY "product declarations update" ON public.product_declarations FOR UPDATE TO authenticated
  USING (public.owns_product(product_id));
CREATE POLICY "product declarations delete" ON public.product_declarations FOR DELETE TO authenticated
  USING (public.owns_product(product_id));

CREATE POLICY "batches read" ON public.batches FOR SELECT TO authenticated
  USING (public.owns_product(product_id) OR public.is_gov_staff(auth.uid()));
CREATE POLICY "batches insert" ON public.batches FOR INSERT TO authenticated
  WITH CHECK (public.owns_product(product_id) AND created_by = auth.uid());
CREATE POLICY "batches update" ON public.batches FOR UPDATE TO authenticated
  USING (public.owns_product(product_id));

CREATE POLICY "registry evidence read" ON public.registry_evidence FOR SELECT TO authenticated
  USING (public.owns_product(product_id) OR public.is_gov_staff(auth.uid()));
CREATE POLICY "registry evidence insert" ON public.registry_evidence FOR INSERT TO authenticated
  WITH CHECK (public.owns_product(product_id) AND uploaded_by = auth.uid());
CREATE POLICY "registry evidence delete" ON public.registry_evidence FOR DELETE TO authenticated
  USING (public.owns_product(product_id));

-- ---------------- authority <-> manufacturer correspondence ----------------
CREATE POLICY "authority requests read" ON public.authority_requests FOR SELECT TO authenticated
  USING (public.can_view_authority_request(id));
CREATE POLICY "authority requests insert" ON public.authority_requests FOR INSERT TO authenticated
  WITH CHECK (public.is_gov_staff(auth.uid()) AND created_by = auth.uid()
              AND (authority_id IS NULL OR authority_id = public.my_authority_id()));
CREATE POLICY "authority requests update" ON public.authority_requests FOR UPDATE TO authenticated
  USING (public.can_view_authority_request(id));

CREATE POLICY "authority responses read" ON public.authority_request_responses FOR SELECT TO authenticated
  USING (public.can_view_authority_request(request_id));
CREATE POLICY "authority responses insert" ON public.authority_request_responses FOR INSERT TO authenticated
  WITH CHECK (public.can_view_authority_request(request_id) AND responder_id = auth.uid());

-- ---------------- package scans (written server-side only) ----------------
CREATE POLICY "package scans read" ON public.package_scans FOR SELECT TO authenticated
  USING (scanned_by = auth.uid() OR public.is_gov_staff(auth.uid()));

-- ---------------- retail counter ----------------
CREATE POLICY "retail sessions own" ON public.retail_sessions FOR SELECT TO authenticated
  USING (retailer_id = auth.uid() OR public.is_gov_staff(auth.uid()));
CREATE POLICY "retail sessions insert own" ON public.retail_sessions FOR INSERT TO authenticated
  WITH CHECK (retailer_id = auth.uid());
CREATE POLICY "retail sessions update own" ON public.retail_sessions FOR UPDATE TO authenticated
  USING (retailer_id = auth.uid());

CREATE POLICY "retail scans read" ON public.retail_scans FOR SELECT TO authenticated
  USING (retailer_id = auth.uid() OR public.is_gov_staff(auth.uid()));
CREATE POLICY "retail scans insert own" ON public.retail_scans FOR INSERT TO authenticated
  WITH CHECK (retailer_id = auth.uid());
CREATE POLICY "retail scans update own" ON public.retail_scans FOR UPDATE TO authenticated
  USING (retailer_id = auth.uid());

-- ---------------- OCR results ----------------
CREATE POLICY "ocr results read" ON public.ocr_results FOR SELECT TO authenticated
  USING ((inspection_id IS NOT NULL AND public.can_view_inspection(inspection_id))
      OR (package_scan_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.package_scans s WHERE s.id = package_scan_id
              AND (s.scanned_by = auth.uid() OR public.is_gov_staff(auth.uid())))));
CREATE POLICY "ocr results insert" ON public.ocr_results FOR INSERT TO authenticated
  WITH CHECK (inspection_id IS NOT NULL AND public.owns_inspection(inspection_id));

-- ---------------- amendments ----------------
CREATE POLICY "amendments read" ON public.inspection_amendments FOR SELECT TO authenticated
  USING (public.can_view_inspection(inspection_id));
CREATE POLICY "amendments insert" ON public.inspection_amendments FOR INSERT TO authenticated
  WITH CHECK (requested_by = auth.uid() AND public.can_view_inspection(inspection_id));
CREATE POLICY "amendments admin update" ON public.inspection_amendments FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'system_admin')
     OR (public.has_role(auth.uid(),'authority_admin')
         AND EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = inspection_id
                       AND i.authority_id = public.my_authority_id())));

-- ---------------- complaint timeline ----------------
CREATE POLICY "complaint updates read" ON public.complaint_updates FOR SELECT TO authenticated
  USING (public.can_view_complaint(complaint_id));
CREATE POLICY "complaint updates insert" ON public.complaint_updates FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid() AND public.is_gov_staff(auth.uid())
              AND public.can_view_complaint(complaint_id));

-- ============================================================================
-- Hardening of pre-existing policies
-- ============================================================================

-- Audit reads: authority administrators see only their own authority.
DROP POLICY IF EXISTS "audit own read" ON public.audit_logs;
CREATE POLICY "audit read scoped" ON public.audit_logs FOR SELECT TO authenticated
  USING (actor_id = auth.uid()
    OR public.has_role(auth.uid(),'system_admin')
    OR (public.has_role(auth.uid(),'authority_admin')
        AND authority_id IS NOT NULL AND authority_id = public.my_authority_id()));

-- Role reads: an authority administrator sees the roles of their own members.
DROP POLICY IF EXISTS "roles admin read" ON public.user_roles;
CREATE POLICY "roles admin read scoped" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'system_admin')
    OR (public.has_role(auth.uid(),'authority_admin') AND EXISTS (
          SELECT 1 FROM public.authority_members m
           WHERE m.user_id = user_roles.user_id AND m.authority_id = public.my_authority_id())));

-- Complaints: authority scoped instead of visible to every government user.
DROP POLICY IF EXISTS "complaints staff read" ON public.complaints;
CREATE POLICY "complaints staff read scoped" ON public.complaints FOR SELECT TO authenticated
  USING (public.is_gov_staff(auth.uid())
    AND (authority_id IS NULL OR authority_id = public.my_authority_id()
         OR public.has_role(auth.uid(),'system_admin')));

DROP POLICY IF EXISTS "complaints staff update" ON public.complaints;
CREATE POLICY "complaints staff update scoped" ON public.complaints FOR UPDATE TO authenticated
  USING (public.is_gov_staff(auth.uid())
    AND (authority_id IS NULL OR authority_id = public.my_authority_id()
         OR public.has_role(auth.uid(),'system_admin')));

-- Finalized inspections are immutable for supervisors and authority admins;
-- changes must go through the amendment workflow.
DROP POLICY IF EXISTS "inspections supervisor update" ON public.inspections;
CREATE POLICY "inspections supervisor update open" ON public.inspections FOR UPDATE TO authenticated
  USING (authority_id IS NOT NULL AND authority_id = public.my_authority_id()
    AND finalized_at IS NULL
    AND (public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'authority_admin')))
  WITH CHECK (authority_id = public.my_authority_id() AND finalized_at IS NULL);

-- Notifications are created server-side; a client may only write its own.
DROP POLICY IF EXISTS "notifications insert" ON public.notifications;
CREATE POLICY "notifications insert own" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Products: creation must be tied to a manufacturer the caller owns.
DROP POLICY IF EXISTS "products insert" ON public.products;
CREATE POLICY "products insert owned" ON public.products FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid()
    AND (manufacturer_id IS NULL
         OR public.owns_manufacturer(manufacturer_id)
         OR public.is_gov_staff(auth.uid())));

DROP POLICY IF EXISTS "products owner update" ON public.products;
CREATE POLICY "products owner update" ON public.products FOR UPDATE TO authenticated
  USING (public.owns_product(id) OR public.is_gov_staff(auth.uid()));

DROP POLICY IF EXISTS "products read" ON public.products;
CREATE POLICY "products read scoped" ON public.products FOR SELECT TO authenticated
  USING (public.is_gov_staff(auth.uid()) OR public.owns_product(id) OR status = 'active');

-- Only a system administrator may create a new authority.
DROP POLICY IF EXISTS "authorities admin insert" ON public.authorities;
CREATE POLICY "authorities system insert" ON public.authorities FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'system_admin'));

-- ============================================================================
-- Reference data: demo authority, office and provisioning codes so that the
-- privileged roles can be obtained without a self-service role picker.
-- ============================================================================
INSERT INTO public.authorities (name, code, state, contact_email, is_demo)
VALUES ('Legal Metrology Department (Demo Authority)', 'LM-DEMO', 'Maharashtra',
        'legalmetrology.demo@example.gov.in', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.departments (authority_id, name)
SELECT a.id, 'Enforcement Department' FROM public.authorities a
 WHERE a.code = 'LM-DEMO'
   AND NOT EXISTS (SELECT 1 FROM public.departments d
                    WHERE d.authority_id = a.id AND d.name = 'Enforcement Department');

INSERT INTO public.offices (authority_id, department_id, name, district, state)
SELECT a.id, d.id, 'Pune District Office', 'Pune', 'Maharashtra'
  FROM public.authorities a
  JOIN public.departments d ON d.authority_id = a.id AND d.name = 'Enforcement Department'
 WHERE a.code = 'LM-DEMO'
   AND NOT EXISTS (SELECT 1 FROM public.offices o
                    WHERE o.authority_id = a.id AND o.name = 'Pune District Office');

INSERT INTO public.role_invitations (code, role, authority_id, office_id, note, max_uses, expires_at)
SELECT v.code, v.role::public.app_role, a.id, o.id, v.note, 100, now() + interval '365 days'
  FROM (VALUES
    ('INSPECTOR-DEMO',    'inspector',       'Provisioning code for a field inspector account'),
    ('SUPERVISOR-DEMO',   'supervisor',      'Provisioning code for a supervisor account'),
    ('AUTHORITY-DEMO',    'authority_admin', 'Provisioning code for an authority administrator'),
    ('RETAILER-DEMO',     'retailer',        'Provisioning code for a retail billing counter account'),
    ('MANUFACTURER-DEMO', 'manufacturer',    'Provisioning code for a manufacturer account')
  ) AS v(code, role, note)
  LEFT JOIN public.authorities a ON a.code = 'LM-DEMO'
  LEFT JOIN public.offices o ON o.authority_id = a.id AND o.name = 'Pune District Office'
ON CONFLICT (code) DO NOTHING;