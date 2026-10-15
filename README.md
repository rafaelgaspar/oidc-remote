# oidc-remote

**Stop pasting long-lived JWTs into `mcp.json`.** Run MCP and HTTP clients against OAuth2-protected gateways using a **projected Kubernetes ServiceAccount token** (or any JWT `client_assertion`) — with automatic refresh on every hop.

Built for the same shape as [mcp-remote](https://github.com/modelcontextprotocol/mcp-remote): stdio in the IDE, Streamable HTTP to your gateway — except the Bearer token is exchanged live from the pod, not copied from a secret manager.

## Why this exists

| Without `oidc-remote` | With `oidc-remote` |
|---|---|
| Mint a static MCP JWT, store it in SOPS, rotate by hand | Pod identity → Authentik (or any IdP) → short-lived access token |
| `mcp.json` holds secrets that outlive the session | `mcp.json` only points at `oidc-remote stdio` + gateway hostname |
| OpenAI SDK wants `OPENAI_API_KEY` at startup | `oidc-remote proxy` on loopback; app keeps a dummy URL, proxy adds Bearer |
| Custom refresh logic in every app | One `TokenClient` (or CLI) shared by MCP stdio, HTTP proxy, and your code |

Typical stack (this is the use case it was written for):

1. **Envoy Gateway** (or similar) validates JWTs on `/mcp` or an AI route.
2. **Authentik** (or another OAuth2 server) issues tokens for `client_credentials` + JWT bearer assertion.
3. **Kubernetes** projects a ServiceAccount JWT (often audience-bound) at `/var/run/secrets/tokens/oidc`.
4. **Cursor, Claude Code, discord-agent, Paperless-AI, …** call the gateway with a fresh Bearer — no mint script in the loop.

`oidc-remote` is the small glue: read assertion → POST token endpoint → cache → inject `Authorization: Bearer` on the **next** HTTPS hop. It is **not** an OpenID Provider and **not** a browser login UI.

## Install

```bash
npm install oidc-remote
```

## MCP (Cursor, Claude Desktop, Claude Code)

Drop-in stdio wrapper — same transport as mcp-remote, with `authProvider.token()` before each HTTP request:

```json
"cluster": {
  "command": "npx",
  "args": [
    "-y",
    "oidc-remote",
    "stdio",
    "--gateway", "cluster-mcp.example.test",
    "--token-url", "https://authentik.example/application/o/token/"
  ]
}
```

- Parent process speaks MCP over stdio; upstream is Streamable HTTP to `https://<gateway>/mcp`.
- **SNI and `Host` stay the gateway hostname** (important behind TLS gateways and VIP DNAT).
- OAuth `client_id` defaults to the gateway hostname; override with `--client-id` when your IdP uses a fixed client id (e.g. `ai.local.example`).

Env vars: `OIDC_REMOTE_TOKEN_URL`, `OIDC_REMOTE_ASSERTION_FILE`, `OIDC_REMOTE_SCOPE`.

## OpenAI-compatible apps (API key frozen at boot)

Many clients only accept `OPENAI_BASE_URL` + `OPENAI_API_KEY` once. Run a loopback proxy that refreshes Bearer tokens toward the real AI gateway:

```bash
oidc-remote proxy \
  --gateway ai.example.test \
  --token-url https://authentik.example/application/o/token/ \
  --listen 127.0.0.1:18789
```

Point the app at `http://127.0.0.1:18789/v1` (plaintext on loopback only). The proxy forwards to `https://<gateway>` with correct TLS identity.

## Library

Use when you already control the HTTP client (discord-agent, custom Node services):

```ts
import { TokenClient } from "oidc-remote";

const tokens = new TokenClient({
  tokenUrl: "https://authentik.example/application/o/token/",
  clientId: "cluster-mcp.example.test",
  assertionFile: "/var/run/secrets/tokens/oidc",
});

const accessToken = await tokens.getAccessToken();
```

- Re-reads the assertion file on **every** exchange (projected K8s tokens rotate in place).
- Caches the access token until ~80% of `expires_in`.
- Failed exchange → `TokenExchangeError` (no fallback JWT).

Default scope: `openid profile entitlements`. Default assertion path: `/var/run/secrets/tokens/oidc`.

## Token exchange (what gets sent)

Only the **token URL** sees the ServiceAccount JWT. The gateway never does.

```
grant_type=client_credentials
client_id=<gateway hostname or --client-id>
client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
client_assertion=<contents of assertion file>
scope=openid profile entitlements   # override with --scope
```

Any OAuth2 server that accepts that grant works; Authentik + Kubernetes SA JWT is the reference setup.

## CLI reference

| Flag | Env | Default |
|---|---|---|
| `--gateway` | | *(required)* hostname; default OAuth `client_id` |
| `--token-url` | `OIDC_REMOTE_TOKEN_URL` | *(required)* |
| `--assertion-file` | `OIDC_REMOTE_ASSERTION_FILE` | `/var/run/secrets/tokens/oidc` |
| `--scope` | `OIDC_REMOTE_SCOPE` | `openid profile entitlements` |
| `--client-id` | | `--gateway` |
| `--url` | | `https://<gateway>/mcp` (`stdio`) |
| `--mcp-path` | | `/mcp` |
| `--upstream` | | `https://<gateway>` (`proxy`) |
| `--listen` | | `127.0.0.1:8080` (`proxy`) |

## What this is not

- Not a full OIDC/OAuth client (no auth code, PKCE, DCR, or refresh tokens for user login).
- Not a replacement for your IdP or gateway — only the **client side** of `client_credentials` + JWT assertion.
- Assertion JWTs are **not** forwarded to the gateway; only the exchanged access token is.

## License

MIT
