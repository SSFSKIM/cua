// The MAWS terminal harness's pure pieces (scripts/accept/maws-features.mjs): the step order the report keeps, the
// profiles_list rule, the PNG size read, and its cells run against a fake `cua` API (the live run is the script).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AFTER_END, FEATURE_STEPS, ISOLATION, PROFILES_ENTRY, STEPS, cell, VIEWPORT} from '../scripts/accept/maws-features.mjs';
import {parseFeatureResult} from '../scripts/accept/linux-chrome-features.mjs';

const runCell = async (code, cua) => {
  const writes = [];
  globalThis.__maws = cua.__maws;
  try { await new Function('cua', 'nodeRepl', `return (async () => { ${code} })();`)(cua, {write: text => writes.push(text)}); }
  finally { delete globalThis.__maws; }
  return parseFeatureResult({result: {content: [{type: 'text', text: writes.join('\n')}]}});
};

test('the report keeps the spec\'s step order, and M3\'s steps are slots that read SKIP until filled', () => {
  assert.deepEqual(STEPS, ['profiles', 'createTab', 'locator', 'viewport', 'popup', 'download', 'alert', 'confirm', 'chooser', 'cleanup', 'isolation']);
  assert.deepEqual(Object.keys(FEATURE_STEPS), ['download', 'alert', 'confirm', 'chooser']);
  assert.ok(Object.values(FEATURE_STEPS).every(step => step === null));
});

test('profiles passes only for a first entry keyed maws, ready, with a maws: instance', () => {
  assert.equal(PROFILES_ENTRY([{key: 'maws', ready: true, extensionInstanceId: 'maws:a'}, {key: 'me', ready: true, extensionInstanceId: 'x'}]).ok, true);
  for (const list of [[], [{key: 'me', ready: true, extensionInstanceId: 'x'}, {key: 'maws', ready: true, extensionInstanceId: 'maws:a'}],
    [{key: 'maws', ready: false, reason: 'maws_unreachable'}], [{key: 'maws', ready: true, extensionInstanceId: 'chrome-inst'}], undefined])
    assert.equal(PROFILES_ENTRY(list).ok, false, JSON.stringify(list));
});

test('the viewport cell reads the screenshot\'s size whether the vendor answers PNG or JPEG', () => {
  assert.match(VIEWPORT, /const imageSize = function imageSize/);
  assert.doesNotMatch(VIEWPORT, /pngSize/);
});

test('the cells report what they saw: a thrown error is the step\'s error; isolation and cleanup reduce to ids and booleans', async () => {
  await assert.rejects(runCell(cell('throw new Error("boom")'), {}), /boom/);
  const cua = {
    listBrowsers: async () => [{id: '1', type: 'extension', metadata: {extensionInstanceId: 'maws:a'}}, {id: '2', type: 'extension', metadata: {extensionInstanceId: 'chrome-x'}}],
    getBrowser: async ({extensionInstanceId}) => { throw new Error(`The Chrome instance is unavailable. (${extensionInstanceId})`); },
    listTabs: async () => [{id: 7, url: 'http://127.0.0.1/'}],
    __maws: {browserId: '1', tabId: '7', popupId: '9'},
  };
  assert.deepEqual(await runCell(ISOLATION('maws:b'), cua), {mawsInstances: ['maws:a'], otherSelected: false, otherError: 'The Chrome instance is unavailable. (maws:b)'});
  assert.deepEqual(await runCell(AFTER_END, cua), {createdListed: true, popupListed: false});
});
