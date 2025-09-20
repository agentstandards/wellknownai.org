import fs from 'node:fs';
import path from 'node:path';

function parseArgs(a){ const o={}; for(let i=2;i<a.length;i++){ let x=a[i]; if(!x.startsWith('--')) continue; x=x.slice(2);
  if (x.includes('=')){ const [k,...rest]=x.split('='); o[k]=rest.join('='); } else { const k=x; const v=(a[i+1] && !a[i+1].startsWith('--')) ? a[++i] : true; o[k]=v; } }
  return o;
}
const ARGS = parseArgs(process.argv);
const CHECK = !!ARGS.check;
const FILE = path.resolve('registry.json');

const RAW = fs.readFileSync(FILE,'utf8');
let arr; try { arr = JSON.parse(RAW); } catch(e){ console.error('Invalid JSON:', e.message); process.exit(1); }
if (!Array.isArray(arr)) { console.error('registry.json must be an array'); process.exit(1); }

const seen = new Set(), dup = [];
for (const e of arr) {
  const d = String(e?.domain||'').toLowerCase();
  if (!d) { console.error('entry missing domain'); process.exit(1); }
  if (seen.has(d)) dup.push(d); else seen.add(d);
}
const sorted = [...arr].sort((a,b)=> String(a.domain||'').localeCompare(String(b.domain||'')));
const RAW2 = JSON.stringify(sorted, null, 2) + '\n';

if (CHECK) {
  if (dup.length) { console.error('Duplicate domains:', dup.join(', ')); process.exit(1); }
  if (RAW !== RAW2) {
    console.error('registry.json is not sorted by domain asc.');
    console.error('Fix locally:\n  node tools/sort_registry.mjs > registry.json\n  git add registry.json');
    process.exit(1);
  }
  console.log('OK');
} else {
  process.stdout.write(RAW2);
}
