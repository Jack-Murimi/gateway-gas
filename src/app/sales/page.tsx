'use client';

import React, { useState } from 'react';
import { useStore } from '@/context/store-context';
import { OrderType, PaymentMethod, PaymentStatus } from '@/types';
import {
  ShoppingCart,
  Plus,
  Trash2,
  CheckCircle,
  Building2,
  DollarSign,
  ArrowRight,
  Flame,
  AlertCircle,
} from 'lucide-react';

export default function SalesPage() {
  const { currentUser, branches, products, inventory, orders, createOrder } = useStore();

  const [isPosWalkin, setIsPosWalkin] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id || '');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryEstate, setDeliveryEstate] = useState('Westlands');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryFee, setDeliveryFee] = useState(200);

  // Payment fields
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mpesa');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid');
  const [paymentReference, setPaymentReference] = useState('');

  // Cart / Line items
  interface CartItem {
    id: string;
    productId: string;
    orderType: OrderType;
    outgoingBrand: string;
    incomingBrand: string;
    cylinderSizeKg: number | null;
    quantity: number;
    unitPrice: number;
  }

  const [cart, setCart] = useState<CartItem[]>([]);
  const [itemType, setItemType] = useState<OrderType>('refill');
  const [selectedProductId, setSelectedProductId] = useState(products[0]?.id || '');
  const [incomingBrand, setIncomingBrand] = useState('Afrigas');
  const [itemQuantity, setItemQuantity] = useState(1);
  const [successOrderNumber, setSuccessOrderNumber] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!currentUser || !['admin', 'director', 'operator', 'sales_rep'].includes(currentUser.role)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-slate-900">Access Restricted</h1>
        <p className="text-sm text-slate-500 mt-1">POS and order entry is reserved for Sales Representatives and Operations.</p>
      </div>
    );
  }

  const activeBranch = branches.find((b) => b.id === selectedBranchId) || branches[0];

  // Helper to add item to cart
  const handleAddToCart = () => {
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;

    let price = 0;
    if (itemType === 'refill') price = prod.refill_price_kes;
    else if (itemType === 'complete') price = prod.complete_price_kes;
    else price = prod.accessory_price_kes;

    const newItem: CartItem = {
      id: `cart-${Date.now()}`,
      productId: prod.id,
      orderType: itemType,
      outgoingBrand: prod.brand,
      incomingBrand: itemType === 'refill' ? incomingBrand : '',
      cylinderSizeKg: prod.size_kg,
      quantity: itemQuantity,
      unitPrice: price,
    };

    setCart((prev) => [...prev, newItem]);
    setItemQuantity(1);
  };

  const handleRemoveFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const subtotal = cart.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const finalDeliveryFee = isPosWalkin ? 0 : deliveryFee;
  const grandTotal = subtotal + finalDeliveryFee;

  // Submit order
  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      alert('Please add at least one cylinder or accessory to the order.');
      return;
    }
    if (!customerName || !customerPhone) {
      alert('Please enter customer name and phone.');
      return;
    }

    setIsSubmitting(true);
    try {
      const order = await createOrder({
        branch_id: selectedBranchId,
        is_pos_walkin: isPosWalkin,
        customer_name: customerName,
        customer_phone: customerPhone,
        delivery_estate: isPosWalkin ? 'Walk-In POS' : deliveryEstate,
        delivery_address: isPosWalkin ? 'Counter' : deliveryAddress,
        delivery_fee_kes: finalDeliveryFee,
        payment_method: paymentMethod,
        payment_status: paymentStatus,
        payment_reference: paymentReference || undefined,
        items: cart.map((item) => ({
          product_id: item.productId,
          order_type: item.orderType,
          outgoing_brand: item.outgoingBrand,
          incoming_brand: item.incomingBrand || undefined,
          cylinder_size_kg: item.cylinderSizeKg,
          quantity: item.quantity,
          unit_price_kes: item.unitPrice,
        })),
      });

      setSuccessOrderNumber(order.order_number);
      setCart([]);
      setCustomerName('');
      setCustomerPhone('');
      setDeliveryAddress('');
      setPaymentReference('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-orange-600" /> Sales Desk & POS Terminal
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Create customer orders, process walk-in cylinder swaps, and log M-Pesa / cash receipts.
          </p>
        </div>
      </div>

      {successOrderNumber && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center shadow-sm">
          <CheckCircle className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
          <h3 className="text-lg font-bold text-emerald-950">
            Order Created Successfully: <span className="font-mono text-emerald-700">{successOrderNumber}</span>
          </h3>
          <p className="text-xs text-emerald-700 mt-1">
            Inventory decremented from {activeBranch.name}. Sent to Operations dispatch desk.
          </p>
          <button
            onClick={() => setSuccessOrderNumber(null)}
            className="mt-4 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg transition"
          >
            Create Another Sale
          </button>
        </div>
      )}

      {/* Main Order Form Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: Form Inputs */}
        <div className="lg:col-span-2 space-y-6">
          {/* 1. Branch Dispatch Selector (Mandated by user answer: sales rep picks dispatch branch) */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-orange-600" /> Step 1: Select Dispatch Branch
              </h2>
              <span className="text-xs text-slate-500">Inventory will be deducted here</span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {branches.map((b) => (
                <button
                  type="button"
                  key={b.id}
                  onClick={() => setSelectedBranchId(b.id)}
                  className={`p-3 rounded-xl border text-left transition ${
                    selectedBranchId === b.id
                      ? 'border-orange-600 bg-orange-50/50 ring-2 ring-orange-500/20'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="font-bold text-xs text-slate-900">{b.name}</div>
                  <div className="text-[10px] text-slate-500 mt-1">{b.location_estate}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Customer & Delivery Information */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900">Step 2: Customer & Delivery Mode</h2>
              <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setIsPosWalkin(false)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                    !isPosWalkin ? 'bg-white shadow text-slate-900' : 'text-slate-500'
                  }`}
                >
                  Delivery
                </button>
                <button
                  type="button"
                  onClick={() => setIsPosWalkin(true)}
                  className={`px-3 py-1 text-xs font-semibold rounded-md transition ${
                    isPosWalkin ? 'bg-white shadow text-slate-900' : 'text-slate-500'
                  }`}
                >
                  Walk-in POS
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Alice Mutua"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Phone (M-Pesa) *</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+2547..."
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>

              {!isPosWalkin && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Delivery Estate / Area *</label>
                    <input
                      type="text"
                      value={deliveryEstate}
                      onChange={(e) => setDeliveryEstate(e.target.value)}
                      placeholder="e.g. Westlands, Kilimani, Roysambu"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Building & House Number *</label>
                    <input
                      type="text"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="e.g. Delta Heights, 5th Floor, Apt 5B"
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 3. Products & Cylinder Brand-Swap Exchange */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-600" /> Step 3: Add Items & Universal Brand Swap
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Transaction Type</label>
                <select
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value as OrderType)}
                  className="w-full text-xs font-semibold border border-slate-300 rounded-lg p-2 bg-white text-slate-800"
                >
                  <option value="refill">Refill (Cylinder Swap)</option>
                  <option value="complete">Complete Cylinder (New + Gas)</option>
                  <option value="accessory">Accessory (Hose/Regulator)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  {itemType === 'accessory' ? 'Accessory' : 'Outgoing Cylinder (Full)'}
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-800"
                >
                  {products
                    .filter((p) => (itemType === 'accessory' ? p.category === 'accessory' : p.category === 'cylinder'))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — KES{' '}
                        {itemType === 'refill'
                          ? p.refill_price_kes
                          : itemType === 'complete'
                          ? p.complete_price_kes
                          : p.accessory_price_kes}
                      </option>
                    ))}
                </select>
              </div>

              {itemType === 'refill' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Customer Empty Tare Brand (In)
                  </label>
                  <select
                    value={incomingBrand}
                    onChange={(e) => setIncomingBrand(e.target.value)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-800"
                  >
                    <option value="Pro Gas">Pro Gas (Empty)</option>
                    <option value="TotalEnergies">TotalEnergies (Empty)</option>
                    <option value="K-Gas">K-Gas (Empty)</option>
                    <option value="Afrigas">Afrigas (Empty)</option>
                    <option value="Ola Energy">Ola Energy (Empty)</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-700">Quantity:</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
                  className="w-16 px-2 py-1 text-sm border border-slate-300 rounded-lg text-center"
                />
              </div>

              <button
                type="button"
                onClick={handleAddToCart}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl transition flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" /> Add To Cart
              </button>
            </div>
          </div>

          {/* 4. Payment Logging by Sales Rep */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-orange-600" /> Step 4: Record Payment (Sales Rep)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-800"
                >
                  <option value="mpesa">M-Pesa (STK / Till)</option>
                  <option value="cash">Cash on Delivery / Counter</option>
                  <option value="bank_transfer">Bank Transfer / Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Status</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2 bg-white text-slate-800"
                >
                  <option value="paid">PAID (Verified)</option>
                  <option value="pending">PENDING (Pay on delivery)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Payment Reference / Code <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. QGK89123KL or Cash Slip"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Cart & Order Review */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm sticky top-20">
            <h3 className="text-base font-bold text-slate-900 mb-4 pb-3 border-b border-slate-100 flex items-center justify-between">
              <span>Order Summary</span>
              <span className="text-xs font-normal text-slate-500">{cart.length} item(s)</span>
            </h3>

            {cart.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">Cart is empty. Add items from the catalog.</p>
            ) : (
              <div className="divide-y divide-slate-100 mb-6 max-h-60 overflow-y-auto">
                {cart.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-start justify-between gap-2 text-xs">
                    <div>
                      <div className="font-semibold text-slate-900">
                        {item.quantity}x {item.outgoingBrand} {item.cylinderSizeKg ? `${item.cylinderSizeKg}kg` : ''}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {item.orderType === 'refill' && (
                          <span className="text-orange-600">Swap: Customer {item.incomingBrand} In</span>
                        )}
                        {item.orderType === 'complete' && 'New tare + full charge'}
                        {item.orderType === 'accessory' && 'Accessory component'}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-slate-800">KES {(item.unitPrice * item.quantity).toLocaleString()}</div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFromCart(item.id)}
                        className="text-red-500 hover:text-red-700 text-[10px] flex items-center gap-0.5 ml-auto mt-0.5"
                      >
                        <Trash2 className="w-3 h-3" /> Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Calculations */}
            <div className="space-y-2 pt-3 border-t border-slate-100 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-semibold">KES {subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Delivery Fee:</span>
                <span className="font-semibold">
                  {isPosWalkin ? 'KES 0 (POS Walk-In)' : `KES ${finalDeliveryFee.toLocaleString()}`}
                </span>
              </div>
              <div className="flex justify-between text-slate-900 font-bold text-sm pt-2 border-t border-slate-200">
                <span>Total Amount:</span>
                <span className="text-orange-600">KES {grandTotal.toLocaleString()}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={isSubmitting || cart.length === 0}
              onClick={handleCreateOrder}
              className="mt-6 w-full py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm rounded-xl transition shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Processing...' : 'Complete & Dispatch Sale'} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
