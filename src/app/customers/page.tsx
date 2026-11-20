'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Plus, RefreshCw, Search, Users, WifiOff, X } from 'lucide-react';
import { formatKES } from '@/lib/formatters';
import type { Filter } from './constants';
import { SHELL_VARS, baseInput, primaryBtn, secondaryBtn, iconBtn } from './constants';
import { usableNameOf } from './helpers';
import { useCustomers } from './use-customers';
import {
  Stat,
  EmptyState,
  OverflowMenu,
  CustomerRow,
  CustomerForm,
  CustomerDetails,
  BottomSheet,
} from './components';

export default function CustomersPage() {
  const router = useRouter();
  const ctx = useCustomers();
  const {
    currentUser,
    customers, customersLoading, customersError, customerSyncProgress, customerCacheAvailable,
    refreshCustomers, refreshAll,
    balances, balanceLoaded, balanceOffline, balancesLoading, totalBalance, withBalanceCount,
    matching, counts, estates,
    query, setQuery, debounced, filter, setFilter, sort, setSort,
    selected, selectedId, mode, setMode, panelOpen,
    closePanel, openDetails, openExisting, beginAdd,
    saving, handleSubmit, handleAddPhone, handleAddLocation, handleToggleActive,
    handleUpdatePhone, handleRemovePhone, handleUpdateLocation, handleRemoveLocation,
    findDuplicate,
    virtualizer, listParent, searchRef,
    isDesktop,
    t,
  } = ctx;

  /* ── access guard ── */
  if (
    !currentUser ||
    !['admin', 'director', 'operator'].includes(currentUser.role) ||
    currentUser.approval_status !== 'approved'
  ) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">{t.customerRestricted}</h1>
      </main>
    );
  }

  /* ── view pieces ── */
  const filters: { id: Filter; label: string; count?: number }[] = [
    { id: 'all', label: t.customerAll },
    { id: 'balance', label: t.customerWithBalance, count: withBalanceCount },
    { id: 'noName', label: t.customerNoName, count: counts.noName },
    { id: 'multiPhone', label: t.customerMultiplePhones, count: counts.multi },
  ];
  const isFiltered = !!query || filter !== 'all';
  const clearAll = () => {
    setQuery('');
    setFilter('all');
    setSort('default');
  };
  const refreshing = customersLoading || balancesLoading;
  const showSkeleton = (customersLoading || !!customerSyncProgress?.initial) && customers.length === 0;

  const panelTitle = mode === 'add' ? t.uxNewCustomer : mode === 'edit' && selected ? t.uxEditCustomer : t.customerDetails;

  const panelBody =
    mode === 'add' ? (
      <CustomerForm
        key="add"
        mode="add"
        saving={saving}
        onSubmit={handleSubmit}
        onCancel={closePanel}
        findDuplicate={findDuplicate}
        onOpenExisting={openExisting}
        t={t}
      />
    ) : selected && mode === 'edit' ? (
      <CustomerForm
        key={`edit-${selected.id}`}
        mode="edit"
        initialName={usableNameOf(selected)}
        saving={saving}
        onSubmit={handleSubmit}
        onCancel={() => setMode('view')}
        findDuplicate={findDuplicate}
        onOpenExisting={openExisting}
        t={t}
      />
    ) : selected ? (
      <CustomerDetails
        key={selected.id}
        customer={selected}
        balance={balanceLoaded ? balances[selected.id] ?? 0 : undefined}
        balanceStale={balanceOffline}
        saving={saving}
        onEdit={() => setMode('edit')}
        onStartSale={() => router.push(`/sales?customerId=${encodeURIComponent(selected.id)}`)}
        onAddPhone={handleAddPhone}
        onAddLocation={handleAddLocation}
        onToggleActive={handleToggleActive}
        onUpdatePhone={handleUpdatePhone}
        onRemovePhone={handleRemovePhone}
        onUpdateLocation={handleUpdateLocation}
        onRemoveLocation={handleRemoveLocation}
        findDuplicate={findDuplicate}
        onOpenExisting={openExisting}
        t={t}
      />
    ) : null;

  return (
    <main
      className={`mx-auto flex h-[calc(100dvh_-_var(--app-top)_-_var(--app-bottom))] min-h-[520px] w-full max-w-3xl flex-col px-3 pb-2 pt-3 sm:px-5 sm:pt-5 lg:max-w-[1440px] lg:px-7 lg:pb-5 ${SHELL_VARS}`}
    >
      <datalist id="customer-estates">
        {estates.map(e => (
          <option key={e} value={e} />
        ))}
      </datalist>

      {/* ── Header ── */}
      <header className="mb-3 flex shrink-0 items-center justify-between gap-3 lg:mb-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">{t.customerAccounts}</p>
          <h1 className="truncate text-2xl font-bold tracking-tight text-slate-950">{t.customerTitle}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className={iconBtn}
            onClick={() => void refreshAll()}
            aria-label={t.customerRefresh}
            title={t.customerRefresh}
          >
            <RefreshCw className={`h-[18px] w-[18px] ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <OverflowMenu
            label={t.uxMore}
            items={[
              {
                label: t.customerRedownload,
                hint: t.customerRepair,
                onClick: () => {
                  if (window.confirm(t.customerRedownload + '?')) void refreshCustomers(true);
                },
              },
            ]}
          />
          <button
            type="button"
            onClick={beginAdd}
            className="ml-1 hidden min-h-10 items-center gap-1.5 rounded-full bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 sm:inline-flex"
          >
            <Plus className="h-4 w-4" />
            {t.uxNewCustomer}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-5">
        {/* ── List column ── */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Stats */}
          <section
            aria-label={t.customerTitle}
            className="mb-3 grid shrink-0 grid-cols-2 divide-x divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-4"
          >
            <Stat label={t.customerTotal} value={customers.length.toLocaleString()} />
            <Stat label={t.customerOutstanding} value={balanceLoaded ? formatKES(totalBalance) : '—'} />
            <Stat
              className="hidden lg:block"
              label={t.customerWithBalance}
              value={withBalanceCount.toLocaleString()}
              active={filter === 'balance'}
              onClick={() => setFilter(f => (f === 'balance' ? 'all' : 'balance'))}
            />
            <Stat className="hidden lg:block" label={t.customerMatching} value={matching.length.toLocaleString()} />
          </section>

          {/* Search + filters */}
          <section className="shrink-0 space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className={`${baseInput} pl-10 pr-11`}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t.customerSearch}
                aria-label={t.customerSearch}
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  aria-label={t.customerClearSearch}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-medium text-slate-400 lg:block">
                  /
                </kbd>
              )}
            </div>

            <div
              role="group"
              className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {filters.map(item => {
                const active = filter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(item.id)}
                    className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 lg:min-h-9 ${
                      active
                        ? 'border-orange-600 bg-orange-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50/50'
                    }`}
                  >
                    {item.label}
                    {!!item.count && item.count > 0 && item.id !== 'all' && (
                      <span
                        className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                          active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.count.toLocaleString()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Status bar */}
          <div className="flex shrink-0 items-center justify-between gap-3 py-2 text-xs text-slate-500">
            <span aria-live="polite">
              {t.customerShowing} {matching.length.toLocaleString()} {t.customerOf} {customers.length.toLocaleString()}
            </span>
            <span className="flex items-center gap-3">
              {balanceOffline ? (
                <span className="inline-flex items-center gap-1 text-amber-700" title={t.customerOfflineBalances}>
                  <WifiOff className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t.customerOfflineBalances}</span>
                </span>
              ) : ctx.balanceLoaded ? (
                <span className="inline-flex items-center gap-1.5" title={t.customerUpdatedNow}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="hidden sm:inline">{t.customerUpdatedNow}</span>
                </span>
              ) : null}
              <label className="inline-flex items-center gap-1.5" title={debounced ? t.uxSortDisabled : undefined}>
                <span className="sr-only sm:not-sr-only">{t.uxSort}</span>
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value as typeof sort)}
                  disabled={!!debounced}
                  className="min-h-9 rounded-lg border border-slate-200 bg-white py-1 pl-2 pr-6 text-xs font-medium text-slate-700 outline-none focus:border-orange-400 disabled:opacity-50"
                >
                  <option value="default">{t.uxSortDefault}</option>
                  <option value="name">{t.uxSortName}</option>
                  <option value="balance">{t.uxSortBalance}</option>
                </select>
              </label>
            </span>
          </div>

          {/* Banners */}
          {!customerCacheAvailable && (
            <p className="mb-2 shrink-0 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t.customerCacheUnavailable}
            </p>
          )}
          {customerSyncProgress?.initial && (
            <div className="mb-2 shrink-0 rounded-xl bg-orange-50 px-3 py-3 text-xs text-orange-800">
              <div className="mb-2 flex justify-between gap-2">
                <span>{t.customerDownloading}</span>
                <span className="tabular-nums">
                  {customerSyncProgress.done.toLocaleString()} {t.customerOf} {customerSyncProgress.total.toLocaleString()}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={customerSyncProgress.total}
                aria-valuenow={customerSyncProgress.done}
                className="h-1.5 overflow-hidden rounded-full bg-orange-100"
              >
                <div
                  className="h-full rounded-full bg-orange-600 transition-[width]"
                  style={{
                    width: `${customerSyncProgress.total ? Math.min(100, (customerSyncProgress.done / customerSyncProgress.total) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
          {customersError && (
            <div
              role="alert"
              className="mb-2 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {t.customerLoadFailed}
              </span>
              <button type="button" className="shrink-0 font-semibold underline" onClick={() => void refreshCustomers()}>
                {t.customerRetry}
              </button>
            </div>
          )}

          {/* List (scroll container is always mounted so the virtualizer never loses it) */}
          <div
            ref={listParent}
            role={matching.length ? 'list' : undefined}
            aria-label={t.customerDirectory}
            className="min-h-[240px] flex-1 overflow-y-auto overscroll-contain"
          >
            {showSkeleton ? (
              <div className="space-y-2" aria-busy="true">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex h-[82px] animate-pulse items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 lg:h-[66px] lg:rounded-xl lg:p-2.5"
                  >
                    <div className="h-11 w-11 rounded-full bg-slate-200 lg:h-9 lg:w-9" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/5 rounded bg-slate-200" />
                      <div className="h-3 w-3/5 rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : matching.length === 0 ? (
              customers.length === 0 ? (
                customersError ? null : (
                  <EmptyState
                    icon={<Users className="h-6 w-6" />}
                    title={t.uxNoCustomersYet}
                    hint={t.uxNoCustomersHint}
                    action={
                      <button type="button" className={primaryBtn} onClick={beginAdd}>
                        <Plus className="h-4 w-4" />
                        {t.uxNewCustomer}
                      </button>
                    }
                  />
                )
              ) : (
                <EmptyState
                  icon={<Search className="h-6 w-6" />}
                  title={t.customerEmpty}
                  hint={t.customerEmptyHint}
                  action={
                    isFiltered ? (
                      <button type="button" className={secondaryBtn} onClick={clearAll}>
                        {t.uxClearFilters}
                      </button>
                    ) : undefined
                  }
                />
              )
            ) : (
              <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
                {virtualizer.getVirtualItems().map(item => {
                  const c = matching[item.index];
                  if (!c) return null;
                  return (
                    <div
                      key={item.key}
                      ref={virtualizer.measureElement}
                      data-index={item.index}
                      role="listitem"
                      aria-setsize={matching.length}
                      aria-posinset={item.index + 1}
                      className="absolute left-0 top-0 w-full pb-2"
                      style={{ transform: `translateY(${item.start}px)` }}
                    >
                      <CustomerRow
                        customer={c}
                        balance={balanceLoaded ? balances[c.id] ?? 0 : undefined}
                        query={debounced}
                        selected={selectedId === c.id}
                        onOpen={openDetails}
                        onDoubleClick={(cust) => router.push(`/customers/${cust.id}`)}
                        t={t}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Desktop detail pane ── */}
        <aside
          aria-label={t.customerDetails}
          className="hidden w-[400px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:flex xl:w-[440px]"
        >
          {isDesktop &&
            (panelOpen ? (
              <>
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                  <h2 className="truncate text-base font-bold text-slate-950">{panelTitle}</h2>
                  <button type="button" onClick={closePanel} aria-label={t.uxClose} className={`${iconBtn} h-9 w-9 bg-slate-100`}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">{panelBody}</div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                  <Users className="h-7 w-7 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-700">{t.uxSelectPrompt}</p>
                <p className="max-w-[260px] text-xs text-slate-500">{t.uxSelectHint}</p>
                <button type="button" className={`${secondaryBtn} mt-1`} onClick={beginAdd}>
                  <Plus className="h-4 w-4" />
                  {t.uxNewCustomer}
                </button>
                <p className="mt-4 text-[11px] text-slate-400">{t.uxShortcutHint}</p>
              </div>
            ))}
        </aside>
      </div>

      {/* ── Mobile: floating add button ── */}
      {!panelOpen && (
        <button
          type="button"
          onClick={beginAdd}
          className="fixed right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-orange-600 px-5 text-sm font-semibold text-white shadow-lg shadow-orange-900/20 transition active:scale-95 active:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 bottom-[calc(var(--app-bottom)_+_env(safe-area-inset-bottom)_+_16px)] sm:hidden"
        >
          <Plus className="h-5 w-5" />
          {t.customerAdd}
        </button>
      )}

      {/* ── Mobile / tablet: bottom sheet ── */}
      {!isDesktop && panelOpen && (
        <BottomSheet title={panelTitle} closeLabel={t.uxClose} onClose={closePanel}>
          {panelBody}
        </BottomSheet>
      )}
    </main>
  );
}
