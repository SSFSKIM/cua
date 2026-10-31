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
// Before either, with TextEdit in front (its document's input source is the one the keys meet), the approved engine's
// probe reads the input source: a judged series runs only under a Latin keyboard layout and is refused otherwise, since
// under an input method the press_key timings measure the method's composition (#235's Decision Log, 2026-10-31). Two
// kinds of series are recorded under their own item and never judged: one under the owner's own source (the source
// read and kept, not required), and an arm, run with engine.json's `cursorDebug` set to one of the engine's diagnostic
// arms (the engine relaunched with it, the running arm checked, engine.json put back and the engine stopped after).
import {CLICK_AT, CLICK_CONTROL_TIMED, DRAG, PRIME, TYPING_SAMPLE} from './cells.mjs';
import {sampleOrder} from './stats.mjs';

export const SAMPLE_GAP_MS = 6000;
const A = [0.1, 0.35], B = [0.9, 0.85];

// The engine's cursor arms, engine.json `cursorDebug` (native/engine/Sources/Engine/Config.swift, CursorDebug).
export const CURSOR_ARMS = Object.freeze(['panelOut', 'noBackdrop', 'noRock', 'legacyLayers']);

// Why the input source `reading` (the probe's `input-source current`) is not a Latin keyboard layout, or null when it
// is: a plain keyboard layout (no input method), ASCII-capable, and the layout key events are translated with now.
export function latinSourceProblem(reading) {
  if (!reading?.id || !reading.layout) return 'the input source could not be read';
  const named = `${reading.name || reading.id} (${reading.id})`;
  if (reading.keyboardLayout !== true || reading.asciiCapable !== true) return `the input source ${named} is not a Latin keyboard layout`;
  if (reading.layout !== reading.id) return `the input source ${named} is selected, but keys are translated with ${reading.layout}`;
  return null;
}

// The item a series records under: the judged item (12 or 13), or that item with the arm's name or `owner-source`.
export function timingItem(kind, {arm = null, ownerSource = false} = {}) {
  const item = kind === 'typing' ? '12' : '13';
  return arm ? `${item}-${arm}` : ownerSource ? `${item}-owner-source` : item;
}

export const SERIES = Object.freeze({
  typing: ['type_text', 'press_key x30'],
  clicks: ['coordinate click', 'element click', 'drag'],
});

const sessions = scenes => [
  {open: 'on', scenes},
  {open: 'off', scenes, env: {CUA_CURSOR: '0'}},
  {task: 'activate', args: ['textedit']},
];

// The steps of `kind` with `samples` a side (./runner.mjs runs them); `arm`, one of CURSOR_ARMS, or `ownerSource`.
export function timingSteps(kind, samples, {arm = null, ownerSource = false} = {}) {
  if (!SERIES[kind]) throw new Error('timing takes typing or clicks');
  if (arm !== null && !CURSOR_ARMS.includes(arm)) throw new Error(`the arm is one of ${CURSOR_ARMS.join(', ')}`);
  if (arm !== null && ownerSource) throw new Error('an arm and the owner\'s source are recorded one at a time');
  const sample = (side, i) => (kind === 'typing'
    ? [{run: side, cell: TYPING_SAMPLE('textedit', A, B), label: `typing ${side} ${i}`, keys: 'textedit', sample: {side, i}}]
    : [
      {run: side, cell: PRIME('textedit', i % 2 ? B : A), label: `prime ${side} ${i}`},
      {run: side, cell: CLICK_AT('textedit', i % 2 ? A : B), label: `coordinate click ${side} ${i}`, sample: {side, i, series: 'coordinate click'}},
      {run: side, cell: CLICK_CONTROL_TIMED('fixtureButton'), label: `element click ${side} ${i}`, sample: {side, i, series: 'element click'}},
      {run: side, cell: DRAG('textedit', [0.2, 0.5], [0.8, 0.6]), label: `drag ${side} ${i}`, sample: {side, i, series: 'drag'}},
    ]);
  const what = arm ? `, the cursor's ${arm} arm (recorded, not judged)` : ownerSource ? ', under the owner\'s own input source (recorded, not judged)' : '';
  return [
    {say: `Acceptance ${kind === 'typing' ? 12 : 13}${what}: ${samples} samples a side, interleaved; nobody uses the Mac until the last sample`},
    {task: 'activate', args: ['textedit']},
    {task: 'input-source', args: [ownerSource ? 'record' : 'latin'], required: true},
    ...(arm ? [{task: 'engine-json-arm', args: [arm]}, {task: 'engine-stop'}] : []),
    ...sessions(kind === 'typing' ? ['textedit'] : ['textedit', 'electron']),
    ...(arm ? [{task: 'engine-status', args: ['on', arm], required: true}] : []),
    ...(kind === 'clicks' ? [{watch: 'on the fixture\'s button presses (route 3), the cursor may start up to 100 ms after the click', id: 'route-3-lag'}] : []),
    {wait: SAMPLE_GAP_MS},
    ...sampleOrder(samples).flatMap((pair, i) => pair.flatMap(side => [...sample(side, i), {wait: SAMPLE_GAP_MS}])),
    {close: 'off'}, {close: 'on'},
    ...(arm ? [{task: 'engine-json-restore'}, {task: 'engine-stop'}] : []),
  ];
}

// The timing rows of an item's recorded rows: {series, side, i, ms, route} per timed call; a failed cell is a row with
// no ms and its error.
export function timingRows(rows, kind) {
  return rows.filter(r => r.kind === 'cell' && r.sample).flatMap(r => {
    const {side, i} = r.sample;
    if (!r.ok) return (r.sample.series ? [r.sample.series] : SERIES.typing).map(series => ({series, side, i, ms: null, error: r.error}));
    if (kind === 'typing') return [{series: 'type_text', side, i, ms: r.value.type_text}, {series: 'press_key x30', side, i, ms: r.value.press_key}];
    return [{series: r.sample.series, side, i, ms: r.value.ms, route: r.route}];
  });
}
