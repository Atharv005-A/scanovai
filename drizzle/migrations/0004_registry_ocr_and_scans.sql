-- ============================================================================
-- ScanSight / SCANOVA-AI next version: product registry, batches, real OCR
-- results, physical package scans, retail counter, role provisioning and
-- offline-sync bookkeeping. Purely additive.
-- ============================================================================

-- ---------- enums ----------
CREATE TYPE public.product_status AS ENUM ('draft','submitted','active','suspended','rejected');
CREATE TYPE public.batch_status AS ENUM ('draft','submitted','active','recalled','closed');
CREATE TYPE public.ocr_status AS ENUM ('pending','processing','succeeded','failed','not_configured','skipped');
CREATE TYPE public.registry_match AS ENUM (
  'barcode_absent','barcode_unknown','product_found_batch_unknown','batch_found',
  'match','mismatch','review','insufficient_evidence');
CREATE TYPE public.scan_source AS ENUM ('public','retail','inspector');
CREATE TYPE public.retail_alert AS ENUM (
  'verified','potential_mismatch','review_required','product_not_found','registry_unavailable');
CREATE TYPE public.request_status AS ENUM ('pending','approved','rejected','expired');

-- ---------- role provisioning (server-side only) ----------
CREATE TABLE public.role_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  email TEXT,
  role public.app_role NOT NULL,
  authority_id UUID REFERENCES public.authorities(id) ON DELETE CASCADE,
  office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  note TEXT,
  created_by UUID,
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '365 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX role_invitations_code_idx ON public.role_invitations (upper(code));
GRANT SELECT, INSERT, UPDATE ON public.role_invitations TO authenticated;
GRANT ALL ON public.role_invitations TO service_role;
ALTER TABLE public.role_invitations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.role_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  granted_by UUID,
  authority_id UUID REFERENCES public.authorities(id) ON DELETE SET NULL,
  reason TEXT,
  revoked_at TIMESTAMPTZ,
  revoked_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX role_grants_user_idx ON public.role_grants (user_id, created_at DESC);
GRANT SELECT ON public.role_grants TO authenticated;
GRANT ALL ON public.role_grants TO service_role;
ALTER TABLE public.role_grants ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.role_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  requested_role public.app_role NOT NULL,
  justification TEXT,
  status public.request_status NOT NULL DEFAULT 'pending',
  authority_id UUID REFERENCES public.authorities(id) ON DELETE SET NULL,
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, requested_role)
);
GRANT SELECT, INSERT ON public.role_requests TO authenticated;
GRANT ALL ON public.role_requests TO service_role;
ALTER TABLE public.role_requests ENABLE ROW LEVEL SECURITY;

-- ---------- abuse protection ----------
CREATE TABLE public.rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket TEXT NOT NULL,
  subject TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (bucket, subject, window_start)
);
GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- ---------- manufacturer / registry extensions ----------
ALTER TABLE public.manufacturers
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS pincode TEXT,
  ADD COLUMN IF NOT EXISTS gstin TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sku_code TEXT,
  ADD COLUMN IF NOT EXISTS status public.product_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS packer_name TEXT,
  ADD COLUMN IF NOT EXISTS importer_name TEXT,
  ADD COLUMN IF NOT EXISTS country_of_origin TEXT,
  ADD COLUMN IF NOT EXISTS pack_type TEXT,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_note TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Existing catalogue rows predate the review workflow; treat them as active so
-- barcode lookups keep working.
UPDATE public.products SET status = 'active' WHERE status = 'draft';

