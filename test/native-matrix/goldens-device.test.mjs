// The goldens recorder's device side (scripts/native-matrix/goldens-device.mjs): cua's raw Skyshot straight from the
// approved engine's socket, the fixed-state refusal before anything leaves the device, the action sequence in one
// lineage, the build check and the guarded scene steps. Driven through a fake engine client whose answers are the
// committed goldens' recorded Skyshots (M0's real captures); nothing is launched and no socket is opened.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {SkyComputerUseError} from '../../src/services/engine/protocol.mjs';
import {DESELECT_ALL_KEY} from '../../scripts/repl-parity/scenes-mac-finder.mjs';
import {EventEmitter} from 'node:events';
import {SCREENSHOT_DIR, act, engineCheck, engineNodeRepl, goldenForm, main, observe, runSteps, stateDigest} from '../../scripts/native-matrix/goldens-device.mjs';

const GOLDENS = new URL('../native-goldens/', import.meta.url);
const shot = (scene, name) => JSON.parse(fs.readFileSync(new URL(`${scene}/${name}`, GOLDENS), 'utf8'));
const scratches = [];
const scratch = () => { const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'cua-goldens-device-'))); scratches.push(dir); return dir; };
after(() => { for (const dir of scratches) fs.rmSync(dir, {recursive: true, force: true}); });

// A fake EngineClient: answers in order, records every request.
function fakeClient(answers, {build = 'b'.repeat(64)} = {}) {
  const calls = [];
  return {calls, identity: {build, engineVersion: '0.1.0'}, closed: false,
    async execute(method, args, options = {}) {
      calls.push({method, args, options});
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      return {result: typeof answer === 'function' ? answer(args) : structuredClone(answer), engineMs: 1};
    },
    close() { this.closed = true; }};
}
const digestOf = shot => stateDigest(goldenForm(shot));
const recordOf = (scene, pid, extra = {}) => ({scene, app: `/Applications/${scene}.app`, bundleId: `test.${scene}`, pid, window: {number: 7, bounds: {x: 0, y: 0, width: 100, height: 100}}, ...extra});

test('engineCheck: refuses without an approved engine and when the approved build is not the checkout\'s', () => {
  const checkout = {build: 'c'.repeat(64), engineVersion: '0.1.0'};
  assert.deepEqual(engineCheck({installed: null, checkout}).problems.length, 1);
  assert.match(engineCheck({installed: null, checkout}).problems[0], /no approved engine/);
  const other = engineCheck({installed: {bundlePath: '/e/cua Engine.app', build: 'a'.repeat(64), engineVersion: '0.1.0', approvedAt: 't'}, checkout});
  assert.equal(other.ok, false);
  assert.match(other.problems[0], /aaaaaaaaaaaa.*cccccccccccc|cccccccccccc.*aaaaaaaaaaaa/);
  const same = engineCheck({installed: {bundlePath: '/e/cua Engine.app', build: checkout.build, engineVersion: '0.1.0', approvedAt: 't'}, checkout});
  assert.deepEqual(same, {ok: true, engine: {bundlePath: '/e/cua Engine.app', build: checkout.build, engineVersion: '0.1.0', approvedAt: 't', signature: {kind: null, identityMatches: null}}, checkout, problems: []});
});

test('engineCheck: the signature leaves as its kind and whether it matches, never the identity', () => {
  const sha1 = 'A1B2C3D4E5F60718293A4B5C6D7E8F9012345678';
  const installed = {bundlePath: '/e/cua Engine.app', build: 'c'.repeat(64), engineVersion: '0.1.0', approvedAt: 't', identity: sha1};
  const signature = {kind: 'identity', sha1, authority: 'Apple Development: Someone (TEAM123456)'};
  const out = engineCheck({installed, checkout: {build: 'c'.repeat(64)}, signature, configured: sha1});
  assert.deepEqual(out.engine.signature, {kind: 'identity', identityMatches: true});
  assert.doesNotMatch(JSON.stringify(out), new RegExp(`${sha1}|Someone|TEAM123456`, 'i'));
  assert.equal(engineCheck({installed, checkout: {build: 'c'.repeat(64)}, signature, configured: 'B'.repeat(40)}).engine.signature.identityMatches, false);
});

