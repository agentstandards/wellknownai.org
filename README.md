# wellknownai.org

[![Validate Registry](https://github.com/agentstandards/wellknownai.org/actions/workflows/validate-registry.yml/badge.svg)](https://github.com/agentstandards/wellknownai.org/actions/workflows/validate-registry.yml) [![Validate Registry (Schema + Remote)](https://github.com/agentstandards/wellknownai.org/actions/workflows/validate-registry-remote.yml/badge.svg)](https://github.com/agentstandards/wellknownai.org/actions/workflows/validate-registry-remote.yml)


WellKnownAI — registry/examples/snapshots (OpenAPI/JSON Schema + JOSE/JWKS)

## 5-minute Getting Started (Provider)

1) Create `/.well-known/ai.json` (minimal example):

```json
{
  "manifest_version": "0.1",
  "provider": { "name": "Your Inc.", "homepage": "https://your-domain" },
  "spec": { "schemas": ["https://your-domain/schemas/YourSchema.json"] },
  "servers": [{ "type": "rest", "url": "https://api.your-domain" }],
  "capabilities": ["schemas.list", "urn:agent:skill:your-domain:example.v1"],
  "auth": { "jwks_uri": "https://your-domain/.well-known/jwks.json", "schemes": ["bearer"] }
}
```

2) Publish JWKS at `/.well-known/jwks.json` (placeholder for demo; use a real public key in production):

```json
{
  "keys": [{
    "kty": "RSA",
    "kid": "2025-01-01-rsa",
    "use": "sig",
    "alg": "RS256",
    "n": "base64url...",
    "e": "AQAB"
  }]
}
```

3) (Optional) Publish CRL at `/.well-known/ai-crl.json` to revoke keys or mark compliance status.

4) Validate locally using the CLI provided in this repo:

```bash
node ai-manifest-kit/scripts/validate-ai.mjs --file .well-known/ai.json --out _reports/ai_local.json
node ai-manifest-kit/scripts/validate-jwks.mjs --file .well-known/jwks.json --out _reports/jwks_local.json
node ai-manifest-kit/scripts/validate-crl.mjs  --file .well-known/ai-crl.json --out _reports/crl_local.json
```

5) Wire CI: This repo ships validate-registry.yml and validate-registry-remote.yml. Changes to registry.json are validated automatically.

6) (Optional) To be listed, open a PR to add your domain to wellknownai.org’s `registry.json` (see Registry Viewer on the site).

Notes:
- Use HTTPS and absolute URLs.
- Send ETag and Last-Modified, and a Cache-Control (e.g., max-age=600+).
- Rotate JWKS by `kid` with an overlap window (≥ 7 days): add new key first, then remove the old one.

