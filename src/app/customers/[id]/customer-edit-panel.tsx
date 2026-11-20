'use client';

import React, { useEffect, useState } from 'react';
import {
  ExternalLink,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Save,
  Star,
  Trash2,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import type { Customer, CustomerLocation, CustomerPhone, Product } from '@/types';
import { displayKenyanPhone, normalizeKenyanPhone } from '@/lib/formatters';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { fieldClass, labelClass } from '@/components/pos/pos-ui';
import { CustomerCylindersCard, type CustomerCylinderRow } from './customer-cylinders';

interface Props {
  customer: Customer;
  cylinders: CustomerCylinderRow[];
  loadingCylinders: boolean;
  products: Product[];
  canManage: boolean;
  canEditCylinders: boolean;
  onUpdateCustomer: (customerId: string, name: string) => Promise<void>;
  onSetCustomerActive: (customerId: string, isActive: boolean) => Promise<void>;
  onAddPhone: (customerId: string, phone: string, makePrimary?: boolean, label?: string) => Promise<void>;
  onUpdatePhone: (customerId: string, phoneId: string, updates: { label?: string | null; is_primary?: boolean }) => Promise<void>;
  onRemovePhone: (customerId: string, phoneId: string) => Promise<void>;
  onAddLocation: (customerId: string, estate: string, specificAddress?: string, makeDefault?: boolean) => Promise<void>;
  onUpdateLocation: (customerId: string, locationId: string, updates: { estate?: string; specific_address?: string | null; is_default?: boolean }) => Promise<void>;
  onRemoveLocation: (customerId: string, locationId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function CustomerEditPanel({
  customer,
  cylinders,
  loadingCylinders,
  products,
  canManage,
  canEditCylinders,
  onUpdateCustomer,
  onSetCustomerActive,
  onAddPhone,
  onUpdatePhone,
  onRemovePhone,
  onAddLocation,
  onUpdateLocation,
  onRemoveLocation,
  onRefresh,
}: Props) {
  const { showError, showSuccess } = useToast();
  const [saving, setSaving] = useState(false);

  // Name & status
  const [nameDraft, setNameDraft] = useState(customer.name || '');
  useEffect(() => {
    setNameDraft(customer.name || '');
  }, [customer.id, customer.name]);
  const nameDirty = nameDraft.trim() !== (customer.name || '').trim();

  // Phone add / edit
  const [addingPhone, setAddingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [newPhoneLabel, setNewPhoneLabel] = useState('');
  const [newPhonePrimary, setNewPhonePrimary] = useState(false);

  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [editPhoneNum, setEditPhoneNum] = useState('');
  const [editPhoneLabel, setEditPhoneLabel] = useState('');

  // Location add / edit
  const [addingLoc, setAddingLoc] = useState(false);
  const [newEstate, setNewEstate] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newLocDefault, setNewLocDefault] = useState(false);

  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [editEstate, setEditEstate] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPin, setEditPin] = useState('');

  const inactive = customer.is_active === false;

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage || !nameDirty) return;
    setSaving(true);
    try {
      await onUpdateCustomer(customer.id, nameDraft);
      showSuccess('Customer name saved.');
      await onRefresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not save name.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!canManage) return;
    setSaving(true);
    try {
      await onSetCustomerActive(customer.id, inactive);
      showSuccess(inactive ? 'Customer reactivated.' : 'Customer deactivated.');
      await onRefresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not update status.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPhone.trim()) return;
    setSaving(true);
    try {
      await onAddPhone(customer.id, newPhone, newPhonePrimary || customer.phones.length === 0, newPhoneLabel || undefined);
      setNewPhone('');
      setNewPhoneLabel('');
      setNewPhonePrimary(false);
      setAddingPhone(false);
      showSuccess('Phone number added.');
      await onRefresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not add phone.');
    } finally {
      setSaving(false);
    }
  };

  const startEditPhone = (p: CustomerPhone) => {
    setEditingPhoneId(p.id);
    setEditPhoneNum(p.phone_number);
    setEditPhoneLabel(p.label || '');
  };

  const handleSavePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPhoneId || !editPhoneNum.trim()) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const normalized = normalizeKenyanPhone(editPhoneNum.trim());
      const { error } = await supabase
        .from('customer_phones')
        .update({ phone_number: normalized, label: editPhoneLabel.trim() || null })
        .eq('id', editingPhoneId);
      if (error) throw error;
      setEditingPhoneId(null);
      showSuccess('Phone updated.');
      await onRefresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not update phone.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEstate.trim()) return;
    setSaving(true);
    try {
      const makeDefault = newLocDefault || customer.locations.length === 0;
      if (newPin.trim()) {
        const supabase = createClient();
        if (makeDefault) {
          await supabase.from('customer_locations').update({ is_default: false }).eq('customer_id', customer.id);
        }
        const { error } = await supabase.from('customer_locations').insert({
          customer_id: customer.id,
          estate: newEstate.trim(),
          specific_address: newAddress.trim() || null,
          pin_location: newPin.trim() || null,
          is_default: makeDefault,
        });
        if (error) throw error;
      } else {
        await onAddLocation(customer.id, newEstate, newAddress || undefined, makeDefault);
      }
      setNewEstate('');
      setNewAddress('');
      setNewPin('');
      setNewLocDefault(false);
      setAddingLoc(false);
      showSuccess('Delivery location added.');
      await onRefresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not add location.');
    } finally {
      setSaving(false);
    }
  };

  const startEditLocation = (loc: CustomerLocation) => {
    setEditingLocId(loc.id);
    setEditEstate(loc.estate);
    setEditAddress(loc.specific_address || '');
    setEditPin(loc.pin_location || '');
  };

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLocId || !editEstate.trim()) return;
    setSaving(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from('customer_locations')
        .update({
          estate: editEstate.trim(),
          specific_address: editAddress.trim() || null,
          pin_location: editPin.trim() || null,
        })
        .eq('id', editingLocId);
      if (error) throw error;
      setEditingLocId(null);
      showSuccess('Location updated.');
      await onRefresh();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Could not update location.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <aside className="space-y-3 lg:sticky lg:top-20">
      {/* 1. Profile Identity & Status */}
      <section className="rounded-md border border-slate-300 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-800">Customer Details</h2>
          {canManage && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleToggleActive()}
              className={`inline-flex h-6 items-center gap-1 rounded border px-2 text-[11px] font-semibold transition ${
                inactive
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  : 'border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100'
              }`}
            >
              {inactive ? <><UserCheck className="h-3 w-3" /> Reactivate</> : <><UserX className="h-3 w-3" /> Deactivate</>}
            </button>
          )}
        </div>

        <form onSubmit={handleSaveName} className="space-y-2 p-3">
          <div>
            <label htmlFor="customer-name-input" className={labelClass}>Full name / business name</label>
            <div className="flex gap-1.5">
              <input
                id="customer-name-input"
                disabled={!canManage || saving}
                value={nameDraft}
                onChange={e => setNameDraft(e.target.value)}
                placeholder="Enter customer name"
                className={fieldClass}
              />
              {canManage && nameDirty && (
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded bg-orange-600 px-2.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" /> Save
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>Status: <strong className={inactive ? 'text-rose-700' : 'text-emerald-700'}>{inactive ? 'Inactive' : 'Active'}</strong></span>
            <span>Added {new Date(customer.created_at).toLocaleDateString('en-KE', { dateStyle: 'medium' })}</span>
          </div>
        </form>
      </section>

      {/* 2. Original Cylinders */}
      <CustomerCylindersCard
        customerId={customer.id}
        cylinders={cylinders}
        loading={loadingCylinders}
        products={products}
        canEdit={canEditCylinders}
        onChanged={onRefresh}
      />

      {/* 3. Phone Numbers */}
      <section className="rounded-md border border-slate-300 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-800">
            <Phone className="h-3.5 w-3.5 text-orange-600" /> Phones ({customer.phones.length})
          </h2>
          {canManage && !addingPhone && (
            <button
              type="button"
              onClick={() => { setEditingPhoneId(null); setAddingPhone(true); }}
              className="inline-flex h-6 items-center gap-1 rounded bg-slate-900 px-2 text-[11px] font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          )}
        </div>

        {addingPhone && (
          <form onSubmit={handleAddPhone} className="space-y-2 border-b border-orange-200 bg-orange-50/40 p-2.5">
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className={labelClass}>Phone *</label>
                <input required value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="0712 345 678" className={fieldClass} />
              </div>
              <div>
                <label className={labelClass}>Label</label>
                <input value={newPhoneLabel} onChange={e => setNewPhoneLabel(e.target.value)} placeholder="Home, Wife, Office" className={fieldClass} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs text-slate-700">
                <input type="checkbox" checked={newPhonePrimary} onChange={e => setNewPhonePrimary(e.target.checked)} />
                Primary
              </label>
              <div className="flex gap-1">
                <button type="button" onClick={() => setAddingPhone(false)} className="h-7 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-600">Cancel</button>
                <button type="submit" disabled={saving} className="h-7 rounded bg-orange-600 px-2.5 text-xs font-semibold text-white hover:bg-orange-700">Save</button>
              </div>
            </div>
          </form>
        )}

        <div className="divide-y divide-slate-200">
          {customer.phones.map(p => (
            <div key={p.id} className="px-3 py-2 text-xs">
              {editingPhoneId === p.id ? (
                <form onSubmit={handleSavePhone} className="space-y-1.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    <input required value={editPhoneNum} onChange={e => setEditPhoneNum(e.target.value)} placeholder="Phone" className={fieldClass} />
                    <input value={editPhoneLabel} onChange={e => setEditPhoneLabel(e.target.value)} placeholder="Label" className={fieldClass} />
                  </div>
                  <div className="flex justify-end gap-1">
                    <button type="button" onClick={() => setEditingPhoneId(null)} className="inline-flex h-6 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-600">
                      <X className="h-3 w-3" /> Cancel
                    </button>
                    <button type="submit" disabled={saving} className="inline-flex h-6 items-center gap-1 rounded bg-orange-600 px-2 text-[11px] font-semibold text-white">
                      <Save className="h-3 w-3" /> Save
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 font-semibold tabular-nums text-slate-900">
                      <span>{displayKenyanPhone(p.phone_number)}</span>
                      {p.is_primary && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Primary</span>}
                    </div>
                    {p.label && <p className="text-[11px] text-slate-500">{p.label}</p>}
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      {!p.is_primary && (
                        <button
                          type="button"
                          title="Set primary"
                          onClick={async () => { await onUpdatePhone(customer.id, p.id, { is_primary: true }); await onRefresh(); }}
                          className="grid h-6 w-6 place-items-center rounded border border-slate-300 bg-white text-slate-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                        >
                          <Star className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Edit phone"
                        onClick={() => startEditPhone(p)}
                        className="grid h-6 w-6 place-items-center rounded border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      {customer.phones.length > 1 && (
                        <button
                          type="button"
                          title="Remove phone"
                          onClick={async () => {
                            if (!window.confirm(`Remove ${p.phone_number}?`)) return;
                            await onRemovePhone(customer.id, p.id);
                            await onRefresh();
                          }}
                          className="grid h-6 w-6 place-items-center rounded border border-slate-300 bg-white text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {customer.phones.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-500">No phone numbers.</p>}
        </div>
      </section>

      {/* 4. Delivery Locations */}
      <section className="rounded-md border border-slate-300 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-800">
            <MapPin className="h-3.5 w-3.5 text-orange-600" /> Locations ({customer.locations.length})
          </h2>
          {canManage && !addingLoc && (
            <button
              type="button"
              onClick={() => { setEditingLocId(null); setAddingLoc(true); }}
              className="inline-flex h-6 items-center gap-1 rounded bg-slate-900 px-2 text-[11px] font-semibold text-white hover:bg-slate-800"
            >
              <Plus className="h-3 w-3" /> Add
            </button>
          )}
        </div>

        {addingLoc && (
          <form onSubmit={handleAddLocation} className="space-y-1.5 border-b border-orange-200 bg-orange-50/40 p-2.5">
            <div>
              <label className={labelClass}>Estate / Area *</label>
              <input required value={newEstate} onChange={e => setNewEstate(e.target.value)} placeholder="e.g. Kilimani, Lavington" className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>House / Apt / Landmark</label>
              <input value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="e.g. Apt 4B, Gate 2" className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>Google Maps pin / link</label>
              <input value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="https://maps.google.com/..." className={fieldClass} />
            </div>
            <div className="flex items-center justify-between pt-0.5">
              <label className="flex items-center gap-1.5 text-xs text-slate-700">
                <input type="checkbox" checked={newLocDefault} onChange={e => setNewLocDefault(e.target.checked)} />
                Default
              </label>
              <div className="flex gap-1">
                <button type="button" onClick={() => setAddingLoc(false)} className="h-7 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-600">Cancel</button>
                <button type="submit" disabled={saving} className="h-7 rounded bg-orange-600 px-2.5 text-xs font-semibold text-white hover:bg-orange-700">Save</button>
              </div>
            </div>
          </form>
        )}

        <div className="divide-y divide-slate-200">
          {customer.locations.map(loc => (
            <div key={loc.id} className="px-3 py-2 text-xs">
              {editingLocId === loc.id ? (
                <form onSubmit={handleSaveLocation} className="space-y-1.5">
                  <input required value={editEstate} onChange={e => setEditEstate(e.target.value)} placeholder="Estate / Area" className={fieldClass} />
                  <input value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="House / Apt / Landmark" className={fieldClass} />
                  <input value={editPin} onChange={e => setEditPin(e.target.value)} placeholder="Google Maps pin / link" className={fieldClass} />
                  <div className="flex justify-end gap-1">
                    <button type="button" onClick={() => setEditingLocId(null)} className="inline-flex h-6 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-600">
                      <X className="h-3 w-3" /> Cancel
                    </button>
                    <button type="submit" disabled={saving} className="inline-flex h-6 items-center gap-1 rounded bg-orange-600 px-2 text-[11px] font-semibold text-white">
                      <Save className="h-3 w-3" /> Save
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
                      <span>{loc.estate}</span>
                      {loc.is_default && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">Default</span>}
                    </div>
                    {loc.specific_address && <p className="mt-0.5 text-[11px] text-slate-500">{loc.specific_address}</p>}
                    {loc.pin_location && (
                      <a
                        href={loc.pin_location.startsWith('http') ? loc.pin_location : `https://maps.google.com/?q=${encodeURIComponent(loc.pin_location)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-orange-700 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" /> Map pin
                      </a>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex shrink-0 items-center gap-1">
                      {!loc.is_default && (
                        <button
                          type="button"
                          title="Set default"
                          onClick={async () => { await onUpdateLocation(customer.id, loc.id, { is_default: true }); await onRefresh(); }}
                          className="grid h-6 w-6 place-items-center rounded border border-slate-300 bg-white text-slate-500 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                        >
                          <Star className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        type="button"
                        title="Edit location"
                        onClick={() => startEditLocation(loc)}
                        className="grid h-6 w-6 place-items-center rounded border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        title="Remove location"
                        onClick={async () => {
                          if (!window.confirm(`Remove ${loc.estate}?`)) return;
                          await onRemoveLocation(customer.id, loc.id);
                          await onRefresh();
                        }}
                        className="grid h-6 w-6 place-items-center rounded border border-slate-300 bg-white text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {customer.locations.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-500">No delivery locations.</p>}
        </div>
      </section>
    </aside>
  );
}
