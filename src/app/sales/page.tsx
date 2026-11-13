'use client';

import { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { PosWorkspace, PosSaleSubmission } from '@/components/pos/pos-workspace';

export default function SalesPage() {
  const { currentUser, branches, products, inventory, customers, staffList, createOrder, createCustomer } = useStore();
  const { showError, showSuccess } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedOrderNumber, setCompletedOrderNumber] = useState<string | null>(null);

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

  return (
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
  );
}
