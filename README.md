# sdk-upstream-sync

[![npm version](https://img.shields.io/npm/v/%40nometria-ai%2Fsdk-upstream-sync.svg)](https://www.npmjs.com/package/@nometria-ai/sdk-upstream-sync)
[![npm downloads](https://img.shields.io/npm/dm/%40nometria-ai%2Fsdk-upstream-sync.svg)](https://www.npmjs.com/package/@nometria-ai/sdk-upstream-sync)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Contract-aware fork maintenance for **any language**. Auto-applies safe upstream changes. Flags breaking ones.

Maintaining a fork of a third-party SDK, an internal shared library, or a vendored dependency? This tool diffs API contracts between upstream and your local version, auto-applies small safe changes, and generates an investigation report for anything risky — across **npm, pip, Go, Rust, Java, and C#**.

---

## Quick start (2 commands)

```bash
# 1. Init config (one time)
npx sdk-sync init stripe/stripe-node

# 2. Run sync
npx sdk-sync
```

That's it. No env vars needed after init.

---

## Install

```bash
# From npm
npm install -g @nometria-ai/sdk-upstream-sync

# Or use without installing
npx sdk-sync
```

---

## How it works

```
npx sdk-sync
    │
    ├─ 1. Fetch latest upstream SHA from GitHub
    ├─ 2. Auto-detect ecosystem (npm/pip/go/cargo/maven/nuget)
    ├─ 3. Extract API contracts (exports, classes, methods)
    │     ├─ Upstream: via GitHub API
    │     └─ Local: walks your source tree
    ├─ 4. Diff contracts → new exports, removed exports, breaking changes
    ├─ 5. Check safety thresholds (max files, max LOC, zero breaking)
    │     ├─ ✅ Safe → auto-apply changes
    │     └─ ⚠️  Unsafe → generate sync/report.md for review
    └─ Done
```

---

## Supported ecosystems

| Ecosystem | Languages | What it extracts |
|-----------|-----------|-----------------|
| **npm** | JS, TS, JSX, TSX | `export function/class/const`, `module.exports`, re-exports |
| **pip** | Python | `__all__`, public functions, classes, `__init__.py` re-exports |
| **go** | Go | Uppercase exported identifiers (func, type, const, var) |
| **cargo** | Rust | `pub fn/struct/enum/trait/type/mod/const/static`, impl methods |
| **maven** | Java, Kotlin | `public class/interface/enum/record`, public methods |
| **nuget** | C# | `public class/interface/struct/enum`, methods, properties |

Ecosystem is auto-detected from your project files (`package.json` → npm, `pyproject.toml` → pip, `go.mod` → go, etc). Override in config if needed.

---

## Config file

`sdk-sync.config.json` (created by `npx sdk-sync init`):

```json
{
  "upstream": "stripe/stripe-node",
  "branch": "main",
  "ecosystem": "auto",
  "ignore": ["node_modules/**", "dist/**", ".git/**", "__pycache__/**"],
  "maxFiles": 20,
  "maxLoc": 600
}
```

| Field | Default | Description |
|-------|---------|-------------|
| `upstream` | — | Upstream GitHub repo (`org/repo`). **Required**. |
| `branch` | `main` | Upstream branch to track |
| `ecosystem` | `auto` | `auto` \| `npm` \| `pip` \| `go` \| `cargo` \| `maven` \| `nuget` |
| `ignore` | `[]` | Glob patterns to skip during contract scanning |
| `maxFiles` | `20` | Auto-apply if ≤ this many files changed |
| `maxLoc` | `600` | Auto-apply if ≤ this many lines changed |

All values can also be set via env vars (`UPSTREAM_REPO`, `UPSTREAM_BRANCH`, `ECOSYSTEM`, `MAX_FILES`, `MAX_LOC`, `GITHUB_TOKEN`).

---

## CLI commands

```bash
npx sdk-sync              # Run sync (default)
npx sdk-sync init [repo]  # Create config file
npx sdk-sync diff         # Show diff without applying
npx sdk-sync report       # Generate report only
npx sdk-sync --help       # Show help
```

---

## GitHub Action

```yaml
# .github/workflows/sync-upstream.yml
name: Sync upstream SDK

on:
  schedule:
    - cron: '0 9 * * 1'    # every Monday at 9am
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: nometria/sdk-upstream-sync@v1
        with:
          upstream_repo: 'stripe/stripe-node'
          upstream_branch: 'main'
          max_files: '20'
          max_loc: '600'
          create_pr: 'true'
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

### Action inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `upstream_repo` | yes | — | Upstream GitHub repo |
| `upstream_branch` | no | `main` | Branch to track |
| `local_path` | no | `.` | Path to local fork |
| `max_files` | no | `20` | Auto-apply file threshold |
| `max_loc` | no | `600` | Auto-apply LOC threshold |
| `create_pr` | no | `false` | Open PR instead of direct commit |
| `github_token` | no | `${{ github.token }}` | Token for API access |

---

## Use cases

### 1. Third-party SDK fork maintenance

You vendor Stripe's Node SDK, add custom retry logic, and need to stay in sync:

```bash
npx sdk-sync init stripe/stripe-node
npx sdk-sync
```

Every Monday, the GitHub Action checks for upstream changes. Safe changes (new exports, small patches) are auto-applied. Breaking changes (removed methods) generate a report for manual review.

### 2. Cross-team shared SDK (enterprise)

Your company has a Platform team that publishes an internal SDK (`company/platform-sdk`). Three product teams fork it and add team-specific extensions:

```
company/platform-sdk (upstream)
  ├── team-payments/platform-sdk (fork)
  ├── team-identity/platform-sdk (fork)
  └── team-analytics/platform-sdk (fork)
```

Each team runs `sdk-sync` weekly. When Platform ships a new method, all forks get it automatically. When Platform removes a deprecated method, each team gets a report before anything breaks.

**Works with any language** — the Platform SDK can be Python, Go, Java, or anything else.

### 3. Multi-language monorepo

Your monorepo has client SDKs in multiple languages that mirror an upstream API:

```json
// sdk-sync.config.json in /clients/python/
{ "upstream": "company/api-spec", "ecosystem": "pip" }

// sdk-sync.config.json in /clients/go/
{ "upstream": "company/api-spec", "ecosystem": "go" }
```

Run `sdk-sync` in each client directory to keep all SDKs aligned with the spec.

### 4. Open-source library migration

You depend on an open-source library that's being rewritten (v2 → v3). Track the upstream rewrite branch to understand what's changing in the public API before migration day:

```bash
npx sdk-sync init some-org/library
# Edit config: "branch": "v3-rewrite"
npx sdk-sync diff
# Review sync/report.md to understand breaking changes
```

### 5. Vendor lock-in prevention

You vendor a cloud provider's SDK to add an abstraction layer. Monitor upstream for new features you want to surface, and breaking changes that would affect your abstraction:

```bash
npx sdk-sync init aws/aws-sdk-js-v3
npx sdk-sync report
# Check sync/contract.diff.json for new services/methods
```

### 6. Compliance & audit trail

In regulated industries, every change to a dependency must be documented. `sdk-sync` generates `sync/report.md` with a full diff of every export and method change, with timestamps and commit SHAs — ready for audit.

---

## Generated files

```
sync/
├── upstream.json            ← last synced SHA + timestamp
├── upstream.contract.json   ← upstream API surface
├── local.contract.json      ← local fork API surface
├── contract.diff.json       ← set differences
└── report.md                ← human-readable report
```

---

## Safety thresholds

| Threshold | Default | Auto-applies if… |
|-----------|---------|-----------------|
| `maxFiles` | 20 | ≤ 20 files changed |
| `maxLoc` | 600 | ≤ 600 lines changed |
| Breaking changes | 0 | Zero removed exports or methods |

If **any** threshold is exceeded → `sync/report.md` is generated and status is `investigation_required`.

---

## Library API

```js
import { syncUpstream } from '@nometria-ai/sdk-upstream-sync';

const result = await syncUpstream({
  upstream: 'org/sdk',
  branch: 'main',
  ecosystem: 'pip',     // or 'npm', 'go', etc.
  maxFiles: 20,
  maxLoc: 600,
});

console.log(result.status);
// 'auto_applied' | 'investigation_required' | 'already_up_to_date'
```

---

## Contributing

PRs welcome. Run tests with `npm test`.

---

## License

MIT © [Nometria](https://nometria.com)
