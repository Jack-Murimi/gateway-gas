ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'pdq';
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'cheque';

-- POS workspace: support per-line stock source and multi-rider delivery assignment.
-- Safe to run against an existing Gateway database.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS rider_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS vehicle_plate TEXT,
  ADD COLUMN IF NOT EXISTS receipt_number TEXT,
  ADD COLUMN IF NOT EXISTS lpo_number TEXT,
  ADD COLUMN IF NOT EXISTS sale_comment TEXT;

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS orders_rider_ids_gin_idx
  ON public.orders USING GIN (rider_ids);

DROP POLICY IF EXISTS "Riders view assigned orders" ON public.orders;
CREATE POLICY "Riders view assigned orders"
  ON public.orders FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'rider'
    AND (rider_id = auth.uid() OR auth.uid() = ANY(rider_ids))
  );

DROP POLICY IF EXISTS "Riders update assigned delivery status and comment only" ON public.orders;
CREATE POLICY "Riders update assigned delivery status and comment only"
  ON public.orders FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'rider'
    AND (rider_id = auth.uid() OR auth.uid() = ANY(rider_ids))
  )
  WITH CHECK (
    public.current_user_role() = 'rider'
    AND (rider_id = auth.uid() OR auth.uid() = ANY(rider_ids))
  );

DROP POLICY IF EXISTS "Staff view order items" ON public.order_items;
CREATE POLICY "Staff view order items"
  ON public.order_items FOR SELECT TO authenticated
  USING (
    public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep')
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (o.rider_id = auth.uid() OR auth.uid() = ANY(o.rider_ids))
    )
  );
