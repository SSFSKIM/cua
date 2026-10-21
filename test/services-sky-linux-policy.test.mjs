// Linux approvals (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Design "The service", Policy and
// approvals, its Linux sentence; Decision Log "M3 pre-flight" item 4): the trusted sky wrapper asks before every
// sky_linux method that reads or drives a window, keyed by the app sky_linux lists for that window, and before
// launch_app, keyed by its app id; input without a window asks for the whole desktop; listing, the desktop screenshot
// and releasing a clipboard handle ask nothing. Nothing is forbidden on Linux and every approval is low risk. The
// supervisor's approval memory answers repeats, as on macOS. Everything below the wrapper is a double.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {isComputerUseApproval} from '../scripts/accept/lib.mjs';
import {approvalMemory, elicitationParams} from '../src/repl-host/elicitation.mjs';
import {DESKTOP_APPROVAL, LINUX_WINDOW_METHODS, linuxApprovalRequest} from '../src/services/engine/policy.mjs';
import {createSkyService} from '../src/services/sky.mjs';

const window = (id, app, title = `window ${id}`) => ({app, focused: false, height: 600, id, modal: false, title, width: 800, window_type: 'normal', x: 0, y: 0});
const GEDIT = window(7, 'org.gnome.gedit', 'notes.txt - gedit');
const TERMINAL = window(8, 'org.gnome.Terminal', 'shell');
const WINDOWS = [GEDIT, TERMINAL];
const execute = (method, input) => ({type: 'execute', method, args: input === undefined ? [] : [input]});
const ACCEPT = {action: 'accept', content: {}, _meta: {persist: 'session'}};

// The trusted worker's nodeRepl as the wrapper's policy uses it, the client answering `answer(message)`; `memory` puts
// the supervisor's approval memory in front of the client, as the own host does.
function worker({answer = () => ACCEPT, memory = false} = {}) {
  const asked = [];
  const remembered = approvalMemory();
  const nodeRepl = {
    requestMeta: {'x-codex-turn-metadata': {call_id: 'call-3'}},
    createElicitation: async request => {
      const message = {message: request.message, meta: request.meta};
      const recalled = memory ? remembered.recall(message) : null;
      if (recalled) { const {ok, ...fields} = recalled; return fields; }
      asked.push(structuredClone(request));
      const outcome = {ok: true, ...answer(request)};
      if (memory) remembered.record(message, outcome);
      const {ok, ...fields} = outcome;
      return fields;
    },
  };
  return {nodeRepl, asked};
}

// The wrapper on Linux over a sky_linux double listing WINDOWS; `received` is every request the vendor got.
function linux({answer, memory, windows = WINDOWS, apps = [], env = {}, read} = {}) {
  const w = worker({answer, memory});
  const received = [];
  const launched = [];
  const reads = [];
  const vendor = {handleRpc: async request => {
    received.push(structuredClone(request));
    if (request.method === 'list_windows') return windows;
    if (request.method === 'list_apps') return apps;
    return {done: request.method ?? request.type};
  }};
  const service = createSkyService({loadVendor: async () => vendor, platform: 'linux', nodeRepl: w.nodeRepl, env,
    secrets: {read: read ?? (async label => { reads.push(label); return 'stored-Value-41c2'; })}, openApplication: async target => { launched.push(target); }});
  const delivered = () => received.filter(r => r.method !== 'list_windows');
  return {service, received, delivered, launched, reads, ...w};
}

const rejection = async promise => { try { await promise; } catch (error) { return error; } assert.fail('expected a rejection'); };

