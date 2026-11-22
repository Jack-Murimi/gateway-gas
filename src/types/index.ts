export type UserRole = 'admin' | 'director' | 'operator' | 'sales_rep' | 'rider' | 'pending';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type OrderType = 'refill' | 'complete' | 'accessory';
export type DeliveryStatus = 'pending' | 'assigned' | 'in_transit' | 'delivered' | 'cancelled';
export type PaymentMethod = 'mpesa' | 'cash' | 'bank_transfer' | 'pdq' | 'cheque';
export type PaymentStatus = 'pending' | 'paid';
export type ExpenseCategory =
  | 'fuel'
  | 'bike_service'
  | 'salary'
  | 'rent'
  | 'utilities'
  | 'office_supplies'
  | 'licenses_permits'
  | 'other';
export type ExpenseStatus = 'posted' | 'void';

export interface Bike {
  id: string;
  plate_number: string;
  model?: string | null;
  branch_id?: string | null;
  assigned_rider_id?: string | null;
  is_active: boolean;
  notes?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  branch?: { id: string; name: string; code: string } | null;
  assigned_rider?: { id: string; full_name: string; phone?: string | null } | null;
}

export interface Expense {
  id: string;
  expense_date: string;
  category: ExpenseCategory;
  amount_kes: number;
  payment_method: PaymentMethod;
  payment_reference?: string | null;
  branch_id?: string | null;
  bike_id?: string | null;
  staff_id?: string | null;
  vendor_name?: string | null;
  description: string;
  fuel_litres?: number | null;
  odometer_km?: number | null;
  salary_period?: string | null;
  notes?: string | null;
  status: ExpenseStatus;
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
  bike?: { id: string; plate_number: string; model?: string | null } | null;
  branch?: { id: string; name: string; code: string } | null;
  staff?: { id: string; full_name: string; role: UserRole } | null;
  recorder?: { id: string; full_name: string } | null;
}

export interface Branch {
  id: string; name: string; code: string; location_estate: string; contact_phone: string;
  is_active: boolean; mpesa_shortcode?: string | null; created_at?: string;
}
export interface StaffProfile {
  id: string; email: string; full_name: string; phone?: string | null; role: UserRole;
  approval_status: ApprovalStatus; vehicle_plate?: string | null; avatar_url?: string | null;
  branch_id?: string | null; national_id?: string | null; notes?: string | null;
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
  quantity: number; unit_price_kes: number; unit_cost_kes?: number | null; subtotal_kes: number; branch_id?: string | null;
}
export interface CustomerPhone { id: string; customer_id: string; phone_number: string; is_primary: boolean; label?: string | null; }
export interface CustomerLocation {
  id: string; customer_id: string; estate: string; specific_address?: string | null; pin_location?: string | null; is_default: boolean;
}
export interface Customer {
  id: string; name: string; created_at: string; is_active?: boolean; updated_at?: string | null;
  phones: CustomerPhone[]; locations: CustomerLocation[];
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
  total_revenue_kes: number; unpaid_sales_count?: number; unpaid_total_kes?: number;
  mpesa_total_kes: number; cash_total_kes: number; bank_total_kes: number;
  expected_cash_kes: number; declared_cash_kes: number; cash_variance_kes: number;
  cylinders_sold_count: number; accessories_sold_count: number;
  cylinder_breakdown: Array<{brand:string;size_kg:number|null;full_sold:number;empty_in:number}>;
  notes?: string | null;
}
export interface ShiftDaySummary {
  total_sales_count: number;
  total_revenue_kes: number;
  unpaid_sales_count: number;
  unpaid_total_kes: number;
  mpesa_total_kes: number;
  cash_total_kes: number;
  bank_total_kes: number;
  cylinders_sold_count: number;
  accessories_sold_count: number;
  cylinder_breakdown: Array<{ brand: string; size_kg: number | null; full_sold: number; empty_in: number }>;
}
export type MpesaTransactionStatus = 'unmatched' | 'matched' | 'ignored';
export interface MpesaTransaction {
  id: string;
  trans_id: string;
  trans_time: string;
  trans_amount: number;
  business_short_code: string;
  bill_ref_number?: string | null;
  msisdn?: string | null;
  payer_name?: string | null;
  branch_id?: string | null;
  matched_order_id?: string | null;
  matched_at?: string | null;
  matched_by?: string | null;
  status: MpesaTransactionStatus;
  notes?: string | null;
  created_at: string;
  branch?: { id: string; name: string; code: string } | null;
  matched_order?: { id: string; order_number: string; receipt_number?: string | null; customer_name: string; total_kes: number } | null;
}
export interface FinancialSummary {
  start_date: string;
  end_date: string;
  branch_id: string | null;
  orders_count: number;
  paid_orders_count: number;
  unpaid_orders_count: number;
  revenue_billed_kes: number;
  revenue_collected_kes: number;
  revenue_unpaid_kes: number;
  cogs_kes: number;
  items_missing_cost_count: number;
  total_items_count: number;
  gross_profit_kes: number;
  gross_margin_pct: number;
  expenses_total_kes: number;
  expenses_hq_kes: number;
  expenses_by_category: Array<{ category: ExpenseCategory; total_kes: number; count: number }>;
  net_profit_kes: number;
  branch_breakdown: Array<{
    branch_id: string;
    branch_name: string;
    branch_code: string;
    orders_count: number;
    revenue_kes: number;
    collected_kes: number;
    cogs_kes: number;
    gross_profit_kes: number;
    expenses_kes: number;
    net_contribution_kes: number;
  }>;
  monthly_trend: Array<{
    month: string;
    label: string;
    revenue_kes: number;
    cogs_kes: number;
    gross_profit_kes: number;
    expenses_kes: number;
    net_profit_kes: number;
  }>;
  cashflow: {
    sales_cash_in_kes: number;
    sales_mpesa_in_kes: number;
    sales_bank_in_kes: number;
    total_inflows_kes: number;
    expenses_out_kes: number;
    supplier_payments_out_kes: number;
    net_cashflow_kes: number;
    total_receivables_kes: number;
    total_payables_kes: number;
  };
}
export interface RiderLeaderboardEntry {
  rider_id: string; rider_name: string; vehicle_plate?: string | null; total_assigned: number;
  completed_deliveries: number; active_deliveries: number; avg_delivery_minutes: number;
}
