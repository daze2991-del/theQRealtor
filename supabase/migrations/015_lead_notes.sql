-- Agent notes on individual leads (saved from the lead detail view)
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS notes text;

-- Allow property owners to update their leads (e.g. save notes)
CREATE POLICY "leads update by owner"
  ON public.leads FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.properties p WHERE p.id = leads.property_id AND p.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.properties p WHERE p.id = leads.property_id AND p.user_id = auth.uid())
  );