test('the Linux approval is the macOS shape keyed by the Linux app: low risk whatever the app, which the harness matcher accepts once the host makes the request', () => {
  const request = linuxApprovalRequest({toolName: 'click', key: 'org.gnome.gedit', display: 'org.gnome.gedit', callId: 'call-3'});
  assert.deepEqual(request, {
    message: 'Allow Computer Use to use "org.gnome.gedit"?',
    meta: {
      codex_approval_kind: 'mcp_tool_call', connector_id: 'computer-use', connector_name: 'Computer Use', persist: ['session'], riskLevel: 'low',
      tool_call_id: 'call-3', tool_name: 'click', tool_params: {app: 'org.gnome.gedit'},
      tool_params_display: [{name: 'app', display_name: 'App', value: 'org.gnome.gedit'}],
    },
  });
  const {params} = elicitationParams({message: request.message, requested_schema: {type: 'object', properties: {}}, meta: request.meta}, {formSupported: true});
  assert.ok(isComputerUseApproval({method: 'elicitation/create', params}, {app: 'org.gnome.gedit'}));
  assert.equal(isComputerUseApproval({method: 'elicitation/create', params}, {app: 'org.gnome.Terminal'}), false, 'pinned to one app');
  // No Linux risk list: an id the macOS table happens to name is still low risk on Linux (no source says otherwise; #171's).
  assert.equal(linuxApprovalRequest({toolName: 'click', key: 'org.chromium.Chromium', display: 'org.chromium.Chromium'}).meta.riskLevel, 'low');
});

test('every method that reads or drives a window asks, keyed by the app sky_linux lists for that window id, not the app the request names', async () => {
  for (const method of LINUX_WINDOW_METHODS) {
    const {service, asked, delivered} = linux();
    // The request claims gedit for the terminal's window: the approval asked is the terminal's.
    const request = execute(method, {window: {...TERMINAL, app: 'org.gnome.gedit'}, key: 'a'});
    assert.deepEqual(await service.handleRpc(request), {done: method}, method);
    assert.deepEqual(asked.map(a => [a.meta.tool_name, a.meta.tool_params.app]), [[method, 'org.gnome.Terminal']], method);
    assert.deepEqual(delivered(), [request], `${method}: delivered unchanged after the approval`);
  }
});

test('anything but accept fails "Computer Use was not approved to use <app>" and delivers nothing', async () => {
  for (const action of ['decline', 'cancel']) {
    const {service, delivered} = linux({answer: () => ({action, content: null, _meta: null})});
    const error = await rejection(service.handleRpc(execute('click', {window: GEDIT, x: 1, y: 2})));
    assert.equal(error.message, 'Computer Use was not approved to use org.gnome.gedit');
    assert.deepEqual(delivered(), []);
  }
});

test('the supervisor\'s memory answers a repeat for the same app, across its windows, and another app asks', async () => {
  const second = window(9, 'org.gnome.gedit', 'other.txt - gedit');
  const {service, asked} = linux({memory: true, windows: [...WINDOWS, second]});
  await service.handleRpc(execute('get_window_state', {window: GEDIT}));
  await service.handleRpc(execute('press_key', {window: GEDIT, key: 'a'}));
  await service.handleRpc(execute('type_text', {window: second, text: 'b'}));
  assert.equal(asked.length, 1, 'one approval for gedit, whichever of its windows');
  await service.handleRpc(execute('click', {window: TERMINAL, x: 1, y: 1}));
  assert.deepEqual(asked.map(a => a.meta.tool_params.app), ['org.gnome.gedit', 'org.gnome.Terminal']);

  const declined = linux({memory: true, answer: () => ({action: 'decline', content: null, _meta: null})});
  for (let i = 0; i < 3; i++) await rejection(declined.service.handleRpc(execute('click', {window: GEDIT, x: 1, y: 1})));
  assert.equal(declined.asked.length, 1, 'a decline is remembered too: a retry is not re-prompted');
});

