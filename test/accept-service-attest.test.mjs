// The live runners (scripts/accept/linux-chrome*.mjs, maws-features.mjs) attest which browser service answered: the
// selected browser's documentation carries the "# Selected Browser" header on both services and the marker
// `cua browser service <version>` only on cua's (docs/doperpowers/specs/2026-10-13-own-browser-service-design.md, M4).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DOCUMENTATION_CELL, serviceAttestation} from '../scripts/accept/service-attest.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';
import {writeCuaRecord, writeVendorRecord} from './fixtures/route-records.mjs';

const vendorDoc = '# Selected Browser\n\n- Name: Chrome\n';
const cuaDoc = '# Selected Browser\n\n- Name: Chrome\n- Service: cua browser service 0.1.0\n';

// The expected service is the launch's own resolution (src/runtime/launch.mjs browserServiceFor): CUA_BROWSER_SERVICE
// when set, else the home's active route (cua's on the cua route or in MAWS client mode, the vendor's otherwise).
function homes(t) {
  const make = write => {
    const s = scratch();
    t.after(s.cleanup);
    write?.(s.dir);
    return s.dir;
  };
  return {unregistered: make(), vendorRoute: make(writeVendorRecord), cuaRoute: make(writeCuaRecord)};
}

test('unset or empty, the expected service is the home\'s route default: cua\'s on the cua route or in MAWS, the vendor\'s otherwise', t => {
  const {unregistered, vendorRoute, cuaRoute} = homes(t);
  for (const value of [undefined, '']) {
    const env = value === undefined ? {} : {CUA_BROWSER_SERVICE: value};
    assert.deepEqual(serviceAttestation(cuaDoc, {env, home: cuaRoute}), {ok: true, detail: {requested: 'cua', served: 'cua browser service 0.1.0'}});
    assert.deepEqual(serviceAttestation(vendorDoc, {env, home: cuaRoute}), {ok: false, detail: {requested: 'cua', served: 'vendor'}});
    for (const home of [unregistered, vendorRoute]) {
      assert.deepEqual(serviceAttestation(vendorDoc, {env, home}), {ok: true, detail: {requested: 'vendor', served: 'vendor'}});
      assert.equal(serviceAttestation(cuaDoc, {env, home}).ok, false);
      assert.equal(serviceAttestation(cuaDoc, {env: {...env, CUA_BROWSER_BACKENDS: '/maws/a.sock'}, home}).ok, true, 'MAWS client mode: cua');
    }
  }
});

test('a named service is expected whatever the route', t => {
  const {unregistered, cuaRoute} = homes(t);
  assert.deepEqual(serviceAttestation(cuaDoc, {env: {CUA_BROWSER_SERVICE: 'cua'}, home: unregistered}), {ok: true, detail: {requested: 'cua', served: 'cua browser service 0.1.0'}});
  assert.deepEqual(serviceAttestation(vendorDoc, {env: {CUA_BROWSER_SERVICE: 'vendor'}, home: cuaRoute}), {ok: true, detail: {requested: 'vendor', served: 'vendor'}});
  assert.equal(serviceAttestation(cuaDoc, {env: {CUA_BROWSER_SERVICE: 'vendor'}, home: cuaRoute}).ok, false);
});

test('the home defaults to the one the runner\'s cua serve uses: CUA_HOME', t => {
  const {cuaRoute} = homes(t);
  assert.equal(serviceAttestation(cuaDoc, {env: {CUA_HOME: cuaRoute}}).ok, true);
});

test('text without the selected-browser header attests nothing', () => {
  assert.deepEqual(serviceAttestation('Browser is not available', {env: {CUA_BROWSER_SERVICE: 'cua'}}), {ok: false, detail: {requested: 'cua', served: null}});
});

test('the documentation cell selects the named instance, or the default browser when none is named', () => {
  assert.match(DOCUMENTATION_CELL('abc'), /cua\.getBrowser\(\{"extensionInstanceId":"abc"\}\)/);
  assert.match(DOCUMENTATION_CELL(), /cua\.getBrowser\(\)/);
  assert.match(DOCUMENTATION_CELL(), /nodeRepl\.write\(await \w+\.documentation\(\)\)/);
});
