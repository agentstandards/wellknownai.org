import fs from 'node:fs';
import path from 'node:path';
import fetchOrig from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import crypto from 'node:crypto';

function args(argv){
  const o = { _: [] };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const [k, vRaw] = a.replace(/^--/, '').split('=');
    const K = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    let v = vRaw;
    if (v === undefined) {
      const n = argv[i + 1];
      if (n && !n.startsWith('--')) { v = n; i++; }
      else v = true;
    }
    o[K] = v;
  }
  return o;
}
const ARGS = args(process.argv);
const IN_FILE = ARGS.file || '';
const IN_URL  = ARGS.url || '';
const OUT     = ARGS.out || path.resolve('_reports/ai_validate.json');
const CHECK_REMOTE = /^1|true$/i.test(String(ARGS.checkRemote || ''));
const STRICT  = /^1|true$/i.test(String(ARGS.strict || ''));
const SCHEMA_PATH = ARGS.schema || path.resolve('ai-manifest-kit/schemas/ai-manifest-0.1.json');

function buildProxyFetch() {
  const p = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || null;
  if (!p) return fetchOrig;
  const agent = p.startsWith('socks') ? new SocksProxyAgent(p) : new HttpsProxyAgent(p);
  return (url, init={}) => fetchOrig(url, { ...init, agent });
}
const fetch = buildProxyFetch();

function ensureDir(p){ fs.mkdirSync(path.dirname(p), { recursive:true }); }
function sha256(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }
function isHttps(u){ try{ const x=new URL(u); return x.protocol==='https:'; }catch{ return false; } }

async function loadJsonFromUrl(url){
  const r = await fetch(url, { headers: { 'Accept':'application/json' } });
  const text = await r.text();
  return { ok: r.ok, status: r.status, headers: Object.fromEntries(r.headers.entries()), text,
    json: (()=>{ try{return JSON.parse(text);}catch{return null;} })(), url };
}
function loadJsonFromFile(fp){
  const text = fs.readFileSync(fp,'utf8');
  try { return { ok:true, json: JSON.parse(text), text, file: fp }; }
  catch (e){ return { ok:false, error:'Invalid JSON: ' + e.message, text, file: fp }; }
}

function mkAjv(){
  // draft-07 默认支持
  const ajv = new Ajv({ strict: true, allErrors: true });
  addFormats(ajv);
  return ajv;
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
    if (k.kty==='RSA' && (!k.n || !k.e)) issues.push('RSA key ' + (k.kid||'') + ' missing n/e');
    if (k.kty==='EC' && (!k.crv || !k.x || !k.y)) issues.push('EC key ' + (k.kid||'') + ' missing crv/x/y');
    if (k.kty==='OKP' && (!k.crv || !k.x)) issues.push('OKP key ' + (k.kid||'') + ' missing crv/x');
  }
  return { ok: issues.length===0, issues };
}

async function headOrGet(url){
  let r = await fetch(url, { method:'HEAD' }).catch(()=>null);
  if (!r || !r.ok) r = await fetch(url).catch(()=>null);
  return r;
}

