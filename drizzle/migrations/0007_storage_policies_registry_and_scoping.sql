-- ============================================================================
-- Storage policies for the registry / public-scan buckets, plus authority
-- scoping of inspection evidence reads.
-- ============================================================================

-- Manufacturer registry evidence: uploader writes under its own user folder.
CREATE POLICY "product evidence insert own folder" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "product evidence read own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "product evidence read staff" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-evidence' AND public.is_gov_staff(auth.uid()));

CREATE POLICY "product evidence delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Guest / retail scan evidence is written only by the server (service role).
-- Government staff may read it; the public may not.
CREATE POLICY "public scan evidence read staff" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'public-scan-evidence' AND public.is_gov_staff(auth.uid()));

-- Inspection evidence: replace the blanket supervisor/admin read with a
-- per-inspection permission check so one authority cannot read another's
-- package photographs.
DROP POLICY IF EXISTS "inspection images read staff" ON storage.objects;
CREATE POLICY "inspection images read permitted" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'inspection-images'
  AND array_length(storage.foldername(name), 1) >= 2
  AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND public.can_view_inspection(((storage.foldername(name))[2])::uuid)
);

-- Complaint evidence: authority scoped for staff.
DROP POLICY IF EXISTS "complaint evidence read staff" ON storage.objects;
CREATE POLICY "complaint evidence read staff scoped" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'complaint-evidence'
  AND public.is_gov_staff(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.complaints c
     WHERE c.image_path = storage.objects.name
       AND (c.authority_id IS NULL OR c.authority_id = public.my_authority_id()
            OR public.has_role(auth.uid(),'system_admin'))
  )
);