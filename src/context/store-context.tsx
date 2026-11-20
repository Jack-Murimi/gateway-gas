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
import { Skeleton } from '@/components/ui/skeleton';
import { setDemoSessionCookies, clearDemoSessionCookies } from '@/lib/demo-mode';
import { clearCustomerCache, prepareCustomerCache, readCachedCustomers, syncCustomerCache, upsertCachedCustomer, patchCachedCustomer } from '@/lib/customer-cache';

interface CreateOrderParams {
  client_request_id?: string;
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
  customersLoading: boolean;
  customersError: string | null;
  refreshCustomers: (forceFull?: boolean) => Promise<void>;
  customerSyncProgress: { done: number; total: number; initial: boolean } | null;
  customerCacheAvailable: boolean;
  leaderboard: RiderLeaderboardEntry[];
  shiftReports: ShiftZReport[];
  signupStaff: (email: string, password: string, full_name: string, phone: string, vehicle_plate?: string) => Promise<{ success: boolean; message: string }>;
  approveStaff: (staffId: string, role: UserRole) => void;
  rejectStaff: (staffId: string) => void;
  createOrder: (params: CreateOrderParams) => Promise<Order>;
  cancelOrder: (orderId: string, reason?: string) => Promise<void>;
  createCustomer: (name: string, phone: string, estate: string, specificAddress?: string) => Promise<Customer>;
  updateCustomer: (customerId: string, name: string) => Promise<void>;
  setCustomerActive: (customerId: string, isActive: boolean) => Promise<void>;
  addCustomerPhone: (customerId: string, phone: string, makePrimary?: boolean, label?: string) => Promise<void>;
  updateCustomerPhone: (customerId: string, phoneId: string, updates: { label?: string | null; is_primary?: boolean }) => Promise<void>;
  removeCustomerPhone: (customerId: string, phoneId: string) => Promise<void>;
  addCustomerLocation: (customerId: string, estate: string, specificAddress?: string, makeDefault?: boolean) => Promise<void>;
  updateCustomerLocation: (customerId: string, locationId: string, updates: { estate?: string; specific_address?: string | null; is_default?: boolean }) => Promise<void>;
  removeCustomerLocation: (customerId: string, locationId: string) => Promise<void>;
  assignRider: (orderId: string, riderId: string) => void;
  updateDeliveryStatus: (orderId: string, status: DeliveryStatus, comment?: string) => void;
  updateRiderComment: (orderId: string, comment: string) => void;
  refreshLiveData: () => Promise<void>;
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
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [customerSyncProgress, setCustomerSyncProgress] = useState<{ done: number; total: number; initial: boolean } | null>(null);
  const [customerCacheAvailable, setCustomerCacheAvailable] = useState(true);
  const [shiftReports, setShiftReports] = useState<ShiftZReport[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const refreshCustomers = useCallback(async (forceFull = false) => {
    setCustomersError(null);
    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getSession();
      const userId = authData.session?.user?.id;
      if (!userId) throw new Error('Sign in to load customer accounts.');
      try {
        await prepareCustomerCache(userId);
        const cached = await readCachedCustomers();
        if (cached.length) setCustomers(cached);
        setCustomerCacheAvailable(true);
        setCustomersLoading(cached.length === 0);
        if (!navigator.onLine) {
          if (!cached.length) setCustomersError('Connect to the internet for the first customer download.');
          return;
        }
        await syncCustomerCache(supabase, (done, total, initial) => {
          setCustomerSyncProgress({ done, total, initial });
        }, forceFull);
        setCustomers(await readCachedCustomers());
        setCustomerSyncProgress(null);
      } catch (cacheError) {
        console.warn('Customer cache unavailable; using limited online fallback.', cacheError);
        setCustomerCacheAvailable(false);
        const { data, error } = await supabase.from('customer_directory_sync')
          .select('id,name,is_active,created_at,updated_at,phones,locations,deleted_at')
          .is('deleted_at', null).order('updated_at', { ascending: false }).limit(20);
        if (error) throw error;
        setCustomers((data || []).map((row: any) => ({
          id: row.id, name: row.name || '', created_at: row.created_at || row.updated_at,
          updated_at: row.updated_at, is_active: row.is_active,
          phones: row.phones || [], locations: row.locations || [],
        })) as Customer[]);
      }
    } catch (error) {
      console.error('Failed to sync customers', error);
      setCustomersError(error instanceof Error ? error.message : 'Could not load customers.');
    } finally {
      setCustomersLoading(false);
      setCustomerSyncProgress(null);
    }
  }, []);

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

