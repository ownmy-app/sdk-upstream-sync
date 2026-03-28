/**
 * Java / Maven / Gradle ecosystem — contract extraction.
 *
 * Scans for: public class, public interface, public enum, public methods.
 */

const JAVA_EXTENSIONS = new Set(['.java', '.kt', '.kts']);

export function extractExports(content, filePath = '') {
  if (filePath.includes('/test/') || filePath.includes('Test.java')) return [];

  const exports = new Set();

  // public class/interface/enum/record
  const typeRe = /public\s+(?:abstract\s+|final\s+)?(?:class|interface|enum|record)\s+(\w+)/g;
  let m;
  while ((m = typeRe.exec(content)) !== null) exports.add(m[1]);

  // Kotlin: class Foo (no access modifier = public)
  if (filePath.endsWith('.kt') || filePath.endsWith('.kts')) {
    const ktRe = /^(?:data\s+)?class\s+(\w+)/gm;
    while ((m = ktRe.exec(content)) !== null) exports.add(m[1]);
    const ktFnRe = /^fun\s+(\w+)/gm;
    while ((m = ktFnRe.exec(content)) !== null) exports.add(m[1]);
  }

  return [...exports];
}

export function extractMethods(content) {
  const methods = [];
  // public ReturnType methodName(…)
  const methodRe = /public\s+(?:static\s+)?(?:final\s+)?(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\(/g;
  // Need class context
  const classRe = /(?:public\s+)?(?:abstract\s+|final\s+)?(?:class|interface)\s+(\w+)/g;
  let className = 'Unknown';
  let cm;
  while ((cm = classRe.exec(content)) !== null) {
    className = cm[1];
  }
  let mm;
  while ((mm = methodRe.exec(content)) !== null) {
    if (!['if', 'for', 'while', 'switch', 'catch'].includes(mm[1])) {
      methods.push({ module: className, method: mm[1] });
    }
  }
  return methods;
}

export function fileExtensions() {
  return JAVA_EXTENSIONS;
}

export function getEntryGlobs() {
  return ['src/main/**/*.java', 'src/main/**/*.kt'];
}
