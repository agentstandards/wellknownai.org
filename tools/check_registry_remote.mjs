import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const FILE = process.argv[2] || 'registry.json';
const root = process.cwd(); // 要从仓库根目录执行本脚本

// 读取 registry 并仅检查 active 项（未写 status 视为 active）
const items = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const arr0 = Array.isArray(items) ? items : (items.items || []);
const arr = arr0.filter(e => String((e && e.status) || 'active').toLowerCase() === 'active');
const skipped = arr0.length - arr.length;
if (skipped > 0) console.log(`\n[info] skipped ${skipped} non-active entries`);

// 如没有 active，直接成功退出
if (arr.length === 0) {
  console.log('\n[info] no active entries to check');
  console.log('\nAll OK: YES');
  process.exit(0);
}

const aiScript   = path.resolve(root, 'ai-manifest-kit/scripts/validate-ai.mjs');
const jwksScript = path.resolve(root, 'ai-manifest-kit/scripts/validate-jwks.mjs');

let okAll = true;
function runNode(args) {
  const r = spawnSync(process.execPath, args, { stdio:'inherit', shell:false });
  return r.status ?? 0;
}

for (const ent of arr) {
  if (!ent || !ent.domain) continue;
  console.log(`\n=== ${ent.domain} ===`);
  if (ent.manifest) {
    const code = runNode([aiScript, '--url', ent.manifest, '--check-remote', '1', '--strict', '1', '--out', path.join('_reports', `ai_${ent.domain}.json`)]);
    if (code !== 0) okAll = false;
  }
  if (ent.jwks_uri) {
    const code = runNode([jwksScript, '--url', ent.jwks_uri, '--out', path.join('_reports', `jwks_${ent.domain}.json`)]);
    if (code !== 0) okAll = false;
  }
}

console.log(`\nAll OK: ${okAll ? 'YES' : 'NO'}`);
process.exit(okAll ? 0 : 1);
