-- Keep cost prices in a separate table so ordinary approved staff cannot
-- retrieve them through the products table or Supabase Data API.

CREATE TABLE IF NOT EXISTS public.product_costs (
  product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
  refill_cost_kes NUMERIC(12,2) CHECK (refill_cost_kes IS NULL OR refill_cost_kes >= 0),
  complete_cost_kes NUMERIC(12,2) CHECK (complete_cost_kes IS NULL OR complete_cost_kes >= 0),
  accessory_cost_kes NUMERIC(12,2) CHECK (accessory_cost_kes IS NULL OR accessory_cost_kes >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.product_costs TO authenticated;

DROP POLICY IF EXISTS "Admin and director view product costs" ON public.product_costs;
CREATE POLICY "Admin and director view product costs"
  ON public.product_costs FOR SELECT TO authenticated
  USING (public.current_user_role() IN ('admin', 'director'));

DROP POLICY IF EXISTS "Admin and director insert product costs" ON public.product_costs;
CREATE POLICY "Admin and director insert product costs"
  ON public.product_costs FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() IN ('admin', 'director'));

DROP POLICY IF EXISTS "Admin and director update product costs" ON public.product_costs;
CREATE POLICY "Admin and director update product costs"
  ON public.product_costs FOR UPDATE TO authenticated
  USING (public.current_user_role() IN ('admin', 'director'))
  WITH CHECK (public.current_user_role() IN ('admin', 'director'));
