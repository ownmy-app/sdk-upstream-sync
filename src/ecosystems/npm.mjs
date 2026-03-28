/**
 * npm / JS / TS ecosystem — contract extraction.
 *
 * Scans for: export function, export const, export class, export default,
 *            module.exports, re-exports (export { … } from …).
 */

const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);

const EXPORT_PATTERNS = [
  /export\s+(?:async\s+)?function\s+(\w+)/g,
  /export\s+(?:const|let|var)\s+(\w+)/g,
  /export\s+class\s+(\w+)/g,
  /export\s+default\s+(?:class|function)?\s*(\w+)/g,
  /export\s+\{([^}]+)\}/g,                              // named re-exports
  /module\.exports\s*=\s*\{([^}]+)\}/g,                  // CJS
  /module\.exports\.(\w+)\s*=/g,                          // CJS individual
];

/** Extract public exports from a JS/TS source string. */
export function extractExports(content, filePath = '') {
  const exports = new Set();

  for (const pattern of EXPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(content)) !== null) {
      const raw = m[1];
      if (!raw) continue;
      // Named group: export { a, b as c }
      if (raw.includes(',')) {
        raw.split(',').forEach(tok => {
          const name = tok.trim().split(/\s+as\s+/).pop().trim();
          if (name && /^\w+$/.test(name)) exports.add(name);
        });
      } else {
        const name = raw.trim();
        if (/^\w+$/.test(name)) exports.add(name);
      }
    }
  }

  return [...exports];
}

/** Extract method signatures from class bodies. */
export function extractMethods(content) {
  const methods = [];
  // Match class Foo { ... } then find method names inside
  const classRe = /class\s+(\w+)[^{]*\{([\s\S]*?)\n\}/g;
  let cm;
  while ((cm = classRe.exec(content)) !== null) {
    const className = cm[1];
    const body = cm[2];
    const methodRe = /(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/g;
    let mm;
    while ((mm = methodRe.exec(body)) !== null) {
      if (mm[1] !== 'constructor') {
        methods.push({ module: className, method: mm[1] });
      }
    }
  }
  return methods;
}

/** Return file extensions this ecosystem cares about. */
export function fileExtensions() {
  return JS_EXTENSIONS;
}

/** Detect entry points from package.json. */
export function getEntryGlobs(pkgJson) {
  const globs = [];
  if (pkgJson?.main) globs.push(pkgJson.main);
  if (pkgJson?.module) globs.push(pkgJson.module);
  if (pkgJson?.exports) {
    const walk = (obj) => {
      if (typeof obj === 'string') { globs.push(obj); return; }
      if (obj && typeof obj === 'object') Object.values(obj).forEach(walk);
    };
    walk(pkgJson.exports);
  }
  // Fallback: scan src/
  if (globs.length === 0) globs.push('src/**/*.{js,mjs,ts,tsx}');
  return globs;
}
