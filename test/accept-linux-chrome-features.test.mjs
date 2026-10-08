import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {request} from 'node:http';
import {mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, unlinkSync, mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {registerHooks} from 'node:module';
import {openSession} from '../scripts/accept/mcp-session.mjs';
import {backendDir, socketNameFor} from '../src/chrome/extension.mjs';
import {startFeaturesPage, SCRIPT, CSP, REPORT_BODY, REPORT_SHA256} from '../scripts/accept/features-page.mjs';
import {parseFeatureResult, downloadEvidence, deleteFixtureDownload} from '../scripts/accept/linux-chrome-features.mjs';

const get = (url, {host, method = 'GET'} = {}) => new Promise((resolve, reject) => {
  const u = new URL(url);
  const req = request({host: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: host ? {host} : {}}, res => {
    const chunks = [];
    res.on('data', chunk => chunks.push(chunk));
    res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks)}));
  });
  req.on('error', reject);
  req.end();
});

test('the loopback page serves its marker and only the hash-authorized inline feature script', async t => {
  const page = await startFeaturesPage();
  t.after(() => page.close());
  assert.match(page.origin, /^http:\/\/127\.0\.0\.1:\d+$/);
  const response = await get(page.url);
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(response.headers['content-security-policy'], CSP);
  assert.ok(CSP.includes(`script-src 'sha256-${createHash('sha256').update(SCRIPT).digest('base64')}'`));
  assert.match(CSP, /default-src 'none'/);
  const html = response.body.toString('utf8');
  assert.ok(html.includes(`<p id="marker">${page.documentMarker}</p>`));
  assert.ok(html.includes(`<script>${SCRIPT}</script>`));
  assert.match(html, /<a id="dl" href="\/report\.pdf" download>/);
  assert.match(html, /<input id="file" type="file">/);
});

test('the attachment has a stable body, digest, download filename and no-store headers', async t => {
  const page = await startFeaturesPage();
  t.after(() => page.close());
  const response = await get(`${page.origin}/report.pdf`);
  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'application/pdf');
  assert.equal(response.headers['content-disposition'], 'attachment; filename="cua-report.pdf"');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.equal(Number(response.headers['content-length']), response.body.length);
  assert.ok(response.body.length >= 4096);
  assert.deepEqual(response.body, REPORT_BODY);
  assert.equal(createHash('sha256').update(response.body).digest('hex'), REPORT_SHA256);
  assert.deepEqual((await get(`${page.origin}/report.pdf`)).body, response.body);
});

test('lookalike Host values, unknown paths and non-GET requests cannot serve either resource', async t => {
  const page = await startFeaturesPage();
  t.after(() => page.close());
  const host = `localhost:${new URL(page.origin).port}`;
  for (const path of ['/', '/report.pdf']) {
    const response = await get(page.origin + path, {host});
    assert.equal(response.status, 421);
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal(response.body.toString(), 'misdirected\n');
  }
  for (const [path, options] of [['/other', {}], ['/report.pdf?other=1', {}], ['/', {method: 'POST'}]]) {
    assert.equal((await get(page.origin + path, options)).status, 404);
  }
  assert.deepEqual(page.requests(), {total: 5, served: 0, refused: 5});
});

test('dialogs run after the click returns and the file input reports the actual selected file', () => {
  const handlers = {}, timers = [], calls = [];
  const elements = Object.fromEntries(['alert', 'confirm', 'state', 'file', 'picked', 'name', 'submit', 'popup'].map(id => [id, {
    textContent: 'waiting', addEventListener: (event, fn) => { handlers[`${id}:${event}`] = fn; },
  }]));
  const window = {__alerted: 'not called'};
  vm.runInNewContext(SCRIPT, {
    document: {getElementById: id => elements[id]}, window,
    setTimeout: (fn, ms) => timers.push({fn, ms}),
    alert: text => { calls.push(text); return undefined; },
    confirm: text => { calls.push(text); return false; },
  });
  handlers['alert:click']();
  assert.deepEqual(calls, []);
  assert.equal(timers[0].ms, 50);
  timers.shift().fn();
  assert.deepEqual(calls, ['cua alert']);
  assert.equal(window.__alerted, undefined);
  assert.equal(elements.state.textContent, 'after-alert');
  handlers['confirm:click']();
  assert.equal(elements.state.textContent, 'after-alert');
  assert.equal(timers[0].ms, 50);
  timers.shift().fn();
  assert.deepEqual(calls, ['cua alert', 'cua confirm?']);
  assert.equal(elements.state.textContent, 'confirm:false');
  elements.file.files = [{name: 'input.txt', size: 1234}];
  handlers['file:change']();
  assert.equal(elements.picked.textContent, 'input.txt:1234');
});

