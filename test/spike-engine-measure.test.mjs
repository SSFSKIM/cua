// measure.mjs (scripts/spike/engine/measure.mjs and ./measure/; the own native engine spec, M0 "Spike" and "Promote or
// discard"): argument parsing, the approval matcher without `mode`, the not-run rows of the cua lane while its input
// methods are not built, the summary's promote/discard table from fixture results, Finder's structural goldens, the
// golden-file path check, the input source's save and restore, that every cell compiles, and a run that refuses before
// anything is prepared when the checkout's build is not the approved one.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseCommand} from '../scripts/spike/engine/measure.mjs';
import {switchVerdict, SWITCHES, isSceneApproval, notRunRows, STRUCTURAL_ROWS, NOT_BUILT, CUA_INPUT_METHODS_BUILT, isSessionFile, withInputSource, runOnce, SCENE_ORDER, cuaServeCommand, UNICODE_STRINGS} from '../scripts/spike/engine/measure/lane.mjs';
import {summarize, renderSummary, median} from '../scripts/spike/engine/measure/summary.mjs';
import {redactGolden} from '../scripts/spike/engine/measure/redact.mjs';
import {NOTE} from '../scripts/spike/engine/render.mjs';
import * as spikeCells from '../scripts/spike/engine/measure/cells.mjs';
import {deviceOf, inCheckout} from '../scripts/spike/engine/measure/device.mjs';
import {parseCell, SCREENSHOT} from '../scripts/native-baseline/cells.mjs';

const tempDir = t => { const dir = fs.mkdtempSync(join(tmpdir(), 'cua-measure-')); t.after(() => fs.rmSync(dir, {recursive: true, force: true})); return dir; };

test('parseCommand: the engine commands, a lane run with its defaults, summary, and the refusals of bad arguments', () => {
  assert.deepEqual(parseCommand(['stop', '--device', 'mini']), {command: 'stop', device: 'mini', engine: undefined, dryRun: false});
  assert.deepEqual(parseCommand(['approve', '--device', 'local', '--dry-run']), {command: 'approve', device: 'local', engine: undefined, dryRun: true});
  assert.equal(parseCommand(['status', '--device', 'mini', '--approved-engine', '/x/cua Engine.app']).engine, '/x/cua Engine.app');
  const run = parseCommand(['--device', 'mini', '--lane', 'cua', '--runs', '3', '--approved-runtime', '/Users/u/cua-home', '--out', '/tmp/spike/cua']);
  assert.deepEqual(run, {command: 'run', device: 'mini', lane: 'cua', runs: 3, approvedRuntime: '/Users/u/cua-home', out: '/tmp/spike/cua', samples: 30, tasks: 10,
    scenes: SCENE_ORDER, probes: ['c'], operator: false, sceneDir: undefined, node: undefined, engine: undefined});
  assert.deepEqual(parseCommand(['--device', 'mini', '--lane', 'vendor', '--runs', '1', '--approved-runtime', '/h', '--out', '/o', '--scenes', 'finder,textedit', '--probes', 'none']).scenes, ['textedit', 'finder']);
  assert.deepEqual(parseCommand(['summary', '/tmp/spike']), {command: 'summary', dir: '/tmp/spike'});
  const refused = [
    [['--lane', 'cua'], /--device is required/],
    [['--device', 'mini', '--lane', 'other', '--runs', '1', '--approved-runtime', '/h', '--out', '/o'], /--lane must be vendor or cua/],
    [['--device', 'mini', '--lane', 'cua', '--runs', '0', '--approved-runtime', '/h', '--out', '/o'], /--runs must be a positive integer/],
    [['--device', 'mini', '--lane', 'cua', '--runs', '1', '--approved-runtime', 'relative', '--out', '/o'], /absolute/],
    [['--device', 'mini', '--lane', 'cua', '--runs', '1', '--out', '/o'], /--approved-runtime is required/],
    [['--device', 'mini', '--lane', 'cua', '--runs', '1', '--approved-runtime', '/h'], /--out is required/],
    [['--device', 'mini', '--lane', 'cua', '--runs', '1', '--approved-runtime', '/h', '--out', '/o', '--scenes', 'safari'], /--scenes/],
    [['--device', 'mini', '--lane', 'cua', '--runs', '1', '--approved-runtime', '/h', '--out', '/o', '--probes', 'a'], /--probes/],
    [['--device', 'mini', '--lane', 'vendor', '--runs', '1', '--approved-runtime', '/h', '--out', '/o', '--node', '/n'], /--node/],
    [['status', '--device', 'mini', '--dry-run'], /--dry-run is for stop and approve/],
    [['probe-f', '--device', 'mini'], /--out/],
    [['summary'], /summary takes/],
    [['frobnicate', '--device', 'mini'], /unknown command/],
  ];
  for (const [argv, pattern] of refused) assert.throws(() => parseCommand(argv), pattern, argv.join(' '));
});

