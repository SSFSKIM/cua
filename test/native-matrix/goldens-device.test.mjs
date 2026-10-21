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
import {RESET_MAY_CLEAR, SCREENSHOT_DIR, SETTLE_BOUND_MS, SETTLE_INTERVAL_MS, act, engineCheck, engineNodeRepl, goldenForm, main, observe, runSteps, settledState, stateDigest} from '../../scripts/native-matrix/goldens-device.mjs';

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
// A clock whose sleep advances it: the stability read's reads, their spacing and its bound, without waiting.
const fakeClock = () => { let t = 0; const slept = []; return {now: () => t, sleep: async ms => { slept.push(ms); t += ms; }, slept}; };
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

test('observe: the settled full observation with the screenshot, the image removed, the diagnostics kept apart from the Skyshot', async () => {
  const run = scratch(), screenshots = join(run, SCREENSHOT_DIR);
  fs.mkdirSync(screenshots);
  const image = join(screenshots, 'shot.jpg');
  fs.writeFileSync(image, 'jpeg');
  const recorded = shot('textedit', 'skyshot.json');
  const client = fakeClient(Array(2).fill({...recorded, screenshot: {...recorded.screenshot, url: pathToFileURL(image).href}, timings: {focusRead: 'outsideTheWalk'}}));
  const out = await observe({id: 'textedit', record: recordOf('textedit', recorded.app.pid), client, screenshots, ...fakeClock()});
  // Two reads that render alike: the state held for one interval.
  const call = {method: 'get_app_state', args: {app: '/Applications/textedit.app', includeScreenshot: true, outputDirectory: screenshots, disableDiff: true}, options: {}};
  assert.deepEqual(client.calls, [call, call]);
  assert.deepEqual(out.problems, []);
  assert.equal(out.skyshot.timings, undefined);
  assert.deepEqual(out.timings, {focusRead: 'outsideTheWalk'});
  assert.deepEqual(out.frame, recorded.window.frame);
  assert.deepEqual(out.settle, {reads: 2, ms: SETTLE_INTERVAL_MS});
  assert.equal(out.build, client.identity.build);
  assert.equal(fs.existsSync(image), false);
});

test('observe: an image outside the run\'s screenshot directory is never removed', async () => {
  const run = scratch(), elsewhere = join(run, 'elsewhere.jpg');
  fs.writeFileSync(elsewhere, 'jpeg');
  const recorded = shot('electron', 'skyshot.json');
  const client = fakeClient(Array(2).fill({...recorded, screenshot: {...recorded.screenshot, url: pathToFileURL(elsewhere).href}}));
  await observe({id: 'electron', record: recordOf('electron', recorded.app.pid), client, screenshots: join(run, SCREENSHOT_DIR), ...fakeClock()});
  assert.equal(fs.existsSync(elsewhere), true);
});

test('observe: a Finder window showing what the run does not own is refused and its Skyshot never leaves', async () => {
  // M0's Finder capture still shows the sidebar (a second outline) and the owner's strings, redacted to their length.
  const recorded = shot('finder', 'skyshot.json');
  const record = recordOf('finder', recorded.app.pid, {folder: '/run/finder/cua-scene-finder'});
  const client = fakeClient([recorded]);
  const out = await observe({id: 'finder', record, client, screenshots: '/run/s', ...fakeClock()});
  assert.equal(client.calls.length, 1, 'what waiting cannot change is refused at once');
  assert.equal(out.skyshot, null);
  const codes = out.problems.map(p => p.code);
  assert.ok(codes.includes('sidebar_shown') && codes.includes('unowned_text'), codes.join(', '));
  assert.doesNotMatch(JSON.stringify(out), /⟨\d+⟩/);
});

