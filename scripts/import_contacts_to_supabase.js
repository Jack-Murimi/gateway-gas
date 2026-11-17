const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnv(file) {
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
}

async function main() {
  loadEnv(path.join(process.cwd(), '.env.local'));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Missing Supabase URL/key in .env.local');
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'scripts/contacts_clean.json'), 'utf8'));
  const customers = data.customers;
  console.log('Importing customers:', customers.length);

  let ok = 0, failed = 0;
  const batchSize = 100;
  for (let i = 0; i < customers.length; i += batchSize) {
    const batch = customers.slice(i, i + batchSize);
    for (const c of batch) {
      const { data: cust, error: e1 } = await supabase
        .from('customers')
        .insert({ name: c.name, is_active: true })
        .select('id')
        .single();
      if (e1 || !cust) { failed++; if (failed <= 5) console.error('customer insert failed', e1?.message); continue; }
      const phones = [...new Set(c.phones)].map((p, idx) => ({ customer_id: cust.id, phone_number: p, is_primary: idx === 0 }));
      const locations = [...new Set(c.locations.map(l => l.trim()).filter(Boolean))].map((l, idx) => ({ customer_id: cust.id, estate: l, specific_address: null, is_default: idx === 0 }));
      const { error: e2 } = await supabase.from('customer_phones').insert(phones);
      const { error: e3 } = await supabase.from('customer_locations').insert(locations);
      if (e2 || e3) {
        failed++;
        if (failed <= 5) console.error('child insert failed', e2?.message || e3?.message);
        // cleanup partial
        await supabase.from('customers').delete().eq('id', cust.id);
        continue;
      }
      ok++;
    }
    console.log(`progress ${Math.min(i + batchSize, customers.length)}/${customers.length} ok=${ok} failed=${failed}`);
  }
  console.log(JSON.stringify({ ok, failed }, null, 2));
  if (failed) process.exitCode = 1;
}

main().catch(err => { console.error(err); process.exit(1); });
