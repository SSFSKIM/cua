// measure.mjs's second input sitting (scripts/spike/engine/measure/groups.mjs and input-groups.mjs; the own native
// engine spec, Decision Log 2026-10-19, U2–U6, U10, U12, U13): the phases a lane takes, the coordinate arithmetic in the
// screenshot's pixels, the route matrix's outcome predicates, the Electron fixture's counters and their deltas, the tap
// group's rows, and the operator's answers read line by line.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {PassThrough} from 'node:stream';
import {GROUPS, DEFAULT_GROUPS, parseGroups, parseTapModes, laneTakes, groupNotRunRows} from '../scripts/spike/engine/measure/groups.mjs';
import {intersect, screenshotPoint, targetPixel, textEditPoints, lineOfLocation, outcomeHolds, counterDeltas, timesInside, refusalFields, tapCounts,
  tapGroup, routesGroup, coordGroup, effectsGroup, readCounters, ROUTES, FAMILIES, TEXTEDIT_LINE_HEIGHT} from '../scripts/spike/engine/measure/input-groups.mjs';
import {outcomeState, SCENE_WINDOW_TITLE} from '../scripts/spike/engine/measure/cells.mjs';
import {FIXTURE_COUNTERS_FILE} from '../scripts/spike/engine/fixtures/electron-fixture.mjs';
import {operatorConsole} from '../scripts/spike/engine/measure.mjs';
import {freshClickParams} from '../scripts/spike/engine/measure/fresh-click.mjs';
import {textEditDocument} from '../scripts/spike/engine/scenes.mjs';

const require = createRequire(import.meta.url);
const tempDir = t => { const dir = fs.mkdtempSync(join(tmpdir(), 'cua-measure-groups-')); t.after(() => fs.rmSync(dir, {recursive: true, force: true})); return dir; };

test('groups: a comma list in the fixed run order; the default is what a run took before; the vendor lane takes speed alone', () => {
  assert.deepEqual(DEFAULT_GROUPS, ['speed', 'ab', 'd', 'e']);
  assert.deepEqual(parseGroups('e,tap,speed'), ['speed', 'tap', 'e']);
  assert.deepEqual(GROUPS.filter(g => DEFAULT_GROUPS.includes(g)), DEFAULT_GROUPS, 'the default keeps the old order: ab, then d, then e');
  assert.ok(GROUPS.indexOf('tap') < GROUPS.indexOf('d'), 'the tap checks before probe (d)\'s HID idle');
  for (const bad of ['', ',', 'speed,speed', 'speed,c']) assert.throws(() => parseGroups(bad), /--groups is a list/, bad);
  assert.deepEqual(parseTapModes('active,listen'), ['listen', 'active']);
  assert.throws(() => parseTapModes('listen,passive'), /--tap-modes/);
  assert.deepEqual(GROUPS.filter(g => laneTakes('vendor', g)), ['speed']);
  assert.ok(GROUPS.every(g => laneTakes('cua', g)));
  assert.deepEqual(groupNotRunRows('vendor', ['speed', 'routes', 'e']).map(r => [r.op, r.ok, Boolean(r.notRun)]), [['group.routes', false, true], ['group.e', false, true]]);
  assert.deepEqual(groupNotRunRows('cua', GROUPS), []);
});

// The mini's 2× display: a 610 × 860-point window at (309, 103) captured at 1220 × 1720 pixels.
const MINI = {window: {frame: {x: 309, y: 103, width: 610, height: 860}}, screenshot: {width: 1220, height: 1720}};

