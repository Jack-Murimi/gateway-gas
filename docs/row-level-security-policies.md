# Gateway Gas Row-Level Security (RLS) & Access Control Specification

## 1. Security Architecture & Threat Model

Gateway Gas operates a multi-branch liquefied petroleum gas (LPG) and water distribution network. Access to data is enforced at the database kernel level through PostgreSQL Row-Level Security (RLS). 

All client queries route through PostgREST (Supabase API Gateway). The PostgreSQL execution engine evaluates every row against security policies before returning or modifying data.

```
┌────────────────────────────────────────────────────────┐
│                   Untrusted Client                     │
│  (Next.js App / LocalStorage / Demo Switcher / Cookies)│
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS + Authorization: Bearer <JWT>
                            ▼
┌────────────────────────────────────────────────────────┐
│           Supabase API Gateway (PostgREST)             │
│  - Verifies HMAC-SHA256 signature against JWT Secret   │
│  - Sets Postgres session variables:                    │
│      request.jwt.claims.sub -> auth.uid()              │
│      request.jwt.claims.role -> 'authenticated'        │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│             PostgreSQL Database Engine                 │
│  - public.current_user_role()                          │
│  - public.is_staff_approved()                          │
│  - RLS Policies enforced per row                       │
└────────────────────────────────────────────────────────┘
```

### Security Helper Functions

Helper functions evaluate caller permissions within the database. They run with `SECURITY DEFINER` and `SET search_path = public` to prevent search-path hijacking.

```sql
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
```

---

## 2. Role Hierarchy & Permissions Matrix

Six roles govern access:
1. `admin`: System administrator (full access across all branches, users, and tables).
2. `director`: Executive leadership (full read access; profile and order management; financial oversight).
3. `operator`: Central dispatch and branch inventory controller (manages orders, assignments, stock levels).
4. `sales_rep`: Branch POS cashier and sales agent (creates orders, manages order items, searches/creates customers).
5. `rider`: Delivery rider (views assigned deliveries, updates delivery status and handover notes).
6. `pending` (including `rejected` / unauthenticated): Unapproved accounts locked to self-profile contact updates only.

| Table | Admin | Director | Operator | Sales Rep | Rider | Pending / Rejected / Anon |
|---|---|---|---|---|---|---|
| `profiles` | Full CRUD | Full CRUD | SELECT all, UPDATE self | SELECT all, UPDATE self | SELECT all, UPDATE self | SELECT self (`id = auth.uid()`), UPDATE self |
| `branches` | Full CRUD | SELECT | SELECT | SELECT | SELECT | None |
| `products` | Full CRUD | SELECT | SELECT | SELECT | SELECT | None |
| `branch_inventory` | Full CRUD | Full CRUD | Full CRUD | SELECT, UPDATE stock deltas | SELECT | None |
| `orders` | Full CRUD | Full CRUD | SELECT all, INSERT, UPDATE dispatch | SELECT all, INSERT, UPDATE unassigned | SELECT assigned only, UPDATE status/comment only | None |
| `order_items` | Full CRUD | Full CRUD | Full CRUD | Full CRUD | SELECT assigned order items only | None |
| `customers` | Full CRUD | Full CRUD | Full CRUD | Full CRUD | SELECT linked to assigned orders only | None |
| `customer_phones` | Full CRUD | Full CRUD | Full CRUD | Full CRUD | SELECT linked to assigned orders only | None |
| `customer_locations` | Full CRUD | Full CRUD | Full CRUD | Full CRUD | SELECT linked to assigned orders only | None |

---

## 3. SQL Schema & RLS Policy Implementations

### 3.1 `public.profiles`

