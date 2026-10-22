// Experiment A's confinement cell (#115 M0, scripts/sandbox-probe/experiment.mjs) is generated source a model cell
// runs; it must parse as an async function body for any harness paths, quoting them as JSON.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cellRunner, confinementCell} from '../../scripts/sandbox-probe/experiment.mjs';

const AsyncFunction = (async () => {}).constructor;

test('the confinement cell parses, with every harness path embedded as a JSON string', () => {
  const body = confinementCell({outside: '/s/out"x', marker: '/s/home/m.txt', moduleDir: '/s/mods', cuaHome: '/s/home', tcpPort: 4242, unixPath: '/private/tmp/c.sock', sessionTmp: "/s/tmp'q"});
  assert.doesNotThrow(() => new AsyncFunction('nodeRepl', body));
  assert.ok(body.includes(JSON.stringify('/s/out"x/cua115-probe')));
  assert.ok(body.includes('port: 4242'));
});

// #117 M3.4: a vendor-host session's cells attest the vendor engine; the first that does not stops the run.
const VENDOR = {engine: 'vendor', version: '1.0', build: '26.928.40906-darwin-arm64'};
const reply = (value, attested) => ({content: [{type: 'text', text: `CUA115 ${JSON.stringify({ok: true, value})}`}], ...(attested === undefined ? {} : {_meta: {'cua/nativeEngine': attested}})});
function runner({replies, expected = VENDOR}) {
  const sent = [];
  const results = {};
  const js = cellRunner({call: async code => { sent.push(code); const next = replies.shift(); if (next instanceof Error) throw next; return next; }, expected, results});
  return {js, sent, results};
}

test('a misattested banner stops the run: its result is kept with the refusal, and no later cell is sent', async () => {
  const {js, sent, results} = runner({replies: [reply({ready: true}, {engine: 'cua', version: '0.2.0', build: 'f'.repeat(64)}), reply({})]});
  await assert.rejects(js('banner', 'return {ready: true};'), /refused on the attestation: .*cua/);
  assert.equal(results.banner.ok, true);
  assert.match(results.banner.refused, /cua/);
  assert.deepEqual(results.banner.attested, {engine: 'cua', version: '0.2.0', build: 'f'.repeat(64)});
  await assert.rejects(js('confinement', 'return 1;'), /refused on the attestation/);
  assert.equal(sent.length, 1, 'the confinement cell was never sent');
  assert.equal('confinement' in results, false);
});

test('a banner with no attestation, or another build, is refused the same way', async () => {
  for (const attested of [undefined, {...VENDOR, build: 'other'}]) {
    const {js, sent} = runner({replies: [reply({ready: true}, attested), reply({})]});
    await assert.rejects(js('banner', 'return 1;'), /refused on the attestation/, JSON.stringify(attested));
    await assert.rejects(js('listApps#1', 'return 1;'));
    assert.equal(sent.length, 1);
  }
});

test('attested cells run on, each keeping its attestation; a transport failure has nothing to attest; no expectation checks nothing', async () => {
  const {js, sent, results} = runner({replies: [reply({ready: true}, VENDOR), new Error('closed'), reply(1, VENDOR)]});
  await js('banner', 'return 1;');
  assert.deepEqual(results.banner.attested, VENDOR);
  assert.equal((await js('confinement', 'return 1;')).transport, 'closed');
  await js('listApps#1', 'return 1;');
  assert.equal(sent.length, 3);
  const unchecked = runner({replies: [reply(1), reply(2)], expected: null});
  await unchecked.js('banner', 'return 1;');
  await unchecked.js('confinement', 'return 1;');
  assert.equal(unchecked.results.banner.attested, null);
  assert.equal(unchecked.sent.length, 2);
});
