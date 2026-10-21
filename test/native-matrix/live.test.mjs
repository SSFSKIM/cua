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
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {DRY_ANSWERS, SSH_OPTIONS, boundedExec, cellIo, checkPassed, compositionSummary, dryConnect, dryExec, journaledScript, liveOps, parseCommand, runCell, runLive, stepTimeout} from '../../scripts/native-matrix/live.mjs';
import {JOURNAL_FILE, parseJournal, putBackBoundMs, recoverBoundMs} from '../../scripts/native-matrix/live-checks.mjs';
import {execFileSync} from 'node:child_process';
import {controllerCheckout} from '../../scripts/native-matrix/goldens.mjs';
import {REPO_ROOT} from '../../scripts/native-matrix/goldens-install.mjs';

const scratches = [];
const scratch = () => { const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'cua-live-'))); scratches.push(dir); return dir; };
after(() => { for (const dir of scratches) fs.rmSync(dir, {recursive: true, force: true}); });
const COMMIT = 'c'.repeat(40);
const RUN = '/Users/u/Library/Caches/cua-harness/native-live';
const PREPARED = {device: 'mini', home: '/h', userHome: '/Users/u', configHome: '/s/config', tmpdir: '/s/tmp', admission: 'token',
  runtimeReuse: {approvedHome: '/h', release: '26.928.40906-darwin-arm64', runtimeRoot: '/h/runtimes/26.928.40906-darwin-arm64'}};
const WORKS = {found: true, enabled: true, valid: true, clicked: true, click: {ok: true, route: 1, posted: true}, effect: true};
const PASSED = {minimized: {steps: {}, verdict: {pass: true}}, 'input-source': {verdict: {pass: true}}, paste: {steps: {}, verdict: {pass: true}},
  ...Object.fromEntries(['enablement', 'route4', 'minimized-select', 'hscroll', 'hscroll-read'].map(c => [c, DRY_ANSWERS[`live-device.mjs ${c}`]])),
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
  const device = fakeDevice({upFails: 'electron'}), out = scratch();
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
  assert.deepEqual(device.calls.filter(c => c[0] !== 'scenes' || c[1] !== 'frontmost').map(c => c.slice(0, 3).join(' ')),
    ['live begin --run', 'prepare /h', 'preflight', 'scenes up textedit', 'scenes up finder', 'scenes activate finder', 'live menu --run',
      'scenes down textedit', 'scenes up textedit', 'live watch start', 'scenes activate finder', 'scenes activate finder', 'live watch stop', 'cleanup /h', 'live recover --run']);
  assert.ok(!device.calls.some(c => c.includes('--menu-activation')), 'no engine switch: the held activation is the engine\'s own');
  assert.deepEqual(vendor.cells, ['first', 'goldens:bind textedit', 'live:bar selectAll', 'live:item selectAll', 'live:effect selectAll', 'live:select bold',
    'live:bar bold', 'live:item bold', 'live:effect bold']);
  assert.deepEqual(vendor.clicks, [54, 73, 55, 84]);
  assert.deepEqual(vendor.selects, [[2, 'cua scene document']]);
  assert.equal(vendor.closed, true);
  const {vendor: lane, comparison} = r.check;
  assert.equal(lane.items.selectAll.enabled, true);
  assert.equal(lane.items.bold.effect, true);
  assert.deepEqual(lane.items.selectAll.front[0], {bundleId: 'com.apple.finder', user: true, textedit: false});
  assert.deepEqual(lane.activations, [{kind: 'activated', bundleId: 'com.apple.TextEdit', scene: true}]);
  assert.equal(comparison.decision, 'parity: cua\'s held activation acts on every item the vendor\'s does');
  // result.json is the matrix's CellResult, the live fields kept.
  assert.deepEqual(validateCellResult(r), []);
  assert.equal(r.schema, 'native-matrix-cell-1');
  assert.equal(r.cell, 'menu');
  assert.equal(r.verdict, 'pass');
  assert.deepEqual(r.rows.map(row => `${row.engine} ${row.id} ${row.ok}`), ['cua menu/textedit-behind-finder/selectAll true', 'vendor menu/textedit-behind-finder/selectAll true',
    'cua menu/textedit-behind-finder/bold true', 'vendor menu/textedit-behind-finder/bold true']);
  assert.deepEqual(r.lanes.map(l => l.engine), ['cua', 'vendor']);
  assert.equal(r.vendor.engineAttestation.engine, 'vendor');
  assert.equal(fs.existsSync(join(out, 'preparation.json')), false, 'a cleaned home leaves no preparation behind');
  assert.doesNotMatch(JSON.stringify(r), /Line 0/, 'no document text in the result');
});

