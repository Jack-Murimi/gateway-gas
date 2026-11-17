const fs=require('fs');
const out=[];
for(let i=5;i<=63;i++){
  const n=String(i).padStart(3,'0');
  const s=fs.readFileSync('scripts/import5/group_'+n+'.sql','utf8');
  const m=s.match(/"phones":\["([^"]+)"/);
  out.push({g:n,p:m?m[1]:''});
}
console.log(JSON.stringify(out));