async function main(){
  // 1) Load schema (draft-07)
  let schema;
  try { schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')); }
  catch (e){ console.error('Load schema failed:', e.message); process.exit(1); }
  const ajv = mkAjv();
  const validate = ajv.compile(schema);

  // 2) Load manifest
  let manifest, source='file';
  if (IN_URL) {
    const resp = await loadJsonFromUrl(IN_URL);
    if (!resp.ok || !resp.json) { console.error('Failed to load URL ' + IN_URL + ': ' + resp.status); process.exit(1); }
    manifest = resp.json; source = IN_URL;
  } else {
    const fp = IN_FILE || path.resolve('.well-known/ai.json');
    const r = loadJsonFromFile(fp);
    if (!r.ok) { console.error(r.error); process.exit(1); }
    manifest = r.json; source = fp;
  }

  // 3) JSON Schema validation
  const valid = validate(manifest);
  const schemaErrors = valid ? [] : (validate.errors || []).map(e=> (e.instancePath||'/') + ' ' + e.message);

  // 4) Additional policy checks
  const policyIssues = [];
  const urlFields = [];
  if (manifest.spec?.openapi_url) urlFields.push(['spec.openapi_url', manifest.spec.openapi_url]);
  if (Array.isArray(manifest.spec?.schemas)) manifest.spec.schemas.forEach((u,i)=>urlFields.push(['spec.schemas['+i+']', u]));
  if (manifest.auth?.jwks_uri) urlFields.push(['auth.jwks_uri', manifest.auth.jwks_uri]);
  if (Array.isArray(manifest.servers)) manifest.servers.forEach((s,i)=>urlFields.push(['servers['+i+'].url', s.url]));
  for (const [k,u] of urlFields) {
    if (!isHttps(u)) policyIssues.push(k + ' must be HTTPS');
  }
  if (Array.isArray(manifest.capabilities)) {
    manifest.capabilities.forEach((c,i)=>{
      if (/[A-Z]/.test(c)) policyIssues.push('capabilities['+i+'] contains uppercase (recommend lowercase): ' + c);
    });
  }

  // 5) Remote checks (optional)
  const remoteChecks = [];
  if (CHECK_REMOTE) {
    if (IN_URL) {
      const r = await headOrGet(IN_URL);
      if (r) {
        const cc = r.headers.get('cache-control') || '';
        const etag = r.headers.get('etag');
        const lm = r.headers.get('last-modified');
        if (!/max-age=\d+/.test(cc)) remoteChecks.push({ warn:'manifest cache-control missing or no max-age' });
        if (!etag) remoteChecks.push({ warn:'manifest ETag missing' });
        if (!lm) remoteChecks.push({ warn:'manifest Last-Modified missing' });
      }
    }
    if (manifest.spec?.openapi_url) {
      const r = await headOrGet(manifest.spec.openapi_url);
      if (!r || !r.ok) remoteChecks.push({ error:'openapi_url not reachable: ' + manifest.spec.openapi_url });
      else {
        const ct = (r.headers.get('content-type')||'').toLowerCase();
        if (!/json|yaml|yml/.test(ct)) remoteChecks.push({ warn:'openapi content-type suspicious: ' + ct });
      }
    }
    if (Array.isArray(manifest.spec?.schemas)) {
      for (const u of manifest.spec.schemas) {
        const r = await headOrGet(u);
        if (!r || !r.ok) remoteChecks.push({ error:'schema not reachable: ' + u });
      }
    }
    if (manifest.auth?.jwks_uri) {
      const jw = await loadJsonFromUrl(manifest.auth.jwks_uri);
      if (!jw.ok || !jw.json) remoteChecks.push({ error:'jwks_uri not reachable or invalid JSON: ' + manifest.auth.jwks_uri });
      else {
        const qc = quickCheckJwks(jw.json);
        if (!qc.ok) remoteChecks.push({ error:'JWKS issues: ' + qc.issues.join('; ') });
        const sum = sha256(Buffer.from(jw.text || ''));
        remoteChecks.push({ info:'jwks sha256='+sum });
        const cc = (jw.headers?.['cache-control']||'');
        if (!/max-age=\d+/.test(cc)) remoteChecks.push({ warn:'jwks cache-control missing or no max-age' });
        if (!jw.headers?.etag) remoteChecks.push({ warn:'jwks ETag missing' });
      }
    }
  }

  // 6) Report
  const ok = schemaErrors.length===0 && (!STRICT || policyIssues.length===0) && !remoteChecks.some(x=>x.error);
  const report = {
    generated_at: new Date().toISOString(),
    source,
    ok,
    schema_ok: schemaErrors.length===0,
    strict_ok: !STRICT || policyIssues.length===0,
    errors: schemaErrors,
    policy_issues: policyIssues,
    remote_checks: remoteChecks
  };

  ensureDir(OUT);
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
  console.log(ok ? 'OK ✅ ai.json passes' : 'Invalid ❌ ai.json failed checks');
  console.log('Report ->', OUT);
  if (!ok) process.exitCode = 1;
}

main().catch(e=>{ console.error('ERROR:', e.message); process.exit(2); });
