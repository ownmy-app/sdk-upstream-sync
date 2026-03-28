/**
 * Rust / Cargo ecosystem — contract extraction.
 *
 * Scans for: pub fn, pub struct, pub enum, pub trait, pub mod, pub type.
 */

const RUST_EXTENSIONS = new Set(['.rs']);

export function extractExports(content, filePath = '') {
  if (filePath.includes('/tests/') || filePath.endsWith('_test.rs')) return [];

  const exports = new Set();

  const patterns = [
    /pub\s+(?:async\s+)?fn\s+(\w+)/g,
    /pub\s+struct\s+(\w+)/g,
    /pub\s+enum\s+(\w+)/g,
    /pub\s+trait\s+(\w+)/g,
    /pub\s+type\s+(\w+)/g,
    /pub\s+mod\s+(\w+)/g,
    /pub\s+const\s+(\w+)/g,
    /pub\s+static\s+(\w+)/g,
  ];

  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(content)) !== null) exports.add(m[1]);
  }

  return [...exports];
}

export function extractMethods(content) {
  const methods = [];
  // impl Foo { pub fn bar(…) }
  const implRe = /impl(?:<[^>]*>)?\s+(\w+)[^{]*\{([\s\S]*?)\n\}/g;
  let im;
  while ((im = implRe.exec(content)) !== null) {
    const typeName = im[1];
    const body = im[2];
    const fnRe = /pub\s+(?:async\s+)?fn\s+(\w+)/g;
    let fm;
    while ((fm = fnRe.exec(body)) !== null) {
      methods.push({ module: typeName, method: fm[1] });
    }
  }
  return methods;
}

export function fileExtensions() {
  return RUST_EXTENSIONS;
}

export function getEntryGlobs() {
  return ['src/**/*.rs'];
}
