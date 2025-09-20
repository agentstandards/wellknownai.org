Title: chore(registry): add <your-domain>

- Domain: <your-domain>
- ai.json: https://<your-domain>/.well-known/ai.json
- JWKS: https://<your-domain>/.well-known/jwks.json
- OpenAPI (optional): https://<your-domain>/openapi.yaml
- Servers: [{"type":"rest","url":"https://api.<your-domain>"}]
- Capabilities: ["schemas.list","urn:agent:skill:<your-domain>:example.v1"]
- Status: inactive (switch to active after remote checks pass)

Notes:
- HTTPS only; ETag/Last-Modified/Cache-Control recommended.
- JWKS rotation by kid; overlap ≥ 7 days.
