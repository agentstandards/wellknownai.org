// tools/metrics_from_reports.mjs
import fs from 'node:fs';
import path from 'node:path';

function scanReports(dir){
  const items = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f=>f.endsWith('.json')) : [];
  const byDomain = new Map();
  for (const f of items) {
    const p = path.join(dir,f);
    let j; try { j = JSON.parse(fs.readFileSync(p,'utf8')); } catch { continue; }
    const m = f.match(/^(ai|jwks)_(.+)\.json$/i); if (!m) continue;
    const kind = m[1].toLowerCase(); const domain = m[2];
    const rec = byDomain.get(domain) || { ai:false, jwks:false };
    const ok = (j && (j.ok === true || (j.schema_ok !== false && (!j.errors || j.errors.length===0))));
    rec[kind] = !!ok;
    byDomain.set(domain, rec);
  }
  return byDomain;
}

function activeDomains(regPath){
  const raw = JSON.parse(fs.readFileSync(regPath,'utf8'));
  const arr = Array.isArray(raw) ? raw : (raw.items||[]);
  return arr.filter(e=>String((e && e.status)||'active').toLowerCase()==='active').map(e=>String(e.domain));
}

const OUT = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out')+1] : '_metrics/metrics.json';
const reg = 'registry.json';
const rep = '_reports';

fs.mkdirSync(path.dirname(OUT), { recursive:true });

const active = activeDomains(reg);
const by = scanReports(rep);
const domains = active.map(d => ({ domain:d, ai_ok: !!(by.get(d)?.ai), jwks_ok: !!(by.get(d)?.jwks) }));
const okCount = domains.filter(x=>x.ai_ok && x.jwks_ok).length;

const payload = {
  generated_at: new Date().toISOString(),
  active_total: active.length,
  ok_both: okCount,
  pass_rate: active.length ? +(okCount*100/active.length).toFixed(1) : 100,
  domains
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2), 'utf8');
console.log('metrics ->', OUT, '| active=', payload.active_total, 'ok_both=', payload.ok_both);
