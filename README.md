# sdk-upstream-sync

[![npm version](https://img.shields.io/npm/v/%40nometria-ai%2Fsdk-upstream-sync.svg)](https://www.npmjs.com/package/@nometria-ai/sdk-upstream-sync)
[![npm downloads](https://img.shields.io/npm/dm/%40nometria-ai%2Fsdk-upstream-sync.svg)](https://www.npmjs.com/package/@nometria-ai/sdk-upstream-sync)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![GitHub Marketplace](https://img.shields.io/badge/GitHub-Marketplace-blue)](https://github.com/marketplace)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> Contract-aware fork maintenance. Auto-applies safe upstream changes. Flags breaking ones.

If you maintain a fork of any npm/GitHub SDK, you know the pain: upstream ships changes, your fork drifts, you find out when something breaks in production. This tool solves it with a safety gate — it diffs API contracts, auto-applies small safe changes, and generates an investigation report for everything risky.

---

## Quick start

```bash
# Install
npm install --save-dev @nometria-ai/sdk-upstream-sync

# Set required env vars
export UPSTREAM_REPO=original-org/javascript-sdk
export GITHUB_TOKEN=ghp_...   # for API access

# Run sync from your fork directory
npx sdk-upstream-sync

# Or add to package.json scripts:
# "sync": "UPSTREAM_REPO=original-org/sdk node src/upstream-sync.mjs"
```

Required environment variables:
```bash
UPSTREAM_REPO=org/sdk-name          # required: upstream GitHub repo
GITHUB_TOKEN=ghp_...                # recommended: avoids rate limits
UPSTREAM_BRANCH=main                # optional, default: main
MAX_FILES=20                        # optional, auto-apply threshold
MAX_LOC=600                         # optional, auto-apply threshold
```

---

## How it works

1. **Fetch** upstream SHA — exits cleanly if already synced
2. **Extract contracts** — reads exports, methods, and module structure from both upstream and your local fork via the GitHub API
3. **Diff contracts** — detects removed exports/methods as breaking changes, new ones as safe additions
4. **Check thresholds** — auto-applies if: ≤ 20 files changed, ≤ 600 LOC, zero breaking changes
5. **Apply or report** — patches your fork directly, or generates `sync/report.md` for manual review

---

## GitHub Action (recommended)

The easiest way to use `sdk-upstream-sync` is as a scheduled GitHub Action:

```yaml
# .github/workflows/sync-upstream.yml
name: Sync upstream SDK

on:
  schedule:
    - cron: '0 9 * * 1'    # every Monday at 9am
  workflow_dispatch:         # allow manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: nometria/sdk-upstream-sync@v1
        with:
          upstream_repo: 'original-org/javascript-sdk'
          upstream_branch: 'main'
          local_path: './lib'
          max_files: '20'
          max_loc: '600'
          create_pr: 'true'
          github_token: ${{ secrets.GITHUB_TOKEN }}
```

### Action inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `upstream_repo` | yes | — | Upstream GitHub repo (`org/repo`) |
| `upstream_branch` | no | `main` | Branch to track |
| `local_path` | no | `.` | Path to your local fork directory |
| `max_files` | no | `20` | Max files changed for auto-apply |
| `max_loc` | no | `600` | Max lines changed for auto-apply |
| `create_pr` | no | `false` | Open a PR instead of committing directly |
| `github_token` | no | `${{ github.token }}` | Token for API access and PR creation |

### Action outputs

| Output | Description |
|--------|-------------|
| `synced` | `true` if changes were applied |
| `status` | `already_up_to_date` \| `auto_applied` \| `investigation_required` \| `error` |
| `report_path` | Path to the generated sync report |

---

## CLI

```bash
# Install globally
npm install -g @nometria-ai/sdk-upstream-sync

# Or run without installing
npx @nometria-ai/sdk-upstream-sync
```

### Usage

```bash
# Run from your fork directory
UPSTREAM_REPO=original-org/javascript-sdk npx sdk-upstream-sync

# With all options
UPSTREAM_REPO=original-org/javascript-sdk \
  UPSTREAM_BRANCH=main \
  LOCAL_MIRROR_DIR=./lib \
  MAX_FILES=20 \
  MAX_LOC=600 \
  node src/upstream-sync.mjs
```

### Environment variables

```bash
export UPSTREAM_REPO=original-org/javascript-sdk
export UPSTREAM_BRANCH=main
export LOCAL_MIRROR_DIR=./lib
export MAX_FILES=20
export MAX_LOC=600
export GITHUB_TOKEN=ghp_...    # for private repos and higher rate limits
export SYNC_DIR=./sync         # where contract/report files are written (default: ./sync)
```

---

## Generated files

After each run, `sdk-upstream-sync` writes to `sync/`:

```
sync/
├── upstream.json           ← last synced SHA (used for change detection)
├── upstream.contract.json  ← upstream API surface (exports, methods)
├── local.contract.json     ← local fork API surface
├── contract.diff.json      ← set differences (added/removed exports & methods)
└── report.md               ← human-readable investigation report
```

---

## Safety thresholds

| Threshold | Default | Auto-applies if… |
|-----------|---------|-----------------|
| `max_files` | 20 | ≤ 20 files changed |
| `max_loc` | 600 | ≤ 600 lines changed |
| Breaking changes | 0 | Zero removed exports or methods |

If **any** threshold is exceeded → generates `sync/report.md` and exits with status `investigation_required` instead of applying changes.

---

## Use as a library

```js
import { syncUpstream } from '@nometria-ai/sdk-upstream-sync';
import { extractContract } from '@nometria-ai/sdk-upstream-sync/contracts';
import { diffContracts } from '@nometria-ai/sdk-upstream-sync/diff';

// Full sync
const result = await syncUpstream({
  upstreamRepo: 'original-org/javascript-sdk',
  upstreamBranch: 'main',
  localPath: './lib',
  maxFiles: 20,
  maxLoc: 600,
  githubToken: process.env.GITHUB_TOKEN,
});

console.log(result.status);   // 'auto_applied' | 'investigation_required' | 'already_up_to_date'
```

---

## When to use this

- You vendor or fork a third-party SDK and need to stay in sync with upstream
- Your fork adds proprietary patches on top of an open-source library
- You want automated weekly sync with safety gates instead of manual cherry-picking
- You want audit trails of every upstream change that affected your fork

---

## Contributing

PRs welcome. Run tests with `npm test`.

---

## License

MIT © [Nometria](https://nometria.com)

---

## Example output

Running `node --test tests/upstream-sync.test.mjs`:

```
✔ UPSTREAM_REPO env var is read correctly (0.380166ms)
✔ LOCAL_MIRROR_DIR defaults to ./sdk-mirror (0.063ms)
✔ MAX_FILES is parsed as integer (0.06675ms)
✔ MAX_LOC is parsed as integer (0.054833ms)
ℹ tests 4
ℹ suites 0
ℹ pass 4
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 59.318041
```

See `examples/sample-report.md` for a realistic sync report and `examples/sample-contract.json` for what a contract file looks like.
