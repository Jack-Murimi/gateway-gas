'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
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
  mpesa_transaction_id?: string | null;
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
  approveStaff: (staffId: string, role: UserRole) => Promise<void>;
  rejectStaff: (staffId: string) => Promise<void>;
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
  assignRider: (orderId: string, riderId: string) => Promise<void>;
  updateDeliveryStatus: (orderId: string, status: DeliveryStatus, comment?: string) => Promise<void>;
  updateRiderComment: (orderId: string, comment: string) => Promise<void>;
  refreshLiveData: () => Promise<void>;
  createBranch: (name: string, code: string, location_estate: string, contact_phone: string) => Promise<void>;
  createShiftReport: (data: {
    branch_id: string;
    shift_date: string;
    declared_cash_kes: number;
    notes?: string;
  }) => Promise<ShiftZReport>;
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
  const loadedForUserRef = useRef<string | null>(null);

  const mapProfile = (profile: any): StaffProfile => ({
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    phone: profile.phone ?? null,
    role: profile.role,
    approval_status: profile.approval_status,
    vehicle_plate: profile.vehicle_plate ?? null,
    avatar_url: profile.avatar_url ?? null,
    branch_id: profile.branch_id ?? null,
    national_id: profile.national_id ?? null,
    notes: profile.notes ?? null,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  });

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

  const fetchCoreData = useCallback(async () => {
    const supabase = createClient();
    const [branchesRes, productsRes, inventoryRes, ordersRes, staffRes, shiftRes] = await Promise.all([
      supabase.from('branches').select('*').eq('is_active', true).order('code'),
      supabase.from('products').select('*').eq('is_active', true).order('category').order('name'),
      supabase.from('branch_inventory').select('*'),
      supabase.from('orders').select('*, items:order_items(*)').order('created_at', { ascending: false }).limit(200),
      supabase.from('profiles').select('*').order('created_at', { ascending: true }),
      supabase.from('shift_reports').select('*').order('shift_date', { ascending: false }).order('closed_at', { ascending: false }).limit(60),
    ]);

    if (branchesRes.error) console.error('Failed to load branches:', branchesRes.error.message);
    else if (branchesRes.data) setBranches(branchesRes.data as Branch[]);

    if (productsRes.error) console.error('Failed to load products:', productsRes.error.message);
    else if (productsRes.data) setProducts(productsRes.data as Product[]);

    if (inventoryRes.error) console.error('Failed to load inventory:', inventoryRes.error.message);
    else if (inventoryRes.data) setInventory(inventoryRes.data as BranchInventory[]);

    if (ordersRes.error) console.error('Failed to load orders:', ordersRes.error.message);
    else if (ordersRes.data) setOrders(ordersRes.data as Order[]);

    if (staffRes.error) console.error('Failed to load staff:', staffRes.error.message);
    else if (staffRes.data) {
      const profiles = staffRes.data.map(mapProfile);
      setStaffList(profiles);
      setCurrentUser((prev) => {
        if (!prev) return prev;
        const fresh = profiles.find((p) => p.id === prev.id);
        return fresh ?? prev;
      });
    }

    if (!shiftRes.error && shiftRes.data) {
      setShiftReports(
        (shiftRes.data as any[]).map((r) => ({
          ...r,
          total_revenue_kes: Number(r.total_revenue_kes || 0),
          unpaid_total_kes: Number(r.unpaid_total_kes || 0),
          mpesa_total_kes: Number(r.mpesa_total_kes || 0),
          cash_total_kes: Number(r.cash_total_kes || 0),
          bank_total_kes: Number(r.bank_total_kes || 0),
          expected_cash_kes: Number(r.expected_cash_kes || 0),
          declared_cash_kes: Number(r.declared_cash_kes || 0),
          cash_variance_kes: Number(r.cash_variance_kes || 0),
          cylinder_breakdown: Array.isArray(r.cylinder_breakdown) ? r.cylinder_breakdown : [],
        })) as ShiftZReport[],
      );
    }
  }, []);

  const fetchLiveData = useCallback(async () => {
    try {
      await fetchCoreData();
      void refreshCustomers();
    } catch (e) {
      console.error('Failed to load live data', e);
    }
  }, [fetchCoreData, refreshCustomers]);

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

    const supabase = createClient();

    (async () => {
      let authenticatedUser: StaffProfile | null = null;
      try {
        const sessionRes = await withTimeout(supabase.auth.getSession(), 4000);
        const session = sessionRes && 'data' in sessionRes ? sessionRes.data.session : null;

        if (session?.user) {
          const profileRes = await withTimeout(
            supabase.from('profiles').select('*').eq('id', session.user.id).single(),
            4000
          );
          const profile = profileRes && 'data' in (profileRes as any) ? (profileRes as any).data : null;
          if (mounted && profile) {
            authenticatedUser = mapProfile(profile);
            setCurrentUser(authenticatedUser);
            setDemoSessionCookies(authenticatedUser.id, authenticatedUser.role, authenticatedUser.approval_status);
          }
        } else {
          clearDemoSessionCookies();
          if (mounted) setCurrentUser(null);
        }

        // Load core operational data (branches, products, inventory) promptly before unblocking UI
        // so branch pickers and POS stock are immediately populated on first paint.
        if (mounted && authenticatedUser && authenticatedUser.approval_status === 'approved') {
          loadedForUserRef.current = authenticatedUser.id;
          await withTimeout(fetchCoreData(), 3000);
        }
      } catch (e) {
        console.error('Store init error', e);
      } finally {
        if (mounted) setIsLoaded(true);
      }

      if (mounted && authenticatedUser && authenticatedUser.approval_status === 'approved') {
        void refreshCustomers();
      }
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;
      if (event === 'SIGNED_OUT') {
        loadedForUserRef.current = null;
        setCurrentUser(null);
        setBranches([]);
        setProducts([]);
        setInventory([]);
        setOrders([]);
        setStaffList([]);
        setCustomers([]);
        clearDemoSessionCookies();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchCoreData, refreshCustomers]);

  // Ensure live data (branches, products, inventory, orders, staff, customers) loads right after
  // signing in via /login or switching into an approved account without requiring a full page reload.
  useEffect(() => {
    if (!currentUser || currentUser.approval_status !== 'approved') return;
    if (loadedForUserRef.current === currentUser.id) return;
    loadedForUserRef.current = currentUser.id;
    void fetchLiveData();
  }, [currentUser?.id, currentUser?.approval_status, fetchLiveData]);

  useEffect(() => {
    if (!currentUser || currentUser.approval_status !== 'approved') return;
    const sync = () => {
      if (navigator.onLine) void refreshCustomers();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') sync();
    };
    const interval = window.setInterval(sync, 5 * 60 * 1000);
    window.addEventListener('focus', sync);
    window.addEventListener('online', sync);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', sync);
      window.removeEventListener('online', sync);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [currentUser?.id, currentUser?.approval_status, refreshCustomers]);

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

  const approveStaff = async (staffId: string, role: UserRole) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ role, approval_status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', staffId);
    if (error) throw new Error(error.message || 'Failed to approve staff member.');
    await fetchLiveData();
    if (currentUser?.id === staffId) {
      setCurrentUser((prev) => (prev ? { ...prev, role, approval_status: 'approved' } : null));
      setDemoSessionCookies(staffId, role, 'approved');
    }
  };

  const rejectStaff = async (staffId: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({ approval_status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', staffId);
    if (error) throw new Error(error.message || 'Failed to suspend staff member.');
    await fetchLiveData();
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
      mpesa_transaction_id: params.mpesa_transaction_id || null,
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
    const [{ data: phoneRow, error: phoneError }, { data: locRow, error: locError }] = await Promise.all([
      supabase.from('customer_phones').insert({ customer_id: customer.id, phone_number: trimmedPhone, is_primary: true }).select('*').single(),
      supabase.from('customer_locations').insert({ customer_id: customer.id, estate: trimmedEstate, specific_address: specificAddress?.trim() || null, is_default: true }).select('*').single(),
    ]);
    if (phoneError) throw phoneError;
    if (locError) throw locError;
    const created: Customer = {
      ...(customer as any),
      phones: [phoneRow ? (phoneRow as CustomerPhone) : { id: crypto.randomUUID(), customer_id: customer.id, phone_number: trimmedPhone, is_primary: true }],
      locations: [locRow ? (locRow as CustomerLocation) : { id: crypto.randomUUID(), customer_id: customer.id, estate: trimmedEstate, specific_address: specificAddress?.trim() || null, is_default: true }],
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
    const { data: insertedPhone, error } = await supabase
      .from('customer_phones')
      .insert({ customer_id: customerId, phone_number: trimmed, is_primary: makePrimary, label: label?.trim() || null })
      .select('*')
      .single();
    if (error) throw error;
    const newPhone: CustomerPhone = insertedPhone
      ? (insertedPhone as CustomerPhone)
      : { id: crypto.randomUUID(), customer_id: customerId, phone_number: trimmed, is_primary: makePrimary, label: label?.trim() || null };
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
    const { data: insertedLoc, error } = await supabase
      .from('customer_locations')
      .insert({ customer_id: customerId, estate: trimmed, specific_address: specificAddress?.trim() || null, is_default: makeDefault })
      .select('*')
      .single();
    if (error) throw error;
    const newLocation: CustomerLocation = insertedLoc
      ? (insertedLoc as CustomerLocation)
      : { id: crypto.randomUUID(), customer_id: customerId, estate: trimmed, specific_address: specificAddress?.trim() || null, is_default: makeDefault };
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

  const assignRider = async (orderId: string, riderId: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('orders')
      .update({ rider_id: riderId, rider_ids: [riderId], delivery_status: 'assigned', assigned_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', orderId);
    if (error) throw new Error(error.message || 'Failed to assign rider.');
    await fetchLiveData();
  };

  const updateDeliveryStatus = async (orderId: string, status: DeliveryStatus, comment?: string) => {
    if (status === 'cancelled') {
      await cancelOrder(orderId, comment);
      return;
    }
    const supabase = createClient();
    const patch: Record<string, unknown> = { delivery_status: status, updated_at: new Date().toISOString() };
    if (comment !== undefined) patch.rider_comment = comment;
    if (status === 'delivered') patch.delivered_at = new Date().toISOString();
    const { error } = await supabase.from('orders').update(patch).eq('id', orderId);
    if (error) throw new Error(error.message || 'Failed to update delivery status.');
    await fetchLiveData();
  };

  const updateRiderComment = async (orderId: string, comment: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('orders').update({ rider_comment: comment, updated_at: new Date().toISOString() }).eq('id', orderId);
    if (error) throw new Error(error.message || 'Failed to save delivery note.');
    await fetchLiveData();
  };

  const createBranch = async (name: string, code: string, location_estate: string, contact_phone: string) => {
    const supabase = createClient();
    const { error } = await supabase.from('branches').insert({ name, code, location_estate, contact_phone, is_active: true });
    if (error) throw new Error(error.message || 'Failed to create branch.');
    await fetchLiveData();
  };

  const createShiftReport = async (data: {
    branch_id: string;
    shift_date: string;
    declared_cash_kes: number;
    notes?: string;
  }): Promise<ShiftZReport> => {
    const supabase = createClient();
    const { data: saved, error } = await supabase.rpc('close_shift_report', {
      p_branch_id: data.branch_id,
      p_shift_date: data.shift_date,
      p_declared_cash_kes: data.declared_cash_kes,
      p_notes: data.notes?.trim() || null,
    });
    if (error || !saved) {
      throw new Error(error?.message || 'Failed to save shift close report.');
    }
    const r = saved as any;
    const report: ShiftZReport = {
      ...r,
      total_revenue_kes: Number(r.total_revenue_kes || 0),
      unpaid_total_kes: Number(r.unpaid_total_kes || 0),
      mpesa_total_kes: Number(r.mpesa_total_kes || 0),
      cash_total_kes: Number(r.cash_total_kes || 0),
      bank_total_kes: Number(r.bank_total_kes || 0),
      expected_cash_kes: Number(r.expected_cash_kes || 0),
      declared_cash_kes: Number(r.declared_cash_kes || 0),
      cash_variance_kes: Number(r.cash_variance_kes || 0),
      cylinder_breakdown: Array.isArray(r.cylinder_breakdown) ? r.cylinder_breakdown : [],
    };
    setShiftReports((prev) => [report, ...prev.filter((item) => item.id !== report.id)]);
    return report;
  };

  const resetDemoData = () => {
    // No-op: live data only
  };

  const logout = () => {
    loadedForUserRef.current = null;
    setCurrentUser(null);
    clearDemoSessionCookies();
    setBranches([]);
    setProducts([]);
    setInventory([]);
    setOrders([]);
    setStaffList([]);
    setCustomers([]);
    setShiftReports([]);
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
