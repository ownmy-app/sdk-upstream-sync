/**
 * Config loader for sdk-upstream-sync.
 *
 * Priority:  CLI flags  →  env vars  →  config file  →  defaults
 *
 * Config file: sdk-sync.config.json (project root) or path in SDK_SYNC_CONFIG env.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const DEFAULTS = {
  upstream: null,           // e.g. "org/sdk-name"
  branch: 'main',
  localPath: '.',
  ecosystem: 'auto',       // auto | npm | pip | go | cargo | maven | nuget
  entryGlobs: [],          // override: which files to scan for exports (empty = auto-detect)
  ignore: [],              // glob patterns to skip during scan
  maxFiles: 20,
  maxLoc: 600,
  syncDir: './sync',
  githubToken: null,
  createPr: false,
};

const CONFIG_FILENAME = 'sdk-sync.config.json';

/** Locate config file walking up from cwd, or from env var. */
function findConfigFile() {
  if (process.env.SDK_SYNC_CONFIG) return process.env.SDK_SYNC_CONFIG;
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, CONFIG_FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = join(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** Load and merge config. */
export function loadConfig(cliFlags = {}) {
  let fileConfig = {};
  const configPath = findConfigFile();
  if (configPath) {
    try {
      fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch { /* ignore */ }
  }

  // Env var overrides (map env names to config keys)
  const envOverrides = {};
  if (process.env.UPSTREAM_REPO)   envOverrides.upstream    = process.env.UPSTREAM_REPO;
  if (process.env.UPSTREAM_BRANCH) envOverrides.branch      = process.env.UPSTREAM_BRANCH;
  if (process.env.LOCAL_PATH)      envOverrides.localPath   = process.env.LOCAL_PATH;
  if (process.env.ECOSYSTEM)       envOverrides.ecosystem   = process.env.ECOSYSTEM;
  if (process.env.MAX_FILES)       envOverrides.maxFiles    = parseInt(process.env.MAX_FILES, 10);
  if (process.env.MAX_LOC)         envOverrides.maxLoc      = parseInt(process.env.MAX_LOC, 10);
  if (process.env.SYNC_DIR)        envOverrides.syncDir     = process.env.SYNC_DIR;
  if (process.env.GITHUB_TOKEN)    envOverrides.githubToken = process.env.GITHUB_TOKEN;

  const merged = { ...DEFAULTS, ...fileConfig, ...envOverrides, ...cliFlags };

  // Normalise types
  merged.maxFiles = parseInt(merged.maxFiles, 10) || DEFAULTS.maxFiles;
  merged.maxLoc   = parseInt(merged.maxLoc, 10)   || DEFAULTS.maxLoc;
  merged.ignore   = Array.isArray(merged.ignore) ? merged.ignore : [];

  return merged;
}

/** Scaffold a default config file (sdk-sync init). */
export function initConfig(upstream) {
  const target = join(process.cwd(), CONFIG_FILENAME);
  if (existsSync(target)) {
    console.log(`⚠️  ${CONFIG_FILENAME} already exists — skipping.`);
    return target;
  }

  const cfg = {
    upstream: upstream || 'org/repo-name',
    branch: 'main',
    ecosystem: 'auto',
    ignore: ['node_modules/**', 'dist/**', '.git/**', '__pycache__/**'],
    maxFiles: 20,
    maxLoc: 600,
  };

  writeFileSync(target, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`✅ Created ${CONFIG_FILENAME}`);
  console.log('   Edit "upstream" to point at your upstream repo, then run:');
  console.log('   npx sdk-sync');
  return target;
}

/** Detect ecosystem from project files. */
export function detectEcosystem(localPath = '.') {
  const abs = (f) => join(localPath, f);
  if (existsSync(abs('package.json')))    return 'npm';
  if (existsSync(abs('pyproject.toml')) || existsSync(abs('setup.py')) || existsSync(abs('setup.cfg'))) return 'pip';
  if (existsSync(abs('go.mod')))          return 'go';
  if (existsSync(abs('Cargo.toml')))      return 'cargo';
  if (existsSync(abs('pom.xml')) || existsSync(abs('build.gradle')) || existsSync(abs('build.gradle.kts'))) return 'maven';
  if (existsSync(abs('*.csproj')) || existsSync(abs('*.sln'))) return 'nuget';
  return 'npm'; // fallback
}