const reply = (text, isError = false) => ({jsonrpc: '2.0', id: 1, result: {content: [{type: 'text', text}], isError}});

test('result parsing consumes only the tagged result, rejects failed MCP calls and preserves vendor error text', () => {
  const detail = {path: '/tmp/cua-report.pdf', elapsedMs: 13};
  assert.deepEqual(parseFeatureResult(reply(`other output {"path":"wrong"}\nCUA_FEATURES_RESULT ${JSON.stringify({detail})}\n`)), detail);
  assert.throws(() => parseFeatureResult({timedOut: true}), /timed out/);
  assert.throws(() => parseFeatureResult({error: {code: -32000, message: 'connection ended'}}), /connection ended/);
  assert.throws(() => parseFeatureResult(reply('vendor failed verbatim', true)), {message: 'vendor failed verbatim'});
  assert.throws(() => parseFeatureResult(reply('no tagged result')), /missing/);
  assert.throws(() => parseFeatureResult(reply('CUA_FEATURES_RESULT not json')), /JSON/);
  assert.throws(() => parseFeatureResult(reply('CUA_FEATURES_RESULT {"error":"Allow access to file URLs.\\nNot allowed"}')), {message: 'Allow access to file URLs.\nNot allowed'});
});

test('download evidence checks the bytes and cleanup deletes only the verified newly-created file', t => {
  const directory = mkdtempSync(join(tmpdir(), 'cua-features-test-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const path = join(directory, 'cua-report.pdf');
  writeFileSync(path, REPORT_BODY, {flag: 'wx'});
  const evidence = downloadEvidence(path, Date.now() - 10_000);
  assert.equal(evidence.basename, 'cua-report.pdf');
  assert.equal(evidence.directory, directory.split('/').at(-1));
  assert.equal(evidence.size, REPORT_BODY.length);
  assert.equal(evidence.sha256, REPORT_SHA256);
  assert.equal(evidence.sha256Match, true);
  assert.equal(evidence.createdByFixture, true);
  assert.equal(deleteFixtureDownload(evidence).deleted, true);
  assert.equal(existsSync(path), false);

  writeFileSync(path, REPORT_BODY, {flag: 'wx'});
  const old = downloadEvidence(path, Date.now() + 1000);
  assert.equal(old.createdByFixture, false);
  assert.equal(deleteFixtureDownload(old).deleted, false);
  assert.equal(existsSync(path), true);

  const modified = downloadEvidence(path, Date.now() - 10_000);
  writeFileSync(path, 'unrelated replacement content');
  assert.equal(deleteFixtureDownload(modified).deleted, false);
  assert.equal(readFileSync(path, 'utf8'), 'unrelated replacement content');
  assert.equal(downloadEvidence(path, Date.now() - 10_000).sha256Match, false);

  unlinkSync(path);
});

// The vendor is unavailable in this test environment. Execute our cells against the documented API boundary,
// without importing/starting its runtime, to check ordering, handling and informational refusal semantics.
const runCell = (code, fixtureTab) => new Function('fixtureTab', `return (async () => { ${code} })();`)(fixtureTab);

test('download/filechooser cells arm the documented playwright event before clicking and use the returned handle', async () => {
  const {DOWNLOAD_CELL, fileChooserCell} = await import('../scripts/accept/linux-chrome-features.mjs');
  const calls = [];
  let event;
  const fixtureTab = {playwright: {
    waitForEvent: (name, options) => {
      calls.push([name, options]);
      return new Promise(resolve => { event = resolve; });
    },
    locator: selector => ({click: async () => {
      calls.push(['click', selector]);
      if (selector === '#dl') event({path: async options => { calls.push(['path', options]); return '/tmp/cua-report.pdf'; }});
      else event({setFiles: async (paths, options) => { calls.push(['setFiles', paths, options]); }});
    }, textContent: async () => 'input.txt:1234'}),
  }};
  assert.equal((await runCell(DOWNLOAD_CELL, fixtureTab)).path, '/tmp/cua-report.pdf');
  assert.deepEqual(calls, [['download', {timeoutMs: 30000}], ['click', '#dl'], ['path', {timeoutMs: 10000}]]);
  calls.length = 0;
  assert.deepEqual(await runCell(fileChooserCell('/tmp/input.txt'), fixtureTab), {picked: 'input.txt:1234', expected: 'input.txt:1234'});
  assert.deepEqual(calls, [['filechooser', {timeoutMs: 10000}], ['click', '#file'], ['setFiles', ['/tmp/input.txt'], {timeoutMs: 10000}]]);
});

test('dialog cells treat null/undefined as closed and dismiss both alert and confirm without calling accept', async () => {
  const {dialogCell} = await import('../scripts/accept/linux-chrome-features.mjs');
  for (const [selector, type, state] of [['#alert', 'alert', 'after-alert'], ['#confirm', 'confirm', 'confirm:false']]) {
    let active = null, dismissed = false;
    const fixtureTab = {
      getJsDialog: async () => active,
      playwright: {locator: () => ({
        click: async () => { active = {type, dismiss: async () => { dismissed = true; active = undefined; }}; },
        textContent: async () => state,
      })},
    };
    assert.deepEqual(await runCell(dialogCell(selector, state), fixtureTab), {type, closed: true, state, clearedPreviousType: null});
    assert.equal(dismissed, true);
  }
});

test('the raw-CDP cell skips an unadvertised surface and captures the actual send refusal verbatim', async () => {
  const {RAW_CDP_CELL} = await import('../scripts/accept/linux-chrome-features.mjs');
  const absent = await runCell(RAW_CDP_CELL, {capabilities: {list: async () => []}});
  assert.equal(absent.skipped, true);
  const calls = [];
  const result = await runCell(RAW_CDP_CELL, {capabilities: {
    list: async () => [{id: 'cdp', description: 'Raw CDP'}],
    get: async id => { calls.push(id); return {send: async (...args) => {
      calls.push(args); throw new Error('Browser.setDownloadBehavior is not permitted.\nUse waitForEvent("download").');
    }}; },
  }});
  assert.deepEqual(result, {outcome: 'error', message: 'Browser.setDownloadBehavior is not permitted.\nUse waitForEvent("download").'});
  assert.deepEqual(calls, ['cdp', ['Browser.setDownloadBehavior', {behavior: 'default', eventsEnabled: true}, {timeoutMs: 10000}]]);
});


const FAKE_MCP_SERVER = String.raw`
  const {createInterface} = require('node:readline');
  createInterface({input: process.stdin}).on('line', line => {
    const request = JSON.parse(line);
    if (request.id === undefined) return;
    const respond = () => process.stdout.write(JSON.stringify({jsonrpc: '2.0', id: request.id,
      result: {content: [], structuredContent: request.params.arguments}}) + '\n');
    if (request.params?.arguments?.code === 'slow cell') setTimeout(respond, 150);
    else respond();
  });
`;

test('session.js sends the requested runtime timeout to the js tool, including its default', async t => {
  const session = openSession({args: ['-e', FAKE_MCP_SERVER], env: process.env});
  t.after(() => session.terminate({budgetMs: 100}));
  const explicit = await session.js('create a tab', 150_000);
  assert.deepEqual(explicit.result.structuredContent, {code: 'create a tab', timeout_ms: 150_000});
  const defaulted = await session.js('download');
  assert.deepEqual(defaulted.result.structuredContent, {code: 'download', timeout_ms: 60_000});
});

test('session.js waits beyond the runtime deadline for the MCP reply rather than timing out first', async t => {
  const session = openSession({args: ['-e', FAKE_MCP_SERVER], env: process.env});
  t.after(() => session.terminate({budgetMs: 100}));
  const response = await session.js('slow cell', 80);
  assert.equal(response.timedOut, undefined);
  assert.deepEqual(response.result.structuredContent, {code: 'slow cell', timeout_ms: 80});
});

// Replace only the fixture's MCP connection in this test process. The fixture's real cells, marker comparison,
// evidence, reporting, filesystem cleanup and HTTP server still execute; no cua serve or browser is started.
async function fakeAcceptance({marker = 'match', clickError, profilesReply, endTaskReply} = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'cua-features-run-test-'));
  const home = join(directory, 'home');
  mkdirSync(join(home, 'chrome'), {recursive: true});
  writeFileSync(join(home, 'chrome', 'cua-registration.json'), JSON.stringify({schema: 1, route: 'cua', browsers: {}}));
  mkdirSync(backendDir(home), {recursive: true});
  writeFileSync(join(backendDir(home), `${socketNameFor('fixture-instance')}.json`), JSON.stringify({instanceId: 'fixture-instance', pid: 0, sessions: []}));
  const downloadPath = join(directory, 'cua-report.pdf');
  const actions = [], events = new Map();
  let documentMarker, openedUrl, activeDialog = null, state = 'waiting', picked = 'waiting';
  const fixtureTab = {
    capabilities: {list: async () => { actions.push('capabilities'); return []; }},
    getJsDialog: async () => { actions.push('getJsDialog'); return activeDialog; },
    close: async () => { actions.push('close'); },
    playwright: {
      waitForEvent: name => {
        actions.push(`wait:${name}`);
        return new Promise(resolve => events.set(name, resolve));
      },
      locator: selector => ({
        textContent: async () => selector === '#marker' ? documentMarker : selector === '#state' ? state : picked,
        click: async () => {
          actions.push(`click:${selector}`);
          if (selector === '#dl') {
            writeFileSync(downloadPath, REPORT_BODY, {flag: 'wx'});
            events.get('download')({path: async () => { actions.push('download.path'); return downloadPath; }});
            if (clickError !== undefined) throw new Error(clickError);
          } else if (selector === '#file') {
            events.get('filechooser')({setFiles: async ([path]) => { picked = `${path.split('/').at(-1)}:${readFileSync(path).length}`; }});
          } else {
            activeDialog = {type: selector === '#alert' ? 'alert' : 'confirm', dismiss: async () => {
              actions.push('dismiss'); activeDialog = null; state = selector === '#alert' ? 'after-alert' : 'confirm:false';
            }};
          }
        },
      }),
    },
  };
  let clock = Date.now();
  const context = vm.createContext({
    Date: marker === 'wrong' ? class extends Date { static now() { return clock += 31_000; } } : Date,
    setTimeout,
    cua: {
      getBrowser: async () => ({browserId: 'fixture-browser'}),
      createBrowserTab: async (browserId, url) => {
        actions.push('createBrowserTab'); openedUrl = url;
        if (marker === 'error') throw new Error('tab creation failed verbatim');
        const page = await get(url);
        documentMarker = marker === 'wrong' ? 'not our document' : page.body.toString().match(/<p id="marker">([^<]+)<\/p>/)[1];
        return fixtureTab;
      },
    },
  });
  const session = {
    initialize: async () => { actions.push('initialize'); },
    js: async code => {
      let text;
      context.nodeRepl = {write: value => { text = value; }};
      await vm.runInContext(`(async () => { ${code} })()`, context);
      return reply(text);
    },
    call: async name => {
      actions.push(name);
      return name === 'profiles_list'
        ? profilesReply ?? {jsonrpc: '2.0', id: 1, result: {content: [], structuredContent: {profiles: [{key: 'me', ready: true, extensionInstanceId: 'fixture-instance'}]}}}
        : endTaskReply ?? {jsonrpc: '2.0', id: 2, result: {content: [], structuredContent: {status: 'ended'}}};
    },
    terminate: async () => { actions.push('terminate'); return {code: 0, signal: null}; },
  };
  const fixtureUrl = new URL('../scripts/accept/linux-chrome-features.mjs', import.meta.url).href + `?fake=${Math.random()}`;
  const helperUrl = new URL('../scripts/accept/mcp-session.mjs', import.meta.url).href;
  const adapter = `export {resultText} from ${JSON.stringify(helperUrl)}; export const openSession = () => globalThis.__cuaFeaturesTestSession;`;
  const hook = registerHooks({resolve(specifier, context, nextResolve) {
    if (context.parentURL === fixtureUrl && specifier === './mcp-session.mjs') {
      return {url: `data:text/javascript,${encodeURIComponent(adapter)}`, shortCircuit: true};
    }
    return nextResolve(specifier, context);
  }});
  const oldHome = process.env.CUA_HOME;
  process.env.CUA_HOME = home;
  globalThis.__cuaFeaturesTestSession = session;
  try {
    const {runAcceptance} = await import(fixtureUrl);
    const report = await runAcceptance();
    return {report, actions, openedUrl, downloadExists: existsSync(downloadPath)};
  } finally {
    hook.deregister();
    delete globalThis.__cuaFeaturesTestSession;
    if (oldHome === undefined) delete process.env.CUA_HOME;
    else process.env.CUA_HOME = oldHome;
    rmSync(directory, {recursive: true, force: true});
  }
}

