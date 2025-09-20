import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

function args(argv){ const o={_:[]}; for(let i=2;i<argv.length;i++){const a=argv[i];
  if(!a.startsWith('--')){o._.push(a);continue}
  const [k,vRaw]=a.replace(/^--/,'').split('='); const K=k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
  let v=vRaw; if(v===undefined){ const n=argv[i+1]; if(n && !n.startsWith('--')){ v=n; i++; } else v=true; }
  o[K]=v;
} return o;}
const ARGS = args(process.argv);
const FILE = ARGS.file || 'registry.json';
const OUT  = ARGS.out  || path.resolve('_reports/registry_validate.json');
const SCHEMA = ARGS.schema || path.resolve('ai-manifest-kit/schemas/wellknownai-registry-0.1.json');

function ensureDir(p){ fs.mkdirSync(path.dirname(p), { recursive:true }); }

const schema = JSON.parse(fs.readFileSync(SCHEMA,'utf8'));
const raw = JSON.parse(fs.readFileSync(FILE,'utf8'));
const entries = Array.isArray(raw) ? raw : (Array.isArray(raw.items) ? raw.items : [raw]);

const ajv = new Ajv({ strict:true, allErrors:true }); addFormats(ajv);
const validate = ajv.compile(schema);

const results = [];
let okAll = true;
for (const ent of entries) {
  const valid = validate(ent);
  const errs = valid ? [] : (validate.errors||[]).map(e=> (e.instancePath||'/') + ' ' + e.message);
  results.push({ domain: ent.domain, ok: valid, errors: errs });
  if (!valid) okAll = false;
}

const report = { generated_at:new Date().toISOString(), ok: okAll, count: entries.length, results };
ensureDir(OUT);
fs.writeFileSync(OUT, JSON.stringify(report,null,2), 'utf8');
console.log(okAll ? 'OK ✅ registry entries valid' : 'Invalid ❌ registry has errors');
console.log('Report ->', OUT);
if (!okAll) process.exitCode = 1;
