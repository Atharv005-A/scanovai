-- Owners must be able to finalize their own inspection: the existing owner
-- UPDATE policy has no WITH CHECK, so its USING clause (finalized_at IS NULL)
-- is also applied to the NEW row and blocks setting finalized_at.
CREATE POLICY "inspections finalize own" ON public.inspections
  FOR UPDATE
  TO authenticated
  USING (inspector_id = auth.uid() AND finalized_at IS NULL)
  WITH CHECK (inspector_id = auth.uid());