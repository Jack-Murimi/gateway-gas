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
    CREATE TYPE payment_method AS ENUM ('mpesa', 'cash', 'bank_transfer', 'pdq', 'cheque');
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

-- 3a. Private product costs. Kept separate from products so regular staff
-- cannot read cost prices through the Supabase Data API.
CREATE TABLE IF NOT EXISTS public.product_costs (
    product_id UUID PRIMARY KEY REFERENCES public.products(id) ON DELETE CASCADE,
    refill_cost_kes NUMERIC(12,2) CHECK (refill_cost_kes IS NULL OR refill_cost_kes >= 0),
    complete_cost_kes NUMERIC(12,2) CHECK (complete_cost_kes IS NULL OR complete_cost_kes >= 0),
    unit_cost_kes NUMERIC(12,2) CHECK (unit_cost_kes IS NULL OR unit_cost_kes >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
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
ALTER TABLE public.product_costs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.product_costs FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.product_costs TO authenticated;
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

-- Only Admin and Director can read or change product costs.
CREATE POLICY "Admin and Director view product costs"
    ON public.product_costs FOR SELECT
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'director'));

CREATE POLICY "Admin and Director insert product costs"
    ON public.product_costs FOR INSERT
    TO authenticated
    WITH CHECK (public.current_user_role() IN ('admin', 'director'));

CREATE POLICY "Admin and Director update product costs"
    ON public.product_costs FOR UPDATE
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'director'))
    WITH CHECK (public.current_user_role() IN ('admin', 'director'));

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


-- Supplier accounts payable: suppliers, posted invoices, invoice lines and payments.
-- All balances are derived from opening balances, posted invoices and payment allocations.
-- Posted invoices/payments are append-only. Corrections should use a controlled credit-note workflow.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code text not null unique,
  name text not null,
  contact_person text,
  phone text,
  email text,
  kra_pin text,
  address text,
  opening_balance_kes numeric(14,2) not null default 0 check (opening_balance_kes >= 0),
  opening_balance_date date,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  branch_id uuid not null references public.branches(id),
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  subtotal_kes numeric(14,2) not null default 0 check (subtotal_kes >= 0),
  tax_kes numeric(14,2) not null default 0 check (tax_kes >= 0),
  total_kes numeric(14,2) not null default 0 check (total_kes >= 0),
  notes text,
  status text not null default 'posted' check (status in ('posted','void')),
  created_by uuid references public.profiles(id) on delete set null,
  posted_by uuid references public.profiles(id) on delete set null,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (supplier_id, invoice_number)
);

create table if not exists public.supplier_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.supplier_invoices(id),
  product_id uuid references public.products(id),
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost_kes numeric(14,2) not null check (unit_cost_kes >= 0),
  line_total_kes numeric(14,2) not null check (line_total_kes >= 0),
  track_stock boolean not null default false,
  created_at timestamptz not null default now(),
  check (not track_stock or product_id is not null)
);

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  payment_date date not null default current_date,
  amount_kes numeric(14,2) not null check (amount_kes > 0),
  payment_method text not null check (payment_method in ('cash','mpesa','bank_transfer','cheque','pdq')),
  reference text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.supplier_payments(id),
  invoice_id uuid references public.supplier_invoices(id),
  amount_kes numeric(14,2) not null check (amount_kes > 0),
  created_at timestamptz not null default now()
);

create index if not exists supplier_invoices_supplier_date_idx on public.supplier_invoices(supplier_id, invoice_date desc);
create index if not exists supplier_invoices_branch_date_idx on public.supplier_invoices(branch_id, invoice_date desc);
create index if not exists supplier_invoice_items_invoice_idx on public.supplier_invoice_items(invoice_id);
create index if not exists supplier_payments_supplier_date_idx on public.supplier_payments(supplier_id, payment_date desc);
create index if not exists supplier_payment_allocations_invoice_idx on public.supplier_payment_allocations(invoice_id);

alter table public.suppliers enable row level security;
alter table public.supplier_invoices enable row level security;
alter table public.supplier_invoice_items enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.supplier_payment_allocations enable row level security;

