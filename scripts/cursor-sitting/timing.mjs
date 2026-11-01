// Acceptance 12 and 13's samples (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md): two sessions on the
// approved engine, `on` (the cursor on, the default) and `off` (CUA_CURSOR=0), taking their samples interleaved in one
// sitting (./stats.mjs sampleOrder: the side that leads alternates), each sample 6 s after the one before, so the
// cursor-on session's cursor has faded before the cursor-off session acts and nothing of either is animating when the
// next sample starts. Every time is the cell's own, performance.now() around the awaited call, so MCP and the REPL's
// dispatch are not in it.
//   typing  in the run's TextEdit document, TextEdit frontmost (the key guard): an untimed prime at one corner (the
//           cursor-on session's cursor fades in there: ./cells.mjs PRIME), a click at the other corner, so it starts a
//           long glide, then a type_text of 200 characters while it glides; a click back, another long glide, then 30
//           single press_key calls ("x"), their total one sample.
//   clicks  TextEdit frontmost and the Electron fixture behind it: an untimed prime at the opposite corner, then a
//           coordinate click in TextEdit (corners alternating, so it glides),
//           an element click on the fixture's button (the engine's route 3 for a background fixture; each sample's
//           route is recorded), and a drag across TextEdit's text.
// Each series has its own count of samples a side (sampleCounts): a judged run starts coordinate click and drag at 40,
// since both were undetermined at 20 on the first build, and element click, type_text and press_key at 20, rerun at 40
// (alone: `--series`) only when undetermined; an arm or the owner's-source series is 20 each. A sample index past a
// series' count leaves that series out; every sample is still primed. `judge` takes each series from the last run that
// covers it (seriesRuns), so a 40-sample rerun replaces the earlier verdict for every series it covers, and only those.
// Before either, with TextEdit in front (its document's input source is the one the keys meet), the approved engine's
// probe reads the input source: a judged series runs only under a Latin keyboard layout and is refused otherwise, since
// under an input method the press_key timings measure the method's composition (#235's Decision Log, 2026-10-31). Two
// kinds of series are recorded under their own item and never judged: one under the owner's own source (the source
// read and kept, not required), and an arm, run with engine.json's `cursorDebug` set to one of the engine's diagnostic
// arms (the engine relaunched with it, the running arm checked, engine.json put back and the engine stopped after).
// The cursor's animations are capped at 60 Hz by default (#235's Decision Log, 2026-10-31); the `uncapped` arm lifts the
// cap, as the cursor was before. Its series first proves the cap: the approved bundle's cursor probe glides with the arm
// and without it, and the window server's frames during those glides are counted (./frames.mjs); every series then
// counts the frames during its own glides (cursor-sitting.mjs), so the arm's timing is read beside the rate its glides
// actually ran at.
import {CLEAR_SELECTION, CLICK_AT, CLICK_CONTROL_TIMED, DRAG, PRIME, STILL_SAMPLE, TYPING_SAMPLE} from './cells.mjs';
import {sampleOrder} from './stats.mjs';

export const SAMPLE_GAP_MS = 6000;
// The still series' wait after its glide click, at least: the planned settle plus STILL_TAIL_MS (the halo's swell relaxes
// after the tip settles), and under the 5 s fade.
export const STILL_WAIT_MS = 1200, STILL_TAIL_MS = 250, STILL_WAIT_MAX_MS = 4000;
const A = [0.1, 0.35], B = [0.9, 0.85];

// The engine's cursor arms, engine.json `cursorDebug` (native/engine/Sources/Engine/Config.swift, CursorDebug).
export const CURSOR_ARMS = Object.freeze(['panelOut', 'noBackdrop', 'noRock', 'legacyLayers', 'uncapped']);
// The arm that lifts the default's frame-rate cap: its series first proves the cap against it (the glide-frames task).
export const UNCAPPED_ARM = 'uncapped';

