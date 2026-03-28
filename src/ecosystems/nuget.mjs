/**
 * C# / .NET / NuGet ecosystem — contract extraction.
 *
 * Scans for: public class, public interface, public struct, public enum,
 *            public methods, public properties.
 */

const CS_EXTENSIONS = new Set(['.cs']);

export function extractExports(content, filePath = '') {
  if (filePath.includes('/Tests/') || filePath.includes('.Tests/') || filePath.endsWith('Test.cs')) return [];

  const exports = new Set();

  const typeRe = /public\s+(?:abstract\s+|sealed\s+|static\s+|partial\s+)*(?:class|interface|struct|enum|record)\s+(\w+)/g;
  let m;
  while ((m = typeRe.exec(content)) !== null) exports.add(m[1]);

  return [...exports];
}

export function extractMethods(content) {
  const methods = [];
  // Get class name
  const classRe = /public\s+(?:abstract\s+|sealed\s+|static\s+|partial\s+)*(?:class|interface)\s+(\w+)/g;
  let className = 'Unknown';
  let cm;
  while ((cm = classRe.exec(content)) !== null) className = cm[1];

  // public ReturnType MethodName(…)
  const methodRe = /public\s+(?:static\s+|virtual\s+|override\s+|async\s+)*(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\(/g;
  let mm;
  while ((mm = methodRe.exec(content)) !== null) {
    if (!['if', 'for', 'while', 'switch', 'catch', 'using'].includes(mm[1])) {
      methods.push({ module: className, method: mm[1] });
    }
  }

  // public Type PropertyName { get; set; }
  const propRe = /public\s+(?:\w+(?:<[^>]*>)?)\s+(\w+)\s*\{[^}]*get/g;
  while ((mm = propRe.exec(content)) !== null) {
    methods.push({ module: className, method: mm[1] });
  }

  return methods;
}

export function fileExtensions() {
  return CS_EXTENSIONS;
}

export function getEntryGlobs() {
  return ['src/**/*.cs', '**/*.cs'];
}
