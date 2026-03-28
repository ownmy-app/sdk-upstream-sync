#!/usr/bin/env node
/**
 * sdk-sync — contract-aware fork maintenance tool.
 *
 * Subcommands:
 *   (none)    Run a sync (default)
 *   init      Create sdk-sync.config.json with defaults
 *   diff      Show contract diff without applying
 *   report    Generate report only
 *   --help    Show usage
 *
 * Config priority: CLI flags → env vars → sdk-sync.config.json → defaults
 */

import { loadConfig, initConfig, detectEcosystem } from './config.mjs';
import { extractUpstreamContract } from './extract-upstream-contract.mjs';
import { extractLocalContract } from './extract-local-contract.mjs';
import { diffContracts } from './diff-contracts.mjs';
import { applySelectiveUpdates } from './apply-selective-updates.mjs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ── Parse CLI ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const subcommand = (args[0] && !args[0].startsWith('-')) ? args[0] : 'sync';

if (args.includes('--help') || args.includes('-h')) {
  console.log(`sdk-sync — contract-aware fork maintenance

Usage:
  npx sdk-sync              Sync your fork with upstream (default)
  npx sdk-sync init [repo]  Create sdk-sync.config.json
  npx sdk-sync diff         Show contract diff without applying
  npx sdk-sync report       Generate sync/report.md only

Options (env vars or sdk-sync.config.json):
  upstream       Upstream GitHub repo, e.g. "org/sdk"   (required)
  branch         Upstream branch to track               (default: main)
  ecosystem      auto|npm|pip|go|cargo|maven|nuget      (default: auto)
  maxFiles       Auto-apply threshold: max files        (default: 20)
  maxLoc         Auto-apply threshold: max LOC          (default: 600)
  ignore         Glob patterns to skip                  (default: [])

One-time setup:
  npx sdk-sync init stripe/stripe-node
  npx sdk-sync

That's it. The config file stores everything so you never need env vars.

Supported ecosystems:
  npm     JS / TS (export function, module.exports, class methods)
  pip     Python  (__all__, def, class, __init__.py re-exports)
  go      Go      (uppercase exported identifiers)
  cargo   Rust    (pub fn, pub struct, pub trait, impl methods)
  maven   Java/Kotlin (public class, interface, methods)
  nuget   C# / .NET  (public class, interface, properties, methods)
`);
  process.exit(0);
}

// ── Init subcommand ──────────────────────────────────────────────────────────
if (subcommand === 'init') {
  const upstream = args[1] || null;
  initConfig(upstream);
  process.exit(0);
}

// ── Load config ──────────────────────────────────────────────────────────────
const config = loadConfig();

if (!config.upstream) {
  console.error('❌ No upstream repo configured.');
  console.error('   Run:  npx sdk-sync init org/repo-name');
  console.error('   Or:   export UPSTREAM_REPO=org/repo-name');
  process.exit(1);
}

// Resolve ecosystem
if (config.ecosystem === 'auto') {
  config.ecosystem = detectEcosystem(config.localPath || '.');
  console.log(`🔍 Detected ecosystem: ${config.ecosystem}`);
}

const SYNC_DIR     = join(config.syncDir || '.', config.syncDir?.startsWith('/') ? '' : 'sync').replace(/\/sync\/sync/, '/sync');
const syncDir      = config.syncDir?.includes('sync') ? config.syncDir : join(config.syncDir || '.', 'sync');
const UPSTREAM_JSON = join(syncDir, 'upstream.json');

