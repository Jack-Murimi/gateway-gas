'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Clock, Receipt, ShoppingCart } from 'lucide-react';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { PosWorkspace, type PosSaleSubmission } from '@/components/pos/pos-workspace';
import { SalesHistoryPanel } from '@/components/pos/sales-history-panel';
import { UnpaidInvoicesPanel } from '@/components/pos/unpaid-invoices-panel';

type SalesTab = 'pos' | 'history' | 'unpaid';

export default function SalesPage() {
  const {
    currentUser,
    branches,
    products,
    inventory,
    customers,
    staffList,
    createOrder,
    cancelOrder,
    createCustomer,
    refreshLiveData,
  } = useStore();
  const { showError, showSuccess } = useToast();
  const [tab, setTab] = useState<SalesTab>('pos');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedOrderNumber, setCompletedOrderNumber] = useState<string | null>(null);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('tab');
    if (param === 'history' || param === 'unpaid' || param === 'pos') {
      setTab(param);
    }
  }, []);

  if (!currentUser || !['admin', 'director', 'operator', 'sales_rep'].includes(currentUser.role)) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertCircle className="h-9 w-9" />
        </div>
        <h1 className="text-2xl font-black text-slate-900">Access restricted</h1>
        <p className="text-sm text-slate-600">POS cashiering is reserved for authorized station staff.</p>
      </div>
    );
  }

  const handleSubmit = async (sale: PosSaleSubmission) => {
    setIsSubmitting(true);
    try {
      const order = await createOrder(sale);
      setCompletedOrderNumber(order.order_number);
      showSuccess(`Sale completed! Ticket #${order.order_number}`);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Failed to complete sale.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const tabs: Array<{ id: SalesTab; label: string; icon: React.ElementType }> = [
    { id: 'pos', label: 'New Sale', icon: ShoppingCart },
    { id: 'history', label: 'Receipts & History', icon: Receipt },
    { id: 'unpaid', label: 'Unpaid Invoices', icon: Clock },
  ];

  return (
    <div className="mx-auto w-full max-w-[1440px]">
      <div className="px-2 pt-2 sm:px-4 lg:px-5 print:hidden">
        <header className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-sm font-bold text-slate-950">Sales &amp; POS</h1>
            <nav aria-label="Sales navigation" className="flex gap-0.5 overflow-x-auto rounded bg-slate-100 p-0.5">
              {tabs.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${
                      tab === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
        </header>
      </div>

      {tab === 'pos' && (
        <PosWorkspace
          branches={branches}
          products={products}
          inventory={inventory}
          customers={customers}
          staffList={staffList}
          currentUser={currentUser}
          createCustomer={createCustomer}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          completedOrderNumber={completedOrderNumber}
          onStartNextSale={() => setCompletedOrderNumber(null)}
        />
      )}

      {tab === 'history' && (
        <div className="px-2 pb-24 pt-2 sm:px-4 lg:px-5">
          <SalesHistoryPanel
            branches={branches}
            currentUser={currentUser}
            onCancelOrder={cancelOrder}
            onMutated={refreshLiveData}
          />
        </div>
      )}

      {tab === 'unpaid' && (
        <div className="px-2 pb-24 pt-2 sm:px-4 lg:px-5">
          <UnpaidInvoicesPanel branches={branches} onMutated={refreshLiveData} />
        </div>
      )}
    </div>
  );
}
