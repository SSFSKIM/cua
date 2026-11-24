// The hosted setup's input sources (scripts/hosted-sittings/input-sources.mjs; ruling 1189): enabled through
// TISEnableInputSource on a GitHub-hosted runner only, read back from TIS's enabled list with the preference's value
// beside it, a source that does not read back named (never a failed setup), and the venue record read on the device.
// The helper is an injected exec here: nothing touches this Mac's input sources.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ABC, KOREAN_2SET, KOREAN_IM, READ_ROUNDS, enableInputSources, inputSourcesDetail, inputSourcesRecord, preferenceLists} from '../../scripts/hosted-sittings/input-sources.mjs';
import {runnerRecord, venueInputMissingOf} from '../../scripts/hosted-sittings/runner.mjs';
import {renderVenue} from '../../scripts/hosted-sittings/venue.mjs';

const HOSTED = {env: {RUNNER_ENVIRONMENT: 'github-hosted', ImageOS: 'macos15', ImageVersion: '1', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1'}, platform: 'darwin'};
const held = id => ({id, installed: true, enabledList: {listed: true, enabled: true, selectCapable: id !== KOREAN_IM}});
const answer = body => ({status: 0, stdout: `${JSON.stringify(body)}\n`, stderr: ''});

test('off a GitHub-hosted runner it refuses before the helper, TIS or defaults is reached', async () => {
  for (const at of [{env: {}, platform: 'darwin'}, {env: HOSTED.env, platform: 'linux'}]) {
    const calls = [];
    await assert.rejects(enableInputSources({...at, exec: (...args) => { calls.push(args); return answer({}); }, sleep: async () => {}}), /refused/);
    assert.deepEqual(calls, []);
  }
});

test('the read-back: each selectable source enabled and selectable in TIS\'s list, the mode only with its input method; both readings kept', async () => {
  const all = inputSourcesRecord({enable: [], read: {readings: [ABC, KOREAN_IM, KOREAN_2SET].map(held), preference: [{'KeyboardLayout Name': 'ABC'}, {'Bundle ID': KOREAN_IM}, {'Bundle ID': KOREAN_IM, 'Input Mode': KOREAN_2SET}]}, reads: 1});
  assert.deepEqual(all.missing, []);
  assert.deepEqual(all.sources.map(s => s.preference), [true, true, true]);
  // Listed but not selectable, or the input method not held: the mode is missing; a preference that lists a source
  // TIS does not is recorded, never taken for it.
  const notSelectable = inputSourcesRecord({read: {readings: [held(ABC), held(KOREAN_IM), {...held(KOREAN_2SET), enabledList: {listed: true, enabled: true, selectCapable: false}}], preference: []}, reads: 3});
  assert.deepEqual(notSelectable.missing, [KOREAN_2SET]);
  const noIm = inputSourcesRecord({read: {readings: [held(ABC), {id: KOREAN_IM, installed: true, enabledList: {listed: false}}, held(KOREAN_2SET)], preference: [{'KeyboardLayout Name': 'ABC'}]}, reads: 3});
  assert.deepEqual(noIm.missing, [KOREAN_2SET]);
  const preferenceOnly = inputSourcesRecord({read: {readings: [{id: ABC, installed: true, enabledList: {listed: false}}, held(KOREAN_IM), held(KOREAN_2SET)], preference: [{'KeyboardLayout Name': 'ABC'}]}, reads: 3});
  assert.deepEqual([preferenceOnly.missing, preferenceOnly.sources[0].preference], [[ABC], true], 'TIS\'s list decides; the preference is recorded beside it');
  assert.equal(preferenceLists(null, ABC), null);
  assert.equal(preferenceLists([{'Bundle ID': KOREAN_IM, 'Input Mode': KOREAN_2SET}], KOREAN_IM), false, 'a mode\'s entry is not its input method\'s');
});

test('enabling: read again after each settle until every source holds, up to the bound; a helper that fails is recorded, never thrown', async () => {
  let lists = 0;
  const exec = (command, args) => {
    if (args[1] === 'enable') return answer({enabled: [ABC, KOREAN_IM, KOREAN_2SET].map(id => ({id, status: 0})), readings: [], preference: null});
    lists += 1;
    // The mode reads back only from the second list on: the text input system catching up.
    return answer({readings: [held(ABC), held(KOREAN_IM), lists > 1 ? held(KOREAN_2SET) : {id: KOREAN_2SET, installed: true, enabledList: {listed: false}}], preference: []});
  };
  const slept = [];
  const out = await enableInputSources({...HOSTED, exec, sleep: async ms => slept.push(ms)});
  assert.deepEqual([out.missing, out.reads, slept], [[], 2, [1000, 1000]]);
  const never = await enableInputSources({...HOSTED, exec: (c, args) => (args[1] === 'enable' ? answer({enabled: []}) : answer({readings: [held(ABC)], preference: []})), sleep: async () => {}});
  assert.deepEqual([never.missing, never.reads], [[KOREAN_2SET], READ_ROUNDS]);
  const failed = await enableInputSources({...HOSTED, exec: () => ({status: 1, stdout: '', stderr: 'error: no such module \'Carbon\''}), sleep: async () => {}});
  assert.deepEqual(failed.missing, [ABC, KOREAN_2SET]);
  assert.match(failed.error, /input-sources\.swift enable: exit 1: error: no such module 'Carbon'/);
  assert.match(inputSourcesDetail(failed), /MISSING com\.apple\.keylayout\.ABC, com\.apple\.inputmethod\.Korean\.2SetKorean: the input rows needing them are NO VERDICT venue \(input-sources\.swift enable/);
});

test('the venue record carries the missing sources to the device, on a hosted runner only; sitting.md renders both readings', () => {
  const sources = inputSourcesRecord({enable: [{id: ABC, status: 0}, {id: KOREAN_IM, status: 0}, {id: KOREAN_2SET, status: -50}],
    read: {readings: [held(ABC), held(KOREAN_IM), {id: KOREAN_2SET, installed: true, enabledList: {listed: false}}], preference: [{'KeyboardLayout Name': 'ABC'}, {'Bundle ID': KOREAN_IM}]}, reads: 3});
  const record = runnerRecord(HOSTED.env, {install: {home: '/Users/runner/Library/Application Support/cua', release: 'r1'}, engine: {bundle: '/e', build: 'b'.repeat(40), engineVersion: '0.5.0'},
    vm: {id: 'v', platformUuid: '5F2C1A9E-1D2B-4C3D-8E4F-0123456789AB', bootedAt: '2026-11-23T09:58:12.000Z'}, venue: {inputSources: sources}});
  assert.deepEqual(venueInputMissingOf(record, HOSTED), [KOREAN_2SET]);
  assert.equal(venueInputMissingOf(record, {env: {}, platform: 'darwin'}), null, 'off a hosted runner nothing is declared');
  assert.equal(venueInputMissingOf({...record, venue: {}}, HOSTED), null, 'a record from before the step declares nothing');
  const md = renderVenue({alerts: [], differences: [], textEdit: null, inputSources: sources});
  assert.match(md, /Input sources \(ruling 1189\): enabled through TISEnableInputSource .* \*\*Not enabled: com\.apple\.inputmethod\.Korean\.2SetKorean\*\*: every input row selecting it is NO VERDICT `venue`\./);
  assert.ok(md.includes('| com.apple.inputmethod.Korean.2SetKorean | status -50 | not in TIS\'s enabled list | not listed | **no** |'), md);
  assert.ok(md.includes('| com.apple.keylayout.ABC | status 0 | in TIS\'s enabled list, enabled, selectable | listed | yes |'), md);
});
