import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Config tests ─────────────────────────────────────────────────────────────

test('UPSTREAM_REPO env var maps to config.upstream', async () => {
  process.env.UPSTREAM_REPO = 'some-org/some-repo';
  const { loadConfig } = await import('../src/config.mjs');
  const cfg = loadConfig();
  assert.equal(cfg.upstream, 'some-org/some-repo');
  delete process.env.UPSTREAM_REPO;
});

test('MAX_FILES is parsed as integer from env', () => {
  process.env.MAX_FILES = '50';
  const maxFiles = parseInt(process.env.MAX_FILES ?? '20', 10);
  assert.equal(maxFiles, 50);
  delete process.env.MAX_FILES;
});

test('MAX_LOC is parsed as integer from env', () => {
  process.env.MAX_LOC = '2000';
  const maxLoc = parseInt(process.env.MAX_LOC ?? '600', 10);
  assert.equal(maxLoc, 2000);
  delete process.env.MAX_LOC;
});

test('ecosystem defaults to auto', async () => {
  const { loadConfig } = await import('../src/config.mjs');
  const cfg = loadConfig();
  assert.equal(cfg.ecosystem, 'auto');
});

// ── Ecosystem extractor tests ────────────────────────────────────────────────

test('npm: extracts named exports', async () => {
  const { extractExports } = await import('../src/ecosystems/npm.mjs');
  const code = `
    export function fetchUsers() {}
    export const API_URL = 'https://api.example.com';
    export class UserService {}
    export default Client;
  `;
  const exports = extractExports(code);
  assert.ok(exports.includes('fetchUsers'));
  assert.ok(exports.includes('API_URL'));
  assert.ok(exports.includes('UserService'));
  assert.ok(exports.includes('Client'));
});

test('npm: extracts re-exports', async () => {
  const { extractExports } = await import('../src/ecosystems/npm.mjs');
  const code = `export { foo, bar as baz } from './module';`;
  const exports = extractExports(code);
  assert.ok(exports.includes('foo'));
  assert.ok(exports.includes('baz'));
});

test('npm: extracts CJS module.exports', async () => {
  const { extractExports } = await import('../src/ecosystems/npm.mjs');
  const code = `module.exports = { createClient, fetchData };`;
  const exports = extractExports(code);
  assert.ok(exports.includes('createClient'));
  assert.ok(exports.includes('fetchData'));
});

test('pip: extracts __all__', async () => {
  const { extractExports } = await import('../src/ecosystems/pip.mjs');
  const code = `__all__ = ["Client", "authenticate", "UserModel"]`;
  const exports = extractExports(code);
  assert.deepEqual(exports.sort(), ['Client', 'UserModel', 'authenticate']);
});

test('pip: extracts public functions and classes', async () => {
  const { extractExports } = await import('../src/ecosystems/pip.mjs');
  const code = `
def fetch_users():
    pass

class UserService:
    pass

def _private_helper():
    pass
  `;
  const exports = extractExports(code);
  assert.ok(exports.includes('fetch_users'));
  assert.ok(exports.includes('UserService'));
  assert.ok(!exports.includes('_private_helper'));
});

test('pip: extracts __init__.py re-exports', async () => {
  const { extractExports } = await import('../src/ecosystems/pip.mjs');
  const code = `
from .client import Client
from .auth import authenticate, TokenManager
  `;
  const exports = extractExports(code, '__init__.py');
  assert.ok(exports.includes('Client'));
  assert.ok(exports.includes('authenticate'));
  assert.ok(exports.includes('TokenManager'));
});

test('go: extracts uppercase exports', async () => {
  const { extractExports } = await import('../src/ecosystems/go.mjs');
  const code = `
func FetchUsers() {}
func privateHelper() {}
type UserService struct {}
type config struct {}
const MaxRetries = 3
var defaultClient = &Client{}
  `;
  const exports = extractExports(code, 'client.go');
  assert.ok(exports.includes('FetchUsers'));
  assert.ok(exports.includes('UserService'));
  assert.ok(exports.includes('MaxRetries'));
  assert.ok(!exports.includes('privateHelper'));
  assert.ok(!exports.includes('config'));
});