test('engineNodeRepl: the socket resolves once connected and rejects on its error; the launch opens the bundle', async () => {
  const sockets = [], opened = [];
  const repl = engineNodeRepl({connect: path => { const socket = Object.assign(new EventEmitter(), {path}); sockets.push(socket); return socket; }, open: app => opened.push(app)});
  const connecting = repl.nativePipe.createConnection('/e/engine.sock');
  sockets[0].emit('connect');
  assert.equal((await connecting).path, '/e/engine.sock');
  assert.equal(sockets[0].listenerCount('error'), 0);
  const failing = repl.nativePipe.createConnection('/e/engine.sock');
  sockets[1].emit('error', Object.assign(new Error('connect ENOENT'), {code: 'ENOENT'}));
  await assert.rejects(failing, /ENOENT/);
  await repl.launchServices.openApplication({applicationPath: '/e/cua Engine.app'});
  assert.deepEqual(opened, ['/e/cua Engine.app']);
  assert.equal(repl.withSuspendedTimeout(() => 7), 7);
});

test('observe: one full observation with the screenshot, the image removed, the diagnostics kept apart from the Skyshot', async () => {
  const run = scratch(), screenshots = join(run, SCREENSHOT_DIR);
  fs.mkdirSync(screenshots);
  const image = join(screenshots, 'shot.jpg');
  fs.writeFileSync(image, 'jpeg');
  const recorded = shot('textedit', 'skyshot.json');
  const client = fakeClient([{...recorded, screenshot: {...recorded.screenshot, url: pathToFileURL(image).href}, timings: {focusRead: 'outsideTheWalk'}}]);
  const out = await observe({id: 'textedit', record: recordOf('textedit', recorded.app.pid), client, screenshots});
  assert.deepEqual(client.calls, [{method: 'get_app_state', args: {app: '/Applications/textedit.app', includeScreenshot: true, outputDirectory: screenshots, disableDiff: true}, options: {}}]);
  assert.deepEqual(out.problems, []);
  assert.equal(out.skyshot.timings, undefined);
  assert.deepEqual(out.timings, {focusRead: 'outsideTheWalk'});
  assert.deepEqual(out.frame, recorded.window.frame);
  assert.equal(out.build, client.identity.build);
  assert.equal(fs.existsSync(image), false);
});

test('observe: an image outside the run\'s screenshot directory is never removed', async () => {
  const run = scratch(), elsewhere = join(run, 'elsewhere.jpg');
  fs.writeFileSync(elsewhere, 'jpeg');
  const recorded = shot('electron', 'skyshot.json');
  const client = fakeClient([{...recorded, screenshot: {...recorded.screenshot, url: pathToFileURL(elsewhere).href}}]);
  await observe({id: 'electron', record: recordOf('electron', recorded.app.pid), client, screenshots: join(run, SCREENSHOT_DIR)});
  assert.equal(fs.existsSync(elsewhere), true);
});

test('observe: a Finder window showing what the run does not own is refused and its Skyshot never leaves', async () => {
  // M0's Finder capture still shows the sidebar (a second outline) and the owner's strings, redacted to their length.
  const recorded = shot('finder', 'skyshot.json');
  const record = recordOf('finder', recorded.app.pid, {folder: '/run/finder/cua-scene-finder'});
  const out = await observe({id: 'finder', record, client: fakeClient([recorded]), screenshots: '/run/s'});
  assert.equal(out.skyshot, null);
  const codes = out.problems.map(p => p.code);
  assert.ok(codes.includes('sidebar_shown') && codes.includes('unowned_text'), codes.join(', '));
  assert.doesNotMatch(JSON.stringify(out), /⟨\d+⟩/);
});

test('observe: another process or another window of the app is refused', async () => {
  const recorded = shot('textedit', 'skyshot.json');
  const otherPid = await observe({id: 'textedit', record: recordOf('textedit', recorded.app.pid + 1), client: fakeClient([recorded]), screenshots: '/s'});
  assert.deepEqual(otherPid.problems.map(p => p.code), ['other_process']);
  const otherWindow = await observe({id: 'textedit', record: recordOf('textedit', recorded.app.pid), client: fakeClient([{...recorded, window: {...recorded.window, title: 'Untitled'}}]), screenshots: '/s'});
  assert.deepEqual(otherWindow.problems.map(p => p.code), ['other_window']);
  assert.equal(otherWindow.skyshot, null);
  assert.doesNotMatch(JSON.stringify(otherWindow.problems), /Untitled/);
});

test('act: the target found in cua\'s own rendering, clicked by its token in the lineage, then the next observation in that lineage', async () => {
  const before = shot('textedit', 'action.before.skyshot.json'), after = shot('textedit', 'action.after.skyshot.json');
  const client = fakeClient([before, {meta: {inputRoute: 3}}, after]);
  const out = await act({id: 'textedit', record: recordOf('textedit', before.app.pid), client, screenshots: '/s', expect: digestOf(before)});
  assert.deepEqual(out.problems, []);
  assert.deepEqual(client.calls.map(c => c.method), ['get_app_state', 'click', 'get_app_state']);
  assert.equal(client.calls[0].args.disableDiff, true);
  // The document's text area: the first element line naming the document's first line (index 2 in this capture).
  const textArea = before.nodes.find(n => n.role === 'AXTextArea');
  assert.deepEqual(client.calls[1].args, {app: '/Applications/textedit.app', element: textArea.token});
  assert.deepEqual(client.calls[1].options, {lineage: before.lineage});
  assert.equal(client.calls[2].args.disableDiff, undefined);
  assert.deepEqual(out.click, {index: 2, route: 3});
  assert.equal(out.before.lineage, out.after.lineage);
});

