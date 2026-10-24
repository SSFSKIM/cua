// The probe's controlled target must be trusted by the selected host, not just by the vendor host.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CUA_BOOTSTRAP_BANNER, CUA_API_DIR, CUA_API_DOCS_DIR, SKY_SERVICE, SERVICE_SUPPORT_DIRS} from '../src/runtime/launch.mjs';
import {kernelNode} from './repl-host/kernel-harness.mjs';
import {startHost, texts} from './repl-host/supervisor-harness.mjs';

const {node, skip} = kernelNode();
const hostDir = fileURLToPath(new URL('../src/repl-host', import.meta.url));

for (const host of ['cua', 'vendor']) test(`fake target extends only the ${host} host's trusted roots`, async () => {
  const {fakeSkyLaunch} = await import('../scripts/probe/fake-sky-launch.mjs');
  const key = host === 'cua' ? 'CUA_REPL_TRUSTED_CODE_PATHS' : 'NODE_REPL_TRUSTED_CODE_PATHS';
  const other = host === 'cua' ? 'NODE_REPL_TRUSTED_CODE_PATHS' : 'CUA_REPL_TRUSTED_CODE_PATHS';
  const launch = {replHost: {host}, env: {[key]: '/trusted/a:/trusted/b', [other]: '/not-selected', CUA_SKY_SERVICE: '/original/sky.mjs'}};
  const changed = fakeSkyLaunch(launch, '/probe/target/sky.mjs');
  assert.equal(changed.env[key], '/trusted/a:/trusted/b:/probe/target');
  assert.equal(changed.env[other], '/not-selected');
  assert.equal(changed.env.CUA_SKY_SERVICE, '/probe/target/sky.mjs');
  assert.equal(launch.env[key], '/trusted/a:/trusted/b', 'does not mutate the production launch');
});

test('own host bootstrap imports the controlled target; a vendor-only grant reproduces kernel exit 1', {skip}, async t => {
  const {fakeSkyLaunch} = await import('../scripts/probe/fake-sky-launch.mjs');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-probe-trust-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const target = join(root, 'target', 'sky.mjs');
  mkdirSync(dirname(target));
  writeFileSync(target, 'export async function handleRpc() { return {target: "mac", methods: []}; }');
  const original = {replHost: {host: 'cua'}, env: {
    CUA_REPL_TRUSTED_SERVICES: JSON.stringify({sky: SKY_SERVICE}), CUA_REPL_TRUSTED_RPC_ENABLED: '1', CUA_SECRETS_UNAVAILABLE: 'secrets_disabled',
    CUA_REPL_TRUSTED_CODE_PATHS: [hostDir, dirname(SKY_SERVICE), ...SERVICE_SUPPORT_DIRS, CUA_API_DIR, CUA_API_DOCS_DIR].join(':'),
    CUA_REPL_JS_BANNER: CUA_BOOTSTRAP_BANNER, CUA_REPL_ENABLED_SURFACES: 'computer',
    CUA_REPL_UNTRUSTED_ENV_ALLOWLIST: 'CUA_REPL_ENABLED_SURFACES',
  }};
  // This is the pre-fix probe's launch, not a mock of the import check.
  const broken = {...original.env, CUA_SKY_SERVICE: target, NODE_REPL_TRUSTED_CODE_PATHS: `undefined:${dirname(target)}`};
  const before = await startHost(t, {node, env: broken});
  const failed = await before.js('nodeRepl.write("ready")');
  assert.equal(failed.isError, true);
  const error = texts(failed).join('\n');
  assert.match(error, /Trusted RPC dependency must resolve within a configured trusted code path/);
  assert.match(texts(await before.js('nodeRepl.write("ready")')).join('\n'), /exited\(code=1\)/);
  const after = await startHost(t, {node, env: fakeSkyLaunch(original, target).env});
  const banner = await after.js('nodeRepl.write("banner")');
  assert.equal(banner.isError, false);
  assert.equal(texts(banner).at(-1), 'banner');
  assert.deepEqual(texts(await after.js('nodeRepl.write("ready")')), ['ready']);
});