test('input without a window, move_relative and a drag handle\'s start ask once for the whole desktop; the handle\'s moves and end ride on it', async () => {
  const {service, asked, delivered} = linux({memory: true});
  const requests = [
    execute('click', {x: 1, y: 2}), execute('press_key', {key: 'super'}), execute('type_text', {window: null, text: 'x'}),
    execute('move_relative', {dx: 1, dy: 1}), execute('move_relative', {dx: 1, dy: 1, window: GEDIT}),
    {type: 'drag_start', handle_id: 'h', point: {x: 1, y: 1}}, {type: 'drag_move', handle_id: 'h', point: {x: 2, y: 2}}, {type: 'drag_end', handle_id: 'h'},
  ];
  for (const request of requests) await service.handleRpc(request);
  assert.deepEqual(asked.map(a => [a.message, a.meta.tool_name, a.meta.tool_params.app]),
    [[`Allow Computer Use to use "${DESKTOP_APPROVAL.display}"?`, 'click', DESKTOP_APPROVAL.key]]);
  assert.deepEqual(delivered(), requests);

  const fresh = linux();
  for (const request of requests.slice(3)) await fresh.service.handleRpc(request);
  assert.deepEqual(fresh.asked.map(a => a.meta.tool_name), ['move_relative', 'move_relative', 'drag_handle'],
    'move_relative is desktop-wide whatever window it names; a handle asks at its start only');
  assert.equal(fresh.received.some(r => r.method === 'list_windows'), false, 'nothing desktop-wide resolves a window');
});

test('listing, the desktop screenshot, releasing a clipboard handle and setup ask nothing and go to the vendor unchanged', async () => {
  const {service, asked, received} = linux();
  const requests = [{type: 'setup'}, execute('list_apps'), execute('get_screenshot'), execute('clipboard_release', {handle: 'c1'})];
  for (const request of requests) await service.handleRpc(request);
  await service.handleRpc(execute('list_windows'));
  assert.deepEqual(asked, []);
  assert.deepEqual(received, [...requests, execute('list_windows')]);
});

test('a window the vendor does not list, or a request that names no usable window, is refused before anything is asked or delivered', async () => {
  const cases = [
    [execute('click', {window: window(99, 'org.gnome.gedit'), x: 1, y: 1}), 'Window 99 is unavailable.'],
    [execute('click', {window: {id: 0, app: 'org.gnome.gedit'}}), 'Computer Use app approval requires a window from listWindows()'],
    [execute('click', {window: {id: '7', app: 'org.gnome.gedit'}}), 'Computer Use app approval requires a window from listWindows()'],
    [execute('click', {window: [GEDIT]}), 'Computer Use app approval requires a window from listWindows()'],
    [execute('click', {window: 7}), 'Computer Use app approval requires a window from listWindows()'],
    [execute('click'), 'Computer Use app approval requires an object input'],
    [{type: 'execute', method: 'click', args: ['gedit']}, 'Computer Use app approval requires an object input'],
  ];
  for (const [request, sentence] of cases) {
    const {service, asked, delivered} = linux();
    assert.equal((await rejection(service.handleRpc(request))).message, sentence, JSON.stringify(request));
    assert.deepEqual([asked, delivered()], [[], []], JSON.stringify(request));
  }
  const unnamed = linux({windows: [{...GEDIT, app: ''}]});
  assert.equal((await rejection(unnamed.service.handleRpc(execute('click', {window: GEDIT, x: 1, y: 1})))).message, 'Window 7 names no app to approve.');
});

test('a method the vendor looks up by coerced key is the method it names: an array method is approved as that method', async () => {
  const {service, asked} = linux();
  await service.handleRpc({type: 'execute', method: ['click'], args: [{window: GEDIT, x: 1, y: 1}]});
  assert.deepEqual(asked.map(a => a.meta.tool_name), ['click']);
});

function desktop(t) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cua-linux-policy-')));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(join(root, 'share', 'applications'), {recursive: true});
  const entry = join(root, 'share', 'applications', 'org.gnome.gedit.desktop');
  writeFileSync(entry, '[Desktop Entry]\n');
  return {env: {HOME: join(root, 'home'), XDG_DATA_DIRS: join(root, 'share')}, entry};
}

