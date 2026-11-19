'use client';

import { useState } from 'react';
import { AlertCircle, Bike, MapPin, Phone, Plus, Search, ShoppingBag, UserRound, X } from 'lucide-react';
import type { Branch, Customer, StaffProfile } from '@/types';
import { Button } from '@/components/ui/button';
import { rankCustomerSearch } from '@/lib/customer-cache';
import { fieldClass, labelClass } from './pos-ui';

interface Props {
  branches: Branch[];
  branchId: string;
  receiptNumber: string;
  receiptDate: string;
  maxDate: string;
  canEditDate: boolean;
  customers: Customer[];
  customer: Customer | null;
  isDelivery: boolean;
  locationId: string;
  riders: StaffProfile[];
  riderId: string;
  vehiclePlate: string;
  onBranch: (id: string) => void;
  onReceipt: (no: string) => void;
  onDate: (date: string) => void;
  onSelect: (customer: Customer | null) => void;
  onMode: (delivery: boolean) => void;
  onLocation: (id: string) => void;
  onRider: (id: string) => void;
  onVehicle: (plate: string) => void;
  createCustomer: (name: string, phone: string, estate: string, address?: string) => Promise<Customer>;
}

const looksLikePhone = (value: string) => /^\+?[0-9\s()-]{3,}$/.test(value.trim());