      await refreshCustomers();
    } catch (e) {
      console.error('Failed to load live data', e);
    }
  }, [refreshCustomers]);

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

  useEffect(() => {
    if (!currentUser) return;
    const sync = () => { if (navigator.onLine) void refreshCustomers(); };
    const interval = window.setInterval(sync, 5 * 60 * 1000);
    window.addEventListener('focus', sync);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [currentUser?.id, refreshCustomers]);

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

  const createOrder = async (params: CreateOrderParams): Promise<Order> => {
    const supabase = createClient();

    const p_order = {
      client_request_id: params.client_request_id || null,
      customer_id: params.customer_id || null,
      branch_id: params.branch_id,
      is_pos_walkin: params.is_pos_walkin,
      rider_ids: params.rider_ids || [],
      vehicle_plate: params.vehicle_plate || null,
      receipt_number: params.receipt_number || null,
      lpo_number: params.lpo_number || null,
      sale_comment: params.sale_comment || null,
      customer_name: params.customer_name,
      customer_phone: params.customer_phone,
      delivery_estate: params.delivery_estate || null,
      delivery_address: params.delivery_address || null,
      payment_method: params.payment_method,
      payment_status: params.payment_status,
      payment_reference: params.payment_reference || null,
      delivery_fee_kes: params.delivery_fee_kes,
      created_at: params.created_at || new Date().toISOString(),
    };

    const p_items = params.items.map((item) => ({
      product_id: item.product_id,
      branch_id: item.branch_id || params.branch_id,
      order_type: item.order_type,
      outgoing_brand: item.outgoing_brand,
      incoming_brand: item.incoming_brand || null,
      cylinder_size_kg: item.cylinder_size_kg ?? null,
      quantity: item.quantity,
      unit_price_kes: item.unit_price_kes,
    }));

    const { data: orderId, error } = await supabase.rpc('create_pos_order', {
      p_order,
      p_items,
    });

    if (error || !orderId) {
      if (error?.code === 'PGRST202') {
        throw new Error('Database update required: apply migration 20261120010000_stock_integrity_and_atomic_sales.sql in Supabase.');
      }
      throw new Error(error?.message || 'Failed to record sale.');
    }

    await fetchLiveData();
    const { data: refreshed } = await supabase
      .from('orders')
      .select('*, items:order_items(*)')
      .eq('id', orderId)
      .single();

    if (!refreshed) {
      throw new Error('Sale recorded, but could not reload order details.');
    }
    return refreshed as Order;
  };

  const cancelOrder = async (orderId: string, reason?: string): Promise<void> => {
    const supabase = createClient();
    const { error } = await supabase.rpc('cancel_order', {
      p_order_id: orderId,
      p_reason: reason?.trim() || null,
    });
    if (error) {
      if (error.code === 'PGRST202') {
        throw new Error('Database update required: apply migration 20261120010000_stock_integrity_and_atomic_sales.sql in Supabase.');
      }
      throw new Error(error.message || 'Failed to cancel order.');
    }
    await fetchLiveData();
  };

  const createCustomer = async (name: string, phone: string, estate: string, specificAddress?: string): Promise<Customer> => {
    const supabase = createClient();
    const trimmedName = name.trim() || null;
    const trimmedPhone = phone.trim();
    const trimmedEstate = estate.trim();
    if (!trimmedPhone || !trimmedEstate) throw new Error('Phone number and location are required.');
    const { data: customer, error } = await supabase
      .from('customers')
      .insert({ name: trimmedName, is_active: true })
      .select('id,name,created_at,is_active,updated_at')
      .single();
    if (error || !customer) throw error || new Error('Failed to create customer');
    const [{ error: phoneError }, { error: locError }] = await Promise.all([
      supabase.from('customer_phones').insert({ customer_id: customer.id, phone_number: trimmedPhone, is_primary: true }),
      supabase.from('customer_locations').insert({ customer_id: customer.id, estate: trimmedEstate, specific_address: specificAddress?.trim() || null, is_default: true }),
    ]);
    if (phoneError) throw phoneError;
    if (locError) throw locError;
    const created: Customer = {
      ...(customer as any),
      phones: [{ id: crypto.randomUUID(), customer_id: customer.id, phone_number: trimmedPhone, is_primary: true }],
      locations: [{ id: crypto.randomUUID(), customer_id: customer.id, estate: trimmedEstate, specific_address: specificAddress?.trim() || null, is_default: true }],
    };
    await upsertCachedCustomer(created);
    setCustomers(await readCachedCustomers());
    void refreshCustomers();
    return created;
  };

  const updateCustomer = async (customerId: string, name: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('customers').update({ name: name.trim() || null, updated_at: new Date().toISOString() }).eq('id', customerId);
    if (error) throw error;
    const now = new Date().toISOString();
    await patchCachedCustomer(customerId, { name: name.trim() || null, updated_at: now });
    setCustomers(prev => prev.map(customer => customer.id === customerId ? { ...customer, name: name.trim(), updated_at: now } : customer));
    await refreshCustomers();
  };

  const setCustomerActive = async (customerId: string, isActive: boolean) => {
    const supabase = createClient();
    const { error } = await supabase.from('customers').update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', customerId);
    if (error) throw error;
    const now = new Date().toISOString();
    await patchCachedCustomer(customerId, { status: isActive ? 'active' : 'inactive', updated_at: now });
    setCustomers(prev => prev.map(customer => customer.id === customerId ? { ...customer, is_active: isActive, updated_at: now } : customer));
    await refreshCustomers();
  };

  const addCustomerPhone = async (customerId: string, phone: string, makePrimary = false, label?: string) => {
    const supabase = createClient();
    const trimmed = phone.trim();
    if (!trimmed) throw new Error('Phone number is required.');
    if (makePrimary) await supabase.from('customer_phones').update({ is_primary: false }).eq('customer_id', customerId);
    const { error } = await supabase.from('customer_phones').insert({ customer_id: customerId, phone_number: trimmed, is_primary: makePrimary, label: label?.trim() || null });
    if (error) throw error;
    const newPhone: CustomerPhone = { id: crypto.randomUUID(), customer_id: customerId, phone_number: trimmed, is_primary: makePrimary, label: label?.trim() || null };
    const now = new Date().toISOString();
    const current = customers.find(customer => customer.id === customerId);
    if (current) {
      const nextPhones = [...(makePrimary ? current.phones.map(p => ({ ...p, is_primary: false })) : current.phones), newPhone];
      await patchCachedCustomer(customerId, { phones: nextPhones, updated_at: now });
      setCustomers(prev => prev.map(customer => customer.id === customerId ? { ...customer, phones: nextPhones, updated_at: now } : customer));
    }
    await refreshCustomers();
  };

  const addCustomerLocation = async (customerId: string, estate: string, specificAddress?: string, makeDefault = false) => {
    const supabase = createClient();
    const trimmed = estate.trim();
    if (!trimmed) throw new Error('Location is required.');
    if (makeDefault) await supabase.from('customer_locations').update({ is_default: false }).eq('customer_id', customerId);
    const { error } = await supabase.from('customer_locations').insert({ customer_id: customerId, estate: trimmed, specific_address: specificAddress?.trim() || null, is_default: makeDefault });
    if (error) throw error;
    const newLocation: CustomerLocation = { id: crypto.randomUUID(), customer_id: customerId, estate: trimmed, specific_address: specificAddress?.trim() || null, is_default: makeDefault };
    const now = new Date().toISOString();
    const current = customers.find(customer => customer.id === customerId);
    if (current) {
      const nextLocations = [...(makeDefault ? current.locations.map(l => ({ ...l, is_default: false })) : current.locations), newLocation];
      await patchCachedCustomer(customerId, { locations: nextLocations, updated_at: now });
      setCustomers(prev => prev.map(customer => customer.id === customerId ? { ...customer, locations: nextLocations, updated_at: now } : customer));
    }
    await refreshCustomers();
  };

  const updateCustomerPhone = async (customerId: string, phoneId: string, updates: { label?: string | null; is_primary?: boolean }) => {
    const supabase = createClient();
    const patch: Record<string, unknown> = {};
    if ('label' in updates) patch.label = updates.label ?? null;
    if (updates.is_primary) {
      await supabase.from('customer_phones').update({ is_primary: false }).eq('customer_id', customerId);
      patch.is_primary = true;
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('customer_phones').update(patch).eq('id', phoneId);
      if (error) throw error;
    }
    const now = new Date().toISOString();
    const current = customers.find(c => c.id === customerId);
    if (current) {
      const nextPhones = current.phones.map(p => {
        if (updates.is_primary) p = { ...p, is_primary: p.id === phoneId };
        if (p.id === phoneId && 'label' in updates) p = { ...p, label: updates.label };
        return p;
      });
      await patchCachedCustomer(customerId, { phones: nextPhones, updated_at: now });
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, phones: nextPhones, updated_at: now } : c));
    }
    await refreshCustomers();
  };

  const removeCustomerPhone = async (customerId: string, phoneId: string) => {
    const supabase = createClient();
    const current = customers.find(c => c.id === customerId);
    if (current && current.phones.length <= 1) throw new Error('Cannot remove the only phone number.');
    const { error } = await supabase.from('customer_phones').delete().eq('id', phoneId);
    if (error) throw error;
    const now = new Date().toISOString();
    if (current) {
      let nextPhones = current.phones.filter(p => p.id !== phoneId);
      if (nextPhones.length > 0 && !nextPhones.some(p => p.is_primary)) {
        nextPhones = [{ ...nextPhones[0], is_primary: true }, ...nextPhones.slice(1)];
        await supabase.from('customer_phones').update({ is_primary: true }).eq('id', nextPhones[0].id);
      }
      await patchCachedCustomer(customerId, { phones: nextPhones, updated_at: now });
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, phones: nextPhones, updated_at: now } : c));
    }
    await refreshCustomers();
  };

  const updateCustomerLocation = async (customerId: string, locationId: string, updates: { estate?: string; specific_address?: string | null; is_default?: boolean }) => {
    const supabase = createClient();
    const patch: Record<string, unknown> = {};
    if (updates.estate !== undefined) patch.estate = updates.estate.trim();
    if ('specific_address' in updates) patch.specific_address = updates.specific_address?.trim() || null;
    if (updates.is_default) {
      await supabase.from('customer_locations').update({ is_default: false }).eq('customer_id', customerId);
      patch.is_default = true;
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('customer_locations').update(patch).eq('id', locationId);
      if (error) throw error;
    }
    const now = new Date().toISOString();
    const current = customers.find(c => c.id === customerId);
    if (current) {
      const nextLocations = current.locations.map(l => {
        if (updates.is_default) l = { ...l, is_default: l.id === locationId };
        if (l.id === locationId) {
          if (updates.estate !== undefined) l = { ...l, estate: updates.estate.trim() };
          if ('specific_address' in updates) l = { ...l, specific_address: updates.specific_address?.trim() || null };
        }
        return l;
      });
      await patchCachedCustomer(customerId, { locations: nextLocations, updated_at: now });
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, locations: nextLocations, updated_at: now } : c));
    }
    await refreshCustomers();
  };

  const removeCustomerLocation = async (customerId: string, locationId: string) => {
    const supabase = createClient();
    const current = customers.find(c => c.id === customerId);
    if (current && current.locations.length <= 1) throw new Error('Cannot remove the only location.');
    const { error } = await supabase.from('customer_locations').delete().eq('id', locationId);
    if (error) throw error;
    const now = new Date().toISOString();
    if (current) {
      let nextLocations = current.locations.filter(l => l.id !== locationId);
      if (nextLocations.length > 0 && !nextLocations.some(l => l.is_default)) {
        nextLocations = [{ ...nextLocations[0], is_default: true }, ...nextLocations.slice(1)];
        await supabase.from('customer_locations').update({ is_default: true }).eq('id', nextLocations[0].id);
      }
      await patchCachedCustomer(customerId, { locations: nextLocations, updated_at: now });
      setCustomers(prev => prev.map(c => c.id === customerId ? { ...c, locations: nextLocations, updated_at: now } : c));
    }
    await refreshCustomers();
  };

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
    if (status === 'cancelled') {
      void cancelOrder(orderId, comment).catch((e) => console.error(e));
      return;
    }
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
    setCustomers([]);
    try {
      localStorage.removeItem('gwg_user');
      localStorage.removeItem('gwg_demo_user_id');
    } catch {}
    void (async () => {
      try {
        await clearCustomerCache();
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch (error) {
        console.error('Logout cleanup failed', error);
      } finally {
        if (typeof window !== 'undefined') window.location.href = '/login';
      }
    })();
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
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between px-3 sm:h-16 sm:px-5 lg:px-7">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-2.5 w-16 rounded" />
              </div>
            </div>
            <div className="hidden items-center gap-2 xl:flex">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-20 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>
        </div>
        <div className="mx-auto max-w-[1440px] space-y-3 px-3 py-4 sm:px-5 lg:px-7">
          <Skeleton className="h-11 w-full rounded-md" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
                <Skeleton className="h-3 w-24 rounded" />
                <Skeleton className="h-6 w-28 rounded" />
              </div>
            ))}
          </div>
          <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded" />
            ))}
          </div>
        </div>
      </div>
    );
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
        customersLoading,
        customersError,
        refreshCustomers,
        customerSyncProgress,
        customerCacheAvailable,
        leaderboard,
        shiftReports,
        signupStaff,
        approveStaff,
        rejectStaff,
        createOrder,
        cancelOrder,
        createCustomer,
        updateCustomer,
        setCustomerActive,
        addCustomerPhone,
        updateCustomerPhone,
        removeCustomerPhone,
        addCustomerLocation,
        updateCustomerLocation,
        removeCustomerLocation,
        assignRider,
        updateDeliveryStatus,
        updateRiderComment,
        refreshLiveData: fetchLiveData,
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
