-- Inspection images: uploader writes under their own user folder; owner + gov staff read
CREATE POLICY "inspection images insert own folder" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'inspection-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "inspection images read own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'inspection-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "inspection images read staff" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'inspection-images' AND (public.has_role(auth.uid(),'supervisor')
  OR public.has_role(auth.uid(),'authority_admin') OR public.has_role(auth.uid(),'system_admin')));

CREATE POLICY "inspection images delete own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'inspection-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- Complaint evidence: citizen writes under own folder; owner + gov staff read
CREATE POLICY "complaint evidence insert own folder" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'complaint-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "complaint evidence read own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'complaint-evidence' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "complaint evidence read staff" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'complaint-evidence' AND public.is_gov_staff(auth.uid()));