test('a screen point in the screenshot\'s pixels: offset from the window\'s origin, times the observation\'s per-axis scale', () => {
  assert.deepEqual(screenshotPoint({x: 409, y: 153}, MINI), {x: 200, y: 100, local: {x: 100, y: 50}, scale: {x: 2, y: 2}});
  assert.deepEqual(screenshotPoint({x: 409, y: 153}, {...MINI, screenshot: {width: 610, height: 860}}).scale, {x: 1, y: 1}, 'a 1× display');
  assert.equal(screenshotPoint({x: 308, y: 153}, MINI), null, 'left of the window');
  assert.equal(screenshotPoint({x: 409, y: 963}, MINI), null, 'below it');
  assert.equal(screenshotPoint({x: 409, y: 153}, {window: MINI.window, screenshot: null}), null, 'no screenshot: no pixels');
  // The visible part's centre: a text view taller than the window is clipped to it.
  assert.deepEqual(intersect({x: 309, y: 180, width: 610, height: 1200}, MINI.window.frame), {x: 309, y: 180, width: 610, height: 783});
  assert.deepEqual(targetPixel({...MINI, frame: {x: 400, y: 200, width: 20, height: 10}}), {x: 202, y: 204, local: {x: 101, y: 102}, scale: {x: 2, y: 2}});
  assert.equal(targetPixel({...MINI, frame: {x: 1000, y: 200, width: 20, height: 10}}), null, 'off the window');
});

test('TextEdit\'s coordinate targets: the line height from the text view\'s frame when it holds every line, the estimate otherwise; lines from a caret location', () => {
  const lines = textEditDocument().lines;
  const tall = textEditPoints({...MINI, frame: {x: 309, y: 180, width: 610, height: lines.length * 16}});
  assert.equal(tall.lineHeightFrom, 'frame');
  assert.equal(tall.lineHeight, 16);
  assert.deepEqual(tall.points.map(p => [p.line, p.local, p.x, p.y]), [[0, {x: 24, y: 85}, 48, 170], [8, {x: 24, y: 213}, 48, 426]]);
  const short = textEditPoints({...MINI, frame: {x: 309, y: 180, width: 610, height: 400}});
  assert.deepEqual([short.lineHeightFrom, short.lineHeight], ['estimate', TEXTEDIT_LINE_HEIGHT]);
  assert.deepEqual(textEditPoints({...MINI, frame: {x: 0, y: 0, width: 10, height: 10}}).points, [], 'no visible text view, no points');
  assert.equal(lineOfLocation(0, lines), 0);
  assert.equal(lineOfLocation(lines[0].length, lines), 0, 'the end of the first line is on it');
  assert.equal(lineOfLocation(lines[0].length + 1, lines), 1, 'past its newline is the next');
  assert.equal(lineOfLocation(lines.slice(0, 8).join('\n').length + 1 + 3, lines), 8);
  assert.equal(lineOfLocation(-1, lines), null);
  assert.equal(lineOfLocation(1e6, lines), null);
});

// Skyshot nodes as the engine sends them: index, depth, role, flags, title, value.
const node = (index, depth, role, extra = {}) => ({index, depth, role, flags: {selected: false}, title: null, value: null, ...extra});
test('a route sample\'s outcome from the Skyshot: the run\'s own Finder rows by number, any other selected row only counted; the web scenes\' own controls', () => {
  const finder = {focused: null, nodes: [
    node(0, 0, 'AXWindow'), node(1, 2, 'AXRow', {flags: {selected: true}}), node(2, 3, 'AXStaticText', {value: 'Owner Documents'}),
    node(3, 2, 'AXRow', {flags: {selected: true}}), node(4, 3, 'AXCell'), node(5, 4, 'AXTextField', {value: 'scene-file-005'}),
    node(6, 2, 'AXRow'), node(7, 3, 'AXCell'), node(8, 4, 'AXTextField', {value: 'scene-file-006'}),
  ]};
  const state = outcomeState('finder', finder, []);
  assert.deepEqual(state, {observed: true, selected: ['005'], otherSelected: 1});
  assert.ok(!JSON.stringify(state).includes('Owner'), 'the owner\'s row is never named');
  const chrome = {focused: 4, nodes: [node(0, 0, 'AXWindow'), node(3, 4, 'AXCheckBox', {title: 'Scene option', value: 1}),
    node(4, 4, 'AXTextArea', {description: 'Scene notes', numberOfCharacters: 7}), node(5, 2, 'AXTextField', {value: '127.0.0.1:4000'})]};
  assert.deepEqual(outcomeState('chrome', chrome, ['Scene option', 'Scene notes']), {observed: true, option: 1, textChars: 7, focused: {index: 4, role: 'AXTextArea', control: 'Scene notes'}});
  const electron = {focused: null, nodes: [node(0, 0, 'AXWindow'), node(2, 3, 'AXTextArea', {title: 'Fixture text', value: 'abc'}), node(9, 4, 'AXStaticText', {value: 'Pressed 2 times'})]};
  assert.deepEqual(outcomeState('electron', electron, ['Fixture text']), {observed: true, presses: 2, textChars: 3, focused: null});
  assert.deepEqual(outcomeState('chrome', null, []), {observed: false});
});

