# Contributing

Thanks for considering a contribution to `oidc-remote`.

## Dev setup

```bash
git clone https://github.com/rafaelgaspar/oidc-remote
cd oidc-remote
npm ci
npm run typecheck
npm test
npm run build
```

`node dist/cli.js stdio --gateway <hostname> --token-url <url>` runs your local build directly, without publishing anything.

## Code style

- TypeScript, ESM (`type: module`). Keep new code consistent with the existing style in `src/` rather than introducing a new pattern.
- No comments explaining *what* code does; only *why*, when it's genuinely non-obvious.
- The public API is the hop plus `client_credentials` + JWT `client_assertion`. Authentik is the first token backend; do not add Authentik-only names, paths, or claim types to that API.

## Workflow

1. Fork the repo and branch off `main`.
2. Keep PRs scoped to one logical change — avoid bundling unrelated fixes/features.
3. Make sure `npm run typecheck` and `npm test` pass locally before opening the PR. CI runs the same checks and must be green before merge.
4. Write commit messages and PR titles in the imperative, conventional-commit-ish style already used in the history (`feat(...)`, `fix(...)`, `chore(...)`, etc.) — not required, but appreciated.
5. Update the README/CONTRIBUTING alongside any user-facing change (new flag, new export).

## Releasing (maintainers)

Releases are cut by pushing a `vX.Y.Z` tag from `main` (matching `package.json`'s `version`). That triggers `.github/workflows/release.yaml`, which:

- Stages the package on npm (`npm stage publish`). A maintainer 2FA-approves it (`npm stage approve` or the Staged Packages tab on npmjs.com) before it is public.
- Creates the GitHub Release itself (`softprops/action-gh-release`, auto-generated notes), once staging has succeeded.

Contributors don't need to do any of this — only a maintainer pushing a release tag triggers it.