// Why the input source `reading` (the probe's `input-source current`) is not a Latin keyboard layout, or null when it
// is: a plain keyboard layout (no input method), ASCII-capable, and the layout key events are translated with now.
export function latinSourceProblem(reading) {
  if (!reading?.id || !reading.layout) return 'the input source could not be read';
  const named = `${reading.name || reading.id} (${reading.id})`;
  if (reading.keyboardLayout !== true || reading.asciiCapable !== true) return `the input source ${named} is not a Latin keyboard layout`;
  if (reading.layout !== reading.id) return `the input source ${named} is selected, but keys are translated with ${reading.layout}`;
  return null;
}

// The item a series records under: the judged item (12 or 13), or that item with the arm's name, `owner-source`, or
// `source-<the named source's last part>` (com.apple.inputmethod.Korean.2SetKorean: 12-source-2SetKorean).
export function timingItem(kind, {arm = null, ownerSource = false, source = null, still = false, control = false} = {}) {
  const item = kind === 'typing' ? '12' : '13';
  if (still) return `${item}-still`;
  if (control) return `${item}-control`;
  if (source) return `${item}-source-${source.split('.').at(-1).replace(/[^\w-]/g, '-')}`;
  return arm ? `${item}-${arm}` : ownerSource ? `${item}-owner-source` : item;
}

export const SERIES = Object.freeze({
  typing: ['type_text', 'press_key x30'],
  clicks: ['coordinate click', 'element click', 'drag'],
});
// The series by the names the CLI takes (`--series`).
export const SERIES_IDS = Object.freeze({'coordinate-click': 'coordinate click', 'element-click': 'element click', drag: 'drag', 'type-text': 'type_text', 'press-key': 'press_key x30'});
// A judged run's starting counts, a side.
export const JUDGED_SAMPLES = Object.freeze({'coordinate click': 40, 'element click': 20, drag: 40, type_text: 20, 'press_key x30': 20});
export const RECORDED_SAMPLES = 20;

// The samples a side of each series a run takes: `only` (CLI ids) picks series of `kind`, `samples` sets them all, else
// the judged starting counts, or RECORDED_SAMPLES each for a recorded run. -> {series name: n}.
export function sampleCounts(kind, {samples = null, only = null, recorded = false} = {}) {
  if (!SERIES[kind]) throw new Error('timing takes typing or clicks');
  const ids = Object.keys(SERIES_IDS).filter(id => SERIES[kind].includes(SERIES_IDS[id]));
  const names = only ? only.map(id => {
    if (!ids.includes(id)) throw new Error(`the ${kind} series are ${ids.join(', ')}`);
    return SERIES_IDS[id];
  }) : SERIES[kind];
  return Object.fromEntries(names.map(name => [name, samples ?? (recorded ? RECORDED_SAMPLES : JUDGED_SAMPLES[name])]));
}

const sessions = scenes => [
  {open: 'on', scenes},
  {open: 'off', scenes, env: {CUA_CURSOR: '0'}},
  {task: 'activate', args: ['textedit'], required: true},
];

