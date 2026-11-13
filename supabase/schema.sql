-- Gateway Gas Multi-Branch Internal Operations Schema
-- Engine: Supabase (PostgreSQL 15+)
-- Roles: admin, director, operator, sales_rep, rider

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('admin', 'director', 'operator', 'sales_rep', 'rider', 'pending');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE order_type AS ENUM ('refill', 'complete', 'accessory');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE delivery_status AS ENUM ('pending', 'assigned', 'in_transit', 'delivered', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE payment_method AS ENUM ('mpesa', 'cash', 'bank_transfer');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE payment_status AS ENUM ('pending', 'paid');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 1. Branches Table
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    code TEXT UNIQUE NOT NULL,
    location_estate TEXT NOT NULL,
    contact_phone TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Staff Profiles (Linked to Supabase Auth)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    phone TEXT,
    role user_role NOT NULL DEFAULT 'pending',
    approval_status approval_status NOT NULL DEFAULT 'pending',
    vehicle_plate TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Products Catalog (Master Pricing & Specs)
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    size_kg NUMERIC,
    category TEXT NOT NULL CHECK (category IN ('cylinder', 'accessory', 'water')),
    refill_price_kes NUMERIC NOT NULL DEFAULT 0,
    complete_price_kes NUMERIC DEFAULT 0,
    accessory_price_kes NUMERIC DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Multi-Branch Inventory (Full & Tare/Empty Units)
CREATE TABLE IF NOT EXISTS public.branch_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    full_units INTEGER NOT NULL DEFAULT 0 CHECK (full_units >= 0),
    empty_units INTEGER NOT NULL DEFAULT 0 CHECK (empty_units >= 0),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(branch_id, product_id)
);

-- 5. Orders & POS Transactions
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    branch_id UUID NOT NULL REFERENCES public.branches(id),
    sales_rep_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rider_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rider_ids UUID[] NOT NULL DEFAULT '{}',
    vehicle_plate TEXT,
    receipt_number TEXT,
    lpo_number TEXT,
    sale_comment TEXT,
    is_pos_walkin BOOLEAN NOT NULL DEFAULT false,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    delivery_estate TEXT,
    delivery_address TEXT,
    delivery_status delivery_status NOT NULL DEFAULT 'pending',
    payment_method payment_method NOT NULL DEFAULT 'mpesa',
    payment_status payment_status NOT NULL DEFAULT 'pending',
    payment_reference TEXT,
    rider_comment TEXT,
    subtotal_kes NUMERIC NOT NULL DEFAULT 0,
    delivery_fee_kes NUMERIC NOT NULL DEFAULT 0,
    total_kes NUMERIC NOT NULL DEFAULT 0,
    assigned_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Order Items (Brand-swap Exchange Tracking)
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id),
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    order_type order_type NOT NULL,
    outgoing_brand TEXT NOT NULL,
    incoming_brand TEXT,
    cylinder_size_kg NUMERIC,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_kes NUMERIC NOT NULL DEFAULT 0,
    subtotal_kes NUMERIC NOT NULL DEFAULT 0
);

-- Security Helper Functions
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
    SELECT COALESCE(
        (SELECT role FROM public.profiles WHERE id = auth.uid() AND approval_status = 'approved'),
        'pending'::user_role
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_staff_approved()
RETURNS boolean AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND approval_status = 'approved'
          AND role != 'pending'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Rider Performance Leaderboard View (Strictly NO revenue / money amounts)
CREATE OR REPLACE VIEW public.rider_leaderboard AS
SELECT 
    p.id AS rider_id,
    p.full_name AS rider_name,
    p.vehicle_plate,
    COUNT(o.id) AS total_assigned,
    COUNT(CASE WHEN o.delivery_status = 'delivered' THEN 1 END) AS completed_deliveries,
    COUNT(CASE WHEN o.delivery_status = 'in_transit' THEN 1 END) AS active_deliveries,
    COALESCE(
        ROUND(
            AVG(
                EXTRACT(EPOCH FROM (o.delivered_at - o.assigned_at)) / 60
            ) FILTER (WHERE o.delivery_status = 'delivered' AND o.delivered_at IS NOT NULL AND o.assigned_at IS NOT NULL)
        ), 
        0
    ) AS avg_delivery_minutes
FROM public.profiles p
LEFT JOIN public.orders o ON o.rider_id = p.id
WHERE p.role = 'rider' AND p.approval_status = 'approved'
GROUP BY p.id, p.full_name, p.vehicle_plate;

-- Enable Row-Level Security
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
CREATE POLICY "Approved staff read all profiles"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (public.is_staff_approved() OR auth.uid() = id);

CREATE POLICY "Users update own profile contact info"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "Admin and Director manage all profiles"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'director'));