test('observe: another process or another window of the app is refused', async () => {
  const recorded = shot('textedit', 'skyshot.json');
  const otherPid = await observe({id: 'textedit', record: recordOf('textedit', recorded.app.pid + 1), client: fakeClient([recorded]), screenshots: '/s', ...fakeClock()});
  assert.deepEqual(otherPid.problems.map(p => p.code), ['other_process']);
  // A window whose title is not yet the scene's may still become it: read again until the bound, then refused.
  const clock = fakeClock(), untitled = fakeClient(Array(30).fill({...recorded, window: {...recorded.window, title: 'Untitled'}}));
  const otherWindow = await observe({id: 'textedit', record: recordOf('textedit', recorded.app.pid), client: untitled, screenshots: '/s', ...clock});
  assert.deepEqual(otherWindow.problems.map(p => p.code), ['other_window']);
  assert.equal(untitled.calls.length, SETTLE_BOUND_MS / SETTLE_INTERVAL_MS + 1);
  assert.equal(clock.now(), SETTLE_BOUND_MS);
  assert.equal(otherWindow.skyshot, null);
  assert.doesNotMatch(JSON.stringify(otherWindow.problems), /Untitled/);
});

test('act: the target found in cua\'s own rendering, clicked by its token in the lineage, then the next observation in that lineage', async () => {
  const before = shot('textedit', 'action.before.skyshot.json'), after = shot('textedit', 'action.after.skyshot.json');
  const client = fakeClient([before, before, {meta: {inputRoute: 3}}, after]);
  const out = await act({id: 'textedit', record: recordOf('textedit', before.app.pid), client, screenshots: '/s', expect: digestOf(before), ...fakeClock()});
  assert.deepEqual(out.problems, []);
  assert.deepEqual(client.calls.map(c => c.method), ['get_app_state', 'get_app_state', 'click', 'get_app_state']);
  assert.equal(client.calls[0].args.disableDiff, true);
  client.calls.splice(0, 1);   // the stability read's first of two
  // The document's text area: the first element line naming the document's first line (index 2 in this capture).
  const textArea = before.nodes.find(n => n.role === 'AXTextArea');
  assert.deepEqual(client.calls[1].args, {app: '/Applications/textedit.app', element: textArea.token});
  assert.deepEqual(client.calls[1].options, {lineage: before.lineage});
  assert.equal(client.calls[2].args.disableDiff, undefined);
  assert.deepEqual(out.click, {index: 2, route: 3});
  assert.equal(out.before.lineage, out.after.lineage);
});

test('act: a target the settled tree does not expose is not clicked', async () => {
  const before = shot('electron', 'action.before.skyshot.json');
  const without = {...before, nodes: before.nodes.filter(n => n.title !== 'Fixture button' && n.description !== 'Fixture button')};
  const client = fakeClient([without, without]);
  const out = await act({id: 'electron', record: recordOf('electron', before.app.pid), client, screenshots: '/s', expect: digestOf(without), ...fakeClock()});
  assert.deepEqual(client.calls.map(c => c.method), Array(2).fill('get_app_state'));
  assert.deepEqual(out.problems.map(p => p.code), ['target_missing']);
  assert.equal(out.before, null);
});

test('act: a click the engine refuses, or an after observation in another lineage, records nothing', async () => {
  const before = shot('textedit', 'action.before.skyshot.json'), after = shot('textedit', 'action.after.skyshot.json');
  const refused = new SkyComputerUseError({code: -10005, reason: 'the activation guard failed', errorName: 'activationFailed'});
  const failed = await act({id: 'textedit', record: recordOf('textedit', before.app.pid), client: fakeClient([before, before, refused]), screenshots: '/s', expect: digestOf(before), ...fakeClock()});
  assert.deepEqual(failed.problems.map(p => p.code), ['click_failed']);
  assert.match(failed.problems[0].message, /activationFailed/);
  const moved = await act({id: 'textedit', record: recordOf('textedit', before.app.pid), client: fakeClient([before, before, {meta: {}}, {...after, lineage: 'Lother'}]), screenshots: '/s', expect: digestOf(before), ...fakeClock()});
  assert.deepEqual(moved.problems.map(p => p.code), ['lineage_changed']);
  assert.equal(moved.after, null);
});

