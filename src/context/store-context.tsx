'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Branch,
  StaffProfile,
  Product,
  BranchInventory,
  Order,
  OrderItem,
  RiderLeaderboardEntry,
  UserRole,
  DeliveryStatus,
  PaymentStatus,
  PaymentMethod,
  OrderType,
  Customer,
  CustomerPhone,
  CustomerLocation,
  ShiftZReport,
} from '@/types';
import { createClient } from '@/lib/supabase/client';
import { setDemoSessionCookies, clearDemoSessionCookies } from '@/lib/demo-mode';

interface CreateOrderParams {
  branch_id: string;
  is_pos_walkin: boolean;
  customer_id?: string | null;
  receipt_number?: string | null;
  created_at?: string;
  customer_name: string;
  customer_phone: string;
  delivery_estate?: string;
  delivery_address?: string;
  rider_ids?: string[];
  vehicle_plate?: string | null;
  lpo_number?: string | null;
  sale_comment?: string | null;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_reference?: string;
  delivery_fee_kes: number;
  items: Array<{
    product_id: string;
    branch_id?: string;
    order_type: OrderType;
    outgoing_brand: string;
    incoming_brand?: string;
    cylinder_size_kg?: number | null;
    quantity: number;
    unit_price_kes: number;
  }>;
}

interface StoreContextType {
  currentUser: StaffProfile | null;
  setCurrentUser: (user: StaffProfile | null) => void;
  staffList: StaffProfile[];
  branches: Branch[];
  products: Product[];
  inventory: BranchInventory[];
  orders: Order[];
  customers: Customer[];
  leaderboard: RiderLeaderboardEntry[];
  shiftReports: ShiftZReport[];
  signupStaff: (email: string, password: string, full_name: string, phone: string, vehicle_plate?: string) => Promise<{ success: boolean; message: string }>;
  approveStaff: (staffId: string, role: UserRole) => void;
  rejectStaff: (staffId: string) => void;
  createOrder: (params: CreateOrderParams) => Promise<Order>;
  createCustomer: (name: string, phone: string, estate: string, specificAddress?: string) => Customer;
  addCustomerPhone: (customerId: string, phone: string) => void;
  addCustomerLocation: (customerId: string, estate: string, specificAddress?: string) => void;
  assignRider: (orderId: string, riderId: string) => void;
  updateDeliveryStatus: (orderId: string, status: DeliveryStatus, comment?: string) => void;
  updateRiderComment: (orderId: string, comment: string) => void;
  updateBranchStock: (branchId: string, productId: string, fullDelta: number, emptyDelta: number) => void;
  createBranch: (name: string, code: string, location_estate: string, contact_phone: string) => void;
  createShiftReport: (data: Omit<ShiftZReport, 'id' | 'report_number' | 'closed_at'>) => Promise<ShiftZReport>;
  resetDemoData: () => void;
  logout: () => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<StaffProfile | null>(null);
  const [staffList, setStaffList] = useState<StaffProfile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [inventory, setInventory] = useState<BranchInventory[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [shiftReports, setShiftReports] = useState<ShiftZReport[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const fetchLiveData = useCallback(async () => {
    try {
      const supabase = createClient();
      const [branchesRes, productsRes, inventoryRes, ordersRes, staffRes] = await Promise.all([
        supabase.from('branches').select('*').eq('is_active', true).order('code'),
        supabase.from('products').select('*').eq('is_active', true).order('category').order('name'),
        supabase.from('branch_inventory').select('*'),
        supabase.from('orders').select('*, items:order_items(*)').order('created_at', { ascending: false }).limit(200),
        supabase.from('profiles').select('*').order('created_at', { ascending: true }),
      ]);

      if (!branchesRes.error && branchesRes.data) setBranches(branchesRes.data as Branch[]);
      if (!productsRes.error && productsRes.data) setProducts(productsRes.data as Product[]);
      if (!inventoryRes.error && inventoryRes.data) setInventory(inventoryRes.data as BranchInventory[]);
      if (!ordersRes.error && ordersRes.data) setOrders(ordersRes.data as Order[]);
      if (!staffRes.error && staffRes.data) setStaffList(staffRes.data as StaffProfile[]);

      // Optional: customers (table/relations may differ); load separately so core data isn't blocked.
      try {
        const customersRes = await supabase
          .from('customers')
          .select('*, phones:customer_phones(*), locations:customer_locations(*)')
          .order('created_at', { ascending: false })
          .limit(200);
        if (!customersRes.error && customersRes.data) setCustomers(customersRes.data as Customer[]);
      } catch {
        // ignore if customers schema differs
      }
    } catch (e) {
      console.error('Failed to load live data', e);
    }
  }, []);

  // Initialize session and load live data
  useEffect(() => {
    let mounted = true;

    const withTimeout = async <T,>(promise: PromiseLike<T>, ms: number): Promise<T | null> => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      try {
        return await Promise.race([
          Promise.resolve(promise),
          new Promise<null>((resolve) => {
            timeoutId = setTimeout(() => resolve(null), ms);
          }),
        ]);
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    (async () => {
      try {
        const supabase = createClient();
        const sessionRes = await withTimeout(supabase.auth.getSession(), 4000);
        const session = sessionRes && 'data' in sessionRes ? sessionRes.data.session : null;

        if (session?.user) {
          const profileRes = await withTimeout(
            supabase.from('profiles').select('*').eq('id', session.user.id).single(),
            4000
          );
          const profile = profileRes && 'data' in (profileRes as any) ? (profileRes as any).data : null;
          if (mounted && profile) {
            const u: StaffProfile = {
              id: profile.id,
              email: profile.email,
              full_name: profile.full_name,
              phone: profile.phone,
              role: profile.role,
              approval_status: profile.approval_status,
              vehicle_plate: profile.vehicle_plate,
              avatar_url: profile.avatar_url,
            };
            setCurrentUser(u);
            setDemoSessionCookies(u.id, u.role, u.approval_status);
          }
        } else {
          clearDemoSessionCookies();
          if (mounted) setCurrentUser(null);
        }
      } catch (e) {
        console.error('Store init error', e);
      } finally {
        // Unblock UI quickly; load data in background.
        if (mounted) setIsLoaded(true);
      }

      try {
        await withTimeout(fetchLiveData(), 8000);
      } catch (e) {
        console.error('Background data load error', e);
      }
    })();

    return () => { mounted = false; };
  }, [fetchLiveData]);

  // Persist only current user session hint locally (no mock business data)
  useEffect(() => {
    if (!isLoaded) return;
    try {
      if (currentUser) localStorage.setItem('gwg_user', JSON.stringify(currentUser));
      else localStorage.removeItem('gwg_user');
    } catch {}
  }, [currentUser, isLoaded]);

  const signupStaff = async (email: string, password: string, full_name: string, phone: string, vehicle_plate?: string) => {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name, phone, vehicle_plate: vehicle_plate || null },
        },
      });
      if (error) return { success: false, message: error.message };

