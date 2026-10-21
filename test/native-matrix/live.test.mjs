// The M2a.5 hold's controller (scripts/native-matrix/live.mjs) and the vendor lane's cells (./live-cells.mjs): the
// refusals before anything changes, each command's device sequence with the put-back always last, the menu check's two
// lanes on one scene state, the cleanup of a command that died, and the dry run that prints the device commands
// through the real ssh wrapper without running any. The device and the vendor host are doubles; nothing is launched.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MARKER, parseCell} from '../../scripts/native-baseline/cells.mjs';
import {EFFECT, MENU_BAR, MENU_ITEM, SELECT_FIRST_LINE} from '../../scripts/native-matrix/live-cells.mjs';
import {checkPassed, dryConnect, dryExec, liveOps, parseCommand, runLive} from '../../scripts/native-matrix/live.mjs';

const scratches = [];
const scratch = () => { const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'cua-live-'))); scratches.push(dir); return dir; };
after(() => { for (const dir of scratches) fs.rmSync(dir, {recursive: true, force: true}); });
const COMMIT = 'c'.repeat(40);
const RUN = '/Users/u/Library/Caches/cua-harness/native-live';
const PREPARED = {device: 'mini', home: '/h', userHome: '/Users/u', configHome: '/s/config', tmpdir: '/s/tmp', admission: 'token',
  runtimeReuse: {approvedHome: '/h', release: '26.928.40906-darwin-arm64', runtimeRoot: '/h/runtimes/26.928.40906-darwin-arm64'}};
const PASSED = {minimized: {steps: {}, verdict: {pass: true}}, enablement: {verdict: {released: true}}, 'input-source': {verdict: {pass: true}},
  menu: {items: {selectAll: {found: true, enabled: true, effect: true}, bold: {found: true, enabled: true, effect: true}}, activations: []}};

// A device double answering each CLI command; `calls` keeps the order.
function fakeDevice({begin = {refusals: [], checkout: {commit: COMMIT, dirty: false}, engine: {build: 'b'}, frontmost: {bundleId: 'com.apple.Terminal'}, engineStop: {wasRunning: false}},
  live = {}, upFails = null, putback = {plan: ['scenes-down', 'engine-stop', 'apps-check', 'front-app'], steps: {}, ok: true}, frontmost = () => ({pid: 77, bundleId: 'com.apple.Terminal'})} = {}) {
  const calls = [];
  let pid = 600;
  const ops = {
    home: () => '/Users/u',
    live(args) {
      calls.push(['live', ...args]);
      const [command] = args;
      if (command === 'begin') return begin;
      if (command === 'putback') return putback;
      if (command === 'watch') return args[1] === 'start' ? {watching: true} : {activations: [{kind: 'activated', bundleId: 'com.apple.TextEdit', scene: true}]};
      if (live[command]) return typeof live[command] === 'function' ? live[command]() : live[command];
      return PASSED[command];
    },
    scenes(args) {
      calls.push(['scenes', ...args]);
      const [command, scene] = args;
      if (command === 'up') { if (upFails === scene) throw new Error(`scenes-mac.mjs up ${scene}: Finder has a window that is not the run's`); return {scene, app: `/Apps/${scene}.app`, pid: scene === 'finder' ? 700 : pid++, window: {number: 7}}; }
      if (command === 'activate') return {scene, ok: true};
      if (command === 'down') return {scene, down: true};
      if (command === 'frontmost') return frontmost();
      throw new Error(`unexpected scenes ${command}`);
    },
    prepare: home => { calls.push(['prepare', home]); return PREPARED; },
    cleanup: prepared => { calls.push(['cleanup', prepared.home]); return {removed: true}; },
    preflight: () => { calls.push(['preflight']); return {commit: COMMIT, dirty: false, release: '26.928.40906-darwin-arm64', serves: false, home: '/h', runtimeRoot: '/h/runtimes/26.928.40906-darwin-arm64'}; },
    serveSpec: () => ({command: 'ssh', args: ['mini', 'serve']}),
  };
  return {ops, calls};
}

