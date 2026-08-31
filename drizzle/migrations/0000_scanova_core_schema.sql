-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('citizen','inspector','supervisor','manufacturer','authority_admin','system_admin');
CREATE TYPE public.inspection_status AS ENUM ('draft','capturing','extracted','checked','finalized','cancelled');
CREATE TYPE public.overall_result AS ENUM ('compliant','non_compliant','needs_review','unable_to_verify','pending');
CREATE TYPE public.check_result AS ENUM ('pass','fail','needs_review','not_applicable','unable_to_verify','manual_verification_required');
CREATE TYPE public.confidence_band AS ENUM ('high','medium','low','none');
CREATE TYPE public.sync_status AS ENUM ('synced','pending','processing','failed');
CREATE TYPE public.complaint_status AS ENUM ('submitted','under_review','assigned','investigation','resolved','rejected','closed');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT,
  designation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ============ AUTHORITIES ============
CREATE TABLE public.authorities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  state TEXT,
  contact_email TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.authorities TO authenticated;
GRANT ALL ON public.authorities TO service_role;
ALTER TABLE public.authorities ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id UUID NOT NULL REFERENCES public.authorities(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.offices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id UUID NOT NULL REFERENCES public.authorities(id) ON DELETE CASCADE,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  district TEXT,
  state TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.offices TO authenticated;
GRANT ALL ON public.offices TO service_role;
ALTER TABLE public.offices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.authority_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  authority_id UUID NOT NULL REFERENCES public.authorities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  member_role public.app_role NOT NULL DEFAULT 'inspector',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (authority_id, user_id)
);
GRANT SELECT, INSERT, UPDATE ON public.authority_members TO authenticated;
GRANT ALL ON public.authority_members TO service_role;
ALTER TABLE public.authority_members ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.my_authority_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT authority_id FROM public.authority_members
  WHERE user_id = auth.uid() AND is_active LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_gov_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id
    AND role IN ('inspector','supervisor','authority_admin','system_admin'))
$$;

-- ============ MANUFACTURERS / PRODUCTS ============
CREATE TABLE public.manufacturers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID,
  name TEXT NOT NULL,
  address TEXT,
  registration_no TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  country TEXT DEFAULT 'India',
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.manufacturers TO authenticated;
GRANT ALL ON public.manufacturers TO service_role;
ALTER TABLE public.manufacturers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer_id UUID REFERENCES public.manufacturers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  barcode TEXT,
  declared_mrp NUMERIC,
  declared_net_quantity TEXT,
  created_by UUID,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX products_barcode_idx ON public.products (barcode);
GRANT SELECT, INSERT, UPDATE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- ============ RULES ============
CREATE TABLE public.rule_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_label TEXT NOT NULL UNIQUE,
  source_document TEXT NOT NULL,
  notes TEXT,
  effective_from DATE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rule_versions TO authenticated, anon;
GRANT INSERT, UPDATE ON public.rule_versions TO authenticated;
GRANT ALL ON public.rule_versions TO service_role;
ALTER TABLE public.rule_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.rule_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_version_id UUID NOT NULL REFERENCES public.rule_versions(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  rule_number TEXT NOT NULL,
  title TEXT NOT NULL,
  requirement TEXT NOT NULL,
  check_type TEXT NOT NULL,
  field_key TEXT,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  applicable_categories TEXT[] NOT NULL DEFAULT ARRAY['all'],
  exceptions TEXT,
  source_section TEXT NOT NULL,
  source_page INTEGER,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rule_version_id, rule_code)
);
GRANT SELECT ON public.rule_definitions TO authenticated, anon;
GRANT INSERT, UPDATE ON public.rule_definitions TO authenticated;
GRANT ALL ON public.rule_definitions TO service_role;
ALTER TABLE public.rule_definitions ENABLE ROW LEVEL SECURITY;

