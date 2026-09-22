-- Once an inspection is finalized its evidence must be immutable: the
-- inspector may no longer add, change or remove images, extractions,
-- declared values, corrections or rule results.
CREATE OR REPLACE FUNCTION public.inspection_is_open(_inspection_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.inspections i
    WHERE i.id = _inspection_id
      AND i.finalized_at IS NULL
      AND i.status <> 'finalized'
  )
$$;

REVOKE ALL ON FUNCTION public.inspection_is_open(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inspection_is_open(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "checks insert" ON public.compliance_checks;
CREATE POLICY "checks insert" ON public.compliance_checks
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_inspection(inspection_id) AND public.inspection_is_open(inspection_id));

DROP POLICY IF EXISTS "checks delete" ON public.compliance_checks;
CREATE POLICY "checks delete" ON public.compliance_checks
  FOR DELETE TO authenticated
  USING (public.owns_inspection(inspection_id) AND public.inspection_is_open(inspection_id));

DROP POLICY IF EXISTS "declarations insert" ON public.extracted_declarations;
CREATE POLICY "declarations insert" ON public.extracted_declarations
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_inspection(inspection_id) AND public.inspection_is_open(inspection_id));

DROP POLICY IF EXISTS "declarations update" ON public.extracted_declarations;
CREATE POLICY "declarations update" ON public.extracted_declarations
  FOR UPDATE TO authenticated
  USING (public.owns_inspection(inspection_id) AND public.inspection_is_open(inspection_id));

DROP POLICY IF EXISTS "extractions insert" ON public.extractions;
CREATE POLICY "extractions insert" ON public.extractions
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_inspection(inspection_id) AND public.inspection_is_open(inspection_id));

DROP POLICY IF EXISTS "corrections insert" ON public.field_corrections;
CREATE POLICY "corrections insert" ON public.field_corrections
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_inspection(inspection_id) AND corrected_by = auth.uid()
              AND public.inspection_is_open(inspection_id));

DROP POLICY IF EXISTS "images insert" ON public.inspection_images;
CREATE POLICY "images insert" ON public.inspection_images
  FOR INSERT TO authenticated
  WITH CHECK (public.owns_inspection(inspection_id) AND public.inspection_is_open(inspection_id));

DROP POLICY IF EXISTS "images delete" ON public.inspection_images;
CREATE POLICY "images delete" ON public.inspection_images
  FOR DELETE TO authenticated
  USING (public.owns_inspection(inspection_id) AND public.inspection_is_open(inspection_id));