const stepNamed = (report, name) => report.steps.find(step => step.name === name);
const FEATURES = [
  'download completes and its saved bytes match',
  'download raw-CDP alternative (informational)',
  'alert is accepted and the page resumes',
  'confirm is dismissed and returns false',
  'file chooser selects a local 1234-byte file',
];
const assertSerializedDetails = report => {
  for (const step of JSON.parse(JSON.stringify(report)).steps) assert.ok(Object.hasOwn(step, 'detail'), step.name);
};

for (const marker of ['wrong', 'error']) test(`an ${marker === 'wrong' ? 'unmatched document marker' : 'open failure'} blocks every feature action but not cleanup`, async () => {
  const {report, actions, openedUrl} = await fakeAcceptance({marker});
  const opened = stepNamed(report, 'open a tab and verify its document marker');
  assert.equal(opened.status, 'FAIL');
  assert.deepEqual(opened.detail, marker === 'wrong' ? {markerMatches: false} : 'tab creation failed verbatim');
  assert.deepEqual(actions.filter(action => /^(click:|wait:|capabilities|getJsDialog|dismiss)/.test(action)), []);
  for (const name of FEATURES) {
    const feature = stepNamed(report, name);
    assert.equal(feature.status, 'FAIL', name);
    assert.match(JSON.stringify(feature.detail), /document.*not verified/i);
  }
  for (const name of ['close the tab', 'end_task', 'the host owns no tab after end_task', 'cua serve exited cleanly',
    'no run entry left for the connection', 'remove the download only if fixture creation is proven',
    'remove the fixture-created temporary input', 'stop the loopback page server']) {
    assert.equal(stepNamed(report, name).status, 'PASS', name);
  }
  assert.ok(actions.includes('terminate'));
  await assert.rejects(get(openedUrl));
  assertSerializedDetails(report);
});