-- ============ INSPECTIONS ============
CREATE TABLE public.inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_code TEXT NOT NULL DEFAULT ('INS-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  inspector_id UUID NOT NULL,
  authority_id UUID REFERENCES public.authorities(id) ON DELETE SET NULL,
  office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  manufacturer_name TEXT,
  product_name TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  barcode TEXT,
  barcode_format TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  location_label TEXT,
  status public.inspection_status NOT NULL DEFAULT 'draft',
  result public.overall_result NOT NULL DEFAULT 'pending',
  assessment_score INTEGER,
  conflict_flag BOOLEAN NOT NULL DEFAULT false,
  conflict_note TEXT,
  inspector_notes TEXT,
  supervisor_notes TEXT,
  supervisor_id UUID,
  supervisor_decision TEXT,
  rule_version_id UUID REFERENCES public.rule_versions(id),
  sync_status public.sync_status NOT NULL DEFAULT 'synced',
  is_demo BOOLEAN NOT NULL DEFAULT false,
  finalized_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inspections_inspector_idx ON public.inspections (inspector_id, created_at DESC);
CREATE INDEX inspections_authority_idx ON public.inspections (authority_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.inspections TO authenticated;
GRANT ALL ON public.inspections TO service_role;
ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.inspection_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  side TEXT NOT NULL DEFAULT 'front',
  quality_score NUMERIC,
  quality_note TEXT,
  width INTEGER,
  height INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inspection_images_insp_idx ON public.inspection_images (inspection_id);
GRANT SELECT, INSERT, DELETE ON public.inspection_images TO authenticated;
GRANT ALL ON public.inspection_images TO service_role;
ALTER TABLE public.inspection_images ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'lovable-ai-vision',
  model TEXT,
  raw_text TEXT,
  structured JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'succeeded',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX extractions_insp_idx ON public.extractions (inspection_id);
GRANT SELECT, INSERT ON public.extractions TO authenticated;
GRANT ALL ON public.extractions TO service_role;
ALTER TABLE public.extractions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.extracted_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  value TEXT,
  detected BOOLEAN NOT NULL DEFAULT false,
  confidence NUMERIC NOT NULL DEFAULT 0,
  band public.confidence_band NOT NULL DEFAULT 'none',
  source_image_id UUID REFERENCES public.inspection_images(id) ON DELETE SET NULL,
  corrected BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, field_key)
);
GRANT SELECT, INSERT, UPDATE ON public.extracted_declarations TO authenticated;
GRANT ALL ON public.extracted_declarations TO service_role;
ALTER TABLE public.extracted_declarations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.field_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  reason TEXT,
  corrected_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.field_corrections TO authenticated;
GRANT ALL ON public.field_corrections TO service_role;
ALTER TABLE public.field_corrections ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.compliance_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES public.rule_definitions(id) ON DELETE SET NULL,
  rule_version_id UUID REFERENCES public.rule_versions(id) ON DELETE SET NULL,
  rule_code TEXT NOT NULL,
  rule_number TEXT NOT NULL,
  title TEXT NOT NULL,
  requirement TEXT NOT NULL,
  detected_value TEXT,
  expected_condition TEXT,
  result public.check_result NOT NULL,
  confidence NUMERIC NOT NULL DEFAULT 0,
  explanation TEXT NOT NULL DEFAULT '',
  evidence_image_id UUID REFERENCES public.inspection_images(id) ON DELETE SET NULL,
  source_section TEXT,
  source_page INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX compliance_checks_insp_idx ON public.compliance_checks (inspection_id);
GRANT SELECT, INSERT, DELETE ON public.compliance_checks TO authenticated;
GRANT ALL ON public.compliance_checks TO service_role;
ALTER TABLE public.compliance_checks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  report_code TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL,
  rule_version_id UUID REFERENCES public.rule_versions(id),
  generated_by UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- ============ COMPLAINTS ============
CREATE TABLE public.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_code TEXT NOT NULL UNIQUE DEFAULT ('CMP-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  complainant_id UUID NOT NULL,
  product_name TEXT NOT NULL,
  manufacturer_name TEXT,
  barcode TEXT,
  description TEXT NOT NULL,
  image_path TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  status public.complaint_status NOT NULL DEFAULT 'submitted',
  authority_id UUID REFERENCES public.authorities(id) ON DELETE SET NULL,
  assigned_to UUID,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.complaints TO authenticated;
GRANT ALL ON public.complaints TO service_role;
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- ============ NOTIFICATIONS / AUDIT / SYNC ============
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON public.notifications (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  authority_id UUID,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  previous_value JSONB,
  new_value JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_created_idx ON public.audit_logs (created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.sync_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  inspection_id UUID,
  operation TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.sync_status NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sync_queue TO authenticated;
GRANT ALL ON public.sync_queue TO service_role;
ALTER TABLE public.sync_queue ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES ============
CREATE POLICY "profiles self read" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "profiles staff read same authority" ON public.profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.authority_members m
    WHERE m.user_id = profiles.id AND m.authority_id = public.my_authority_id()));
CREATE POLICY "profiles admin read" ON public.profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'system_admin'));
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

