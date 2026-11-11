'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
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
} from '@/types';
import {
  INITIAL_BRANCHES,
  INITIAL_PRODUCTS,
  INITIAL_STAFF,
  INITIAL_INVENTORY,
  INITIAL_ORDERS,
  INITIAL_LEADERBOARD,
  INITIAL_CUSTOMERS,
} from '@/lib/mock-data';

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
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_reference?: string;
  delivery_fee_kes: number;
  items: Array<{
    product_id: string;
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
  // Actions
  signupStaff: (email: string, full_name: string, phone: string, vehicle_plate?: string) => Promise<{ success: boolean; message: string }>;
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
  logout: () => void;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<StaffProfile | null>(null);
  const [staffList, setStaffList] = useState<StaffProfile[]>(INITIAL_STAFF);
  const [branches, setBranches] = useState<Branch[]>(INITIAL_BRANCHES);
  const [products] = useState<Product[]>(INITIAL_PRODUCTS);
  const [inventory, setInventory] = useState<BranchInventory[]>(INITIAL_INVENTORY);
  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [customers, setCustomers] = useState<Customer[]>(INITIAL_CUSTOMERS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize from localStorage or mock defaults
  useEffect(() => {
    try {
      const storedUser = localStorage.getItem('gwg_user');
      const storedStaff = localStorage.getItem('gwg_staff');
      const storedBranches = localStorage.getItem('gwg_branches');
      const storedInventory = localStorage.getItem('gwg_inventory');
      const storedOrders = localStorage.getItem('gwg_orders');
      const storedCustomers = localStorage.getItem('gwg_customers');

      if (storedUser) setCurrentUser(JSON.parse(storedUser));
      else setCurrentUser(INITIAL_STAFF[0]); // Default to admin for fast demo

      if (storedStaff) setStaffList(JSON.parse(storedStaff));
      if (storedBranches) setBranches(JSON.parse(storedBranches));
      if (storedInventory) setInventory(JSON.parse(storedInventory));
      if (storedOrders) setOrders(JSON.parse(storedOrders));
      if (storedCustomers) setCustomers(JSON.parse(storedCustomers));
    } catch {
      setCurrentUser(INITIAL_STAFF[0]);
    }
    setIsLoaded(true);
  }, []);

  // Save changes to localStorage
  useEffect(() => {
    if (!isLoaded) return;
    try {
      if (currentUser) localStorage.setItem('gwg_user', JSON.stringify(currentUser));
      else localStorage.removeItem('gwg_user');

      localStorage.setItem('gwg_staff', JSON.stringify(staffList));
      localStorage.setItem('gwg_branches', JSON.stringify(branches));
      localStorage.setItem('gwg_inventory', JSON.stringify(inventory));
      localStorage.setItem('gwg_orders', JSON.stringify(orders));
      localStorage.setItem('gwg_customers', JSON.stringify(customers));
    } catch {
      // quota or private mode fallback
    }
  }, [currentUser, staffList, branches, inventory, orders, customers, isLoaded]);

  // Staff signup
  const signupStaff = async (email: string, full_name: string, phone: string, vehicle_plate?: string) => {
    const existing = staffList.find((s) => s.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      return { success: false, message: 'An account with this email already exists.' };
    }

    const newStaff: StaffProfile = {
      id: `u-${Date.now()}`,
      email,
      full_name,
      phone,
      vehicle_plate: vehicle_plate || null,
      role: 'pending',
      approval_status: 'pending',
      created_at: new Date().toISOString(),
    };

    setStaffList((prev) => [...prev, newStaff]);
    setCurrentUser(newStaff);
    return { success: true, message: 'Account registered. Waiting for admin approval.' };
  };

  // Admin approves staff
  const approveStaff = (staffId: string, role: UserRole) => {
    setStaffList((prev) =>
      prev.map((s) => (s.id === staffId ? { ...s, role, approval_status: 'approved', updated_at: new Date().toISOString() } : s))
    );
    if (currentUser?.id === staffId) {
      setCurrentUser((prev) => (prev ? { ...prev, role, approval_status: 'approved' } : null));
    }
  };

  // Admin rejects staff
  const rejectStaff = (staffId: string) => {
    setStaffList((prev) =>
      prev.map((s) => (s.id === staffId ? { ...s, approval_status: 'rejected', updated_at: new Date().toISOString() } : s))
    );
  };

  // Stock update helper
  const updateBranchStock = (branchId: string, productId: string, fullDelta: number, emptyDelta: number) => {
    setInventory((prev) => {
      const idx = prev.findIndex((i) => i.branch_id === branchId && i.product_id === productId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          full_units: Math.max(0, copy[idx].full_units + fullDelta),
          empty_units: Math.max(0, copy[idx].empty_units + emptyDelta),
          updated_at: new Date().toISOString(),
        };
        return copy;
      } else {
        return [
          ...prev,
          {
            id: `inv-${Date.now()}`,
            branch_id: branchId,
            product_id: productId,
            full_units: Math.max(0, fullDelta),
            empty_units: Math.max(0, emptyDelta),
            updated_at: new Date().toISOString(),
          },
        ];
      }
    });
  };

  // Create Order / POS sale with brand swap & inventory reconciliation
  const createOrder = async (params: CreateOrderParams): Promise<Order> => {
    const orderNumber = `GWG-${Math.floor(1000 + Math.random() * 9000)}`;
    const orderId = `ord-${Date.now()}`;

    const items: OrderItem[] = params.items.map((item, idx) => ({
      id: `item-${Date.now()}-${idx}`,
      order_id: orderId,
      product_id: item.product_id,
      order_type: item.order_type,
      outgoing_brand: item.outgoing_brand,
      incoming_brand: item.incoming_brand || null,
      cylinder_size_kg: item.cylinder_size_kg || null,
      quantity: item.quantity,
      unit_price_kes: item.unit_price_kes,
      subtotal_kes: item.quantity * item.unit_price_kes,
    }));

    const subtotal = items.reduce((acc, i) => acc + i.subtotal_kes, 0);
    const total = subtotal + params.delivery_fee_kes;

    const newOrder: Order = {
      id: orderId,
      order_number: orderNumber,
      receipt_number: params.receipt_number || null,
      branch_id: params.branch_id,
      sales_rep_id: currentUser?.id || null,
      rider_id: null,
      customer_id: params.customer_id || null,
      is_pos_walkin: params.is_pos_walkin,
      customer_name: params.customer_name,
      customer_phone: params.customer_phone,
      delivery_estate: params.delivery_estate || null,
      delivery_address: params.delivery_address || null,
      delivery_status: params.is_pos_walkin ? 'delivered' : 'pending',
      payment_method: params.payment_method,
      payment_status: params.payment_status,
      payment_reference: params.payment_reference || null,
      rider_comment: null,
      subtotal_kes: subtotal,
      delivery_fee_kes: params.delivery_fee_kes,
      total_kes: total,
      delivered_at: params.is_pos_walkin ? new Date().toISOString() : null,
      created_at: params.created_at || new Date().toISOString(),
      items,
    };

    // Deduct stock in branch:
    // 1. Outgoing product: deduct full_units
    // 2. If refill with brand swap: add empty_units for incoming brand
    items.forEach((item) => {
      // Deduct full units of the outgoing product
      updateBranchStock(params.branch_id, item.product_id, -item.quantity, 0);

      // If refill and incoming brand differs, find matching product for incoming brand and increment its empties
      if (item.order_type === 'refill' && item.incoming_brand && item.cylinder_size_kg) {
        const incomingProduct = products.find(
          (p) => p.brand.toLowerCase() === item.incoming_brand!.toLowerCase() && p.size_kg === item.cylinder_size_kg
        );
        if (incomingProduct) {
          updateBranchStock(params.branch_id, incomingProduct.id, 0, item.quantity);
        } else {
          // If no separate brand row, add empties to current product
          updateBranchStock(params.branch_id, item.product_id, 0, item.quantity);
        }
      }
    });

    setOrders((prev) => [newOrder, ...prev]);
    return newOrder;
  };

  // Assign Rider to order
  const assignRider = (orderId: string, riderId: string) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? {
              ...o,
              rider_id: riderId,
              delivery_status: 'assigned',
              assigned_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
          : o
      )
    );
  };

  // Update Delivery Status (Rider or Operator)
  const updateDeliveryStatus = (orderId: string, status: DeliveryStatus, comment?: string) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        return {
          ...o,
          delivery_status: status,
          rider_comment: comment !== undefined ? comment : o.rider_comment,
          delivered_at: status === 'delivered' ? new Date().toISOString() : o.delivered_at,
          updated_at: new Date().toISOString(),
        };
      })
    );
  };

  // Rider updates comment
  const updateRiderComment = (orderId: string, comment: string) => {
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, rider_comment: comment, updated_at: new Date().toISOString() } : o))
    );
  };

  // Add Branch
  const createBranch = (name: string, code: string, location_estate: string, contact_phone: string) => {
    const newBranch: Branch = {
      id: `b-${Date.now()}`,
      name,
      code,
      location_estate,
      contact_phone,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    setBranches((prev) => [...prev, newBranch]);
  };

  // Customers
  const createCustomer = (name: string, phone: string, estate: string, specificAddress?: string): Customer => {
    const custId = `cust-${Date.now()}`;
    const newCust: Customer = {
      id: custId,
      name,
      created_at: new Date().toISOString(),
      phones: [
        {
          id: `cp-${Date.now()}`,
          customer_id: custId,
          phone_number: phone,
          is_primary: true,
        },
      ],
      locations: [
        {
          id: `cl-${Date.now()}`,
          customer_id: custId,
          estate,
          specific_address: specificAddress || null,
          is_default: true,
        },
      ],
    };
    setCustomers((prev) => [newCust, ...prev]);
    return newCust;
  };

  const addCustomerPhone = (customerId: string, phone: string) => {
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === customerId
          ? {
              ...c,
              phones: [
                ...c.phones,
                {
                  id: `cp-${Date.now()}`,
                  customer_id: customerId,
                  phone_number: phone,
                  is_primary: c.phones.length === 0,
                },
              ],
            }
          : c
      )
    );
  };

  const addCustomerLocation = (customerId: string, estate: string, specificAddress?: string) => {
    setCustomers((prev) =>
      prev.map((c) =>
        c.id === customerId
          ? {
              ...c,
              locations: [
                ...c.locations,
                {
                  id: `cl-${Date.now()}`,
                  customer_id: customerId,
                  estate,
                  specific_address: specificAddress || null,
                  is_default: c.locations.length === 0,
                },
              ],
            }
          : c
      )
    );
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('gwg_user');
  };

  // Compute live rider performance leaderboard (strictly zero revenue/money columns)
  const leaderboard: RiderLeaderboardEntry[] = staffList
    .filter((s) => s.role === 'rider' && s.approval_status === 'approved')
    .map((r) => {
      const riderOrders = orders.filter((o) => o.rider_id === r.id);
      const completed = riderOrders.filter((o) => o.delivery_status === 'delivered');
      const active = riderOrders.filter((o) => o.delivery_status === 'in_transit' || o.delivery_status === 'assigned');

      let totalMinutes = 0;
      let countWithTiming = 0;
      completed.forEach((o) => {
        if (o.assigned_at && o.delivered_at) {
          const diffMin = Math.round((new Date(o.delivered_at).getTime() - new Date(o.assigned_at).getTime()) / 60000);
          if (diffMin > 0) {
            totalMinutes += diffMin;
            countWithTiming += 1;
          }
        }
      });

      const avg_delivery_minutes = countWithTiming > 0 ? Math.round(totalMinutes / countWithTiming) : 25;

      return {
        rider_id: r.id,
        rider_name: r.full_name,
        vehicle_plate: r.vehicle_plate,
        total_assigned: riderOrders.length,
        completed_deliveries: completed.length,
        active_deliveries: active.length,
        avg_delivery_minutes,
      };
    })
    .sort((a, b) => b.completed_deliveries - a.completed_deliveries);

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