revoke all on public.suppliers, public.supplier_invoices, public.supplier_invoice_items, public.supplier_payments, public.supplier_payment_allocations from anon;
grant select, insert, update on public.suppliers to authenticated;
grant select, insert on public.supplier_invoices, public.supplier_invoice_items, public.supplier_payments, public.supplier_payment_allocations to authenticated;

drop policy if exists "Approved purchasing staff view suppliers" on public.suppliers;
create policy "Approved purchasing staff view suppliers" on public.suppliers for select to authenticated using (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Purchasing managers create suppliers" on public.suppliers;
create policy "Purchasing managers create suppliers" on public.suppliers for insert to authenticated with check (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Purchasing managers update suppliers" on public.suppliers;
create policy "Purchasing managers update suppliers" on public.suppliers for update to authenticated using (public.current_user_role() in ('admin','director','operator')) with check (public.current_user_role() in ('admin','director','operator'));

drop policy if exists "Approved purchasing staff view supplier invoices" on public.supplier_invoices;
create policy "Approved purchasing staff view supplier invoices" on public.supplier_invoices for select to authenticated using (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Purchasing staff create supplier invoices" on public.supplier_invoices;
create policy "Purchasing staff create supplier invoices" on public.supplier_invoices for insert to authenticated with check (public.current_user_role() in ('admin','director','operator'));

drop policy if exists "Approved purchasing staff view supplier invoice items" on public.supplier_invoice_items;
create policy "Approved purchasing staff view supplier invoice items" on public.supplier_invoice_items for select to authenticated using (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Purchasing staff create supplier invoice items" on public.supplier_invoice_items;
create policy "Purchasing staff create supplier invoice items" on public.supplier_invoice_items for insert to authenticated with check (public.current_user_role() in ('admin','director','operator'));

drop policy if exists "Approved purchasing staff view supplier payments" on public.supplier_payments;
create policy "Approved purchasing staff view supplier payments" on public.supplier_payments for select to authenticated using (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Purchasing staff create supplier payments" on public.supplier_payments;
create policy "Purchasing staff create supplier payments" on public.supplier_payments for insert to authenticated with check (public.current_user_role() in ('admin','director','operator'));

drop policy if exists "Approved purchasing staff view payment allocations" on public.supplier_payment_allocations;
create policy "Approved purchasing staff view payment allocations" on public.supplier_payment_allocations for select to authenticated using (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Purchasing staff create payment allocations" on public.supplier_payment_allocations;
create policy "Purchasing staff create payment allocations" on public.supplier_payment_allocations for insert to authenticated with check (public.current_user_role() in ('admin','director','operator'));

create or replace function public.post_supplier_invoice(p_invoice jsonb, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_supplier_id uuid := (p_invoice->>'supplier_id')::uuid;
  v_branch_id uuid := (p_invoice->>'branch_id')::uuid;
  v_invoice_number text := trim(coalesce(p_invoice->>'invoice_number',''));
  v_invoice_date date := coalesce((p_invoice->>'invoice_date')::date, current_date);
  v_due_date date := nullif(p_invoice->>'due_date','')::date;
  v_tax numeric(14,2) := greatest(coalesce((p_invoice->>'tax_kes')::numeric,0),0);
  v_subtotal numeric(14,2) := 0;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric(14,3);
  v_unit_cost numeric(14,2);
  v_track boolean;
  v_description text;
begin
  if public.current_user_role() not in ('admin','director','operator') then raise exception 'You are not authorised to post supplier invoices.'; end if;
  if v_supplier_id is null or v_branch_id is null or v_invoice_number = '' then raise exception 'Supplier, branch and supplier invoice number are required.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one invoice line.'; end if;
  if not exists(select 1 from public.suppliers where id=v_supplier_id and is_active) then raise exception 'Select an active supplier.'; end if;
  if not exists(select 1 from public.branches where id=v_branch_id and is_active) then raise exception 'Select an active branch.'; end if;
  insert into public.supplier_invoices(id,supplier_id,branch_id,invoice_number,invoice_date,due_date,tax_kes,notes,created_by,posted_by)
  values(v_id,v_supplier_id,v_branch_id,v_invoice_number,v_invoice_date,v_due_date,v_tax,nullif(p_invoice->>'notes',''),auth.uid(),auth.uid());
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_unit_cost := (v_item->>'unit_cost_kes')::numeric;
    v_track := coalesce((v_item->>'track_stock')::boolean,false);
    v_description := trim(coalesce(v_item->>'description',''));
    if v_qty is null or v_qty <= 0 or v_unit_cost is null or v_unit_cost < 0 or v_description = '' then raise exception 'Each invoice line needs a description, positive quantity and non-negative unit cost.'; end if;
    if v_track and (v_product_id is null or v_qty <> trunc(v_qty)) then raise exception 'Stock-tracked lines require a product and whole-number quantity.'; end if;
    if v_product_id is not null and not exists(select 1 from public.products where id=v_product_id and is_active) then raise exception 'An invoice line references an inactive or missing product.'; end if;
    v_subtotal := v_subtotal + round(v_qty * v_unit_cost,2);
    insert into public.supplier_invoice_items(invoice_id,product_id,description,quantity,unit_cost_kes,line_total_kes,track_stock)
    values(v_id,v_product_id,v_description,v_qty,v_unit_cost,round(v_qty*v_unit_cost,2),v_track);
    if v_track then
      insert into public.branch_inventory(branch_id,product_id,full_units,empty_units,updated_at)
      values(v_branch_id,v_product_id,v_qty::integer,0,now())
      on conflict(branch_id,product_id) do update set full_units=public.branch_inventory.full_units+excluded.full_units,updated_at=now();
    end if;
  end loop;
  update public.supplier_invoices set subtotal_kes=v_subtotal,total_kes=v_subtotal+v_tax where id=v_id;
  return v_id;
end;
$$;

create or replace function public.record_supplier_payment(p_payment jsonb, p_allocations jsonb)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_supplier_id uuid := (p_payment->>'supplier_id')::uuid;
  v_amount numeric(14,2) := (p_payment->>'amount_kes')::numeric;
  v_date date := coalesce((p_payment->>'payment_date')::date,current_date);
  v_method text := coalesce(p_payment->>'payment_method','');
  v_alloc jsonb;
  v_invoice_id uuid;
  v_alloc_amount numeric(14,2);
  v_sum numeric(14,2) := 0;
  v_outstanding numeric(14,2);
  v_opening_paid numeric(14,2);
  v_opening numeric(14,2);
begin
  if public.current_user_role() not in ('admin','director','operator') then raise exception 'You are not authorised to record supplier payments.'; end if;
  if v_supplier_id is null or v_amount is null or v_amount <= 0 then raise exception 'Select a supplier and enter a valid payment amount.'; end if;
  if v_method not in ('cash','mpesa','bank_transfer','cheque','pdq') then raise exception 'Select a valid payment method.'; end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations)=0 then raise exception 'Allocate the payment to one or more outstanding balances.'; end if;
  perform 1 from public.suppliers where id=v_supplier_id and is_active for update;
  if not found then raise exception 'Supplier not found or inactive.'; end if;
  insert into public.supplier_payments(id,supplier_id,payment_date,amount_kes,payment_method,reference,notes,created_by)
  values(v_id,v_supplier_id,v_date,v_amount,v_method,nullif(p_payment->>'reference',''),nullif(p_payment->>'notes',''),auth.uid());
  for v_alloc in select value from jsonb_array_elements(p_allocations) loop
    v_invoice_id := nullif(v_alloc->>'invoice_id','')::uuid;
    v_alloc_amount := (v_alloc->>'amount_kes')::numeric;
    if v_alloc_amount is null or v_alloc_amount <= 0 then raise exception 'Payment allocations must be positive.'; end if;
    if v_invoice_id is null then
      select opening_balance_kes into v_opening from public.suppliers where id=v_supplier_id;
      select coalesce(sum(a.amount_kes),0) into v_opening_paid from public.supplier_payment_allocations a join public.supplier_payments p on p.id=a.payment_id where p.supplier_id=v_supplier_id and a.invoice_id is null;
      if v_alloc_amount > greatest(v_opening-v_opening_paid,0) then raise exception 'Payment exceeds the supplier opening balance remaining.'; end if;
    else
      perform 1 from public.supplier_invoices where id=v_invoice_id and supplier_id=v_supplier_id and status='posted' for update;
      if not found then raise exception 'Invoice does not belong to this supplier.'; end if;
      select i.total_kes-coalesce(sum(a.amount_kes),0) into v_outstanding from public.supplier_invoices i left join public.supplier_payment_allocations a on a.invoice_id=i.id where i.id=v_invoice_id group by i.id;
      if v_alloc_amount > greatest(v_outstanding,0) then raise exception 'Payment exceeds the invoice balance remaining.'; end if;
    end if;
    insert into public.supplier_payment_allocations(payment_id,invoice_id,amount_kes) values(v_id,v_invoice_id,v_alloc_amount);
    v_sum := v_sum+v_alloc_amount;
  end loop;
  if round(v_sum,2) <> round(v_amount,2) then raise exception 'The allocated amount must equal the payment amount.'; end if;
  return v_id;
end;
$$;

create or replace function public.guard_supplier_opening_balance()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if new.opening_balance_kes is distinct from old.opening_balance_kes or new.opening_balance_date is distinct from old.opening_balance_date then
    if exists(select 1 from public.supplier_invoices where supplier_id=old.id) or exists(select 1 from public.supplier_payments where supplier_id=old.id) then
      raise exception 'Opening balances cannot be changed after supplier transactions have been recorded. Use a separate adjustment workflow.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists supplier_opening_balance_immutable on public.suppliers;
create trigger supplier_opening_balance_immutable before update on public.suppliers for each row execute function public.guard_supplier_opening_balance();

revoke all on function public.post_supplier_invoice(jsonb,jsonb) from public, anon;
revoke all on function public.record_supplier_payment(jsonb,jsonb) from public, anon;
grant execute on function public.post_supplier_invoice(jsonb,jsonb) to authenticated;
grant execute on function public.record_supplier_payment(jsonb,jsonb) to authenticated;
revoke all on function public.guard_supplier_opening_balance() from public, anon, authenticated;


-- Allow settling outstanding balances for inactive suppliers. Deactivation only blocks new invoices.
create or replace function public.record_supplier_payment(p_payment jsonb, p_allocations jsonb)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_supplier_id uuid := (p_payment->>'supplier_id')::uuid;
  v_amount numeric(14,2) := (p_payment->>'amount_kes')::numeric;
  v_date date := coalesce((p_payment->>'payment_date')::date,current_date);
  v_method text := coalesce(p_payment->>'payment_method','');
  v_alloc jsonb;
  v_invoice_id uuid;
  v_alloc_amount numeric(14,2);
  v_sum numeric(14,2) := 0;
  v_outstanding numeric(14,2);
  v_opening_paid numeric(14,2);
  v_opening numeric(14,2);
begin
  if public.current_user_role() not in ('admin','director','operator') then raise exception 'You are not authorised to record supplier payments.'; end if;
  if v_supplier_id is null or v_amount is null or v_amount <= 0 then raise exception 'Select a supplier and enter a valid payment amount.'; end if;
  if v_method not in ('cash','mpesa','bank_transfer','cheque','pdq') then raise exception 'Select a valid payment method.'; end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations)=0 then raise exception 'Allocate the payment to one or more outstanding balances.'; end if;
  -- Inactive suppliers may still receive settlement payments for existing balances.
  perform 1 from public.suppliers where id=v_supplier_id for update;
  if not found then raise exception 'Supplier not found.'; end if;
  insert into public.supplier_payments(id,supplier_id,payment_date,amount_kes,payment_method,reference,notes,created_by)
  values(v_id,v_supplier_id,v_date,v_amount,v_method,nullif(p_payment->>'reference',''),nullif(p_payment->>'notes',''),auth.uid());
  for v_alloc in select value from jsonb_array_elements(p_allocations) loop
    v_invoice_id := nullif(v_alloc->>'invoice_id','')::uuid;
    v_alloc_amount := (v_alloc->>'amount_kes')::numeric;
    if v_alloc_amount is null or v_alloc_amount <= 0 then raise exception 'Payment allocations must be positive.'; end if;
    if v_invoice_id is null then
      select opening_balance_kes into v_opening from public.suppliers where id=v_supplier_id;
      select coalesce(sum(a.amount_kes),0) into v_opening_paid from public.supplier_payment_allocations a join public.supplier_payments p on p.id=a.payment_id where p.supplier_id=v_supplier_id and a.invoice_id is null;
      if v_alloc_amount > greatest(v_opening-v_opening_paid,0) then raise exception 'Payment exceeds the supplier opening balance remaining.'; end if;
    else
      perform 1 from public.supplier_invoices where id=v_invoice_id and supplier_id=v_supplier_id and status='posted' for update;
      if not found then raise exception 'Invoice does not belong to this supplier.'; end if;
      select i.total_kes-coalesce(sum(a.amount_kes),0) into v_outstanding from public.supplier_invoices i left join public.supplier_payment_allocations a on a.invoice_id=i.id where i.id=v_invoice_id group by i.id;
      if v_alloc_amount > greatest(v_outstanding,0) then raise exception 'Payment exceeds the invoice balance remaining.'; end if;
    end if;
    insert into public.supplier_payment_allocations(payment_id,invoice_id,amount_kes) values(v_id,v_invoice_id,v_alloc_amount);
    v_sum := v_sum+v_alloc_amount;
  end loop;
  if round(v_sum,2) <> round(v_amount,2) then raise exception 'The allocated amount must equal the payment amount.'; end if;
  return v_id;
end;
$$;
revoke all on function public.record_supplier_payment(jsonb,jsonb) from public, anon;
grant execute on function public.record_supplier_payment(jsonb,jsonb) to authenticated;


-- Supplier credit notes and payment reversals. Posted financial records remain immutable.
create table if not exists public.supplier_credit_notes (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  invoice_id uuid not null references public.supplier_invoices(id),
  credit_note_number text not null,
  credit_note_date date not null default current_date,
  amount_kes numeric(14,2) not null check (amount_kes > 0),
  reason text not null check (length(trim(reason)) >= 5),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (supplier_id, credit_note_number)
);
create table if not exists public.supplier_payment_reversals (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  payment_id uuid not null unique references public.supplier_payments(id),
  reversal_date date not null default current_date,
  reason text not null check (length(trim(reason)) >= 5),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists supplier_credit_notes_invoice_idx on public.supplier_credit_notes(invoice_id, credit_note_date desc);
create index if not exists supplier_credit_notes_supplier_idx on public.supplier_credit_notes(supplier_id, credit_note_date desc);
create index if not exists supplier_payment_reversals_supplier_idx on public.supplier_payment_reversals(supplier_id, reversal_date desc);
alter table public.supplier_credit_notes enable row level security;
alter table public.supplier_payment_reversals enable row level security;
revoke all on public.supplier_credit_notes, public.supplier_payment_reversals from anon, authenticated;
grant select, insert on public.supplier_credit_notes, public.supplier_payment_reversals to authenticated;
drop policy if exists "Approved staff view supplier credit notes" on public.supplier_credit_notes;
create policy "Approved staff view supplier credit notes" on public.supplier_credit_notes for select to authenticated using (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Managers create supplier credit notes" on public.supplier_credit_notes;
create policy "Managers create supplier credit notes" on public.supplier_credit_notes for insert to authenticated with check (public.current_user_role() in ('admin','director'));
drop policy if exists "Approved staff view supplier payment reversals" on public.supplier_payment_reversals;
create policy "Approved staff view supplier payment reversals" on public.supplier_payment_reversals for select to authenticated using (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Managers create supplier payment reversals" on public.supplier_payment_reversals;
create policy "Managers create supplier payment reversals" on public.supplier_payment_reversals for insert to authenticated with check (public.current_user_role() in ('admin','director'));

create or replace function public.post_supplier_credit_note(p_credit jsonb)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_invoice_id uuid := nullif(p_credit->>'invoice_id','')::uuid;
  v_number text := trim(coalesce(p_credit->>'credit_note_number',''));
  v_date date := coalesce(nullif(p_credit->>'credit_note_date','')::date,current_date);
  v_amount numeric(14,2) := (p_credit->>'amount_kes')::numeric;
  v_reason text := trim(coalesce(p_credit->>'reason',''));
  v_supplier_id uuid;
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_credited numeric(14,2);
begin
  if public.current_user_role() not in ('admin','director') then raise exception 'Only administrators and directors can post supplier credit notes.'; end if;
  if v_invoice_id is null or v_number = '' or v_amount is null or v_amount <= 0 or length(v_reason) < 5 then raise exception 'Invoice, credit note number, positive amount and a clear reason are required.'; end if;
  select supplier_id,total_kes into v_supplier_id,v_total from public.supplier_invoices where id=v_invoice_id and status='posted' for update;
  if not found then raise exception 'Select a valid posted supplier invoice.'; end if;
  select coalesce(sum(a.amount_kes),0) into v_paid
  from public.supplier_payment_allocations a join public.supplier_payments p on p.id=a.payment_id
  left join public.supplier_payment_reversals r on r.payment_id=p.id
  where a.invoice_id=v_invoice_id and r.id is null;
  select coalesce(sum(amount_kes),0) into v_credited from public.supplier_credit_notes where invoice_id=v_invoice_id;
  if v_amount > greatest(v_total-v_paid-v_credited,0) then raise exception 'Credit note exceeds the unpaid invoice balance. This workflow does not create supplier credit on already-paid amounts.'; end if;
  insert into public.supplier_credit_notes(id,supplier_id,invoice_id,credit_note_number,credit_note_date,amount_kes,reason,created_by)
  values(v_id,v_supplier_id,v_invoice_id,v_number,v_date,v_amount,v_reason,auth.uid());
  return v_id;
end;
$$;

create or replace function public.reverse_supplier_payment(p_payment_id uuid,p_reversal_date date,p_reason text)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare v_id uuid := gen_random_uuid(); v_supplier_id uuid;
begin
  if public.current_user_role() not in ('admin','director') then raise exception 'Only administrators and directors can reverse supplier payments.'; end if;
  if p_payment_id is null or length(trim(coalesce(p_reason,''))) < 5 then raise exception 'Select a payment and provide a clear reversal reason.'; end if;
  select supplier_id into v_supplier_id from public.supplier_payments where id=p_payment_id for update;
  if not found then raise exception 'Supplier payment not found.'; end if;
  if exists(select 1 from public.supplier_payment_reversals where payment_id=p_payment_id) then raise exception 'This supplier payment has already been reversed.'; end if;
  insert into public.supplier_payment_reversals(id,supplier_id,payment_id,reversal_date,reason,created_by)
  values(v_id,v_supplier_id,p_payment_id,coalesce(p_reversal_date,current_date),trim(p_reason),auth.uid());
  return v_id;
end;
$$;

create or replace function public.record_supplier_payment(p_payment jsonb, p_allocations jsonb)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid(); v_supplier_id uuid := (p_payment->>'supplier_id')::uuid;
  v_amount numeric(14,2) := (p_payment->>'amount_kes')::numeric;
  v_date date := coalesce((p_payment->>'payment_date')::date,current_date);
  v_method text := coalesce(p_payment->>'payment_method',''); v_alloc jsonb;
  v_invoice_id uuid; v_alloc_amount numeric(14,2); v_sum numeric(14,2) := 0;
  v_outstanding numeric(14,2); v_opening_paid numeric(14,2); v_opening numeric(14,2); v_credited numeric(14,2);
begin
  if public.current_user_role() not in ('admin','director','operator') then raise exception 'You are not authorised to record supplier payments.'; end if;
  if v_supplier_id is null or v_amount is null or v_amount <= 0 then raise exception 'Select a supplier and enter a valid payment amount.'; end if;
  if v_method not in ('cash','mpesa','bank_transfer','cheque','pdq') then raise exception 'Select a valid payment method.'; end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations)=0 then raise exception 'Allocate the payment to one or more outstanding balances.'; end if;
  perform 1 from public.suppliers where id=v_supplier_id for update;
  if not found then raise exception 'Supplier not found.'; end if;
  insert into public.supplier_payments(id,supplier_id,payment_date,amount_kes,payment_method,reference,notes,created_by)
  values(v_id,v_supplier_id,v_date,v_amount,v_method,nullif(p_payment->>'reference',''),nullif(p_payment->>'notes',''),auth.uid());
  for v_alloc in select value from jsonb_array_elements(p_allocations) loop
    v_invoice_id := nullif(v_alloc->>'invoice_id','')::uuid; v_alloc_amount := (v_alloc->>'amount_kes')::numeric;
    if v_alloc_amount is null or v_alloc_amount <= 0 then raise exception 'Payment allocations must be positive.'; end if;
    if v_invoice_id is null then
      select opening_balance_kes into v_opening from public.suppliers where id=v_supplier_id;
      select coalesce(sum(a.amount_kes),0) into v_opening_paid from public.supplier_payment_allocations a
      join public.supplier_payments p on p.id=a.payment_id left join public.supplier_payment_reversals r on r.payment_id=p.id
      where p.supplier_id=v_supplier_id and a.invoice_id is null and r.id is null;
      if v_alloc_amount > greatest(v_opening-v_opening_paid,0) then raise exception 'Payment exceeds the supplier opening balance remaining.'; end if;
    else
      perform 1 from public.supplier_invoices where id=v_invoice_id and supplier_id=v_supplier_id and status='posted' for update;
      if not found then raise exception 'Invoice does not belong to this supplier.'; end if;
      select i.total_kes-coalesce(sum(a.amount_kes) filter (where r.id is null),0) into v_outstanding
      from public.supplier_invoices i left join public.supplier_payment_allocations a on a.invoice_id=i.id
      left join public.supplier_payments p on p.id=a.payment_id left join public.supplier_payment_reversals r on r.payment_id=p.id
      where i.id=v_invoice_id group by i.id;
      select coalesce(sum(amount_kes),0) into v_credited from public.supplier_credit_notes where invoice_id=v_invoice_id;
      v_outstanding := v_outstanding-v_credited;
      if v_alloc_amount > greatest(v_outstanding,0) then raise exception 'Payment exceeds the invoice balance remaining.'; end if;
    end if;
    insert into public.supplier_payment_allocations(payment_id,invoice_id,amount_kes) values(v_id,v_invoice_id,v_alloc_amount);
    v_sum := v_sum+v_alloc_amount;
  end loop;
  if round(v_sum,2) <> round(v_amount,2) then raise exception 'The allocated amount must equal the payment amount.'; end if;
  return v_id;
end;
$$;

revoke all on function public.post_supplier_credit_note(jsonb) from public, anon;
revoke all on function public.reverse_supplier_payment(uuid,date,text) from public, anon;
revoke all on function public.record_supplier_payment(jsonb,jsonb) from public, anon;
grant execute on function public.post_supplier_credit_note(jsonb) to authenticated;
grant execute on function public.reverse_supplier_payment(uuid,date,text) to authenticated;
grant execute on function public.record_supplier_payment(jsonb,jsonb) to authenticated;

-- Index one-to-many customer contact joins for fast customer directory loading.
CREATE INDEX IF NOT EXISTS idx_customer_phones_customer_id
  ON public.customer_phones (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_locations_customer_id
  ON public.customer_locations (customer_id);