test('menu: cua\'s item reading disabled where the vendor\'s acts falls short; its row fails the cell', async () => {
  const disabled = {found: true, enabled: false, valid: true, clicked: false, effect: false};
  const device = fakeDevice({frontmost: () => ({pid: 700, bundleId: 'com.apple.finder'}), live: {menu: {items: {selectAll: disabled, bold: WORKS}, activations: []}}});
  const out = scratch();
  const code = await runLive({command: 'menu', device: 'mini', out, approvedRuntime: '/h'}, io(device, {connect: fakeVendor({texts: vendorTexts()}).connect}));
  assert.equal(code, 1);
  const r = result(out);
  assert.equal(r.check.comparison.decision, 'the held activation falls short: cua reads selectAll disabled or it does nothing where the vendor\'s works');
  assert.equal(r.verdict, 'fail');
  assert.deepEqual(r.rows.filter(row => !row.ok).map(row => `${row.engine} ${row.id} ${row.outcome.label}`), ['cua menu/textedit-behind-finder/selectAll read disabled']);
});

test('paste: TextEdit and Finder up, Finder in front, the device check, then the put-back', async () => {
  const device = fakeDevice(), out = scratch();
  assert.equal(await runLive({command: 'paste', device: 'mini', out}, io(device)), 0);
  assert.deepEqual(device.calls.map(c => c.slice(0, 3).join(' ')),
    ['live begin --run', 'scenes up textedit', 'scenes up finder', 'scenes activate finder', 'live paste --run', 'live recover --run', 'scenes frontmost']);
  assert.equal(result(out).pass, true);
});

// The composition row as the device answers it: the three variants, each with its probe's JSON and its source and layout.
const variantRow = (mode, value) => ({emptied: true, activated: true, source: 'com.apple.inputmethod.Korean.2SetKorean',
  layout: {inputSourceId: 'com.apple.inputmethod.Korean.2SetKorean', keyboardLayoutId: 'com.apple.keylayout.ABC'},
  keys: {invocation: `cua-engine --probe keystroke ${{typed: '', keyCodesOnly: '--key-codes-only ', ansiKeys: '--ansi-keys '}[mode]}… rk`, exitStatus: 0, frontChangedAfter: false,
    output: {pid: 31, layout: 'com.apple.keylayout.ABC', mode, presses: [{keyCode: 15, flags: 0, unicode: mode === 'typed' ? 'r' : null}, {keyCode: 40, flags: 0, unicode: mode === 'typed' ? 'k' : null}], postedAt: 1, units: 2, chars: 2}},
  commit: {exitStatus: 0, frontChangedAfter: false}, complete: true,
  keysUnmodified: true, valueBeforeCommit: value, valueAfterCommit: `${value}\n`, reading: {reading: value}});
const COMPOSED = {steps: {hidComposition: {variants: {unicode: variantRow('typed', '가'), keyCodesOnly: variantRow('keyCodesOnly', 'rk'), ansiKeys: variantRow('ansiKeys', '가')}}}, verdict: {pass: true}};

test('paste: result.json carries the composition row\'s three variants as the device answered them, and the log names each reading', async () => {
  const device = fakeDevice({live: {paste: COMPOSED}}), out = scratch(), lines = [];
  assert.equal(await runLive({command: 'paste', device: 'mini', out}, io(device, {log: line => lines.push(line)})), 0);
  const {variants} = result(out).check.steps.hidComposition;
  assert.deepEqual(Object.keys(variants), ['unicode', 'keyCodesOnly', 'ansiKeys']);
  assert.deepEqual(variants, COMPOSED.steps.hidComposition.variants);
  assert.ok(lines.includes('paste hidComposition: unicode 가 (com.apple.inputmethod.Korean.2SetKorean, layout com.apple.keylayout.ABC, keys unmodified); keyCodesOnly rk (com.apple.inputmethod.Korean.2SetKorean, layout com.apple.keylayout.ABC, keys unmodified); ansiKeys 가 (com.apple.inputmethod.Korean.2SetKorean, layout com.apple.keylayout.ABC, keys unmodified)'), lines.join('\n'));
});