test('the outcome predicates: a plain click\'s effect, the key\'s, and null when a state is unreadable', () => {
  const range = (location, length) => ({range: {location, length}});
  assert.equal(outcomeHolds('textedit', 'elementClick', range(0, 0), range(412, 0)), true, 'the caret moved');
  assert.equal(outcomeHolds('textedit', 'coordinateClick', range(0, 0), range(0, 0)), false);
  assert.equal(outcomeHolds('textedit', 'key', range(0, 0), range(0, 1)), true, 'shift+Right extends by one');
  assert.equal(outcomeHolds('textedit', 'key', range(0, 0), range(1, 0)), false);
  assert.equal(outcomeHolds('textedit', 'key', {error: 'x'}, range(0, 1)), null);
  const rows = selected => ({observed: true, selected, otherSelected: 0});
  assert.equal(outcomeHolds('finder', 'elementClick', rows(['003']), rows(['005'])), true, 'the plain click replaces the selection');
  assert.equal(outcomeHolds('finder', 'elementClick', rows(['003']), rows(['003', '005'])), false, 'a ⌘-click adds to it (U10)');
  assert.equal(outcomeHolds('finder', 'key', rows(['003']), rows(['004'])), true);
  assert.equal(outcomeHolds('finder', 'key', rows([]), rows(['001'])), null, 'no row to move from');
  assert.equal(outcomeHolds('chrome', 'coordinateClick', {observed: true, option: 0}, {observed: true, option: 1}), true);
  assert.equal(outcomeHolds('chrome', 'key', {observed: true, textChars: 4}, {observed: true, textChars: 5}), true);
  assert.equal(outcomeHolds('electron', 'elementClick', {observed: true, presses: 2}, {observed: true, presses: 3}), true);
  assert.equal(outcomeHolds('electron', 'elementClick', {observed: true, presses: 2}, {observed: true, presses: 4}), false, 'two presses is not the click\'s outcome');
  assert.equal(outcomeHolds('electron', 'key', {observed: true, textChars: null}, {observed: true, textChars: 1}), null);
  assert.equal(outcomeHolds('electron', 'key', {observed: false}, {observed: true, textChars: 1}), null);
});

test('counter deltas, times inside an action, a refusal\'s fields and a tap report\'s sums', () => {
  assert.deepEqual(counterDeltas({counts: {windowFocus: 1, pageBlur: 0}}, {counts: {windowFocus: 2, pageBlur: 0, textBlur: 1}}), {pageBlur: 0, textBlur: 1, windowFocus: 1});
  assert.equal(counterDeltas(null, {counts: {}}), null);
  assert.deepEqual(timesInside([5, 10, 15, 25], {startedAt: 10, endedAt: 20}), {count: 4, inside: 2});
  assert.equal(timesInside([5], {startedAt: null, endedAt: 3}), null);
  assert.deepEqual(timesInside(undefined, {startedAt: 1, endedAt: 2}), {count: 0, inside: 0});
  const refusal = Object.assign(new Error('The listen-only event tap could not be created.'), {errorName: 'tapNotCreated', code: -10005, data: {mode: 'listen', listenPreflight: false, postPreflight: true}});
  assert.deepEqual(refusalFields(refusal), {errorName: 'tapNotCreated', sentence: refusal.message, mode: 'listen', listenPreflight: false, postPreflight: true});
  assert.deepEqual(refusalFields(new Error('the engine is unreachable (ENOENT)')), {errorName: null, sentence: 'the engine is unreachable (ENOENT)', mode: null, listenPreflight: null, postPreflight: null});
  assert.deepEqual(tapCounts({counts: {keyDown: {own: 1, driven: 2, other: 0}, mouseDown: {own: 0, driven: 1, other: 3}}}), {own: 1, driven: 3, other: 3});
});

