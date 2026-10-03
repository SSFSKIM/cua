// The production sky and browser services must load inside node_repl's trusted worker, which refuses to import any file whose
// real path lies outside NODE_REPL_TRUSTED_CODE_PATHS. This runs the service in a child Node with a copy of that
// resolve hook (pinned node_repl 26.928.40906, trusted-worker.js) and exactly the environment buildLaunch produces,
// so a new import outside the trusted directories fails here rather than only in a live runtime.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {mkdirSync, realpathSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
import {registerHooks} from 'node:module';
import {buildLaunch, SKY_SERVICE, BROWSER_SERVICE, SERVICE_SUPPORT_DIRS} from '../src/runtime/launch.mjs';
import {parsePin, runtimeFor} from '../src/runtime/manifest.mjs';
import {scratch, fixturePin} from './fixtures/runtime-fixture.mjs';

const SESSION = '6f1c2d3e-0000-4000-8000-000000000002';

const WORKER = `
import {registerHooks} from 'node:module';
import {realpathSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const trustedCodeRoots = (process.env.NODE_REPL_TRUSTED_CODE_PATHS ?? '').split(path.delimiter)
  .filter(entry => path.isAbsolute(entry))
  .flatMap(root => { try { return [realpathSync.native(root)]; } catch { return []; } });
const isTrustedCodePath = filename => trustedCodeRoots.some(root => {
  const relative = path.relative(root, filename);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
});
registerHooks({resolve(specifier, context, nextResolve) {
  const resolved = nextResolve(specifier, context);
  if (resolved.url.startsWith('file:')) {
    const filename = realpathSync.native(fileURLToPath(resolved.url));
    if (!isTrustedCodePath(filename)) throw new Error('Trusted RPC dependency must resolve within a configured trusted code path: ' + specifier);
    return {...resolved, url: pathToFileURL(filename).href};
  }
  return resolved;
}});
const out = [];
const [name, setup, reference] = JSON.parse(process.env.TRUST_TEST_REQUESTS);
try {
  const service = await import(pathToFileURL(JSON.parse(process.env.NODE_REPL_TRUSTED_SERVICES)[name]).href);
  out.push(await service.handleRpc(setup));
  try { await service.handleRpc(reference); }
  catch (error) { out.push({error: error.message}); }
} catch (error) { out.push({loadError: error.message}); }
process.stdout.write(JSON.stringify(out));
`;

const SKY_REQUESTS = ['sky', {type: 'setup'}, {type: 'execute', method: 'type_text', args: [{app: 'a', text: '{{secret:work-password}}'}]}];
const BROWSER_REQUESTS = ['browser', {method: 'setup', params: {}}, {method: 'executeWithRecovery', params: {type: 'playwright_locator_fill', browser_id: '1', tab_id: '2', selector: 's', value: '{{secret:work-password}}', replace: true}}];

function runWorker(env, requests = SKY_REQUESTS) {
  return new Promise((resolve, reject) => execFile(process.execPath, ['--input-type=module', '-e', WORKER], {env: {...env, TRUST_TEST_REQUESTS: JSON.stringify(requests)}, encoding: 'utf8'}, (error, stdout, stderr) => {
    if (error) return reject(new Error(`${error.message}\n${stderr}`));
    resolve(JSON.parse(stdout));
  }));
}

function launchWithFakeVendor(t, options = {}) {
  const s = scratch();
  t.after(s.cleanup);
  const home = realpathSync(s.dir);
  const runtime = runtimeFor({home, pin: parsePin(fixturePin({sha256: 'a'.repeat(64), length: 1})), record: null});
  mkdirSync(dirname(runtime.paths.skyVendorService), {recursive: true});
  writeFileSync(runtime.paths.skyVendorService, 'export async function handleRpc(request) { return {vendor: request.type}; }\n');
  mkdirSync(dirname(runtime.paths.browserVendorService), {recursive: true});
  writeFileSync(runtime.paths.browserVendorService, 'export async function handleRpc(request) { return {vendor: request.method}; }\n');
  return buildLaunch({runtime, home, sessionId: SESSION, ambient: {}, services: {sky: SKY_SERVICE}, ...options});
}

test('the production sky service and everything it imports load under exactly the launch\'s trusted paths', {skip: typeof registerHooks !== 'function'}, async t => {
  const {env} = launchWithFakeVendor(t, {secretsUnavailable: 'secrets_disabled'});
  const [setup, reference] = await runWorker(env);
  assert.deepEqual(setup, {vendor: 'setup'}, 'delegated to the vendor module named by CUA_SKY_VENDOR_SERVICE');
  assert.match(reference.error, /\[secrets_disabled\]$/, 'a reference fails closed with the launch\'s reason');
});

test('the hook copy is effective: without the owned secrets modules trusted, the service cannot load', {skip: typeof registerHooks !== 'function'}, async t => {
  const {env} = launchWithFakeVendor(t);
  const narrowed = env.NODE_REPL_TRUSTED_CODE_PATHS.split(':').filter(dir => !SERVICE_SUPPORT_DIRS.includes(dir)).join(':');
  const [result] = await runWorker({...env, NODE_REPL_TRUSTED_CODE_PATHS: narrowed});
  assert.match(result.loadError, /Trusted RPC dependency must resolve within a configured trusted code path/);
});

test('the production browser service and everything it imports load under exactly the launch\'s trusted paths', {skip: typeof registerHooks !== 'function'}, async t => {
  const {env} = launchWithFakeVendor(t, {surfaces: ['browser'], services: {browser: BROWSER_SERVICE}, secretsUnavailable: 'secrets_disabled'});
  const [setup, reference] = await runWorker(env, BROWSER_REQUESTS);
  assert.deepEqual(setup, {vendor: 'setup'}, 'delegated to the vendor module named by CUA_BROWSER_VENDOR_SERVICE');
  assert.match(reference.error, /\[secrets_disabled\]$/, 'a reference fails closed with the launch\'s reason');
  const narrowed = env.NODE_REPL_TRUSTED_CODE_PATHS.split(':').filter(dir => !SERVICE_SUPPORT_DIRS.includes(dir)).join(':');
  const [result] = await runWorker({...env, NODE_REPL_TRUSTED_CODE_PATHS: narrowed}, BROWSER_REQUESTS);
  assert.match(result.loadError, /Trusted RPC dependency must resolve within a configured trusted code path/);
});
