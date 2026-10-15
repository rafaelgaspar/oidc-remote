# oidc-remote

Attach a live OAuth2 access token on the hop to a remote HTTPS server.

`oidc-remote` is a **local** process (or library) that gets and refreshes an access token, then injects it as `Authorization: Bearer`. It does not implement an OpenID Provider, and it is not a full OIDC relying party.

The first token backend is Authentik: in-cluster clients federate a projected Kubernetes ServiceAccount JWT as `client_assertion` (`client_credentials` + JWT bearer). Later backends use this same token request.

## Install

```bash
npm install oidc-remote
```

Node.js 22+.

## Library

```ts
import { TokenClient } from "oidc-remote";

const tokens = new TokenClient({
  tokenUrl: "https://idp.example/token",
  clientId: "cluster-mcp.example.test",
  assertionFile: "/var/run/secrets/tokens/oidc",
});

const accessToken = await tokens.getAccessToken();
```

`getAccessToken()` reads the assertion file on each exchange (the projected token is rotated in place), POSTs `grant_type=client_credentials` with `client_assertion`, and caches the access token until 80% of `expires_in`. A failed exchange throws `TokenExchangeError` — it does not mint a fallback token.

Default scope is `openid profile entitlements`. Default assertion path is `/var/run/secrets/tokens/oidc`.

Callers that already speak HTTPS should use `TokenClient` directly and keep the real hostname on the request so TLS SNI and `:authority` match the gateway.

## CLI

### `stdio`

For MCP clients that spawn a command (Cursor `mcp.json`, Claude `mcpServers`):

```json
"cluster": {
  "command": "oidc-remote",
  "args": [
    "stdio",
    "--gateway", "cluster-mcp.example.test",
    "--token-url", "https://idp.example/token"
  ]
}
```

Stdio to the parent, Streamable HTTP to `https://<gateway>/mcp`, live Bearer on every HTTP request. SNI and Host are the gateway hostname.

### `proxy`

For HTTP clients that freeze a URL or API key at construct time:

```bash
oidc-remote proxy \
  --gateway ai.example.test \
  --token-url https://idp.example/token \
  --listen 127.0.0.1:8080
```

Point the app at `http://127.0.0.1:8080` (plaintext loopback). The proxy injects Bearer and forwards to `https://<gateway>` with that hostname as SNI/Host.

### Flags

| Flag | Env | Default |
|---|---|---|
| `--gateway` | | *(required)* hostname; also the OAuth `client_id` unless `--client-id` is set |
| `--token-url` | `OIDC_REMOTE_TOKEN_URL` | *(required)* |
| `--assertion-file` | `OIDC_REMOTE_ASSERTION_FILE` | `/var/run/secrets/tokens/oidc` |
| `--scope` | `OIDC_REMOTE_SCOPE` | `openid profile entitlements` |
| `--client-id` | | `--gateway` |
| `--url` | | `https://<gateway>/mcp` (`stdio`) |
| `--mcp-path` | | `/mcp` |
| `--upstream` | | `https://<gateway>` (`proxy`) |
| `--listen` | | `127.0.0.1:8080` (`proxy`) |

## What this is not

- Not an OIDC stack. No authorization-code browser flow, no DCR, no PKCE.
- Assertion JWTs never go to the gateway. They are only exchanged at the token URL.

## License

MIT
