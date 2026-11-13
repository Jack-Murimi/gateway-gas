'use client';

import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle, CheckCircle2, FileText, Package, Plus, Save, Search, Trash2, X,
} from 'lucide-react';
import type { Branch, BranchInventory, Customer, OrderType, PaymentMethod, PaymentStatus, Product, StaffProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { formatKES, hasEmptyState } from '@/lib/formatters';

export interface PosLine {
  id: string;
  productId: string;
  productName: string;
  orderType: OrderType;
  outgoingBrand: string;
  incomingBrand: string;
  cylinderSizeKg: number | null;
  quantity: number;
  unitPrice: number;
  branchId: string;
}

export interface PosSaleSubmission {
  branch_id: string;
  is_pos_walkin: boolean;
  customer_id: string | null;
  receipt_number: string;
  created_at: string;
  customer_name: string;
  customer_phone: string;
  delivery_estate?: string;
  delivery_address?: string;
  rider_ids: string[];
  vehicle_plate?: string | null;
  lpo_number?: string;
  sale_comment?: string;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  payment_reference?: string;
  delivery_fee_kes: number;
  items: Array<{
    product_id: string; branch_id: string; order_type: OrderType; outgoing_brand: string;
    incoming_brand?: string; cylinder_size_kg: number | null; quantity: number; unit_price_kes: number;
  }>;
}

interface PosWorkspaceProps {
  branches: Branch[];
  products: Product[];
  inventory: BranchInventory[];
  customers: Customer[];
  staffList: StaffProfile[];
  currentUser: StaffProfile;
  createCustomer: (name: string, phone: string, estate: string, address?: string) => Customer;
  onSubmit: (sale: PosSaleSubmission) => Promise<void>;
  isSubmitting: boolean;
  completedOrderNumber: string | null;
  onStartNextSale: () => void;
}

const fieldClass = 'min-h-9 w-full rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500/20 disabled:bg-slate-100';
const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500';

export function PosWorkspace({
  branches, products, inventory, customers, staffList, currentUser, createCustomer, onSubmit,
  isSubmitting, completedOrderNumber, onStartNextSale,
}: PosWorkspaceProps) {
  const today = () => {
    const d = new Date();
    return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  };
  const [branchId, setBranchId] = useState(branches[0]?.id || '');
  const [receiptDate, setReceiptDate] = useState(today);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [isDelivery, setIsDelivery] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerMenuOpen, setCustomerMenuOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [estate, setEstate] = useState('');
  const [address, setAddress] = useState('');
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerEstate, setNewCustomerEstate] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [itemType, setItemType] = useState<OrderType>('refill');
  const [incomingBrand, setIncomingBrand] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [lineBranchId, setLineBranchId] = useState(branchId);
  const [cart, setCart] = useState<PosLine[]>([]);
  const [riderIds, setRiderIds] = useState<string[]>([]);
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [lpoNumber, setLpoNumber] = useState('');
  const [saleComment, setSaleComment] = useState('');
  const [showPayment, setShowPayment] = useState(false);
  const [paymentLines, setPaymentLines] = useState<Array<{ id: string; method: PaymentMethod; amount: string; reference: string }>>([]);
  const [paymentModalError, setPaymentModalError] = useState('');
  const [formError, setFormError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const tareBrands = (category?: string) => category === 'water'
    ? ['KERINGET', 'AQUAMIST']
    : ['AFRIGAS', 'K-GAS', 'TOTAL', 'OLA', 'PROGAS', 'TOSHA', 'LAKE', 'HASHI', 'SUPA', 'JATEL', 'SEAGAS', 'RAHA', 'BONOKO', 'PURE', 'HUNKER', 'HASS'];

  const activeRiders = staffList.filter(s => s.role === 'rider' && s.approval_status === 'approved');
  const selectedRiders = activeRiders.filter(r => riderIds.includes(r.id));
  const vehicleOptions = Array.from(new Set(selectedRiders.map(r => r.vehicle_plate).filter((v): v is string => Boolean(v))));
  const activeBranch = branches.find(b => b.id === branchId);
  const matchingCustomers = customerQuery.trim()
    ? customers.filter(c => c.name.toLowerCase().includes(customerQuery.toLowerCase()) ||
        c.phones.some(p => p.phone_number.toLowerCase().includes(customerQuery.toLowerCase()))).slice(0, 8)
    : [];
  const matchingProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return products.filter(p => p.is_active && [p.name, p.brand, p.category, p.size_kg ? `${p.size_kg}kg` : ''].join(' ').toLowerCase().includes(q)).slice(0, 8);
  }, [products, query]);
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const units = cart.reduce((sum, item) => sum + item.quantity, 0);
  const canEditDate = ['admin', 'director', 'operator'].includes(currentUser.role);

  const selectProduct = (product: Product) => {
    const returnable = hasEmptyState(product);
    const type: OrderType = returnable ? 'refill' : 'accessory';
    setSelectedProduct(product);
    setQuery(product.name);
    setSearchOpen(false);
    setItemType(type);
    setIncomingBrand(returnable ? product.brand : '');
    setQuantity('1');
    setUnitPrice(String(type === 'refill' ? product.refill_price_kes : (product.accessory_price_kes || product.complete_price_kes)));
    setLineBranchId(branchId);
  };

  const clearProduct = () => {
    setSelectedProduct(null);
    setQuery('');
    setQuantity('1');
    setUnitPrice('');
    setSearchOpen(false);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const changeItemType = (type: OrderType) => {
    if (!selectedProduct) return;
    setItemType(type);
    setUnitPrice(String(type === 'refill' ? selectedProduct.refill_price_kes : type === 'complete' ? selectedProduct.complete_price_kes : selectedProduct.accessory_price_kes));
  };

  const addLine = () => {
    if (!selectedProduct) return;
    const qty = Number(quantity);
    const price = Number(unitPrice);
    if (!Number.isInteger(qty) || qty < 1 || !Number.isFinite(price) || price < 0 || !lineBranchId) return;
    const item: PosLine = {
      id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId: selectedProduct.id, productName: selectedProduct.name, orderType: itemType,
      outgoingBrand: selectedProduct.brand, incomingBrand: itemType === 'refill' ? incomingBrand : '',
      cylinderSizeKg: selectedProduct.size_kg, quantity: qty, unitPrice: price, branchId: lineBranchId,
    };
    setCart(prev => {
      const index = prev.findIndex(p => p.productId === item.productId && p.orderType === item.orderType &&
        p.incomingBrand === item.incomingBrand && p.unitPrice === item.unitPrice && p.branchId === item.branchId);
      if (index < 0) return [...prev, item];
      return prev.map((p, i) => i === index ? { ...p, quantity: p.quantity + item.quantity } : p);
    });
    clearProduct();
  };

  const updateLine = (id: string, patch: Partial<PosLine>) => setCart(prev => prev.map(line => line.id === id ? { ...line, ...patch } : line));
  const removeLine = (id: string) => setCart(prev => prev.filter(line => line.id !== id));

  const saveNewCustomer = () => {
    if (!newCustomerName.trim() || !newCustomerPhone.trim()) return;
    const created = createCustomer(newCustomerName.trim(), newCustomerPhone.trim(), newCustomerEstate.trim() || 'Nairobi', newCustomerAddress.trim());
    setCustomer(created);
    setPhone(newCustomerPhone.trim());
    setEstate(newCustomerEstate.trim() || 'Nairobi');
    setAddress(newCustomerAddress.trim());
    setCustomerQuery('');
    setShowNewCustomer(false);
    setNewCustomerName(''); setNewCustomerPhone(''); setNewCustomerEstate(''); setNewCustomerAddress('');
  };

  const validateSale = (requireCustomer = false) => {
    setFormError('');
    if (!cart.length) { setFormError('Add at least one product.'); return false; }
    if (!receiptNumber.trim()) { setFormError('Receipt number is required.'); return false; }
    if (requireCustomer && !customer) { setFormError('Select a customer to create an invoice.'); return false; }
    if (isDelivery && !customer) { setFormError('Select or create a customer for delivery.'); return false; }
    if (isDelivery && (!phone.trim() || !estate.trim())) { setFormError('Delivery phone and estate are required.'); return false; }
    if (isDelivery && riderIds.length === 0) { setFormError('Assign at least one rider for delivery.'); return false; }
    return true;
  };

  const buildSubmission = (payment: { method: PaymentMethod; status: PaymentStatus; reference?: string }): PosSaleSubmission => {
    const now = new Date();
    const [y, m, d] = receiptDate.split('-').map(Number);
    const createdAt = y && m && d ? new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString() : now.toISOString();
    return {
      branch_id: branchId, is_pos_walkin: !isDelivery, customer_id: customer?.id || null,
      receipt_number: receiptNumber.trim(), created_at: createdAt,
      customer_name: customer?.name || 'Walk-in Counter Customer',
      customer_phone: phone || customer?.phones[0]?.phone_number || '+254700000000',
      delivery_estate: isDelivery ? estate : undefined,
      delivery_address: isDelivery ? address : undefined,
      rider_ids: isDelivery ? riderIds : [], vehicle_plate: isDelivery ? vehiclePlate || null : null,
      lpo_number: lpoNumber.trim() || undefined, sale_comment: saleComment.trim() || undefined,
      payment_method: payment.method, payment_status: payment.status,
      payment_reference: payment.reference || undefined, delivery_fee_kes: 0,
      items: cart.map(line => ({
        product_id: line.productId, branch_id: line.branchId, order_type: line.orderType,
        outgoing_brand: line.outgoingBrand, incoming_brand: line.incomingBrand || undefined,
        cylinder_size_kg: line.cylinderSizeKg, quantity: line.quantity, unit_price_kes: line.unitPrice,
      })),
    };
  };

  const saveInvoice = async () => {
    if (!validateSale(true)) return;
    await onSubmit(buildSubmission({ method: 'cash', status: 'pending' }));
  };

  const openPayment = () => {
    if (!validateSale(false)) return;
    setPaymentModalError('');
    setPaymentLines([{ id: `pay-${Date.now()}`, method: 'cash', amount: String(subtotal), reference: '' }]);
    setShowPayment(true);
  };

  const paidTotal = paymentLines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const remainingTotal = Math.max(0, subtotal - paidTotal);

  const confirmPayment = async () => {
    setPaymentModalError('');
    const normalized = paymentLines.map(l => ({ ...l, amountNum: Number(l.amount) || 0, reference: l.reference.trim() }));
    if (!normalized.length) { setPaymentModalError('Add at least one payment line.'); return; }
    if (normalized.some(l => l.amountNum <= 0)) { setPaymentModalError('Each payment amount must be greater than 0.'); return; }
    if (normalized.reduce((s, l) => s + l.amountNum, 0) <= 0) { setPaymentModalError('Enter payment amount(s).'); return; }
    const totalPaid = normalized.reduce((s, l) => s + l.amountNum, 0);
    const primary = [...normalized].sort((a, b) => b.amountNum - a.amountNum)[0];
    const breakdown = normalized.map(l => `${l.method.toUpperCase()}:${l.amountNum}${l.reference ? `(${l.reference})` : ''}`).join(' | ');
    const reference = normalized.length === 1 ? (primary.reference || undefined) : breakdown;
    const status: PaymentStatus = totalPaid >= subtotal ? 'paid' : 'pending';
    await onSubmit(buildSubmission({ method: primary.method, status, reference }));
  };

  const addPaymentLine = () => {
    const remaining = Math.max(0, subtotal - paymentLines.reduce((s, l) => s + (Number(l.amount) || 0), 0));
    setPaymentLines(prev => [...prev, { id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, method: 'mpesa', amount: String(remaining || ''), reference: '' }]);
  };

  if (completedOrderNumber) {
    return (
      <div className="mx-auto max-w-2xl rounded-xl border border-emerald-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-6 w-6" /></div>
        <h1 className="text-xl font-semibold text-slate-950">Sale completed</h1>
        <p className="mt-1.5 text-sm text-slate-600">Order <strong className="font-mono font-medium text-emerald-700">{completedOrderNumber}</strong> has been recorded.</p>
        <Button className="mt-4" onClick={onStartNextSale}>Start next sale</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-[1440px] flex-col gap-2 pb-16 text-left lg:min-h-[calc(100dvh-4rem)] lg:pb-2">
      <section className="bg-white">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
              <div className="w-full sm:w-[200px]">
                <label className={labelClass}>Receipt number <span className="text-red-600">*</span></label>
                <input className={fieldClass + ' font-mono text-sm'} value={receiptNumber} onChange={e => setReceiptNumber(e.target.value.toUpperCase())} placeholder="Receipt number" />
              </div>
              <div className="w-full sm:w-[170px]">
                <label className={labelClass}>Sale date</label>
                <input className={fieldClass} type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} disabled={!canEditDate} />
              </div>
              <div className="w-full sm:w-[220px]">
                <label className={labelClass}>Branch</label>
                <select className={fieldClass} value={branchId} onChange={e => setBranchId(e.target.value)} disabled={branches.length < 2}>{branches.filter(b => b.is_active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:pt-5">
              {customer && <Button type="button" variant="outline" size="sm" onClick={saveInvoice} isLoading={isSubmitting} disabled={isSubmitting || !cart.length}><FileText className="mr-1 h-4 w-4" />Invoice</Button>}
              <Button type="button" size="sm" onClick={openPayment} disabled={!cart.length || isSubmitting}><Save className="mr-1 h-4 w-4" />Save</Button>
            </div>
          </div>
          <div>
            <label className={labelClass}>Customer</label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-md bg-slate-100 p-0.5">
                <button type="button" onClick={() => setIsDelivery(false)} className={`rounded px-2.5 py-1.5 text-xs font-medium ${!isDelivery ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Cash sale / walk-in</button>
                <button type="button" onClick={() => setIsDelivery(true)} className={`rounded px-2.5 py-1.5 text-xs font-medium ${isDelivery ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Delivery</button>
              </div>
              <div className="relative w-full sm:w-[320px]">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input className={fieldClass + ' pl-8 pr-8'} value={customer ? customer.name : customerQuery} onChange={e => { setCustomer(null); setCustomerQuery(e.target.value); setCustomerMenuOpen(true); }} onFocus={() => setCustomerMenuOpen(true)} placeholder="Search customer (optional)" />
                {(customer || customerQuery) && <button type="button" onClick={() => { setCustomer(null); setCustomerQuery(''); setPhone(''); setEstate(''); setAddress(''); }} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>}
                {customerMenuOpen && customerQuery.trim() && !customer && <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">{matchingCustomers.length ? matchingCustomers.map(c => <button type="button" key={c.id} onClick={() => { setCustomer(c); setPhone(c.phones[0]?.phone_number || ''); const loc=c.locations.find(l=>l.is_default) || c.locations[0]; setEstate(loc?.estate || ''); setAddress(loc?.specific_address || ''); setCustomerQuery(''); setCustomerMenuOpen(false); }} className="block w-full border-b border-slate-100 px-2.5 py-2 text-left hover:bg-orange-50"><span className="block text-sm font-medium text-slate-900">{c.name}</span><span className="text-xs text-slate-500">{c.phones.map(p=>p.phone_number).join(' · ')}</span></button>) : <div className="p-2.5 text-xs text-slate-500">No customer found.</div>}</div>}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNewCustomer(v => !v)}><Plus className="mr-1 h-4 w-4" />Add</Button>
            </div>
          </div>
        </div>
        {showNewCustomer && <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4"><input className={fieldClass} placeholder="Customer name *" value={newCustomerName} onChange={e=>setNewCustomerName(e.target.value)} /><input className={fieldClass} placeholder="Phone *" value={newCustomerPhone} onChange={e=>setNewCustomerPhone(e.target.value)} /><input className={fieldClass} placeholder="Estate" value={newCustomerEstate} onChange={e=>setNewCustomerEstate(e.target.value)} /><input className={fieldClass} placeholder="Address" value={newCustomerAddress} onChange={e=>setNewCustomerAddress(e.target.value)} /><div className="flex gap-2 sm:col-span-2 lg:col-span-4"><Button type="button" size="sm" onClick={saveNewCustomer} disabled={!newCustomerName.trim() || !newCustomerPhone.trim()}>Save</Button><Button type="button" size="sm" variant="ghost" onClick={()=>setShowNewCustomer(false)}>Cancel</Button></div></div>}
        {isDelivery && <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"><div><label className={labelClass}>Delivery phone *</label><input className={fieldClass} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Phone" /></div><div><label className={labelClass}>Estate / area *</label><input className={fieldClass} value={estate} onChange={e=>setEstate(e.target.value)} placeholder="Estate" /></div><div className="sm:col-span-2"><label className={labelClass}>Delivery address</label><input className={fieldClass} value={address} onChange={e=>setAddress(e.target.value)} placeholder="Address / instructions" /></div></div>}
      </section>

      <section className="flex min-h-0 flex-1 flex-col bg-white">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold text-slate-900">Products</h2><span className="text-[11px] font-medium text-slate-500">{cart.length} lines · {units} units</span></div>
        <div className="relative">
          <label className={labelClass}>Product search</label>
          <div className="relative"><Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input ref={searchRef} className={fieldClass + ' min-h-9 pl-8 text-sm'} value={query} onChange={e=>{setQuery(e.target.value);setSelectedProduct(null);setSearchOpen(true);}} onFocus={()=>setSearchOpen(true)} onKeyDown={e=>{if(e.key==='Escape')setSearchOpen(false);if(e.key==='Enter'&&matchingProducts.length===1){e.preventDefault();selectProduct(matchingProducts[0]);}}} placeholder="Search brand, cylinder size or product name..." autoComplete="off" />{query && <button type="button" onClick={clearProduct} className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>}</div>
          {searchOpen && query.trim() && !selectedProduct && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">{matchingProducts.length ? matchingProducts.map(p=><button type="button" key={p.id} onClick={()=>selectProduct(p)} className="flex min-h-11 w-full items-center justify-between border-b border-slate-100 px-2.5 py-2 text-left hover:bg-orange-50"><span><strong className="block text-sm font-medium text-slate-900">{p.name}</strong><span className="text-xs text-slate-500">{p.brand} · {p.category}</span></span><strong className="text-sm font-medium text-slate-900">{formatKES(hasEmptyState(p)?p.refill_price_kes:(p.accessory_price_kes||p.complete_price_kes))}</strong></button>) : <div className="p-3 text-center text-sm text-slate-500">No matching active products.</div>}</div>}
        </div>
        {selectedProduct && <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 p-2">
          <div className="mb-2 flex items-start justify-between gap-2"><div><h3 className="text-sm font-medium text-slate-950">{selectedProduct.name}</h3><p className="text-xs text-slate-500">{selectedProduct.brand}{selectedProduct.size_kg ? ` · ${selectedProduct.size_kg}kg` : ''}</p></div><button type="button" onClick={clearProduct} className="rounded p-1 text-slate-500 hover:bg-white"><X className="h-4 w-4" /></button></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {hasEmptyState(selectedProduct) && <div><label className={labelClass}>Sale type</label><select className={fieldClass} value={itemType} onChange={e=>changeItemType(e.target.value as OrderType)}><option value="refill">Refill / exchange</option><option value="complete">Complete cylinder</option></select></div>}
            {hasEmptyState(selectedProduct) && itemType==='refill' && <div><label className={labelClass}>Empty returned brand</label><select className={fieldClass} value={incomingBrand} onChange={e=>setIncomingBrand(e.target.value)}>{(selectedProduct.category==='water'?['KERINGET','AQUAMIST']:['AFRIGAS','K-GAS','TOTAL','OLA','PROGAS','TOSHA','LAKE','HASHI','SUPA','JATEL','SEAGAS','RAHA','BONOKO','PURE','HUNKER','HASS']).map(b=><option key={b} value={b}>{b}</option>)}</select></div>}
            <div><label className={labelClass}>Quantity</label><input className={fieldClass} type="number" min="1" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} /></div>
            <div><label className={labelClass}>Unit price (KES)</label><input className={fieldClass} type="number" min="0" step="1" value={unitPrice} onChange={e=>setUnitPrice(e.target.value)} /></div>
            <div><label className={labelClass}>Stock location</label><select className={fieldClass} value={lineBranchId} onChange={e=>setLineBranchId(e.target.value)}>{branches.filter(b=>b.is_active).map(b=><option key={b.id} value={b.id}>{b.name} · {inventory.find(i=>i.branch_id===b.id&&i.product_id===selectedProduct.id)?.full_units ?? 0} available</option>)}</select></div>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t border-orange-200 pt-2.5"><span className="text-sm text-slate-600">Line total <strong className="ml-1.5 text-sm font-semibold text-slate-950">{formatKES((Number(quantity)||0)*(Number(unitPrice)||0))}</strong></span><Button type="button" size="sm" onClick={addLine} disabled={!Number.isInteger(Number(quantity))||Number(quantity)<1||!Number.isFinite(Number(unitPrice))||Number(unitPrice)<0||!lineBranchId|| (itemType==='refill'&&hasEmptyState(selectedProduct)&&!incomingBrand)}><Plus className="mr-1 h-4 w-4" />Add product</Button></div>
        </div>}

        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-slate-200">
          <div className="hidden shrink-0 grid-cols-[minmax(170px,1.4fr)_80px_110px_120px_150px_150px_36px] gap-2 bg-slate-50 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:grid"><span>Product</span><span>Qty</span><span>Unit price</span><span>Line total</span><span>Return cylinder</span><span>Stock location</span><span /></div>
          <div className="min-h-0 flex-1 overflow-auto">
          {cart.length===0 ? <div className="flex h-full min-h-[160px] flex-col items-center justify-center px-4 py-8 text-center"><Package className="mx-auto mb-2 h-6 w-6 text-slate-300" /><p className="text-sm font-medium text-slate-600">Your sale is empty</p></div> : cart.map(line=>{ const p = products.find(x=>x.id===line.productId); const brands = tareBrands(p?.category); return (<div key={line.id} className="grid grid-cols-1 gap-2 border-t border-slate-100 px-2.5 py-2.5 first:border-t-0 md:grid-cols-[minmax(170px,1.4fr)_80px_110px_120px_150px_150px_36px] md:items-center md:gap-2">
            <div className="min-w-0"><strong className="block text-sm font-medium text-slate-900">{line.productName}</strong><span className="text-xs text-slate-500">{line.orderType==='refill'?'Refill / exchange':line.orderType==='complete'?'Complete cylinder':'Direct sale'}</span></div>
            <div><label className={labelClass+' md:hidden'}>Quantity</label><input aria-label={`Quantity for ${line.productName}`} className={fieldClass} type="number" min="1" step="1" value={line.quantity} onChange={e=>updateLine(line.id,{quantity:Math.max(1,Math.floor(Number(e.target.value)||1))})} /></div>
            <div><label className={labelClass+' md:hidden'}>Unit price</label><input aria-label={`Unit price for ${line.productName}`} className={fieldClass} type="number" min="0" value={line.unitPrice} onChange={e=>updateLine(line.id,{unitPrice:Math.max(0,Number(e.target.value)||0)})} /></div>
            <div className="flex items-center justify-between md:block"><span className="text-xs text-slate-500 md:hidden">Line total</span><strong className="text-sm font-medium text-slate-950">{formatKES(line.quantity*line.unitPrice)}</strong></div>
            <div>{line.orderType==='refill' ? (<><label className={labelClass+' md:hidden'}>Return cylinder</label><select aria-label={`Return cylinder for ${line.productName}`} className={fieldClass} value={line.incomingBrand} onChange={e=>updateLine(line.id,{incomingBrand:e.target.value})}>{brands.map(b=><option key={b} value={b}>{b}</option>)}</select></>) : <span className="text-xs text-slate-400">-</span>}</div>
            <div><label className={labelClass+' md:hidden'}>Stock location</label><select className={fieldClass} value={line.branchId} onChange={e=>updateLine(line.id,{branchId:e.target.value})}>{branches.filter(b=>b.is_active).map(b=><option key={b.id} value={b.id}>{b.name} · {inventory.find(i=>i.branch_id===b.id&&i.product_id===line.productId)?.full_units ?? 0} available</option>)}</select></div>
            <button type="button" aria-label={`Remove ${line.productName}`} onClick={()=>removeLine(line.id)} className="flex h-8 w-8 items-center justify-center rounded-md text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
          </div>);})}
          </div>
        </div>
      </section>

      <footer className="sticky bottom-16 z-10 mt-auto border-t border-slate-200 bg-white px-2.5 py-2 shadow-[0_-1px_0_rgba(0,0,0,0.04)] lg:bottom-0">
        {formError && <p className="mb-2 flex items-center gap-2 text-xs font-medium text-red-700"><AlertCircle className="h-4 w-4" />{formError}</p>}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
            {isDelivery && (
              <div className="w-full sm:w-[220px]">
                <label className={labelClass}>Rider</label>
                <select className={fieldClass} value={riderIds[0] || ''} onChange={e => {
                  const id = e.target.value;
                  const next = id ? [id] : [];
                  setRiderIds(next);
                  const r = activeRiders.find(x => x.id === id);
                  if (r?.vehicle_plate) setVehiclePlate(r.vehicle_plate); else if (!id) setVehiclePlate('');
                }}>
                  <option value="">Select rider</option>
                  {activeRiders.map(r => <option key={r.id} value={r.id}>{r.full_name}{r.vehicle_plate ? ` · ${r.vehicle_plate}` : ''}</option>)}
                </select>
              </div>
            )}
            {isDelivery && (
              <div className="w-full sm:w-[170px]">
                <label className={labelClass}>Vehicle</label>
                <input className={fieldClass} value={vehiclePlate} onChange={e => setVehiclePlate(e.target.value.toUpperCase())} placeholder="Plate" />
              </div>
            )}
            <div className="min-w-[200px] flex-1 sm:max-w-[420px]">
              <label className={labelClass}>Comment</label>
              <input className={fieldClass} value={saleComment} onChange={e => setSaleComment(e.target.value)} placeholder="Comment / notes" />
            </div>
            <div className="w-full sm:w-[180px]">
              <label className={labelClass}>LPO / PO</label>
              <input className={fieldClass} value={lpoNumber} onChange={e => setLpoNumber(e.target.value.toUpperCase())} placeholder="Optional" />
            </div>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Total · {units} units</p>
            <p className="text-xl font-semibold tabular-nums text-slate-950">{formatKES(subtotal)}</p>
          </div>
        </div>
      </footer>

      {showPayment && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="pos-payment-title"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-xl bg-white p-4 shadow-xl sm:rounded-xl">
        <div className="mb-3 flex items-start justify-between"><div><h2 id="pos-payment-title" className="text-lg font-semibold text-slate-950">Record payment</h2><p className="text-xs text-slate-500">Add one or more payment methods.</p></div><button type="button" onClick={()=>setShowPayment(false)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-950 px-3 py-2 text-white"><div><p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Amount due</p><p className="text-xl font-semibold tabular-nums">{formatKES(subtotal)}</p></div><div className="text-right text-xs"><p>Paid: <strong>{formatKES(paidTotal)}</strong></p><p className={remainingTotal>0?'text-amber-300':'text-emerald-300'}>Remaining: <strong>{formatKES(remainingTotal)}</strong></p></div></div>
        {paymentModalError && <p className="mb-2 flex items-center gap-2 text-xs font-medium text-red-700"><AlertCircle className="h-4 w-4" />{paymentModalError}</p>}
        <div className="space-y-2">
          {paymentLines.map((line, idx) => (
            <div key={line.id} className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 p-2 sm:grid-cols-[160px_140px_1fr_36px] sm:items-end">
              <div><label className={labelClass}>Method</label><select className={fieldClass} value={line.method} onChange={e=>setPaymentLines(prev=>prev.map(l=>l.id===line.id?{...l,method:e.target.value as PaymentMethod}:l))}><option value="cash">Cash</option><option value="mpesa">M-Pesa</option><option value="bank_transfer">Bank transfer</option><option value="pdq">PDQ / Card</option><option value="cheque">Cheque</option></select></div>
              <div><label className={labelClass}>Amount</label><input className={fieldClass} type="number" min="0" step="1" value={line.amount} onChange={e=>setPaymentLines(prev=>prev.map(l=>l.id===line.id?{...l,amount:e.target.value}:l))} /></div>
              <div><label className={labelClass}>{line.method==='mpesa'?'M-Pesa code':line.method==='bank_transfer'?'Bank ref':line.method==='cheque'?'Cheque no.':line.method==='pdq'?'PDQ ref':'Reference'}</label><input className={fieldClass} value={line.reference} onChange={e=>setPaymentLines(prev=>prev.map(l=>l.id===line.id?{...l,reference:e.target.value.toUpperCase()}:l))} placeholder={line.method==='mpesa'?'Code':line.method==='bank_transfer'?'Reference':'Ref / code'} /></div>
              <button type="button" aria-label="Remove payment line" onClick={()=>setPaymentLines(prev=>prev.length>1?prev.filter(l=>l.id!==line.id):prev)} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 disabled:opacity-40" disabled={paymentLines.length===1}><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addPaymentLine}><Plus className="mr-1 h-4 w-4" />Add payment</Button>
          <span className="text-xs text-slate-500">{remainingTotal>0 ? 'Partial payment will save as pending/unpaid.' : 'Fully covered.'}</span>
        </div>
        <div className="mt-4 flex gap-2"><Button variant="outline" className="flex-1" onClick={()=>setShowPayment(false)}>Cancel</Button><Button className="flex-1" onClick={confirmPayment} isLoading={isSubmitting} disabled={isSubmitting || paidTotal<=0}>Save sale</Button></div>
      </div></div>}
    </div>
  );
}
