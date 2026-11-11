'use client';

import React, { useState } from 'react';
import { useStore } from '@/context/store-context';
import { OrderType, PaymentMethod, PaymentStatus, Product } from '@/types';
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  Building2,
  DollarSign,
  ArrowRight,
  Flame,
  AlertCircle,
  Zap,
  User,
  Phone,
  MapPin,
  ChevronDown,
} from 'lucide-react';

export default function SalesPage() {
  const { currentUser, branches, products, orders, createOrder } = useStore();

  const [isPosWalkin, setIsPosWalkin] = useState(true); // Default to Walk-In for instant speed
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id || '');
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('+254700000000');
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
  const [showMobileCartDrawer, setShowMobileCartDrawer] = useState(false);

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

  // Helper to add or merge item into cart (DEDUPLICATION FIX)
  const addProductToCart = (prod: Product, type: OrderType, incoming: string, qty: number) => {
    let price = 0;
    if (type === 'refill') price = prod.refill_price_kes;
    else if (type === 'complete') price = prod.complete_price_kes;
    else price = prod.accessory_price_kes;

    const incBrand = type === 'refill' ? (incoming || prod.brand) : '';

    setCart((prev) => {
      // Find existing item with matching productId, orderType, and incomingBrand
      const existingIdx = prev.findIndex(
        (i) => i.productId === prod.id && i.orderType === type && i.incomingBrand === incBrand
      );

      if (existingIdx >= 0) {
        // Merge into existing item
        const copy = [...prev];
        copy[existingIdx] = {
          ...copy[existingIdx],
          quantity: copy[existingIdx].quantity + qty,
        };
        return copy;
      }

      // Add new item
      const newItem: CartItem = {
        id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        productId: prod.id,
        orderType: type,
        outgoingBrand: prod.brand,
        incomingBrand: incBrand,
        cylinderSizeKg: prod.size_kg,
        quantity: qty,
        unitPrice: price,
      };
      return [...prev, newItem];
    });
  };

  const handleAddToCart = () => {
    const prod = products.find((p) => p.id === selectedProductId);
    if (!prod) return;
    addProductToCart(prod, itemType, incomingBrand, itemQuantity);
    setItemQuantity(1);
  };

  // 1-Tap Fast Add Preset for Top Sellers
  const handleQuickAdd = (productName: string, type: OrderType) => {
    const prod = products.find((p) => p.name.toLowerCase().includes(productName.toLowerCase()));
    if (!prod) return;
    addProductToCart(prod, type, prod.brand, 1);
  };

  const updateCartItemQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.id !== id) return item;
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        })
        .filter((item): item is CartItem => item !== null)
    );
  };

  const handleRemoveFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const totalCartCount = cart.reduce((acc, item) => acc + item.quantity, 0);
  const subtotal = cart.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
  const finalDeliveryFee = isPosWalkin ? 0 : deliveryFee;
  const grandTotal = subtotal + finalDeliveryFee;

  // Toggle walkin defaults
  const handleToggleMode = (walkin: boolean) => {
    setIsPosWalkin(walkin);
    if (walkin) {
      if (!customerName || customerName === '') setCustomerName('Walk-in Customer');
      if (!customerPhone || customerPhone === '') setCustomerPhone('+254700000000');
    } else {
      if (customerName === 'Walk-in Customer') setCustomerName('');
      if (customerPhone === '+254700000000') setCustomerPhone('');
    }
  };

  // Submit order
  const handleCreateOrder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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
      if (!isPosWalkin) {
        setCustomerName('');
        setCustomerPhone('');
        setDeliveryAddress('');
      }
      setPaymentReference('');
      setShowMobileCartDrawer(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-12 space-y-6">
      {/* Page Title & Fast Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" /> POS & Fast Order Entry
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Quick cylinder exchange, instant walk-in cashiering, and estate deliveries.
          </p>
        </div>

        {/* Branch Quick Pill */}
        <div className="flex items-center gap-2 self-start sm:self-auto bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-sm">
          <Building2 className="w-4 h-4 text-orange-600 shrink-0" />
          <span className="text-xs font-semibold text-slate-700">Hub:</span>
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="text-xs font-bold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.code})
              </option>
            ))}
          </select>
        </div>
      </div>

      {successOrderNumber && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center shadow-sm">
          <CheckCircle className="w-9 h-9 text-emerald-600 mx-auto mb-1.5" />
          <h3 className="text-base sm:text-lg font-bold text-emerald-950">
            Order Complete: <span className="font-mono text-emerald-700">{successOrderNumber}</span>
          </h3>
          <p className="text-xs text-emerald-700 mt-0.5">
            Stock automatically reconciled in {activeBranch.name}.
          </p>
          <button
            onClick={() => setSuccessOrderNumber(null)}
            className="mt-3 min-h-[44px] px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow"
          >
            Start Next Sale
          </button>
        </div>
      )}

      {/* 1-Tap Quick Refill Add Presets (SPEED UP SALE ENTRY) */}
      <div className="bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200/80 rounded-2xl p-4 shadow-sm">
        <div className="flex items-center gap-1.5 text-xs font-bold text-orange-900 uppercase tracking-wider mb-2.5">
          <Zap className="w-4 h-4 text-orange-600" /> Fast-Add Top Sellers (1 Tap to Cart)
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          <button
            type="button"
            onClick={() => handleQuickAdd('Pro Gas 6kg', 'refill')}
            className="min-h-[44px] p-2.5 bg-white hover:bg-orange-500 hover:text-white border border-orange-200 rounded-xl text-left transition shadow-sm group"
          >
            <div className="text-[11px] font-bold text-slate-900 group-hover:text-white truncate">Pro Gas 6kg</div>
            <div className="text-[10px] text-orange-600 group-hover:text-orange-100 font-semibold">Refill • 1,250/=</div>
          </button>
          <button
            type="button"
            onClick={() => handleQuickAdd('Pro Gas 13kg', 'refill')}
            className="min-h-[44px] p-2.5 bg-white hover:bg-orange-500 hover:text-white border border-orange-200 rounded-xl text-left transition shadow-sm group"
          >
            <div className="text-[11px] font-bold text-slate-900 group-hover:text-white truncate">Pro Gas 13kg</div>
            <div className="text-[10px] text-orange-600 group-hover:text-orange-100 font-semibold">Refill • 2,800/=</div>
          </button>
          <button
            type="button"
            onClick={() => handleQuickAdd('K-Gas 13kg', 'refill')}
            className="min-h-[44px] p-2.5 bg-white hover:bg-orange-500 hover:text-white border border-orange-200 rounded-xl text-left transition shadow-sm group"
          >
            <div className="text-[11px] font-bold text-slate-900 group-hover:text-white truncate">K-Gas 13kg</div>
            <div className="text-[10px] text-orange-600 group-hover:text-orange-100 font-semibold">Refill • 2,850/=</div>
          </button>
          <button
            type="button"
            onClick={() => handleQuickAdd('Total Gas 13kg', 'refill')}
            className="min-h-[44px] p-2.5 bg-white hover:bg-orange-500 hover:text-white border border-orange-200 rounded-xl text-left transition shadow-sm group"
          >
            <div className="text-[11px] font-bold text-slate-900 group-hover:text-white truncate">Total 13kg</div>
            <div className="text-[10px] text-orange-600 group-hover:text-orange-100 font-semibold">Refill • 2,900/=</div>
          </button>
          <button
            type="button"
            onClick={() => handleQuickAdd('Regulator', 'accessory')}
            className="min-h-[44px] p-2.5 bg-white hover:bg-orange-500 hover:text-white border border-orange-200 rounded-xl text-left transition shadow-sm group"
          >
            <div className="text-[11px] font-bold text-slate-900 group-hover:text-white truncate">Regulator 20mm</div>
            <div className="text-[10px] text-slate-500 group-hover:text-orange-100 font-semibold">950/=</div>
          </button>
          <button
            type="button"
            onClick={() => handleQuickAdd('Hose Pipe', 'accessory')}
            className="min-h-[44px] p-2.5 bg-white hover:bg-orange-500 hover:text-white border border-orange-200 rounded-xl text-left transition shadow-sm group"
          >
            <div className="text-[11px] font-bold text-slate-900 group-hover:text-white truncate">Gas Hose 1.5m</div>
            <div className="text-[10px] text-slate-500 group-hover:text-orange-100 font-semibold">450/=</div>
          </button>
        </div>
      </div>

      {/* Main Grid: Form Left, Cart Right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Form Sections */}
        <div className="lg:col-span-2 space-y-5">
          {/* Section 1: Sale Mode (Walk-In vs Delivery) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Step 1: Order Mode</span>
              {/* Segmented Control with 44px min-touch */}
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => handleToggleMode(true)}
                  className={`min-h-[40px] px-4 py-1.5 text-xs font-bold rounded-lg transition ${
                    isPosWalkin ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Walk-In Counter (POS)
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleMode(false)}
                  className={`min-h-[40px] px-4 py-1.5 text-xs font-bold rounded-lg transition ${
                    !isPosWalkin ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Bike Delivery
                </button>
              </div>
            </div>

            {/* Customer Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Name</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Alice Mutua"
                  className="w-full min-h-[44px] px-3.5 py-2 text-base md:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Phone (M-Pesa)</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="+2547..."
                  className="w-full min-h-[44px] px-3.5 py-2 text-base md:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none bg-slate-50/50"
                />
              </div>

              {!isPosWalkin && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Estate / Neighborhood</label>
                    <input
                      type="text"
                      value={deliveryEstate}
                      onChange={(e) => setDeliveryEstate(e.target.value)}
                      placeholder="e.g. Westlands, Kilimani, Roysambu"
                      className="w-full min-h-[44px] px-3.5 py-2 text-base md:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Building & Apt / House #</label>
                    <input
                      type="text"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      placeholder="e.g. Delta Heights, House 4B"
                      className="w-full min-h-[44px] px-3.5 py-2 text-base md:text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none"
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Section 2: Custom Item / Universal Brand Swap */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Step 2: Custom Cylinder or Brand Exchange
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Type</label>
                <select
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value as OrderType)}
                  className="w-full min-h-[44px] text-xs font-semibold border border-slate-300 rounded-xl px-2.5 bg-white text-slate-800"
                >
                  <option value="refill">Refill (Cylinder Swap)</option>
                  <option value="complete">Complete (New Unit)</option>
                  <option value="accessory">Accessory</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  {itemType === 'accessory' ? 'Product' : 'Outgoing Full Cylinder'}
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full min-h-[44px] text-xs border border-slate-300 rounded-xl px-2 bg-white text-slate-800"
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

              {itemType === 'refill' ? (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Customer Tare In (Swap)</label>
                  <select
                    value={incomingBrand}
                    onChange={(e) => setIncomingBrand(e.target.value)}
                    className="w-full min-h-[44px] text-xs border border-slate-300 rounded-xl px-2 bg-white text-slate-800"
                  >
                    <option value="Pro Gas">Pro Gas (Empty)</option>
                    <option value="TotalEnergies">TotalEnergies (Empty)</option>
                    <option value="K-Gas">K-Gas (Empty)</option>
                    <option value="Afrigas">Afrigas (Empty)</option>
                    <option value="Ola Energy">Ola Energy (Empty)</option>
                  </select>
                </div>
              ) : (
                <div className="flex items-center text-xs text-slate-400 pt-6">No swap tare needed</div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Qty:</span>
                <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => setItemQuantity((q) => Math.max(1, q - 1))}
                    className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-10 text-center font-bold text-sm text-slate-800">{itemQuantity}</span>
                  <button
                    type="button"
                    onClick={() => setItemQuantity((q) => q + 1)}
                    className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddToCart}
                className="min-h-[44px] px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-2 shadow"
              >
                <Plus className="w-4 h-4" /> Add Item To Cart
              </button>
            </div>
          </div>

          {/* Section 3: Payment Details */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Step 3: Payment Record</span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full min-h-[44px] text-xs border border-slate-300 rounded-xl px-2.5 bg-white text-slate-800"
                >
                  <option value="mpesa">M-Pesa (Till / STK)</option>
                  <option value="cash">Cash (Counter / Hand)</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                  className="w-full min-h-[44px] text-xs border border-slate-300 rounded-xl px-2.5 bg-white text-slate-800 font-bold"
                >
                  <option value="paid">PAID (Verified)</option>
                  <option value="pending">PENDING (Pay on delivery)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Receipt / M-Pesa Code</label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value.toUpperCase())}
                  placeholder="e.g. QGK81920X"
                  className="w-full min-h-[44px] px-3 py-2 text-xs font-mono uppercase border border-slate-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Cart & Order Review (Desktop + Sticky Drawer on Mobile) */}
        <div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm sticky top-20">
            <h3 className="text-base font-bold text-slate-900 mb-3 pb-2 border-b border-slate-100 flex items-center justify-between">
              <span>Cart & Total</span>
              <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                {totalCartCount} item{totalCartCount !== 1 ? 's' : ''}
              </span>
            </h3>

            {cart.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs">
                <ShoppingCart className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No items in cart. Tap a quick-add preset or custom item.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 mb-4 max-h-72 overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div key={item.id} className="py-3 flex items-center justify-between gap-3 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 truncate">
                        {item.outgoingBrand} {item.cylinderSizeKg ? `${item.cylinderSizeKg}kg` : ''}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {item.orderType === 'refill' && (
                          <span className="text-orange-600 font-medium">Swap: {item.incomingBrand} in</span>
                        )}
                        {item.orderType === 'complete' && 'Complete Unit'}
                        {item.orderType === 'accessory' && 'Accessory'}
                      </div>
                      <div className="font-semibold text-slate-700 mt-0.5">
                        KES {(item.unitPrice * item.quantity).toLocaleString()}
                      </div>
                    </div>

                    {/* Quantity Increment / Decrement directly in Cart */}
                    <div className="flex items-center gap-1">
                      <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                        <button
                          type="button"
                          onClick={() => updateCartItemQuantity(item.id, -1)}
                          className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center font-bold text-xs">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateCartItemQuantity(item.id, 1)}
                          className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveFromCart(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 transition"
                        title="Delete line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Calculations Breakdown */}
            <div className="space-y-1.5 pt-3 border-t border-slate-100 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-semibold">KES {subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Delivery Fee:</span>
                <span className="font-semibold">
                  {isPosWalkin ? 'KES 0 (Walk-In)' : `KES ${finalDeliveryFee.toLocaleString()}`}
                </span>
              </div>
              <div className="flex justify-between text-slate-900 font-bold text-base pt-2 border-t border-slate-200">
                <span>Total Amount:</span>
                <span className="text-orange-600">KES {grandTotal.toLocaleString()}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={isSubmitting || cart.length === 0}
              onClick={() => handleCreateOrder()}
              className="mt-5 w-full min-h-[48px] py-3 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm rounded-xl transition shadow-md disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Recording...' : 'Complete & Dispatch Sale'} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Sticky Quick-Checkout Bar (Touch-friendly Thumb Zone) */}
      <div className="md:hidden fixed bottom-14 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 p-3 z-40 shadow-lg">
        <div className="max-w-md mx-auto flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block">Total ({totalCartCount} items)</span>
            <span className="text-base font-extrabold text-orange-600">KES {grandTotal.toLocaleString()}</span>
          </div>

          <button
            type="button"
            disabled={isSubmitting || cart.length === 0}
            onClick={() => handleCreateOrder()}
            className="flex-1 min-h-[44px] px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow transition disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            {isSubmitting ? 'Recording...' : 'Finish Sale'} <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