test('the approval matcher accepts a scene app\'s computer-use elicitation with or without mode: form, and nothing else', () => {
  const approval = (app, extra = {}) => ({method: 'elicitation/create', params: {message: 'Allow Computer Use to use "TextEdit"?', requestedSchema: {type: 'object', properties: {}},
    _meta: {connector_id: 'computer-use', codex_approval_kind: 'mcp_tool_call', tool_params: {app}}, ...extra}});
  const ids = ['com.apple.TextEdit', 'com.apple.finder'];
  assert.equal(isSceneApproval(approval('com.apple.TextEdit'), ids), true, 'the own host sends no mode');
  assert.equal(isSceneApproval(approval('com.apple.finder', {mode: 'form'}), ids), true, 'the vendor host sends mode: form');
  assert.equal(isSceneApproval(approval('com.google.Chrome'), ids), false, 'the owner\'s Chrome is never approved');
  assert.equal(isSceneApproval({...approval('com.apple.TextEdit'), method: 'sampling/createMessage'}, ids), false);
  const extraParam = approval('com.apple.TextEdit'); extraParam.params._meta.tool_params.window = 1;
  assert.equal(isSceneApproval(extraParam, ids), false);
  const fields = approval('com.apple.TextEdit'); fields.params.requestedSchema.properties = {secret: {type: 'string'}};
  assert.equal(isSceneApproval(fields, ids), false, 'an elicitation asking for a field is not an approval');
});

test('while the cua engine\'s input is not built, every input cell of the cua lane is one not-run row; the vendor lane has none', () => {
  assert.equal(CUA_INPUT_METHODS_BUILT, false, 'flip this when the engine answers click, press_key and type_text');
  assert.deepEqual(notRunRows({lane: 'vendor', scenes: SCENE_ORDER}), []);
  assert.deepEqual(notRunRows({lane: 'cua', scenes: SCENE_ORDER, inputBuilt: true}), []);
  const rows = notRunRows({lane: 'cua', scenes: SCENE_ORDER});
  assert.ok(rows.every(r => r.notRun === NOT_BUILT && r.ok === false && r.sample === 1));
  const ops = new Set(rows.map(r => r.op));
  for (const op of ['task.act', 'task.verify', 'task.close', 'task.total', 'golden.action', 'probe.a.click', 'probe.a.key', 'probe.b.click', 'probe.b.key', 'probe.d.noFire', 'probe.d.operatorKeystroke', 'probe.e.typeText'])
    assert.ok(ops.has(op), op);
  assert.equal(rows.filter(r => r.op === 'golden.action').length, 4, 'one action sequence per scene');
  assert.equal(rows.filter(r => r.op === 'probe.a.click').length, 4, 'probe (a) per family');
  assert.deepEqual(rows.filter(r => r.op === 'probe.e.typeText').map(r => `${r.source}/${r.scene}`), ['latin/textedit', 'latin/chrome', 'korean/textedit', 'korean/chrome']);
  assert.ok(!notRunRows({lane: 'cua', scenes: ['finder']}).some(r => r.op.startsWith('task.')), 'the task is TextEdit\'s');
  assert.ok(STRUCTURAL_ROWS.every(r => r.notRun && !r.notRun.includes(NOT_BUILT)));
});

// Fixture results: two runs per lane, TextEdit observation samples, per-scene trees, routes and not-run rows.
function writeRun(dir, lane, run, rows, meta = {complete: true}) {
  const runDir = join(dir, lane, `run-${run}`);
  fs.mkdirSync(runDir, {recursive: true});
  fs.writeFileSync(join(runDir, 'results.jsonl'), rows.map(r => JSON.stringify({lane, run, ...r})).join('\n') + '\n');
  fs.writeFileSync(join(runDir, 'meta.json'), JSON.stringify(meta));
}
const samples = (op, scene, values, extra = {}) => values.map((inCellMs, i) => ({op, scene, sample: i + 1, ok: true, inCellMs, ...extra}));

