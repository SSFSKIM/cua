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
import {SSH_OPTIONS, boundedExec, checkPassed, dryConnect, dryExec, journaledScript, liveOps, parseCommand, runLive, stepTimeout} from '../../scripts/native-matrix/live.mjs';
import {JOURNAL_FILE, parseJournal, putBackBoundMs, recoverBoundMs} from '../../scripts/native-matrix/live-checks.mjs';
import {execFileSync} from 'node:child_process';

const scratches = [];
const scratch = () => { const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'cua-live-'))); scratches.push(dir); return dir; };
after(() => { for (const dir of scratches) fs.rmSync(dir, {recursive: true, force: true}); });
const COMMIT = 'c'.repeat(40);
const RUN = '/Users/u/Library/Caches/cua-harness/native-live';
const PREPARED = {device: 'mini', home: '/h', userHome: '/Users/u', configHome: '/s/config', tmpdir: '/s/tmp', admission: 'token',
  runtimeReuse: {approvedHome: '/h', release: '26.928.40906-darwin-arm64', runtimeRoot: '/h/runtimes/26.928.40906-darwin-arm64'}};
const WORKS = {found: true, enabled: true, valid: true, clicked: true, click: {ok: true, route: 1, posted: true}, effect: true};
const PASSED = {minimized: {steps: {}, verdict: {pass: true}}, enablement: {verdict: {released: true}}, 'input-source': {verdict: {pass: true}}, paste: {steps: {}, verdict: {pass: true}},
  menu: {items: {selectAll: WORKS, bold: WORKS}, activations: []}};

