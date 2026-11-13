'use client';

import { useMemo, useRef, useState } from 'react';
import {
  AlertCircle, ArrowRight, Banknote, Building2, CalendarDays, Check,
  CheckCircle2, CreditCard, Package, Plus, ReceiptText, Search, Smartphone,
  Trash2, Truck, Users, X,
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

const fieldClass = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/15 disabled:bg-slate-100';
const labelClass = 'mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-500';

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
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid');
  const [paymentReference, setPaymentReference] = useState('');
  const [formError, setFormError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  const activeRiders = staffList.filter(s => s.role === 'rider' && s.approval_status === 'approved');
  const vehicleOptions = Array.from(new Set(activeRiders.map(r => r.vehicle_plate).filter((v): v is string => Boolean(v))));
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

  const openPayment = () => {
    setFormError('');
    if (!cart.length) { setFormError('Add at least one product before proceeding to payment.'); return; }
    if (!receiptNumber.trim()) { setFormError('Enter the paper receipt number before proceeding.'); return; }
    if (isDelivery && !customer) { setFormError('Select or create a customer for delivery.'); return; }
    if (isDelivery && (!phone.trim() || !estate.trim())) { setFormError('Delivery phone number and estate are required.'); return; }
    if (isDelivery && riderIds.length === 0) { setFormError('Assign at least one rider to this delivery.'); return; }
    setShowPayment(true);
  };

  const completeSale = async () => {
    const now = new Date();
    const [y, m, d] = receiptDate.split('-').map(Number);
    const createdAt = y && m && d ? new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString() : now.toISOString();
    await onSubmit({
      branch_id: branchId, is_pos_walkin: !isDelivery, customer_id: customer?.id || null,
      receipt_number: receiptNumber.trim(), created_at: createdAt,
      customer_name: customer?.name || 'Walk-in Counter Customer',
      customer_phone: phone || customer?.phones[0]?.phone_number || '+254700000000',
      delivery_estate: isDelivery ? estate : undefined,
      delivery_address: isDelivery ? address : undefined,
      rider_ids: isDelivery ? riderIds : [], vehicle_plate: isDelivery ? vehiclePlate || null : null,
      lpo_number: lpoNumber.trim() || undefined, sale_comment: saleComment.trim() || undefined,
      payment_method: paymentMethod, payment_status: paymentStatus,
      payment_reference: paymentReference.trim() || undefined, delivery_fee_kes: 0,
      items: cart.map(line => ({
        product_id: line.productId, branch_id: line.branchId, order_type: line.orderType,
        outgoing_brand: line.outgoingBrand, incoming_brand: line.incomingBrand || undefined,
        cylinder_size_kg: line.cylinderSizeKg, quantity: line.quantity, unit_price_kes: line.unitPrice,
      })),
    });
  };

  if (completedOrderNumber) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-8 w-8" /></div>
        <h1 className="text-2xl font-black text-slate-950">Sale completed</h1>
        <p className="mt-2 text-slate-600">Order <strong className="font-mono text-emerald-700">{completedOrderNumber}</strong> has been recorded.</p>
        <Button className="mt-6" onClick={onStartNextSale}>Start next sale</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-3 pb-28 text-left">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div><h1 className="text-xl font-black tracking-tight text-slate-950">New sale</h1><p className="text-xs text-slate-500">Build the ticket here, then settle payment.</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase text-slate-600">{currentUser.role.replace('_', ' ')}</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><label className={labelClass}><Building2 className="mr-1 inline h-3.5 w-3.5" />Selling branch</label><select className={fieldClass} value={branchId} onChange={e => setBranchId(e.target.value)} disabled={branches.length < 2}>{branches.filter(b => b.is_active).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select><p className="mt-1 text-xs text-slate-400">{activeBranch?.location_estate}</p></div>
          <div><label className={labelClass}><CalendarDays className="mr-1 inline h-3.5 w-3.5" />Sale date</label><input className={fieldClass} type="date" value={receiptDate} onChange={e => setReceiptDate(e.target.value)} disabled={!canEditDate} /></div>
          <div><label className={labelClass}><ReceiptText className="mr-1 inline h-3.5 w-3.5" />Paper receipt number <span className="text-red-600">*</span></label><input className={fieldClass + ' font-mono'} value={receiptNumber} onChange={e => setReceiptNumber(e.target.value.toUpperCase())} placeholder="Enter receipt number" /></div>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold text-slate-900">Customer</h2><p className="text-xs text-slate-500">Walk-in is selected by default. Search only when attaching an existing customer.</p></div>
          <div className="flex rounded-lg bg-slate-100 p-1">
            <button type="button" onClick={() => setIsDelivery(false)} className={`rounded-md px-3 py-2 text-xs font-bold ${!isDelivery ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Cash sale / walk-in</button>
            <button type="button" onClick={() => setIsDelivery(true)} className={`rounded-md px-3 py-2 text-xs font-bold ${isDelivery ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>Delivery</button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr]">
          <div className="relative">
            <label className={labelClass}>Customer lookup (optional for walk-in)</label>
            <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={fieldClass + ' pl-9'} value={customer ? customer.name : customerQuery} onChange={e => { setCustomer(null); setCustomerQuery(e.target.value); setCustomerMenuOpen(true); }} onFocus={() => setCustomerMenuOpen(true)} placeholder="Search customer name or phone..." /><button type="button" onClick={() => { setCustomer(null); setCustomerQuery(''); setPhone(''); setEstate(''); setAddress(''); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
            {customerMenuOpen && customerQuery.trim() && !customer && <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">{matchingCustomers.length ? matchingCustomers.map(c => <button type="button" key={c.id} onClick={() => { setCustomer(c); setPhone(c.phones[0]?.phone_number || ''); const loc=c.locations.find(l=>l.is_default) || c.locations[0]; setEstate(loc?.estate || ''); setAddress(loc?.specific_address || ''); setCustomerQuery(''); setCustomerMenuOpen(false); }} className="block w-full border-b border-slate-100 px-3 py-2 text-left hover:bg-orange-50"><span className="block text-sm font-semibold text-slate-900">{c.name}</span><span className="text-xs text-slate-500">{c.phones.map(p=>p.phone_number).join(' · ')}</span></button>) : <div className="p-3 text-xs text-slate-500">No customer found. Use Add customer below.</div>}</div>}
          </div>
          <div className="flex items-end gap-2"><div className="min-w-0 flex-1"><label className={labelClass}>Selected customer</label><div className="flex min-h-11 items-center rounded-lg bg-slate-50 px-3 text-sm font-semibold text-slate-800">{customer?.name || 'Cash Sale / Walk-in'}</div></div><Button type="button" variant="outline" onClick={() => setShowNewCustomer(v => !v)}><Plus className="mr-1 h-4 w-4" />Add customer</Button></div>
        </div>
        {showNewCustomer && <div className="mt-3 grid grid-cols-1 gap-2 rounded-lg border border-orange-200 bg-orange-50/40 p-3 sm:grid-cols-2 lg:grid-cols-4"><input className={fieldClass} placeholder="Customer name *" value={newCustomerName} onChange={e=>setNewCustomerName(e.target.value)} /><input className={fieldClass} placeholder="Phone *" value={newCustomerPhone} onChange={e=>setNewCustomerPhone(e.target.value)} /><input className={fieldClass} placeholder="Estate" value={newCustomerEstate} onChange={e=>setNewCustomerEstate(e.target.value)} /><input className={fieldClass} placeholder="House / delivery address" value={newCustomerAddress} onChange={e=>setNewCustomerAddress(e.target.value)} /><div className="flex gap-2 sm:col-span-2 lg:col-span-4"><Button type="button" size="sm" onClick={saveNewCustomer} disabled={!newCustomerName.trim() || !newCustomerPhone.trim()}>Save customer</Button><Button type="button" size="sm" variant="ghost" onClick={()=>setShowNewCustomer(false)}>Cancel</Button></div></div>}
        {isDelivery && <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><div><label className={labelClass}>Delivery phone *</label><input className={fieldClass} value={phone} onChange={e=>setPhone(e.target.value)} placeholder="Customer phone number" /></div><div><label className={labelClass}>Estate / area *</label><input className={fieldClass} value={estate} onChange={e=>setEstate(e.target.value)} placeholder="e.g. Lavington" /></div><div className="sm:col-span-2"><label className={labelClass}>Specific delivery address</label><input className={fieldClass} value={address} onChange={e=>setAddress(e.target.value)} placeholder="Building, house, landmark or instructions" /></div></div>}
        {customer && <p className="mt-2 text-xs text-emerald-700"><Check className="mr-1 inline h-3.5 w-3.5" />Registered customer selected. {customer.phones.length} saved phone number(s).</p>}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold text-slate-900">Add products</h2><p className="text-xs text-slate-500">Search, configure, add. The product list stays hidden until you search.</p></div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-800">{cart.length} lines · {units} units</span></div>
        <div className="relative">
          <label className={labelClass}>Product search</label>
          <div className="relative"><Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input ref={searchRef} className={fieldClass + ' min-h-12 pl-11 text-base'} value={query} onChange={e=>{setQuery(e.target.value);setSelectedProduct(null);setSearchOpen(true);}} onFocus={()=>setSearchOpen(true)} onKeyDown={e=>{if(e.key==='Escape')setSearchOpen(false);if(e.key==='Enter'&&matchingProducts.length===1){e.preventDefault();selectProduct(matchingProducts[0]);}}} placeholder="Search brand, cylinder size or product name..." autoComplete="off" />{query && <button type="button" onClick={clearProduct} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>}</div>
          {searchOpen && query.trim() && !selectedProduct && <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-xl">{matchingProducts.length ? matchingProducts.map(p=><button type="button" key={p.id} onClick={()=>selectProduct(p)} className="flex min-h-14 w-full items-center justify-between border-b border-slate-100 px-3 py-2 text-left hover:bg-orange-50"><span><strong className="block text-sm text-slate-900">{p.name}</strong><span className="text-xs text-slate-500">{p.brand} · {p.category}</span></span><strong className="text-sm text-slate-900">{formatKES(hasEmptyState(p)?p.refill_price_kes:(p.accessory_price_kes||p.complete_price_kes))}</strong></button>) : <div className="p-4 text-center text-sm text-slate-500">No matching active products.</div>}</div>}
        </div>
        {selectedProduct && <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50/40 p-3">
          <div className="mb-3 flex items-start justify-between gap-2"><div><span className="text-[10px] font-bold uppercase tracking-wide text-orange-700">Selected product</span><h3 className="font-bold text-slate-950">{selectedProduct.name}</h3><p className="text-xs text-slate-500">{selectedProduct.brand}{selectedProduct.size_kg ? ` · ${selectedProduct.size_kg}kg` : ''}</p></div><button type="button" onClick={clearProduct} className="rounded-md p-1.5 text-slate-500 hover:bg-white"><X className="h-4 w-4" /></button></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {hasEmptyState(selectedProduct) && <div><label className={labelClass}>Sale type</label><select className={fieldClass} value={itemType} onChange={e=>changeItemType(e.target.value as OrderType)}><option value="refill">Refill / exchange</option><option value="complete">Complete cylinder</option></select></div>}
            {hasEmptyState(selectedProduct) && itemType==='refill' && <div><label className={labelClass}>Empty returned brand</label><select className={fieldClass} value={incomingBrand} onChange={e=>setIncomingBrand(e.target.value)}>{(selectedProduct.category==='water'?['KERINGET','AQUAMIST']:['AFRIGAS','K-GAS','TOTAL','OLA','PROGAS','TOSHA','LAKE','HASHI','SUPA','JATEL','SEAGAS','RAHA','BONOKO','PURE','HUNKER','HASS']).map(b=><option key={b} value={b}>{b}</option>)}</select></div>}
            <div><label className={labelClass}>Quantity</label><input className={fieldClass} type="number" min="1" step="1" value={quantity} onChange={e=>setQuantity(e.target.value)} /></div>
            <div><label className={labelClass}>Unit price (KES)</label><input className={fieldClass} type="number" min="0" step="1" value={unitPrice} onChange={e=>setUnitPrice(e.target.value)} /></div>
            <div><label className={labelClass}>Stock location</label><select className={fieldClass} value={lineBranchId} onChange={e=>setLineBranchId(e.target.value)}>{branches.filter(b=>b.is_active).map(b=><option key={b.id} value={b.id}>{b.name} · {inventory.find(i=>i.branch_id===b.id&&i.product_id===selectedProduct.id)?.full_units ?? 0} available</option>)}</select></div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-orange-200 pt-3"><span className="text-sm text-slate-600">Line total <strong className="ml-2 text-base text-slate-950">{formatKES((Number(quantity)||0)*(Number(unitPrice)||0))}</strong></span><Button type="button" onClick={addLine} disabled={!Number.isInteger(Number(quantity))||Number(quantity)<1||!Number.isFinite(Number(unitPrice))||Number(unitPrice)<0||!lineBranchId|| (itemType==='refill'&&hasEmptyState(selectedProduct)&&!incomingBrand)}><Plus className="mr-1 h-4 w-4" />Add product</Button></div>
        </div>}

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <div className="hidden grid-cols-[minmax(180px,1.5fr)_90px_120px_130px_150px_40px] gap-2 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500 md:grid"><span>Product</span><span>Qty</span><span>Unit price</span><span>Line total</span><span>Stock location</span><span /></div>
          {cart.length===0 ? <div className="px-4 py-10 text-center"><Package className="mx-auto mb-2 h-7 w-7 text-slate-300" /><p className="text-sm font-semibold text-slate-600">Your sale is empty</p><p className="mt-1 text-xs text-slate-400">Search for the first product above.</p></div> : cart.map(line=><div key={line.id} className="grid grid-cols-1 gap-2 border-t border-slate-100 px-3 py-3 first:border-t-0 md:grid-cols-[minmax(180px,1.5fr)_90px_120px_130px_150px_40px] md:items-center md:gap-2">
            <div className="min-w-0"><strong className="block text-sm text-slate-900">{line.productName}</strong><span className="text-xs text-slate-500">{line.orderType==='refill'?`Refill · empty in: ${line.incomingBrand}`:line.orderType==='complete'?'Complete cylinder':'Direct sale'}</span></div>
            <div><label className={labelClass+' md:hidden'}>Quantity</label><input aria-label={`Quantity for ${line.productName}`} className={fieldClass} type="number" min="1" step="1" value={line.quantity} onChange={e=>updateLine(line.id,{quantity:Math.max(1,Math.floor(Number(e.target.value)||1))})} /></div>
            <div><label className={labelClass+' md:hidden'}>Unit price</label><input aria-label={`Unit price for ${line.productName}`} className={fieldClass} type="number" min="0" value={line.unitPrice} onChange={e=>updateLine(line.id,{unitPrice:Math.max(0,Number(e.target.value)||0)})} /></div>
            <div className="flex items-center justify-between md:block"><span className="text-xs text-slate-500 md:hidden">Line total</span><strong className="text-sm text-slate-950">{formatKES(line.quantity*line.unitPrice)}</strong></div>
            <div><label className={labelClass+' md:hidden'}>Stock location</label><select className={fieldClass} value={line.branchId} onChange={e=>updateLine(line.id,{branchId:e.target.value})}>{branches.filter(b=>b.is_active).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            <button type="button" aria-label={`Remove ${line.productName}`} onClick={()=>removeLine(line.id)} className="flex h-10 w-10 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
          </div>)}
        </div>
      </section>

      {isDelivery && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3"><h2 className="font-bold text-slate-900">Delivery assignment</h2><p className="text-xs text-slate-500">Assign one or more approved riders. Vehicle choices come from registered rider vehicles.</p></div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div><label className={labelClass}><Users className="mr-1 inline h-3.5 w-3.5" />Rider(s)</label><div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">{activeRiders.length ? activeRiders.map(r=><label key={r.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 hover:bg-slate-50"><input type="checkbox" checked={riderIds.includes(r.id)} onChange={e=>setRiderIds(prev=>e.target.checked?[...prev,r.id]:prev.filter(id=>id!==r.id))} /><span className="min-w-0 flex-1 text-sm font-medium text-slate-800">{r.full_name}</span><span className="text-xs text-slate-500">{r.vehicle_plate||'No vehicle'}</span></label>) : <p className="p-2 text-xs text-slate-500">No approved riders are registered.</p>}</div></div>
          <div><label className={labelClass}><Truck className="mr-1 inline h-3.5 w-3.5" />Vehicle</label><select className={fieldClass} value={vehiclePlate} onChange={e=>setVehiclePlate(e.target.value)}><option value="">Select vehicle</option>{vehicleOptions.map(v=><option key={v} value={v}>{v}</option>)}</select><p className="mt-1 text-xs text-slate-400">If riders use different vehicles, record separate delivery assignments after saving.</p></div>
        </div>
      </section>}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2"><div><label className={labelClass}>LPO / PO number</label><input className={fieldClass} value={lpoNumber} onChange={e=>setLpoNumber(e.target.value.toUpperCase())} placeholder="Optional purchase order reference" /></div><div><label className={labelClass}>Comments / sale notes</label><input className={fieldClass} value={saleComment} onChange={e=>setSaleComment(e.target.value)} placeholder="Optional instructions or notes" /></div></div>
      </section>

      <section className="sticky bottom-16 z-10 rounded-xl border border-slate-200 bg-white p-3 shadow-lg lg:bottom-2">
        {formError && <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-red-700"><AlertCircle className="h-4 w-4" />{formError}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Sale total · {units} units</p><p className="text-2xl font-black tabular-nums text-slate-950">{formatKES(subtotal)}</p></div><Button size="lg" onClick={openPayment} disabled={!cart.length}><CreditCard className="mr-2 h-4 w-4" />Proceed to payment <ArrowRight className="ml-2 h-4 w-4" /></Button></div>
      </section>

      {showPayment && <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="pos-payment-title"><div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl">
        <div className="mb-4 flex items-start justify-between"><div><h2 id="pos-payment-title" className="text-xl font-black text-slate-950">Payment</h2><p className="text-xs text-slate-500">Confirm how this sale is being settled.</p></div><button type="button" onClick={()=>setShowPayment(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
        <div className="mb-4 rounded-xl bg-slate-950 p-4 text-white"><p className="text-xs font-semibold uppercase tracking-wide text-slate-300">Amount due</p><p className="mt-1 text-3xl font-black tabular-nums">{formatKES(subtotal)}</p><p className="mt-1 text-xs text-slate-400">{cart.length} lines · {units} units</p></div>
        <label className={labelClass}>Payment method</label><div className="mb-4 grid grid-cols-3 gap-2">{([{id:'cash',label:'Cash',icon:Banknote},{id:'mpesa',label:'M-Pesa',icon:Smartphone},{id:'bank_transfer',label:'Bank / PDQ',icon:Building2}] as const).map(m=><button key={m.id} type="button" onClick={()=>setPaymentMethod(m.id)} className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border text-xs font-bold ${paymentMethod===m.id?'border-emerald-500 bg-emerald-50 text-emerald-900':'border-slate-200 text-slate-600 hover:bg-slate-50'}`}><m.icon className="h-5 w-5" />{m.label}</button>)}</div>
        <label className={labelClass}>Payment status</label><div className="mb-4 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setPaymentStatus('paid')} className={`rounded-lg border p-3 text-sm font-bold ${paymentStatus==='paid'?'border-emerald-500 bg-emerald-50 text-emerald-900':'border-slate-200 text-slate-600'}`}>Paid / received</button><button type="button" onClick={()=>setPaymentStatus('pending')} className={`rounded-lg border p-3 text-sm font-bold ${paymentStatus==='pending'?'border-amber-500 bg-amber-50 text-amber-900':'border-slate-200 text-slate-600'}`}>Unpaid / on account</button></div>
        <div className="mb-5"><label className={labelClass}>Payment reference (optional)</label><input className={fieldClass} value={paymentReference} onChange={e=>setPaymentReference(e.target.value.toUpperCase())} placeholder="M-Pesa code, bank ref or PDQ slip" /></div>
        <div className="flex gap-2"><Button variant="outline" className="flex-1" onClick={()=>setShowPayment(false)}>Back to sale</Button><Button className="flex-1" onClick={completeSale} isLoading={isSubmitting} disabled={isSubmitting}>Confirm sale · {formatKES(subtotal)}</Button></div>
      </div></div>}
    </div>
  );
}
