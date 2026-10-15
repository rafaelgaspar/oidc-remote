# AGENTS.md

Instructions for AI coding agents working in this repository.

## What this is

`oidc-remote` gets and refreshes an OAuth2 access token and injects it on the hop to a remote HTTPS server. TypeScript, ESM, published to npm. Library + `stdio` / `proxy` CLI.

Authentik is the first token backend (Kubernetes SA JWT as `client_assertion`). Later backends reuse the same token POST. This package does not implement OIDC.

## Layout

```
src/
  index.ts      # library exports
  token.ts      # TokenClient (exchange + cache)
  mcp-http.ts   # Streamable HTTP hop with live Bearer
  stdio.ts      # MCP stdio ↔ HTTP
  proxy.ts      # loopback HTTP reverse proxy
  cli.ts        # argv parsing + bin
.github/workflows/   # ci.yaml (push/PR), release.yaml (tag push), renovate.yaml, gitleaks.yaml
```

## Build, test, lint

```bash
npm ci
npm run typecheck   # tsc --noEmit
npm test            # tsx --test 'src/**/*.test.ts'
npm run build       # tsc -p tsconfig.build.json -> dist/
```

Run all of the above before considering a change complete. CI (`ci.yaml`) runs the same checks on every push/PR to `main`.

## Conventions

- Failed token exchange throws. Never mint a fallback JWT.
- Re-read the assertion file on every exchange (projected tokens rotate in place).
- Cache access tokens until 80% of `expires_in`.
- `stdio` and `proxy` own the HTTP hop so the Bearer can refresh; do not print a token and exec another process.
- TLS SNI and Host on the upstream hop are the gateway hostname. Do not dial the VIP or ClusterIP as an IP.
- Public API is the hop plus `client_credentials` + JWT `client_assertion`. Do not add Authentik-only names, paths, or claim types.
- No comments explaining *what* code does — only *why*, and only when genuinely non-obvious.
- Don't add abstractions, config flags, or generality beyond what's actually needed.

## Release process

Maintainer-only: push a `vX.Y.Z` tag from `main` to trigger `.github/workflows/release.yaml` (npm publish). Contributors don't need to think about this — see `CONTRIBUTING.md` for details if you do.

## Commit/PR conventions

No project-specific identity or authorship requirements — normal open-source practice applies: your own name/email as author, clear conventional-ish commit messages (`feat(...)`, `fix(...)`, `chore(...)`), one logical change per PR. See `CONTRIBUTING.md`.