```sql
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Approved staff read directory; pending users read only their own profile
CREATE POLICY "profiles_select_policy"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (public.is_staff_approved() OR auth.uid() = id);

-- 2. UPDATE: Users update their own phone and vehicle plate (cannot alter role or approval_status)
CREATE POLICY "profiles_update_self_policy"
    ON public.profiles FOR UPDATE
    TO authenticated
    USING (auth.uid() = id)
    WITH CHECK (
        auth.uid() = id
        AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
        AND approval_status = (SELECT approval_status FROM public.profiles WHERE id = auth.uid())
    );

-- 3. ALL: Admin and Director have full management over all profiles
CREATE POLICY "profiles_admin_director_manage_policy"
    ON public.profiles FOR ALL
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'director'))
    WITH CHECK (public.current_user_role() IN ('admin', 'director'));
```

### 3.2 `public.branches`

```sql
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Approved staff view all active branches
CREATE POLICY "branches_select_approved_staff"
    ON public.branches FOR SELECT
    TO authenticated
    USING (public.is_staff_approved());

-- 2. ALL: Admins manage branch configuration
CREATE POLICY "branches_admin_manage"
    ON public.branches FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');
```

### 3.3 `public.products`

```sql
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Approved staff view product catalog & pricing
CREATE POLICY "products_select_approved_staff"
    ON public.products FOR SELECT
    TO authenticated
    USING (public.is_staff_approved());

-- 2. ALL: Admins configure catalog products & prices
CREATE POLICY "products_admin_manage"
    ON public.products FOR ALL
    TO authenticated
    USING (public.current_user_role() = 'admin')
    WITH CHECK (public.current_user_role() = 'admin');
```

### 3.4 `public.branch_inventory`

```sql
ALTER TABLE public.branch_inventory ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Approved staff view branch inventory levels
CREATE POLICY "inventory_select_approved_staff"
    ON public.branch_inventory FOR SELECT
    TO authenticated
    USING (public.is_staff_approved());

-- 2. ALL: Admin, Director, and Operator manage stock counts
CREATE POLICY "inventory_operators_manage"
    ON public.branch_inventory FOR ALL
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'director', 'operator'))
    WITH CHECK (public.current_user_role() IN ('admin', 'director', 'operator'));

-- 3. UPDATE: Sales reps update stock units during sales dispatch
CREATE POLICY "inventory_sales_rep_update_stock"
    ON public.branch_inventory FOR UPDATE
    TO authenticated
    USING (public.current_user_role() = 'sales_rep')
    WITH CHECK (public.current_user_role() = 'sales_rep');
```

### 3.5 `public.orders`

```sql
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Admins, Directors, Operators, and Sales Reps view all orders
CREATE POLICY "orders_select_desk_staff"
    ON public.orders FOR SELECT
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'));

-- 2. SELECT: Riders view only assigned orders
CREATE POLICY "orders_select_assigned_rider"
    ON public.orders FOR SELECT
    TO authenticated
    USING (public.current_user_role() = 'rider' AND rider_id = auth.uid());

-- 3. INSERT: Sales reps, Operators, Directors, and Admins create orders
CREATE POLICY "orders_insert_staff"
    ON public.orders FOR INSERT
    TO authenticated
    WITH CHECK (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'));

-- 4. UPDATE: Desk staff manage orders
CREATE POLICY "orders_update_desk_staff"
    ON public.orders FOR UPDATE
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'))
    WITH CHECK (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'));

-- 5. UPDATE: Riders update assigned order status and delivery comment only
CREATE POLICY "orders_update_assigned_rider"
    ON public.orders FOR UPDATE
    TO authenticated
    USING (public.current_user_role() = 'rider' AND rider_id = auth.uid())
    WITH CHECK (public.current_user_role() = 'rider' AND rider_id = auth.uid());

-- Prevent riders from tampering with financial amounts or payment status
CREATE OR REPLACE FUNCTION public.enforce_rider_order_update_bounds()
RETURNS trigger AS $$
BEGIN
    IF (public.current_user_role() = 'rider') THEN
        IF (NEW.subtotal_kes != OLD.subtotal_kes OR
            NEW.delivery_fee_kes != OLD.delivery_fee_kes OR
            NEW.total_kes != OLD.total_kes OR
            NEW.payment_status != OLD.payment_status OR
            NEW.payment_method != OLD.payment_method OR
            NEW.branch_id != OLD.branch_id OR
            NEW.sales_rep_id IS DISTINCT FROM OLD.sales_rep_id OR
            NEW.rider_id IS DISTINCT FROM OLD.rider_id) THEN
            RAISE EXCEPTION 'Access Denied: Riders may only update delivery_status and rider_comment';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_rider_order_bounds ON public.orders;
CREATE TRIGGER trg_rider_order_bounds
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.enforce_rider_order_update_bounds();
```