test('U3: the title log refuses Finder, whose windows may be the owner\'s', () => {
  assert.throws(() => SCENE_WINDOW_TITLE('finder', '/f.app', 'cua-scene-finder', {raw: true}), /never logged/);
});

test('the Electron fixture\'s counters: each named event counted, the file rewritten whole by rename, anything else ignored', t => {
  const {createCounters, COUNTERS, PAGE_EVENTS} = require('../scripts/spike/engine/fixtures/electron/counters.js');
  const dir = tempDir(t), file = join(dir, FIXTURE_COUNTERS_FILE);
  const renames = [];
  const fsSpy = {...fs, renameSync: (from, to) => { renames.push([from, to]); fs.renameSync(from, to); }};
  const counters = createCounters(file, {fs: fsSpy, now: () => 7});
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {seq: 0, at: 7, counts: Object.fromEntries(COUNTERS.map(n => [n, 0]))});
  assert.equal(counters.bump('windowBlur'), true);
  assert.equal(counters.bump(PAGE_EVENTS['text-focus']), true);
  assert.equal(counters.bump('toString'), false);
  assert.equal(counters.bump('__proto__'), false);
  const written = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(written.seq, 2);
  assert.deepEqual([written.counts.windowBlur, written.counts.textFocus, written.counts.windowFocus], [1, 1, 0]);
  assert.equal(renames.length, 3, 'every write is a rename of a whole file');
  assert.ok(renames.every(([from, to]) => to === file && from.startsWith(`${file}.`)));
  assert.deepEqual(fs.readdirSync(dir), [FIXTURE_COUNTERS_FILE], 'no temporary file left');
  // The harness's reading over the device shell.
  const shell = script => { assert.match(script, /^cat '.*cua-fixture-counters\.json' 2>\/dev\/null \|\| true$/); return fs.readFileSync(file, 'utf8'); };
  assert.equal(readCounters(shell, {userDataDir: dir}).counts.windowBlur, 1);
  assert.equal(readCounters(() => '', {userDataDir: dir}), null, 'no file yet');
  assert.equal(readCounters(shell, {}), null);
});

test('the operator\'s answers: one reader for the command, so lines that arrive together are each an answer; the end of input is no', async () => {
  const input = new PassThrough(), output = new PassThrough();
  const console = operatorConsole({input, output});
  input.write('\nn\n');
  assert.equal(await console.confirm('first? '), true);
  assert.equal(await console.confirm('second? '), false);
  const third = console.confirm('third? ');
  input.write('yes\n');
  assert.equal(await third, true);
  const fourth = console.confirm('fourth? ');
  input.end();
  assert.equal(await fourth, false);
  assert.equal(await console.confirm('fifth? '), false, 'after the end, every answer is no');
  assert.match(output.read().toString(), /first\? second\? third\? fourth\? fifth\? /);
  console.close();
});

