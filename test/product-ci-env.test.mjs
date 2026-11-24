// Product code never reads the CI runner's environment (#560, the design session): the engine and service under test
// must behave in a hosted sitting exactly as they do for a user, so only harness code (scripts/, test/, .github/) may
// read RUNNER_ENVIRONMENT or GITHUB_ACTIONS. The product is what ships (package.json `files`, which includes a few
// harness-adjacent scripts the package carries) plus the plugin's own trees (hooks/, relay/), JS and Swift alike. A Swift
// package's own test target (native/<package>/Tests, XCTest, never built into the shipped engine) is harness code too:
// #582's hosted-only canary there skips off the runner by RUNNER_ENVIRONMENT.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CI_ENV = /\b(RUNNER_ENVIRONMENT|GITHUB_ACTIONS)\b/;
const SOURCE = /\.(mjs|cjs|js|ts|swift|sh|m|h)$/;
const SKIP_DIRS = new Set(['node_modules', '.build', 'build', 'DerivedData']);
// A Swift package's test target under native/ (native/<package>/Tests): not shipped, so not the product.
const isNativeTests = (root, path) => /^native\/[^/]+\/Tests$/.test(relative(root, path));

export function productRoots(root = ROOT) {
  const files = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).files ?? [];
  return [...new Set([...files.map(f => f.replace(/\/$/, '')), 'src', 'native', 'bin', 'hooks', 'relay'])].filter(p => existsSync(join(root, p)));
}

function* sources(path, root) {
  const st = statSync(path);
  if (st.isFile()) { if (SOURCE.test(path)) yield path; return; }
  if (isNativeTests(root, path)) return;
  for (const name of readdirSync(path)) if (!SKIP_DIRS.has(name)) yield* sources(join(path, name), root);
}

// Each read of the CI environment in the product, as file:line and the line. -> [string].
export function ciEnvReads(root = ROOT, roots = productRoots(root)) {
  const out = [];
  for (const top of roots) for (const file of sources(join(root, top), root)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => { if (CI_ENV.test(line)) out.push(`${relative(root, file)}:${i + 1}: ${line.trim()}`); });
  }
  return out;
}

test('no product file (shipped files, src, native, bin, hooks, relay; JS and Swift) reads RUNNER_ENVIRONMENT or GITHUB_ACTIONS', () => {
  const roots = productRoots();
  assert.ok(roots.includes('src') && roots.includes('native') && roots.includes('bin'), roots.join(', '));
  const reads = ciEnvReads();
  assert.deepEqual(reads, [], `product code reads the CI runner's environment; only scripts/, test/ and .github/ may:\n${reads.join('\n')}`);
});

test('the scan names a planted read in JS and in Swift by file and line, and ignores harness trees', () => {
  const root = mkdtempSync(join(tmpdir(), 'cua-ci-env-'));
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({files: ['src/', 'cua-shim.mjs']}));
    mkdirSync(join(root, 'src'), {recursive: true});
    mkdirSync(join(root, 'native', 'Sources'), {recursive: true});
    mkdirSync(join(root, 'native', 'engine', 'Tests', 'EngineTests'), {recursive: true});
    mkdirSync(join(root, 'native', 'engine', 'Sources'), {recursive: true});
    mkdirSync(join(root, 'scripts'), {recursive: true});
    writeFileSync(join(root, 'src', 'a.mjs'), 'const x = 1;\nif (process.env.RUNNER_ENVIRONMENT) x;\n');
    writeFileSync(join(root, 'native', 'Sources', 'B.swift'), 'let e = ProcessInfo.processInfo.environment["GITHUB_ACTIONS"]\n');
    writeFileSync(join(root, 'native', 'engine', 'Tests', 'EngineTests', 'T.swift'), 'let e = ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"]\n');
    writeFileSync(join(root, 'native', 'engine', 'Sources', 'C.swift'), 'let e = ProcessInfo.processInfo.environment["RUNNER_ENVIRONMENT"]\n');
    writeFileSync(join(root, 'cua-shim.mjs'), '// clean\n');
    writeFileSync(join(root, 'scripts', 'harness.mjs'), 'process.env.RUNNER_ENVIRONMENT;\n');
    assert.deepEqual(ciEnvReads(root).map(r => r.slice(0, r.indexOf(': '))).sort(), ['native/Sources/B.swift:1', 'native/engine/Sources/C.swift:1', 'src/a.mjs:2']);
  } finally { rmSync(root, {recursive: true, force: true}); }
});