CREATE TABLE public.product_barcodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  barcode_format TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX product_barcodes_unique ON public.product_barcodes (barcode);
CREATE INDEX product_barcodes_product_idx ON public.product_barcodes (product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_barcodes TO authenticated;
GRANT SELECT ON public.product_barcodes TO anon;
GRANT ALL ON public.product_barcodes TO service_role;
ALTER TABLE public.product_barcodes ENABLE ROW LEVEL SECURITY;

-- Migrate the single legacy products.barcode column into the registry table.
INSERT INTO public.product_barcodes (product_id, barcode, is_primary, created_by)
SELECT p.id, p.barcode, true, p.created_by
FROM public.products p
WHERE p.barcode IS NOT NULL AND btrim(p.barcode) <> ''
ON CONFLICT (barcode) DO NOTHING;

CREATE TABLE public.product_declarations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL DEFAULT '',
  value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, field_key)
);
CREATE INDEX product_declarations_product_idx ON public.product_declarations (product_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_declarations TO authenticated;
GRANT SELECT ON public.product_declarations TO anon;
GRANT ALL ON public.product_declarations TO service_role;
ALTER TABLE public.product_declarations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_code TEXT NOT NULL,
  production_date DATE,
  packing_date DATE,
  expiry_date DATE,
  quantity_produced NUMERIC,
  quantity_unit TEXT,
  declared_mrp NUMERIC,
  declared_net_quantity TEXT,
  notes TEXT,
  status public.batch_status NOT NULL DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, batch_code)
);
CREATE INDEX batches_product_idx ON public.batches (product_id, created_at DESC);
CREATE INDEX batches_code_idx ON public.batches (upper(batch_code));
GRANT SELECT, INSERT, UPDATE ON public.batches TO authenticated;
GRANT SELECT ON public.batches TO anon;
GRANT ALL ON public.batches TO service_role;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.registry_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'label',
  side TEXT,
  caption TEXT,
  width INTEGER,
  height INTEGER,
  uploaded_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX registry_evidence_product_idx ON public.registry_evidence (product_id);
CREATE INDEX registry_evidence_batch_idx ON public.registry_evidence (batch_id);
GRANT SELECT, INSERT, DELETE ON public.registry_evidence TO authenticated;
GRANT ALL ON public.registry_evidence TO service_role;
ALTER TABLE public.registry_evidence ENABLE ROW LEVEL SECURITY;

