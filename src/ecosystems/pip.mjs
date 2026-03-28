/**
 * pip / Python ecosystem — contract extraction.
 *
 * Scans for: __all__, public functions/classes (no _ prefix),
 *            __init__.py re-exports.
 */

const PY_EXTENSIONS = new Set(['.py', '.pyi']);

/** Extract public API from a Python source string. */
export function extractExports(content, filePath = '') {
  const exports = new Set();

  // 1) __all__ = ["Foo", "bar", …]
  const allMatch = content.match(/__all__\s*=\s*\[([^\]]+)\]/);
  if (allMatch) {
    allMatch[1].split(',').forEach(tok => {
      const name = tok.trim().replace(/['"]/g, '');
      if (name) exports.add(name);
    });
    return [...exports]; // if __all__ is defined, it IS the public API
  }

  // 2) Public functions: def foo(…)  (not _foo)
  const fnRe = /^def\s+([a-zA-Z]\w*)\s*\(/gm;
  let m;
  while ((m = fnRe.exec(content)) !== null) exports.add(m[1]);

  // 3) Public classes: class Foo(…):
  const clsRe = /^class\s+([A-Z]\w*)\s*[:(]/gm;
  while ((m = clsRe.exec(content)) !== null) exports.add(m[1]);

  // 4) from X import Y  (re-exports in __init__.py)
  if (filePath.endsWith('__init__.py') || filePath.endsWith('__init__.pyi')) {
    const importRe = /^from\s+\.\S*\s+import\s+(.+)/gm;
    while ((m = importRe.exec(content)) !== null) {
      m[1].split(',').forEach(tok => {
        const name = tok.trim().split(/\s+as\s+/).pop().trim();
        if (name && /^[A-Za-z]\w*$/.test(name)) exports.add(name);
      });
    }
  }

  return [...exports];
}

/** Extract public methods from class bodies. */
export function extractMethods(content) {
  const methods = [];
  const classRe = /^class\s+([A-Z]\w*)[^:]*:([\s\S]*?)(?=\nclass\s|\n[^\s]|\Z)/gm;
  let cm;
  while ((cm = classRe.exec(content)) !== null) {
    const className = cm[1];
    const body = cm[2];
    const methodRe = /^\s+def\s+([a-zA-Z]\w*)\s*\(self/gm;
    let mm;
    while ((mm = methodRe.exec(body)) !== null) {
      methods.push({ module: className, method: mm[1] });
    }
  }
  return methods;
}

export function fileExtensions() {
  return PY_EXTENSIONS;
}

export function getEntryGlobs() {
  return ['src/**/*.py', 'lib/**/*.py', '**/__init__.py'];
}
