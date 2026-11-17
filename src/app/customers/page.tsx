'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowUpRight, Check, Copy, MapPin, Phone, Plus, RefreshCw, Search, UserRound, X } from 'lucide-react';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { formatKES } from '@/lib/formatters';
import { createClient } from '@/lib/supabase/client';
import { rankCustomerSearch } from '@/lib/customer-cache';
import { translations, type Locale } from '@/lib/i18n';
import type { Customer } from '@/types';

type Filter = 'all' | 'balance' | 'noName' | 'multiPhone';
const baseInput = 'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-orange-950';
const actionBtn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50';
const secondaryBtn = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';

function initials(name: string) {
  return name.trim().split(/\\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');
}
function sameAsIdentity(value: string, name: string, phone: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[\\s,.-]/g, '');
  const v = norm(value);
  return !v || v === norm(name) || v === norm(phone);
}

export default function CustomersPage() {
  const router = useRouter();
  const { currentUser, customers, customersLoading, customersError, refreshCustomers, customerSyncProgress, customerCacheAvailable, createCustomer, updateCustomer, setCustomerActive, addCustomerPhone, addCustomerLocation } = useStore();
  const { showError, showSuccess } = useToast();
  const [locale, setLocale] = useState<Locale>('en');
  const t = translations[locale];
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<Customer | null>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [balanceUpdated, setBalanceUpdated] = useState<Date | null>(null);
  const [balanceOffline, setBalanceOffline] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', estate: '', address: '' });
  const [extraPhone, setExtraPhone] = useState('');
  const [extraEstate, setExtraEstate] = useState('');
  const [extraAddress, setExtraAddress] = useState('');
  const [copied, setCopied] = useState('');
  const listParent = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem('gwg_locale');
    if (saved === 'sw' || saved === 'en') setLocale(saved);
    const updateLocale = () => {
      const value = localStorage.getItem('gwg_locale');
      if (value === 'sw' || value === 'en') setLocale(value);
    };
    window.addEventListener('storage', updateLocale);
    return () => window.removeEventListener('storage', updateLocale);
  }, []);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(query), 150);
    return () => window.clearTimeout(id);
  }, [query]);

  const loadBalances = async () => {
    if (!navigator.onLine) { setBalanceOffline(true); return; }
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from('customer_outstanding_balances').select('customer_id,balance_kes');
      if (error) throw error;
      const next: Record<string, number> = {};
      (data || []).forEach((row: any) => { next[row.customer_id] = Number(row.balance_kes || 0); });
      setBalances(next);
      setBalanceUpdated(new Date());
      setBalanceOffline(false);
    } catch (error) {
      console.warn('Could not refresh customer balances', error);
      setBalanceOffline(true);
    }
  };
  useEffect(() => {
    void loadBalances();
    const timer = window.setInterval(() => void loadBalances(), 5 * 60 * 1000);
    const refresh = () => { void loadBalances(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); };
  }, []);

  const matching = useMemo(() => {
    let rows = rankCustomerSearch(customers, debounced);
    if (filter === 'balance') rows = rows.filter(c => (balances[c.id] || 0) > 0);
    if (filter === 'noName') rows = rows.filter(c => !c.name?.trim());
    if (filter === 'multiPhone') rows = rows.filter(c => (c.phones || []).length > 1);
    return rows;
  }, [customers, debounced, filter, balances]);

  const virtualizer = useVirtualizer({
    count: matching.length,
    getScrollElement: () => listParent.current,
    estimateSize: () => 88,
    overscan: 8,
  });
  const totalBalance = Object.values(balances).reduce((sum, value) => sum + value, 0);
  const withBalanceCount = Object.values(balances).filter(value => value > 0).length;
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: t.customerAll },
    { id: 'balance', label: t.customerWithBalance },
    { id: 'noName', label: t.customerNoName },
    { id: 'multiPhone', label: t.customerMultiplePhones },
  ];

  const openDetails = (customer: Customer) => { setSelected(customer); setEditing(false); setAdding(false); };
  const beginAdd = () => {
    setSelected(null); setEditing(false); setAdding(true);
    setForm({ name: '', phone: '', estate: '', address: '' });
  };
  const beginEdit = () => {
    if (!selected) return;
    setForm({ name: selected.name || '', phone: selected.phones?.find(p => p.is_primary)?.phone_number || selected.phones?.[0]?.phone_number || '', estate: selected.locations?.find(l => l.is_default)?.estate || selected.locations?.[0]?.estate || '', address: selected.locations?.find(l => l.is_default)?.specific_address || selected.locations?.[0]?.specific_address || '' });
    setEditing(true);
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      if (adding) {
        if (!form.phone.trim() || !form.estate.trim()) throw new Error(t.customerPhoneLocationRequired);
        await createCustomer(form.name, form.phone, form.estate, form.address);
        showSuccess(t.customerAdded);
        setAdding(false);
      } else if (editing && selected) {
        await updateCustomer(selected.id, form.name);
        showSuccess(t.customerSaved);
        setEditing(false);
        await refreshCustomers();
      }
      await refreshCustomers();
    } catch (error) {
      showError(error instanceof Error ? error.message : t.customerSaveFailed);
    } finally { setSaving(false); }
  };
  const addPhone = async () => {
    if (!selected || !extraPhone.trim()) return;
    setSaving(true);
    try { await addCustomerPhone(selected.id, extraPhone); setExtraPhone(''); await refreshCustomers(); showSuccess(t.customerPhoneAdded); }
    catch (error) { showError(error instanceof Error ? error.message : t.customerSaveFailed); }
    finally { setSaving(false); }
  };
  const addLocation = async () => {
    if (!selected || !extraEstate.trim()) return;
    setSaving(true);
    try { await addCustomerLocation(selected.id, extraEstate, extraAddress); setExtraEstate(''); setExtraAddress(''); await refreshCustomers(); showSuccess(t.customerLocationAdded); }
    catch (error) { showError(error instanceof Error ? error.message : t.customerSaveFailed); }
    finally { setSaving(false); }
  };
  useEffect(() => {
    if (!selected) return;
    const fresh = customers.find(c => c.id === selected.id);
    if (fresh) setSelected(fresh);
  }, [customers, selected?.id]);

  if (!currentUser || !['admin', 'director', 'operator'].includes(currentUser.role) || currentUser.approval_status !== 'approved') {
    return <main className="mx-auto max-w-xl px-4 py-16 text-center"><h1 className="text-lg font-semibold">{t.customerRestricted}</h1></main>;
  }

  return (
    <main className="mx-auto max-w-3xl px-3 pb-28 pt-4 sm:px-5 sm:pt-6">
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0"><p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{t.customerAccounts}</p><h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">{t.customerTitle}</h1></div>
        <button type="button" onClick={beginAdd} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-orange-700"><Plus className="h-4 w-4" />{t.customerAdd}</button>
      </header>

      <section className="mb-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500 dark:text-slate-400">{t.customerTotal}</p><p className="mt-1 text-xl font-bold tabular-nums text-slate-950 dark:text-white">{customers.length.toLocaleString()}</p></div>
        <div className="rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><p className="text-xs text-slate-500 dark:text-slate-400">{t.customerOutstanding}</p><p className="mt-1 truncate text-xl font-bold tabular-nums text-slate-950 dark:text-white">{formatKES(totalBalance)}</p></div>
      </section>

      <section className="sticky top-[56px] z-30 -mx-3 border-y border-slate-200 bg-slate-50/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:top-16 sm:mx-0 sm:rounded-2xl sm:border">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input className={baseInput + ' pl-10 pr-10'} value={query} onChange={e => setQuery(e.target.value)} placeholder={t.customerSearch} aria-label={t.customerSearch} /><button type="button" onClick={() => setQuery('')} aria-label={t.customerClearSearch} className={`absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 ${query ? '' : 'invisible'}`}><X className="h-4 w-4" /></button></div>
        <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {filters.map(item => <button key={item.id} type="button" onClick={() => setFilter(item.id)} className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold transition ${filter === item.id ? 'border-orange-600 bg-orange-600 text-white' : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>{item.label}{item.id === 'balance' && withBalanceCount > 0 ? ` · ${withBalanceCount}` : ''}</button>)}
          <button type="button" onClick={() => { void refreshCustomers(); void loadBalances(); }} className="ml-auto inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"><RefreshCw className="h-3.5 w-3.5" />{t.customerRefresh}</button>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3 py-3 text-xs text-slate-500 dark:text-slate-400">
        <span>{debounced || filter !== 'all' ? `${matching.length.toLocaleString()} ${t.customerMatching}` : `${t.customerShowing} ${customers.length.toLocaleString()} ${t.customerOf} ${customers.length.toLocaleString()}`}</span>
        <span className="shrink-0">{balanceOffline ? t.customerOfflineBalances : balanceUpdated ? t.customerUpdatedNow : ''}</span>
      </div>
      {!customerCacheAvailable && <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">{t.customerCacheUnavailable}</p>}
      {customerSyncProgress?.initial && <div className="mb-3 rounded-xl bg-orange-50 px-3 py-3 text-xs text-orange-800 dark:bg-orange-950/30 dark:text-orange-200"><div className="mb-2 flex justify-between"><span>{t.customerDownloading}</span><span>{customerSyncProgress.done.toLocaleString()} {t.customerOf} {customerSyncProgress.total.toLocaleString()}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-orange-100 dark:bg-orange-900"><div className="h-full rounded-full bg-orange-600" style={{ width: `${customerSyncProgress.total ? Math.min(100, customerSyncProgress.done / customerSyncProgress.total * 100) : 0}%` }} /></div></div>}
      {customersError && <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"><span>{t.customerLoadFailed}</span><button type="button" className="font-semibold underline" onClick={() => void refreshCustomers()}>{t.customerRetry}</button></div>}

      {customersLoading && customers.length === 0 ? <div className="space-y-2">{Array.from({ length: 7 }).map((_, i) => <div key={i} className="flex h-[84px] animate-pulse items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"><div className="h-11 w-11 rounded-full bg-slate-200 dark:bg-slate-700" /><div className="flex-1 space-y-2"><div className="h-3 w-2/5 rounded bg-slate-200 dark:bg-slate-700" /><div className="h-3 w-3/5 rounded bg-slate-100 dark:bg-slate-800" /></div></div>)}</div> : matching.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 px-5 py-12 text-center dark:border-slate-700"><UserRound className="mx-auto h-8 w-8 text-slate-400" /><p className="mt-2 text-sm font-semibold text-slate-800 dark:text-slate-200">{t.customerEmpty}</p><p className="mt-1 text-xs text-slate-500">{t.customerEmptyHint}</p></div> : (
        <div ref={listParent} className="h-[calc(100dvh-330px)] min-h-[320px] overflow-y-auto overscroll-contain" role="list" aria-label={t.customerDirectory}>
          <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
            {virtualizer.getVirtualItems().map(item => {
              const c = matching[item.index];
              const phones = c.phones || [];
              const primary = phones.find(p => p.is_primary)?.phone_number || phones[0]?.phone_number || '';
              const loc = c.locations?.find(l => l.is_default) || c.locations?.[0];
              const location = loc ? [loc.estate, loc.specific_address].filter(Boolean).join(', ') : '';
              const usableName = c.name?.trim() && /[a-z]/i.test(c.name) && !/^\\+?[0-9\\s().-]+$/.test(c.name.trim()) ? c.name.trim() : '';
              const title = usableName || primary || t.customerNoName;
              const bal = balances[c.id] || 0;
              return <div key={c.id} ref={virtualizer.measureElement} data-index={item.index} className="absolute left-0 top-0 w-full pb-2" style={{ transform: `translateY(${item.start}px)` }}>
                <div role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetails(c); } }} onClick={() => openDetails(c)} className="flex min-h-[80px] w-full cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-orange-200 active:bg-orange-50/40 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-orange-900 dark:active:bg-orange-950/20">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-50 text-sm font-bold text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">{usableName ? initials(usableName) : <UserRound className="h-5 w-5" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2"><span className="truncate text-sm font-semibold text-slate-900 dark:text-white">{title}</span>{!c.name?.trim() && <span className="shrink-0 text-[10px] text-slate-400">{t.customerNoNameSaved}</span>}</span>
                    <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"><Phone className="h-3 w-3 shrink-0 text-slate-400" /><span className="truncate">{primary || '—'}</span>{phones.length > 1 && <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">+{phones.length - 1}</span>}</span>
                    {location && !sameAsIdentity(location, c.name || '', primary) && <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{location}</span></span>}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-2">
                    <a href={primary ? `tel:${primary}` : undefined} onClick={e => { e.stopPropagation(); if (!primary) e.preventDefault(); }} aria-label={t.customerCall} className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"><Phone className="h-4 w-4" /></a>
                    {bal > 0 && <span className="max-w-[92px] truncate rounded-full bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">{formatKES(bal)}</span>}
                  </span>
                </button>
              </div>;
            })}
          </div>
        </div>
      )}

      {(selected || adding) && <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/45 p-0 sm:items-center sm:p-4" onClick={() => { setSelected(null); setAdding(false); setEditing(false); }}>
        <section role="dialog" aria-modal="true" aria-label={adding ? t.customerAdd : selected?.name || t.customerDetails} onClick={e => e.stopPropagation()} className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 pb-[calc(env(safe-area-inset-bottom)+20px)] shadow-2xl dark:bg-slate-900 sm:rounded-3xl">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 sm:hidden" />
          <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-bold text-slate-950 dark:text-white">{adding ? t.customerAdd : editing ? t.customerEdit : selected?.name || selected?.phones?.[0]?.phone_number || t.customerDetails}</h2><button type="button" onClick={() => { setSelected(null); setAdding(false); setEditing(false); }} className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><X className="h-5 w-5" /></button></div>
          {(adding || editing) ? <form onSubmit={save} className="space-y-3">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{t.customerName}<input className={baseInput+' mt-1'} value={form.name} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} /></label>
            {adding && <><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{t.customerPhone}<input className={baseInput+' mt-1'} required value={form.phone} onChange={e => setForm(v => ({ ...v, phone: e.target.value }))} /></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{t.customerLocation}<input className={baseInput+' mt-1'} required value={form.estate} onChange={e => setForm(v => ({ ...v, estate: e.target.value }))} /></label><label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">{t.customerAddress}<input className={baseInput+' mt-1'} value={form.address} onChange={e => setForm(v => ({ ...v, address: e.target.value }))} /></label></>}
            <button type="submit" className={actionBtn+' w-full'} disabled={saving}>{saving ? t.customerSaving : t.customerSave}</button>
          </form> : selected && <>
            <div className="space-y-4">
              <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.customerPhones}</p>{selected.phones.map(p => <div key={p.id} className="flex min-h-12 items-center justify-between gap-2 border-b border-slate-100 py-1 dark:border-slate-800"><a className="flex min-h-10 flex-1 items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-100" href={`tel:${p.phone_number}`}><Phone className="h-4 w-4 text-slate-400" />{p.phone_number}{p.is_primary ? <span className="text-[10px] text-slate-400">{t.customerPrimary}</span> : null}</a><button type="button" className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={async () => { await navigator.clipboard.writeText(p.phone_number); setCopied(p.id); window.setTimeout(() => setCopied(''), 1200); }} aria-label={t.customerCopy}><Copy className="h-4 w-4" />{copied === p.id ? <Check className="h-3 w-3" /> : null}</button></div>)}{selected.phones.length === 0 && <p className="text-sm text-slate-500">—</p>}</div>
              <div><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.customerLocations}</p>{selected.locations.map(l => <p key={l.id} className="flex min-h-10 items-center gap-2 border-b border-slate-100 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-200"><MapPin className="h-4 w-4 shrink-0 text-slate-400" />{[l.estate,l.specific_address].filter(Boolean).join(', ')}</p>)}</div>
              <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800"><p className="text-xs text-slate-500">{t.customerOutstanding}</p><p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">{formatKES(balances[selected.id] || 0)}</p></div>
              <div className="grid grid-cols-2 gap-2"><button type="button" className={secondaryBtn} onClick={beginEdit}>{t.customerEdit}</button><button type="button" className={actionBtn} onClick={() => router.push(`/sales?customerId=${selected.id}`)}><ArrowUpRight className="h-4 w-4" />{t.customerStartSale}</button></div>
              <button type="button" className="w-full py-2 text-xs font-semibold text-slate-500" onClick={async () => { setSaving(true); try { await setCustomerActive(selected.id, selected.is_active === false); setSelected(null); } catch (error) { showError(error instanceof Error ? error.message : t.customerSaveFailed); } finally { setSaving(false); } }}>{selected.is_active === false ? t.customerActivate : t.customerDeactivate}</button>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800"><p className="mb-2 text-xs font-semibold text-slate-500">{t.customerAddPhone}</p><div className="flex gap-2"><input className={baseInput} value={extraPhone} onChange={e => setExtraPhone(e.target.value)} placeholder={t.customerPhone} /><button type="button" className={secondaryBtn} disabled={saving || !extraPhone.trim()} onClick={() => void addPhone()}>{t.customerAdd}</button></div><p className="mb-2 mt-4 text-xs font-semibold text-slate-500">{t.customerAddLocation}</p><div className="space-y-2"><input className={baseInput} value={extraEstate} onChange={e => setExtraEstate(e.target.value)} placeholder={t.customerLocation} /><input className={baseInput} value={extraAddress} onChange={e => setExtraAddress(e.target.value)} placeholder={t.customerAddress} /><button type="button" className={secondaryBtn+' w-full'} disabled={saving || !extraEstate.trim()} onClick={() => void addLocation()}>{t.customerAddLocation}</button></div></div>
          </>}
        </section>
      </div>}
    </main>
  );
}