export function PosCustomerPanel(p: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', estate: '', address: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const matches = query.trim() ? rankCustomerSearch(p.customers, query).slice(0, 8) : [];
  const showList = open && query.trim().length > 0;
  const primaryPhone = p.customer?.phones.find(x => x.is_primary)?.phone_number || p.customer?.phones[0]?.phone_number;
  const location = p.customer?.locations.find(l => l.id === p.locationId);

  const pick = (c: Customer) => { p.onSelect(c); setQuery(''); setOpen(false); };

  const openNew = () => {
    const q = query.trim();
    setForm({ name: /[a-z]/i.test(q) ? q : '', phone: looksLikePhone(q) ? q : '', estate: '', address: '' });
    setError('');
    setShowNew(true);
    setOpen(false);
  };

  const saveNew = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const created = await p.createCustomer(form.name.trim(), form.phone.trim(), form.estate.trim() || 'Nairobi', form.address.trim());
      p.onSelect(created);
      setShowNew(false);
      setQuery('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save customer.');
    } finally {
      setSaving(false);
    }
  };

  const modeButton = (delivery: boolean, label: string, Icon: typeof Bike) => (
    <button
      type="button" aria-pressed={p.isDelivery === delivery} onClick={() => p.onMode(delivery)}
      className={`flex h-7 flex-1 items-center justify-center gap-1 rounded px-2.5 text-xs font-semibold transition sm:flex-none ${p.isDelivery === delivery ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
    >
      <Icon className="h-3.5 w-3.5" />{label}
    </button>
  );

  return (
    <section className="rounded-md border border-slate-300 bg-white p-1.5" aria-label="Sale details">
      <div className="grid grid-cols-12 items-end gap-1.5 lg:grid-cols-[130px_124px_minmax(0,150px)_auto_minmax(0,1fr)]">
        <div className="col-span-4 lg:col-span-1">
          <label htmlFor="pos-receipt" className={labelClass}>Receipt *</label>
          <input id="pos-receipt" className={`${fieldClass} font-mono`} value={p.receiptNumber} onChange={e => p.onReceipt(e.target.value.toUpperCase())} placeholder="Receipt no." autoComplete="off" />
        </div>
        <div className="col-span-4 lg:col-span-1">
          <label htmlFor="pos-date" className={labelClass}>Date</label>
          <input id="pos-date" className={fieldClass} type="date" value={p.receiptDate} max={p.maxDate} onChange={e => p.onDate(e.target.value)} disabled={!p.canEditDate} />
        </div>
        <div className="col-span-4 lg:col-span-1">
          <label htmlFor="pos-branch" className={labelClass}>Branch</label>
          <select id="pos-branch" className={fieldClass} value={p.branchId} onChange={e => p.onBranch(e.target.value)} disabled={p.branches.length < 2}>
            {p.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div role="group" aria-label="Sale mode" className="col-span-4 flex h-8 items-center rounded bg-slate-100 p-0.5 lg:col-span-1">
          {modeButton(false, 'Sale', ShoppingBag)}
          {modeButton(true, 'Delivery', Bike)}
        </div>
        {p.customer ? (
          <div className="col-span-8 flex h-8 min-w-0 items-center justify-between gap-2 rounded border border-orange-200 bg-orange-50 pl-2 pr-1 lg:col-span-1">
            <div className="flex min-w-0 items-center gap-1.5 text-xs">
              <UserRound className="h-3.5 w-3.5 shrink-0 text-orange-700" />
              <span className="truncate font-semibold text-slate-900">{p.customer.name?.trim() || primaryPhone || 'Customer'}</span>
              {primaryPhone && p.customer.name?.trim() && <span className="hidden items-center gap-0.5 text-slate-600 sm:flex"><Phone className="h-3 w-3" />{primaryPhone}</span>}
            </div>
            <button type="button" aria-label="Remove customer" onClick={() => p.onSelect(null)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-white">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="relative col-span-8 min-w-0 lg:col-span-1">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              role="combobox" aria-expanded={showList} aria-controls="pos-customer-results" aria-label="Search customer" autoComplete="off"
              className={`${fieldClass} pl-7 pr-14 ${p.isDelivery ? 'border-amber-400' : ''}`}
              placeholder={p.isDelivery ? 'Select customer…' : 'Customer (optional)'}
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
              onFocus={() => setOpen(true)}
              onBlur={() => setOpen(false)}
              onKeyDown={e => {
                if (e.key === 'Escape') setOpen(false);
                else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(matches.length - 1, i + 1)); }
                else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
                else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); pick(matches[active]); }
              }}
            />
            <button type="button" onMouseDown={e => e.preventDefault()} onClick={openNew} className="absolute right-1 top-1/2 flex h-6 -translate-y-1/2 items-center gap-0.5 rounded px-1.5 text-[11px] font-semibold text-orange-700 hover:bg-orange-50">
              <Plus className="h-3 w-3" />New
            </button>
            {showList && (
              <ul id="pos-customer-results" role="listbox" className="absolute z-30 mt-1 max-h-[min(20rem,50dvh)] w-full overflow-y-auto rounded-md border border-slate-300 bg-white shadow-xl">
                {matches.map((c, i) => (
                  <li key={c.id} role="option" aria-selected={i === active}>
                    <button type="button" onMouseDown={e => e.preventDefault()} onMouseEnter={() => setActive(i)} onClick={() => pick(c)} className={`block min-h-9 w-full border-b border-slate-100 px-2.5 py-1 text-left ${i === active ? 'bg-orange-50' : ''}`}>
                      <span className="block truncate text-[13px] font-medium leading-tight text-slate-900">{c.name?.trim() || c.phones[0]?.phone_number || 'Customer'}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {c.phones.map(x => x.phone_number).join(' · ')}{c.locations.length > 0 && ` — ${c.locations.map(l => l.estate).join(', ')}`}
                      </span>
                    </button>
                  </li>
                ))}
                {!matches.length && <li className="p-2.5 text-xs text-slate-500">No customer found.</li>}
                <li>
                  <button type="button" onMouseDown={e => e.preventDefault()} onClick={openNew} className="flex min-h-8 w-full items-center gap-1.5 px-2.5 text-xs font-semibold text-orange-700 hover:bg-orange-50">
                    <Plus className="h-3.5 w-3.5" />New customer
                  </button>
                </li>
              </ul>
            )}
          </div>
        )}
      </div>

      {showNew && !p.customer && (
        <form onSubmit={saveNew} className="mt-1.5 rounded border border-slate-200 bg-slate-50 p-2">
          <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
            <div><label className={labelClass}>Name</label><input className={fieldClass} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Name" autoFocus /></div>
            <div><label className={labelClass}>Phone *</label><input className={fieldClass} type="tel" inputMode="tel" required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="07…" /></div>
            <div><label className={labelClass}>Estate</label><input className={fieldClass} value={form.estate} onChange={e => setForm({ ...form, estate: e.target.value })} placeholder="Nairobi" /></div>
            <div><label className={labelClass}>Address</label><input className={fieldClass} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="col-span-2 flex items-end gap-1.5 lg:col-span-1">
              <Button type="submit" size="sm" isLoading={saving} disabled={saving || !form.phone.trim()}>Save</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setShowNew(false)}>Cancel</Button>
            </div>
          </div>
          {error && <p role="alert" className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
        </form>
      )}

      {p.isDelivery && (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 border-t border-slate-200 pt-1.5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px]">
          <div className="col-span-2 min-w-0 lg:col-span-1">
            <label className={labelClass}>Location</label>
            {!p.customer ? (
              <p className="flex h-8 items-center gap-1 text-xs text-amber-700"><AlertCircle className="h-3.5 w-3.5" />Select a customer</p>
            ) : p.customer.locations.length > 1 ? (
              <select className={fieldClass} value={p.locationId} onChange={e => p.onLocation(e.target.value)} aria-label="Delivery location">
                {p.customer.locations.map(l => <option key={l.id} value={l.id}>{l.estate}{l.specific_address ? ` — ${l.specific_address}` : ''}</option>)}
              </select>
            ) : location ? (
              <p className="flex min-h-8 items-center gap-1 text-xs text-slate-800"><MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />{location.estate}{location.specific_address ? ` — ${location.specific_address}` : ''}</p>
            ) : (
              <p className="flex min-h-8 items-center gap-1 text-xs text-red-700"><AlertCircle className="h-3.5 w-3.5" />No saved location</p>
            )}
          </div>
          <div className="min-w-0">
            <label className={labelClass}>Rider *</label>
            <select className={fieldClass} value={p.riderId} onChange={e => p.onRider(e.target.value)} aria-label="Rider">
              <option value="">Select rider</option>
              {p.riders.map(r => <option key={r.id} value={r.id}>{r.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>Vehicle</label>
            <input className={fieldClass} value={p.vehiclePlate} onChange={e => p.onVehicle(e.target.value.toUpperCase())} placeholder="Plate" />
          </div>
        </div>
      )}
    </section>
  );
}
