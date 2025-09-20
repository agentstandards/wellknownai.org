import fs from 'node:fs';
import path from 'node:path';
const dir = 'entries';
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f=>f.endsWith('.json')) : [];
const map = new Map();
for (const f of files) {
  const e = JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
  if (!e?.domain) { console.error('entry missing domain:', f); process.exit(1); }
  const key = String(e.domain).toLowerCase();
  map.set(key, e);
}
const arr = Array.from(map.values()).sort((a,b)=> String(a.domain||'').localeCompare(String(b.domain||'')));
fs.writeFileSync('registry.json', JSON.stringify(arr, null, 2) + '\n', 'utf8');
console.log('Generated registry.json with', arr.length, 'entries');