test('summary: the promote/discard table from the in-cell medians, the per-scene tree costs, the routes and the not-run rows', t => {
  const dir = tempDir(t);
  for (const run of [1, 2]) {
    writeRun(dir, 'vendor', run, [...samples('warm.getAXState', 'textedit', [50, 52, 51]), ...samples('warm.getScreenshot', 'textedit', [80, 82]),
      ...samples('tree.getAXState', 'finder', [300, 310], {elements: 900, textBytes: 40_000}), ...samples('warm.listApps', undefined, [20])]);
    writeRun(dir, 'cua', run, [...samples('warm.getAXState', 'textedit', [40, 41, 39]), ...samples('warm.getScreenshot', 'textedit', [79, 70]),
      ...samples('tree.getAXState', 'finder', [200, 210], {elements: 1000, textBytes: 45_000, engine: {skyshotBytes: 500_000, nodes: 1100, timings: {totalMs: 150, walkMs: 120}}}),
      {op: 'warm.getAXState', scene: 'textedit', sample: 9, ok: false, invalid: 'not in front', inCellMs: 1},
      ...samples("probe.c'.route.public", 'finder', [], {}),
      {op: "probe.c'.route.public", scene: 'finder', sample: 1, ok: true, forwarded: true, observeMs: 180, nodes: 1100, timings: {walkMs: 120}},
      {op: "probe.c'.route.hierarchy", scene: 'finder', sample: 1, ok: true, forwarded: true, observeMs: 90, nodes: 1100, timings: {walkMs: 40}},
      {op: 'valueMarkdown.off', scene: 'textedit', sample: 1, ok: true, forwarded: false, observeMs: 1},
      ...samples('warm.getScreenshot', 'finder', [90, 100]),
      {op: 'preflight.switch', switch: 'prefetch', scene: 'textedit', sample: 1, ok: true, forwarded: true},
      {op: 'preflight.switch', switch: 'settle', scene: 'textedit', sample: 1, ok: false, forwarded: false},
      {op: 'switch.settle', scene: 'textedit', sample: 1, ok: false, notRun: 'the service did not forward settle'},
      ...notRunRows({lane: 'cua', scenes: SCENE_ORDER}), ...STRUCTURAL_ROWS]);
  }
  const s = summarize(dir);
  assert.deepEqual(s.speed.map(r => [r.vendor, r.cua, r.verdict]), [[51, 40, 'at or below'], [81, 74.5, 'at or below']]);
  assert.deepEqual(s.speed[0].n, [6, 6], 'the invalid sample is out');
  assert.match(s.input[0].verdict, /^not run: input methods not built/);
  assert.match(s.verdict, /^NO VERDICT: speed at or below the vendor's; the input rows did not run/);
  const finder = s.scenes.find(r => r.scene === 'finder');
  assert.deepEqual([finder.vendorMs, finder.cuaMs, finder.skyshotBytes, finder.engineTotalMs], [305, 205, 500_000, 150]);
  assert.deepEqual(s.routes.find(r => r.scene === 'finder'), {scene: 'finder', publicMs: 180, hierarchyMs: 90, publicWalkMs: 120, hierarchyWalkMs: 40, publicNodes: 1100, hierarchyNodes: 1100, n: [2, 2], dropped: 0});
  assert.equal(s.switches.find(r => r.name === 'valueMarkdown' && r.scene === 'textedit').dropped, 2, 'a sample whose timings disagree with its switch is counted, not measured');
  assert.equal(s.scenes.find(r => r.scene === 'finder').cuaShotMs, 95, 'getScreenshot per scene');
  assert.deepEqual(s.preflight.prefetch, {forwarded: 2, notRun: 0});
  assert.deepEqual(s.preflight.settle, {forwarded: 0, notRun: 2});
  const task = s.notRun.find(r => r.op === 'task.act');
  assert.deepEqual(task, {lane: 'cua', op: 'task.act', scene: 'textedit', source: null, reason: NOT_BUILT, runs: 2});
  assert.deepEqual(s.problems, []);
  const md = renderSummary(s);
  assert.match(md, /\| getAXState, TextEdit \(tree \+ render\), in-cell \| 51 \| 40 \| 6\/6 \| at or below \|/);
  assert.match(md, /\| cua \| task\.act \| textedit \| — \| input methods not built \| 2 \|/);
  assert.match(md, /answers a repeat approval for the same app inside the spike service/);
  assert.match(md, /\| finder \| 180 \| 90 \|/);
  // The settle section renders, with its preflight and the runs it did not run in, though no settle sample exists.
  assert.match(md, /## Probe \(c′\): settle notifications at rest \(cua lane\)\n\nPreflight forwarded in 0 run\(s\)\. The settle switch did not run in 2 run\(s\)/);
  assert.match(md, /\| cua \| switch\.settle \| textedit \| — \| the service did not forward settle \| 2 \|/);
  assert.match(md, /\| finder \| 305 \| 205 \| — \| 95 \|/);
});

test('summary: a cua median above the vendor\'s is the discard fork; a missing lane is a problem and no verdict', t => {
  const dir = tempDir(t);
  writeRun(dir, 'vendor', 1, [...samples('warm.getAXState', 'textedit', [50]), ...samples('warm.getScreenshot', 'textedit', [80])]);
  writeRun(dir, 'cua', 1, [...samples('warm.getAXState', 'textedit', [137]), ...samples('warm.getScreenshot', 'textedit', [60])], {complete: false, error: 'boom'});
  const s = summarize(dir);
  assert.equal(s.speed[0].verdict, 'above');
  assert.match(s.verdict, /^DISCARD FORK/);
  assert.deepEqual(s.problems, ['cua/run-1: incomplete (boom)']);
  const empty = tempDir(t);
  writeRun(empty, 'vendor', 1, samples('warm.getAXState', 'textedit', [50]));
  const none = summarize(empty);
  assert.match(none.verdict, /^NO VERDICT: a speed row has no samples/);
  assert.ok(none.problems.some(p => /cua: no runs/.test(p)));
  const tie = tempDir(t);
  writeRun(tie, 'vendor', 1, [...samples('warm.getAXState', 'textedit', [50]), ...samples('warm.getScreenshot', 'textedit', [80])]);
  writeRun(tie, 'cua', 1, [...samples('warm.getAXState', 'textedit', [50]), ...samples('warm.getScreenshot', 'textedit', [80])]);
  assert.deepEqual(summarize(tie).speed.map(r => r.verdict), ['at or below', 'at or below'], 'equal medians promote ("at or below")');
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([]), null);
});

test('Finder goldens fail closed: owned names and the grammar\'s fixed structure are kept, every other string is replaced by its length', () => {
  const allowed = ['cua-scene-finder', 'scene-file-001'];
  const lines = text => redactGolden(text, 'text', allowed).split('\n');
  assert.deepEqual(lines(['Window: "cua-scene-finder", App: Finder.', '\t0 window (settable) cua-scene-finder', '\t\t1 row (selectable) Secret Project',
    '\t\t\t2 text Value: Tax 2026, ID: sidebar-item', '\t\t3 row (selectable, selected) scene-file-001', '+\t\t4 button Description: AirDrop',
    '\t\t5 row scene-file-001, Description: Owner Secret', '\t6 list (showing 100 of 240 items)', 'Removed element IDs: 5-7, 9', '[truncated: 12 elements omitted]'].join('\n')),
  ['Window: "cua-scene-finder", App: ⟨6⟩.', '\t0 window (settable) cua-scene-finder', '\t\t1 row (selectable) ⟨14⟩', '\t\t\t2 text Value: ⟨8⟩, ID: ⟨12⟩',
    '\t\t3 row (selectable, selected) scene-file-001', '+\t\t4 button Description: ⟨7⟩', '\t\t5 row scene-file-001, Description: ⟨12⟩', '\t6 list (showing 100 of 240 items)',
    'Removed element IDs: 5-7, 9', '[truncated: 12 elements omitted]']);
  // A parenthesised title is not a flags group: only flag words, and only right after the role word.
  assert.deepEqual(lines('\t\t7 row (Taxes, 2026)\n\t\t8 row Archive (selected)\n\t\t9 (selectable) Owner Item'), ['\t\t7 row ⟨13⟩', '\t\t8 row ⟨18⟩', '\t\t9 (selectable) ⟨10⟩']);
  // The focused-element trailer's embedded line goes through the element rule.
  assert.deepEqual(lines('The focused UI element is 3 row (selected) Owner Folder, ID: x'), ['The focused UI element is 3 row (selected) ⟨12⟩, ID: ⟨1⟩']);
  // A selected-text body is the selection itself: every line between the fences is replaced, owned names too.
  assert.deepEqual(lines(['', 'Selected text: ```', 'my private note', 'scene-file-001', '```', '', NOTE].join('\n')), ['', 'Selected text: ```', '⟨15⟩', '⟨14⟩', '```', '', NOTE]);
  assert.deepEqual(lines('Selected:\n2 row (selected) Owner Folder'), ['Selected:', '2 row (selected) ⟨12⟩']);
  // A multi-line value's continuation, and any other line, is replaced whole, whatever its shape.
  assert.deepEqual(lines('\t\t10 text Value: first line\nsecond line: with colon\nscene-file-001 and more\nThe following is a diff from the previous accessibility tree for Window: "Owner"'),
    ['\t\t10 text Value: ⟨10⟩', '⟨23⟩', '⟨23⟩', '⟨80⟩']);
  // Every line terminator splits: no text hides after \r, U+2028 or U+2029 (JS `.` stops at each).
  for (const terminator of ['\r', '\u2028', '\u2029'])
    assert.deepEqual(lines(`\t5 row (selectable) Secret${terminator}Leak`), ['\t5 row (selectable) ⟨6⟩', '⟨4⟩'], JSON.stringify(terminator));
  assert.deepEqual(lines('Window: "Own\rLeak", App: Finder.'), ['⟨12⟩', '⟨19⟩']);
  // In a full tree an index is kept only in sequence: a continuation shaped like an element line is replaced whole.
  assert.deepEqual(lines('\t0 window cua-scene-finder\n\t\t1 text Value: 12 Elm Rd\n42 Main St\n3 row (selected) Budget\n\t\t2 row scene-file-001'),
    ['\t0 window cua-scene-finder', '\t\t1 text Value: ⟨9⟩', '⟨10⟩', '⟨23⟩', '\t\t2 row scene-file-001']);
  assert.deepEqual(redactGolden('~\t\t7 row Owner\n+\t3 row scene-file-001', 'diff.txt', allowed).split('\n'), ['~\t\t7 row ⟨5⟩', '+\t3 row scene-file-001'], 'a diff names indexes out of order');
  const shot = {app: {bundleIdentifier: 'com.apple.finder'}, window: {title: 'Owner Folder', frame: {x: 0}, pid: 1, extra: 'x'}, selectedText: 'scene-file-001 notes', lineage: 'L', mystery: 'secret',
    screenshot: {url: 'file:///Users/u/run/x.jpg', width: 10, height: 5},
    nodes: [{index: 0, role: 'AXRow', roleDescription: 'row', title: 'Secret Project', value: 3, identifier: 'scene-file-001', actions: ['AXPress', 'Name:Open in Tab'], flags: {selected: false}, domClassList: ['owner'], unknown: 'x'}],
    menuBar: [{index: 1, role: 'AXMenuBarItem', title: 'File'}]};
  const red = JSON.parse(redactGolden(JSON.stringify(shot), 'skyshot', allowed));
  assert.deepEqual(red.nodes[0], {index: 0, role: 'AXRow', roleDescription: 'row', title: '⟨14⟩', value: 3, identifier: 'scene-file-001', actions: ['AXPress', '⟨16⟩'], flags: {selected: false}, domClassList: '⟨redacted⟩', unknown: '⟨1⟩'});
  assert.equal(red.menuBar[0].title, '⟨4⟩');
  const roles = JSON.parse(redactGolden(JSON.stringify({nodes: [{index: 0, role: 'AXRow', subrole: 'AXOutlineRow', roleDescription: 'outline'}, {index: 1, role: 'Owner Role', subrole: 'my tag', roleDescription: 'Tax files'}]}), 'skyshot', allowed));
  assert.deepEqual(roles.nodes, [{index: 0, role: 'AXRow', subrole: 'AXOutlineRow', roleDescription: 'outline'}, {index: 1, role: '⟨10⟩', subrole: '⟨6⟩', roleDescription: '⟨9⟩'}]);
  assert.deepEqual(red.window, {title: '⟨12⟩', frame: {x: 0}, pid: 1});
  assert.deepEqual(red.screenshot, {width: 10, height: 5});
  assert.equal(red.selectedText, '⟨20⟩');
  assert.equal(red.mystery, '⟨6⟩');
  assert.equal(red.lineage, 'L');
});

test('a golden file is read only from the session\'s temp directory under the served home, or the run\'s TMPDIR', () => {
  const prepared = {home: '/Users/u/cua-home', tmpdir: '/Users/u/.local/share/cua-native-baseline/run-x/tmp'};
  assert.equal(isSessionFile(prepared, '/Users/u/cua-home/run/4f2a-11/tmp/cua-spike-golden-finder.text.txt'), true);
  assert.equal(isSessionFile(prepared, `${prepared.tmpdir}/cua-spike-golden-chrome.skyshot.json`), true);
  for (const bad of ['/Users/u/.ssh/id_ed25519', '/Users/u/cua-home/run/x/tmp/../../../.ssh/cua-spike-golden-a', '/Users/u/cua-home/state/cua-spike-golden-a', '/tmp/cua-spike-golden-a', '/Users/u/cua-home/run/x/tmp/golden.txt'])
    assert.equal(isSessionFile(prepared, bad), false, bad);
});

test('the input source is saved into the run directory and restored after the cells, even when they fail', async t => {
  const dir = tempDir(t);
  const calls = [];
  let current = 'com.apple.keylayout.ABC';
  const ops = {inputSource(arg) {
    calls.push(arg);
    if (arg === 'current') return {id: current, name: 'ABC'};
    current = arg; return {previous: {}, current: {id: arg}, selected: true};
  }};
  await assert.rejects(withInputSource(ops, dir, async () => { ops.inputSource('com.apple.inputmethod.Korean.2SetKorean'); throw new Error('cell failed'); }), /cell failed/);
  assert.equal(current, 'com.apple.keylayout.ABC');
  assert.deepEqual(JSON.parse(fs.readFileSync(join(dir, 'input-source.json'), 'utf8')), {id: 'com.apple.keylayout.ABC', name: 'ABC'});
  assert.deepEqual(calls, ['current', 'com.apple.inputmethod.Korean.2SetKorean', 'current', 'com.apple.keylayout.ABC']);
  calls.length = 0;
  await withInputSource(ops, dir, async () => {});
  assert.deepEqual(calls, ['current', 'current'], 'nothing switched, nothing restored');
  await assert.rejects(withInputSource({inputSource: () => ({error: 'no'})}, dir, async () => assert.fail('never runs')), /could not be read/);
});

test('every cell compiles as the body of an async function', () => {
  const AsyncFunction = (async () => {}).constructor;
  const cells = [spikeCells.BIND('finder', '/System/Library/CoreServices/Finder.app'), spikeCells.USE_TEXTEDIT('cua-scene'), spikeCells.TREE('chrome', 'cua scene page'),
    spikeCells.SKYSHOT_FACTS('/a.app'), spikeCells.ENGINE_OBSERVE('/a.app', {prefetch: 'hierarchy'}), spikeCells.GOLDEN('finder', '/a.app', 'x', {raw: true}),
    spikeCells.ACTION_GOLDEN('chrome', '/a.app', 'x', 'Scene option', {raw: false}), spikeCells.FINDER_VIEW('cua-scene-finder'), spikeCells.PRESS('finder', 'super+2'),
    spikeCells.LOCATE('textedit', 'cua-scene', 'doc'), spikeCells.ACT_CLICK('finder'), spikeCells.ACT_KEY('finder', 'Down'), spikeCells.ACT_TYPE('textedit', UNICODE_STRINGS.at(-1)),
    spikeCells.READBACK('finder'), spikeCells.TEXT_LANDED('chrome', '/a.app', '0101', '한글 테스트'), spikeCells.BOUND_PID('/a.app'), spikeCells.SCENE_GUARD('electron', 'cua Electron fixture'),
    spikeCells.SCENE_SCREENSHOT('finder')];
  for (const code of cells) assert.doesNotThrow(() => new AsyncFunction('cua', 'nodeRepl', code), code.slice(0, 120));
});

test('the cua serve runs the spike serve in the checkout with a built environment (no inherited CUA settings)', () => {
  const d = deviceOf('mini');
  const {command, args} = cuaServeCommand(d, {home: '/Users/u/home', userHome: '/Users/u', configHome: '/s/config', tmpdir: '/s/tmp', engine: '/e/cua Engine.app'});
  assert.equal(command, 'ssh');
  assert.match(args.at(-1), /cd \$HOME\/Developer\/GitHub\/cua-parity && exec env -i PATH="\$PATH" LANG=C\.UTF-8 HOME='\/Users\/u' XDG_CONFIG_HOME='\/s\/config' TMPDIR='\/s\/tmp' CUA_HOME='\/Users\/u\/home' CUA_ENGINE_APP='\/e\/cua Engine\.app' CUA_SHIM_SURFACES=computer CUA_SHIM_PERSIST=session CUA_SHIM_SECRETS=off node scripts\/spike\/engine\/serve\.mjs$/);
  assert.equal(inCheckout(d, 'cd $HOME/Developer/GitHub/cua-parity && node x.mjs'), 'cd $HOME/Developer/GitHub/cua-parity && node x.mjs');
  assert.throws(() => deviceOf('cua-gce'), /not a macOS device/);
  assert.throws(() => deviceOf('nowhere'), /not declared/);
});

test('a run refuses before preparing anything when the checkout\'s build is not the approved one; a busy engine refuses inside the admission', async t => {
  const dir = tempDir(t);
  const shell = () => assert.fail('nothing runs on the device after a refusal');
  const base = {rpc: () => ({ok: false, unreachable: 'ENOENT'}), bundle: () => ({bundle: '/b', exists: true, build: 'a'.repeat(64), identity: 'I'}),
    approved: () => ({build: 'a'.repeat(64), identity: 'I', approvedAt: 't'}), checkoutBuild: () => ({build: 'f'.repeat(64)})};
  const options = {lane: 'cua', d: {device: 'mini', local: false, node: 'node'}, dir: join(dir, 'run-1'), run: 1, approvedRuntime: dir, scenes: SCENE_ORDER, samples: 1, tasks: 1, sceneDir: '/s'};
  const code = await runOnce(options, {shell, ops: base, log: () => {}});
  assert.equal(code, 2);
  const meta = JSON.parse(fs.readFileSync(join(dir, 'run-1', 'meta.json'), 'utf8'));
  assert.equal(meta.refused, true);
  assert.match(meta.error, /checkout's build ffffffffffff is not the approved build aaaaaaaaaaaa/);
  assert.equal(meta.preparation, undefined, 'nothing prepared');
  assert.equal(fs.readFileSync(join(dir, 'run-1', 'results.jsonl'), 'utf8'), '');
  // A busy engine: the stop runs after the admission is taken (here this Mac's preparation), refuses, and the run
  // prepares nothing further and releases what it took.
  const steps = [];
  const busy = {...base, checkoutBuild: () => ({build: 'a'.repeat(64)}), rpc: method => { steps.push(method); return method === 'status' ? {ok: true, result: {pid: 9, connections: 2}} : assert.fail(`no ${method}`); }};
  const localShell = script => { steps.push(`shell ${script.split(' ')[0]}`); throw new Error('no device here'); };
  assert.equal(await runOnce({...options, d: {device: 'local', local: true, node: 'node'}, dir: join(dir, 'run-2')}, {shell: localShell, ops: busy, log: () => {}}), 2);
  const busyMeta = JSON.parse(fs.readFileSync(join(dir, 'run-2', 'meta.json'), 'utf8'));
  assert.match(busyMeta.error, /2 other connections open/);
  assert.equal(busyMeta.preparation.local, true, 'the stop ran after the preparation');
  assert.equal(fs.existsSync(busyMeta.preparation.scratch + '/config'), false, 'the preparation was released');
  assert.ok(!steps.some(step => step.startsWith('shell') && !step.includes('ps')), `no scene, serve or preflight step: ${steps.join(', ')}`);
  await assert.rejects(runOnce({...options, dir: join(dir, 'run-2')}, {shell, ops: base, log: () => {}}), /already holds a run/);
});

test('a switch\'s preflight verdict: forwarded, not forwarded, or undetermined when the scene cannot show it', () => {
  assert.equal(switchVerdict('prefetch', {route: 'public'}, {route: 'hierarchy'}), true);
  assert.equal(switchVerdict('prefetch', {route: 'public'}, {route: 'public'}), false);
  assert.equal(switchVerdict('settle', {}, {settle: 'settled', settleMs: 300}), true);
  assert.equal(switchVerdict('settle', {}, {}), false);
  assert.equal(switchVerdict('valueMarkdown', {markdownFetches: 3}, {markdownFetches: 0}), true);
  assert.equal(switchVerdict('valueMarkdown', {markdownFetches: 3}, {markdownFetches: 3}), false);
  assert.equal(switchVerdict('valueMarkdown', {markdownFetches: 0}, {markdownFetches: 0}), null);
  assert.equal(switchVerdict('focusableSelectable', {focusableMs: 4, selectableMs: 2}, {}), true);
  assert.equal(switchVerdict('focusableSelectable', {focusableMs: 4}, {focusableMs: 4}), false);
  assert.equal(switchVerdict('focusableSelectable', {}, {}), null);
  assert.equal(switchVerdict('webAreaWait', {webAreaFound: true}, {}), true);
  assert.equal(switchVerdict('webAreaWait', {webAreaFound: true}, {webAreaFound: true}), false);
  assert.equal(switchVerdict('webAreaWait', {}, {}), null);
  assert.equal(switchVerdict('prefetch', null, {route: 'hierarchy'}), false, 'no observation, no verdict of forwarding');
  assert.deepEqual(Object.keys(SWITCHES), ['prefetch', 'valueMarkdown', 'focusableSelectable', 'webAreaWait', 'settle']);
});

// Runs a cell's code against stand-ins for the kernel's globals; -> the parsed marker line.
async function runCell(code, {apps = {}, rpc}) {
  const AsyncFunction = (async () => {}).constructor;
  let out = null;
  globalThis.__apps = apps;
  try { await new AsyncFunction('cua', 'nodeRepl', code)({}, {rpc, write: text => { out = text; }}); }
  finally { delete globalThis.__apps; }
  return parseCell(out);
}

test('probe (e) reads back exactly the sample\'s own text between its markers', async () => {
  const value = 'older #0001#한글#/0001# then #0002#한글 테스트#/0002#';
  const rpc = async () => ({skyshot: {nodes: [{value: 'other'}, {value}]}});
  const apps = {textedit: {getAXState: async () => 'Window: "x", App: TextEdit.'}};
  const exact = await runCell(spikeCells.TEXT_LANDED('textedit', '/a.app', '0002', '한글 테스트'), {apps, rpc});
  assert.deepEqual([exact.value.landed, exact.value.exact], [true, true]);
  const partial = await runCell(spikeCells.TEXT_LANDED('textedit', '/a.app', '0002', '한글'), {apps, rpc});
  assert.deepEqual([partial.value.landed, partial.value.exact], [true, false], 'a prefix of the sample is not an exact landing');
  const missing = await runCell(spikeCells.TEXT_LANDED('textedit', '/a.app', '0003', '한글'), {apps, rpc});
  assert.deepEqual([missing.value.landed, missing.value.exact], [false, false]);
});

test('a golden cell that throws deletes what it wrote before the error leaves', async () => {
  const {tmpdir: osTmp} = await import('node:os');
  const written = join(fs.realpathSync(osTmp()), 'cua-spike-golden-finder.text.txt');
  fs.rmSync(written, {force: true});
  const apps = {finder: {getAXState: async () => 'Window: "cua-scene-finder", App: Finder.\n0 window cua-scene-finder'}};
  const out = await runCell(spikeCells.GOLDEN('finder', '/a.app', 'cua-scene-finder', {raw: true}), {apps, rpc: async () => null});
  assert.equal(out.ok, false);
  assert.match(out.error, /no raw Skyshot/);
  assert.equal(fs.existsSync(written), false, 'the text written before the throw is gone');
});

test('every scene\'s getScreenshot sample is the baseline\'s own cell on that scene\'s bound app', () => {
  const code = spikeCells.SCENE_SCREENSHOT('chrome');
  assert.equal(code, SCREENSHOT.replace('await app.getScreenshot(', 'await globalThis.__apps["chrome"].getScreenshot('));
  assert.notEqual(code, SCREENSHOT);
});
