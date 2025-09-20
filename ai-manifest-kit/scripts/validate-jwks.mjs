import fs from 'node:fs';
import path from 'node:path';
import fetchOrig from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

function args(argv){ const o={_:[]}; for(let i=2;i<argv.length;i++){const a=argv[i];
  if(!a.startsWith('--')){o._.push(a);continue}
  const [k,vRaw]=a.replace(/^--/,'').split('='); const K=k.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
  let v=vRaw; if(v===undefined){ const n=argv[i+1]; if(n && !n.startsWith('--')){ v=n; i++; } else v=true; }
  o[K]=v;
} return o;}
const ARGS = args(process.argv);
const IN_FILE = ARGS.file || '';
const IN_URL  = ARGS.url || '';
const OUT     = ARGS.out || path.resolve('_reports/jwks_validate.json');

function buildProxyFetch() {
  const p = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || null;
  if (!p) return fetchOrig;
  const agent = p.startsWith('socks') ? new SocksProxyAgent(p) : new HttpsProxyAgent(p);
  return (url, init={}) => fetchOrig(url, { ...init, agent });
}
const fetch = buildProxyFetch();
function ensureDir(p){ fs.mkdirSync(path.dirname(p), { recursive:true }); }

async function load(){
  if (IN_URL) {
    const r = await fetch(IN_URL);
    const text = await r.text();
    let json=null; try{ json=JSON.parse(text); }catch{}
    return { ok:r.ok && !!json, status:r.status, json, headers:Object.fromEntries(r.headers.entries()), source:IN_URL };
  } else {
    const fp = IN_FILE || '.well-known/jwks.json';
    const text = fs.readFileSync(fp,'utf8');
    let json=null; try{ json=JSON.parse(text); }catch{}
    return { ok:!!json, json, source:fp };
  }
}

function quickCheckJwks(jwks){
  const issues=[];
  if (!jwks || typeof jwks!=='object' || !Array.isArray(jwks.keys)) {
    issues.push('JWKS must be an object with "keys" array.');
    return { ok:false, issues };
  }
  const kids=new Set();
  for (const k of jwks.keys) {
    if (!k.kty) issues.push('key missing kty');
    if (!k.kid) issues.push('key missing kid');
    if (k.kid) {
      if (kids.has(k.kid)) issues.push('duplicate kid: ' + k.kid); else kids.add(k.kid);
    }
    if (k.kty==='RSA' && (!k.n||!k.e)) issues.push(`RSA key ${k.kid||''} missing n/e`);
    if (k.kty==='EC' && (!k.crv||!k.x||!k.y)) issues.push(`EC key ${k.kid||''} missing crv/x/y`);
    if (k.kty==='OKP' && (!k.crv||!k.x)) issues.push(`OKP key ${k.kid||''} missing crv/x`);
    if (k.use && !['sig','enc'].includes(k.use)) issues.push('unknown "use": ' + k.use);
    if (k.alg && !/^RS|ES|EdDSA|PS/.test(k.alg)) issues.push('suspicious "alg": ' + k.alg);
  }
  return { ok: issues.length===0, issues };
}

(async()=>{
  const r = await load();
  const out = { generated_at: new Date().toISOString(), source:r.source, ok:false, issues:[], headers:r.headers||{} };
  if (!r.ok) {
    out.issues.push(`Load failed (status ${r.status||''})`);
  } else {
    const qc = quickCheckJwks(r.json);
    out.ok = qc.ok; out.issues = qc.issues;
    if (r.headers) {
      const cc = (r.headers['cache-control']||'');
      if (!/max-age=\d+/.test(cc)) out.issues.push('cache-control missing or no max-age');
      if (!r.headers.etag) out.issues.push('ETag missing');
    }
  }
  ensureDir(OUT);
  fs.writeFileSync(OUT, JSON.stringify(out,null,2), 'utf8');
  console.log(out.ok ? 'OK ✅ JWKS looks sane' : 'Invalid ❌ JWKS issues found');
  console.log('Report ->', OUT);
  if (!out.ok) process.exitCode = 1;
})().catch(e=>{ console.error('ERROR:', e.message); process.exit(2); });