test('launch_app asks keyed by its app id once sky_linux lists it, then launches; an unlisted id fails first and asks nothing', async t => {
  const d = desktop(t);
  const apps = [{id: 'org.gnome.gedit.desktop', name: 'gedit', windows: []}];
  const ok = linux({apps, env: d.env});
  assert.equal(await ok.service.handleRpc(execute('launch_app', {app: 'org.gnome.gedit.desktop'})), undefined);
  assert.deepEqual(ok.asked.map(a => [a.meta.tool_name, a.meta.tool_params.app]), [['launch_app', 'org.gnome.gedit.desktop']]);
  assert.deepEqual(ok.launched, [{applicationPath: d.entry}]);

  const missing = linux({apps, env: d.env});
  await assert.rejects(missing.service.handleRpc(execute('launch_app', {app: 'cua-m4-nonexistent-fixture-application'})),
    {message: 'launchable application "cua-m4-nonexistent-fixture-application" was not found'});
  assert.deepEqual([missing.asked, missing.launched], [[], []]);

  const declined = linux({apps, env: d.env, answer: () => ({action: 'decline', content: null, _meta: null})});
  await assert.rejects(declined.service.handleRpc(execute('launch_app', {app: 'org.gnome.gedit.desktop'})), {message: 'Computer Use was not approved to use org.gnome.gedit.desktop'});
  assert.deepEqual(declined.launched, []);

  // Any other launch_app shape still goes to the vendor, behind the approval of the app it names; one naming none is refused.
  const other = linux({apps, env: d.env});
  const extra = execute('launch_app', {app: 'org.gnome.gedit.desktop', extra: 1});
  assert.deepEqual(await other.service.handleRpc(extra), {done: 'launch_app'});
  assert.deepEqual(other.asked.map(a => a.meta.tool_params.app), ['org.gnome.gedit.desktop']);
  for (const request of [execute('launch_app', {app: 7}), execute('launch_app')])
    assert.match((await rejection(other.service.handleRpc(request))).message, /^Computer Use app approval requires /);
  assert.deepEqual(other.delivered().filter(r => r.method === 'launch_app'), [extra]);
});

test('secrets on Linux: the wrapper\'s own refusals come before the approval; a substituted type_text is approved before the store is read', async () => {
  const REF = '{{secret:WORK_PASSWORD}}';
  const refused = linux();
  for (const text of ['{{secret:bad label}}', '{{secret:CUA_DEVICE_TOKEN}}']) await rejection(refused.service.handleRpc(execute('type_text', {window: GEDIT, text})));
  assert.deepEqual([refused.asked, refused.reads, refused.delivered()], [[], [], []]);

  const declined = linux({answer: () => ({action: 'decline', content: null, _meta: null})});
  assert.equal((await rejection(declined.service.handleRpc(execute('type_text', {window: GEDIT, text: REF})))).message, 'Computer Use was not approved to use org.gnome.gedit');
  assert.deepEqual([declined.reads, declined.delivered()], [[], []], 'a declined app reads no secret');

  const accepted = linux();
  await accepted.service.handleRpc(execute('type_text', {window: GEDIT, text: REF}));
  assert.deepEqual(accepted.asked.map(a => a.meta.tool_params.app), ['org.gnome.gedit']);
  assert.deepEqual(accepted.delivered(), [execute('type_text', {window: GEDIT, text: 'stored-Value-41c2'})]);
  assert.equal(JSON.stringify(accepted.asked).includes('stored-Value-41c2'), false, 'the approval never carries the value');
});

test('macOS is untouched: the wrapper asks nothing there (cua\'s engine service and the vendor\'s ask for themselves)', async () => {
  const w = worker();
  const service = createSkyService({loadVendor: async () => ({handleRpc: async () => 'vendor'}), platform: 'darwin', nodeRepl: w.nodeRepl, secrets: {}, setResponseMeta: () => {}});
  assert.equal(await service.handleRpc(execute('click', {app: 'com.apple.TextEdit', element_index: 1})), 'vendor');
  assert.deepEqual(w.asked, []);
});
