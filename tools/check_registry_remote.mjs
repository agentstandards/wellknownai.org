import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process';
const FILE = process.argv[2] || 'registry.json';
const root = process.cwd();
const aiScript   = path.resolve(root, 'ai-manifest-kit/scripts/validate-ai.mjs');
const jwksScript = path.resolve(root, 'ai-manifest-kit/scripts/validate-jwks.mjs');
const items = JSON.parse(fs.readFileSync(FILE,'utf8')); const arr = Array.isArray(items)?items:(items.items||[]);
fs.mkdirSync(path.join(root,'_reports'), { recursive:true });
let okAll=true;
function run(args){ const r=spawnSync(process.execPath, args, { stdio:'inherit', shell:false }); return r.status??0; }
for (const ent of arr) {
  if (!ent || !ent.domain) continue;
  console.log('\n=== '+ent.domain+' ===');
  if (ent.manifest) {
    const code = run([aiScript,'--url',ent.manifest,'--check-remote','1','--strict','1','--out', path.join('_reports','ai_'+ent.domain+'.json')]);
    if (code!==0) okAll=false;
  }
  if (ent.jwks_uri) {
    const code = run([jwksScript,'--url',ent.jwks_uri,'--out', path.join('_reports','jwks_'+ent.domain+'.json')]);
    if (code!==0) okAll=false;
  }
}
console.log('\nAll OK:', okAll?'YES':'NO'); process.exit(okAll?0:1);