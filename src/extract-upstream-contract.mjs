/**
 * Extract API contract from an upstream GitHub repository.
 *
 * Uses the GitHub Trees API to fetch file contents, then delegates to the
 * ecosystem extractor for language-specific export/method detection.
 */

import { getEcosystem } from './ecosystems/index.mjs';

/**
 * @param {string} repo     — "org/repo"
 * @param {string} sha      — commit SHA to inspect
 * @param {object} opts
 * @param {string} opts.ecosystem   — npm | pip | go | cargo | maven | nuget
 * @param {string[]} opts.ignore    — glob-like prefixes to skip
 * @param {string|null} opts.githubToken
 */
export async function extractUpstreamContract(repo, sha, opts = {}) {
  const eco = getEcosystem(opts.ecosystem || 'npm');
  const extensions = eco.fileExtensions();

  const contract = { exports: [], modules: {}, methods: [], version: sha };

  // Fetch the full tree
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (opts.githubToken) headers.Authorization = `Bearer ${opts.githubToken}`;

  const treeUrl = `https://api.github.com/repos/${repo}/git/trees/${sha}?recursive=1`;
  const treeRes = await fetch(treeUrl, { headers });

  if (!treeRes.ok) {
    console.warn(`⚠️  Could not fetch tree (${treeRes.status}). Falling back to shallow scan.`);
    return contract;
  }

  const tree = await treeRes.json();
  const files = (tree.tree || []).filter(f => {
    if (f.type !== 'blob') return false;
    const ext = '.' + f.path.split('.').pop();
    if (!extensions.has(ext)) return false;
    // Skip ignored prefixes
    for (const ig of (opts.ignore || [])) {
      if (f.path.startsWith(ig.replace('**', '').replace('*', ''))) return false;
    }
    return true;
  });

  // Fetch file contents in batches (limit concurrent requests)
  const BATCH = 10;
  const allExports = new Set();
  const allMethods = [];

  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (f) => {
        const url = `https://raw.githubusercontent.com/${repo}/${sha}/${f.path}`;
        try {
          const res = await fetch(url, { headers: opts.githubToken ? { Authorization: `Bearer ${opts.githubToken}` } : {} });
          if (!res.ok) return null;
          return { path: f.path, content: await res.text() };
        } catch {
          return null;
        }
      })
    );

    for (const r of results) {
      if (!r) continue;
      const exports = eco.extractExports(r.content, r.path);
      exports.forEach(e => allExports.add(e));
      const methods = eco.extractMethods(r.content);
      allMethods.push(...methods);
    }
  }

  contract.exports = [...allExports];
  contract.methods = allMethods;

  // Group methods by module
  for (const m of allMethods) {
    if (!contract.modules[m.module]) contract.modules[m.module] = [];
    contract.modules[m.module].push(m.method);
  }

  // Try to get version from package.json / pyproject.toml
  try {
    const pkgUrl = `https://raw.githubusercontent.com/${repo}/${sha}/package.json`;
    const pkgRes = await fetch(pkgUrl, { headers: opts.githubToken ? { Authorization: `Bearer ${opts.githubToken}` } : {} });
    if (pkgRes.ok) {
      const pkg = await pkgRes.json();
      if (pkg.version) contract.version = pkg.version;
    }
  } catch { /* ignore */ }

  return contract;
}