CREATE POLICY "roles self read" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "roles admin read" ON public.user_roles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'system_admin') OR public.has_role(auth.uid(),'authority_admin'));

CREATE POLICY "authorities read members" ON public.authorities FOR SELECT TO authenticated
  USING (id = public.my_authority_id() OR public.has_role(auth.uid(),'system_admin'));
CREATE POLICY "authorities admin update" ON public.authorities FOR UPDATE TO authenticated
  USING ((id = public.my_authority_id() AND public.has_role(auth.uid(),'authority_admin')) OR public.has_role(auth.uid(),'system_admin'));
CREATE POLICY "authorities admin insert" ON public.authorities FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'system_admin') OR public.has_role(auth.uid(),'authority_admin'));

CREATE POLICY "departments read" ON public.departments FOR SELECT TO authenticated
  USING (authority_id = public.my_authority_id() OR public.has_role(auth.uid(),'system_admin'));
CREATE POLICY "departments manage" ON public.departments FOR ALL TO authenticated
  USING (authority_id = public.my_authority_id() AND public.has_role(auth.uid(),'authority_admin'))
  WITH CHECK (authority_id = public.my_authority_id() AND public.has_role(auth.uid(),'authority_admin'));

CREATE POLICY "offices read" ON public.offices FOR SELECT TO authenticated
  USING (authority_id = public.my_authority_id() OR public.has_role(auth.uid(),'system_admin'));
CREATE POLICY "offices manage" ON public.offices FOR ALL TO authenticated
  USING (authority_id = public.my_authority_id() AND public.has_role(auth.uid(),'authority_admin'))
  WITH CHECK (authority_id = public.my_authority_id() AND public.has_role(auth.uid(),'authority_admin'));

CREATE POLICY "members read self" ON public.authority_members FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "members read authority" ON public.authority_members FOR SELECT TO authenticated
  USING (authority_id = public.my_authority_id() OR public.has_role(auth.uid(),'system_admin'));
CREATE POLICY "members admin write" ON public.authority_members FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'authority_admin') OR public.has_role(auth.uid(),'system_admin'));
CREATE POLICY "members admin update" ON public.authority_members FOR UPDATE TO authenticated
  USING ((authority_id = public.my_authority_id() AND public.has_role(auth.uid(),'authority_admin')) OR public.has_role(auth.uid(),'system_admin'));

CREATE POLICY "manufacturers read staff" ON public.manufacturers FOR SELECT TO authenticated
  USING (public.is_gov_staff(auth.uid()) OR owner_id = auth.uid());
CREATE POLICY "manufacturers owner insert" ON public.manufacturers FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() OR public.is_gov_staff(auth.uid()));
CREATE POLICY "manufacturers owner update" ON public.manufacturers FOR UPDATE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "products read" ON public.products FOR SELECT TO authenticated
  USING (public.is_gov_staff(auth.uid())
    OR EXISTS (SELECT 1 FROM public.manufacturers m WHERE m.id = products.manufacturer_id AND m.owner_id = auth.uid()));
CREATE POLICY "products insert" ON public.products FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "products owner update" ON public.products FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.manufacturers m WHERE m.id = products.manufacturer_id AND m.owner_id = auth.uid()));

CREATE POLICY "rule versions readable" ON public.rule_versions FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "rule versions admin write" ON public.rule_versions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'system_admin'));
CREATE POLICY "rule versions admin update" ON public.rule_versions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'system_admin'));

CREATE POLICY "rules readable" ON public.rule_definitions FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "rules admin write" ON public.rule_definitions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'system_admin'));
CREATE POLICY "rules admin update" ON public.rule_definitions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'system_admin'));

CREATE POLICY "inspections own read" ON public.inspections FOR SELECT TO authenticated
  USING (inspector_id = auth.uid());
CREATE POLICY "inspections authority read" ON public.inspections FOR SELECT TO authenticated
  USING (authority_id IS NOT NULL AND authority_id = public.my_authority_id()
    AND (public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'authority_admin')));
CREATE POLICY "inspections insert own" ON public.inspections FOR INSERT TO authenticated
  WITH CHECK (inspector_id = auth.uid());
