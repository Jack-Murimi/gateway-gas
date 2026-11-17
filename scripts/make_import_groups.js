const fs = require('fs');
const dir = 'scripts/batches25';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort();
const groupSize = 20;
let g = 0;
for (let i = 1; i < files.length; i += groupSize) { // skip batch_001
  g++;
  const group = files.slice(i, i + groupSize);
  let out = '';
  for (const f of group) {
    const chunk = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
    const payload = JSON.stringify(chunk.map(c => ({ name: c.name, phones: [...new Set(c.phones)], locations: [...new Set(c.locations.map(l => l.trim()).filter(Boolean))] }))).replace(/'/g, "''");
    out += `do $$\ndeclare r jsonb; cid uuid; p text; loc text; first_p boolean; first_l boolean;\nbegin\n  for r in select * from jsonb_array_elements('${payload}'::jsonb) loop\n    insert into public.customers(name,is_active) values (nullif(r->>'name',''), true) returning id into cid;\n    first_p := true;\n    for p in select jsonb_array_elements_text(r->'phones') loop\n      insert into public.customer_phones(customer_id,phone_number,is_primary) values (cid,p,first_p) on conflict do nothing;\n      first_p := false;\n    end loop;\n    first_l := true;\n    for loc in select jsonb_array_elements_text(r->'locations') loop\n      insert into public.customer_locations(customer_id,estate,specific_address,is_default) values (cid,loc,null,first_l) on conflict do nothing;\n      first_l := false;\n    end loop;\n  end loop;\nend $$;\n`;
  }
  fs.writeFileSync(`scripts/import_group_${String(g).padStart(2, '0')}.sql`, out);
  console.log(g, group.length, out.length);
}
