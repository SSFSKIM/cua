// The live runners (scripts/accept/linux-chrome*.mjs, maws-features.mjs) attest which browser service answered: the
// selected browser's documentation carries the "# Selected Browser" header on both services and the marker
// `cua browser service <version>` only on cua's (docs/doperpowers/specs/2026-10-13-own-browser-service-design.md, M4).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DOCUMENTATION_CELL, serviceAttestation} from '../scripts/accept/service-attest.mjs';

const vendorDoc = '# Selected Browser\n\n- Name: Chrome\n';
const cuaDoc = '# Selected Browser\n\n- Name: Chrome\n- Service: cua browser service 0.1.0\n';

test('the cua selection passes only when cua\'s marker is in the documentation', () => {
  assert.deepEqual(serviceAttestation(cuaDoc, {CUA_BROWSER_SERVICE: 'cua'}), {ok: true, detail: {requested: 'cua', served: 'cua browser service 0.1.0'}});
  assert.deepEqual(serviceAttestation(vendorDoc, {CUA_BROWSER_SERVICE: 'cua'}), {ok: false, detail: {requested: 'cua', served: 'vendor'}});
});

test('the vendor selection, named or by default, passes only without the marker', () => {
  for (const env of [{CUA_BROWSER_SERVICE: 'vendor'}, {}, {CUA_BROWSER_SERVICE: ''}]) {
    assert.deepEqual(serviceAttestation(vendorDoc, env), {ok: true, detail: {requested: 'vendor', served: 'vendor'}});
    assert.equal(serviceAttestation(cuaDoc, env).ok, false);
  }
});

test('text without the selected-browser header attests nothing', () => {
  assert.deepEqual(serviceAttestation('Browser is not available', {CUA_BROWSER_SERVICE: 'cua'}), {ok: false, detail: {requested: 'cua', served: null}});
});

test('the documentation cell selects the named instance, or the default browser when none is named', () => {
  assert.match(DOCUMENTATION_CELL('abc'), /cua\.getBrowser\(\{"extensionInstanceId":"abc"\}\)/);
  assert.match(DOCUMENTATION_CELL(), /cua\.getBrowser\(\)/);
  assert.match(DOCUMENTATION_CELL(), /nodeRepl\.write\(await \w+\.documentation\(\)\)/);
});