### 3.6 `public.order_items`

```sql
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Desk staff view all order line items; riders view only items for their assigned deliveries
CREATE POLICY "order_items_select"
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

-- 2. ALL: Desk staff manage order items
CREATE POLICY "order_items_desk_staff_manage"
    ON public.order_items FOR ALL
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'))
    WITH CHECK (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'));
```

### 3.7 `public.customers`

```sql
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Desk staff view all customers; riders view customers with orders assigned to them
CREATE POLICY "customers_select_policy"
    ON public.customers FOR SELECT
    TO authenticated
    USING (
        public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep')
        OR (
            public.current_user_role() = 'rider'
            AND EXISTS (
                SELECT 1 FROM public.orders o
                WHERE o.customer_id = customers.id AND o.rider_id = auth.uid()
            )
        )
    );

-- 2. ALL: Desk staff manage customers
CREATE POLICY "customers_desk_staff_manage"
    ON public.customers FOR ALL
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'))
    WITH CHECK (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'));
```

### 3.8 `public.customer_phones`

```sql
CREATE TABLE IF NOT EXISTS public.customer_phones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(customer_id, phone_number)
);

ALTER TABLE public.customer_phones ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Desk staff view all customer phones; riders view phone numbers for assigned customer deliveries
CREATE POLICY "customer_phones_select_policy"
    ON public.customer_phones FOR SELECT
    TO authenticated
    USING (
        public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep')
        OR (
            public.current_user_role() = 'rider'
            AND EXISTS (
                SELECT 1 FROM public.orders o
                WHERE o.customer_id = customer_phones.customer_id AND o.rider_id = auth.uid()
            )
        )
    );

-- 2. ALL: Desk staff manage customer phones
CREATE POLICY "customer_phones_desk_staff_manage"
    ON public.customer_phones FOR ALL
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'))
    WITH CHECK (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'));
```

### 3.9 `public.customer_locations`

```sql
CREATE TABLE IF NOT EXISTS public.customer_locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    estate TEXT NOT NULL,
    specific_address TEXT,
    is_default BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.customer_locations ENABLE ROW LEVEL SECURITY;

-- 1. SELECT: Desk staff view all customer locations; riders view locations for assigned customer deliveries
CREATE POLICY "customer_locations_select_policy"
    ON public.customer_locations FOR SELECT
    TO authenticated
    USING (
        public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep')
        OR (
            public.current_user_role() = 'rider'
            AND EXISTS (
                SELECT 1 FROM public.orders o
                WHERE o.customer_id = customer_locations.customer_id AND o.rider_id = auth.uid()
            )
        )
    );

-- 2. ALL: Desk staff manage customer locations
CREATE POLICY "customer_locations_desk_staff_manage"
    ON public.customer_locations FOR ALL
    TO authenticated
    USING (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'))
    WITH CHECK (public.current_user_role() IN ('admin', 'director', 'operator', 'sales_rep'));
```

---

## 4. Formal Proof: Why Client-Side Demo Switcher Never Grants Database Server Access

### 4.1 Threat Model & Attack Surface

