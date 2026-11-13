export type UserRole = 'admin' | 'director' | 'operator' | 'sales_rep' | 'rider' | 'pending';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type OrderType = 'refill' | 'complete' | 'accessory';
export type DeliveryStatus = 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';
export type PaymentMethod = 'mpesa' | 'cash' | 'bank_transfer' | 'pdq' | 'cheque';
export type PaymentStatus = 'pending' | 'paid';

export interface Branch {
  id: string; name: string; code: string; location_estate: string; contact_phone: string;
  is_active: boolean; created_at?: string;
}
export interface StaffProfile {
  id: string; email: string; full_name: string; phone?: string | null; role: UserRole;
  approval_status: ApprovalStatus; vehicle_plate?: string | null; avatar_url?: string | null;
  created_at?: string; updated_at?: string;
}
export interface Product {
  id: string; name: string; brand: string; size_kg: number | null;
  category: 'cylinder' | 'accessory' | 'water'; refill_price_kes: number;
  complete_price_kes: number; accessory_price_kes: number; is_active: boolean;
}
export interface BranchInventory {
  id: string; branch_id: string; product_id: string; full_units: number; empty_units: number;
  updated_at?: string; product?: Product;
}
export interface OrderItem {
  id: string; order_id: string; product_id: string; order_type: OrderType;
  outgoing_brand: string; incoming_brand?: string | null; cylinder_size_kg?: number | null;
  quantity: number; unit_price_kes: number; subtotal_kes: number; branch_id?: string | null;
}
export interface CustomerPhone { id: string; customer_id: string; phone_number: string; is_primary: boolean; }
export interface CustomerLocation {
  id: string; customer_id: string; estate: string; specific_address?: string | null; is_default: boolean;
}
export interface Customer {
  id: string; name: string; created_at: string; phones: CustomerPhone[]; locations: CustomerLocation[];
}
export interface Order {
  id: string; order_number: string; receipt_number?: string | null; branch_id: string;
  sales_rep_id?: string | null; rider_id?: string | null; rider_ids?: string[]; vehicle_plate?: string | null;
  lpo_number?: string | null; sale_comment?: string | null; customer_id?: string | null;
  is_pos_walkin: boolean; customer_name: string; customer_phone: string;
  delivery_estate?: string | null; delivery_address?: string | null; delivery_status: DeliveryStatus;
  payment_method: PaymentMethod; payment_status: PaymentStatus; payment_reference?: string | null;
  rider_comment?: string | null; subtotal_kes: number; delivery_fee_kes: number; total_kes: number;
  assigned_at?: string | null; delivered_at?: string | null; created_at: string; updated_at?: string;
  branch?: Branch; items?: OrderItem[]; rider?: StaffProfile; sales_rep?: StaffProfile;
}
export interface ShiftZReport {
  id: string; report_number: string; branch_id: string; branch_name: string; operator_id: string;
  operator_name: string; shift_date: string; closed_at: string; total_sales_count: number;
  total_revenue_kes: number; mpesa_total_kes: number; cash_total_kes: number; bank_total_kes: number;
  expected_cash_kes: number; declared_cash_kes: number; cash_variance_kes: number;
  cylinders_sold_count: number; accessories_sold_count: number;
  cylinder_breakdown: Array<{brand:string;size_kg:number|null;full_sold:number;empty_in:number}>;
  notes?: string;
}
export interface RiderLeaderboardEntry {
  rider_id: string; rider_name: string; vehicle_plate?: string | null; total_assigned: number;
  completed_deliveries: number; active_deliveries: number; avg_delivery_minutes: number;
}
