'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Building2, CalendarDays, Check, ChevronDown,
  CircleDollarSign, FileText, Plus, Search, Truck, Wallet, X,
} from 'lucide-react';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { formatKES } from '@/lib/formatters';
import { createClient } from '@/lib/supabase/client';

type Tab = 'overview' | 'suppliers' | 'invoices' | 'new-invoice' | 'payments';
type Supplier = {
  id: string; supplier_code: string; name: string; contact_person: string | null;
  phone: string | null; email: string | null; kra_pin: string | null; address: string | null;
  opening_balance_kes: number; opening_balance_date: string | null; notes: string | null; is_active: boolean;
};
type InvoiceItem = {
  id: string; product_id: string | null; description: string; quantity: number;
  unit_cost_kes: number; line_total_kes: number; track_stock: boolean;
};
type Invoice = {
  id: string; supplier_id: string; branch_id: string; invoice_number: string;
  invoice_date: string; due_date: string | null; subtotal_kes: number; tax_kes: number;
  total_kes: number; status: string; notes: string | null; posted_at: string;
  supplier?: { name: string; supplier_code: string } | null;
  branch?: { name: string } | null; items?: InvoiceItem[];
};
type Allocation = { id: string; invoice_id: string | null; amount_kes: number; invoice?: { invoice_number: string } | null };
type SupplierPayment = {
  id: string; supplier_id: string; payment_date: string; amount_kes: number;
  payment_method: string; reference: string | null; notes: string | null;
  supplier?: { name: string } | null; allocations?: Allocation[];
};
type InvoiceLineDraft = {
  key: string; product_id: string; description: string; quantity: string;
  unit_cost_kes: string; track_stock: boolean;
};
type PaymentAllocationDraft = { key: string; invoice_id: string; amount_kes: string };

