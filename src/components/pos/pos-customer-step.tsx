'use client';

import React, { useState } from 'react';
import { Customer } from '@/types';
import {
  Users,
  Search,
  UserCheck,
  UserPlus,
  X,
  Phone,
  MapPin,
  Check,
  ShoppingBag,
  Bike,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface PosCustomerStepProps {
  isPosWalkin: boolean;
  onToggleWalkin: (isWalkin: boolean) => void;
  customers: Customer[];
  selectedCustomer: Customer | null;
  onSelectCustomer: (c: Customer | null) => void;
  selectedPhone: string;
  onChangePhone: (p: string) => void;
  selectedAddress: string;
  onChangeAddress: (a: string) => void;
  onCreateCustomer: (name: string, phone: string, estate: string, address?: string) => Customer;
}

export function PosCustomerStep({
  isPosWalkin,
  onToggleWalkin,
  customers,
  selectedCustomer,
  onSelectCustomer,
  selectedPhone,
  onChangePhone,
  selectedAddress,
  onChangeAddress,
  onCreateCustomer,
}: PosCustomerStepProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewCustModal, setShowNewCustModal] = useState(false);

  // New customer form state
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEstate, setNewEstate] = useState('');
  const [newAddress, setNewAddress] = useState('');

  // Filter customers by name, phone, or estate
  const filteredCustomers = searchQuery.trim()
    ? customers.filter((c) => {
        const q = searchQuery.toLowerCase();
        const matchName = c.name.toLowerCase().includes(q);
        const matchPhone = c.phones.some((p) => p.phone_number.includes(q));
        const matchLoc = c.locations.some(
          (l) => l.estate.toLowerCase().includes(q) || (l.specific_address && l.specific_address.toLowerCase().includes(q))
        );
        return matchName || matchPhone || matchLoc;
      })
    : [];

  const handleSaveNewCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPhone.trim()) return;

    const created = onCreateCustomer(newName.trim(), newPhone.trim(), newEstate.trim() || 'Nairobi', newAddress.trim());
    onSelectCustomer(created);
    onChangePhone(newPhone.trim());
    onChangeAddress(`${newEstate.trim()} ${newAddress.trim()}`.trim());
    setShowNewCustModal(false);
    setNewName('');
    setNewPhone('');
    setNewEstate('');
    setNewAddress('');
  };

  return (
    <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm p-4 sm:p-6 space-y-4 text-left">
      {/* 1. Mode Switcher (Counter vs Delivery) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-black text-slate-900">Step 1: Order Destination</h2>
          <p className="text-xs text-slate-500">Choose between immediate walk-in counter sale or rider delivery</p>
        </div>

        <div className="flex items-center p-1 bg-slate-100 rounded-2xl border border-slate-200">
          <button
            type="button"
            onClick={() => {
              onToggleWalkin(true);
            }}
            className={`min-h-[44px] px-4 rounded-xl text-sm font-black transition flex items-center gap-2 ${
              isPosWalkin ? 'bg-white text-slate-900 shadow-md' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ShoppingBag className="w-4 h-4 text-orange-600" />
            <span>Counter Walk-In</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onToggleWalkin(false);
            }}
            className={`min-h-[44px] px-4 rounded-xl text-sm font-black transition flex items-center gap-2 ${
              !isPosWalkin ? 'bg-white text-slate-900 shadow-md' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Bike className="w-4 h-4 text-emerald-600" />
            <span>Free Delivery</span>
          </button>
        </div>
      </div>

      {/* 2. Customer Selection / Badge */}
      {selectedCustomer ? (
        <div className="p-4 bg-orange-50/80 rounded-2xl border-2 border-orange-300 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-600 text-white flex items-center justify-center font-black">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-black text-slate-900 flex items-center gap-2">
                <span>{selectedCustomer.name}</span>
                <Badge variant="default">Attached to Sale</Badge>
              </div>
              <div className="text-xs font-bold text-slate-600 flex items-center gap-2 mt-0.5">
                <span>📞 {selectedPhone || selectedCustomer.phones[0]?.phone_number}</span>
                <span>•</span>
                <span>📍 {selectedAddress || selectedCustomer.locations[0]?.estate || 'Nairobi'}</span>
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onSelectCustomer(null)}
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <X className="w-4 h-4 mr-1" /> Change
          </Button>
        </div>
      ) : isPosWalkin ? (
        <div className="p-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-sm font-black text-slate-800">Direct Counter Customer (Anonymous)</div>
            <p className="text-xs text-slate-500">No account lookup needed for fast counter cash transactions.</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSearchQuery('a')}
          >
            <Search className="w-4 h-4 mr-1.5" /> Attach Registered Customer
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="p-3 bg-amber-50 rounded-2xl border-2 border-amber-200 text-xs font-bold text-amber-900 flex items-center gap-2">
            <span>⚠️ Deliveries require customer phone & delivery address for the dispatch rider.</span>
          </div>

          {/* Live Search Bar */}
          <div className="relative">
            <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search customer by name, phone (e.g. 0712...) or estate..."
              className="w-full min-h-[48px] pl-11 pr-24 text-base bg-white border-2 border-slate-300 rounded-2xl font-medium focus:border-orange-500 focus:outline-none"
            />
            <Button
              type="button"
              size="sm"
              onClick={() => setShowNewCustModal(true)}
              className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[36px]"
            >
              <UserPlus className="w-4 h-4 mr-1" /> New
            </Button>
          </div>

          {/* Search Results Dropdown */}
          {searchQuery.trim() && (
            <div className="border-2 border-slate-200 rounded-2xl divide-y divide-slate-100 max-h-56 overflow-y-auto bg-white shadow-lg">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      onSelectCustomer(c);
                      onChangePhone(c.phones[0]?.phone_number || '');
                      const loc = c.locations[0];
                      onChangeAddress(loc ? `${loc.estate} ${loc.specific_address || ''}`.trim() : '');
                      setSearchQuery('');
                    }}
                    className="w-full p-3 text-left hover:bg-orange-50 transition flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-black text-slate-900">{c.name}</div>
                      <div className="text-xs text-slate-500">
                        {c.phones.map((p) => p.phone_number).join(', ')} •{' '}
                        {c.locations.map((l) => l.estate).join(', ')}
                      </div>
                    </div>
                    <Badge variant="default">Select</Badge>
                  </button>
                ))
              ) : (
                <div className="p-4 text-center text-sm font-bold text-slate-500">
                  No registered customer matches &quot;{searchQuery}&quot;.{' '}
                  <button
                    type="button"
                    onClick={() => setShowNewCustModal(true)}
                    className="text-orange-600 underline font-black ml-1"
                  >
                    Add new customer now
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* New Customer Inline Drawer / Modal */}
      {showNewCustModal && (
        <form
          onSubmit={handleSaveNewCustomer}
          className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-300 space-y-3"
        >
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-sm font-black text-slate-900">Add New Customer Record</span>
            <button
              type="button"
              onClick={() => setShowNewCustModal(false)}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Customer Full Name"
              required
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. John Wachira"
            />
            <Input
              label="Phone Number"
              required
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              placeholder="e.g. 0722 000 111"
            />
            <Input
              label="Estate / Zone"
              required
              value={newEstate}
              onChange={(e) => setNewEstate(e.target.value)}
              placeholder="e.g. Nextgen / Lavington / Kileleshwa"
            />
            <Input
              label="Specific House / Apt Landmark"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="e.g. Delta Towers 3B"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewCustModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm">
              Save & Attach Customer
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
