-- ==============================================================================
-- Gateway Gas — Test Project Seed Data (1 User Per Role + Catalog)
-- Use this file to seed a SEPARATE Supabase test/staging project
-- Default Password for all test users: Password123!
-- ==============================================================================

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
    id,
    instance_id,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    aud,
    role,
    created_at,
    updated_at
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
    (v_branch_westlands, 'Westlands Main Hub', 'WST-01', 'Westlands', '+254722111001', true),
    (v_branch_kilimani, 'Kilimani Station', 'KLM-02', 'Kilimani', '+254722111002', true),
    (v_branch_karen, 'Karen Depot', 'KRN-03', 'Karen', '+254722111003', true),
    (v_branch_kasarani, 'Kasarani Sub-Hub', 'KSR-04', 'Kasarani', '+254722111004', true)
  ON CONFLICT (code) DO NOTHING;

  -- 4. Seed Products (Size-first names)
  INSERT INTO public.products (id, name, brand, size_kg, category, refill_price_kes, complete_price_kes, accessory_price_kes, is_active) VALUES
    ('c1111111-1111-1111-1111-111111111101', '6kg Pro Gas', 'Pro Gas', 6, 'cylinder', 1250, 4800, 0, true),
    ('c1111111-1111-1111-1111-111111111102', '13kg Pro Gas', 'Pro Gas', 13, 'cylinder', 2800, 8500, 0, true),
    ('c1111111-1111-1111-1111-111111111103', '6kg K-Gas', 'K-Gas', 6, 'cylinder', 1300, 4900, 0, true),
    ('c1111111-1111-1111-1111-111111111104', '13kg K-Gas', 'K-Gas', 13, 'cylinder', 2850, 8600, 0, true),
    ('c1111111-1111-1111-1111-111111111105', '6kg Total Gas', 'TotalEnergies', 6, 'cylinder', 1350, 5000, 0, true),
    ('c1111111-1111-1111-1111-111111111106', '13kg Total Gas', 'TotalEnergies', 13, 'cylinder', 2900, 8800, 0, true),
    ('c1111111-1111-1111-1111-111111111107', '13kg Afrigas', 'Afrigas', 13, 'cylinder', 2850, 8600, 0, true),
    ('c1111111-1111-1111-1111-111111111108', '13kg Ola Energy', 'Ola Energy', 13, 'cylinder', 2800, 8500, 0, true),
    ('c1111111-1111-1111-1111-111111111109', '50kg Pro Gas Commercial', 'Pro Gas', 50, 'cylinder', 10500, 24000, 0, true),
    ('a1111111-1111-1111-1111-111111111101', '13kg Kabason Regulator', 'Kabason', NULL, 'accessory', 0, 0, 1200, true),
    ('a1111111-1111-1111-1111-111111111102', '6kg Kabason Regulator', 'Kabason', NULL, 'accessory', 0, 0, 1200, true),
    ('a1111111-1111-1111-1111-111111111103', '6kg Gas Burner Cooker', 'Kabason', NULL, 'accessory', 0, 0, 1200, true),
    ('a1111111-1111-1111-1111-111111111104', 'Cylinder Grill / Trivet', 'Generic', NULL, 'accessory', 0, 0, 500, true),
    ('a1111111-1111-1111-1111-111111111105', 'Gas Hose Clips (Each)', 'Generic', NULL, 'accessory', 0, 0, 50, true),
    ('a1111111-1111-1111-1111-111111111106', 'Gas Hose Pipe (Standard 1.5m)', 'Generic', NULL, 'accessory', 0, 0, 300, true),
    ('a1111111-1111-1111-1111-111111111107', 'Gas Hose Pipe (Extra Per Meter)', 'Generic', NULL, 'accessory', 0, 0, 300, true),
    ('w1111111-1111-1111-1111-111111111101', '20L Keringet Water', 'Keringet', 20, 'water', 650, 2200, 0, true),
    ('w1111111-1111-1111-1111-111111111102', '20L Aquamist Water', 'Aquamist', 20, 'water', 600, 2100, 0, true),
    ('w1111111-1111-1111-1111-111111111103', '500ml Japeli Water', 'Japeli', NULL, 'water', 0, 0, 50, true),
    ('w1111111-1111-1111-1111-111111111104', '1L Japeli Water', 'Japeli', NULL, 'water', 0, 0, 80, true),
    ('w1111111-1111-1111-1111-111111111105', '5L Japeli Water', 'Japeli', NULL, 'water', 0, 0, 250, true),
    ('w1111111-1111-1111-1111-111111111106', '20L Japeli Water (Disposable)', 'Japeli', NULL, 'water', 0, 0, 550, true)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    refill_price_kes = EXCLUDED.refill_price_kes,
    complete_price_kes = EXCLUDED.complete_price_kes,
    accessory_price_kes = EXCLUDED.accessory_price_kes;

  -- 5. Seed Initial Branch Inventory
  INSERT INTO public.branch_inventory (branch_id, product_id, full_units, empty_units)
  SELECT b.id, p.id,
         CASE WHEN p.category = 'cylinder' THEN 25 ELSE 40 END AS full_units,
         CASE WHEN p.category = 'cylinder' THEN 10 ELSE 0 END AS empty_units
  FROM public.branches b
  CROSS JOIN public.products p
  ON CONFLICT (branch_id, product_id) DO NOTHING;

  -- 6. Seed GoTrue Identities (Enables password sign-in via Supabase client)
  INSERT INTO auth.identities (
    id,
    user_id,
    identity_data,
    provider,
    provider_id,
    last_sign_in_at,
    created_at,
    updated_at
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