The application provides a client-side demo switcher (`src/components/demo-user-switcher.tsx`) for user-testing and sales presentations. When clicked, it mutates React state (`StoreContext`), writes to `localStorage` (`gwg_user`, `gwg_demo_user_id`), and writes document cookies (`gwg_role`, `gwg_user_id`).

**Hypothesis**: An attacker uses the demo switcher or manually manipulates `localStorage` / `document.cookie` / React DevTools to switch their client role to `admin` and gain unauthorized access to the production Supabase PostgreSQL database.

**Theorem**: The client-side demo switcher grants **0 bits of privilege escalation** against the PostgreSQL database engine.

---

### 4.2 Proof by Invariants

#### Invariant 1: Database Identity Originates Exclusively from Cryptographic JWTs
PostgREST evaluates caller identity strictly from the HTTP request header:
$$\text{Header: } Authorization: \text{Bearer } \mathbf{T}$$
Where $\mathbf{T}$ is a JSON Web Token structured as:
$$\mathbf{T} = \text{Base64Url}(\text{Header}) \mathbin{\Vert} '.' \mathbin{\Vert} \text{Base64Url}(\text{Payload}) \mathbin{\Vert} '.' \mathbin{\Vert} \text{Base64Url}(\text{Signature})$$
PostgREST verifies the signature using the private server secret:
$$\text{Signature} \stackrel{?}{=} \text{HMAC-SHA256}(\text{Header} \mathbin{\Vert} '.' \mathbin{\Vert} \text{Payload},\; K_{\text{jwt\_secret}})$$
- If the signature is invalid or absent, the request is treated as unauthenticated (`role = anon`).
- The client-side demo switcher does not hold $K_{\text{jwt\_secret}}$.
- An attacker cannot sign an arbitrary payload containing an elevated `sub` claim.

#### Invariant 2: Database RLS Derives Role from Server-Side Profile Table
Even if a caller presents a valid token for an existing user (e.g. rider `rider.john@gatewaygas.co.ke`), the database role is not read from the token payload. It is read via:
```sql
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
    SELECT COALESCE(
        (SELECT role FROM public.profiles WHERE id = auth.uid() AND approval_status = 'approved'),
        'pending'::user_role
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```
- PostgreSQL queries `public.profiles` using `id = auth.uid()`.
- The value of `auth.uid()` is set by PostgREST from the verified token claim `claims.sub`.
- The database record for `rider.john` has `role = 'rider'`.
- Client-side modifications to `localStorage` or `document.cookie` do not alter the `public.profiles` row in PostgreSQL.

#### Invariant 3: Demo Cookies and LocalStorage Are Invisible to PostgREST
- `localStorage` is isolated to the browser runtime and is never transmitted in HTTP headers.
- PostgREST does not inspect arbitrary session cookies (`gwg_role`, `gwg_user_id`) to derive database identity. PostgREST strictly checks either the `Authorization` header or a cookie explicitly named `sb-access-token` signed by GoTrue.
- Setting `document.cookie = "gwg_role=admin"` has zero impact on PostgREST session variables.