test('compositionSummary: each variant\'s reading or why it did not read; nothing for a row the check did not reach', () => {
  assert.equal(compositionSummary({steps: {hidComposition: {skipped: 'precondition unmet: Korean 2-Set was not selected'}}}), 'hidComposition: skipped (precondition unmet: Korean 2-Set was not selected)');
  assert.equal(compositionSummary({steps: {hidComposition: {variants: {unicode: {skipped: 'front app not the scene'},
    keyCodesOnly: {...variantRow('keyCodesOnly', 'x'), reading: {reading: 'other', verbatim: 'x\n'}, keysUnmodified: false}}}}}),
  'hidComposition: unicode skipped (front app not the scene); keyCodesOnly other (com.apple.inputmethod.Korean.2SetKorean, layout com.apple.keylayout.ABC, keys under a modifier)');
  assert.equal(compositionSummary({steps: {}}), null);
  assert.equal(compositionSummary(undefined), null);
});

test('compositionSummary: a variant whose keys or commit did not go through whole is labelled incomplete, with each post\'s status; a skip names the reset\'s error', () => {
  const keysFailed = {...variantRow('ansiKeys', 'ㄱ'), keys: {...variantRow('ansiKeys', 'ㄱ').keys, exitStatus: 4}, reading: {reading: 'other', verbatim: 'ㄱ\n'}, complete: false};
  const commitSkipped = {...variantRow('keyCodesOnly', 'rk'), commit: {skipped: 'front app not the scene'}, valueAfterCommit: null, complete: false};
  const line = compositionSummary({steps: {hidComposition: {variants: {unicode: variantRow('typed', '가'), keyCodesOnly: commitSkipped, ansiKeys: keysFailed}}}});
  assert.match(line, /unicode 가 \(/, 'a complete variant reads as before');
  assert.match(line, /keyCodesOnly rk INCOMPLETE \(keys exit 0, commit skipped: front app not the scene\)/);
  assert.match(line, /ansiKeys other INCOMPLETE \(keys exit 4, commit exit 0\) \(/);
  const unemptied = compositionSummary({steps: {hidComposition: {variants: {unicode: {emptied: false, skipped: 'the scene document could not be emptied', emptyError: {errorName: 'userIntervened', message: 'x'}}}}}});
  assert.equal(unemptied, 'hidComposition: unicode skipped (the scene document could not be emptied: userIntervened)');
});

test('menu: a vendor lane that fails still closes its serve, cleans the vendor home and puts back', async () => {
  const device = fakeDevice({frontmost: () => ({pid: 700, bundleId: 'com.apple.finder'})}), out = scratch();
  const vendor = fakeVendor({texts: {next: () => { throw new Error('noWindowsAvailable'); }, clicked() {}, selected() {}}});
  const code = await runLive({command: 'menu', device: 'mini', out, approvedRuntime: '/h'}, io(device, {connect: vendor.connect}));
  assert.equal(code, 1);
  const r = result(out);
  assert.match(r.check.vendor.problem, /noWindowsAvailable/);
  assert.match(r.check.comparison.decision, /^undecided/);
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
  for (const command of ['enablement', 'route4', 'minimized-select']) assert.equal(checkPassed(command, PASSED[command]), true, command);
  assert.equal(checkPassed('enablement', {steps: {initial: true, cycles: []}}), false, 'no valid row: no pass');
  assert.equal(checkPassed('route4', {steps: {...PASSED.route4.steps, click: {...PASSED.route4.steps.click, route: 3}}}), false);
  const lanes = {cua: {items: {selectAll: WORKS, bold: WORKS}}, vendor: {items: {selectAll: WORKS, bold: WORKS}}};
  assert.equal(checkPassed('menu', {...lanes, comparison: {items: Object.fromEntries(['selectAll', 'bold'].map(id => [id, {cua: {label: 'acts'}, vendor: {label: 'acts'}}]))}}), true);
  assert.equal(checkPassed('menu', {...lanes, comparison: {items: {selectAll: {cua: {label: 'read disabled'}, vendor: {label: 'acts'}}, bold: {cua: {label: 'acts'}, vendor: {label: 'acts'}}}}}), false);
  assert.equal(checkPassed('hscroll', {cua: PASSED.hscroll, vendor: {before: {horizontal: 0.5}, after: {horizontal: 0.9}, userInFront: true}}), true);
  assert.equal(checkPassed('hscroll', {cua: PASSED.hscroll, vendor: {before: {horizontal: 0.5}, after: {horizontal: 0.5}, userInFront: true}}), true, 'the declared vendor defect');
  assert.equal(checkPassed('hscroll', {cua: PASSED.hscroll, vendor: {before: {horizontal: 0.5}, after: {horizontal: 0.1}, userInFront: true}}), false, 'an opposite sign');
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
    "scenes-mac.mjs 'up' 'finder'", "live-device.mjs 'menu' '--run'", "scenes-mac.mjs 'down' 'textedit'", "scenes-mac.mjs 'up' 'textedit'",
    'vendor cell: goldens:bind textedit', 'vendor cell: live:effect bold',
    "live-device.mjs 'watch' 'stop'", 'prepare.mjs cleanup', "live-device.mjs 'recover'"];
  let at = -1;
  for (const needle of order) { const next = unquoted.indexOf(needle, at + 1); assert.ok(next > at, `${needle} in order`); at = next; }
  assert.match(text, /^ssh mini 'cd \$HOME\/Developer\/GitHub\/cua-parity && <journaled> && exec node scripts\/native-matrix\/live-device\.mjs '\\''begin'\\''/m);
  assert.doesNotMatch(text, /&& node /, 'every device process the run starts is journaled');
});

test('the dry run of each other command walks its sequence to the put-back', async () => {
  for (const command of ['minimized', 'paste', 'input-source', 'enablement', 'route4', 'minimized-select', 'hscroll', 'cleanup']) {
    const lines = [];
    const log = line => lines.push(line);
    const code = await runLive({command, device: 'mini', out: null, ...(command === 'hscroll' ? {approvedRuntime: '/h'} : {})}, {ops: liveOps('mini', {exec: dryExec({log, commit: COMMIT})}), connect: dryConnect({log}),
      controllerCheckout: () => ({commit: COMMIT, dirty: false}), log, dryRun: true});
    assert.equal(code, 0, command);
    assert.match(lines.join('\n'), /live-device\.mjs '\\''recover'\\''/, command);
    if (command !== 'cleanup') assert.match(lines.join('\n'), new RegExp(`live-device\\.mjs '\\\\''${command}'\\\\''`), command);
    if (command !== 'cleanup') assert.match(lines.at(-1), /PASS \(dry run/, command);
    if (command === 'hscroll') {
      const reads = lines.join('\n').replaceAll("'\\''", "'").match(/live-device\.mjs '(hscroll|hscroll-read)'[^\n]*/g);
      assert.deepEqual(reads.map(r => /'--start' '0\.5'/.test(r)), [false, true, false], 'the vendor lane is set mid-way before its scroll, not after');
    }
    if (command === 'paste') assert.match(lines.join('\n'), /^paste hidComposition: unicode \S+ .*; keyCodesOnly \S+ .*; ansiKeys \S+ /m, 'the dry run walks the three variants of the composition row');
  }
  assert.deepEqual(Object.keys(DRY_ANSWERS['live-device.mjs paste'].steps.hidComposition.variants), ['unicode', 'keyCodesOnly', 'ansiKeys']);
});

test('cellIo is the io main runs a command with, so the registry\'s runCell runs a residue cell as live.mjs does', async () => {
  const lines = [];
  const log = line => lines.push(line);
  const options = {command: 'hscroll', device: 'mini', out: null, approvedRuntime: '/h', dryRun: true};
  const io = cellIo(options, {log, dryRun: true});
  assert.deepEqual(Object.keys(io).sort(), ['connect', 'controllerCheckout', 'dryRun', 'interrupt', 'log', 'ops'].sort());
  assert.deepEqual(io.interrupt, {signal: null});
  assert.deepEqual(io.controllerCheckout(), controllerCheckout(REPO_ROOT));
  const live = cellIo({...options, dryRun: false}, {log});
  assert.equal(live.dryRun, undefined);
  assert.deepEqual(Object.keys(live).sort(), ['connect', 'controllerCheckout', 'interrupt', 'log', 'ops'].sort());
  // The checkout under test may be dirty; the dry run's own refusal of one is covered by the begin tests.
  const code = await runCell('hscroll', options, {...io, controllerCheckout: () => ({commit: io.controllerCheckout().commit, dirty: false})});
  assert.equal(code, 0);
  assert.match(lines.at(-1), /^hscroll PASS \(dry run/);
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