// A tap group over fake ops: the listen-only tap refused under Accessibility alone, the active one created.
test('tap: each mode\'s row carries the engine\'s answer; probe (d) follows only for the modes whose tap was created', async () => {
  const rows = [], calls = [];
  const ops = {probeTap: (op, extra) => {
    calls.push([op, extra?.mode ?? null]);
    if (op === 'start' && extra.mode === 'listen') throw Object.assign(new Error('The listen-only event tap could not be created.'), {errorName: 'tapNotCreated', code: -10005, data: {mode: 'listen', listenPreflight: false, postPreflight: true}});
    if (op === 'start') return {created: true, mode: extra.mode, listenPreflight: false, postPreflight: true, running: true};
    return {counts: {keyDown: {own: 0, driven: 0, other: 2}}, hidIdleMs: 30, reenables: 1, disabledBy: {timeout: 1}, mode: 'active', listenPreflight: false, postPreflight: true};
  }};
  const created = await tapGroup({emit: row => rows.push(row), ops, records: {textedit: {app: '/T.app'}}}, ['listen', 'active']);
  assert.deepEqual(created, ['active']);
  assert.deepEqual(calls, [['start', 'listen'], ['start', 'active'], ['stop', null]]);
  assert.deepEqual(rows.map(r => [r.op, r.mode, r.ok, r.created, r.errorName ?? null, r.listenPreflight, r.postPreflight]),
    [['tap.create', 'listen', false, false, 'tapNotCreated', false, true], ['tap.create', 'active', true, true, null, false, true]]);
  assert.equal(rows[0].sentence, 'The listen-only event tap could not be created.');
  assert.deepEqual(rows[1].stop, {own: 0, driven: 0, other: 2, hidIdleMs: 30, reenables: 1, disabledBy: {timeout: 1}, listenPreflight: false, postPreflight: true});
});

// A device and a session over fakes for the route matrix: cells are told apart by what they call.
function fakeSession({sceneFront = true, presses = [0, 1]} = {}) {
  const rows = [], sent = [];
  let outcome = 0;
  const js = async code => {
    if (code.includes('outcomeState(')) { const p = presses[Math.min(outcome++, presses.length - 1)]; return {cell: {ok: true, value: {observed: true, presses: p, textChars: 0, focused: null}}}; }
    if (code.includes('globalThis.__probe = {index')) { sent.push('locate'); return {cell: {ok: true, value: {index: 7}}}; }
    if (code.includes('getAXStateAndScreenshot')) { sent.push('geometry'); return {cell: {ok: true, value: {index: 7, frame: {x: 400, y: 200, width: 20, height: 10}, ...MINI}}}; }
    if (code.includes('spikeRoute')) { sent.push(`act ${/"spikeRoute":"([^"]+)"|spikeRoute: "([^"]+)"/.exec(code).slice(1).find(Boolean)}`); return {cell: {ok: true, value: {inCellMs: 3}}, meta: {'cua/inputRoute': 3}}; }
    if (code.includes('.click(globalThis.__probe.index)')) { sent.push('prepare click'); return {cell: {ok: true, value: {actions: 1}}}; }
    throw new Error(`unexpected cell: ${code.slice(0, 80)}`);
  };
  const user = {pid: 20}, scene = {pid: 30, app: '/E.app', userDataDir: '/run/electron-user-data'};
  let counter = 0;
  const shell = script => { if (/cua-fixture-counters/.test(script)) return JSON.stringify({seq: counter, counts: {windowFocus: counter++}}); throw new Error(`unexpected shell: ${script}`); };
  const ops = {watch: () => sent.push('watch'), watchStop: () => { sent.push('watchStop'); return [{kind: 'activated'}]; }};
  const front = () => ({frontmost: {pid: sceneFront ? 20 : 30}, topWindow: {ownerPid: sceneFront ? 20 : 30, number: 5}});
  return {rows, sent, ctx: {js, emit: row => rows.push(row), records: {electron: scene, finder: user}, front, activate: async () => {}, ops, shell, sleep: async () => {},
    active: () => ['electron'], finderRenameGuard: async () => ({})}};
}