test('act: a Finder state that shows what the run does not own clicks nothing', async () => {
  const before = shot('finder', 'action.before.skyshot.json');
  const client = fakeClient([before]);
  const out = await act({id: 'finder', record: recordOf('finder', before.app.pid, {folder: '/run/finder/cua-scene-finder'}), client, screenshots: '/s', expect: digestOf(before), ...fakeClock()});
  assert.deepEqual(client.calls.map(c => c.method), ['get_app_state']);
  assert.ok(out.problems.length > 0);
});

test('act: clicks only once the observation has settled as the kept fixed state, port drift aside; never when it settles elsewhere', async () => {
  const fixed = shot('chrome', 'skyshot.json');
  const record = recordOf('chrome', fixed.app.pid);
  const loading = {...fixed, nodes: fixed.nodes.slice(0, 3)};
  // A restart serves the page on another port: the same state.
  const moved = JSON.parse(JSON.stringify(fixed).replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:1'));
  assert.notEqual(JSON.stringify(moved), JSON.stringify(fixed));
  const client = fakeClient([loading, moved, moved, {meta: {inputRoute: 3}}, moved]);
  const out = await act({id: 'chrome', record, client, screenshots: '/s', expect: digestOf(fixed), ...fakeClock()});
  assert.deepEqual(out.problems, []);
  assert.deepEqual(client.calls.map(c => c.method), ['get_app_state', 'get_app_state', 'get_app_state', 'click', 'get_app_state']);
  // A page that settles in another state (here, its option checked) is not the fixed state: refused, nothing clicked,
  // the settled observation carried for the controller's diagnostic.
  const checked = {...fixed, nodes: fixed.nodes.map(n => (n.role === 'AXCheckBox' ? {...n, value: 1} : n))};
  const elsewhere = fakeClient([checked, checked]);
  const refused = await act({id: 'chrome', record, client: elsewhere, screenshots: '/s', expect: digestOf(fixed), ...fakeClock()});
  assert.deepEqual(refused.problems.map(p => p.code), ['start_state']);
  assert.equal(elsewhere.calls.some(c => c.method === 'click'), false);
  assert.deepEqual(refused.observed, goldenForm(checked));
  await assert.rejects(act({id: 'chrome', record, client: fakeClient([fixed, fixed]), screenshots: '/s'}), /--expect/);
});

test('act: a page that never fills within the bound is refused as still filling, for the controller to reset', async () => {
  const fixed = shot('chrome', 'skyshot.json');
  const early = JSON.parse(fs.readFileSync(new URL('../../docs/doperpowers/research/2026-10-18-own-native-engine/m1b/goldens-run/goldens/chrome/skyshot.json', import.meta.url), 'utf8'));
  const never = fakeClient(Array(30).fill(early));
  const clock = fakeClock();
  const refused = await act({id: 'chrome', record: recordOf('chrome', early.app.pid), client: never, screenshots: '/s', expect: digestOf(fixed), ...clock});
  assert.deepEqual(refused.problems.map(p => p.code), ['page_filling']);
  assert.ok(RESET_MAY_CLEAR.includes('page_filling'));
  assert.equal(never.calls.some(c => c.method === 'click'), false);
  assert.equal(clock.now(), SETTLE_BOUND_MS);
});

test('act: a window of the run\'s process still showing a temporary title is observed again; one that keeps it is refused', async () => {
  const fixed = shot('electron', 'skyshot.json');
  const record = recordOf('electron', fixed.app.pid);
  const untitled = structuredClone(fixed);
  untitled.window.title = 'Electron';
  const client = fakeClient([untitled, fixed, fixed, {meta: {inputRoute: 3}}, fixed]);
  const out = await act({id: 'electron', record, client, screenshots: '/s', expect: digestOf(fixed), ...fakeClock()});
  assert.deepEqual(out.problems, []);
  assert.deepEqual(client.calls.map(c => c.method), ['get_app_state', 'get_app_state', 'get_app_state', 'click', 'get_app_state']);
  const stays = fakeClient(Array(30).fill(untitled));
  const refused = await act({id: 'electron', record, client: stays, screenshots: '/s', expect: digestOf(fixed), ...fakeClock()});
  assert.deepEqual(refused.problems.map(p => p.code), ['other_window']);
  assert.equal(stays.calls.length, SETTLE_BOUND_MS / SETTLE_INTERVAL_MS + 1);
  assert.equal('observed' in refused, false);
  // Another process is refused at once.
  const other = fakeClient([{...fixed, app: {...fixed.app, pid: fixed.app.pid + 1}}]);
  const gone = await act({id: 'electron', record, client: other, screenshots: '/s', expect: digestOf(fixed), ...fakeClock()});
  assert.equal(other.calls.length, 1);
  assert.ok(gone.problems.some(p => p.code === 'other_process'));
});

test('settledState: does not return a state before two consecutive reads, an interval apart, render alike', async () => {
  // The M1b.5 sitting's Chrome: the page's controls fill in after the first reads; the read goes on until the filled
  // page has held for one interval.
  const filled = shot('chrome', 'skyshot.json');
  const early = JSON.parse(fs.readFileSync(new URL('../../docs/doperpowers/research/2026-10-18-own-native-engine/m1b/goldens-run/goldens/chrome/skyshot.json', import.meta.url), 'utf8'));
  early.app = {...early.app, pid: filled.app.pid};   // the same launch, read earlier
  const moving = {...filled, nodes: filled.nodes.map(n => (n.role === 'AXTextArea' ? {...n, value: 'x'} : n))};
  const record = recordOf('chrome', filled.app.pid);
  const client = fakeClient([early, early, moving, filled, filled, moving]);
  const clock = fakeClock();
  const out = await settledState({id: 'chrome', record, client, screenshots: '/s', ...clock});
  assert.deepEqual(out.problems, []);
  assert.equal(stateDigest(goldenForm(out.shot)), digestOf(filled));
  assert.equal(client.calls.length, 5, 'two unfilled reads, one that moved, then the filled page twice');
  assert.deepEqual(clock.slept, Array(4).fill(SETTLE_INTERVAL_MS));
  assert.deepEqual(out.settle, {reads: 5, ms: 4 * SETTLE_INTERVAL_MS});
});

test('settledState: a state that keeps changing within the bound is refused as unstable, with its last read for the diagnostic', async () => {
  const fixed = shot('textedit', 'skyshot.json');
  const record = recordOf('textedit', fixed.app.pid);
  let n = 0;
  const client = fakeClient(Array(40).fill(() => ({...fixed, nodes: fixed.nodes.map((node, i) => (i === 1 ? {...node, value: `v${n++}`} : node))})));
  const clock = fakeClock();
  const out = await settledState({id: 'textedit', record, client, screenshots: '/s', ...clock});
  assert.deepEqual(out.problems.map(p => p.code), ['unstable']);
  assert.ok(RESET_MAY_CLEAR.includes('unstable'));
  assert.equal(out.shot, null);
  assert.equal(out.observed.nodes[1].value, `v${n - 1}`);
  assert.equal(client.calls.length, SETTLE_BOUND_MS / SETTLE_INTERVAL_MS + 1, 'read every interval until the bound, then no more');
  assert.equal(clock.now(), SETTLE_BOUND_MS);
});

test('settledState: proceeds at once when the first two reads render alike; the bound and the spacing are the caller\'s to set', async () => {
  const fixed = shot('electron', 'skyshot.json');
  const record = recordOf('electron', fixed.app.pid);
  const clock = fakeClock();
  const client = fakeClient([fixed, fixed, fixed]);
  const out = await settledState({id: 'electron', record, client, screenshots: '/s', ...clock});
  assert.deepEqual(out.problems, []);
  assert.equal(client.calls.length, 2);
  assert.equal(clock.now(), SETTLE_INTERVAL_MS);
  const quick = fakeClock();
  const once = await settledState({id: 'electron', record, client: fakeClient([fixed, fixed]), screenshots: '/s', boundMs: 300, intervalMs: 100, ...quick});
  assert.deepEqual([once.problems, quick.slept], [[], [100]]);
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
