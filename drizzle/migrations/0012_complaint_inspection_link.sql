ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS inspection_id UUID REFERENCES public.inspections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS complaints_inspection_id_idx ON public.complaints (inspection_id);
CREATE INDEX IF NOT EXISTS complaints_assigned_to_idx ON public.complaints (assigned_to);