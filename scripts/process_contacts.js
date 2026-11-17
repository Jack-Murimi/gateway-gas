const fs = require('fs');
const path = require('path');

function parseCSV(s) {
  const rows = [];
  let i = 0, field = '', row = [], inQ = false;
  while (i < s.length) {
    const c = s[i];
    if (inQ) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQ = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQ = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function normalizePhone(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // keep digits and leading +
  s = s.replace(/[\s\-()]/g, '');
  // remove non-digit except +
  s = s.replace(/[^\d+]/g, '');
  if (!s) return null;
  // handle multiple numbers jammed? take first plausible sequence
  if (s.includes('/')) s = s.split('/')[0];
  if (s.startsWith('+')) s = '+' + s.slice(1).replace(/\+/g, '');
  const digits = s.replace(/\D/g, '');
  if (digits.length < 9) return null;
  // Kenyan normalization heuristics
  let norm = digits;
  if (norm.startsWith('0') && norm.length === 10) norm = '254' + norm.slice(1);
  else if (norm.startsWith('7') && norm.length === 9) norm = '254' + norm;
  else if (norm.startsWith('1') && norm.length === 9) norm = '254' + norm; // 01xx landlines/mobile-like
  else if (norm.startsWith('254') && norm.length === 12) norm = norm;
  else if (norm.length === 12 && norm.startsWith('254')) norm = norm;
  else if (norm.length === 9) norm = '254' + norm;
  // reject obvious garbage like very short codes unless valid-ish
  if (norm.length < 9 || norm.length > 15) return null;
  return '+' + norm;
}

function cleanName(first, last, display) {
  const parts = [first, last].map(x => (x || '').trim()).filter(Boolean);
  let name = parts.join(' ').trim();
  if (!name) name = (display || '').trim();
  // if name is just numbers or empty-like
  if (/^\d+$/.test(name)) name = '';
  return name || null;
}

function deriveLocation(r, idx) {
  const candidates = [
    r[idx['Home Street']], r[idx['Home Address 2']], r[idx['Home City']],
    r[idx['Business Address']], r[idx['Business Address 2']], r[idx['Business City']],
    r[idx['Notes']]
  ].map(x => (x || '').trim()).filter(Boolean);
  if (candidates.length) return candidates.join(', ').replace(/\s+/g, ' ').trim();
  // fallback to display name as location descriptor (common in this dataset)
  const display = (r[idx['Display Name']] || '').trim();
  if (display) return display.replace(/\s+/g, ' ').trim();
  const combo = [r[idx['First Name']], r[idx['Last Name']]].map(x => (x || '').trim()).filter(Boolean).join(' ').trim();
  return combo || null;
}

function normKey(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const csvPath = path.join(process.cwd(), 'CONTACTS.csv');
const rows = parseCSV(fs.readFileSync(csvPath, 'utf8'));
const h = rows[0];
const idx = Object.fromEntries(h.map((n, i) => [n, i]));

const records = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.every(c => !String(c || '').trim())) continue;
  const phones = [r[idx['Mobile Phone']], r[idx['Home Phone']], r[idx['Business Phone']]]
    .map(normalizePhone).filter(Boolean);
  const uniquePhones = [...new Set(phones)];
  const location = deriveLocation(r, idx);
  const name = cleanName(r[idx['First Name']], r[idx['Last Name']], r[idx['Display Name']]);
  if (!uniquePhones.length || !location) continue;
  records.push({ row: i + 1, name, phones: uniquePhones, location });
}

// union-find over phone/location keys
const parent = new Map();
function find(x) { if (parent.get(x) !== x) parent.set(x, find(parent.get(x))); return parent.get(x); }
function union(a,b){ a=find(a); b=find(b); if(a!==b) parent.set(b,a); }
function ensure(x){ if(!parent.has(x)) parent.set(x,x); }

for (const rec of records) {
  const keys = [...rec.phones.map(p=>'p:'+p), 'l:'+normKey(rec.location)];
  keys.forEach(ensure);
  for (let k=1;k<keys.length;k++) union(keys[0], keys[k]);
}

const groups = new Map();
for (const rec of records) {
  const root = find('p:' + rec.phones[0]);
  if (!groups.has(root)) groups.set(root, { names: new Set(), phones: new Set(), locations: new Set(), rows: [] });
  const g = groups.get(root);
  if (rec.name) g.names.add(rec.name);
  rec.phones.forEach(p=>g.phones.add(p));
  g.locations.add(rec.location.trim());
  g.rows.push(rec.row);
}

const customers = [...groups.values()].map(g => {
  const names = [...g.names];
  // prefer shortest reasonable name or first
  const name = names.sort((a,b)=>a.length-b.length)[0] || null;
  return {
    name,
    phones: [...g.phones],
    locations: [...g.locations],
    source_rows: g.rows.length
  };
}).filter(c => c.phones.length && c.locations.length);

// sort: named first by name, then unnamed by first location/phone
customers.sort((a,b)=>{
  const an = (a.name||'').toLowerCase();
  const bn = (b.name||'').toLowerCase();
  if (!!a.name !== !!b.name) return a.name ? -1 : 1;
  if (an !== bn) return an.localeCompare(bn);
  return (a.locations[0]||'').localeCompare(b.locations[0]||'');
});

const out = {
  stats: {
    input_rows: rows.length - 1,
    valid_rows: records.length,
    deduped_customers: customers.length,
    dropped_rows: (rows.length - 1) - records.length
  },
  customers
};

fs.mkdirSync('scripts', { recursive: true });
fs.writeFileSync('scripts/contacts_clean.json', JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.stats, null, 2));