CREATE POLICY "inspections update own draft" ON public.inspections FOR UPDATE TO authenticated
  USING (inspector_id = auth.uid() AND finalized_at IS NULL);
CREATE POLICY "inspections supervisor update" ON public.inspections FOR UPDATE TO authenticated
  USING (authority_id = public.my_authority_id()
    AND (public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'authority_admin')));

CREATE OR REPLACE FUNCTION public.can_view_inspection(_inspection_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.inspections i WHERE i.id = _inspection_id AND (
      i.inspector_id = auth.uid()
      OR (i.authority_id IS NOT NULL AND i.authority_id = public.my_authority_id()
          AND (public.has_role(auth.uid(),'supervisor') OR public.has_role(auth.uid(),'authority_admin')))
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.owns_inspection(_inspection_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.inspections i WHERE i.id = _inspection_id AND i.inspector_id = auth.uid())
$$;

CREATE POLICY "images read" ON public.inspection_images FOR SELECT TO authenticated USING (public.can_view_inspection(inspection_id));
CREATE POLICY "images insert" ON public.inspection_images FOR INSERT TO authenticated WITH CHECK (public.owns_inspection(inspection_id));
CREATE POLICY "images delete" ON public.inspection_images FOR DELETE TO authenticated USING (public.owns_inspection(inspection_id));

CREATE POLICY "extractions read" ON public.extractions FOR SELECT TO authenticated USING (public.can_view_inspection(inspection_id));
CREATE POLICY "extractions insert" ON public.extractions FOR INSERT TO authenticated WITH CHECK (public.owns_inspection(inspection_id));

CREATE POLICY "declarations read" ON public.extracted_declarations FOR SELECT TO authenticated USING (public.can_view_inspection(inspection_id));
CREATE POLICY "declarations insert" ON public.extracted_declarations FOR INSERT TO authenticated WITH CHECK (public.owns_inspection(inspection_id));
CREATE POLICY "declarations update" ON public.extracted_declarations FOR UPDATE TO authenticated USING (public.owns_inspection(inspection_id));

CREATE POLICY "corrections read" ON public.field_corrections FOR SELECT TO authenticated USING (public.can_view_inspection(inspection_id));
CREATE POLICY "corrections insert" ON public.field_corrections FOR INSERT TO authenticated WITH CHECK (public.owns_inspection(inspection_id) AND corrected_by = auth.uid());

CREATE POLICY "checks read" ON public.compliance_checks FOR SELECT TO authenticated USING (public.can_view_inspection(inspection_id));
CREATE POLICY "checks insert" ON public.compliance_checks FOR INSERT TO authenticated WITH CHECK (public.owns_inspection(inspection_id));
CREATE POLICY "checks delete" ON public.compliance_checks FOR DELETE TO authenticated USING (public.owns_inspection(inspection_id));

CREATE POLICY "reports read" ON public.reports FOR SELECT TO authenticated USING (public.can_view_inspection(inspection_id));
CREATE POLICY "reports insert" ON public.reports FOR INSERT TO authenticated WITH CHECK (public.can_view_inspection(inspection_id) AND generated_by = auth.uid());

CREATE POLICY "complaints own read" ON public.complaints FOR SELECT TO authenticated USING (complainant_id = auth.uid());
CREATE POLICY "complaints staff read" ON public.complaints FOR SELECT TO authenticated USING (public.is_gov_staff(auth.uid()));
CREATE POLICY "complaints insert own" ON public.complaints FOR INSERT TO authenticated WITH CHECK (complainant_id = auth.uid());
CREATE POLICY "complaints staff update" ON public.complaints FOR UPDATE TO authenticated USING (public.is_gov_staff(auth.uid()));

CREATE POLICY "notifications own" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications own update" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications insert" ON public.notifications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid() OR public.is_gov_staff(auth.uid()));

CREATE POLICY "audit own read" ON public.audit_logs FOR SELECT TO authenticated
  USING (actor_id = auth.uid() OR public.has_role(auth.uid(),'authority_admin') OR public.has_role(auth.uid(),'system_admin'));
CREATE POLICY "audit insert" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (actor_id = auth.uid());

CREATE POLICY "sync own" ON public.sync_queue FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), COALESCE(NEW.email,''), NEW.raw_user_meta_data->>'phone')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'requested_role')::public.app_role, 'citizen'))
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER inspections_touch BEFORE UPDATE ON public.inspections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER complaints_touch BEFORE UPDATE ON public.complaints FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();