// The vendor host double: runs each cell's code against a fake facade, so the cells themselves are exercised.
function fakeVendor({texts}) {
  const cells = [], clicks = [], selects = [];
  let handlers, closed = false;
  const app = {
    async getAXState(options) { return texts.next(options); },
    async click(index) { clicks.push(index); texts.clicked(index); },
    async selectText(index, text) { selects.push([index, text]); texts.selected(text); },
  };
  const client = {
    async initialize() { return {serverInfo: {name: 'node_repl'}}; },
    async request(method, params) {
      if (method === 'tools/list') return {tools: []};
      const code = params.arguments.code;
      cells.push((/\/\* ((?:goldens|live):\w+ \w+) \*\//.exec(code) ?? [null, 'first'])[1]);
      const written = [];
      if (/goldens:bind/.test(code)) {
        await handlers.answer({method: 'elicitation/create', params: {_meta: {connector_id: 'computer-use', tool_params: {app: 'com.apple.TextEdit'}}}});
      }
      Object.assign(globalThis, {cua: {getApp: async () => app}, nodeRepl: {write: text => written.push(text)}});
      try { await new (Object.getPrototypeOf(async () => {}).constructor)(code)(); } finally { delete globalThis.cua; delete globalThis.nodeRepl; }
      return {content: [{type: 'text', text: written.join('\n')}], _meta: {'cua/nativeEngine': {engine: 'vendor', version: '1.0', build: '26.928.40906-darwin-arm64'}}};
    },
    async call() { return {}; },
    async close() { closed = true; },
  };
  return {connect: (spec, given) => { handlers = given; return client; }, cells, clicks, selects, get closed() { return closed; }};
}

// The vendor's texts for one menu run: the full tree from the golden, a rooted menu after a menu-bar click, the
// selection and the Bold after the item clicks.
function vendorTexts() {
  const full = fs.readFileSync(new URL('../native-goldens/textedit/vendor.txt', import.meta.url), 'utf8');
  const state = {rooted: null, selected: null, bold: false};
  const menus = {54: '+70 Edit\n+\t71 menu\n+\t\t72 (disabled) Undo\n+\t\t73 Select All', 55: '+80 Format\n+\t81 menu\n+\t\t82 Font\n+\t\t\t83 menu\n+\t\t\t\t84 Bold'};
  const trailer = () => (state.selected ? `\nSelected text: \`\`\`\n${state.selected}\n\`\`\`\n\nnote` : '');
  return {
    state,
    next: () => {
      if (state.rooted) return `Window: "cua-scene.rtf", App: TextEdit.\n${menus[state.rooted]}`;
      return (state.bold ? full.replace('Value: cua scene document', 'Value: **cua scene document**') : full) + trailer();
    },
    clicked: index => {
      if (menus[index]) { state.rooted = index; return; }
      state.rooted = null;
      if (index === 73) state.selected = full.split('Value: ')[1].split('\n\t\t3 ')[0].replace(/\*\*/g, '');
      if (index === 84) state.bold = true;
    },
    selected: text => { state.selected = text; },
  };
}

const io = (device, extra = {}) => ({ops: device.ops, controllerCheckout: () => ({commit: COMMIT, dirty: false}), log: () => {}, ...extra});
const result = dir => JSON.parse(fs.readFileSync(join(dir, 'result.json'), 'utf8'));

test('parseCommand: the device and an output directory always, the approved vendor home for the menu check, absolute paths', () => {
  assert.deepEqual(parseCommand(['minimized', '--device', 'mini', '--out', '/tmp/o']), {command: 'minimized', device: 'mini', out: '/tmp/o', run: undefined, approvedRuntime: undefined, preparation: undefined, dryRun: false});
  assert.throws(() => parseCommand(['menu', '--device', 'mini', '--out', '/tmp/o']), /approved-runtime/);
  assert.throws(() => parseCommand(['minimized', '--device', 'mini']), /--out is required/);
  assert.equal(parseCommand(['minimized', '--device', 'mini', '--dry-run']).dryRun, true);
  assert.throws(() => parseCommand(['minimized', '--device', 'mini', '--out', '/o', '--run', 'relative']), /absolute/);
  assert.throws(() => parseCommand(['nope', '--device', 'mini']), /unknown command/);
  assert.equal(parseCommand(['cleanup', '--device', 'mini']).command, 'cleanup');
});

test('minimized: begin, the scene up, the device check, then the put-back and the front app read again; the result written', async () => {
  const device = fakeDevice(), out = scratch();
  const code = await runLive({command: 'minimized', device: 'mini', out}, io(device));
  assert.equal(code, 0);
  assert.deepEqual(device.calls.map(c => c.slice(0, 3).join(' ')), ['live begin --run', 'scenes up textedit', 'live minimized --run', 'live putback --run', 'scenes frontmost']);
  assert.deepEqual(device.calls[0], ['live', 'begin', '--run', RUN, '--commit', COMMIT]);
  const r = result(out);
  assert.equal(r.complete, true);
  assert.equal(r.pass, true);
  assert.deepEqual(r.frontApp, {saved: 'com.apple.Terminal', now: 'com.apple.Terminal', same: true});
  assert.deepEqual(r.check, PASSED.minimized);
});

test('a refusal stops the command before anything on the device changes: no scene, no put-back, exit 2', async () => {
  const device = fakeDevice({begin: {refusals: ['TextEdit is running and is not the run\'s'], checkout: {commit: COMMIT, dirty: false}, engine: null}}), out = scratch();
  assert.equal(await runLive({command: 'minimized', device: 'mini', out}, io(device)), 2);
  assert.deepEqual(device.calls.map(c => c[1]), ['begin']);
  assert.deepEqual(result(out).refused, ['TextEdit is running and is not the run\'s']);
  const dirty = fakeDevice(), out2 = scratch();
  assert.equal(await runLive({command: 'minimized', device: 'mini', out: out2}, io(dirty, {controllerCheckout: () => ({commit: COMMIT, dirty: true})})), 2);
  assert.deepEqual(dirty.calls, [], 'a dirty controller checkout refuses before the device is asked anything');
});

test('a check that stops still ends in the put-back; the result is incomplete', async () => {
  const device = fakeDevice({upFails: 'chrome'}), out = scratch();
  assert.equal(await runLive({command: 'enablement', device: 'mini', out}, io(device)), 1);
  assert.deepEqual(device.calls.map(c => c.slice(0, 2).join(' ')), ['live begin', 'scenes up', 'live putback', 'scenes frontmost']);
  const r = result(out);
  assert.equal(r.complete, false);
  assert.match(r.problems[0], /enablement check stopped/);
});

test('a put-back that does not finish leaves the command incomplete whatever the check said', async () => {
  const device = fakeDevice({putback: {plan: [], steps: {'apps-check': {ok: false}}, ok: false}}), out = scratch();
  assert.equal(await runLive({command: 'input-source', device: 'mini', out}, io(device)), 1);
  assert.deepEqual(device.calls.map(c => c.slice(0, 2).join(' ')), ['live begin', 'live input-source', 'live putback', 'scenes frontmost']);
  assert.equal(result(out).complete, false);
});

test('menu: the vendor home prepared and checked first, cua\'s lane, a fresh TextEdit, the vendor\'s lane cell by cell with the front read between, then the home cleaned and the put-back', async () => {
  const device = fakeDevice({frontmost: () => ({pid: 700, bundleId: 'com.apple.finder'})}), out = scratch();
  const texts = vendorTexts(), vendor = fakeVendor({texts});
  const code = await runLive({command: 'menu', device: 'mini', out, approvedRuntime: '/h'}, io(device, {connect: vendor.connect}));
  const r = result(out);
  assert.equal(code, 0, JSON.stringify(r.problems));
  assert.deepEqual(device.calls.filter(c => c[0] !== 'scenes' || c[1] !== 'frontmost').map(c => c.slice(0, 3).join(' ')),
    ['live begin --run', 'prepare /h', 'preflight', 'scenes up textedit', 'scenes up finder', 'scenes activate finder', 'live menu --run', 'scenes down textedit',
      'scenes up textedit', 'live watch start', 'scenes activate finder', 'scenes activate finder', 'live watch stop', 'cleanup /h', 'live putback --run']);
  assert.deepEqual(vendor.cells, ['first', 'goldens:bind textedit', 'live:bar selectAll', 'live:item selectAll', 'live:effect selectAll', 'live:select bold',
    'live:bar bold', 'live:item bold', 'live:effect bold']);
  assert.deepEqual(vendor.clicks, [54, 73, 55, 84]);
  assert.deepEqual(vendor.selects, [[2, 'cua scene document']]);
  assert.equal(vendor.closed, true);
  const {vendor: lane, comparison} = r.check;
  assert.equal(lane.items.selectAll.enabled, true);
  assert.equal(lane.items.selectAll.effect, true);
  assert.equal(lane.items.bold.prepared, true);
  assert.equal(lane.items.bold.effect, true);
  assert.deepEqual(lane.items.selectAll.front[0], {bundleId: 'com.apple.finder', user: true, textedit: false});
  assert.deepEqual(lane.activations, [{kind: 'activated', bundleId: 'com.apple.TextEdit', scene: true}]);
  assert.equal(comparison.decision, 'no activation: cua reads the responder-chain items enabled and they act without it');
  assert.equal(r.vendor.engineAttestation.engine, 'vendor');
  assert.equal(fs.existsSync(join(out, 'preparation.json')), false, 'a cleaned home leaves no preparation behind');
  assert.doesNotMatch(JSON.stringify(r), /Line 0/, 'no document text in the result');
});

test('menu: a vendor lane that fails still closes its serve, cleans the vendor home and puts back', async () => {
  const device = fakeDevice({frontmost: () => ({pid: 700, bundleId: 'com.apple.finder'})}), out = scratch();
  const vendor = fakeVendor({texts: {next: () => { throw new Error('noWindowsAvailable'); }, clicked() {}, selected() {}}});
  const code = await runLive({command: 'menu', device: 'mini', out, approvedRuntime: '/h'}, io(device, {connect: vendor.connect}));
  assert.equal(code, 1);
  const r = result(out);
  assert.match(r.check.vendor.problem, /noWindowsAvailable/);
  assert.equal(r.check.comparison.decision, 'undecided: an item was not exposed or a lane is missing');
  assert.equal(vendor.closed, true);
  assert.ok(device.calls.some(c => c[0] === 'cleanup'));
  assert.equal(device.calls.at(-2)[1], 'putback');
});

test('cleanup: the put-back alone, and the vendor home from a preparation a dead menu command left', async () => {
  const device = fakeDevice(), dir = scratch(), preparation = join(dir, 'preparation.json');
  fs.writeFileSync(preparation, JSON.stringify({device: 'mini', prepared: PREPARED, run: RUN}));
  assert.equal(await runLive({command: 'cleanup', device: 'mini', preparation}, io(device)), 0);
  assert.deepEqual(device.calls.map(c => c.slice(0, 2).join(' ')), ['cleanup /h', 'live putback', 'scenes frontmost']);
  assert.equal(fs.existsSync(preparation), false);
});

test('checkPassed: each check\'s own bar', () => {
  assert.equal(checkPassed('minimized', {verdict: {pass: true}}), true);
  assert.equal(checkPassed('minimized', {problem: 'x', verdict: {pass: true}}), false);
  assert.equal(checkPassed('enablement', {verdict: {released: false}}), false);
  assert.equal(checkPassed('menu', {cua: {}, vendor: {}, comparison: {decision: 'the menu path takes activation: …'}}), true, 'a decision either way is a result');
  assert.equal(checkPassed('menu', {cua: {}, vendor: {}, comparison: {decision: 'undecided: …'}}), false);
});

test('the dry run prints every device command through the real ssh wrapper, in order, runs none and writes nothing', async () => {
  const lines = [];
  const log = line => lines.push(line);
  const out = join(scratch(), 'never');
  const code = await runLive({command: 'menu', device: 'mini', out, approvedRuntime: '/h'},
    {ops: liveOps('mini', {exec: dryExec({log, commit: COMMIT})}), connect: dryConnect({log}), controllerCheckout: () => ({commit: COMMIT, dirty: false}), log, dryRun: true});
  assert.equal(code, 0);
  assert.equal(fs.existsSync(out), false);
  const text = lines.join('\n');
  const unquoted = text.replaceAll("'\\''", "'");
  const order = ['printf %s "$HOME"', "live-device.mjs 'begin'", "prepare.mjs prepare", "the native baseline's vendor preflight", "scenes-mac.mjs 'up' 'textedit'",
    "scenes-mac.mjs 'up' 'finder'", "live-device.mjs 'menu'", "scenes-mac.mjs 'down' 'textedit'", 'vendor cell: goldens:bind textedit', 'vendor cell: live:effect bold',
    "live-device.mjs 'watch' 'stop'", 'prepare.mjs cleanup', "live-device.mjs 'putback'"];
  let at = -1;
  for (const needle of order) { const next = unquoted.indexOf(needle, at + 1); assert.ok(next > at, `${needle} in order`); at = next; }
  assert.match(text, /^ssh mini 'cd \$HOME\/Developer\/GitHub\/cua-parity && node scripts\/native-matrix\/live-device\.mjs '\\''begin'\\''/m);
});

test('the dry run of each other command walks its sequence to the put-back', async () => {
  for (const command of ['minimized', 'input-source', 'enablement', 'cleanup']) {
    const lines = [];
    const log = line => lines.push(line);
    const code = await runLive({command, device: 'mini', out: null}, {ops: liveOps('mini', {exec: dryExec({log, commit: COMMIT})}), connect: dryConnect({log}),
      controllerCheckout: () => ({commit: COMMIT, dirty: false}), log, dryRun: true});
    assert.equal(code, 0, command);
    assert.match(lines.join('\n'), /live-device\.mjs '\\''putback'\\''/, command);
  }
});

test('the vendor cells return indexes and booleans only, and refuse when TextEdit is not bound', async () => {
  const run = async code => {
    const written = [];
    Object.assign(globalThis, {nodeRepl: {write: text => written.push(text)}});
    try { await new (Object.getPrototypeOf(async () => {}).constructor)(code)(); } finally { delete globalThis.nodeRepl; }
    return parseCell(written.join('\n'));
  };
  delete globalThis.__apps;
  assert.match((await run(MENU_BAR('selectAll'))).error, /not bound/);
  const texts = vendorTexts();
  globalThis.__apps = {textedit: {getAXState: async () => texts.next(), click: async index => texts.clicked(index), selectText: async (i, t) => texts.selected(t)}};
  try {
    assert.deepEqual((await run(MENU_BAR('selectAll'))).value, {barFound: true, recorded: true, clickError: null});
    assert.deepEqual((await run(MENU_ITEM('selectAll'))).value, {found: true, enabled: true, clicked: true, clickError: null});
    assert.deepEqual((await run(EFFECT('selectAll'))).value, {effect: true});
    assert.deepEqual((await run(SELECT_FIRST_LINE)).value, {prepared: true});
    assert.deepEqual((await run(EFFECT('bold'))).value, {effect: false});
    texts.state.rooted = 54;
    texts.next = () => '+70 Edit\n+\t71 menu\n+\t\t73 (disabled) Select All';
    assert.deepEqual((await run(MENU_ITEM('selectAll'))).value, {found: true, enabled: false, clicked: false, clickError: null});
  } finally { delete globalThis.__apps; }
  assert.throws(() => MENU_BAR('nope'), /unknown menu item/);
  assert.ok(MARKER);
});