test('act: a target the tree does not expose after five observations is not clicked', async () => {
  const before = shot('electron', 'action.before.skyshot.json');
  const without = {...before, nodes: before.nodes.filter(n => n.title !== 'Fixture button' && n.description !== 'Fixture button')};
  const client = fakeClient([without, without, without, without, without]);
  const out = await act({id: 'electron', record: recordOf('electron', before.app.pid), client, screenshots: '/s', expect: digestOf(without), retryMs: 0});
  assert.deepEqual(client.calls.map(c => c.method), Array(5).fill('get_app_state'));
  assert.deepEqual(out.problems.map(p => p.code), ['target_missing']);
  assert.equal(out.before, null);
});

test('act: a click the engine refuses, or an after observation in another lineage, records nothing', async () => {
  const before = shot('textedit', 'action.before.skyshot.json'), after = shot('textedit', 'action.after.skyshot.json');
  const refused = new SkyComputerUseError({code: -10005, reason: 'the activation guard failed', errorName: 'activationFailed'});
  const failed = await act({id: 'textedit', record: recordOf('textedit', before.app.pid), client: fakeClient([before, refused]), screenshots: '/s', expect: digestOf(before)});
  assert.deepEqual(failed.problems.map(p => p.code), ['click_failed']);
  assert.match(failed.problems[0].message, /activationFailed/);
  const moved = await act({id: 'textedit', record: recordOf('textedit', before.app.pid), client: fakeClient([before, {meta: {}}, {...after, lineage: 'Lother'}]), screenshots: '/s', expect: digestOf(before)});
  assert.deepEqual(moved.problems.map(p => p.code), ['lineage_changed']);
  assert.equal(moved.after, null);
});

test('act: a Finder state that shows what the run does not own clicks nothing', async () => {
  const before = shot('finder', 'action.before.skyshot.json');
  const client = fakeClient([before]);
  const out = await act({id: 'finder', record: recordOf('finder', before.app.pid, {folder: '/run/finder/cua-scene-finder'}), client, screenshots: '/s', expect: digestOf(before)});
  assert.deepEqual(client.calls.map(c => c.method), ['get_app_state']);
  assert.ok(out.problems.length > 0);
});

