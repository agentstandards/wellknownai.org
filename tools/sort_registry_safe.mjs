// tools/sort_registry_safe.mjs
import fs from 'node:fs';
import path from 'node:path';

function args(a){ const o={}; for(let i=2;i<a.length;i++){let x=a[i]; if(!x.startsWith('--')) continue; x=x.slice(2);
  if (x.includes('=')){ const [k,...rest]=x.split('='); o[k]=rest.join('='); } else { const k=x; const v=(a[i+1] && !a[i+1].startsWith('--')) ? a[++i] : true; o[k]=v; } }
  return o;
}
const ARGS = args(process.argv);
const FILE = path.resolve(String(ARGS.file || 'registry.json'));
const OUT  = ARGS.out ? path.resolve(String(ARGS.out)) : '';

const txt = fs.readFileSync(FILE,'utf8');
const arr = JSON.parse(txt);
if (!Array.isArray(arr)) throw new Error('registry.json must be an array');
arr.sort((a,b)=> String(a?.domain||'').localeCompare(String(b?.domain||'')));
const outTxt = JSON.stringify(arr, null, 2) + '\n';
if (OUT) fs.writeFileSync(OUT, outTxt, 'utf8'); else process.stdout.write(outTxt);
console.log('sorted entries:', arr.length, '->', OUT || '(stdout)');
