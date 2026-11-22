'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronDown, FileText, Package, Wallet } from 'lucide-react';
import type { Branch, BranchInventory, Customer, OrderType, PaymentMethod, PaymentStatus, Product, StaffProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { formatKES } from '@/lib/formatters';
import { fieldClass, labelClass } from './pos-ui';
import { groupReturns, resizeReturns } from './pos-logic';
import { PosCartTable, newLine, type PosLine } from './pos-cart-line';
import { PosCustomerPanel } from './pos-customer-panel';
import { PosPaymentModal, type PosPayment } from './pos-payment-modal';
import { PosProductSearch } from './pos-product-search';

export type { PosLine };

export interface PosSaleSubmission {
  client_request_id: string;
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
  mpesa_transaction_id?: string | null;
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
  createCustomer: (name: string, phone: string, estate: string, address?: string) => Promise<Customer>;
  onSubmit: (sale: PosSaleSubmission) => Promise<void>;
  isSubmitting: boolean;
  completedOrderNumber: string | null;
  onStartNextSale: () => void;
}

const today = () => {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
};
const defaultLocation = (c: Customer) => (c.locations.find(l => l.is_default) || c.locations[0])?.id || '';

export function PosWorkspace({
  branches, products, inventory, customers, staffList, currentUser, createCustomer, onSubmit,
  isSubmitting, completedOrderNumber, onStartNextSale,
}: PosWorkspaceProps) {
  const activeBranches = useMemo(() => branches.filter(b => b.is_active !== false), [branches]);
  const defaultBranchId = useMemo(
    () => activeBranches.find(b => b.id === currentUser.branch_id)?.id || activeBranches[0]?.id || '',
    [activeBranches, currentUser.branch_id],
  );
  const [branchId, setBranchId] = useState(defaultBranchId);
  const effectiveBranchId = useMemo(
    () => (activeBranches.some(b => b.id === branchId) ? branchId : defaultBranchId),
    [activeBranches, branchId, defaultBranchId],
  );
  const [receiptDate, setReceiptDate] = useState(today);
  const [receiptNumber, setReceiptNumber] = useState('');
  const [isDelivery, setIsDelivery] = useState(false);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [locationId, setLocationId] = useState('');
  const [riderId, setRiderId] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [lpoNumber, setLpoNumber] = useState('');
  const [saleComment, setSaleComment] = useState('');
  const [cart, setCart] = useState<PosLine[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [formError, setFormError] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef<string>(crypto.randomUUID());
  const prefilledCustomerRef = useRef(false);

  const activeRiders = staffList.filter(s => s.role === 'rider' && s.approval_status === 'approved');
  const canEditDate = ['admin', 'director', 'operator'].includes(currentUser.role);
  const total = cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const units = cart.reduce((sum, l) => sum + l.quantity, 0);
  const inCart = useMemo(() => new Set(cart.map(l => l.productId)), [cart]);

  useEffect(() => {
    if (!effectiveBranchId) return;
    if (branchId !== effectiveBranchId) {
      setBranchId(effectiveBranchId);
    }
    setCart(prev => {
      const needsFix = prev.some(l => !l.branchId || !activeBranches.some(b => b.id === l.branchId));
      if (!needsFix) return prev;
      return prev.map(l =>
        !l.branchId || !activeBranches.some(b => b.id === l.branchId) ? { ...l, branchId: effectiveBranchId } : l,
      );
    });
  }, [effectiveBranchId, branchId, activeBranches]);

  const chooseCustomer = (next: Customer | null) => {
    setCustomer(next);
    setLocationId(next ? defaultLocation(next) : '');
    setIsDelivery(Boolean(next));
    setFormError('');
  };

  useEffect(() => {
    if (prefilledCustomerRef.current || customers.length === 0) return;
    const id = new URLSearchParams(window.location.search).get('customerId');
    if (!id) {
      prefilledCustomerRef.current = true;
      return;
    }
    const match = customers.find(c => c.id === id);
    if (match) {
      prefilledCustomerRef.current = true;
      chooseCustomer(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers]);

  const stockFor = (branch: string, productId: string) =>
    inventory.find(r => r.branch_id === branch && r.product_id === productId)?.full_units ?? 0;
  const reservedByOthers = (line: PosLine) =>
    cart.filter(o => o.id !== line.id && o.productId === line.productId && o.branchId === line.branchId).reduce((s, o) => s + o.quantity, 0);

  const addProduct = (product: Product) => {
    setFormError('');
    requestIdRef.current = crypto.randomUUID();
    setCart(prev => {
      const existing = prev.find(l => l.productId === product.id && l.branchId === effectiveBranchId);
      if (!existing) return [newLine(product, effectiveBranchId), ...prev];
      const quantity = existing.quantity + 1;
      return prev.map(l => l.id === existing.id
        ? { ...l, quantity, returns: l.orderType === 'refill' ? resizeReturns(l.returns, quantity, l.outgoingBrand) : [] }
        : l);
    });
  };

  const updateLine = (id: string, patch: Partial<PosLine>) => {
    requestIdRef.current = crypto.randomUUID();
    setCart(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
  };
  const removeLine = (id: string) => {
    requestIdRef.current = crypto.randomUUID();
    setCart(prev => prev.filter(l => l.id !== id));
  };

  const changeBranch = (id: string) => {
    requestIdRef.current = crypto.randomUUID();
    setFormError('');
    setBranchId(id);
    setCart(prev => prev.map(l => ({ ...l, branchId: id })));
  };

  const chooseRider = (id: string) => {
    setRiderId(id);
    const plate = activeRiders.find(r => r.id === id)?.vehicle_plate;
    setVehiclePlate(plate || '');
  };

  const location = customer?.locations.find(l => l.id === locationId);

  const validate = (needCustomer = false) => {
    const fail = (msg: string) => { setFormError(msg); return false; };
    if (!effectiveBranchId) return fail('Select a branch.');
    if (!cart.length) return fail('Add at least one product.');
    if (!receiptNumber.trim()) return fail('Receipt number is required.');
    if (needCustomer && !customer) return fail('Select a customer to create an invoice.');
    if (isDelivery) {
      if (!customer) return fail('Select a customer for delivery.');
      if (!location) return fail('This customer has no saved delivery location.');
      if (!riderId) return fail('Assign a rider for delivery.');
    }
    const used = new Map<string, number>();
    for (const l of cart) {
      const lineBranch = l.branchId || effectiveBranchId;
      const key = `${lineBranch}:${l.productId}`;
      used.set(key, (used.get(key) || 0) + l.quantity);
    }
    for (const [key, qty] of used) {
      const [b, p] = key.split(':');
      const have = stockFor(b, p);
      if (qty > have) return fail(`Not enough stock: ${products.find(x => x.id === p)?.name || 'product'} has ${have}, sale needs ${qty}.`);
    }
    return true;
  };

  const buildSubmission = (payment: PosPayment): PosSaleSubmission => {
    const now = new Date();
    const [y, m, d] = receiptDate.split('-').map(Number);
    const createdAt = y && m && d ? new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString() : now.toISOString();
    const phone = customer?.phones.find(p => p.is_primary)?.phone_number || customer?.phones[0]?.phone_number;
    return {
      client_request_id: requestIdRef.current,
      branch_id: effectiveBranchId, is_pos_walkin: !isDelivery, customer_id: customer?.id || null,
      receipt_number: receiptNumber.trim(), created_at: createdAt,
      customer_name: customer?.name?.trim() || phone || 'Walk-in Counter Customer',
      customer_phone: phone || '+254700000000',
      delivery_estate: isDelivery ? location?.estate : undefined,
      delivery_address: isDelivery ? location?.specific_address || undefined : undefined,
      rider_ids: isDelivery && riderId ? [riderId] : [],
      vehicle_plate: isDelivery ? vehiclePlate || null : null,
      lpo_number: lpoNumber.trim() || undefined, sale_comment: saleComment.trim() || undefined,
      payment_method: payment.method, payment_status: payment.status,
      payment_reference: payment.reference,
      mpesa_transaction_id: payment.mpesaTransactionId || null,
      delivery_fee_kes: 0,
      items: cart.flatMap(l => {
        const base = {
          product_id: l.productId, branch_id: l.branchId || effectiveBranchId, order_type: l.orderType,
          outgoing_brand: l.outgoingBrand, cylinder_size_kg: l.cylinderSizeKg, unit_price_kes: l.unitPrice,
        };
        if (l.orderType !== 'refill') return [{ ...base, quantity: l.quantity }];
        return groupReturns(l.returns).map(r => ({ ...base, quantity: r.quantity, incoming_brand: r.brand }));
      }),
    };
  };

  const openPayment = () => { if (validate()) setShowPayment(true); };
  const saveInvoice = async () => {
    if (validate(true)) await onSubmit(buildSubmission({ method: 'cash', status: 'pending' }));
  };

  const resetSale = () => {
    requestIdRef.current = crypto.randomUUID();
    setCart([]); setCustomer(null); setLocationId(''); setIsDelivery(false); setRiderId(''); setVehiclePlate('');
    setReceiptNumber(''); setLpoNumber(''); setSaleComment(''); setFormError(''); setShowPayment(false);
    onStartNextSale();
  };

  if (completedOrderNumber) {
    return (
      <div className="mx-auto mt-6 max-w-md rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><CheckCircle2 className="h-7 w-7" /></div>
        <h1 className="text-xl font-semibold text-slate-950">Sale recorded</h1>
        <p className="mt-1 text-sm text-slate-600">Ticket <strong className="font-mono text-emerald-700">{completedOrderNumber}</strong></p>
        <Button autoFocus size="lg" className="mt-5 w-full" onClick={resetSale}>New sale</Button>
      </div>
    );
  }

  const canCharge = cart.length > 0 && !isSubmitting;
  const actions = (
    <div className="flex gap-2">
      {customer && (
        <Button type="button" variant="outline" size="md" onClick={() => void saveInvoice()} isLoading={isSubmitting} disabled={!canCharge} aria-label="Save as invoice, pay later">
          <FileText className="h-4 w-4" /><span className="hidden sm:inline lg:hidden xl:inline">Invoice</span>
        </Button>
      )}
      <Button type="button" size="md" className="flex-1" onClick={openPayment} disabled={!canCharge}>
        <Wallet className="h-4 w-4" />Charge {formatKES(total)}
      </Button>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[1440px] px-2 pb-32 pt-2 text-left sm:px-4 lg:px-5 lg:pb-24 xl:pb-6">
      <PosCustomerPanel
        branches={activeBranches} branchId={effectiveBranchId} receiptNumber={receiptNumber}
        receiptDate={receiptDate} maxDate={today()} canEditDate={canEditDate}
        customers={customers} customer={customer} isDelivery={isDelivery} locationId={locationId}
        riders={activeRiders} riderId={riderId} vehiclePlate={vehiclePlate}
        onBranch={changeBranch} onReceipt={setReceiptNumber} onDate={setReceiptDate}
        onSelect={chooseCustomer} onMode={setIsDelivery} onLocation={setLocationId}
        onRider={chooseRider} onVehicle={setVehiclePlate} createCustomer={createCustomer}
      />

      <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
        <section aria-label="Sale items" className="min-w-0">
          <PosProductSearch products={products} inventory={inventory} branchId={effectiveBranchId} inCart={inCart} inputRef={searchRef} onPick={addProduct} />
          {cart.length === 0 ? (
            <div className="mt-2 flex items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-6 text-xs text-slate-500">
              <Package className="h-4 w-4 text-slate-300" />No items
            </div>
          ) : (
            <div className="mt-2">
              <PosCartTable
                lines={cart} products={products} branches={activeBranches}
                availableFor={line => Math.max(0, stockFor(line.branchId, line.productId) - reservedByOthers(line))}
                onChange={updateLine} onRemove={removeLine}
              />
              <p className="mt-1 text-right text-[11px] text-slate-500">{cart.length} {cart.length === 1 ? 'line' : 'lines'} · {units} {units === 1 ? 'unit' : 'units'}</p>
            </div>
          )}
        </section>

        <aside className="space-y-2 lg:sticky lg:top-20">
          <details className="group rounded-md border border-slate-300 bg-white" open={Boolean(saleComment || lpoNumber)}>
            <summary className="flex h-8 cursor-pointer list-none items-center justify-between px-2.5 text-xs font-semibold text-slate-700">
              Notes &amp; LPO
              <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
            </summary>
            <div className="grid gap-1.5 px-2.5 pb-2.5">
              <div><label htmlFor="pos-lpo" className={labelClass}>LPO / PO</label><input id="pos-lpo" className={fieldClass} value={lpoNumber} onChange={e => setLpoNumber(e.target.value.toUpperCase())} placeholder="Optional" /></div>
              <div><label htmlFor="pos-comment" className={labelClass}>Comment</label><input id="pos-comment" className={fieldClass} value={saleComment} onChange={e => setSaleComment(e.target.value)} placeholder="Optional" /></div>
            </div>
          </details>

          <div className="hidden rounded-md border border-slate-300 bg-white p-3 lg:block">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total · {units} {units === 1 ? 'unit' : 'units'}</span>
              <span className="text-xl font-bold tabular-nums text-slate-950">{formatKES(total)}</span>
            </div>
            {isDelivery && <p className="mb-3 text-xs text-emerald-700">Delivery{location ? ` to ${location.estate}` : ''}</p>}
            {formError && <p role="alert" className="mb-3 flex items-start gap-1.5 text-xs font-medium text-red-700"><AlertCircle className="mt-px h-4 w-4 shrink-0" />{formError}</p>}
            {actions}
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-slate-200 bg-white/95 px-2 pb-1.5 pt-1.5 shadow-[0_-6px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
        {formError && <p role="alert" className="mb-2 flex items-start gap-1.5 text-xs font-medium text-red-700"><AlertCircle className="mt-px h-4 w-4 shrink-0" />{formError}</p>}
        <div className="mb-1 flex items-baseline justify-between text-xs text-slate-500">
          <span>{units} {units === 1 ? 'unit' : 'units'}{isDelivery ? ' · Delivery' : ''}</span>
          <span className="text-base font-semibold tabular-nums text-slate-950">{formatKES(total)}</span>
        </div>
        {actions}
      </div>

      {showPayment && (
        <PosPaymentModal
          total={total}
          branchId={effectiveBranchId}
          branchShortcode={activeBranches.find(b => b.id === effectiveBranchId)?.mpesa_shortcode}
          isSubmitting={isSubmitting}
          onClose={() => setShowPayment(false)}
          onConfirm={payment => void onSubmit(buildSubmission(payment))}
        />
      )}
    </div>
  );
}