test('a click RPC failure after a completed download remains FAIL and preserves evidence for safe deletion', async () => {
  const clickError = 'click transport failed after dispatch\nverbatim diagnostic';
  const {report, actions, downloadExists} = await fakeAcceptance({clickError});
  const download = stepNamed(report, FEATURES[0]);
  assert.equal(download.status, 'FAIL');
  assert.equal(download.detail.clickError, clickError);
  assert.equal(download.detail.basename, 'cua-report.pdf');
  assert.equal(download.detail.sha256, REPORT_SHA256);
  assert.equal(download.detail.createdByFixture, true);
  assert.ok(actions.includes('download.path'));
  assert.equal(report.cleanup.download.deleted, true);
  assert.equal(downloadExists, false);
  assertSerializedDetails(report);
});

const failureReplies = [
  ['timeout', {timedOut: true}],
  ['JSON-RPC error', {jsonrpc: '2.0', id: 7, error: {code: -32000, message: 'connection ended verbatim', data: {reason: 'lost transport'}}}],
  ['tool isError', {jsonrpc: '2.0', id: 7, result: {isError: true, content: [{type: 'text', text: 'vendor failed verbatim\nextra diagnostics'}], structuredContent: {status: 'ended', profiles: [{key: 'me', ready: true, extensionInstanceId: 'fixture-instance'}]}}}],
];
for (const [shape, failureReply] of failureReplies) {
  test(`profiles_list preserves a complete ${shape} reply as the failed step detail`, async () => {
    const {report, actions} = await fakeAcceptance({profilesReply: failureReply});
    const listed = stepNamed(report, 'profiles_list reports me ready');
    assert.equal(listed.status, 'FAIL');
    assert.deepEqual(listed.detail, failureReply);
    assert.ok(!actions.includes('createBrowserTab'));
    assert.ok(actions.includes('end_task'));
    assert.ok(actions.includes('terminate'));
    assertSerializedDetails(report);
  });
  test(`end_task preserves a complete ${shape} reply and does not prevent other cleanup`, async () => {
    const {report, actions} = await fakeAcceptance({endTaskReply: failureReply});
    const ended = stepNamed(report, 'end_task');
    assert.equal(ended.status, 'FAIL');
    assert.deepEqual(ended.detail, failureReply);
    assert.equal(stepNamed(report, 'cua serve exited cleanly').status, 'PASS');
    assert.equal(stepNamed(report, 'stop the loopback page server').status, 'PASS');
    assert.ok(actions.includes('terminate'));
    assertSerializedDetails(report);
  });
}