test('routes: each sample checks the user window is in front, watches activations, reads the outcome and Electron\'s counters around the action', async () => {
  const {rows, sent, ctx} = fakeSession();
  await routesGroup(ctx, {samples: 1});
  assert.equal(rows.length, FAMILIES.length * ROUTES.length);
  assert.deepEqual(rows.map(r => [r.op, r.forcedRoute]).slice(0, 3), [['routes.elementClick', "2'"], ['routes.elementClick', '3'], ['routes.elementClick', '2']]);
  const click = rows[0];
  assert.deepEqual([click.sent, click.route, click.activations, click.outcomeHeld, click.ok, click.frontmostUnchanged], [true, 3, 1, true, true, true]);
  assert.deepEqual(click.counters, {windowFocus: 1});
  assert.deepEqual(sent.slice(0, 4), ['locate', 'watch', "act 2'", 'watchStop'], 'the target located last, the watcher around the action alone');
  const coordinate = rows.find(r => r.family === 'coordinateClick');
  assert.deepEqual(coordinate.point, {x: 202, y: 204, scale: {x: 2, y: 2}}, 'the target\'s centre in screenshot pixels');
  const key = rows.find(r => r.family === 'key');
  assert.ok(sent.includes('prepare click'), 'the text field is focused before a key');
  assert.equal(key.outcomeHeld, false, 'the fake text field never grew');
});

test('routes: nothing is sent while the user window is not in front', async () => {
  const {rows, sent, ctx} = fakeSession({sceneFront: false});
  await routesGroup(ctx, {samples: 1});
  assert.ok(rows.every(r => r.sent === false && r.ok === false && /not in front; nothing was sent/.test(r.error)));
  assert.ok(!sent.some(s => s.startsWith('act') || s === 'watch'));
});

test('effects: the activation point per scene, and a missing probe_spike is each row\'s error rather than a crash', async () => {
  const rows = [];
  const answers = {activationPoint: {op: 'activationPoint', app: {pid: 9}, listed: false, axError: -25205, point: null, relative: null, windowFrame: {x: 0, y: 0, width: 10, height: 10}, hit: null, hitFrom: 'none'}};
  await effectsGroup({active: () => ['finder'], emit: row => rows.push(row), ops: {probeSpike: op => answers[op]}, records: {finder: {app: '/F.app'}}});
  assert.deepEqual(rows.map(r => [r.op, r.scene, r.ok, r.axError, r.hitFrom]), [['effects.activationPoint', 'finder', true, -25205, 'none']]);
  rows.length = 0;
  await effectsGroup({active: () => ['finder'], emit: row => rows.push(row), ops: {}, records: {finder: {app: '/F.app'}}});
  assert.match(rows[0].error, /no probeSpike/);
});

