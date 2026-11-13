'use client';

import React, { useState } from 'react';
import { useStore } from '@/context/store-context';
import { Customer, OrderType, PaymentMethod, PaymentStatus } from '@/types';
import {
  Users,
  Package,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Flame,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { PosAdvancedHeader } from '@/components/pos/pos-advanced-header';
import { PosCustomerStep } from '@/components/pos/pos-customer-step';
import { PosItemsStep, PosCartItem } from '@/components/pos/pos-items-step';
import { PosPayStep } from '@/components/pos/pos-pay-step';
import { PosStickySummary } from '@/components/pos/pos-sticky-summary';
import { formatKES } from '@/lib/formatters';

export default function SalesPage() {
  const {
    currentUser,
    branches,
    products,
    customers,
    createOrder,
    createCustomer,
  } = useStore();
  const { showError, showSuccess } = useToast();

  // Active step in mobile flow (1: Customer, 2: Items, 3: Pay)
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(2); // Default to Items for fast walk-in counter speed!

  // Station & Receipt Options
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id || '');
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [receiptNumber, setReceiptNumber] = useState(''); // Sensible default: blank for cashier manual paper ticket

  // Step 1: Customer & Delivery Mode
  const [isPosWalkin, setIsPosWalkin] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedPhone, setSelectedPhone] = useState('');
  const [selectedAddress, setSelectedAddress] = useState('');

  // Step 2: Items Cart
  const [cart, setCart] = useState<PosCartItem[]>([]);

  // Step 3: Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mpesa');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid');
  const [paymentReference, setPaymentReference] = useState('');

  // Sale Completion State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedOrderNumber, setCompletedOrderNumber] = useState<string | null>(null);

  if (!currentUser || !['admin', 'director', 'operator', 'sales_rep'].includes(currentUser.role)) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-9 h-9" />
        </div>
        <h1 className="text-2xl font-black text-slate-900">Access Restricted</h1>
        <p className="text-sm text-slate-600">POS cashiering is reserved for authorized station staff.</p>
      </div>
    );
  }

  // Cart operations
  const handleAddToCart = (newItem: PosCartItem) => {
    setCart((prev) => {
      const idx = prev.findIndex(
        (i) => i.productId === newItem.productId && i.orderType === newItem.orderType && i.incomingBrand === newItem.incomingBrand && i.unitPrice === newItem.unitPrice
      );
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx].quantity += newItem.quantity;
        return copy;
      }
      return [...prev, newItem];
    });
    showSuccess(`Added ${newItem.productName} to ticket`);
  };

  const handleUpdateCartQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id === id) {
            const nextQty = item.quantity + delta;
            return nextQty > 0 ? { ...item, quantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as PosCartItem[]
    );
  };

  const handleRemoveFromCart = (id: string) => {
    setCart((prev) => prev.filter((i) => i.id !== id));
  };

  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const totalKes = subtotal; // Free delivery (KES 0)

  // Validation & Submission
  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      showError('Please add at least one cylinder or item to the ticket.');
      setActiveStep(2);
      return;
    }

    if (!receiptNumber.trim()) {
      showError('Physical paper receipt ticket number is required for accounting.');
      return;
    }

    if (!isPosWalkin && !selectedCustomer) {
      showError('Deliveries require customer phone & address. Please select or add a customer in Step 1.');
      setActiveStep(1);
      return;
    }

    setIsSubmitting(true);
    try {
      const customerName = selectedCustomer ? selectedCustomer.name : 'Walk-in Counter Customer';
      const customerPhone = selectedPhone || selectedCustomer?.phones[0]?.phone_number || '+254700000000';
      const deliveryEstate = selectedAddress || selectedCustomer?.locations[0]?.estate || 'Nairobi Counter';

      const order = await createOrder({
        branch_id: selectedBranchId,
        is_pos_walkin: isPosWalkin,
        customer_id: selectedCustomer?.id || null,
        receipt_number: receiptNumber.trim(),
        created_at: (() => {
          const now = new Date();
          const [y, m, d] = receiptDate.split('-').map(Number);
          return y && m && d
            ? new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString()
            : now.toISOString();
        })(),
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_estate: isPosWalkin ? undefined : deliveryEstate,
        delivery_address: isPosWalkin ? undefined : selectedAddress,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        payment_reference: paymentReference.trim() || undefined,
        delivery_fee_kes: 0, // Free delivery standard
        items: cart.map((i) => ({
          product_id: i.productId,
          order_type: i.orderType,
          outgoing_brand: i.outgoingBrand,
          incoming_brand: i.incomingBrand || undefined,
          cylinder_size_kg: i.cylinderSizeKg,
          quantity: i.quantity,
          unit_price_kes: i.unitPrice,
        })),
      });

      setCompletedOrderNumber(order.order_number);
      setCart([]);
      setReceiptNumber('');
      setSelectedCustomer(null);
      setIsPosWalkin(true);
      setPaymentReference('');
      showSuccess(`Sale completed! Ticket #${order.order_number}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to finalize sale';
      showError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalCartCount = cart.reduce((acc, i) => acc + i.quantity, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 pb-36 space-y-4">
      {/* 1. Station Hub & Sensible Options */}
      <PosAdvancedHeader
        branches={branches}
        selectedBranchId={selectedBranchId}
        onSelectBranch={setSelectedBranchId}
        receiptDate={receiptDate}
        onChangeDate={setReceiptDate}
        receiptNumber={receiptNumber}
        onChangeReceiptNumber={setReceiptNumber}
        currentUser={currentUser}
      />

      {/* Sale Success Screen */}
      {completedOrderNumber && (
        <div className="p-6 bg-emerald-50 border-2 border-emerald-400 rounded-3xl text-center space-y-3 animate-in zoom-in-95">
          <div className="w-14 h-14 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-md">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900">
              Sale Finalized: <span className="font-mono text-emerald-700">{completedOrderNumber}</span>
            </h3>
            <p className="text-sm font-bold text-slate-600 mt-1">
              Stock counts reconciled in branch inventory. Receipt logged.
            </p>
          </div>
          <Button
            onClick={() => {
              setCompletedOrderNumber(null);
              setActiveStep(2);
            }}
            variant="success"
            size="md"
          >
            Start Next Sale
          </Button>
        </div>
      )}

      {/* 2. Fast 3-Step Stepper Header */}
      <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-200 rounded-2xl select-none">
        <button
          type="button"
          onClick={() => setActiveStep(1)}
          className={`min-h-[44px] px-2 py-1.5 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-1.5 ${
            activeStep === 1
              ? 'bg-white text-slate-900 shadow-md'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4 text-orange-600" />
          <span>1. Customer</span>
          {selectedCustomer && <Badge variant="success">✓</Badge>}
        </button>

        <button
          type="button"
          onClick={() => setActiveStep(2)}
          className={`min-h-[44px] px-2 py-1.5 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-1.5 ${
            activeStep === 2
              ? 'bg-white text-slate-900 shadow-md'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Package className="w-4 h-4 text-orange-600" />
          <span>2. Cylinders</span>
          {cart.length > 0 && (
            <span className="w-5 h-5 rounded-full bg-orange-600 text-white text-[11px] flex items-center justify-center font-black">
              {totalCartCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveStep(3)}
          className={`min-h-[44px] px-2 py-1.5 rounded-xl text-xs sm:text-sm font-black transition flex items-center justify-center gap-1.5 ${
            activeStep === 3
              ? 'bg-white text-slate-900 shadow-md'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <CreditCard className="w-4 h-4 text-orange-600" />
          <span>3. Payment</span>
          <span className="text-[11px] font-mono font-black text-slate-900 hidden sm:inline">
            {formatKES(totalKes)}
          </span>
        </button>
      </div>

      {/* 3. STEP CONTENT */}
      {activeStep === 1 && (
        <PosCustomerStep
          isPosWalkin={isPosWalkin}
          onToggleWalkin={setIsPosWalkin}
          customers={customers}
          selectedCustomer={selectedCustomer}
          onSelectCustomer={setSelectedCustomer}
          selectedPhone={selectedPhone}
          onChangePhone={setSelectedPhone}
          selectedAddress={selectedAddress}
          onChangeAddress={setSelectedAddress}
          onCreateCustomer={createCustomer}
        />
      )}

      {activeStep === 2 && (
        <PosItemsStep
          products={products}
          cart={cart}
          onAddToCart={handleAddToCart}
          onUpdateCartQty={handleUpdateCartQty}
          onRemoveFromCart={handleRemoveFromCart}
        />
      )}

      {activeStep === 3 && (
        <PosPayStep
          paymentMethod={paymentMethod}
          onChangePaymentMethod={setPaymentMethod}
          paymentStatus={paymentStatus}
          onChangePaymentStatus={setPaymentStatus}
          paymentReference={paymentReference}
          onChangePaymentReference={setPaymentReference}
          subtotal={subtotal}
          deliveryFee={0}
        />
      )}

      {/* 4. Sticky Bottom Bar with Grand Total & Complete Action */}
      <PosStickySummary
        itemCount={totalCartCount}
        totalKes={totalKes}
        isSubmitting={isSubmitting}
        onCompleteSale={handleCompleteSale}
        canComplete={cart.length > 0}
      />
    </div>
  );
}
