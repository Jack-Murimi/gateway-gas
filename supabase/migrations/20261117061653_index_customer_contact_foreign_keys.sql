-- Index one-to-many customer contact joins for fast customer directory loading.
CREATE INDEX IF NOT EXISTS idx_customer_phones_customer_id
  ON public.customer_phones (customer_id);

CREATE INDEX IF NOT EXISTS idx_customer_locations_customer_id
  ON public.customer_locations (customer_id);