-- ---------- authority <-> manufacturer correspondence ----------
CREATE TABLE public.authority_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code TEXT NOT NULL UNIQUE DEFAULT ('REQ-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8))),
  authority_id UUID REFERENCES public.authorities(id) ON DELETE SET NULL,
  manufacturer_id UUID REFERENCES public.manufacturers(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  inspection_id UUID REFERENCES public.inspections(id) ON DELETE SET NULL,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  due_date DATE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX authority_requests_mfr_idx ON public.authority_requests (manufacturer_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.authority_requests TO authenticated;
GRANT ALL ON public.authority_requests TO service_role;
ALTER TABLE public.authority_requests ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.authority_request_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.authority_requests(id) ON DELETE CASCADE,
  responder_id UUID NOT NULL,
  message TEXT NOT NULL,
  evidence_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX authority_request_responses_req_idx ON public.authority_request_responses (request_id);
GRANT SELECT, INSERT ON public.authority_request_responses TO authenticated;
GRANT ALL ON public.authority_request_responses TO service_role;
ALTER TABLE public.authority_request_responses ENABLE ROW LEVEL SECURITY;

-- ---------- physical package scans (public / retail / inspector) ----------
CREATE TABLE public.package_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_code TEXT NOT NULL UNIQUE DEFAULT ('SCN-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  source public.scan_source NOT NULL DEFAULT 'public',
  scanned_by UUID,
  client_ref TEXT,
  barcode TEXT,
  barcode_format TEXT,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  inspection_id UUID REFERENCES public.inspections(id) ON DELETE SET NULL,
  category TEXT,
  observed JSONB NOT NULL DEFAULT '{}'::jsonb,
  assessment JSONB NOT NULL DEFAULT '{}'::jsonb,
  registry_match public.registry_match NOT NULL DEFAULT 'barcode_absent',
  mismatch_notes TEXT,
  ocr_provider TEXT,
  ocr_status public.ocr_status NOT NULL DEFAULT 'pending',
  image_path TEXT,
  region TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX package_scans_barcode_idx ON public.package_scans (barcode);
CREATE INDEX package_scans_created_idx ON public.package_scans (created_at DESC);
CREATE INDEX package_scans_product_idx ON public.package_scans (product_id, created_at DESC);
CREATE INDEX package_scans_user_idx ON public.package_scans (scanned_by, created_at DESC);
GRANT SELECT ON public.package_scans TO authenticated;
GRANT ALL ON public.package_scans TO service_role;
ALTER TABLE public.package_scans ENABLE ROW LEVEL SECURITY;

-- ---------- retail / billing counter ----------
CREATE TABLE public.retail_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id UUID NOT NULL,
  store_name TEXT,
  location_label TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX retail_sessions_retailer_idx ON public.retail_sessions (retailer_id, opened_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.retail_sessions TO authenticated;
GRANT ALL ON public.retail_sessions TO service_role;
ALTER TABLE public.retail_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.retail_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES public.retail_sessions(id) ON DELETE SET NULL,
  retailer_id UUID NOT NULL,
  barcode TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  package_scan_id UUID REFERENCES public.package_scans(id) ON DELETE SET NULL,
  alert public.retail_alert NOT NULL DEFAULT 'review_required',
  held_for_review BOOLEAN NOT NULL DEFAULT false,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX retail_scans_retailer_idx ON public.retail_scans (retailer_id, created_at DESC);
CREATE INDEX retail_scans_barcode_idx ON public.retail_scans (barcode);
GRANT SELECT, INSERT, UPDATE ON public.retail_scans TO authenticated;
GRANT ALL ON public.retail_scans TO service_role;
ALTER TABLE public.retail_scans ENABLE ROW LEVEL SECURITY;

-- ---------- real OCR results ----------
CREATE TABLE public.ocr_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID REFERENCES public.inspections(id) ON DELETE CASCADE,
  package_scan_id UUID REFERENCES public.package_scans(id) ON DELETE CASCADE,
  image_id UUID REFERENCES public.inspection_images(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  provider_label TEXT NOT NULL DEFAULT '',
  model TEXT,
  status public.ocr_status NOT NULL DEFAULT 'pending',
  raw_text TEXT,
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  mean_confidence NUMERIC,
  word_count INTEGER,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ocr_results_inspection_idx ON public.ocr_results (inspection_id, created_at DESC);
CREATE INDEX ocr_results_scan_idx ON public.ocr_results (package_scan_id);
GRANT SELECT, INSERT ON public.ocr_results TO authenticated;
GRANT ALL ON public.ocr_results TO service_role;
ALTER TABLE public.ocr_results ENABLE ROW LEVEL SECURITY;

-- ---------- inspection pipeline extensions ----------
ALTER TABLE public.inspections
  ADD COLUMN IF NOT EXISTS ai_suggested_category TEXT,
  ADD COLUMN IF NOT EXISTS category_confirmed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS category_confirmed_by UUID,
  ADD COLUMN IF NOT EXISTS category_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES public.batches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS registry_match public.registry_match NOT NULL DEFAULT 'barcode_absent',
  ADD COLUMN IF NOT EXISTS ocr_provider TEXT,
  ADD COLUMN IF NOT EXISTS ocr_status public.ocr_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS review_requested BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supervisor_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS client_ref TEXT,
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS amended_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS region TEXT;

UPDATE public.inspections SET review_requested = true
WHERE supervisor_decision = 'pending' AND review_requested = false;
UPDATE public.inspections SET category_confirmed = true WHERE status IN ('checked','finalized');

CREATE UNIQUE INDEX inspections_client_ref_unique
  ON public.inspections (inspector_id, client_ref) WHERE client_ref IS NOT NULL;
CREATE INDEX inspections_status_idx ON public.inspections (status, created_at DESC);
CREATE INDEX inspections_result_idx ON public.inspections (result);

ALTER TABLE public.inspection_images
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'original',
  ADD COLUMN IF NOT EXISTS processed_path TEXT,
  ADD COLUMN IF NOT EXISTS preprocess_note TEXT,
  ADD COLUMN IF NOT EXISTS ocr_status public.ocr_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS bytes INTEGER,
  ADD COLUMN IF NOT EXISTS client_ref TEXT;

ALTER TABLE public.extractions
  ADD COLUMN IF NOT EXISTS ocr_result_id UUID REFERENCES public.ocr_results(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS input_source TEXT NOT NULL DEFAULT 'ocr_text',
  ADD COLUMN IF NOT EXISTS duration_ms INTEGER;

ALTER TABLE public.extracted_declarations
  ADD COLUMN IF NOT EXISTS ocr_snippet TEXT,
  ADD COLUMN IF NOT EXISTS ocr_bbox JSONB,
  ADD COLUMN IF NOT EXISTS original_value TEXT,
  ADD COLUMN IF NOT EXISTS original_confidence NUMERIC;

ALTER TABLE public.compliance_checks
  ADD COLUMN IF NOT EXISTS field_key TEXT,
  ADD COLUMN IF NOT EXISTS previous_result public.check_result;

-- ---------- controlled amendment of finalized inspections ----------
CREATE TABLE public.inspection_amendments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id UUID NOT NULL REFERENCES public.inspections(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL,
  approved_by UUID,
  reason TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.request_status NOT NULL DEFAULT 'pending',
  applied_at TIMESTAMPTZ,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX inspection_amendments_insp_idx ON public.inspection_amendments (inspection_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.inspection_amendments TO authenticated;
GRANT ALL ON public.inspection_amendments TO service_role;
ALTER TABLE public.inspection_amendments ENABLE ROW LEVEL SECURITY;

-- ---------- complaints: guest submission + triage timeline ----------
ALTER TABLE public.complaints ALTER COLUMN complainant_id DROP NOT NULL;
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS guest_name TEXT,
  ADD COLUMN IF NOT EXISTS guest_email TEXT,
  ADD COLUMN IF NOT EXISTS tracking_token TEXT,
  ADD COLUMN IF NOT EXISTS source public.scan_source NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS package_scan_id UUID REFERENCES public.package_scans(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS ai_classification JSONB,
  ADD COLUMN IF NOT EXISTS duplicate_of UUID REFERENCES public.complaints(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES public.offices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT;

UPDATE public.complaints
   SET tracking_token = encode(gen_random_bytes(16), 'hex')
 WHERE tracking_token IS NULL;
CREATE UNIQUE INDEX complaints_tracking_token_unique ON public.complaints (tracking_token);
CREATE INDEX complaints_authority_idx ON public.complaints (authority_id, created_at DESC);
CREATE INDEX complaints_status_idx ON public.complaints (status, created_at DESC);

CREATE TABLE public.complaint_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  actor_id UUID,
  status public.complaint_status,
  note TEXT NOT NULL DEFAULT '',
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX complaint_updates_complaint_idx ON public.complaint_updates (complaint_id, created_at);
GRANT SELECT, INSERT ON public.complaint_updates TO authenticated;
GRANT ALL ON public.complaint_updates TO service_role;
ALTER TABLE public.complaint_updates ENABLE ROW LEVEL SECURITY;

-- ---------- notifications: honest delivery state ----------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'in_app',
  ADD COLUMN IF NOT EXISTS email_status TEXT,
  ADD COLUMN IF NOT EXISTS email_error TEXT,
  ADD COLUMN IF NOT EXISTS entity TEXT,
  ADD COLUMN IF NOT EXISTS entity_id TEXT;

-- ---------- sync queue: idempotency + backoff ----------
ALTER TABLE public.sync_queue
  ADD COLUMN IF NOT EXISTS client_op_id TEXT,
  ADD COLUMN IF NOT EXISTS entity TEXT NOT NULL DEFAULT 'inspection',
  ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
CREATE UNIQUE INDEX sync_queue_client_op_unique
  ON public.sync_queue (user_id, client_op_id) WHERE client_op_id IS NOT NULL;

-- ---------- updated_at triggers for the new/extended tables ----------
CREATE TRIGGER manufacturers_touch BEFORE UPDATE ON public.manufacturers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER products_touch BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER batches_touch BEFORE UPDATE ON public.batches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER product_declarations_touch BEFORE UPDATE ON public.product_declarations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER authority_requests_touch BEFORE UPDATE ON public.authority_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER sync_queue_touch BEFORE UPDATE ON public.sync_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();