for (const [option, name] of [['profilesReply', 'profiles_list reports me ready'], ['endTaskReply', 'end_task']]) {
  test(`${name} serializes a detail even when a successful reply has no structured content`, async () => {
    const {report} = await fakeAcceptance({[option]: {jsonrpc: '2.0', id: 7, result: {content: []}}});
    assert.equal(stepNamed(report, name).status, 'FAIL');
    assert.equal(stepNamed(report, name).detail, null);
    assertSerializedDetails(report);
  });
}

// The MAWS harness's additions (docs/doperpowers/specs/2026-10-08-maws-in-app-browser-design.md, acceptance 3 and 7).
test('#submit writes submitted:<#name\'s value> to #state; #popup opens /popup, a document of its own with the page\'s marker', async t => {
  const handlers = {}, opened = [];
  const elements = Object.fromEntries(['alert', 'confirm', 'state', 'file', 'picked', 'name', 'submit', 'popup'].map(id => [id, {
    textContent: 'waiting', value: '', addEventListener: (event, fn) => { handlers[`${id}:${event}`] = fn; },
  }]));
  vm.runInNewContext(SCRIPT, {document: {getElementById: id => elements[id]}, window: {open: (...args) => { opened.push(args); return null; }}, setTimeout: () => {}});
  elements.name.value = 'x';
  handlers['submit:click']();
  assert.equal(elements.state.textContent, 'submitted:x');
  handlers['popup:click']();
  assert.deepEqual(opened, [['/popup']]);

  const page = await startFeaturesPage();
  t.after(() => page.close());
  const html = (await get(page.url)).body.toString('utf8');
  assert.match(html, /<input id="name" type="text">/);
  assert.match(html, /<button id="submit" type="button">Submit<\/button>/);
  assert.match(html, /<button id="popup" type="button">Popup<\/button>/);
  const popup = await get(`${page.origin}/popup`);
  assert.equal(popup.status, 200);
  assert.equal(popup.headers['content-type'], 'text/html; charset=utf-8');
  assert.equal(popup.headers['cache-control'], 'no-store');
  assert.match(popup.headers['content-security-policy'], /default-src 'none'/);
  assert.ok(popup.body.toString('utf8').includes(`<p id="marker">${page.documentMarker}-popup</p>`));
});