// ── Main sync ────────────────────────────────────────────────────────────────
async function main() {
  console.log(`🔄 sdk-sync — ${config.upstream} (${config.ecosystem})`);

  if (!existsSync(syncDir)) mkdirSync(syncDir, { recursive: true });

  // Read last synced SHA
  let lastSyncedSha = null;
  if (existsSync(UPSTREAM_JSON)) {
    try {
      lastSyncedSha = JSON.parse(readFileSync(UPSTREAM_JSON, 'utf-8')).sha;
    } catch { /* ignore */ }
  }

  // Fetch latest upstream SHA
  console.log('📥 Fetching upstream...');
  const latestSha = await fetchLatestSha();

  if (latestSha === lastSyncedSha && subcommand === 'sync') {
    console.log('✅ Already up to date.');
    return { status: 'already_up_to_date' };
  }

  console.log(`📊 ${lastSyncedSha?.substring(0, 7) || 'initial'} → ${latestSha.substring(0, 7)}`);

  // Extract contracts
  console.log('🔍 Extracting upstream contract...');
  const upstreamContract = await extractUpstreamContract(config.upstream, latestSha, {
    ecosystem: config.ecosystem,
    ignore: config.ignore,
    githubToken: config.githubToken,
  });

  console.log('🔍 Extracting local contract...');
  const localContract = extractLocalContract({
    localPath: config.localPath,
    ecosystem: config.ecosystem,
    ignore: config.ignore,
  });

  // Save contracts
  writeFileSync(join(syncDir, 'upstream.contract.json'), JSON.stringify(upstreamContract, null, 2));
  writeFileSync(join(syncDir, 'local.contract.json'), JSON.stringify(localContract, null, 2));

  // Diff
  console.log('🔎 Computing diff...');
  const diff = diffContracts(upstreamContract, localContract);
  writeFileSync(join(syncDir, 'contract.diff.json'), JSON.stringify(diff, null, 2));

  // Report
  const report = generateReport(diff, lastSyncedSha, latestSha);
  writeFileSync(join(syncDir, 'report.md'), report);
  console.log(`📄 Report: ${syncDir}/report.md`);

  // Print summary
  printSummary(diff);

  if (subcommand === 'diff' || subcommand === 'report') {
    return { status: 'report_generated' };
  }

  // Check thresholds
  const thresholds = checkThresholds(diff);

  if (thresholds.safe) {
    console.log('✅ Safe — applying updates...');
    await applySelectiveUpdates(diff);
    writeFileSync(UPSTREAM_JSON, JSON.stringify({ sha: latestSha, syncedAt: new Date().toISOString() }));
    console.log('🎉 Sync complete.');
    return { status: 'auto_applied', sha: latestSha };
  } else {
    console.log('⚠️  Exceeds safety thresholds — review sync/report.md');
    return { status: 'investigation_required', sha: latestSha, thresholds };
  }
}

async function fetchLatestSha() {
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (config.githubToken) headers.Authorization = `Bearer ${config.githubToken}`;
  const res = await fetch(
    `https://api.github.com/repos/${config.upstream}/commits/${config.branch}`,
    { headers }
  );
  if (!res.ok) throw new Error(`Failed to fetch ${config.upstream}@${config.branch}: ${res.status}`);
  return (await res.json()).sha;
}

function checkThresholds(diff) {
  const fileCount  = diff.filesChanged?.length || 0;
  const locChanged = diff.locChanged || 0;
  const hasBreaking = diff.breakingChanges?.length > 0;

  return {
    safe: fileCount <= config.maxFiles && locChanged <= config.maxLoc && !hasBreaking,
    fileCount, locChanged, hasBreaking,
    thresholds: { maxFiles: config.maxFiles, maxLoc: config.maxLoc },
  };
}

function printSummary(diff) {
  const ex = diff.newExports?.length || 0;
  const rm = diff.removedExports?.length || 0;
  const nm = diff.newMethods?.length || 0;
  const rmm = diff.removedMethods?.length || 0;
  const brk = diff.breakingChanges?.length || 0;

  console.log('');
  console.log(`  New exports:      +${ex}`);
  console.log(`  Removed exports:  -${rm}`);
  console.log(`  New methods:      +${nm}`);
  console.log(`  Removed methods:  -${rmm}`);
  if (brk > 0) console.log(`  ⚠️  Breaking:      ${brk}`);
  console.log('');
}

function generateReport(diff, lastSha, currentSha) {
  return `# Upstream Sync Report

**Date**: ${new Date().toISOString()}
**Upstream**: ${config.upstream}@${config.branch}
**Ecosystem**: ${config.ecosystem}
**From**: ${lastSha?.substring(0, 7) || 'initial'}
**To**: ${currentSha.substring(0, 7)}

## Summary

| Metric | Count |
|--------|-------|
| New Exports | ${diff.newExports?.length || 0} |
| Removed Exports | ${diff.removedExports?.length || 0} |
| New Methods | ${diff.newMethods?.length || 0} |
| Removed Methods | ${diff.removedMethods?.length || 0} |
| Breaking Changes | ${diff.breakingChanges?.length || 0} |

## New Exports

${(diff.newExports || []).map(e => `- \`${e}\``).join('\n') || 'None'}

## Removed Exports (Breaking)

${(diff.removedExports || []).map(e => `- \`${e}\``).join('\n') || 'None'}

## New Methods

${(diff.newMethods || []).map(m => `- \`${m.module}.${m.method}\``).join('\n') || 'None'}

## Breaking Changes

${(diff.breakingChanges || []).map(b => `- ${b.description}`).join('\n') || 'None'}

## Action Required

${diff.breakingChanges?.length > 0 ? '⚠️ **Breaking changes detected** — manual review required before applying.' : '✅ Safe to apply automatically.'}
`;
}

// ── Export for library use ───────────────────────────────────────────────────
export { main as syncUpstream };

main().catch(err => {
  console.error('❌', err.message || err);
  process.exit(1);
});
