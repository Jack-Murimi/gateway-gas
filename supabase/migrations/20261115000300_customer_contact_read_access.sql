-- Customer contact records are visible only to approved staff.
REVOKE ALL ON public.customers, public.customer_phones, public.customer_locations FROM anon;
GRANT SELECT ON public.customers, public.customer_phones, public.customer_locations TO authenticated;

CREATE POLICY "Approved staff read customers"
  ON public.customers FOR SELECT
  TO authenticated
  USING (public.is_staff_approved());

CREATE POLICY "Approved staff read customer phones"
  ON public.customer_phones FOR SELECT
  TO authenticated
  USING (public.is_staff_approved());

CREATE POLICY "Approved staff read customer locations"
  ON public.customer_locations FOR SELECT
  TO authenticated
  USING (public.is_staff_approved());
