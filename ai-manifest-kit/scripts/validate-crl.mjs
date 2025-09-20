import fs from 'node:fs';
import path from 'node:path';
import fetchOrig from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

function args(argv){ const o={_:[]}; for(let i=2;i<argv.length;i++){const a=argv[i];
  if(!a.startsWith('--')){o._.push(a);continue}
  const [k,vRaw]=a.replace(/^--/,'').split('='); const K=k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
  let v=vRaw; if(v===undefined){ const n=argv[i+1]; if(n && !n.startsWith('--')){ v=n;i++; } else v=true; }
  o[K]=v;
} return o;}
const ARGS = args(process.argv);
const IN_FILE = ARGS.file || '';
const IN_URL  = ARGS.url || '';
const OUT     = ARGS.out  || path.resolve('_reports/crl_validate.json');
const SCHEMA  = ARGS.schema || path.resolve('ai-manifest-kit/schemas/ai-crl-0.1.json');

function ensureDir(p){ fs.mkdirSync(path.dirname(p), { recursive:true }); }
function buildProxyFetch(){
  const p = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || null;
  if (!p) return fetchOrig;
  const agent = p.startsWith('socks') ? new SocksProxyAgent(p) : new HttpsProxyAgent(p);
  return (url, init={}) => fetchOrig(url, { ...init, agent });
}
const fetch = buildProxyFetch();

async function load(){
  if (IN_URL) {
    const r = await fetch(IN_URL);
    const text = await r.text();
    let json=null; try{ json=JSON.parse(text); }catch{}
    return { ok:r.ok && !!json, status:r.status, json, headers:Object.fromEntries(r.headers.entries()), source:IN_URL, remote:true };
  } else {
    const fp = IN_FILE || '.well-known/ai-crl.json';
    const text = fs.readFileSync(fp,'utf8');
    let json=null; try{ json=JSON.parse(text); }catch{}
    return { ok:!!json, json, source:fp, remote:false };
  }
}

function extraChecks(data){
  const issues=[];
  if (Array.isArray(data.revoked)) {
    const seen = new Set();
    for (const r of data.revoked) {
      if (r?.kid) {
        if (seen.has(r.kid)) issues.push('duplicate kid in revoked: ' + r.kid);
        else seen.add(r.kid);
      }
    }
    const ts = data.revoked.map(r=>Date.parse(r?.revoked_at||'')).filter(n=>!isNaN(n));
    for (let i=1;i<ts.length;i++){
      if (ts[i] < ts[i-1]) { issues.push('revoked_at not chronological (entry '+i+')'); break; }
    }
  }
  return issues;
}

(async()=>{
  const schema = JSON.parse(fs.readFileSync(SCHEMA,'utf8'));
  const ajv = new Ajv({ strict:true, allErrors:true }); addFormats(ajv);
  const validate = ajv.compile(schema);

  const r = await load();
  const report = { generated_at:new Date().toISOString(), source:r.source, ok:false, schema_ok:false, errors:[], issues:[], headers:r.headers||{} };

  if (!r.ok) {
    report.errors.push('Load failed' + (r.status? ' (status '+r.status+')':''));
  } else {
    const okSchema = validate(r.json);
    report.schema_ok = okSchema;
    report.errors = okSchema ? [] : (validate.errors||[]).map(e=> (e.instancePath||'/') + ' ' + e.message);
    report.issues = extraChecks(r.json);

    // 远程缓存头检查
    if (r.remote && r.headers) {
      const cc = (r.headers['cache-control']||'');
      if (!/max-age=d+/.test(cc)) report.issues.push('warn: cache-control missing or no max-age');
      if (!r.headers.etag) report.issues.push('warn: ETag missing');
    }
    report.ok = okSchema && report.issues.filter(x=>!x.startsWith('warn')).length===0;
  }

  ensureDir(OUT);
  fs.writeFileSync(OUT, JSON.stringify(report,null,2), 'utf8');
  console.log(report.ok ? 'OK ✅ ai-crl valid' : 'Invalid ❌ ai-crl has problems');
  console.log('Report ->', OUT);
  if (!report.ok) process.exitCode = 1;
})().catch(e=>{ console.error('ERROR:', e.message); process.exit(2); });