test('coord: the click lands on the line aimed at, a fresh connection is refused, an unmovable window is not run, and the replaced window refuses', async () => {
  const rows = [], sent = [];
  const lines = textEditDocument().lines;
  const lineStart = n => lines.slice(0, n).join('\n').length + (n ? 1 : 0);
  let next = [lineStart(0) + 2, lineStart(8) + 1, lineStart(0) + 3];
  let topNumber = 5;
  const js = async code => {
    if (code.includes('getAXStateAndScreenshot')) return {cell: {ok: true, value: {index: 2, frame: {x: 309, y: 180, width: 610, height: lines.length * 17}, ...MINI, screenshotBytes: 9}}};
    if (code.includes('.click([')) {
      sent.push(`click ${/click\(\[([^\]]+)\]/.exec(code)[1]}`);
      return topNumber === 6 ? {cell: {ok: true, value: {actions: 0, failed: 'There is no screenshot of the app\'s window to place the coordinates in. Try to get the on-screen content again and see if that resolves the issue.'}}}
        : {cell: {ok: true, value: {actions: 1}}, meta: {'cua/inputRoute': 2}};
    }
    if (code.includes('pressKey("super+n")')) { sent.push('super+n'); topNumber = 6; return {cell: {ok: true, value: {actions: 1}}}; }
    if (code.includes('globalThis.__task = front')) { sent.push('adopt'); return {cell: {ok: true, value: {adopted: true}}}; }
    if (code.includes('pressKey("super+w")')) { sent.push('close'); topNumber = 5; return {cell: {ok: true, value: {closed: true}}}; }
    throw new Error(`unexpected cell: ${code.slice(0, 80)}`);
  };
  const ops = {
    probeSpike: () => ({role: 'AXTextArea', range: {location: next.shift(), length: 0}}),
  };
  const shell = script => {
    if (script.includes('fresh-click.mjs')) {
      assert.equal(script, "node scripts/spike/engine/measure/fresh-click.mjs '/T.app' 48 171 --engine '/E/cua Engine.app'");
      sent.push('fresh click');
      return '{"ok":false,"error":{"code":-10005,"errorName":"noScreenshotForCoordinates","message":"There is no screenshot…"}}\n';
    }
    sent.push('move'); assert.match(script, /^swift scripts\/spike\/engine\/move-window\.swift 41 309,103,610,860 60 40$/); return '{"trusted":false,"moved":false,"error":"this shell is not trusted for Accessibility"}\n'; };
  const front = () => ({frontmost: {pid: 41}, topWindow: {ownerPid: 41, number: topNumber, bounds: {x: 309, y: 103, width: 610, height: 860}}});
  await coordGroup({js, emit: row => rows.push(row), records: {textedit: {app: '/T.app', pid: 41}}, activate: async () => {}, ops, active: () => ['textedit'], shell, front, sleep: async () => {},
    d: {node: 'node'}, engine: '/E/cua Engine.app'});
  assert.deepEqual(rows.map(r => [r.op, r.ok]), [['coord.click', true], ['coord.click', true], ['coord.refusal.noScreenshot', true], ['coord.moved', false], ['coord.refusal.replaced', true]]);
  assert.deepEqual(rows.slice(0, 2).map(r => [r.line, r.landedLine, r.exact, r.lineHeightFrom, r.pixel.y]), [[0, 0, true, 'frame', 171], [8, 8, true, 'frame', 443]]);
  assert.match(rows[3].notRun, /not trusted for Accessibility/);
  assert.deepEqual([rows[4].newWindow, rows[4].refused, rows[4].closed], [true, true, true]);
  assert.deepEqual(sent, ['click 48, 171', 'click 48, 443', 'fresh click', 'move', 'super+n', 'click 48, 171', 'adopt', 'close']);
});

test('the fresh-connection click names the app by path and finite coordinates, with a deadline computed on the device', () => {
  assert.deepEqual(freshClickParams('/T.app', 48, 171, 1000), {method: 'click', args: {app: '/T.app', x: 48, y: 171}, deadlineUnixMilliseconds: 31_000});
  assert.throws(() => freshClickParams('TextEdit', 1, 2), /absolute path/);
  assert.throws(() => freshClickParams('/T.app', NaN, 2), /finite/);
});

test('probe (d) under the tap group: the mode is sent to probe_tap and kept on both rows', async () => {
  const {probeDTap} = await import('../scripts/spike/engine/measure/lane.mjs');
  const rows = [], starts = [];
  const ops = {
    probeTap: (op, extra) => { if (op === 'start') { starts.push(extra.mode); return {created: true, mode: extra.mode}; } return {counts: {keyDown: {own: 1, driven: 1, other: 0}}, hidIdleMs: 5, listenPreflight: true, postPreflight: true}; },
    keystroke: () => ({sent: true}),
  };
  await probeDTap({js: async () => ({cell: {ok: true, inCellMs: 1}, meta: {'cua/inputRoute': 3}}), emit: row => rows.push(row), records: {textedit: {app: '/T.app', pid: 41}},
    front: () => ({frontmost: {pid: 41}, topWindow: {bounds: {x: 0, y: 0, width: 600, height: 400}}}), activate: async () => {}, ops}, {mode: 'active'});
  assert.deepEqual(starts, ['active', 'active']);
  assert.deepEqual(rows.map(r => [r.op, r.mode, r.ok, r.listenPreflight ?? null]), [['probe.d.tap', 'active', true, true], ['probe.d.hidReset', 'active', true, null]]);
});