test('act: clicks only once the observation is the kept fixed state, port drift aside; never when it does not come back', async () => {
  const fixed = shot('chrome', 'skyshot.json');
  const record = recordOf('chrome', fixed.app.pid);
  const loading = {...fixed, nodes: fixed.nodes.slice(0, 3)};
  // A restart serves the page on another port: the same state.
  const moved = JSON.parse(JSON.stringify(fixed).replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:1'));
  assert.notEqual(JSON.stringify(moved), JSON.stringify(fixed));
  const client = fakeClient([loading, moved, {meta: {inputRoute: 3}}, moved]);
  const out = await act({id: 'chrome', record, client, screenshots: '/s', expect: digestOf(fixed), retryMs: 0});
  assert.deepEqual(out.problems, []);
  assert.deepEqual(client.calls.map(c => c.method), ['get_app_state', 'get_app_state', 'click', 'get_app_state']);
  const never = fakeClient(Array(5).fill(loading));
  const refused = await act({id: 'chrome', record, client: never, screenshots: '/s', expect: digestOf(fixed), retryMs: 0});
  assert.deepEqual(refused.problems.map(p => p.code), ['start_state']);
  assert.equal(never.calls.some(c => c.method === 'click'), false);
  await assert.rejects(act({id: 'chrome', record, client: fakeClient([fixed]), screenshots: '/s'}), /--expect/);
  // A refused start carries its last observation, which passed the scene's checks, for the controller's diagnostic.
  assert.deepEqual(refused.observed, goldenForm(loading));
});

test('act: a window of the run\'s process still showing a temporary title is observed again; one that keeps it is refused', async () => {
  const fixed = shot('electron', 'skyshot.json');
  const record = recordOf('electron', fixed.app.pid);
  const untitled = structuredClone(fixed);
  untitled.window.title = 'Electron';
  const client = fakeClient([untitled, fixed, {meta: {inputRoute: 3}}, fixed]);
  const out = await act({id: 'electron', record, client, screenshots: '/s', expect: digestOf(fixed), retryMs: 0});
  assert.deepEqual(out.problems, []);
  assert.deepEqual(client.calls.map(c => c.method), ['get_app_state', 'get_app_state', 'click', 'get_app_state']);
  const stays = fakeClient(Array(5).fill(untitled));
  const refused = await act({id: 'electron', record, client: stays, screenshots: '/s', expect: digestOf(fixed), retryMs: 0});
  assert.deepEqual(refused.problems.map(p => p.code), ['other_window']);
  assert.equal(stays.calls.length, 5);
  assert.equal('observed' in refused, false);
  // Another process is refused at once.
  const other = fakeClient([{...fixed, app: {...fixed.app, pid: fixed.app.pid + 1}}]);
  const gone = await act({id: 'electron', record, client: other, screenshots: '/s', expect: digestOf(fixed), retryMs: 0});
  assert.equal(other.calls.length, 1);
  assert.ok(gone.problems.some(p => p.code === 'other_process'));
});

test('steps: activations and keys in order, each key through the engine only while its guard is in front', async () => {
  const record = recordOf('finder', 400, {setup: [{activate: 'finder'}, {pressKey: 'super+2', guard: {pid: 400, window: 7}}, {pressKey: 'ctrl+super+s', hides: 'sidebar', guard: {pid: 400, window: 7}}]});
  const client = fakeClient([{meta: {inputRoute: "2'"}}, {meta: {inputRoute: "2'"}}]);
  const activated = [];
  const io = {activate: async id => { activated.push(id); return {ok: true}; }, frontmost: () => ({pid: 400, topWindow: {ownerPid: 400, number: 7}}), sleep: async () => {}};
  const out = await runSteps({id: 'finder', phase: 'setup', record, client, io});
  assert.deepEqual(activated, ['finder']);
  assert.deepEqual(client.calls.map(c => [c.method, c.args.key]), [['press_key', 'super+2'], ['press_key', 'ctrl+super+s']]);
  assert.deepEqual(out.steps.map(s => s.pressKey ?? s.activate), ['finder', 'super+2', 'ctrl+super+s']);
});

test('steps: a key whose guard is not in front stops the steps with nothing more sent', async () => {
  const record = recordOf('finder', 400, {setup: [{pressKey: 'super+2', guard: {pid: 400, window: 7}}, {pressKey: 'alt+super+a', guard: {pid: 400, window: 7}}]});
  const client = fakeClient([]);
  const io = {activate: async () => ({ok: true}), frontmost: () => ({pid: 401, topWindow: null}), sleep: async () => {}};
  await assert.rejects(runSteps({id: 'finder', phase: 'setup', record, client, io}), /super\+2 not sent/);
  assert.deepEqual(client.calls, []);
});

test('steps: Finder\'s reset deselects all in the run\'s window; the teardown steps are the scene\'s own', async () => {
  const record = recordOf('finder', 400, {bundleId: 'com.apple.finder'});
  const client = fakeClient([{meta: {}}, {meta: {}}]);
  const io = {activate: async () => ({ok: true}), frontmost: () => ({pid: 400, topWindow: {ownerPid: 400, number: 7}}), sleep: async () => {},
    teardown: () => [{activate: 'finder'}, {pressKey: 'super+w', closes: 'window', guard: {pid: 400, window: 7}}]};
  await runSteps({id: 'finder', phase: 'reset', record, client, io});
  assert.deepEqual(client.calls.map(c => c.args.key), [DESELECT_ALL_KEY]);
  await runSteps({id: 'finder', phase: 'teardown', run: '/run', record, client, io});
  assert.deepEqual(client.calls.map(c => c.args.key), [DESELECT_ALL_KEY, 'super+w']);
  const none = await runSteps({id: 'textedit', phase: 'reset', record: recordOf('textedit', 9), client, io});
  assert.deepEqual(none.steps, []);
});

test('main: a scene command needs the approved engine, and the client is closed whatever happens', async () => {
  const run = scratch();
  fs.writeFileSync(join(run, 'scenes.json'), JSON.stringify({scenes: {textedit: recordOf('textedit', 1)}}));
  await assert.rejects(main(['observe', 'textedit', '--run', run], {io: {installed: () => null}}), /no approved engine/);
  const client = fakeClient([new Error('socket closed')]);
  await assert.rejects(main(['observe', 'textedit', '--run', run], {io: {installed: () => ({bundlePath: '/e/cua Engine.app'}), client: () => client}}), /socket closed/);
  assert.equal(client.closed, true);
  await assert.rejects(main(['observe', 'finder', '--run', run], {io: {installed: () => ({bundlePath: '/e'}), client: () => fakeClient([])}}), /finder is not up/);
});
