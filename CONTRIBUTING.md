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

- Publishes to npm (`npm publish --access public`).
- Creates the GitHub Release itself (`softprops/action-gh-release`, auto-generated notes), once the npm job has succeeded.

Contributors don't need to do any of this — only a maintainer pushing a release tag triggers it.

### npm publishing auth

The `npm` job authenticates via [Trusted Publishing](https://docs.npmjs.com/trusted-publishers/) (GitHub Actions OIDC) — configured on the package's npmjs.com settings page (Trusted Publisher: org `rafaelgaspar`, repo `oidc-remote`, workflow filename `release.yaml`). No stored token after the first version exists.

`v0.1.0` is published with a classic `NPM_TOKEN` because npm requires the package to already exist on the registry before you can configure a Trusted Publisher for it. After that first publish: add the Trusted Publisher, confirm a later tag publishes via OIDC, then delete `NPM_TOKEN` from the repo secrets. A newly created Trusted Publisher must complete its first successful OIDC publish within 2 days or it expires.

GitHub-hosted runners only (`ubuntu-latest` in this repo). Self-hosted runners cannot use npm Trusted Publishing.

## Dependency updates

[Renovate](https://docs.renovatebot.com/) is configured via `renovate.json` (npm dependencies, GitHub Actions pins — grouped by non-major/major, non-majors automerge as soon as CI passes). It runs self-hosted via `.github/workflows/renovate.yaml` (weekday cron + manual dispatch) using [`renovatebot/github-action`](https://github.com/renovatebot/github-action), authenticating as a GitHub App rather than the hosted [Renovate GitHub App](https://github.com/apps/renovate). The workflow mints a short-lived installation token via [`actions/create-github-app-token`](https://github.com/actions/create-github-app-token) from the `RENOVATE_APP_CLIENT_ID` Actions variable and the `RENOVATE_APP_PRIVATE_KEY` repo secret — a maintainer needs to have created a GitHub App, installed it on this repo, and populated those for the workflow to run.