// The steps of `kind` with `samples` a side (./runner.mjs runs them): a number for every series, or {series name: n}
// (sampleCounts); `arm`, one of CURSOR_ARMS, or `ownerSource`.
// `source`: a recorded typing series under that named input source (the design session's ruling, 2026-10-31: the
// owner's own source is ABC, so the input-method series runs under 2-Set Korean), selected and read back like the
// others, the owner's recorded source selected again after it (and, on a failure, by the runner's cleanup).
// `still`: a recorded press_key series with the cursor visible but still (./cells.mjs STILL_SAMPLE): after the glide
// click, a wait the still-plan task sizes from the planned settle, kept free of the rock, then the keys; under ABC, the
// owner's source back after it.
// `control`: the default arm's series again, recorded under its own item and never judged (a same-session control beside
// an arm or --still, since the off medians drift over a sitting), so it never replaces the judged item's last attempt.
export function timingSteps(kind, samples, {arm = null, ownerSource = false, source = null, still = false, control = false} = {}) {
  if (!SERIES[kind]) throw new Error('timing takes typing or clicks');
  if (arm !== null && !CURSOR_ARMS.includes(arm)) throw new Error(`the arm is one of ${CURSOR_ARMS.join(', ')}`);
  if ([arm !== null, ownerSource, source !== null, still, control].filter(Boolean).length > 1) throw new Error('an arm, the owner\'s source, a named source, the still series and the control are recorded one at a time');
  if ((source !== null || still) && kind !== 'typing') throw new Error('a named source and the still series are for the typing series');
  const counts = typeof samples === 'number' ? Object.fromEntries(SERIES[kind].map(name => [name, samples])) : samples;
  if (!Object.keys(counts).length || Object.entries(counts).some(([name, n]) => !SERIES[kind].includes(name) || !Number.isInteger(n) || n < 1))
    throw new Error(`the counts name ${kind} series with a whole number of samples each`);
  const longest = Math.max(...Object.values(counts));
  const at = i => SERIES[kind].filter(name => (counts[name] ?? 0) > i);
  const sample = (side, i) => {
    const covers = at(i);
    if (still) return [{run: side, cell: results => STILL_SAMPLE('textedit', A, B, results['still plan']?.waitMs ?? STILL_WAIT_MS), label: `still ${side} ${i}`, keys: 'textedit', sample: {side, i, covers: ['press_key x30']}}];
    if (kind === 'typing') {
      const cell = TYPING_SAMPLE('textedit', A, B, {typeText: covers.includes('type_text'), pressKey: covers.includes('press_key x30')});
      return [{run: side, cell, label: `typing ${side} ${i}`, keys: 'textedit', sample: {side, i, covers}}];
    }
    return [
      {run: side, cell: PRIME('textedit', i % 2 ? B : A), label: `prime ${side} ${i}`},
      ...(covers.includes('coordinate click') ? [{run: side, cell: CLICK_AT('textedit', i % 2 ? A : B), label: `coordinate click ${side} ${i}`, sample: {side, i, series: 'coordinate click'}}] : []),
      ...(covers.includes('element click') ? [{run: side, cell: CLICK_CONTROL_TIMED('fixtureButton'), label: `element click ${side} ${i}`, sample: {side, i, series: 'element click'}}] : []),
      ...(covers.includes('drag') ? [{run: side, cell: DRAG('textedit', [0.2, 0.5], [0.8, 0.6]), label: `drag ${side} ${i}`, sample: {side, i, series: 'drag'}},
        // Untimed: the drag's selection cleared at once by an element action, so no window of TextEdit's own rises over
        // the run window; a failure stops the series (the next prime is a coordinate click).
        {run: side, cell: CLEAR_SELECTION, label: `clear the drag's selection ${side} ${i}`, required: true}] : []),
    ];
  };
  const what = arm ? `, the cursor's ${arm} arm (recorded, not judged)` : ownerSource ? ', under the owner\'s own input source (recorded, not judged)'
    : source ? `, under the input source ${source} (recorded, not judged)` : still ? ', press_key with the cursor still after its glide (recorded, not judged)'
    : control ? ', the default arm as a same-session control (recorded, not judged)' : '';
  return [
    // The series this run asks for, recorded first: a run that fails before its first sample still supersedes them
    // (seriesRuns), so an earlier verdict on them never outlives a rerun that was asked for.
    {series: Object.keys(counts), counts},
    {say: `Acceptance ${kind === 'typing' ? 12 : 13}${what}: ${Object.entries(counts).map(([name, n]) => `${name} ${n}`).join(', ')} samples a side, interleaved; nobody uses the Mac until the last sample`},
    {task: 'activate', args: ['textedit'], required: true},
    // A window of TextEdit's own on top of its run window (the second sitting: a 53 × 48 pt one, likely the affordance a
    // drag's text selection raises) stands between the run window and the keys and refuses the selection. Each drag
    // clears its selection (CLEAR_SELECTION); one left from before is dismissed the same way, by an element action with
    // no coordinate input, through a cursor-off session opened only when there is one, and then required gone. The
    // cell refuses, sending nothing, when its observation is not of the run window.
    {task: 'overlay-check', args: ['textedit']},
    {open: 'tidy', scenes: ['textedit'], env: {CUA_CURSOR: '0'}, when: results => Boolean(results.overlays?.length)},
    {run: 'tidy', cell: CLEAR_SELECTION, label: 'the run document\'s selection cleared by an element action, dismissing what it raised', required: true, when: results => Boolean(results.overlays?.length)},
    {wait: 500, when: results => Boolean(results.overlays?.length)},
    {close: 'tidy', when: results => Boolean(results.overlays?.length)},
    {task: 'overlay-check', args: ['textedit', 'none'], required: true},
    // With the owner's yes (./input-source.mjs), the source is selected here, only once the scene's own launch and run
    // window are checked to be on top (the target guard's check), and read back; then the series' own check, as before.
    {task: 'select-source', args: source ? ['named', 'textedit', source] : [ownerSource ? 'owner' : 'latin', 'textedit'], required: true},
    {task: 'input-source', args: [ownerSource || source ? 'record' : 'latin'], required: true},
    ...(still ? [{task: 'still-plan', args: ['textedit', A, B, STILL_WAIT_MS], required: true}] : []),
    ...(arm === UNCAPPED_ARM ? [{task: 'glide-frames', args: [arm]}] : []),
    ...(arm ? [{task: 'engine-json-arm', args: [arm]}, {task: 'engine-stop'}] : []),
    ...sessions(kind === 'typing' ? ['textedit'] : ['textedit', 'electron']),
    ...(arm ? [{task: 'engine-status', args: ['on', arm], required: true}] : []),
    ...(kind === 'clicks' ? [{watch: 'on the fixture\'s button presses (route 3), the cursor may start up to 100 ms after the click', id: 'route-3-lag'}] : []),
    {wait: SAMPLE_GAP_MS},
    ...sampleOrder(longest).flatMap((pair, i) => pair.flatMap(side => [...sample(side, i), {wait: SAMPLE_GAP_MS}])),
    {close: 'off'}, {close: 'on'},
    ...(arm ? [{task: 'engine-json-restore'}, {task: 'engine-stop'}] : []),
    ...(source || still ? [{task: 'select-source', args: ['owner', 'textedit'], required: true}] : []),
  ];
}