      // Ensure profile has phone/vehicle fields if trigger created minimal row
      if (data.user) {
        await supabase.from('profiles').update({ full_name, phone, vehicle_plate: vehicle_plate || null }).eq('id', data.user.id);
      }

      return { success: true, message: 'Account created. Awaiting approval.' };
    } catch (e) {
      return { success: false, message: e instanceof Error ? e.message : 'Sign up failed.' };
    }
  };

  const approveStaff = (staffId: string, role: UserRole) => {
    (async () => {
      try {
        const supabase = createClient();
        await supabase.from('profiles').update({ role, approval_status: 'approved', updated_at: new Date().toISOString() }).eq('id', staffId);
        await fetchLiveData();
        if (currentUser?.id === staffId) {
          setCurrentUser((prev) => (prev ? { ...prev, role, approval_status: 'approved' } : null));
          setDemoSessionCookies(staffId, role, 'approved');
        }
      } catch (e) { console.error(e); }
    })();
  };

  const rejectStaff = (staffId: string) => {
    (async () => {
      try {
        const supabase = createClient();
        await supabase.from('profiles').update({ approval_status: 'rejected', updated_at: new Date().toISOString() }).eq('id', staffId);
        await fetchLiveData();
      } catch (e) { console.error(e); }
    })();
  };

  const updateBranchStock = (branchId: string, productId: string, fullDelta: number, emptyDelta: number) => {
    (async () => {
      try {
        const supabase = createClient();
        const current = inventory.find((i) => i.branch_id === branchId && i.product_id === productId);
        const full_units = Math.max(0, (current?.full_units ?? 0) + fullDelta);
        const empty_units = Math.max(0, (current?.empty_units ?? 0) + emptyDelta);
        await supabase.from('branch_inventory').upsert({ branch_id: branchId, product_id: productId, full_units, empty_units, updated_at: new Date().toISOString() }, { onConflict: 'branch_id,product_id' });
        await fetchLiveData();
      } catch (e) { console.error(e); }
    })();
  };

  const createOrder = async (params: CreateOrderParams): Promise<Order> => {
    const supabase = createClient();

    // Validate stock locally against latest known inventory
    const requestedBySource = new Map<string, number>();
    params.items.forEach((item) => {
      const key = `${item.branch_id || params.branch_id}:${item.product_id}`;
      requestedBySource.set(key, (requestedBySource.get(key) || 0) + item.quantity);
    });
    for (const [key, requested] of requestedBySource) {
      const [sourceBranchId, productId] = key.split(':');
      const stock = inventory.find((row) => row.branch_id === sourceBranchId && row.product_id === productId);
      if (!stock || stock.full_units < requested) {
        const productName = products.find((p) => p.id === productId)?.name || 'Selected product';
        const branchName = branches.find((b) => b.id === sourceBranchId)?.name || 'selected branch';
        throw new Error(`Insufficient stock: ${productName} has ${stock?.full_units ?? 0} available at ${branchName}, but ${requested} requested.`);
      }
    }

    const orderNumber = `GWG-${Math.floor(1000 + Math.random() * 9000)}`;
    const itemsPayload = params.items.map((item) => ({
      product_id: item.product_id,
      order_type: item.order_type,
      outgoing_brand: item.outgoing_brand,
      incoming_brand: item.incoming_brand || null,
      cylinder_size_kg: item.cylinder_size_kg ?? null,
      quantity: item.quantity,
      unit_price_kes: item.unit_price_kes,
      subtotal_kes: item.quantity * item.unit_price_kes,
      branch_id: item.branch_id || params.branch_id,
    }));
    const subtotal = itemsPayload.reduce((acc, i) => acc + i.subtotal_kes, 0);
    const total = subtotal + params.delivery_fee_kes;

    const { data: inserted, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        branch_id: params.branch_id,
        sales_rep_id: currentUser?.id || null,
        rider_id: params.rider_ids?.[0] || null,
        rider_ids: params.rider_ids || [],
        vehicle_plate: params.vehicle_plate || null,
        receipt_number: params.receipt_number || null,
        lpo_number: params.lpo_number || null,
        sale_comment: params.sale_comment || null,
        is_pos_walkin: params.is_pos_walkin,
        customer_name: params.customer_name,
        customer_phone: params.customer_phone,
        delivery_estate: params.delivery_estate || null,
        delivery_address: params.delivery_address || null,
        delivery_status: params.is_pos_walkin ? 'delivered' : params.rider_ids?.length ? 'assigned' : 'pending',
        payment_method: params.payment_method,
        payment_status: params.payment_status,
        payment_reference: params.payment_reference || null,
        subtotal_kes: subtotal,
        delivery_fee_kes: params.delivery_fee_kes,
        total_kes: total,
        assigned_at: !params.is_pos_walkin && params.rider_ids?.length ? new Date().toISOString() : null,
        delivered_at: params.is_pos_walkin ? new Date().toISOString() : null,
        created_at: params.created_at || new Date().toISOString(),
      })
      .select('*')
      .single();
    if (orderError || !inserted) throw orderError || new Error('Failed to create order');

    const withOrderId = itemsPayload.map((it) => ({ ...it, order_id: inserted.id }));
    const { error: itemsError } = await supabase.from('order_items').insert(withOrderId);
    if (itemsError) throw itemsError;

    // Update inventory in DB
    for (const item of params.items) {
      const itemBranchId = item.branch_id || params.branch_id;
      const stockRow = inventory.find((i) => i.branch_id === itemBranchId && i.product_id === item.product_id);
      const newFull = Math.max(0, (stockRow?.full_units ?? 0) - item.quantity);
      let newEmpty = stockRow?.empty_units ?? 0;
      await supabase.from('branch_inventory').upsert({ branch_id: itemBranchId, product_id: item.product_id, full_units: newFull, empty_units: newEmpty, updated_at: new Date().toISOString() }, { onConflict: 'branch_id,product_id' });

      if (item.order_type === 'refill' && item.incoming_brand && item.cylinder_size_kg) {
        const incomingProduct = products.find((p) => p.brand.toLowerCase() === item.incoming_brand!.toLowerCase() && p.size_kg === item.cylinder_size_kg);
        const targetId = incomingProduct?.id || item.product_id;
        const targetRow = inventory.find((i) => i.branch_id === itemBranchId && i.product_id === targetId);
        const targetEmpty = Math.max(0, (targetRow?.empty_units ?? 0) + item.quantity);
        const targetFull = targetId === item.product_id ? newFull : (targetRow?.full_units ?? 0);
        await supabase.from('branch_inventory').upsert({ branch_id: itemBranchId, product_id: targetId, full_units: targetFull, empty_units: targetEmpty, updated_at: new Date().toISOString() }, { onConflict: 'branch_id,product_id' });
      }
    }

    await fetchLiveData();
    const refreshed = await supabase.from('orders').select('*, items:order_items(*)').eq('id', inserted.id).single();
    return (refreshed.data || { ...inserted, items: withOrderId }) as Order;
  };

  const createCustomer = (_name: string, _phone: string, _estate: string, _specificAddress?: string): Customer => {
    // Live customer creation can be added when customer tables/API are finalized.
    throw new Error('Customer records are managed in the live system. Create via supported flow.');
  };

  const addCustomerPhone = (_customerId: string, _phone: string) => {};
  const addCustomerLocation = (_customerId: string, _estate: string, _specificAddress?: string) => {};

  const assignRider = (orderId: string, riderId: string) => {
    (async () => {
      try {
        const supabase = createClient();
        await supabase.from('orders').update({ rider_id: riderId, rider_ids: [riderId], delivery_status: 'assigned', assigned_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', orderId);
        await fetchLiveData();
      } catch (e) { console.error(e); }
    })();
  };

  const updateDeliveryStatus = (orderId: string, status: DeliveryStatus, comment?: string) => {
    (async () => {
      try {
        const supabase = createClient();
        const patch: Record<string, unknown> = { delivery_status: status, updated_at: new Date().toISOString() };
        if (comment !== undefined) patch.rider_comment = comment;
        if (status === 'delivered') patch.delivered_at = new Date().toISOString();
        await supabase.from('orders').update(patch).eq('id', orderId);
        await fetchLiveData();
      } catch (e) { console.error(e); }
    })();
  };

  const updateRiderComment = (orderId: string, comment: string) => {
    (async () => {
      try {
        const supabase = createClient();
        await supabase.from('orders').update({ rider_comment: comment, updated_at: new Date().toISOString() }).eq('id', orderId);
        await fetchLiveData();
      } catch (e) { console.error(e); }
    })();
  };

  const createBranch = (name: string, code: string, location_estate: string, contact_phone: string) => {
    (async () => {
      try {
        const supabase = createClient();
        await supabase.from('branches').insert({ name, code, location_estate, contact_phone, is_active: true });
        await fetchLiveData();
      } catch (e) { console.error(e); }
    })();
  };

  const createShiftReport = async (data: Omit<ShiftZReport, 'id' | 'report_number' | 'closed_at'>): Promise<ShiftZReport> => {
    // Store locally for now; persist to DB if shift_reports table exists.
    const closedAt = new Date().toISOString();
    const count = shiftReports.length + 1;
    const branchCode = branches.find((b) => b.id === data.branch_id)?.code.split('-')[0] || 'STN';
    const reportNumber = `Z-${branchCode}-${data.shift_date.replace(/-/g, '')}-${String(count).padStart(2, '0')}`;
    const report: ShiftZReport = { ...data, id: crypto.randomUUID(), report_number: reportNumber, closed_at: closedAt };
    setShiftReports((prev) => [report, ...prev]);
    return report;
  };

  const resetDemoData = () => {
    // No-op: live data only
  };

  const logout = () => {
    setCurrentUser(null);
    clearDemoSessionCookies();
    try {
      localStorage.removeItem('gwg_user');
      localStorage.removeItem('gwg_demo_user_id');
    } catch {}
    try {
      const supabase = createClient();
      void supabase.auth.signOut();
    } catch {}
    if (typeof window !== 'undefined') window.location.href = '/login';
  };

  const leaderboard: RiderLeaderboardEntry[] = staffList
    .filter((s) => s.role === 'rider' && s.approval_status === 'approved')
    .map((r) => {
      const riderOrders = orders.filter((o) => o.rider_id === r.id || o.rider_ids?.includes(r.id));
      const completed = riderOrders.filter((o) => o.delivery_status === 'delivered');
      const active = riderOrders.filter((o) => o.delivery_status === 'in_transit' || o.delivery_status === 'assigned');
      let totalMinutes = 0;
      let countWithTiming = 0;
      completed.forEach((o) => {
        if (o.assigned_at && o.delivered_at) {
          const diffMin = Math.round((new Date(o.delivered_at).getTime() - new Date(o.assigned_at).getTime()) / 60000);
          if (diffMin > 0) { totalMinutes += diffMin; countWithTiming += 1; }
        }
      });
      return {
        rider_id: r.id,
        rider_name: r.full_name,
        vehicle_plate: r.vehicle_plate,
        total_assigned: riderOrders.length,
        completed_deliveries: completed.length,
        active_deliveries: active.length,
        avg_delivery_minutes: countWithTiming > 0 ? Math.round(totalMinutes / countWithTiming) : 0,
      };
    })
    .sort((a, b) => b.completed_deliveries - a.completed_deliveries);

  if (!isLoaded) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">Loading…</div>;
  }

  return (
    <StoreContext.Provider
      value={{
        currentUser,
        setCurrentUser,
        staffList,
        branches,
        products,
        inventory,
        orders,
        customers,
        leaderboard,
        shiftReports,
        signupStaff,
        approveStaff,
        rejectStaff,
        createOrder,
        createCustomer,
        addCustomerPhone,
        addCustomerLocation,
        assignRider,
        updateDeliveryStatus,
        updateRiderComment,
        updateBranchStock,
        createBranch,
        createShiftReport,
        resetDemoData,
        logout,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
}