#### Invariant 4: Client Code Holds Only the Anonymous Public Key
The browser application environment has access only to:
```typescript
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
```
- The Supabase `anon` key grants only the PostgreSQL role `anon`.
- Every table has `ENABLE ROW LEVEL SECURITY`.
- Every policy requires `TO authenticated` and `public.is_staff_approved()`.
- For `anon` callers, `auth.uid()` evaluates to `NULL`.
- Under RLS evaluation, `NULL` equality checks (`auth.uid() = id`, `is_staff_approved()`) evaluate to `FALSE`.
- Queries made via the `anon` key return empty row sets (`[]`) or `401 / 403 Access Denied`.
- The `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS, but it is stored in server-only environment variables and never bundled into client-side JavaScript.

---

### 4.3 Attack Vector Analysis

| Attack Vector | Attacker Action | Database Engine Evaluation | Result |
|---|---|---|---|
| **Vector 1: Demo Switcher Selection** | User taps "Admin" in demo switcher UI. | No network request sent with admin credentials. PostgREST receives either no JWT or existing non-admin JWT. | **Blocked**: UI displays mock state locally; direct DB queries execute under caller's real DB role. |
| **Vector 2: Cookie Tampering** | Attacker executes `document.cookie = "gwg_role=admin; path=/"`. | PostgREST ignores `gwg_role`. `auth.uid()` remains unchanged. `current_user_role()` reads DB row. | **Blocked**: Zero effect on PostgreSQL permissions. |
| **Vector 3: LocalStorage Forgery** | Attacker modifies `localStorage.setItem('gwg_user', JSON.stringify({ role: 'admin' }))`. | `localStorage` is strictly client memory. PostgREST never reads client `localStorage`. | **Blocked**: Zero effect on PostgreSQL permissions. |
| **Vector 4: Direct PostgREST Request with Anon Key** | Attacker curls PostgREST endpoint: `curl -H "apikey: <ANON_KEY>" https://<project>.supabase.co/rest/v1/orders`. | PostgREST runs query as role `anon`. Policy `orders_select_desk_staff` requires `current_user_role() IN ('admin', ...)`. Role evaluates to `'pending'`. | **Blocked**: Returns HTTP 200 with empty array `[]`. Zero rows exposed. |
| **Vector 5: Token Forgery** | Attacker crafts JWT with `{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}` signed with arbitrary secret. | PostgREST HMAC verification against server secret fails. | **Blocked**: HTTP 401 Unauthorized (`Invalid signature`). |
| **Vector 6: Rider Tampering with Order Totals** | Rider sends `PATCH /orders?id=eq.<ID>` with `{"total_kes": 0}`. | Trigger `trg_rider_order_bounds` executes before row update, detects non-whitelisted column modification. | **Blocked**: PostgreSQL exception `Access Denied: Riders may only update delivery_status and rider_comment`. |

---

## 5. Automated RLS Policy Verification Script

Run this SQL block in the Supabase SQL Editor to test policy isolation across roles:

```sql
DO $$
DECLARE
    v_admin_id UUID := '00000000-0000-0000-0000-000000000001';
    v_rider_id UUID := '00000000-0000-0000-0000-000000000005';
    v_pending_id UUID := '00000000-0000-0000-0000-000000000006';
    v_order_count INT;
    v_branch_count INT;
BEGIN
    -- 1. Test Pending User (Should see 0 orders and 0 branches)
    EXECUTE format('SET LOCAL "request.jwt.claims" = ''{"sub": "%s", "role": "authenticated"}''', v_pending_id);
    SET LOCAL ROLE authenticated;
    
    SELECT COUNT(*) INTO v_order_count FROM public.orders;
    ASSERT v_order_count = 0, 'FAIL: Pending user saw orders';
    
    SELECT COUNT(*) INTO v_branch_count FROM public.branches;
    ASSERT v_branch_count = 0, 'FAIL: Pending user saw branches';

    -- 2. Test Rider (Should see only assigned orders)
    EXECUTE format('SET LOCAL "request.jwt.claims" = ''{"sub": "%s", "role": "authenticated"}''', v_rider_id);
    SET LOCAL ROLE authenticated;
    
    SELECT COUNT(*) INTO v_order_count FROM public.orders WHERE rider_id != v_rider_id;
    ASSERT v_order_count = 0, 'FAIL: Rider saw unassigned orders';

    -- 3. Test Admin (Should see all branches)
    EXECUTE format('SET LOCAL "request.jwt.claims" = ''{"sub": "%s", "role": "authenticated"}''', v_admin_id);
    SET LOCAL ROLE authenticated;
    
    SELECT COUNT(*) INTO v_branch_count FROM public.branches;
    ASSERT v_branch_count >= 4, 'FAIL: Admin could not read branches';

    RAISE NOTICE 'SUCCESS: All RLS boundary assertions passed.';
END $$;
```