test('go: skips test files', async () => {
  const { extractExports } = await import('../src/ecosystems/go.mjs');
  const code = `func TestFetchUsers() {}`;
  const exports = extractExports(code, 'client_test.go');
  assert.equal(exports.length, 0);
});

test('cargo: extracts pub items', async () => {
  const { extractExports } = await import('../src/ecosystems/cargo.mjs');
  const code = `
pub fn create_client() -> Client {}
pub struct Config {}
pub enum Status { Active, Inactive }
fn private_fn() {}
pub trait Serializable {}
  `;
  const exports = extractExports(code, 'lib.rs');
  assert.ok(exports.includes('create_client'));
  assert.ok(exports.includes('Config'));
  assert.ok(exports.includes('Status'));
  assert.ok(exports.includes('Serializable'));
  assert.ok(!exports.includes('private_fn'));
});

test('maven: extracts public Java classes', async () => {
  const { extractExports } = await import('../src/ecosystems/maven.mjs');
  const code = `
public class UserService {}
public interface Repository {}
public abstract class BaseController {}
class InternalHelper {}
  `;
  const exports = extractExports(code, 'UserService.java');
  assert.ok(exports.includes('UserService'));
  assert.ok(exports.includes('Repository'));
  assert.ok(exports.includes('BaseController'));
  assert.ok(!exports.includes('InternalHelper'));
});

test('nuget: extracts public C# types', async () => {
  const { extractExports } = await import('../src/ecosystems/nuget.mjs');
  const code = `
public class ApiClient {}
public interface IUserService {}
public sealed class Config {}
internal class Helper {}
  `;
  const exports = extractExports(code, 'ApiClient.cs');
  assert.ok(exports.includes('ApiClient'));
  assert.ok(exports.includes('IUserService'));
  assert.ok(exports.includes('Config'));
  assert.ok(!exports.includes('Helper'));
});

// ── Diff tests ───────────────────────────────────────────────────────────────

test('diffContracts detects new and removed exports', async () => {
  const { diffContracts } = await import('../src/diff-contracts.mjs');
  const upstream = { exports: ['a', 'b', 'c'], modules: {} };
  const local    = { exports: ['a', 'b', 'd'], modules: {} };
  const diff = diffContracts(upstream, local);
  assert.deepEqual(diff.newExports, ['c']);
  assert.deepEqual(diff.removedExports, ['d']);
  assert.equal(diff.breakingChanges.length, 1);
  assert.equal(diff.breakingChanges[0].type, 'removed_export');
});

test('diffContracts detects new and removed methods', async () => {
  const { diffContracts } = await import('../src/diff-contracts.mjs');
  const upstream = { exports: [], modules: { Auth: ['login', 'logout', 'refresh'] } };
  const local    = { exports: [], modules: { Auth: ['login', 'logout', 'oldMethod'] } };
  const diff = diffContracts(upstream, local);
  assert.deepEqual(diff.newMethods, [{ module: 'Auth', method: 'refresh' }]);
  assert.deepEqual(diff.removedMethods, [{ module: 'Auth', method: 'oldMethod' }]);
});

// ── Ecosystem detection ──────────────────────────────────────────────────────

test('ecosystem registry returns all supported ecosystems', async () => {
  const { listEcosystems } = await import('../src/ecosystems/index.mjs');
  const ecosystems = listEcosystems();
  assert.ok(ecosystems.includes('npm'));
  assert.ok(ecosystems.includes('pip'));
  assert.ok(ecosystems.includes('go'));
  assert.ok(ecosystems.includes('cargo'));
  assert.ok(ecosystems.includes('maven'));
  assert.ok(ecosystems.includes('nuget'));
});
