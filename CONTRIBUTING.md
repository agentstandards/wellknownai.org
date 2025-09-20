# Contributing — Get listed (Registry)

We welcome PRs to add your domain to the registry.

## Steps (recommended)
1) Publish these files over HTTPS under your domain:
   - `/.well-known/ai.json`
   - `/.well-known/jwks.json`
   - (optional) `/.well-known/ai-crl.json`
   Recommended headers: ETag, Last-Modified, Cache-Control: max-age≥600.

2) Open a Pull Request to edit `registry.json` (keep the array sorted by domain):
```json
{
  "domain": "your-domain",
  "manifest": "https://your-domain/.well-known/ai.json",
  "jwks_uri": "https://your-domain/.well-known/jwks.json",
  "openapi": "https://your-domain/openapi.yaml",
  "servers": [{ "type": "rest", "url": "https://api.your-domain" }],
  "capabilities": ["schemas.list","urn:agent:skill:your-domain:example.v1"],
  "status": "inactive"
}
```
- First-time recommend `inactive`; after remote checks pass, switch to `active`.

3) CI checks
   - Validate Registry (schema): structure & enums
   - Validate Registry (Schema + Remote): checks only `status=active`
   - Sort & duplicate check: `registry.json` must be domain-asc and no duplicates

## Maintainers
- Sorting fix: run the workflow “Registry sort fix (manual)” with the PR branch name, or locally:
  `node tools/sort_registry_safe.mjs --file registry.json --out registry.json`
- Activate entries: set `status` to `active` only after remote checks succeed.
