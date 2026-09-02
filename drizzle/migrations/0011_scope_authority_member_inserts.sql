DROP POLICY IF EXISTS "members admin write" ON public.authority_members;

CREATE POLICY "members admin write" ON public.authority_members
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'system_admin')
  OR (
    public.has_role(auth.uid(), 'authority_admin')
    AND authority_id IS NOT NULL
    AND authority_id = public.my_authority_id()
  )
);