// A device double answering each CLI command; `calls` keeps the order.
function fakeDevice({begin = {refusals: [], checkout: {commit: COMMIT, dirty: false}, engine: {build: 'b'}, frontmost: {bundleId: 'com.apple.Terminal'}, engineStop: {wasRunning: false}},
  live = {}, upFails = null, putback = {plan: ['scenes-down', 'engine-stop', 'apps-check', 'front-app'], steps: {}, ok: true}, frontmost = () => ({pid: 77, bundleId: 'com.apple.Terminal'}),
  onCall = () => {}} = {}) {
  const calls = [];
  let pid = 600;
  const ops = {
    home: () => '/Users/u',
    live(args) {
      calls.push(['live', ...args]);
      onCall(['live', ...args]);
      const [command] = args;
      if (live[command]) return typeof live[command] === 'function' ? live[command](args) : live[command];
      if (command === 'begin') return begin;
      if (command === 'putback') return putback;
      if (command === 'recover') return {killed: [], survivors: [], putBack: putback, ok: putback.ok === true};
      if (command === 'watch') return args[1] === 'start' ? {watching: true} : {activations: [{kind: 'activated', bundleId: 'com.apple.TextEdit', scene: true}]};
      if (command === 'menu') return {...PASSED.menu, menuActivation: args[args.indexOf('--menu-activation') + 1] === 'on'};
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
  assert.deepEqual(device.calls.map(c => c.slice(0, 3).join(' ')), ['live begin --run', 'scenes up textedit', 'live minimized --run', 'live recover --run', 'scenes frontmost']);
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
  assert.deepEqual(device.calls.map(c => c.slice(0, 2).join(' ')), ['live begin', 'scenes up', 'live recover', 'scenes frontmost']);
  const r = result(out);
  assert.equal(r.complete, false);
  assert.match(r.problems[0], /enablement check stopped/);
});

test('a put-back that does not finish leaves the command incomplete whatever the check said', async () => {
  const device = fakeDevice({putback: {plan: [], steps: {'apps-check': {ok: false}}, ok: false}}), out = scratch();
  assert.equal(await runLive({command: 'input-source', device: 'mini', out}, io(device)), 1);
  assert.deepEqual(device.calls.map(c => c.slice(0, 2).join(' ')), ['live begin', 'live input-source', 'live recover', 'scenes frontmost']);
  assert.equal(result(out).complete, false);
});

test('menu: the vendor home prepared and checked first, cua\'s lane, a fresh TextEdit, the vendor\'s lane cell by cell with the front read between, then the home cleaned and the put-back', async () => {
  const device = fakeDevice({frontmost: () => ({pid: 700, bundleId: 'com.apple.finder'})}), out = scratch();
  const texts = vendorTexts(), vendor = fakeVendor({texts});
  const code = await runLive({command: 'menu', device: 'mini', out, approvedRuntime: '/h'}, io(device, {connect: vendor.connect}));
  const r = result(out);
  assert.equal(code, 0, JSON.stringify(r.problems));
  assert.deepEqual(device.calls.filter(c => c[0] !== 'scenes' || c[1] !== 'frontmost').map(c => (c[1] === 'menu' ? c.slice(0, 2).concat(c.slice(4)) : c.slice(0, 3)).join(' ')),
    ['live begin --run', 'prepare /h', 'preflight', 'scenes up textedit', 'scenes up finder', 'scenes activate finder', 'live menu --menu-activation off',
      'scenes down textedit', 'scenes up textedit', 'scenes activate finder', 'live menu --menu-activation on',
      'scenes down textedit', 'scenes up textedit', 'live watch start', 'scenes activate finder', 'scenes activate finder', 'live watch stop', 'cleanup /h', 'live recover --run']);
  assert.deepEqual(vendor.cells, ['first', 'goldens:bind textedit', 'live:bar selectAll', 'live:item selectAll', 'live:effect selectAll', 'live:select bold',
    'live:bar bold', 'live:item bold', 'live:effect bold']);
  assert.deepEqual(vendor.clicks, [54, 73, 55, 84]);
  assert.deepEqual(vendor.selects, [[2, 'cua scene document']]);
  assert.equal(vendor.closed, true);
  const {vendor: lane, comparison, setting, cua} = r.check;
  assert.deepEqual([cua.off.menuActivation, cua.on.menuActivation], [false, true]);
  assert.equal(setting.setting, 'off');
  assert.equal(setting.line, 'keep off: every item acts without activation (spikeMenuActivation stays off by default)');
  assert.equal(lane.items.selectAll.enabled, true);
  assert.equal(lane.items.selectAll.effect, true);
  assert.equal(lane.items.bold.prepared, true);
  assert.equal(lane.items.bold.effect, true);
  assert.deepEqual(lane.items.selectAll.front[0], {bundleId: 'com.apple.finder', user: true, textedit: false});
  assert.deepEqual(lane.activations, [{kind: 'activated', bundleId: 'com.apple.TextEdit', scene: true}]);
  assert.equal(comparison.off.decision, 'no activation: cua reads the responder-chain items enabled and they act without it');
  assert.equal(comparison.on.decision, 'with activation: cua\'s items act with route 3\'s activation around the press');
  assert.equal(r.vendor.engineAttestation.engine, 'vendor');
  assert.equal(fs.existsSync(join(out, 'preparation.json')), false, 'a cleaned home leaves no preparation behind');
  assert.doesNotMatch(JSON.stringify(r), /Line 0/, 'no document text in the result');
});

test('menu: the setting verdict comes from the two cua lanes, so a result where only the switch works says to set it on', async () => {
  const fails = {...WORKS, effect: false};
  const device = fakeDevice({frontmost: () => ({pid: 700, bundleId: 'com.apple.finder'}),
    live: {menu: args => ({menuActivation: args.includes('on'), items: args.includes('on') ? {selectAll: WORKS, bold: WORKS} : {selectAll: fails, bold: WORKS}, activations: []})}});
  const out = scratch();
  const code = await runLive({command: 'menu', device: 'mini', out, approvedRuntime: '/h'}, io(device, {connect: fakeVendor({texts: vendorTexts()}).connect}));
  assert.equal(code, 0);
  const {setting, comparison} = result(out).check;
  assert.equal(setting.setting, 'on');
  assert.deepEqual(setting.labels, {off: {selectAll: 'no effect', bold: 'acts'}, on: {selectAll: 'acts', bold: 'acts'}});
  assert.equal(comparison.off.items.selectAll.cuaWorse, true);
});

test('paste: TextEdit and Finder up, Finder in front, the device check, then the put-back', async () => {
  const device = fakeDevice(), out = scratch();
  assert.equal(await runLive({command: 'paste', device: 'mini', out}, io(device)), 0);
  assert.deepEqual(device.calls.map(c => c.slice(0, 3).join(' ')),
    ['live begin --run', 'scenes up textedit', 'scenes up finder', 'scenes activate finder', 'live paste --run', 'live recover --run', 'scenes frontmost']);
  assert.equal(result(out).pass, true);
});

test('menu: a vendor lane that fails still closes its serve, cleans the vendor home and puts back', async () => {
  const device = fakeDevice({frontmost: () => ({pid: 700, bundleId: 'com.apple.finder'})}), out = scratch();
  const vendor = fakeVendor({texts: {next: () => { throw new Error('noWindowsAvailable'); }, clicked() {}, selected() {}}});
  const code = await runLive({command: 'menu', device: 'mini', out, approvedRuntime: '/h'}, io(device, {connect: vendor.connect}));
  assert.equal(code, 1);
  const r = result(out);
  assert.match(r.check.vendor.problem, /noWindowsAvailable/);
  assert.match(r.check.comparison.off.decision, /^undecided/);
  assert.equal(vendor.closed, true);
  assert.ok(device.calls.some(c => c[0] === 'cleanup'));
  assert.equal(device.calls.at(-2)[1], 'recover');
});

test('cleanup: the put-back alone, and the vendor home from a preparation a dead menu command left', async () => {
  const device = fakeDevice(), dir = scratch(), preparation = join(dir, 'preparation.json');
  fs.writeFileSync(preparation, JSON.stringify({device: 'mini', prepared: PREPARED, run: RUN}));
  assert.equal(await runLive({command: 'cleanup', device: 'mini', preparation}, io(device)), 0);
  assert.deepEqual(device.calls.map(c => c.slice(0, 2).join(' ')), ['live recover', 'scenes frontmost', 'cleanup /h'], 'the recovery stops a serve still running before its home goes');
  assert.equal(fs.existsSync(preparation), false);
});

test('checkPassed: each check\'s own bar', () => {
  assert.equal(checkPassed('minimized', {verdict: {pass: true}}), true);
  assert.equal(checkPassed('minimized', {problem: 'x', verdict: {pass: true}}), false);
  assert.equal(checkPassed('enablement', {verdict: {released: false}}), false);
  const lanes = {off: {items: {}}, on: {items: {}}};
  for (const setting of ['off', 'on', 'neither']) assert.equal(checkPassed('menu', {cua: lanes, vendor: {}, setting: {setting}}), true, `${setting} is a result`);
  assert.equal(checkPassed('menu', {cua: lanes, vendor: {}, setting: {setting: 'undecided'}}), false);
  assert.equal(checkPassed('menu', {cua: {off: lanes.off}, vendor: {}, setting: {setting: 'off'}}), false, 'both settings must have run');
  assert.equal(checkPassed('menu', {cua: {...lanes, on: {problem: 'x'}}, vendor: {}, setting: {setting: 'off'}}), false);
  assert.equal(checkPassed('paste', {verdict: {pass: true}}), true);
  assert.equal(checkPassed('paste', {verdict: {pass: false}}), false);
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
    "scenes-mac.mjs 'up' 'finder'", "live-device.mjs 'menu' '--run'", "'--menu-activation' 'off'", "scenes-mac.mjs 'down' 'textedit'", "scenes-mac.mjs 'up' 'textedit'",
    "live-device.mjs 'menu' '--run'", "'--menu-activation' 'on'", "scenes-mac.mjs 'down' 'textedit'", 'vendor cell: goldens:bind textedit', 'vendor cell: live:effect bold',
    "live-device.mjs 'watch' 'stop'", 'prepare.mjs cleanup', "live-device.mjs 'recover'"];
  let at = -1;
  for (const needle of order) { const next = unquoted.indexOf(needle, at + 1); assert.ok(next > at, `${needle} in order`); at = next; }
  assert.match(text, /^ssh mini 'cd \$HOME\/Developer\/GitHub\/cua-parity && <journaled> && exec node scripts\/native-matrix\/live-device\.mjs '\\''begin'\\''/m);
  assert.doesNotMatch(text, /&& node /, 'every device process the run starts is journaled');
});

test('the dry run of each other command walks its sequence to the put-back', async () => {
  for (const command of ['minimized', 'paste', 'input-source', 'enablement', 'cleanup']) {
    const lines = [];
    const log = line => lines.push(line);
    const code = await runLive({command, device: 'mini', out: null}, {ops: liveOps('mini', {exec: dryExec({log, commit: COMMIT})}), connect: dryConnect({log}),
      controllerCheckout: () => ({commit: COMMIT, dirty: false}), log, dryRun: true});
    assert.equal(code, 0, command);
    assert.match(lines.join('\n'), /live-device\.mjs '\\''recover'\\''/, command);
    if (command !== 'cleanup') assert.match(lines.join('\n'), new RegExp(`live-device\\.mjs '\\\\''${command}'\\\\''`), command);
    if (command !== 'cleanup') assert.match(lines.at(-1), /PASS \(dry run/, command);
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

test('an interrupt is acted on at the next step: the recovery runs once and the command exits 130', async () => {
  const interrupt = {signal: null};
  const device = fakeDevice({onCall: call => { if (call[1] === 'begin') interrupt.signal = 'SIGINT'; }}), out = scratch();
  const code = await runLive({command: 'paste', device: 'mini', out}, io(device, {interrupt}));
  assert.equal(code, 130);
  assert.deepEqual(device.calls.map(c => c.slice(0, 2).join(' ')), ['live begin', 'live recover', 'scenes frontmost'], 'no scene came up after the interrupt');
  const r = result(out);
  assert.equal(r.interrupted, 'SIGINT');
  assert.match(r.problems[0], /interrupted by SIGINT/);
  const term = {signal: null};
  const later = fakeDevice({onCall: call => { if (call[1] === 'paste') term.signal = 'SIGTERM'; }});
  assert.equal(await runLive({command: 'paste', device: 'mini', out: scratch()}, io(later, {interrupt: term})), 143);
  assert.equal(later.calls.filter(c => c[1] === 'recover').length, 1, 'the recovery runs once');
});

test('a begin that fails (a timed-out ssh) still runs the recovery: it may have saved the front app or stopped the engine', async () => {
  const device = fakeDevice({live: {begin: () => { throw Object.assign(new Error('spawnSync ssh ETIMEDOUT'), {code: 'ETIMEDOUT'}); }}}), out = scratch();
  assert.equal(await runLive({command: 'minimized', device: 'mini', out}, io(device)), 1);
  assert.deepEqual(device.calls.map(c => c.slice(0, 2).join(' ')), ['live begin', 'live recover', 'scenes frontmost']);
  assert.match(result(out).problems[0], /begin failed: spawnSync ssh ETIMEDOUT/);
});

test('a device step that times out ends the check; the recovery (which stops what still runs on the device) follows', async () => {
  const device = fakeDevice({live: {paste: () => { throw Object.assign(new Error('spawnSync ssh ETIMEDOUT'), {code: 'ETIMEDOUT'}); }}}), out = scratch();
  assert.equal(await runLive({command: 'paste', device: 'mini', out}, io(device)), 1);
  assert.deepEqual(device.calls.map(c => c.slice(0, 2).join(' ')).slice(-3), ['live paste', 'live recover', 'scenes frontmost']);
  assert.equal(result(out).complete, false);
});

test('boundedExec: every ssh gets ConnectTimeout and ServerAlive and its step\'s timeout; anything else passes through', () => {
  const seen = [];
  const exec = boundedExec((command, args, options) => { seen.push({command, args, options}); return ''; });
  exec('ssh', ['-o', 'BatchMode=yes', 'mini', "export PATH=x\ncd $HOME/Developer/GitHub/cua-parity && node scripts/native-matrix/live-device.mjs 'paste' '--run' '/r'"], {encoding: 'utf8'});
  exec('ssh', ['mini', 'printf %s "$HOME"'], {});
  exec('ssh', ['mini', "cd x && node scripts/repl-parity/scenes-mac.mjs 'activate' 'finder'"], {});
  exec('git', ['status'], {});
  assert.deepEqual(seen[0].args.slice(0, 6), [...SSH_OPTIONS]);
  assert.deepEqual(SSH_OPTIONS, ['-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4']);
  assert.deepEqual([seen[0].options.timeout, seen[1].options.timeout, seen[2].options.timeout], [420_000, 30_000, 60_000]);
  assert.equal(seen[0].options.killSignal, 'SIGKILL');
  assert.equal(seen[0].options.encoding, 'utf8');
  assert.deepEqual(seen[3], {command: 'git', args: ['status'], options: {}});
  assert.ok(stepTimeout("node scripts/native-matrix/live-device.mjs 'recover' '--run' '/r'") > recoverBoundMs(), 'the controller outwaits the recovery\'s own bounds');
  assert.ok(stepTimeout("node scripts/native-matrix/live-device.mjs 'putback' '--run' '/r'") > putBackBoundMs());
});

test('journaledScript: the remote shell journals its own pid and start time, then execs the device CLI or the serve in its place', () => {
  const cli = "export PATH=x\ncd $HOME/Developer/GitHub/cua-parity && node scripts/repl-parity/scenes-mac.mjs 'up' 'textedit' '--run' '/r'";
  const journaled = journaledScript(cli, '/r');
  assert.match(journaled, /^export PATH=x\ncd \$HOME\/Developer\/GitHub\/cua-parity && \/bin\/mkdir -p -m 700 '\/r' && printf /);
  assert.match(journaled, /"\$\$" "\$\(LC_ALL=C \/bin\/ps -o lstart= -p \$\$\)" 'scenes-mac\.mjs up' >> '\/r\/live-journal\.tsv' && exec node scripts\/repl-parity\/scenes-mac\.mjs 'up'/);
  const serve = "export PATH=x\ncd '/c' && exec env -i PATH=\"$PATH\" CUA_HOME='/h' node '/c/scripts/native-baseline/serve.mjs'";
  assert.match(journaledScript(serve, '/r'), /'vendor serve' >> '\/r\/live-journal\.tsv' && exec env -i PATH=/);
  assert.equal(journaledScript('printf %s "$HOME"', '/r'), 'printf %s "$HOME"', 'a shell step that execs no node is not a process the run leaves');
  assert.equal(journaledScript(cli, null), cli);
});

test('journaledScript, run by a real shell: the journaled pid and start time are the exec\'d process\'s own', () => {
  const run = scratch(), shell = fs.existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/sh';
  const probe = "node -e \"const {execFileSync} = require('node:child_process'); console.log(JSON.stringify({pid: process.pid, start: execFileSync('/bin/ps', ['-o', 'lstart=', '-p', String(process.pid)], {encoding: 'utf8', env: {...process.env, LC_ALL: 'C'}}).trim()}))\"";
  const out = JSON.parse(execFileSync(shell, ['-c', journaledScript(`cd ${run} && ${probe}`, join(run, 'device-run'))], {encoding: 'utf8'}));
  const [row] = parseJournal(fs.readFileSync(join(run, 'device-run', JOURNAL_FILE), 'utf8'));
  assert.equal(row.pid, out.pid);
  assert.equal(row.start, out.start.split(/\s+/).join(' '));
  assert.equal(fs.statSync(join(run, 'device-run')).mode & 0o777, 0o700);
});

test('liveOps journals every device CLI and the serve once the run is named; the input-source check names it too', async () => {
  const seen = [];
  const exec = (command, args) => { seen.push(args.at(-1)); return '{"ok":true}\n'; };
  const ops = liveOps('mini', {exec});
  ops.live(['minimized', '--run', '/r']);
  ops.journalTo('/r');
  ops.live(['minimized', '--run', '/r']);
  assert.doesNotMatch(seen[0], /live-journal/);
  assert.match(seen[1], /'live-device\.mjs minimized' >> '\/r\/live-journal\.tsv' && exec node /);
  const device = fakeDevice(), out = scratch();
  await runLive({command: 'input-source', device: 'mini', out}, io(device));
  assert.deepEqual(device.calls.find(c => c[1] === 'input-source'), ['live', 'input-source', '--run', result(out).runDir]);
});

test('the dry run\'s menu lanes carry the setting their flags asked for', async () => {
  const lines = [];
  const log = line => lines.push(line);
  const ops = liveOps('mini', {exec: dryExec({log, commit: COMMIT})});
  assert.equal(ops.live(['menu', '--run', '/r', '--menu-activation', 'on']).menuActivation, true);
  assert.equal(ops.live(['menu', '--run', '/r', '--menu-activation', 'off']).menuActivation, false);
});
