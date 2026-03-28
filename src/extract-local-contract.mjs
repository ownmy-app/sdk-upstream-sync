/**
 * Extract API contract from local codebase.
 *
 * Walks the source tree, delegates to the ecosystem extractor for
 * language-specific export/method detection.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { getEcosystem } from './ecosystems/index.mjs';

/**
 * @param {object} opts
 * @param {string} opts.localPath   — root of the local fork
 * @param {string} opts.ecosystem   — npm | pip | go | cargo | maven | nuget
 * @param {string[]} opts.ignore    — glob-like prefixes to skip
 */
export function extractLocalContract(opts = {}) {
  const localPath = opts.localPath || process.cwd();
  const eco = getEcosystem(opts.ecosystem || 'npm');
  const extensions = eco.fileExtensions();
  const ignore = opts.ignore || [];

  const contract = { exports: [], modules: {}, methods: [] };
  const allExports = new Set();
  const allMethods = [];

  // Walk the directory tree
  walkDir(localPath, (filePath, relPath) => {
    const ext = extname(filePath);
    if (!extensions.has(ext)) return;

    // Skip ignored paths
    for (const ig of ignore) {
      const prefix = ig.replace(/\*\*/g, '').replace(/\*/g, '').replace(/\/$/, '');
      if (relPath.startsWith(prefix) || relPath.includes(`/${prefix}`)) return;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const exports = eco.extractExports(content, relPath);
      exports.forEach(e => allExports.add(e));
      const methods = eco.extractMethods(content);
      allMethods.push(...methods);
    } catch {
      // Skip unreadable files
    }
  });

  contract.exports = [...allExports];
  contract.methods = allMethods;

  for (const m of allMethods) {
    if (!contract.modules[m.module]) contract.modules[m.module] = [];
    contract.modules[m.module].push(m.method);
  }

  return contract;
}

function walkDir(dir, callback, rootDir = dir) {
  const SKIP = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.tox', 'target', 'bin', 'obj', 'vendor']);

  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      walkDir(full, callback, rootDir);
    } else if (stat.isFile()) {
      const relPath = full.slice(rootDir.length + 1);
      callback(full, relPath);
    }
  }
}
