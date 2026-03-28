/**
 * Go ecosystem — contract extraction.
 *
 * In Go, anything starting with an uppercase letter is exported.
 */

const GO_EXTENSIONS = new Set(['.go']);

export function extractExports(content, filePath = '') {
  if (filePath.endsWith('_test.go')) return [];

  const exports = new Set();

  // func FooBar(…)
  const fnRe = /^func\s+([A-Z]\w*)\s*\(/gm;
  let m;
  while ((m = fnRe.exec(content)) !== null) exports.add(m[1]);

  // type FooBar struct/interface
  const typeRe = /^type\s+([A-Z]\w*)\s+(?:struct|interface)\s*\{/gm;
  while ((m = typeRe.exec(content)) !== null) exports.add(m[1]);

  // var/const FooBar
  const varRe = /^(?:var|const)\s+([A-Z]\w*)\s/gm;
  while ((m = varRe.exec(content)) !== null) exports.add(m[1]);

  return [...exports];
}

export function extractMethods(content) {
  const methods = [];
  // func (r *Receiver) Method(…)
  const methodRe = /^func\s+\(\w+\s+\*?(\w+)\)\s+([A-Z]\w*)\s*\(/gm;
  let m;
  while ((m = methodRe.exec(content)) !== null) {
    methods.push({ module: m[1], method: m[2] });
  }
  return methods;
}

export function fileExtensions() {
  return GO_EXTENSIONS;
}

export function getEntryGlobs() {
  return ['**/*.go'];
}
