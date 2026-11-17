const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
function loadEnv(file){const text=fs.readFileSync(file,'utf8');for(const line of text.split(/\r?\n/)){const m=line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);if(!m)continue;let v=m[2];if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!(m[1] in process.env))process.env[m[1]]=v;}}
loadEnv('.env.local');
const url=process.env.NEXT_PUBLIC_SUPABASE_URL; const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb=createClient(url,key,{auth:{persistSession:false}});
(async()=>{const r=await sb.from('customers').insert({name:'__test__',is_active:true}).select('id').single(); console.log(JSON.stringify({err:r.error?.message,id:r.data?.id})); if(r.data?.id) await sb.from('customers').delete().eq('id',r.data.id);})().catch(e=>{console.error(e.message);process.exit(1);});
