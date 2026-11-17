'use client';

import Dexie, { type Table } from 'dexie';
import type { Customer, CustomerLocation, CustomerPhone } from '@/types';

export const CUSTOMER_CACHE_VERSION = 2;
const CHECKPOINT_KEY = 'customers:last_synced_at';
const VERSION_KEY = 'customers:cache_version';
const USER_KEY = 'customers:cache_user_id';

export interface CachedCustomer {
  id: string;
  name: string | null;
  phones: CustomerPhone[];
  locations: CustomerLocation[];
  status: 'active' | 'inactive';
  updated_at: string;
  deleted: boolean;
}

class GatewayCache extends Dexie {
  customers!: Table<CachedCustomer, string>;
  metadata!: Table<{ key: string; value: string }, string>;
  constructor() {
    super('gateway-operations-cache');
    this.version(1).stores({ customers: 'id, name, status, updated_at, deleted', metadata: 'key' });
    this.version(2).stores({ customers: 'id, name, status, updated_at, deleted, *phoneDigits, *searchTokens', metadata: 'key' })
      .upgrade(async tx => {
        await tx.table('customers').toCollection().modify((row: CachedCustomer & { phoneDigits?: string[]; searchTokens?: string[] }) => {
          row.phoneDigits = (row.phones || []).map(p => p.phone_number.replace(/\\D/g, ''));
          row.searchTokens = [row.name || '', ...(row.locations || []).flatMap(l => [l.estate, l.specific_address || ''])]
            .join(' ').toLowerCase().split(/\\s+/).filter(Boolean);
        });
      });
  }
}
export const customerDb = new GatewayCache();

const digits = (value: string) => value.replace(/\\D/g, '');
export const normalizePhone = (value: string) => {
  let d = digits(value);
  if (d.startsWith('254')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  return d;
};
const tokens = (value: string) => value.toLowerCase().trim().split(/\\s+/).filter(Boolean);

export function toCachedCustomer(row: any): CachedCustomer {
  return {
    id: row.id,
    name: row.name ?? null,
    phones: (row.phones || []).map((p: any) => ({ id: p.id, customer_id: row.id, phone_number: p.phone_number, is_primary: !!p.is_primary })),
    locations: (row.locations || []).map((l: any) => ({ id: l.id, customer_id: row.id, estate: l.estate, specific_address: l.specific_address ?? null, is_default: !!l.is_default })),
    status: row.is_active === false ? 'inactive' : 'active',
    updated_at: row.updated_at,
    deleted: !!row.deleted_at,
  };
}
export function fromCachedCustomer(row: CachedCustomer): Customer {
  return { id: row.id, name: row.name || '', created_at: row.updated_at, updated_at: row.updated_at, is_active: row.status === 'active', phones: row.phones || [], locations: row.locations || [] };
}

async function meta(key: string, value?: string) {
  if (value === undefined) return (await customerDb.metadata.get(key))?.value ?? null;
  await customerDb.metadata.put({ key, value });
  return value;
}
export async function clearCustomerCache() {
  await customerDb.transaction('rw', customerDb.customers, customerDb.metadata, async () => {
    await customerDb.customers.clear();
    await customerDb.metadata.clear();
  });
}
export async function prepareCustomerCache(userId: string) {
  const [version, owner] = await Promise.all([meta(VERSION_KEY), meta(USER_KEY)]);
  if (version !== String(CUSTOMER_CACHE_VERSION) || owner !== userId) {
    await clearCustomerCache();
    await meta(VERSION_KEY, String(CUSTOMER_CACHE_VERSION));
    await meta(USER_KEY, userId);
  }
}
export async function readCachedCustomers() {
  const rows = await customerDb.customers.where('deleted').equals(0).toArray().catch(async () =>
    (await customerDb.customers.toArray()).filter(r => !r.deleted)
  );
  return rows.map(fromCachedCustomer);
}
export async function upsertCachedCustomer(row: any) {
  const cached = toCachedCustomer(row);
  if (cached.deleted) await customerDb.customers.delete(cached.id);
  else await customerDb.customers.put(cached);
}
export async function getCustomerCheckpoint() { return meta(CHECKPOINT_KEY); }
export async function setCustomerCheckpoint(value: string) { await meta(CHECKPOINT_KEY, value); }

export async function syncCustomerCache(
  supabase: any,
  onProgress?: (done: number, total: number, initial: boolean) => void,
  forceFull = false,
) {
  const existing = forceFull ? 0 : await customerDb.customers.count();
  const initial = existing === 0;
  const startedAt = new Date().toISOString();
  let checkpoint = initial ? null : await getCustomerCheckpoint();
  if (forceFull) {
    await customerDb.customers.clear();
    checkpoint = null;
  }
  const pageSize = 1000;
  let offset = 0;
  let done = 0;
  let total = 0;
  while (true) {
    let query = supabase.from('customer_directory_sync').select('id,name,is_active,updated_at,deleted_at,phones,locations', { count: offset === 0 ? 'exact' : undefined })
      .lte('updated_at', startedAt).order('updated_at', { ascending: true }).order('id', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (checkpoint) query = query.gt('updated_at', checkpoint);
    const { data, error, count } = await query;
    if (error) throw error;
    const rows = data || [];
    if (offset === 0) total = count ?? rows.length;
    await customerDb.transaction('rw', customerDb.customers, async () => {
      for (const row of rows) {
        const record = toCachedCustomer(row);
        if (record.deleted) await customerDb.customers.delete(record.id);
        else await customerDb.customers.put(record);
      }
    });
    done += rows.length;
    onProgress?.(done, total, initial);
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  await setCustomerCheckpoint(startedAt);
  return { initial, synced: done };
}

export function rankCustomerSearch(customers: Customer[], rawQuery: string) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return customers;
  const queryDigits = normalizePhone(query);
  const words = tokens(query);
  return customers.map(customer => {
    const phones = customer.phones.map(p => normalizePhone(p.phone_number));
    const name = (customer.name || '').toLowerCase();
    const locationText = customer.locations.map(l => `${l.estate} ${l.specific_address || ''}`).join(' ').toLowerCase();
    const allText = `${name} ${locationText}`;
    let score = 99;
    if (queryDigits && phones.some(p => p === queryDigits || p.startsWith(queryDigits))) score = 0;
    else if (queryDigits && phones.some(p => p.endsWith(queryDigits))) score = 1;
    else if (name.startsWith(query)) score = 2;
    else if (words.every(word => allText.includes(word))) score = 3;
    else score = 99;
    return { customer, score };
  }).filter(x => x.score < 99).sort((a,b) => a.score - b.score || (a.customer.name || '').localeCompare(b.customer.name || '')).map(x => x.customer);
}
