'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Building2, CircleDollarSign, MapPin, Phone, Plus, Search, Users, X } from 'lucide-react';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { formatKES } from '@/lib/formatters';
import type { Customer } from '@/types';

const canUse = (role?: string) => role === 'admin' || role === 'director' || role === 'operator';
const inputClass = 'min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100';
const buttonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50';

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={`block min-w-0 ${className}`}><span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>{children}</label>;
}

type StatusFilter = 'all' | 'active' | 'inactive';

export default function CustomersPage() {
  const { currentUser, customers, orders, createCustomer, updateCustomer, setCustomerActive, addCustomerPhone, addCustomerLocation } = useStore();
  const { showError, showSuccess } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', estate: '', specific_address: '' });
  const [extraPhone, setExtraPhone] = useState('');
  const [extraEstate, setExtraEstate] = useState('');
  const [extraAddress, setExtraAddress] = useState('');

  useEffect(() => {
    if (!editing) return;
    const fresh = customers.find((c) => c.id === editing.id);
    if (fresh) setEditing(fresh);
  }, [customers, editing?.id]);

  const balances = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach((o) => {
      if (!o.customer_id) return;
      const due = o.payment_status === 'paid' ? 0 : Number(o.total_kes || 0);
      if (due > 0) map.set(o.customer_id, (map.get(o.customer_id) || 0) + due);
    });
    return map;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return customers
      .filter((c) => {
        if (statusFilter === 'active' && c.is_active === false) return false;
        if (statusFilter === 'inactive' && c.is_active !== false) return false;
        if (!q) return true;
        const phones = (c.phones || []).map((p) => p.phone_number).join(' ');
        const locs = (c.locations || []).map((l) => `${l.estate} ${l.specific_address || ''}`).join(' ');
        return `${c.name || ''} ${phones} ${locs}`.toLowerCase().includes(q);
      })
      .sort((a, b) => {
        const balDiff = (balances.get(b.id) || 0) - (balances.get(a.id) || 0);
        if (balDiff !== 0) return balDiff;
        const an = (a.name || '').trim();
        const bn = (b.name || '').trim();
        if (!an && bn) return 1;
        if (an && !bn) return -1;
        return an.localeCompare(bn);
      });
  }, [customers, search, statusFilter, balances]);

  const activeCount = customers.filter((c) => c.is_active !== false).length;
  const totalOutstanding = Array.from(balances.values()).reduce((a, b) => a + b, 0);
  const withBalance = customers.filter((c) => (balances.get(c.id) || 0) > 0).length;

  if (!currentUser || !canUse(currentUser.role) || currentUser.approval_status !== 'approved') {
    return <main className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-lg font-semibold text-slate-900">Customers access restricted</h1><p className="mt-2 text-sm text-slate-500">This section is available to approved administrators, directors and operators.</p></main>;
  }

  const resetForm = () => {
    setEditing(null);
    setForm({ name: '', phone: '', estate: '', specific_address: '' });
    setExtraPhone('');
    setExtraEstate('');
    setExtraAddress('');
  };

  const startEdit = (c: Customer) => {
    setEditing(c);
    setForm({ name: c.name || '', phone: c.phones?.find(p => p.is_primary)?.phone_number || c.phones?.[0]?.phone_number || '', estate: c.locations?.find(l => l.is_default)?.estate || c.locations?.[0]?.estate || '', specific_address: c.locations?.find(l => l.is_default)?.specific_address || c.locations?.[0]?.specific_address || '' });
    setExtraPhone('');
    setExtraEstate('');
    setExtraAddress('');
  };

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await updateCustomer(editing.id, form.name);
        showSuccess('Customer updated.');
      } else {
        if (!form.phone.trim() || !form.estate.trim()) {
          showError('Phone number and location are required.');
          return;
        }
        await createCustomer(form.name, form.phone, form.estate, form.specific_address);
        showSuccess('Customer added.');
        resetForm();
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to save customer.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: Customer) => {
    setSaving(true);
    try {
      await setCustomerActive(c.id, c.is_active === false);
      showSuccess(c.is_active === false ? 'Customer reactivated.' : 'Customer deactivated.');
      if (editing?.id === c.id) setEditing({ ...c, is_active: c.is_active === false });
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update customer status.');
    } finally {
      setSaving(false);
    }
  };

  const onAddPhone = async () => {
    if (!editing || !extraPhone.trim()) return;
    setSaving(true);
    try {
      await addCustomerPhone(editing.id, extraPhone, !(editing.phones || []).length);
      setExtraPhone('');
      showSuccess('Phone number added.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add phone number.');
    } finally {
      setSaving(false);
    }
  };

  const onAddLocation = async () => {
    if (!editing || !extraEstate.trim()) return;
    setSaving(true);
    try {
      await addCustomerLocation(editing.id, extraEstate, extraAddress, !(editing.locations || []).length);
      setExtraEstate('');
      setExtraAddress('');
      showSuccess('Location added.');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to add location.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1440px] space-y-5 px-4 py-5 pb-28 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Customer accounts</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">Customers</h1>
          <p className="mt-1 text-sm text-slate-600">Manage all customer accounts, phone numbers, locations and outstanding balances. Every account must have at least one phone number and one location; the name is optional.</p>
        </div>
        <button type="button" className={buttonClass} onClick={resetForm}><Plus className="h-4 w-4" /> Add customer</button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'Total customers', value: String(customers.length), icon: Users, note: 'All records' },
          { label: 'Active customers', value: String(activeCount), icon: Building2, note: 'Available for sales' },
          { label: 'With balance', value: String(withBalance), icon: CircleDollarSign, note: 'Unpaid orders' },
          { label: 'Total outstanding', value: formatKES(totalOutstanding), icon: CircleDollarSign, note: 'Pending customer balances' },
        ].map((card) => {
          const Icon = card.icon;
          return <section key={card.label} className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between"><span className="text-xs font-semibold text-slate-500">{card.label}</span><Icon className="h-4 w-4 text-slate-400" /></div><p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">{card.value}</p><p className="mt-1 text-xs text-slate-500">{card.note}</p></section>;
        })}
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-sm font-semibold text-slate-900">Customer directory</h2><p className="text-xs text-slate-500">{filtered.length} shown · {customers.length} total</p></div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <select className={`${inputClass} sm:w-40`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                <option value="all">All statuses</option>
                <option value="active">Active only</option>
                <option value="inactive">Inactive only</option>
              </select>
              <div className="relative w-full sm:w-72"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={`${inputClass} pl-9`} placeholder="Search name, phone, location…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3 font-semibold">Customer</th><th className="px-4 py-3 font-semibold">Phone(s)</th><th className="px-4 py-3 font-semibold">Location(s)</th><th className="px-4 py-3 text-right font-semibold">Balance</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3"></th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const phones = c.phones || [];
                  const locs = c.locations || [];
                  const primaryPhone = phones.find(p => p.is_primary)?.phone_number || phones[0]?.phone_number || '—';
                  const extraPhones = Math.max(0, phones.length - 1);
                  const defaultLoc = locs.find(l => l.is_default) || locs[0];
                  const locText = defaultLoc ? [defaultLoc.estate, defaultLoc.specific_address].filter(Boolean).join(', ') : '—';
                  const extraLocs = Math.max(0, locs.length - 1);
                  const bal = balances.get(c.id) || 0;
                  return <tr key={c.id} className="hover:bg-slate-50/70"><td className="px-4 py-3"><p className="font-semibold text-slate-900">{c.name || 'Unnamed customer'}</p><p className="text-xs text-slate-500">{phones.length} phone(s) · {locs.length} location(s)</p></td><td className="px-4 py-3 text-slate-700"><p>{primaryPhone}</p>{extraPhones > 0 && <p className="text-xs text-slate-500">+{extraPhones} more</p>}</td><td className="max-w-[280px] px-4 py-3 text-slate-700"><p className="truncate" title={locText}>{locText}</p>{extraLocs > 0 && <p className="text-xs text-slate-500">+{extraLocs} more</p>}</td><td className="px-4 py-3 text-right font-semibold tabular-nums">{formatKES(bal)}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${c.is_active === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'}`}>{c.is_active === false ? 'Inactive' : 'Active'}</span></td><td className="px-4 py-3 text-right"><div className="flex items-center justify-end gap-3"><button type="button" className="text-xs font-semibold text-orange-700 hover:text-orange-800" onClick={() => startEdit(c)}>Edit</button><button type="button" className="text-xs font-semibold text-slate-500 hover:text-slate-900" disabled={saving} onClick={() => void toggleActive(c)}>{c.is_active === false ? 'Activate' : 'Deactivate'}</button></div></td></tr>;
                })}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-500">No customers match your search or filter.</p>}
        </section>

        <form onSubmit={onSave} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold text-slate-900">{editing ? 'Edit customer' : 'Add customer'}</h2><p className="text-xs text-slate-500">{editing ? 'Update customer details, contacts and locations.' : 'Name is optional. Phone number and location are required.'}</p></div>{editing && <button type="button" className="text-slate-400 hover:text-slate-700" onClick={resetForm}><X className="h-4 w-4" /></button>}</div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Customer name (optional)" className="sm:col-span-2"><input className={inputClass} value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Optional name" /></Field>
            {!editing && <>
              <Field label="Phone number *"><input className={inputClass} required value={form.phone} onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+2547..." /></Field>
              <Field label="Location / estate *"><input className={inputClass} required value={form.estate} onChange={(e) => setForm(p => ({ ...p, estate: e.target.value }))} placeholder="Estate / area" /></Field>
              <Field label="Specific address" className="sm:col-span-2"><input className={inputClass} value={form.specific_address} onChange={(e) => setForm(p => ({ ...p, specific_address: e.target.value }))} placeholder="House, apartment, landmark…" /></Field>
            </>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={buttonClass} disabled={saving} type="submit">{saving ? 'Saving…' : editing ? 'Save name' : 'Save customer'}</button>
            {editing && <button type="button" className={secondaryClass} disabled={saving} onClick={() => void toggleActive(editing)}>{editing.is_active === false ? 'Activate customer' : 'Deactivate customer'}</button>}
          </div>

          {editing && <>
            <div className="rounded-lg border border-slate-100 p-3">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700"><Phone className="h-3.5 w-3.5" /> Phone numbers</h3>
              <div className="mb-2 flex flex-wrap gap-1.5">{(editing.phones || []).map((p) => <span key={p.id} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-700">{p.phone_number}{p.is_primary ? ' · primary' : ''}</span>)}{!(editing.phones || []).length && <span className="text-xs text-slate-500">No phone numbers.</span>}</div>
              <div className="flex gap-2"><input className={inputClass} placeholder="Add phone number" value={extraPhone} onChange={(e) => setExtraPhone(e.target.value)} /><button type="button" className={secondaryClass} disabled={saving || !extraPhone.trim()} onClick={() => void onAddPhone()}>Add</button></div>
            </div>
            <div className="rounded-lg border border-slate-100 p-3">
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-700"><MapPin className="h-3.5 w-3.5" /> Locations</h3>
              <div className="mb-2 space-y-1.5">{(editing.locations || []).map((l) => <div key={l.id} className="rounded-md bg-slate-100 px-2 py-1.5 text-[11px] text-slate-700">{l.estate}{l.specific_address ? `, ${l.specific_address}` : ''}{l.is_default ? ' · default' : ''}</div>)}{!(editing.locations || []).length && <span className="text-xs text-slate-500">No locations.</span>}</div>
              <div className="grid gap-2"><input className={inputClass} placeholder="Estate / location" value={extraEstate} onChange={(e) => setExtraEstate(e.target.value)} /><input className={inputClass} placeholder="Specific address (optional)" value={extraAddress} onChange={(e) => setExtraAddress(e.target.value)} /><button type="button" className={secondaryClass} disabled={saving || !extraEstate.trim()} onClick={() => void onAddLocation()}>Add location</button></div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Outstanding balance: <strong className="text-slate-900">{formatKES(balances.get(editing.id) || 0)}</strong> <span className="text-slate-500">(sum of unpaid orders linked to this customer)</span></div>
          </>}
        </form>
      </section>
    </main>
  );
}
