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
        public.current_user_role() = 'rider' AND rider_id = auth.uid()
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
                WHERE o.id = order_items.order_id AND o.rider_id = auth.uid()
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

-- Seed Products Catalog
INSERT INTO public.products (id, name, brand, size_kg, category, refill_price_kes, complete_price_kes, accessory_price_kes)
VALUES
    ('c1111111-1111-1111-1111-111111111111', 'Pro Gas 6kg', 'Pro Gas', 6, 'cylinder', 1250, 4800, 0),
    ('c2222222-2222-2222-2222-222222222222', 'Pro Gas 13kg', 'Pro Gas', 13, 'cylinder', 2800, 8500, 0),
    ('c3333333-3333-3333-3333-333333333333', 'K-Gas 6kg', 'K-Gas', 6, 'cylinder', 1300, 4900, 0),
    ('c4444444-4444-4444-4444-444444444444', 'K-Gas 13kg', 'K-Gas', 13, 'cylinder', 2850, 8600, 0),
    ('c5555555-5555-5555-5555-555555555555', 'Total Gas 6kg', 'TotalEnergies', 6, 'cylinder', 1350, 5000, 0),
    ('c6666666-6666-6666-6666-666666666666', 'Total Gas 13kg', 'TotalEnergies', 13, 'cylinder', 2900, 8800, 0),
    ('c7777777-7777-7777-7777-777777777777', 'Afrigas 13kg', 'Afrigas', 13, 'cylinder', 2850, 8600, 0),
    ('c8888888-8888-8888-8888-888888888888', 'Ola Energy 13kg', 'Ola Energy', 13, 'cylinder', 2800, 8500, 0),
    ('c9999999-9999-9999-9999-999999999999', 'Commercial Cylinder 50kg', 'Pro Gas', 50, 'cylinder', 10500, 24000, 0),
    ('a1111111-1111-1111-1111-111111111111', 'Low Pressure 20mm Gas Regulator', 'Generic', NULL, 'accessory', 0, 0, 950),
    ('a2222222-2222-2222-2222-222222222222', 'High Pressure Hose Pipe (1.5m with clamps)', 'Generic', NULL, 'accessory', 0, 0, 450),
    ('a3333333-3333-3333-3333-333333333333', 'Single Burner Gas Cooker Stand', 'Generic', NULL, 'accessory', 0, 0, 1200)
ON CONFLICT DO NOTHING;

-- Seed Initial Inventory for Each Branch
INSERT INTO public.branch_inventory (branch_id, product_id, full_units, empty_units)
SELECT b.id, p.id, 
       CASE WHEN p.category = 'cylinder' THEN 20 ELSE 15 END AS full_units,
       CASE WHEN p.category = 'cylinder' THEN 10 ELSE 0 END AS empty_units
FROM public.branches b
CROSS JOIN public.products p
ON CONFLICT (branch_id, product_id) DO NOTHING;
