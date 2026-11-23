// The MAWS terminal harness's pure pieces (scripts/accept/maws-features.mjs): the step order the report keeps, the
// profiles_list rule, the PNG size read, and its cells run against a fake `cua` API (the live run is the script).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, writeFileSync, existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AFTER_END, ALERT, CHOOSER, CONFIRM, DOWNLOAD, FEATURE_STEPS, FIRST_USE, FIRST_USE_CHECKS, IGNORED_VISIBLE, ISOLATION, KEY_MISS, KEY_TAB, PROFILES_ENTRY, STEPS, cell, featureDecision, UPLOAD_BYTES, VIEWPORT} from '../scripts/accept/maws-features.mjs';
import {REPORT_BODY} from '../scripts/accept/features-page.mjs';
import {parseFeatureResult} from '../scripts/accept/linux-chrome-features.mjs';

const runCell = async (code, cua) => {
  const writes = [];
  globalThis.__maws = cua.__maws;
  try { await new Function('cua', 'nodeRepl', `return (async () => { ${code} })();`)(cua, {write: text => writes.push(text)}); }
  finally { delete globalThis.__maws; }
  return parseFeatureResult({result: {content: [{type: 'text', text: writes.join('\n')}]}});
};

test('the report keeps the spec\'s step order, and M3\'s four steps run in it', () => {
  assert.deepEqual(STEPS, ['profiles', 'service', 'firstUse', 'mawsKey', 'chromeKey', 'keyMiss', 'createTab', 'locator', 'viewport', 'popup', 'download', 'alert', 'confirm', 'chooser', 'cleanup', 'isolation']);
  assert.deepEqual(Object.keys(FEATURE_STEPS), ['download', 'alert', 'confirm', 'chooser']);
  assert.ok(Object.values(FEATURE_STEPS).every(step => typeof step === 'function'));
  for (const code of [DOWNLOAD, ALERT, CONFIRM, CHOOSER('/tmp/x.txt')]) assert.match(code, /const fixtureTab = m\.tab;/);
});

test('M3\'s cells drive the created tab through the vendor API: the download, a dialog dismissed, the chooser\'s file', async () => {
  const waited = [];
  const tab = {
    playwright: {
      waitForEvent: async (name, options) => {
        waited.push([name, options.timeoutMs]);
        return name === 'download' ? {path: async () => '/Users/o/Downloads/cua-report.pdf'} : {setFiles: async files => { tab.picked = files; }};
      },
      locator: selector => ({
        click: async () => { tab.clicked.push(selector); if (selector === '#alert') tab.dialog = {type: 'alert', dismiss: async () => { tab.dialog = null; tab.state = 'after-alert'; }}; },
        textContent: async () => (selector === '#picked' ? `x.txt:${UPLOAD_BYTES}` : tab.state),
      }),
    },
    getJsDialog: async () => tab.dialog ?? undefined,
    clicked: [], dialog: null, state: 'waiting', picked: null,
  };
  const cua = {__maws: {tab}};
  assert.deepEqual(await runCell(DOWNLOAD, cua).then(({path}) => path), '/Users/o/Downloads/cua-report.pdf');
  assert.deepEqual(await runCell(ALERT, cua), {type: 'alert', closed: true, state: 'after-alert', clearedPreviousType: null});
  assert.deepEqual(await runCell(CHOOSER('/tmp/x.txt'), cua), {picked: `x.txt:${UPLOAD_BYTES}`, expected: `x.txt:${UPLOAD_BYTES}`});
  assert.deepEqual(tab.clicked, ['#dl', '#alert', '#file']);
  assert.deepEqual(tab.picked, ['/tmp/x.txt']);
  assert.deepEqual(waited, [['download', 30000], ['filechooser', 10000]]);
});

test('the download step passes for the fixture\'s bytes under the Downloads folder and removes the file it proved it made', async () => {
  const downloads = mkdtempSync(join(tmpdir(), 'cua-maws-dl-'));
  try {
    const path = join(downloads, 'cua-report.pdf');
    const run = async () => { writeFileSync(path, REPORT_BODY); return {path, elapsedMs: 5}; };
    const step = await FEATURE_STEPS.download({run, downloads});
    assert.equal(step.ok, true, JSON.stringify(step.detail));
    assert.deepEqual(step.detail.removed, {deleted: true});
    assert.equal(existsSync(path), false);
    const elsewhere = await FEATURE_STEPS.download({run, downloads: '/somewhere/else'});
    assert.equal(elsewhere.ok, false);
  } finally { rmSync(downloads, {recursive: true, force: true}); }
});

test('the served page\'s own download and upload approvals are accepted; another origin\'s are not', () => {
  const ask = (tool, origin) => ({method: 'elicitation/create', params: {_meta: {codex_approval_kind: 'browser_use', tool_name: tool, origin}}});
  const origin = 'http://127.0.0.1:5000';
  const decide = msg => featureDecision(msg, origin).accept;
  assert.equal(decide(ask('download_browser_files', origin)), true);
  assert.equal(decide(ask('upload_browser_files', origin)), true);
  assert.equal(decide(ask('download_browser_files', 'https://evil.test')), false);
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

test('#493\'s cells follow the first-use path literally and pass a key where an id goes; each tab is closed again', async () => {
  const page = {url: 'http://127.0.0.1:9/', documentMarker: 'MARK'};
  const calls = [];
  const open = new Set();
  const cua = {
    getBrowser: async options => { calls.push(['getBrowser', options]); return {browserId: '1', documentation: async () => '# Selected Browser\n- Name: MAWS in-app browser (maws)\n- Type: extension'}; },
    listBrowsers: async () => [{id: '1', metadata: {extensionInstanceId: 'maws:a'}}],
    createBrowserTab: async (id, url, options) => {
      calls.push(['createBrowserTab', id, url, options]);
      const tab = {id: 7, playwright: {locator: () => ({textContent: async () => 'MARK'})}, close: async () => { open.delete('7'); }};
      open.add('7');
      return tab;
    },
    listTabs: async () => [...open].map(id => ({id})),
  };
  const used = await runCell(FIRST_USE(page), cua);
  assert.deepEqual(used, {browserId: '1', instance: 'maws:a', named: '- Name: MAWS in-app browser (maws)', visible: {tabId: '7', closed: true, markerMatches: true}});
  assert.equal(FIRST_USE_CHECKS.firstUse(used, `${IGNORED_VISIBLE}: browser 1 has no visibility capability`, 'maws:a'), true);
  assert.equal(FIRST_USE_CHECKS.firstUse(used, 'no note', 'maws:a'), false, 'the ignored-visible line is required');
  const keyed = await runCell(KEY_TAB('maws', page), cua);
  assert.equal(FIRST_USE_CHECKS.key(keyed, 'maws:a'), true);
  assert.deepEqual(calls, [['getBrowser', undefined], ['createBrowserTab', '1', page.url, {visible: true}], ['getBrowser', {id: 'maws'}], ['createBrowserTab', 'maws', page.url, undefined]]);
  const miss = await runCell(KEY_MISS, {getBrowser: async () => { throw new Error('Browser is not available: iab. Browser ids: "1"; profiles_list keys: "maws".'); }});
  assert.equal(FIRST_USE_CHECKS.miss(miss, ['maws']), true);
  assert.equal(FIRST_USE_CHECKS.miss(miss, ['maws', 'personal']), false);
});
