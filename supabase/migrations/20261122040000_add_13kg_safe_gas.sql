-- Add 13KG SAFE GAS cylinder product and seed 0-unit branch inventory rows for all branches.

INSERT INTO public.products (
  name,
  brand,
  size_kg,
  category,
  refill_price_kes,
  complete_price_kes,
  accessory_price_kes,
  is_active
)
SELECT
  '13KG SAFE GAS',
  'SAFE GAS',
  13,
  'cylinder',
  3100,
  9000,
  0,
  true
WHERE NOT EXISTS (
  SELECT 1
  FROM public.products
  WHERE category = 'cylinder'
    AND size_kg = 13
    AND lower(regexp_replace(trim(brand), '\s+', ' ', 'g')) IN ('safe gas', 'safegas', 'safe')
);

INSERT INTO public.branch_inventory (branch_id, product_id, full_units, empty_units)
SELECT b.id, p.id, 0, 0
FROM public.branches b
CROSS JOIN public.products p
WHERE p.category = 'cylinder'
  AND p.size_kg = 13
  AND lower(regexp_replace(trim(p.brand), '\s+', ' ', 'g')) IN ('safe gas', 'safegas', 'safe')
ON CONFLICT (branch_id, product_id) DO NOTHING;