-- Branches Policies
CREATE POLICY "Approved staff view branches"
    ON public.branches FOR SELECT
    TO authenticated
    USING (public.is_staff_approved());

CREATE POLICY "Admin manage branches"
    ON public.branches FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin');

-- Products Policies
CREATE POLICY "Approved staff view products"
    ON public.products FOR SELECT
    TO authenticated
    USING (public.is_staff_approved());

CREATE POLICY "Admin manage products"
    ON public.products FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin');

-- Branch Inventory Policies
CREATE POLICY "Approved staff view branch inventory"
    ON public.branch_inventory FOR SELECT
    TO authenticated
    USING (public.is_staff_approved());

CREATE POLICY "Admin and Operator manage inventory"
    ON public.branch_inventory FOR ALL
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'operator', 'director'));

-- Orders Policies
CREATE POLICY "Admins, Directors, Operators, Sales Reps view all orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'));

CREATE POLICY "Riders view assigned orders"
    ON public.orders FOR SELECT
    TO authenticated
    USING (
        public.current_user_role() = 'rider' AND (rider_id = auth.uid() OR auth.uid() = ANY(rider_ids))
    );

CREATE POLICY "Sales Reps, Operators, Admins create orders"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'));

CREATE POLICY "Admins, Directors, Operators update orders"
    ON public.orders FOR UPDATE
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'))
    WITH CHECK (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'));

CREATE POLICY "Riders update assigned delivery status and comment only"
    ON public.orders FOR UPDATE
    TO authenticated
    USING (public.current_user_role() = 'rider' AND rider_id = auth.uid())
    WITH CHECK (public.current_user_role() = 'rider' AND rider_id = auth.uid());

-- Order Items Policies
CREATE POLICY "Staff view order items"
    ON public.order_items FOR SELECT
    TO authenticated
    USING (
        public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep')
        OR (
            public.current_user_role() = 'rider'
            AND EXISTS (
                SELECT 1 FROM public.orders o
                WHERE o.id = order_items.order_id AND (o.rider_id = auth.uid() OR auth.uid() = ANY(o.rider_ids))
            )
        )
    );

CREATE POLICY "Sales Rep, Operator, Admin manage order items"
    ON public.order_items FOR ALL
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'));

-- Automatic Profile Creation Trigger on Signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, approval_status)
    VALUES (
        new.id,
        new.email,
        COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
        'pending'::user_role,
        'pending'::approval_status
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed Default Branches
INSERT INTO public.branches (id, name, code, location_estate, contact_phone)
VALUES
    ('b1111111-1111-1111-1111-111111111111', 'Nextgen', 'NXG-01', 'Nextgen Mall, Nairobi', '+254711000101'),
    ('b2222222-2222-2222-2222-222222222222', 'Lavington', 'LVN-02', 'Lavington, Nairobi', '+254711000102'),
    ('b3333333-3333-3333-3333-333333333333', 'Jamhuri', 'JMH-03', 'Jamhuri / Ngong Rd', '+254711000103'),
    ('b4444444-4444-4444-4444-444444444444', 'Kileleshwa', 'KLH-04', 'Kileleshwa, Nairobi', '+254711000104')
ON CONFLICT (code) DO NOTHING;

-- Seed Products Catalog (ALL CAPS catalog from cylinder.md)
INSERT INTO public.products (id, name, brand, size_kg, category, refill_price_kes, complete_price_kes, accessory_price_kes, is_active)
VALUES
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

-- Seed Initial Inventory for Each Branch
INSERT INTO public.branch_inventory (branch_id, product_id, full_units, empty_units)
SELECT b.id, p.id,
       CASE
         WHEN p.category = 'cylinder' THEN 20
         WHEN p.category = 'water' AND p.size_kg IS NOT NULL AND p.refill_price_kes > 0 THEN 18
         WHEN p.category = 'water' THEN 30
         ELSE 15
       END AS full_units,
       CASE
         WHEN p.category = 'cylinder' THEN 10
         WHEN p.category = 'water' AND p.size_kg IS NOT NULL AND p.refill_price_kes > 0 THEN 8
         ELSE 0
       END AS empty_units
FROM public.branches b
CROSS JOIN public.products p
ON CONFLICT (branch_id, product_id) DO NOTHING;
