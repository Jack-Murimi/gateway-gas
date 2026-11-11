'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '@/context/store-context';
import { OrderType, PaymentMethod, PaymentStatus, Product, Customer, CustomerPhone, CustomerLocation } from '@/types';
import {
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  CheckCircle,
  Building2,
  Calendar,
  Receipt,
  Search,
  UserCheck,
  UserPlus,
  X,
  AlertCircle,
  ArrowRight,
  Flame,
  Droplets,
  Wrench,
  Check,
} from 'lucide-react';

export default function SalesPage() {
  const { currentUser, branches, products, customers, createCustomer, createOrder } = useStore();

  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id || '');
  const activeBranch = branches.find((b) => b.id === selectedBranchId) || branches[0];

  // Header: Date & Physical Receipt Book # (Blank by default for manual paper book entry)
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [receiptNumber, setReceiptNumber] = useState('');

  // Customer state: default to null (anonymous Walk-in)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedPhone, setSelectedPhone] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<{ estate: string; address: string }>({
    estate: '',
    address: '',
  });

  // Search & New Customer state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustEstate, setNewCustEstate] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');

  // Order mode: Walk-In vs Delivery
  const [isPosWalkin, setIsPosWalkin] = useState(true);

  // Payment fields
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('mpesa');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid');
  const [paymentReference, setPaymentReference] = useState('');

  // Cart / Line items
  interface CartItem {
    id: string;
    productId: string;
    productName: string;
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
  const [productFilterCat, setProductFilterCat] = useState<'all' | 'cylinder' | 'water' | 'accessory'>('all');
  const [productSearchQuery, setProductSearchQuery] = useState('');
  const [showProductSearchResults, setShowProductSearchResults] = useState(false);
  const [incomingBrand, setIncomingBrand] = useState('Afrigas');
  const [itemQuantity, setItemQuantity] = useState(1);
  const [successOrderNumber, setSuccessOrderNumber] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showAddressPicker, setShowAddressPicker] = useState(false);

  if (!currentUser || !['admin', 'director', 'operator', 'sales_rep'].includes(currentUser.role)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-slate-900">Access Restricted</h1>
        <p className="text-sm text-slate-500 mt-1">POS and order entry is reserved for Sales Representatives and Operations.</p>
      </div>
    );
  }

  const canEditDate = ['admin', 'director', 'operator'].includes(currentUser.role);
  const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0];

  // Search matching customers by name, phone, or location
  const matchingCustomers = customerSearchQuery.trim()
    ? customers.filter((c) => {
        const q = customerSearchQuery.toLowerCase();
        const matchesName = c.name.toLowerCase().includes(q);
        const matchesPhone = c.phones.some((p) => p.phone_number.includes(q));
        const matchesLoc = c.locations.some(
          (l) => l.estate.toLowerCase().includes(q) || (l.specific_address && l.specific_address.toLowerCase().includes(q))
        );
        return matchesName || matchesPhone || matchesLoc;
      })
    : [];

  const handleSelectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    const primPhone = c.phones.find((p) => p.is_primary) || c.phones[0];
    const defLoc = c.locations.find((l) => l.is_default) || c.locations[0];
    setSelectedPhone(primPhone ? primPhone.phone_number : '');
    setSelectedLocation({
      estate: defLoc ? defLoc.estate : '',
      address: defLoc?.specific_address || '',
    });
    setCustomerSearchQuery('');
    setShowSearchResults(false);
  };

  const handleClearCustomerToWalkin = () => {
    setSelectedCustomer(null);
    setSelectedPhone('');
    setSelectedLocation({ estate: '', address: '' });
    setIsPosWalkin(true); // Anonymous must be walk-in
  };

  const handleCreateCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName || !newCustPhone) {
      alert('Customer name and phone are required.');
      return;
    }
    const created = createCustomer(newCustName, newCustPhone, newCustEstate || 'Nairobi', newCustAddress);
    handleSelectCustomer(created);
    setShowNewCustomerForm(false);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustEstate('');
    setNewCustAddress('');
  };

  // Cart helper with deduplication
  const addProductToCart = (prod: Product, type: OrderType, incoming: string, qty: number) => {
    let price = 0;
    if (type === 'refill') price = prod.refill_price_kes;
    else if (type === 'complete') price = prod.complete_price_kes;
    else price = prod.accessory_price_kes;

    const isExchange = prod.category === 'cylinder' || (prod.category === 'water' && prod.refill_price_kes > 0);
    const incBrand = type === 'refill' && isExchange ? (incoming || prod.brand) : '';

    setCart((prev) => {
      const existingIdx = prev.findIndex(
        (i) => i.productId === prod.id && i.orderType === type && i.incomingBrand === incBrand
      );

      if (existingIdx >= 0) {
        const copy = [...prev];
        copy[existingIdx] = {
          ...copy[existingIdx],
          quantity: copy[existingIdx].quantity + qty,
        };
        return copy;
      }

      const newItem: CartItem = {
        id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        productId: prod.id,
        productName: prod.name,
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
    if (!selectedProduct) return;
    addProductToCart(selectedProduct, itemType, incomingBrand, itemQuantity);
    setItemQuantity(1);
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
  const grandTotal = subtotal; // Free delivery

  // Submit order
  const handleCreateOrder = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (cart.length === 0) {
      alert('Please add at least one item to the cart.');
      return;
    }
    if (!receiptNumber.trim()) {
      alert('Physical receipt number is required.');
      return;
    }

    // Business rule: anonymous walk-in cannot use delivery
    if (!isPosWalkin && !selectedCustomer) {
      alert('Deliveries require customer details. Please select or add a customer.');
      return;
    }

    setIsSubmitting(true);
    try {
      const order = await createOrder({
        branch_id: selectedBranchId,
        is_pos_walkin: isPosWalkin,
        customer_id: selectedCustomer ? selectedCustomer.id : null,
        receipt_number: receiptNumber.trim(),
        created_at: new Date(saleDate).toISOString(),
        customer_name: selectedCustomer ? selectedCustomer.name : 'Walk-in Customer',
        customer_phone: selectedCustomer ? selectedPhone : '+254700000000',
        delivery_estate: isPosWalkin ? 'Walk-In POS' : selectedLocation.estate,
        delivery_address: isPosWalkin ? 'Counter' : selectedLocation.address,
        delivery_fee_kes: 0,
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
      handleClearCustomerToWalkin();
      setPaymentReference('');
      setReceiptNumber(''); // Blank by default for next paper receipt entry
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProductsForSelect = products.filter((p) => {
    if (productFilterCat !== 'all' && p.category !== productFilterCat) return false;
    if (itemType === 'refill' && p.refill_price_kes <= 0) return false;
    if (itemType === 'complete' && p.complete_price_kes <= 0) return false;
    if (itemType === 'accessory' && p.accessory_price_kes <= 0) return false;

    if (productSearchQuery.trim()) {
      const q = productSearchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchBrand = p.brand.toLowerCase().includes(q);
      const matchSize = p.size_kg
        ? `${p.size_kg}kg`.includes(q) || `${p.size_kg}l`.includes(q) || `${p.size_kg}` === q
        : false;
      return matchName || matchBrand || matchSize;
    }
    return true;
  });

  useEffect(() => {
    if (filteredProductsForSelect.length > 0) {
      const exists = filteredProductsForSelect.some((p) => p.id === selectedProductId);
      if (!exists) {
        setSelectedProductId(filteredProductsForSelect[0].id);
      }
    }
  }, [filteredProductsForSelect, selectedProductId]);

  const isWaterProduct = selectedProduct?.category === 'water';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 pb-24 md:pb-12 space-y-4">
      {/* 1. TOP INFO BAR: Date, Physical Receipt #, Branch Hub */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
          {/* Date */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="flex-1">
              <label className="block text-[10px] uppercase font-bold text-slate-400">Date</label>
              {canEditDate ? (
                <input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full text-xs font-semibold text-slate-800 border border-slate-300 rounded-lg px-2 py-1 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              ) : (
                <span className="text-xs font-bold text-slate-800">{saleDate}</span>
              )}
            </div>
          </div>

          {/* Physical Receipt # (Blank by default, solid black text) */}
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-black shrink-0" />
            <div className="flex-1">
              <label className="block text-[10px] uppercase font-bold text-slate-400">
                Receipt # (Paper Book) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={receiptNumber}
                onChange={(e) => setReceiptNumber(e.target.value)}
                placeholder={`e.g. ${activeBranch?.code || 'WST'}-1049`}
                className="w-full text-xs font-mono font-bold text-black border border-slate-300 rounded-lg px-2.5 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* Branch Hub Selector */}
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="flex-1">
              <label className="block text-[10px] uppercase font-bold text-slate-400">Branch Hub</label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full text-xs font-bold text-slate-900 border border-slate-300 rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-orange-500 cursor-pointer"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CUSTOMER & ORDER MODE BAR */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Left: Customer status / clean view */}
          <div className="flex-1">
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Customer</label>

            {selectedCustomer ? (
              /* Selected Known Customer: Clean Minimalist Card */
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-900">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  <span>{selectedCustomer.name}</span>
                  {selectedLocation.estate && (
                    <span className="text-emerald-700 font-medium">({selectedLocation.estate})</span>
                  )}
                </div>

                {/* Multiple locations/phones selector toggle */}
                {(selectedCustomer.locations.length > 1 || selectedCustomer.phones.length > 1) && (
                  <button
                    type="button"
                    onClick={() => setShowAddressPicker(!showAddressPicker)}
                    className="text-[11px] text-slate-500 hover:text-slate-800 underline font-medium"
                  >
                    Change phone/address
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleClearCustomerToWalkin}
                  className="inline-flex items-center gap-1 text-[11px] text-red-600 hover:text-red-700 font-bold ml-1"
                >
                  <X className="w-3.5 h-3.5" /> Clear to Walk-in
                </button>
              </div>
            ) : (
              /* Walk-in Default with Live Search */
              <div className="relative">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={customerSearchQuery}
                      onChange={(e) => {
                        setCustomerSearchQuery(e.target.value);
                        setShowSearchResults(true);
                      }}
                      onFocus={() => setShowSearchResults(true)}
                      placeholder="Walk-in Customer (type name, phone, or estate to search)..."
                      className="w-full text-xs border border-slate-300 rounded-xl pl-8 pr-3 py-2 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowNewCustomerForm(true)}
                    className="min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition flex items-center gap-1 shrink-0"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> + New Customer
                  </button>
                </div>

                {/* Live Search Dropdown */}
                {showSearchResults && customerSearchQuery.trim() && (
                  <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-30 max-h-56 overflow-y-auto divide-y divide-slate-100">
                    {matchingCustomers.length > 0 ? (
                      matchingCustomers.map((c) => {
                        const primPhone = c.phones.find((p) => p.is_primary) || c.phones[0];
                        const defLoc = c.locations.find((l) => l.is_default) || c.locations[0];
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => handleSelectCustomer(c)}
                            className="w-full text-left px-3 py-2.5 hover:bg-orange-50/70 transition flex items-center justify-between text-xs"
                          >
                            <div>
                              <span className="font-bold text-slate-900 block">{c.name}</span>
                              <span className="text-[11px] text-slate-500">
                                {primPhone?.phone_number} • {defLoc ? `${defLoc.estate} (${defLoc.specific_address || ''})` : ''}
                              </span>
                            </div>
                            <span className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
                              Select
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="p-3 text-center text-xs text-slate-400">
                        No customer found.{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setNewCustName(customerSearchQuery);
                            setShowNewCustomerForm(true);
                            setShowSearchResults(false);
                          }}
                          className="text-orange-600 font-bold hover:underline"
                        >
                          Create &quot;{customerSearchQuery}&quot;?
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Order Mode Segmented Control */}
          <div className="shrink-0 self-start sm:self-auto">
            <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">Order Mode</label>
            <div className="flex bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setIsPosWalkin(true)}
                className={`min-h-[34px] px-3.5 py-1 text-xs font-bold rounded-lg transition ${
                  isPosWalkin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Walk-In (Counter)
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!selectedCustomer) {
                    alert('Delivery requires a customer. Please search or add a customer first.');
                    setShowNewCustomerForm(true);
                    return;
                  }
                  setIsPosWalkin(false);
                }}
                className={`min-h-[34px] px-3.5 py-1 text-xs font-bold rounded-lg transition ${
                  !isPosWalkin ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Free Delivery
              </button>
            </div>
          </div>
        </div>

        {/* Address / Phone picker drawer for customer with multiple locations/phones */}
        {selectedCustomer && showAddressPicker && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
            <div className="font-bold text-slate-700 text-[11px] uppercase">
              Select Delivery Address & Phone for {selectedCustomer.name}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Phone Number</label>
                <select
                  value={selectedPhone}
                  onChange={(e) => setSelectedPhone(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs"
                >
                  {selectedCustomer.phones.map((p) => (
                    <option key={p.id} value={p.phone_number}>
                      {p.phone_number} {p.is_primary ? '(Primary)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Estate / Location</label>
                <select
                  value={`${selectedLocation.estate}|${selectedLocation.address}`}
                  onChange={(e) => {
                    const [estate, address] = e.target.value.split('|');
                    setSelectedLocation({ estate, address: address || '' });
                  }}
                  className="w-full border border-slate-300 rounded-lg p-1.5 bg-white text-xs"
                >
                  {selectedCustomer.locations.map((l) => (
                    <option key={l.id} value={`${l.estate}|${l.specific_address || ''}`}>
                      {l.estate} - {l.specific_address || 'Standard'} {l.is_default ? '(Default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Inline New Customer Creation Form */}
        {showNewCustomerForm && (
          <form
            onSubmit={handleCreateCustomerSubmit}
            className="p-4 bg-orange-50/60 border border-orange-200 rounded-xl space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-orange-900 uppercase">Create & Attach New Customer</span>
              <button
                type="button"
                onClick={() => setShowNewCustomerForm(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Full Name *</label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="e.g. Samuel Kiptoo"
                  className="w-full min-h-[36px] text-xs px-2.5 border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="+2547..."
                  className="w-full min-h-[36px] text-xs px-2.5 border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Estate / Area</label>
                <input
                  type="text"
                  value={newCustEstate}
                  onChange={(e) => setNewCustEstate(e.target.value)}
                  placeholder="e.g. Westlands"
                  className="w-full min-h-[36px] text-xs px-2.5 border border-slate-300 rounded-lg bg-white"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-0.5">Apt / House #</label>
                <input
                  type="text"
                  value={newCustAddress}
                  onChange={(e) => setNewCustAddress(e.target.value)}
                  placeholder="e.g. Delta 3B"
                  className="w-full min-h-[36px] text-xs px-2.5 border border-slate-300 rounded-lg bg-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewCustomerForm(false)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 text-xs font-bold bg-orange-600 hover:bg-orange-700 text-white rounded-lg shadow"
              >
                Save & Attach
              </button>
            </div>
          </form>
        )}
      </div>

      {successOrderNumber && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center shadow-sm">
          <CheckCircle className="w-8 h-8 text-emerald-600 mx-auto mb-1" />
          <h3 className="text-base font-bold text-emerald-950">
            Sale Completed: <span className="font-mono text-emerald-700">{successOrderNumber}</span>
          </h3>
          <p className="text-xs text-emerald-700 mt-0.5">
            Stock reconciled in {activeBranch.name}. Free delivery applied.
          </p>
          <button
            onClick={() => setSuccessOrderNumber(null)}
            className="mt-2.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow"
          >
            Start Next Sale
          </button>
        </div>
      )}

      {/* 3. PRODUCT ENTRY & CART GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2 Cols: Item Picker & Payment */}
        <div className="lg:col-span-2 space-y-4">
          {/* Item Selector */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Select Product to Add
              </span>

              {/* Filter Pills */}
              <div className="flex items-center gap-1">
                {(['all', 'cylinder', 'water', 'accessory'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setProductFilterCat(cat)}
                    className={`min-h-[32px] px-2.5 py-1 text-[11px] font-bold rounded-lg capitalize transition ${
                      productFilterCat === cat ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                    }`}
                  >
                    {cat === 'all' ? 'All' : cat === 'cylinder' ? 'Gas' : cat === 'water' ? 'Water' : 'Accessories'}
                  </button>
                ))}
              </div>
            </div>

            {/* Smooth Product Live Search Bar */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={productSearchQuery}
                onChange={(e) => {
                  setProductSearchQuery(e.target.value);
                  setShowProductSearchResults(true);
                }}
                onFocus={() => setShowProductSearchResults(true)}
                placeholder="Search products by size or brand (e.g. 13kg Afrigas, 6kg Pro Gas, 20L Keringet)..."
                className="w-full text-xs border border-slate-300 rounded-xl pl-9 pr-8 py-2 bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              />
              {productSearchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setProductSearchQuery('');
                    setShowProductSearchResults(false);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Live Search Floating Results */}
              {showProductSearchResults && productSearchQuery.trim() && (
                <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 max-h-56 overflow-y-auto divide-y divide-slate-100">
                  {filteredProductsForSelect.length > 0 ? (
                    filteredProductsForSelect.map((p) => {
                      const price =
                        itemType === 'refill'
                          ? p.refill_price_kes
                          : itemType === 'complete'
                          ? p.complete_price_kes
                          : p.accessory_price_kes;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedProductId(p.id);
                            if (p.category === 'water') {
                              setIncomingBrand(p.brand === 'Keringet' ? 'Keringet' : 'Aquamist');
                            } else if (p.category === 'cylinder') {
                              setIncomingBrand(p.brand);
                            }
                            setShowProductSearchResults(false);
                          }}
                          className={`w-full text-left px-3.5 py-2.5 hover:bg-orange-50/80 transition flex items-center justify-between text-xs ${
                            selectedProductId === p.id ? 'bg-orange-50 font-bold' : ''
                          }`}
                        >
                          <div>
                            <span className="font-bold text-slate-900 block">
                              {p.name} {itemType === 'refill' ? 'Refill' : itemType === 'complete' ? 'Complete' : ''}
                            </span>
                            <span className="text-[11px] text-slate-500">
                              {p.brand} • {p.category === 'cylinder' ? 'Gas' : p.category === 'water' ? 'Water' : 'Accessory'}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-orange-600 text-xs">
                              KES {price.toLocaleString()}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="p-3 text-center text-xs text-slate-400">
                      No products match &quot;{productSearchQuery}&quot;
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Sale Type</label>
                <select
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value as OrderType)}
                  className="w-full min-h-[42px] text-xs font-semibold border border-slate-300 rounded-xl px-2.5 bg-white text-slate-800"
                >
                  <option value="refill">Refill (Swap Tare)</option>
                  <option value="complete">Complete Unit (New Cylinder/Bottle)</option>
                  <option value="accessory">Accessory / Disposable</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Product {filteredProductsForSelect.length > 0 ? `(${filteredProductsForSelect.length})` : ''}
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    const chosen = products.find((p) => p.id === e.target.value);
                    if (chosen?.category === 'water') {
                      setIncomingBrand(chosen.brand === 'Keringet' ? 'Keringet' : 'Aquamist');
                    } else if (chosen?.category === 'cylinder') {
                      setIncomingBrand(chosen.brand);
                    }
                  }}
                  className="w-full min-h-[42px] text-xs border border-slate-300 rounded-xl px-2 bg-white text-slate-800"
                >
                  {filteredProductsForSelect.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {itemType === 'refill' ? 'Refill' : itemType === 'complete' ? 'Complete' : ''} — KES{' '}
                      {(itemType === 'refill'
                        ? p.refill_price_kes
                        : itemType === 'complete'
                        ? p.complete_price_kes
                        : p.accessory_price_kes
                      ).toLocaleString()}
                    </option>
                  ))}
                </select>
              </div>

              {itemType === 'refill' ? (
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Incoming Empty Tare ({isWaterProduct ? 'Bottle' : 'Cylinder'})
                  </label>
                  <select
                    value={incomingBrand}
                    onChange={(e) => setIncomingBrand(e.target.value)}
                    className="w-full min-h-[42px] text-xs border border-slate-300 rounded-xl px-2 bg-white text-slate-800"
                  >
                    {isWaterProduct ? (
                      <>
                        <option value="Keringet">Keringet 20L Empty</option>
                        <option value="Aquamist">Aquamist 20L Empty</option>
                      </>
                    ) : (
                      <>
                        <option value="Pro Gas">Pro Gas (Empty)</option>
                        <option value="TotalEnergies">TotalEnergies (Empty)</option>
                        <option value="K-Gas">K-Gas (Empty)</option>
                        <option value="Afrigas">Afrigas (Empty)</option>
                        <option value="Ola Energy">Ola Energy (Empty)</option>
                      </>
                    )}
                  </select>
                </div>
              ) : (
                <div className="flex items-center text-xs text-slate-400 pt-6">No tare swap required</div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Qty:</span>
                <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-white">
                  <button
                    type="button"
                    onClick={() => setItemQuantity((q) => Math.max(1, q - 1))}
                    className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-8 text-center font-bold text-xs text-slate-800">{itemQuantity}</span>
                  <button
                    type="button"
                    onClick={() => setItemQuantity((q) => q + 1)}
                    className="w-9 h-9 flex items-center justify-center text-slate-600 hover:bg-slate-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddToCart}
                className="min-h-[42px] px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-2 shadow"
              >
                <Plus className="w-4 h-4" /> Add to Ticket
              </button>
            </div>
          </div>

          {/* Payment Section */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payment Details</span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full min-h-[42px] text-xs border border-slate-300 rounded-xl px-2.5 bg-white text-slate-800"
                >
                  <option value="mpesa">M-Pesa (Till / Paybill)</option>
                  <option value="cash">Cash (Counter)</option>
                  <option value="bank_transfer">Bank Transfer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                  className="w-full min-h-[42px] text-xs border border-slate-300 rounded-xl px-2.5 bg-white text-slate-800 font-bold"
                >
                  <option value="paid">PAID (Verified)</option>
                  <option value="pending">PENDING (Pay on delivery)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">M-Pesa / Reference Code</label>
                <input
                  type="text"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value.toUpperCase())}
                  placeholder="e.g. QGK81920X"
                  className="w-full min-h-[42px] px-3 py-2 text-xs font-mono uppercase border border-slate-300 rounded-xl focus:ring-1 focus:ring-orange-500 focus:outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right 1 Col: Cart & Ticket Summary */}
        <div>
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm sticky top-20 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">Ticket Items</h3>
              <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                {totalCartCount} item{totalCartCount !== 1 ? 's' : ''}
              </span>
            </div>

            {cart.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                <ShoppingCart className="w-7 h-7 mx-auto mb-2 opacity-30" />
                No items added. Select product and click &quot;Add to Ticket&quot;.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto pr-1">
                {cart.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between gap-2 text-xs">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 truncate">
                        {item.productName}{' '}
                        {item.orderType === 'refill' ? 'Refill' : item.orderType === 'complete' ? 'Complete' : ''}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {item.orderType === 'refill' && `Swap: ${item.incomingBrand} in`}
                        {item.orderType === 'complete' && 'Complete Unit'}
                        {item.orderType === 'accessory' && 'Accessory / Disp'}
                      </div>
                      <div className="font-semibold text-slate-800">
                        KES {(item.unitPrice * item.quantity).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                        <button
                          type="button"
                          onClick={() => updateCartItemQuantity(item.id, -1)}
                          className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-200"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-5 text-center font-bold text-xs">{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateCartItemQuantity(item.id, 1)}
                          className="w-6 h-6 flex items-center justify-center text-slate-600 hover:bg-slate-200"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveFromCart(item.id)}
                        className="p-1 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Calculations Breakdown */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span className="font-semibold">KES {subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-emerald-600">
                <span>Delivery Fee:</span>
                <span className="font-bold uppercase tracking-wider text-[11px] bg-emerald-50 px-2 py-0.5 rounded">
                  Free
                </span>
              </div>
              <div className="flex justify-between text-slate-900 font-bold text-base pt-2 border-t border-slate-200">
                <span>Total Due:</span>
                <span className="text-orange-600">KES {grandTotal.toLocaleString()}</span>
              </div>
            </div>

            <button
              type="button"
              disabled={isSubmitting || cart.length === 0}
              onClick={() => handleCreateOrder()}
              className="w-full min-h-[46px] py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm rounded-xl transition shadow disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Recording...' : isPosWalkin ? 'Finalize Counter Sale' : 'Dispatch Delivery'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