// The timing rows of an item's recorded rows: {series, side, i, ms, route} per timed call; a failed cell is a row with
// no ms and its error. A typing sample covers the series its `covers` names (both, in a run before the counts).
export function timingRows(rows, kind) {
  const VALUE = {type_text: 'type_text', 'press_key x30': 'press_key'};
  return rows.filter(r => r.kind === 'cell' && r.sample).flatMap(r => {
    const {side, i} = r.sample;
    const covers = r.sample.series ? [r.sample.series] : r.sample.covers ?? SERIES.typing;
    if (!r.ok) return covers.map(series => ({series, side, i, ms: null, error: r.error}));
    if (kind === 'typing') return covers.map(series => ({series, side, i, ms: r.value[VALUE[series]]}));
    return [{series: r.sample.series, side, i, ms: r.value.ms, route: r.route}];
  });
}

// Each series' rows from the last run (the rows from a `start` on) that covers it: that asked for it (its `series` row),
// whatever it yielded, or, in a run recorded before runs declared their series, that has its samples.
// -> {series name: {rows, startedAt}}.
export function seriesRuns(rows, kind) {
  const starts = rows.map((r, k) => (r.kind === 'start' ? k : -1)).filter(k => k >= 0);
  const runs = (starts[0] === 0 ? starts : [0, ...starts]).map((from, n, all) => rows.slice(from, all[n + 1] ?? rows.length));
  const found = {};
  for (const run of runs) {
    const timed = timingRows(run, kind);
    const declared = run.find(r => r.kind === 'series')?.series ?? null;
    for (const name of SERIES[kind]) {
      const own = timed.filter(t => t.series === name);
      if (declared ? declared.includes(name) : own.length) found[name] = {rows: own, startedAt: run[0]?.at ?? null};
    }
  }
  return found;
}
