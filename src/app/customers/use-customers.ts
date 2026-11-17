'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { rankCustomerSearch } from '@/lib/customer-cache';
import { translations, type Locale } from '@/lib/i18n';
import type { Customer } from '@/types';
import type { Filter, Sort, Mode, FindDuplicate, FormValues } from './constants';
import { collator } from './constants';
import { usableNameOf, phoneKey, extractId } from './helpers';
import { ux } from './i18n';

export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

export function useCustomers() {
  const {
    currentUser,
    customers,
    customersLoading,
    customersError,
    refreshCustomers,
    customerSyncProgress,
    customerCacheAvailable,
    createCustomer,
    updateCustomer,
    setCustomerActive,
    addCustomerPhone,
    updateCustomerPhone,
    removeCustomerPhone,
    addCustomerLocation,
    updateCustomerLocation,
    removeCustomerLocation,
  } = useStore();
  const { showError, showSuccess } = useToast();

  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const [locale, setLocale] = useState<Locale>('en');
  const t = useMemo<Record<string, string>>(() => ({ ...(ux[locale] ?? ux.en), ...translations[locale] }), [locale]);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('default');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [saving, setSaving] = useState(false);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [balanceUpdated, setBalanceUpdated] = useState<Date | null>(null);
  const [balanceOffline, setBalanceOffline] = useState(false);
  const [balancesLoading, setBalancesLoading] = useState(false);

  const listParent = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /* ── locale ── */
  useEffect(() => {
    const read = () => {
      const value = localStorage.getItem('gwg_locale');
      if (value === 'sw' || value === 'en') setLocale(value);
    };
    read();
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, []);

  /* ── debounced search (clearing is instant) ── */
  useEffect(() => {
    if (!query) {
      setDebounced('');
      return;
    }
    const id = window.setTimeout(() => setDebounced(query), 150);
    return () => window.clearTimeout(id);
  }, [query]);

  /* ── balances ── */
  const loadBalances = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setBalanceOffline(true);
      return;
    }
    setBalancesLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from('customer_outstanding_balances').select('customer_id,balance_kes');
      if (error) throw error;
      const next: Record<string, number> = {};
      ((data || []) as { customer_id: string; balance_kes: number | string | null }[]).forEach(row => {
        next[row.customer_id] = Number(row.balance_kes || 0);
      });
      setBalances(next);
      setBalanceUpdated(new Date());
      setBalanceOffline(false);
    } catch (error) {
      console.warn('Could not refresh customer balances', error);
      setBalanceOffline(true);
    } finally {
      setBalancesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBalances();
    const timer = window.setInterval(() => void loadBalances(), 5 * 60 * 1000);
    const refresh = () => void loadBalances();
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [loadBalances]);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([refreshCustomers(), loadBalances()]);
  }, [refreshCustomers, loadBalances]);

  /* ── derived data ── */
  const balanceLoaded = balanceUpdated !== null;
  const totalBalance = useMemo(() => Object.values(balances).reduce((s, v) => s + v, 0), [balances]);
  const withBalanceCount = useMemo(() => Object.values(balances).filter(v => v > 0).length, [balances]);
  const counts = useMemo(() => {
    let noName = 0;
    let multi = 0;
    for (const c of customers) {
      if (!usableNameOf(c)) noName++;
      if ((c.phones || []).length > 1) multi++;
    }
    return { noName, multi };
  }, [customers]);

  const matching = useMemo(() => {
    let rows = rankCustomerSearch(customers, debounced);
    if (filter === 'balance') rows = rows.filter(c => (balances[c.id] || 0) > 0);
    else if (filter === 'noName') rows = rows.filter(c => !usableNameOf(c));
    else if (filter === 'multiPhone') rows = rows.filter(c => (c.phones || []).length > 1);

    const effectiveSort: Sort = sort !== 'default' ? sort : filter === 'balance' ? 'balance' : 'default';
    if (!debounced.trim() && effectiveSort !== 'default') {
      if (effectiveSort === 'balance') {
        rows = [...rows].sort((a, b) => (balances[b.id] || 0) - (balances[a.id] || 0));
      } else {
        const keys = new Map<string, string>();
        for (const c of rows) keys.set(c.id, usableNameOf(c));
        rows = [...rows].sort((a, b) => {
          const an = keys.get(a.id)!;
          const bn = keys.get(b.id)!;
          if (!an && !bn) return 0;
          if (!an) return 1;
          if (!bn) return -1;
          return collator.compare(an, bn);
        });
      }
    }
    return rows;
  }, [customers, debounced, filter, sort, balances]);

  const selected = useMemo(
    () => (selectedId ? customers.find(c => c.id === selectedId) ?? null : null),
    [customers, selectedId],
  );
  const panelOpen = mode === 'add' || !!selected;

  const estates = useMemo(() => {
    const freq = new Map<string, number>();
    for (const c of customers)
      for (const l of c.locations || []) {
        const e = l.estate?.trim();
        if (e) freq.set(e, (freq.get(e) || 0) + 1);
      }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200).map(([e]) => e);
  }, [customers]);

  const phoneIndex = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of customers)
      for (const p of c.phones || []) {
        const k = phoneKey(p.phone_number);
        if (k && !map.has(k)) map.set(k, c);
      }
    return map;
  }, [customers]);
  const findDuplicate = useCallback<FindDuplicate>(
    (phone, excludeId) => {
      const k = phoneKey(phone);
      if (!k) return undefined;
      const hit = phoneIndex.get(k);
      return hit && hit.id !== excludeId ? hit : undefined;
    },
    [phoneIndex],
  );

  /* ── virtualizer ── */
  const virtualizer = useVirtualizer({
    count: matching.length,
    getScrollElement: () => listParent.current,
    estimateSize: () => (isDesktop ? 76 : 96),
    overscan: 8,
    paddingEnd: isDesktop ? 8 : 84,
    getItemKey: index => matching[index]?.id ?? index,
  });
  useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [debounced, filter, sort, virtualizer]);
  useEffect(() => {
    virtualizer.measure();
  }, [isDesktop, virtualizer]);

  /* ── panel actions ── */
  const closePanel = useCallback(() => {
    setSelectedId(null);
    setMode('view');
  }, []);
  const openDetails = useCallback((c: Customer) => {
    setSelectedId(c.id);
    setMode('view');
  }, []);
  const openExisting = (c: Customer) => {
    openDetails(c);
    const idx = matching.findIndex(m => m.id === c.id);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center' });
  };
  const beginAdd = () => {
    setSelectedId(null);
    setMode('add');
  };

  /* ── keyboard: "/" focuses search, Esc closes panel / clears search ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (e.key === 'Escape') {
        if (target === searchRef.current && searchRef.current?.value) {
          setQuery('');
          return;
        }
        if (panelOpen) closePanel();
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen, closePanel]);

  /* ── mutations ── */
  const handleSubmit = async (v: FormValues) => {
    setSaving(true);
    try {
      if (mode === 'add') {
        if (!v.phone || !v.estate) throw new Error(t.customerPhoneLocationRequired);
        const created: unknown = await createCustomer(v.name, v.phone, v.estate, v.address);
        await refreshCustomers();
        showSuccess(t.customerAdded);
        const id = extractId(created);
        if (id) {
          setSelectedId(id);
          setMode('view');
        } else {
          closePanel();
        }
      } else if (mode === 'edit' && selected) {
        await updateCustomer(selected.id, v.name);
        await refreshCustomers();
        showSuccess(t.customerSaved);
        setMode('view');
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : t.customerSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleAddPhone = async (phone: string, label?: string) => {
    if (!selected || !phone.trim()) return false;
    setSaving(true);
    try {
      await addCustomerPhone(selected.id, phone.trim(), false, label);
      await refreshCustomers();
      showSuccess(t.customerPhoneAdded);
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : t.customerSaveFailed);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAddLocation = async (estate: string, address: string) => {
    if (!selected || !estate.trim()) return false;
    setSaving(true);
    try {
      await addCustomerLocation(selected.id, estate.trim(), address.trim());
      await refreshCustomers();
      showSuccess(t.customerLocationAdded);
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : t.customerSaveFailed);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!selected) return;
    const activating = selected.is_active === false;
    setSaving(true);
    try {
      await setCustomerActive(selected.id, activating);
      await refreshCustomers();
      showSuccess(activating ? t.uxActivated : t.uxDeactivated);
      if (!activating) closePanel();
    } catch (error) {
      showError(error instanceof Error ? error.message : t.customerSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdatePhone = async (phoneId: string, updates: { label?: string | null; is_primary?: boolean }) => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateCustomerPhone(selected.id, phoneId, updates);
      await refreshCustomers();
    } catch (error) {
      showError(error instanceof Error ? error.message : t.customerSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePhone = async (phoneId: string) => {
    if (!selected) return;
    setSaving(true);
    try {
      await removeCustomerPhone(selected.id, phoneId);
      await refreshCustomers();
    } catch (error) {
      showError(error instanceof Error ? error.message : t.customerSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateLocation = async (locationId: string, updates: { estate?: string; specific_address?: string | null; is_default?: boolean }) => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateCustomerLocation(selected.id, locationId, updates);
      await refreshCustomers();
    } catch (error) {
      showError(error instanceof Error ? error.message : t.customerSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveLocation = async (locationId: string) => {
    if (!selected) return;
    setSaving(true);
    try {
      await removeCustomerLocation(selected.id, locationId);
      await refreshCustomers();
    } catch (error) {
      showError(error instanceof Error ? error.message : t.customerSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  return {
    // auth
    currentUser,
    // data
    customers, customersLoading, customersError, customerSyncProgress, customerCacheAvailable,
    refreshCustomers, refreshAll,
    // balances
    balances, balanceLoaded, balanceOffline, balancesLoading, totalBalance, withBalanceCount,
    // list
    matching, counts, estates,
    // search / filter / sort
    query, setQuery, debounced, filter, setFilter, sort, setSort,
    // selection / panel
    selected, selectedId, setSelectedId, mode, setMode, panelOpen,
    closePanel, openDetails, openExisting, beginAdd,
    // mutations
    saving, handleSubmit, handleAddPhone, handleAddLocation, handleToggleActive,
    handleUpdatePhone, handleRemovePhone, handleUpdateLocation, handleRemoveLocation,
    findDuplicate,
    // virtualizer
    virtualizer, listParent, searchRef,
    // layout
    isDesktop,
    // i18n
    t,
  };
}
