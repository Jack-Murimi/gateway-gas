const fs = require('fs');
const batchFile = process.argv[2];
const chunk = JSON.parse(fs.readFileSync(batchFile, 'utf8'));
const payload = JSON.stringify(chunk.map(c => ({ name: c.name, phones: [...new Set(c.phones)], locations: [...new Set(c.locations.map(l=>l.trim()).filter(Boolean))] })));
const esc = payload.replace(/'/g, "''");
const sql = `do $$
declare r jsonb; cid uuid; p text; loc text; first_p boolean; first_l boolean;
begin
  for r in select * from jsonb_array_elements('${esc}'::jsonb)
  loop
    insert into public.customers(name,is_active) values (nullif(r->>'name',''), true) returning id into cid;
    first_p := true;
    for p in select jsonb_array_elements_text(r->'phones') loop
      insert into public.customer_phones(customer_id,phone_number,is_primary) values (cid,p,first_p)
      on conflict do nothing;
      first_p := false;
    end loop;
    first_l := true;
    for loc in select jsonb_array_elements_text(r->'locations') loop
      insert into public.customer_locations(customer_id,estate,specific_address,is_default) values (cid,loc,null,first_l)
      on conflict do nothing;
      first_l := false;
    end loop;
  end loop;
end $$;`;
process.stdout.write(sql);
