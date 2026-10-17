// The parity harnesses' test-only vendor oracle (vendor-oracle.mjs) against production launches (buildLaunch over a
// fixture runtime, nothing spawned), and the capability host's serve command for each lane (topology.mjs).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {buildLaunch, BROWSER_SERVICE, BROWSER_SERVICE_IMPL_DIR, SKY_SERVICE} from '../../src/runtime/launch.mjs';
import {parsePin, runtimeFor} from '../../src/runtime/manifest.mjs';
import {scratch, fixturePin} from '../fixtures/runtime-fixture.mjs';
import {oracleLaunch} from './vendor-oracle.mjs';
import {localCuaServeCommand} from '../../scripts/browser-parity/topology.mjs';

function vendorLaunch(t, {surfaces = ['browser'], services = {browser: BROWSER_SERVICE}} = {}) {
  const fixture = scratch('cua-vendor-oracle-');
  t.after(fixture.cleanup);
  const runtime = runtimeFor({home: fixture.dir, pin: parsePin(fixturePin({sha256: 'a'.repeat(64), length: 1})), record: null});
  const launch = buildLaunch({runtime, home: fixture.dir, sessionId: 'oracle', surfaces, services, ambient: {CUA_REPL_HOST: 'vendor'}});
  return {runtime, launch};
}

test('the vendor lane swaps the browser trusted service for the pinned vendor module and stops trusting cua\'s service directory', t => {
  const {runtime, launch} = vendorLaunch(t, {surfaces: ['computer', 'browser'], services: {sky: SKY_SERVICE, browser: BROWSER_SERVICE}});
  assert.equal(launch.replHost.host, 'vendor');
  const paths = launch.env.NODE_REPL_TRUSTED_CODE_PATHS.split(':');
  assert.ok(paths.includes(BROWSER_SERVICE_IMPL_DIR), 'production trusts cua\'s browser service with the browser surface');
  const oracle = oracleLaunch(launch, {runtime, service: 'vendor'});
  assert.deepEqual(JSON.parse(oracle.env.NODE_REPL_TRUSTED_SERVICES), {sky: SKY_SERVICE, browser: runtime.paths.browserVendorService});
  assert.deepEqual(oracle.env.NODE_REPL_TRUSTED_CODE_PATHS.split(':'), paths.filter(path => path !== BROWSER_SERVICE_IMPL_DIR));
  // The vendor module lies in the module tree every launch already trusts.
  assert.ok(runtime.paths.browserVendorService.startsWith(`${runtime.paths.moduleDir}/`));
  const rest = env => Object.fromEntries(Object.entries(env).filter(([key]) => !['NODE_REPL_TRUSTED_SERVICES', 'NODE_REPL_TRUSTED_CODE_PATHS'].includes(key)));
  assert.deepEqual(rest(oracle.env), rest(launch.env));
  assert.deepEqual({...oracle, env: null}, {...launch, env: null});
  assert.equal(JSON.parse(launch.env.NODE_REPL_TRUSTED_SERVICES).browser, BROWSER_SERVICE, 'the production launch is not changed in place');
});

test('the cua lane leaves the production launch as it is', t => {
  const {runtime, launch} = vendorLaunch(t);
  assert.equal(oracleLaunch(launch, {runtime, service: 'cua'}), launch);
});

test('the oracle refuses a lane other than vendor or cua, a REPL host other than the vendor\'s, and a launch without the browser service', t => {
  const {runtime, launch} = vendorLaunch(t);
  for (const service of [undefined, '', 'chatgpt']) assert.throws(() => oracleLaunch(launch, {runtime, service}), /must be vendor or cua/, String(service));
  assert.throws(() => oracleLaunch({...launch, replHost: {host: 'cua', reason: 'explicit'}}, {runtime, service: 'vendor'}), /only on the vendor REPL host: run its lane with CUA_REPL_HOST=vendor/);
  const computer = vendorLaunch(t, {surfaces: ['computer'], services: {sky: SKY_SERVICE}});
  assert.throws(() => oracleLaunch(computer.launch, {runtime: computer.runtime, service: 'vendor'}), /browser surface/);
});

test('the capability host serves the vendor lane through the oracle entry and the cua lane through cua serve itself', () => {
  const entry = name => fileURLToPath(new URL(name, import.meta.url));
  const at = {home: '/tmp/cua-cap-x', userHome: '/tmp/cua-cap-x/home'};
  const vendor = localCuaServeCommand({...at, service: 'vendor'}, {});
  assert.deepEqual(vendor.args, [entry('./serve-vendor-oracle.mjs')]);
  assert.equal(vendor.env.CUA_BROWSER_SERVICE, 'vendor');
  const cua = localCuaServeCommand({...at, service: 'cua'}, {});
  assert.deepEqual(cua.args, [entry('../../bin/cua.mjs'), 'serve']);
  assert.deepEqual({...vendor.env, CUA_BROWSER_SERVICE: 'cua'}, cua.env, 'the lanes differ in the entry and the lane name only');
});
