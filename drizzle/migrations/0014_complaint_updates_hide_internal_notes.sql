DROP POLICY IF EXISTS "complaint updates read" ON public.complaint_updates;

CREATE POLICY "complaint updates read"
ON public.complaint_updates
FOR SELECT
USING (
  public.can_view_complaint(complaint_id)
  AND (is_public = true OR public.is_gov_staff(auth.uid()))
);