const today = () => new Date().toLocaleDateString('en-CA');
const newKey = () => Math.random().toString(36).slice(2, 10);
const emptyLine = (): InvoiceLineDraft => ({ key: newKey(), product_id: '', description: '', quantity: '1', unit_cost_kes: '', track_stock: false });
const emptyAllocation = (): PaymentAllocationDraft => ({ key: newKey(), invoice_id: '', amount_kes: '' });
const canUse = (role?: string) => role === 'admin' || role === 'director' || role === 'operator';

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block min-w-0 ${className}`}><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>;
}
const inputClass = 'min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100';
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50';

function money(value: number | string | null | undefined) {
  return formatKES(Number(value || 0));
}
function dateLabel(value?: string | null) {
  if (!value) return '—';
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PurchasesPage() {
  const { currentUser, branches, products } = useStore();
  const { showError, showSuccess } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceDay, setInvoiceDay] = useState(today());
  const [invoiceSupplierFilter, setInvoiceSupplierFilter] = useState('all');
  const [paymentDay, setPaymentDay] = useState(today());
  const [editingSupplier, setEditingSupplier] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    supplier_code: '', name: '', contact_person: '', phone: '', email: '',
    kra_pin: '', address: '', opening_balance_kes: '0', opening_balance_date: today(), notes: '',
  });
  const [invoiceForm, setInvoiceForm] = useState({
    supplier_id: '', branch_id: '', invoice_number: '', invoice_date: today(),
    due_date: '', tax_kes: '0', notes: '',
  });
  const [lines, setLines] = useState<InvoiceLineDraft[]>([emptyLine()]);
  const [paymentForm, setPaymentForm] = useState({
    supplier_id: '', payment_date: today(), payment_method: 'mpesa',
    reference: '', notes: '',
  });
  const [allocations, setAllocations] = useState<PaymentAllocationDraft[]>([emptyAllocation()]);

  const loadData = useCallback(async () => {
    if (!currentUser || !canUse(currentUser.role)) return;
    setLoading(true);
    const supabase = createClient();
    const [s, i, p] = await Promise.all([
      supabase.from('suppliers').select('*').order('name'),
      supabase.from('supplier_invoices')
        .select('*, supplier:suppliers(name,supplier_code), branch:branches(name), items:supplier_invoice_items(*)')
        .order('invoice_date', { ascending: false }).limit(500),
      supabase.from('supplier_payments')
        .select('*, supplier:suppliers(name), allocations:supplier_payment_allocations(*, invoice:supplier_invoices(invoice_number))')
        .order('payment_date', { ascending: false }).limit(500),
    ]);
    if (s.error) showError(`Could not load suppliers: ${s.error.message}`);
    else setSuppliers((s.data || []).map((row: any) => ({ ...row, opening_balance_kes: Number(row.opening_balance_kes || 0) })));
    if (i.error) showError(`Could not load supplier invoices: ${i.error.message}`);
    else setInvoices((i.data || []).map((row: any) => ({ ...row, subtotal_kes: Number(row.subtotal_kes), tax_kes: Number(row.tax_kes), total_kes: Number(row.total_kes), items: (row.items || []).map((line: any) => ({ ...line, quantity: Number(line.quantity), unit_cost_kes: Number(line.unit_cost_kes), line_total_kes: Number(line.line_total_kes) })) })));
    if (p.error) showError(`Could not load supplier payments: ${p.error.message}`);
    else setPayments((p.data || []).map((row: any) => ({ ...row, amount_kes: Number(row.amount_kes), allocations: (row.allocations || []).map((a: any) => ({ ...a, amount_kes: Number(a.amount_kes) })) })));
    setLoading(false);
  }, [currentUser, showError]);

  useEffect(() => { void loadData(); }, [loadData]);

  const invoicePaid = useMemo(() => {
    const map = new Map<string, number>();
    payments.forEach(payment => (payment.allocations || []).forEach(a => {
      if (a.invoice_id) map.set(a.invoice_id, (map.get(a.invoice_id) || 0) + a.amount_kes);
    }));
    return map;
  }, [payments]);
  const openingPaid = useMemo(() => {
    const map = new Map<string, number>();
    payments.forEach(payment => (payment.allocations || []).forEach(a => {
      if (!a.invoice_id) map.set(payment.supplier_id, (map.get(payment.supplier_id) || 0) + a.amount_kes);
    }));
    return map;
  }, [payments]);
  const supplierBalances = useMemo(() => {
    const map = new Map<string, number>();
    suppliers.forEach(s => map.set(s.id, Math.max(0, s.opening_balance_kes - (openingPaid.get(s.id) || 0))));
    invoices.filter(i => i.status === 'posted').forEach(i => map.set(i.supplier_id, (map.get(i.supplier_id) || 0) + Math.max(0, i.total_kes - (invoicePaid.get(i.id) || 0))));
    return map;
  }, [suppliers, invoices, invoicePaid, openingPaid]);
  const totalPayable = Array.from(supplierBalances.values()).reduce((a, b) => a + b, 0);
  const outstandingInvoices = invoices.filter(i => i.status === 'posted' && i.total_kes - (invoicePaid.get(i.id) || 0) > 0.009);
  const selectedSupplier = suppliers.find(s => s.id === paymentForm.supplier_id);
  const supplierOpenInvoices = outstandingInvoices.filter(i => i.supplier_id === paymentForm.supplier_id);
  const openingRemaining = selectedSupplier ? Math.max(0, selectedSupplier.opening_balance_kes - (openingPaid.get(selectedSupplier.id) || 0)) : 0;
  const dailyInvoices = invoices.filter(i => i.invoice_date === invoiceDay && (invoiceSupplierFilter === 'all' || i.supplier_id === invoiceSupplierFilter));
  const dailyTotal = dailyInvoices.reduce((sum, i) => sum + i.total_kes, 0);
  const filteredSuppliers = suppliers.filter(s => `${s.name} ${s.supplier_code} ${s.phone || ''} ${s.contact_person || ''}`.toLowerCase().includes(supplierSearch.toLowerCase()));
  const filteredInvoices = invoices.filter(i => {
    const q = invoiceSearch.toLowerCase();
    return !q || `${i.invoice_number} ${i.supplier?.name || ''} ${i.branch?.name || ''}`.toLowerCase().includes(q);
  });

  const setSupplierField = (key: string, value: string) => setSupplierForm(prev => ({ ...prev, [key]: value }));
  const startNewSupplier = () => {
    setEditingSupplier(null);
    setSupplierForm({ supplier_code: '', name: '', contact_person: '', phone: '', email: '', kra_pin: '', address: '', opening_balance_kes: '0', opening_balance_date: today(), notes: '' });
    setTab('suppliers');
  };
  const editSupplier = (s: Supplier) => {
    setEditingSupplier(s.id);
    setSupplierForm({
      supplier_code: s.supplier_code, name: s.name, contact_person: s.contact_person || '',
      phone: s.phone || '', email: s.email || '', kra_pin: s.kra_pin || '', address: s.address || '',
      opening_balance_kes: String(s.opening_balance_kes), opening_balance_date: s.opening_balance_date || today(), notes: s.notes || '',
    });
  };
  const saveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierForm.name.trim()) return showError('Enter the supplier name.');
    setSaving(true);
    const supabase = createClient();
    const payload = {
      supplier_code: supplierForm.supplier_code.trim() || `SUP-${Date.now().toString().slice(-6)}`,
      name: supplierForm.name.trim(), contact_person: supplierForm.contact_person.trim() || null,
      phone: supplierForm.phone.trim() || null, email: supplierForm.email.trim() || null,
      kra_pin: supplierForm.kra_pin.trim() || null, address: supplierForm.address.trim() || null,
      opening_balance_kes: Number(supplierForm.opening_balance_kes || 0),
      opening_balance_date: supplierForm.opening_balance_date || null, notes: supplierForm.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const result = editingSupplier
      ? await supabase.from('suppliers').update(payload).eq('id', editingSupplier)
      : await supabase.from('suppliers').insert({ ...payload, created_by: currentUser?.id });
    setSaving(false);
    if (result.error) return showError(result.error.message);
    showSuccess(editingSupplier ? 'Supplier updated.' : 'Supplier added.');
    setEditingSupplier(null);
    setSupplierForm({ supplier_code: '', name: '', contact_person: '', phone: '', email: '', kra_pin: '', address: '', opening_balance_kes: '0', opening_balance_date: today(), notes: '' });
    await loadData();
  };

  const updateLine = (key: string, patch: Partial<InvoiceLineDraft>) => setLines(prev => prev.map(line => line.key === key ? { ...line, ...patch } : line));
  const invoiceSubtotal = lines.reduce((sum, line) => sum + Math.max(0, Number(line.quantity || 0)) * Math.max(0, Number(line.unit_cost_kes || 0)), 0);
  const invoiceTotal = invoiceSubtotal + Math.max(0, Number(invoiceForm.tax_kes || 0));
  const postInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceForm.supplier_id || !invoiceForm.branch_id || !invoiceForm.invoice_number.trim()) return showError('Select a supplier and branch, and enter the supplier invoice number.');
    if (!lines.length || lines.some(line => !line.description.trim() || Number(line.quantity) <= 0 || line.unit_cost_kes === '' || Number(line.unit_cost_kes) < 0)) return showError('Complete every invoice line before posting.');
    setSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.rpc('post_supplier_invoice', {
      p_invoice: {
        supplier_id: invoiceForm.supplier_id, branch_id: invoiceForm.branch_id,
        invoice_number: invoiceForm.invoice_number.trim(), invoice_date: invoiceForm.invoice_date,
        due_date: invoiceForm.due_date || null, tax_kes: Number(invoiceForm.tax_kes || 0), notes: invoiceForm.notes.trim() || null,
      },
      p_items: lines.map(line => ({
        product_id: line.product_id || null, description: line.description.trim(),
        quantity: Number(line.quantity), unit_cost_kes: Number(line.unit_cost_kes),
        track_stock: line.track_stock,
      })),
    });
    setSaving(false);
    if (error) return showError(error.message);
    showSuccess('Supplier invoice posted and recorded.');
    setInvoiceForm({ supplier_id: '', branch_id: '', invoice_number: '', invoice_date: today(), due_date: '', tax_kes: '0', notes: '' });
    setLines([emptyLine()]);
    await loadData();
    setTab('invoices');
  };

  const paymentTotal = allocations.reduce((sum, a) => sum + Math.max(0, Number(a.amount_kes || 0)), 0);
  const postPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentForm.supplier_id || !allocations.length || allocations.some(a => !a.invoice_id || Number(a.amount_kes) <= 0)) return showError('Select outstanding balances and enter each amount to allocate.');
    if (allocations.some(a => a.invoice_id === 'opening' && !openingRemaining)) return showError('There is no opening balance remaining for this supplier.');
    const seen = new Set<string>();
    for (const allocation of allocations) {
      if (seen.has(allocation.invoice_id)) return showError('Each invoice can only appear once in a payment.');
      seen.add(allocation.invoice_id);
      const balance = allocation.invoice_id === 'opening'
        ? openingRemaining
        : Math.max(0, (supplierOpenInvoices.find(i => i.id === allocation.invoice_id)?.total_kes || 0) - (invoicePaid.get(allocation.invoice_id) || 0));
      if (Number(allocation.amount_kes) > balance + 0.009) return showError('An allocation is greater than the selected outstanding balance.');
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.rpc('record_supplier_payment', {
      p_payment: {
        supplier_id: paymentForm.supplier_id, payment_date: paymentForm.payment_date,
        amount_kes: Number(paymentTotal.toFixed(2)), payment_method: paymentForm.payment_method,
        reference: paymentForm.reference.trim() || null, notes: paymentForm.notes.trim() || null,
      },
      p_allocations: allocations.map(a => ({ invoice_id: a.invoice_id === 'opening' ? null : a.invoice_id, amount_kes: Number(a.amount_kes) })),
    });
    setSaving(false);
    if (error) return showError(error.message);
    showSuccess('Supplier payment recorded.');
    setPaymentForm({ supplier_id: '', payment_date: today(), payment_method: 'mpesa', reference: '', notes: '' });
    setAllocations([emptyAllocation()]);
    await loadData();
  };

  const setProductOnLine = (key: string, productId: string) => {
    const product = products.find(p => p.id === productId);
    updateLine(key, {
      product_id: productId,
      description: product ? `${product.brand} ${product.size_kg ? `${product.size_kg}kg` : product.name}` : '',
      track_stock: !!product,
    });
  };

  if (!currentUser || !canUse(currentUser.role) || currentUser.approval_status !== 'approved') {
    return <main className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-lg font-semibold text-slate-900">Purchases access restricted</h1><p className="mt-2 text-sm text-slate-500">This section is available to approved administrators, directors and operators.</p></main>;
  }

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: CircleDollarSign },
    { id: 'suppliers', label: 'Suppliers', icon: Building2 },
    { id: 'invoices', label: 'Invoices', icon: FileText },
    { id: 'new-invoice', label: 'Post invoice', icon: Plus },
    { id: 'payments', label: 'Pay suppliers', icon: Wallet },
  ];

  return (
    <main className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 pb-28 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accounts payable</p><h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Purchases & suppliers</h1><p className="mt-1 text-sm text-slate-600">Supplier invoices, balances and payments in one place.</p></div>
        <button type="button" className={buttonClass} onClick={() => setTab('new-invoice')}><Plus className="h-4 w-4" /> Post supplier invoice</button>
      </header>

      <nav aria-label="Purchases navigation" className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
        {tabs.map(item => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => setTab(item.id)} className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition ${tab === item.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" />{item.label}</button>; })}
      </nav>

      {loading ? <div className="rounded-xl border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-500">Loading supplier accounts…</div> : null}

      {!loading && tab === 'overview' && <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total outstanding', value: money(totalPayable), icon: Wallet, note: 'All supplier balances' },
            { label: 'Active suppliers', value: suppliers.filter(s => s.is_active).length.toString(), icon: Building2, note: 'Available for purchases' },
            { label: 'Unpaid invoices', value: outstandingInvoices.length.toString(), icon: FileText, note: 'Fully or partly unpaid' },
            { label: 'Invoices today', value: dailyInvoices.length.toString(), icon: CalendarDays, note: money(dailyTotal) },
          ].map(card => { const Icon = card.icon; return <section key={card.label} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">{card.label}</span><Icon className="h-4 w-4 text-slate-400" /></div><p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">{card.value}</p><p className="mt-1 text-xs text-slate-500">{card.note}</p></section>; })}
        </section>
        <section className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-semibold text-slate-900">Supplier balances</h2><p className="text-xs text-slate-500">Largest outstanding balances first</p></div><button type="button" className="text-xs font-semibold text-orange-700" onClick={() => setTab('suppliers')}>All suppliers</button></div>
            <div className="divide-y divide-slate-100">{suppliers.filter(s => s.is_active && (supplierBalances.get(s.id) || 0) > 0).sort((a,b) => (supplierBalances.get(b.id)||0)-(supplierBalances.get(a.id)||0)).slice(0,8).map(s => <button key={s.id} type="button" onClick={() => { setPaymentForm(p => ({ ...p, supplier_id: s.id })); setTab('payments'); }} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-900">{s.name}</span><span className="text-xs text-slate-500">{s.supplier_code}</span></span><span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{money(supplierBalances.get(s.id))}</span></button>)}{!suppliers.some(s => s.is_active && (supplierBalances.get(s.id)||0)>0) && <p className="px-4 py-10 text-center text-sm text-slate-500">No outstanding supplier balances.</p>}</div>
          </section>
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-semibold text-slate-900">Invoices for a day</h2><p className="text-xs text-slate-500">Review what was posted on a specific date</p></div><CalendarDays className="h-4 w-4 text-slate-400" /></div>
            <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-slate-100 p-3"><input type="date" className={inputClass} value={invoiceDay} onChange={e => setInvoiceDay(e.target.value)} /><span className="self-center text-sm font-semibold tabular-nums">{money(dailyTotal)}</span></div>
            <div className="divide-y divide-slate-100">{dailyInvoices.slice(0,7).map(i => <div key={i.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{i.supplier?.name || 'Supplier'} · {i.invoice_number}</p><p className="text-xs text-slate-500">{i.branch?.name || 'Branch'} · {dateLabel(i.invoice_date)}</p></div><span className="shrink-0 text-sm font-semibold tabular-nums">{money(i.total_kes)}</span></div>)}{dailyInvoices.length===0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No invoices recorded for this date.</p>}</div>
            {dailyInvoices.length>7 && <button type="button" onClick={() => setTab('invoices')} className="w-full border-t border-slate-100 px-4 py-2.5 text-xs font-semibold text-orange-700">View all {dailyInvoices.length} invoices</button>}
          </section>
        </section>
        <section className="flex flex-wrap gap-2"><button type="button" className={secondaryClass} onClick={startNewSupplier}><Plus className="h-4 w-4" /> Add supplier</button><button type="button" className={secondaryClass} onClick={() => setTab('new-invoice')}><FileText className="h-4 w-4" /> Post invoice</button><button type="button" className={secondaryClass} onClick={() => setTab('payments')}><Wallet className="h-4 w-4" /> Record payment</button></section>
      </>}

      {!loading && tab === 'suppliers' && <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Supplier directory</h2><p className="text-xs text-slate-500">{suppliers.length} registered suppliers</p></div><div className="relative w-full sm:max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-9`} placeholder="Search supplier…" value={supplierSearch} onChange={e => setSupplierSearch(e.target.value)} /></div></div>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-semibold">Supplier</th><th className="px-4 py-3 font-semibold">Contact</th><th className="px-4 py-3 text-right font-semibold">Balance</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">{filteredSuppliers.map(s => <tr key={s.id} className="hover:bg-slate-50/70"><td className="px-4 py-3"><p className="font-semibold text-slate-900">{s.name}</p><p className="text-xs text-slate-500">{s.supplier_code}</p></td><td className="px-4 py-3"><p className="text-slate-700">{s.phone || '—'}</p><p className="text-xs text-slate-500">{s.contact_person || s.email || ''}</p></td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(supplierBalances.get(s.id))}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${s.is_active?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500'}`}>{s.is_active?'Active':'Inactive'}</span></td><td className="px-4 py-3 text-right"><button type="button" className="text-xs font-semibold text-orange-700 hover:text-orange-800" onClick={() => editSupplier(s)}>Edit</button></td></tr>)}</tbody></table></div>
          {filteredSuppliers.length===0 && <p className="px-4 py-10 text-center text-sm text-slate-500">No suppliers match your search.</p>}
        </section>
        <form onSubmit={saveSupplier} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold text-slate-900">{editingSupplier?'Edit supplier':'Add supplier'}</h2><p className="text-xs text-slate-500">Supplier details and any brought-forward balance</p></div>{editingSupplier && <button type="button" className="text-slate-400 hover:text-slate-700" onClick={() => { setEditingSupplier(null); setSupplierForm({ supplier_code:'',name:'',contact_person:'',phone:'',email:'',kra_pin:'',address:'',opening_balance_kes:'0',opening_balance_date:today(),notes:'' }); }}><X className="h-4 w-4" /></button>}</div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Supplier name *" className="sm:col-span-2"><input className={inputClass} required value={supplierForm.name} onChange={e=>setSupplierField('name',e.target.value)} placeholder="e.g. TotalEnergies" /></Field><Field label="Supplier code"><input className={inputClass} value={supplierForm.supplier_code} onChange={e=>setSupplierField('supplier_code',e.target.value)} placeholder="Auto-generated if blank" /></Field><Field label="Contact person"><input className={inputClass} value={supplierForm.contact_person} onChange={e=>setSupplierField('contact_person',e.target.value)} /></Field><Field label="Phone"><input className={inputClass} value={supplierForm.phone} onChange={e=>setSupplierField('phone',e.target.value)} /></Field><Field label="Email"><input type="email" className={inputClass} value={supplierForm.email} onChange={e=>setSupplierField('email',e.target.value)} /></Field><Field label="KRA PIN"><input className={inputClass} value={supplierForm.kra_pin} onChange={e=>setSupplierField('kra_pin',e.target.value)} /></Field><Field label="Address"><input className={inputClass} value={supplierForm.address} onChange={e=>setSupplierField('address',e.target.value)} /></Field><Field label="Opening balance (KES)"><input type="number" min="0" step="0.01" className={inputClass} value={supplierForm.opening_balance_kes} onChange={e=>setSupplierField('opening_balance_kes',e.target.value)} /></Field><Field label="Opening balance date"><input type="date" className={inputClass} value={supplierForm.opening_balance_date} onChange={e=>setSupplierField('opening_balance_date',e.target.value)} /></Field><Field label="Notes" className="sm:col-span-2"><textarea className={inputClass} rows={2} value={supplierForm.notes} onChange={e=>setSupplierField('notes',e.target.value)} /></Field></div>
          <button className={buttonClass} disabled={saving} type="submit">{saving?'Saving…':editingSupplier?'Save changes':'Save supplier'}</button>
        </form>
      </section>}

      {!loading && tab === 'new-invoice' && <form onSubmit={postInvoice} className="space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Supplier invoice details</h2><p className="text-xs text-slate-500">Enter the supplier's document details exactly as printed</p></div><span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">Posting is final</span></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Field label="Supplier *"><select required className={inputClass} value={invoiceForm.supplier_id} onChange={e=>setInvoiceForm(p=>({...p,supplier_id:e.target.value}))}><option value="">Select supplier…</option>{suppliers.filter(s=>s.is_active).map(s=><option key={s.id} value={s.id}>{s.name} ({s.supplier_code})</option>)}</select></Field><Field label="Receiving branch *"><select required className={inputClass} value={invoiceForm.branch_id} onChange={e=>setInvoiceForm(p=>({...p,branch_id:e.target.value}))}><option value="">Select branch…</option>{branches.filter(b=>b.is_active).map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></Field><Field label="Supplier invoice number *"><input required className={inputClass} value={invoiceForm.invoice_number} onChange={e=>setInvoiceForm(p=>({...p,invoice_number:e.target.value}))} placeholder="As printed on supplier invoice" /></Field><Field label="Invoice date *"><input required type="date" className={inputClass} value={invoiceForm.invoice_date} onChange={e=>setInvoiceForm(p=>({...p,invoice_date:e.target.value}))} /></Field><Field label="Due date"><input type="date" className={inputClass} min={invoiceForm.invoice_date} value={invoiceForm.due_date} onChange={e=>setInvoiceForm(p=>({...p,due_date:e.target.value}))} /></Field><Field label="Tax / VAT (KES)"><input type="number" min="0" step="0.01" className={inputClass} value={invoiceForm.tax_kes} onChange={e=>setInvoiceForm(p=>({...p,tax_kes:e.target.value}))} /></Field></div>
        </section>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><h2 className="text-sm font-semibold text-slate-900">Invoice items</h2><p className="text-xs text-slate-500">Choose a catalogue item to add it to branch stock, or enter a non-stock charge</p></div><button type="button" className={secondaryClass} onClick={()=>setLines(p=>[...p,emptyLine()])}><Plus className="h-4 w-4" /> Add line</button></div>
          <div className="space-y-3 p-4">{lines.map((line,index)=><div key={line.key} className="grid gap-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-2 lg:grid-cols-[1.4fr_1.5fr_.6fr_.8fr_.9fr_auto] lg:items-end"><Field label={`Catalogue item ${index+1}`}><select className={inputClass} value={line.product_id} onChange={e=>setProductOnLine(line.key,e.target.value)}><option value="">Non-stock / custom charge</option>{products.filter(p=>p.is_active).map(p=><option key={p.id} value={p.id}>{p.brand} · {p.size_kg?p.size_kg+'kg':p.name}</option>)}</select></Field><Field label="Description *"><input required className={inputClass} value={line.description} onChange={e=>updateLine(line.key,{description:e.target.value})} placeholder="Goods or service description" /></Field><Field label="Quantity *"><input required type="number" min="0.001" step="0.001" className={inputClass} value={line.quantity} onChange={e=>updateLine(line.key,{quantity:e.target.value})} /></Field><Field label="Unit cost (KES) *"><input required type="number" min="0" step="0.01" className={inputClass} value={line.unit_cost_kes} onChange={e=>updateLine(line.key,{unit_cost_kes:e.target.value})} placeholder="0.00" /></Field><div className="flex flex-col gap-2"><span className="text-xs font-semibold text-slate-600">Line total</span><span className="min-h-10 flex items-center text-sm font-semibold tabular-nums">{money(Number(line.quantity||0)*Number(line.unit_cost_kes||0))}</span><label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={line.track_stock} disabled={!line.product_id} onChange={e=>updateLine(line.key,{track_stock:e.target.checked})} /> Add to stock</label></div><button type="button" aria-label="Remove invoice line" disabled={lines.length===1} onClick={()=>setLines(p=>p.filter(l=>l.key!==line.key))} className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><X className="h-4 w-4" /></button></div>)}</div>
          <div className="grid gap-4 border-t border-slate-100 bg-slate-50/70 p-4 sm:grid-cols-[1fr_280px]"><Field label="Notes / delivery reference"><textarea rows={2} className={inputClass} value={invoiceForm.notes} onChange={e=>setInvoiceForm(p=>({...p,notes:e.target.value}))} /></Field><div className="space-y-2 text-sm"><div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-medium tabular-nums">{money(invoiceSubtotal)}</span></div><div className="flex justify-between text-slate-600"><span>Tax / VAT</span><span className="font-medium tabular-nums">{money(invoiceForm.tax_kes)}</span></div><div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold text-slate-950"><span>Invoice total</span><span className="tabular-nums">{money(invoiceTotal)}</span></div><button type="submit" className={`${buttonClass} w-full`} disabled={saving||!suppliers.some(s=>s.is_active)||!branches.some(b=>b.is_active)}>{saving?'Posting invoice…':'Post invoice'}</button></div></div>
        </section>
        <p className="text-xs text-slate-500">Posting records the supplier liability. Only lines marked “Add to stock” increase the selected branch's stock. Posted invoices are not editable or deletable; corrections should be handled through a documented credit note workflow.</p>
      </form>}

      {!loading && tab === 'invoices' && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-[1fr_180px_220px]"><div><h2 className="text-sm font-semibold text-slate-900">Supplier invoices</h2><p className="text-xs text-slate-500">Posted purchase invoices and remaining balances</p></div><Field label="Invoice date"><input type="date" className={inputClass} value={invoiceDay} onChange={e=>setInvoiceDay(e.target.value)} /></Field><Field label="Supplier"><select className={inputClass} value={invoiceSupplierFilter} onChange={e=>setInvoiceSupplierFilter(e.target.value)}><option value="all">All suppliers</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field></div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3"><div className="relative w-full max-w-xs"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-9`} placeholder="Search invoice or supplier…" value={invoiceSearch} onChange={e=>setInvoiceSearch(e.target.value)} /></div><div className="text-sm text-slate-600">{dailyInvoices.length} invoices · <strong className="text-slate-900">{money(dailyTotal)}</strong> on selected day</div></div>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-semibold">Invoice</th><th className="px-4 py-3 font-semibold">Supplier</th><th className="px-4 py-3 font-semibold">Branch</th><th className="px-4 py-3 font-semibold">Date</th><th className="px-4 py-3 text-right font-semibold">Total</th><th className="px-4 py-3 text-right font-semibold">Paid</th><th className="px-4 py-3 text-right font-semibold">Balance</th></tr></thead><tbody className="divide-y divide-slate-100">{filteredInvoices.filter(i=>i.invoice_date===invoiceDay&&(invoiceSupplierFilter==='all'||i.supplier_id===invoiceSupplierFilter)).map(i=>{const paid=invoicePaid.get(i.id)||0;return <tr key={i.id} className="hover:bg-slate-50/70"><td className="px-4 py-3"><p className="font-semibold text-slate-900">{i.invoice_number}</p><p className="text-xs text-slate-500">{i.items?.length||0} line items</p></td><td className="px-4 py-3 text-slate-700">{i.supplier?.name||'—'}</td><td className="px-4 py-3 text-slate-700">{i.branch?.name||'—'}</td><td className="px-4 py-3 text-slate-600">{dateLabel(i.invoice_date)}</td><td className="px-4 py-3 text-right tabular-nums">{money(i.total_kes)}</td><td className="px-4 py-3 text-right tabular-nums text-emerald-700">{money(paid)}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{money(Math.max(0,i.total_kes-paid))}</td></tr>;})}</tbody></table></div>
        {filteredInvoices.filter(i=>i.invoice_date===invoiceDay&&(invoiceSupplierFilter==='all'||i.supplier_id===invoiceSupplierFilter)).length===0&&<p className="px-4 py-12 text-center text-sm text-slate-500">No supplier invoices found for the selected filters.</p>}
      </section>}

      {!loading && tab === 'payments' && <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <form onSubmit={postPayment} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div><h2 className="text-sm font-semibold text-slate-900">Record supplier payment</h2><p className="text-xs text-slate-500">Allocate the payment against one or more outstanding invoices or an opening balance.</p></div>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Supplier *" className="sm:col-span-2"><select required className={inputClass} value={paymentForm.supplier_id} onChange={e=>{setPaymentForm(p=>({...p,supplier_id:e.target.value}));setAllocations([emptyAllocation()]);}}><option value="">Choose supplier…</option>{suppliers.filter(s=>s.is_active&&(supplierBalances.get(s.id)||0)>0).map(s=><option key={s.id} value={s.id}>{s.name} · {money(supplierBalances.get(s.id))} due</option>)}</select></Field><Field label="Payment date *"><input type="date" required className={inputClass} value={paymentForm.payment_date} onChange={e=>setPaymentForm(p=>({...p,payment_date:e.target.value}))} /></Field><Field label="Payment method *"><select className={inputClass} value={paymentForm.payment_method} onChange={e=>setPaymentForm(p=>({...p,payment_method:e.target.value}))}><option value="mpesa">M-Pesa</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="pdq">PDQ</option></select></Field><Field label="Transaction / cheque reference"><input className={inputClass} value={paymentForm.reference} onChange={e=>setPaymentForm(p=>({...p,reference:e.target.value}))} placeholder="Optional reference" /></Field><Field label="Notes"><input className={inputClass} value={paymentForm.notes} onChange={e=>setPaymentForm(p=>({...p,notes:e.target.value}))} /></Field></div>
          <div className="space-y-3 rounded-lg border border-slate-100 p-3"><div className="flex items-center justify-between"><h3 className="text-xs font-semibold text-slate-700">Payment allocation</h3><button type="button" className="text-xs font-semibold text-orange-700" disabled={!paymentForm.supplier_id} onClick={()=>setAllocations(p=>[...p,emptyAllocation()])}><Plus className="mr-1 inline h-3.5 w-3.5" />Add allocation</button></div>
            {allocations.map((a,index)=><div key={a.key} className="grid grid-cols-[minmax(0,1fr)_120px_32px] items-end gap-2"><Field label={index===0?'Apply to':'Additional allocation'}><select required className={inputClass} value={a.invoice_id} onChange={e=>setAllocations(p=>p.map(x=>x.key===a.key?{...x,invoice_id:e.target.value}:x))}><option value="">Select balance…</option>{openingRemaining>0&&<option value="opening">Opening balance · {money(openingRemaining)}</option>}{supplierOpenInvoices.map(i=><option key={i.id} value={i.id}>{i.invoice_number} · {money(i.total_kes-(invoicePaid.get(i.id)||0))} due</option>)}</select></Field><Field label="Amount (KES)"><input required type="number" min="0.01" step="0.01" className={inputClass} value={a.amount_kes} onChange={e=>setAllocations(p=>p.map(x=>x.key===a.key?{...x,amount_kes:e.target.value}:x))} /></Field><button type="button" aria-label="Remove allocation" disabled={allocations.length===1} onClick={()=>setAllocations(p=>p.filter(x=>x.key!==a.key))} className="mb-0.5 flex h-10 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><X className="h-4 w-4" /></button></div>)}
            <div className="flex justify-between border-t border-slate-100 pt-3 text-sm"><span className="text-slate-600">Payment total</span><strong className="tabular-nums text-slate-950">{money(paymentTotal)}</strong></div>
          </div>
          <button type="submit" className={buttonClass} disabled={saving||!paymentForm.supplier_id||paymentTotal<=0}>{saving?'Recording payment…':'Record payment'}</button>
        </form>
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 p-4"><div><h2 className="text-sm font-semibold text-slate-900">Payment history</h2><p className="text-xs text-slate-500">Payments recorded by date</p></div><Wallet className="h-4 w-4 text-slate-400" /></div><div className="p-3"><Field label="Payment date"><input type="date" className={inputClass} value={paymentDay} onChange={e=>setPaymentDay(e.target.value)} /></Field></div><div className="divide-y divide-slate-100">{payments.filter(p=>p.payment_date===paymentDay).map(p=><div key={p.id} className="px-4 py-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-slate-900">{p.supplier?.name||'Supplier'}</p><p className="text-xs text-slate-500">{p.payment_method.replace('_',' ')} · {p.reference||'No reference'}</p></div><strong className="text-sm tabular-nums text-emerald-700">{money(p.amount_kes)}</strong></div><div className="mt-2 flex flex-wrap gap-1.5">{(p.allocations||[]).map(a=><span key={a.id} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600">{a.invoice?.invoice_number||'Opening balance'}: {money(a.amount_kes)}</span>)}</div></div>)}{payments.filter(p=>p.payment_date===paymentDay).length===0&&<p className="px-4 py-10 text-center text-sm text-slate-500">No supplier payments recorded for this date.</p>}</div></section>
      </section>}
    </main>
  );
}
