-- ------------------------------------------------------------------------------
-- Gateway Gas — Test Project Seed Data (1 User Per Role + Catalog)
-- Use this file to seed a SEPARATE Supabase test/staging project
-- Default Password for all test users: Password123!
-- ------------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$
DECLARE
  v_admin_id UUID := '11111111-1111-1111-1111-111111111101';
  v_director_id UUID := '11111111-1111-1111-1111-111111111102';
  v_operator_id UUID := '11111111-1111-1111-1111-111111111103';
  v_sales_id UUID := '11111111-1111-1111-1111-111111111104';
  v_rider_id UUID := '11111111-1111-1111-1111-111111111105';
  v_pending_id UUID := '11111111-1111-1111-1111-111111111106';
  v_rejected_id UUID := '11111111-1111-1111-1111-111111111107';

  v_branch_westlands UUID := 'b1111111-1111-1111-1111-111111111111';
  v_branch_kilimani UUID := 'b2222222-2222-2222-2222-222222222222';
  v_branch_karen UUID := 'b3333333-3333-3333-3333-333333333333';
  v_branch_kasarani UUID := 'b4444444-4444-4444-4444-444444444444';

  v_hashed_pw TEXT;
BEGIN
  v_hashed_pw := crypt('Password123!', gen_salt('bf'));

  -- 1. Create auth.users records (Idempotent)
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, aud, role, created_at, updated_at
  ) VALUES
    (v_admin_id, '00000000-0000-0000-0000-000000000000', 'admin@gatewaygas.co.ke', v_hashed_pw, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"David Muthomi (Admin)"}', 'authenticated', 'authenticated', now(), now()),
    (v_director_id, '00000000-0000-0000-0000-000000000000', 'director@gatewaygas.co.ke', v_hashed_pw, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Grace Wanjiku (Director)"}', 'authenticated', 'authenticated', now(), now()),
    (v_operator_id, '00000000-0000-0000-0000-000000000000', 'operations@gatewaygas.co.ke', v_hashed_pw, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Brian Ochieng (Operations)"}', 'authenticated', 'authenticated', now(), now()),
    (v_sales_id, '00000000-0000-0000-0000-000000000000', 'sales@gatewaygas.co.ke', v_hashed_pw, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Sarah Moraa (Sales Rep)"}', 'authenticated', 'authenticated', now(), now()),
    (v_rider_id, '00000000-0000-0000-0000-000000000000', 'rider.john@gatewaygas.co.ke', v_hashed_pw, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"John Kimani (Rider)"}', 'authenticated', 'authenticated', now(), now()),
    (v_pending_id, '00000000-0000-0000-0000-000000000000', 'samuel.kamau@gatewaygas.co.ke', v_hashed_pw, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Samuel Kamau (Pending)"}', 'authenticated', 'authenticated', now(), now()),
    (v_rejected_id, '00000000-0000-0000-0000-000000000000', 'rejected.applicant@gatewaygas.co.ke', v_hashed_pw, now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Failed Applicant (Rejected)"}', 'authenticated', 'authenticated', now(), now())
  ON CONFLICT (id) DO UPDATE SET
    encrypted_password = EXCLUDED.encrypted_password,
    email_confirmed_at = EXCLUDED.email_confirmed_at;

  -- 2. Create public.profiles records
  INSERT INTO public.profiles (id, email, full_name, phone, role, approval_status, vehicle_plate) VALUES
    (v_admin_id, 'admin@gatewaygas.co.ke', 'David Muthomi (Admin)', '+254722000001', 'admin', 'approved', NULL),
    (v_director_id, 'director@gatewaygas.co.ke', 'Grace Wanjiku (Director)', '+254722000002', 'director', 'approved', NULL),
    (v_operator_id, 'operations@gatewaygas.co.ke', 'Brian Ochieng (Operations)', '+254722000003', 'operator', 'approved', NULL),
    (v_sales_id, 'sales@gatewaygas.co.ke', 'Sarah Moraa (Sales Rep)', '+254722000004', 'sales_rep', 'approved', NULL),
    (v_rider_id, 'rider.john@gatewaygas.co.ke', 'John Kimani (Rider)', '+254733000101', 'rider', 'approved', 'KMDX 412M'),
    (v_pending_id, 'samuel.kamau@gatewaygas.co.ke', 'Samuel Kamau', '+254799000103', 'pending', 'pending', NULL),
    (v_rejected_id, 'rejected.applicant@gatewaygas.co.ke', 'Failed Applicant', '+254799000199', 'pending', 'rejected', NULL)
  ON CONFLICT (id) DO UPDATE SET
    role = EXCLUDED.role,
    approval_status = EXCLUDED.approval_status,
    phone = EXCLUDED.phone,
    vehicle_plate = EXCLUDED.vehicle_plate;

  -- 3. Seed Branches
  INSERT INTO public.branches (id, name, code, location_estate, contact_phone, is_active) VALUES
    (v_branch_westlands, 'Nextgen', 'NXG-01', 'Nextgen Mall', '+254722111001', true),
    (v_branch_kilimani, 'Lavington', 'LVN-02', 'Lavington', '+254722111002', true),
    (v_branch_karen, 'Jamhuri', 'JMH-03', 'Jamhuri', '+254722111003', true),
    (v_branch_kasarani, 'Kileleshwa', 'KLH-04', 'Kileleshwa', '+254722111004', true)
  ON CONFLICT (code) DO NOTHING;

  -- 4. Seed Products (ALL CAPS catalog from cylinder.md)
  INSERT INTO public.products (id, name, brand, size_kg, category, refill_price_kes, complete_price_kes, accessory_price_kes, is_active) VALUES
    ('c0001-0000-0000-0000-000000000001', '3KG LAKE', 'LAKE', 3, 'cylinder', 1000, 3500, 0, true),
    ('c0002-0000-0000-0000-000000000002', '3KG TOTAL', 'TOTAL', 3, 'cylinder', 1000, 3500, 0, true),
    ('c0003-0000-0000-0000-000000000003', '6KG AFRIGAS', 'AFRIGAS', 6, 'cylinder', 1350, 4800, 0, true),
    ('c0004-0000-0000-0000-000000000004', '6KG K-GAS', 'K-GAS', 6, 'cylinder', 1350, 4800, 0, true),
    ('c0005-0000-0000-0000-000000000005', '6KG TOTAL', 'TOTAL', 6, 'cylinder', 1350, 4800, 0, true),
    ('c0006-0000-0000-0000-000000000006', '6KG OLA', 'OLA', 6, 'cylinder', 1350, 4800, 0, true),
    ('c0007-0000-0000-0000-000000000007', '6KG PROGAS', 'PROGAS', 6, 'cylinder', 1350, 4800, 0, true),
    ('c0008-0000-0000-0000-000000000008', '6KG TOSHA', 'TOSHA', 6, 'cylinder', 1350, 4800, 0, true),
    ('c0009-0000-0000-0000-000000000009', '6KG LAKE', 'LAKE', 6, 'cylinder', 1350, 4800, 0, true),
    ('c0010-0000-0000-0000-000000000010', '6KG HASHI', 'HASHI', 6, 'cylinder', 1350, 4800, 0, true),
    ('c0011-0000-0000-0000-000000000011', '6KG SUPA', 'SUPA', 6, 'cylinder', 1350, 4800, 0, true),
    ('c0012-0000-0000-0000-000000000012', '6KG JATEL', 'JATEL', 6, 'cylinder', 1350, 4800, 0, true),
    ('c0013-0000-0000-0000-000000000013', '6KG SEAGAS', 'SEAGAS', 6, 'cylinder', 1350, 4800, 0, true),
    ('c0014-0000-0000-0000-000000000014', '6KG RAHA', 'RAHA', 6, 'cylinder', 1350, 4800, 0, true),
    ('c0015-0000-0000-0000-000000000015', '6KG BONOKO', 'BONOKO', 6, 'cylinder', 1350, 4800, 0, true),
    ('c0016-0000-0000-0000-000000000016', '13KG AFRIGAS', 'AFRIGAS', 13, 'cylinder', 3100, 9200, 0, true),
    ('c0017-0000-0000-0000-000000000017', '13KG K-GAS', 'K-GAS', 13, 'cylinder', 3100, 9200, 0, true),
    ('c0018-0000-0000-0000-000000000018', '13KG TOTAL', 'TOTAL', 13, 'cylinder', 3100, 9200, 0, true),
    ('c0019-0000-0000-0000-000000000019', '13KG OLA', 'OLA', 13, 'cylinder', 3100, 9200, 0, true),
    ('c0020-0000-0000-0000-000000000020', '13KG PROGAS', 'PROGAS', 13, 'cylinder', 3100, 9200, 0, true),
    ('c0021-0000-0000-0000-000000000021', '13KG TOSHA', 'TOSHA', 13, 'cylinder', 3100, 9200, 0, true),
    ('c0022-0000-0000-0000-000000000022', '13KG LAKE', 'LAKE', 13, 'cylinder', 3100, 9200, 0, true),
    ('c0023-0000-0000-0000-000000000023', '13KG HASHI', 'HASHI', 13, 'cylinder', 3100, 9200, 0, true),
    ('c0024-0000-0000-0000-000000000024', '13KG SUPA', 'SUPA', 13, 'cylinder', 3100, 9200, 0, true),
    ('c0025-0000-0000-0000-000000000025', '13KG JATEL', 'JATEL', 13, 'cylinder', 3100, 9200, 0, true),
    ('c0026-0000-0000-0000-000000000026', '13KG SEAGAS', 'SEAGAS', 13, 'cylinder', 3100, 9200, 0, true),
    ('c0027-0000-0000-0000-000000000027', '13KG RAHA', 'RAHA', 13, 'cylinder', 3100, 9200, 0, true),
    ('c0028-0000-0000-0000-000000000028', '13KG BONOKO', 'BONOKO', 13, 'cylinder', 3100, 9200, 0, true),
    ('c0029-0000-0000-0000-000000000029', '22.5KG TOTAL', 'TOTAL', 22.5, 'cylinder', 6300, 15500, 0, true),
    ('c0030-0000-0000-0000-000000000030', '35KG HASHI', 'HASHI', 35, 'cylinder', 9000, 21000, 0, true),
    ('c0031-0000-0000-0000-000000000031', '35KG K-GAS', 'K-GAS', 35, 'cylinder', 9000, 21000, 0, true),
    ('c0032-0000-0000-0000-000000000032', '45KG AFRIGAS', 'AFRIGAS', 45, 'cylinder', 11500, 26500, 0, true),
    ('c0033-0000-0000-0000-000000000033', '50KG TOTAL', 'TOTAL', 50, 'cylinder', 12000, 28000, 0, true),
    ('c0034-0000-0000-0000-000000000034', '50KG HASHI', 'HASHI', 50, 'cylinder', 12000, 28000, 0, true),
    ('c0035-0000-0000-0000-000000000035', '50KG LAKE', 'LAKE', 50, 'cylinder', 12000, 28000, 0, true),
    ('c0036-0000-0000-0000-000000000036', '50KG SUPA', 'SUPA', 50, 'cylinder', 12000, 28000, 0, true),
    ('c0037-0000-0000-0000-000000000037', '50KG PURE', 'PURE', 50, 'cylinder', 12000, 28000, 0, true),
    ('c0038-0000-0000-0000-000000000038', '50KG HUNKER', 'HUNKER', 50, 'cylinder', 12000, 28000, 0, true),
    ('c0039-0000-0000-0000-000000000039', '50KG JATEL', 'JATEL', 50, 'cylinder', 12000, 28000, 0, true),
    ('c0040-0000-0000-0000-000000000040', '50KG PROGAS', 'PROGAS', 50, 'cylinder', 12000, 28000, 0, true),
    ('c0041-0000-0000-0000-000000000041', '50KG RAHA', 'RAHA', 50, 'cylinder', 12000, 28000, 0, true),
    ('c0042-0000-0000-0000-000000000042', '50KG HASS', 'HASS', 50, 'cylinder', 12000, 28000, 0, true),
    ('c0043-0000-0000-0000-000000000043', '50KG BONOKO', 'BONOKO', 50, 'cylinder', 12000, 28000, 0, true),
    ('w0001-0000-0000-0000-000000000001', '20L KERINGET WATER', 'KERINGET', 20, 'water', 700, 2300, 0, true),
    ('w0002-0000-0000-0000-000000000002', '20L AQUAMIST WATER', 'AQUAMIST', 20, 'water', 650, 2200, 0, true),
    ('w0003-0000-0000-0000-000000000003', '500ML JAPELI WATER', 'JAPELI', NULL, 'water', 0, 0, 50, true),
    ('w0004-0000-0000-0000-000000000004', '1L JAPELI WATER', 'JAPELI', NULL, 'water', 0, 0, 80, true),
    ('w0005-0000-0000-0000-000000000005', '5L JAPELI WATER', 'JAPELI', NULL, 'water', 0, 0, 250, true),
    ('w0006-0000-0000-0000-000000000006', '20L JAPELI WATER', 'JAPELI', NULL, 'water', 0, 0, 600, true),
    ('a1', '13kg Kabason Regulator', 'Kabason', NULL, 'accessory', 0, 0, 1200, true),
    ('a2', '6kg Kabason Regulator', 'Kabason', NULL, 'accessory', 0, 0, 1200, true),
    ('a3', '6kg Gas Burner Cooker', 'Kabason', NULL, 'accessory', 0, 0, 1200, true),
    ('a4', 'Cylinder Grill / Trivet', 'Generic', NULL, 'accessory', 0, 0, 500, true),
    ('a5', 'Gas Hose Clips (Each)', 'Generic', NULL, 'accessory', 0, 0, 50, true),
    ('a6', 'Gas Hose Pipe (Standard 1.5m)', 'Generic', NULL, 'accessory', 0, 0, 300, true),
    ('a7', 'Gas Hose Pipe (Extra Per Meter)', 'Generic', NULL, 'accessory', 0, 0, 300, true)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    brand = EXCLUDED.brand,
    size_kg = EXCLUDED.size_kg,
    category = EXCLUDED.category,
    refill_price_kes = EXCLUDED.refill_price_kes,
    complete_price_kes = EXCLUDED.complete_price_kes,
    accessory_price_kes = EXCLUDED.accessory_price_kes,
    is_active = EXCLUDED.is_active;

  -- 5. Seed Initial Branch Inventory
  INSERT INTO public.branch_inventory (branch_id, product_id, full_units, empty_units)
  SELECT b.id, p.id,
         CASE
           WHEN p.category = 'cylinder' THEN 25
           WHEN p.category = 'water' AND p.size_kg IS NOT NULL AND p.refill_price_kes > 0 THEN 20
           WHEN p.category = 'water' THEN 30
           ELSE 40
         END AS full_units,
         CASE
           WHEN p.category = 'cylinder' THEN 10
           WHEN p.category = 'water' AND p.size_kg IS NOT NULL AND p.refill_price_kes > 0 THEN 8
           ELSE 0
         END AS empty_units
  FROM public.branches b
  CROSS JOIN public.products p
  ON CONFLICT (branch_id, product_id) DO NOTHING;

  -- 6. Seed GoTrue Identities (Enables password sign-in via Supabase client)
  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES
    (v_admin_id, v_admin_id, jsonb_build_object('sub', v_admin_id, 'email', 'admin@gatewaygas.co.ke'), 'email', v_admin_id::text, now(), now(), now()),
    (v_director_id, v_director_id, jsonb_build_object('sub', v_director_id, 'email', 'director@gatewaygas.co.ke'), 'email', v_director_id::text, now(), now(), now()),
    (v_operator_id, v_operator_id, jsonb_build_object('sub', v_operator_id, 'email', 'operations@gatewaygas.co.ke'), 'email', v_operator_id::text, now(), now(), now()),
    (v_sales_id, v_sales_id, jsonb_build_object('sub', v_sales_id, 'email', 'sales@gatewaygas.co.ke'), 'email', v_sales_id::text, now(), now(), now()),
    (v_rider_id, v_rider_id, jsonb_build_object('sub', v_rider_id, 'email', 'rider.john@gatewaygas.co.ke'), 'email', v_rider_id::text, now(), now(), now()),
    (v_pending_id, v_pending_id, jsonb_build_object('sub', v_pending_id, 'email', 'samuel.kamau@gatewaygas.co.ke'), 'email', v_pending_id::text, now(), now(), now()),
    (v_rejected_id, v_rejected_id, jsonb_build_object('sub', v_rejected_id, 'email', 'rejected.applicant@gatewaygas.co.ke'), 'email', v_rejected_id::text, now(), now(), now())
  ON CONFLICT DO NOTHING;

END $$;
