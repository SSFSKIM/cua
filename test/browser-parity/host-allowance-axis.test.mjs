// REPL-host allowances (repl-host-expected-differences.json, axis 'repl-host') are for one comparison: an attested
// vendor-host run against a cua-host run of the same service. Vendor determinism and the service axis never use them,
// and a host comparison takes no service departures.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {allowancesFor, main} from '../../scripts/browser-parity.mjs';
import {loadTraceAllowances} from '../../scripts/browser-parity/trace-tolerance.mjs';

const hostFile = new URL('./repl-host-expected-differences.json', import.meta.url).pathname;
const serviceFile = new URL('./expected-differences.json', import.meta.url).pathname;
const hostFixture = JSON.parse(readFileSync(hostFile, 'utf8'));
const hostEntries = loadTraceAllowances(hostFixture);
const serviceEntries = JSON.parse(readFileSync(serviceFile, 'utf8'));
const evidence = new URL('../../docs/evidence/2026-10-14-own-repl-host-parity/m2/', import.meta.url).pathname;
const vendorMeta = JSON.parse(readFileSync(`${evidence}browser-vendor-host/meta.json`, 'utf8'));
const meta = (host, service) => ({...vendorMeta, host, service});
const quietly = async run => { const log = console.log; console.log = () => {}; try { return await run(); } finally { console.log = log; } };

test('every REPL-host allowance names its axis', () => {
  assert.ok(hostEntries.length > 0);
  assert.equal(hostFixture.axis, 'repl-host');
  assert.ok(hostEntries.every(e => e.axis === 'repl-host'));
  assert.ok(serviceEntries.every(e => e.axis === undefined));
});

test('REPL-host allowances apply only to a vendor-host run against a cua-host run of one service', () => {
  assert.deepEqual(allowancesFor(meta('vendor', 'cua'), meta('cua', 'cua'), hostFixture), hostEntries);
  assert.deepEqual(allowancesFor(meta('cua', 'cua'), meta('vendor', 'cua'), hostFixture), hostEntries);
  for (const [a, b] of [[meta('vendor', 'cua'), meta('vendor', 'cua')], [meta('cua', 'cua'), meta('cua', 'cua')],
    [meta('vendor', 'vendor'), meta('vendor', 'cua')], [meta('vendor', 'vendor'), meta('cua', 'cua')], [meta(undefined, 'cua'), meta(undefined, 'cua')]])
    assert.throws(() => allowancesFor(a, b, hostFixture), /REPL-host allowances apply only to/, JSON.stringify([a, b]));
});

test('a host comparison takes no service departures; the service axis keeps them', () => {
  assert.throws(() => allowancesFor(meta('vendor', 'cua'), meta('cua', 'cua'), serviceEntries), /takes only REPL-host allowances/);
  assert.equal(allowancesFor(meta('vendor', 'vendor'), meta('vendor', 'cua'), serviceEntries), serviceEntries);
  assert.equal(allowancesFor(meta(undefined, 'vendor'), meta(undefined, 'cua'), serviceEntries), serviceEntries);
  assert.throws(() => allowancesFor(meta('vendor', 'cua'), meta('cua', 'cua'), [{...hostEntries[0], axis: 'other'}]), /Invalid expected-differences axis/);
});

test('the committed vendor-against-vendor runs cannot be diffed with the host allowances', async () => {
  await assert.rejects(quietly(() => main(['diff', `${evidence}browser-diagnostics/hist-vendor`, `${evidence}browser-diagnostics/vendor-variance-1`,
    '--expected', hostFile, '--scenarios', 'actions/wait-for.mjs'])), /REPL-host allowances apply only to/);
});

test('the committed host pair still diffs clean with them', async () => {
  assert.equal(await quietly(() => main(['diff', `${evidence}browser-vendor-host`, `${evidence}browser-cua-host`, '--expected', hostFile])), 0);
});

test('handwritten host traces cannot bypass the evidence derivation rule', () => {
  assert.throws(() => allowancesFor(meta('vendor', 'cua'), meta('cua', 'cua'), hostEntries), /must be derived/);
});

test('a tolerance from another device, profile, runtime or service cannot leak into the host comparison', () => {
  for (const key of ['device', 'profile', 'release', 'platform', 'backend', 'service']) {
    const a = meta('vendor', 'cua'), b = meta('cua', 'cua');
    a[key] = b[key] = 'another-context';
    assert.throws(() => allowancesFor(a, b, hostFixture), /context mismatch/, key);
  }
});
