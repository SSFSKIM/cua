// Acceptance 12 and 13's samples (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md): two sessions on the
// approved engine, `on` (the cursor on, the default) and `off` (CUA_CURSOR=0), taking their samples interleaved in one
// sitting (./stats.mjs sampleOrder: the side that leads alternates), each sample 6 s after the one before, so the
// cursor-on session's cursor has faded before the cursor-off session acts and nothing of either is animating when the
// next sample starts. Every time is the cell's own, performance.now() around the awaited call, so MCP and the REPL's
// dispatch are not in it.
//   typing  in the run's TextEdit document, TextEdit frontmost (the key guard): a click at one corner of the text, so
//           the cursor-on session's cursor starts a long glide, then a type_text of 200 characters; a click at the
//           other corner, then 30 single press_key calls ("x"), their total one sample.
//   clicks  TextEdit frontmost and the Electron fixture behind it: a coordinate click in TextEdit (corners alternating),
//           an element click on the fixture's button (the engine's route 3 for a background fixture; each sample's
//           route is recorded), and a drag across TextEdit's text.
import {CLICK_AT, CLICK_CONTROL_TIMED, DRAG, TYPING_SAMPLE} from './cells.mjs';
import {sampleOrder} from './stats.mjs';

export const SAMPLE_GAP_MS = 6000;
const A = [0.1, 0.35], B = [0.9, 0.85];

export const SERIES = Object.freeze({
  typing: ['type_text', 'press_key x30'],
  clicks: ['coordinate click', 'element click', 'drag'],
});

const sessions = scenes => [
  {open: 'on', scenes},
  {open: 'off', scenes, env: {CUA_CURSOR: '0'}},
  {task: 'activate', args: ['textedit']},
];

// The steps of `kind` with `samples` a side (./runner.mjs runs them).
export function timingSteps(kind, samples) {
  if (!SERIES[kind]) throw new Error('timing takes typing or clicks');
  const sample = (side, i) => (kind === 'typing'
    ? [{run: side, cell: TYPING_SAMPLE('textedit', A, B), label: `typing ${side} ${i}`, keys: 'textedit', sample: {side, i}}]
    : [
      {run: side, cell: CLICK_AT('textedit', i % 2 ? A : B), label: `coordinate click ${side} ${i}`, sample: {side, i, series: 'coordinate click'}},
      {run: side, cell: CLICK_CONTROL_TIMED('fixtureButton'), label: `element click ${side} ${i}`, sample: {side, i, series: 'element click'}},
      {run: side, cell: DRAG('textedit', [0.2, 0.5], [0.8, 0.6]), label: `drag ${side} ${i}`, sample: {side, i, series: 'drag'}},
    ]);
  return [
    {say: `Acceptance ${kind === 'typing' ? 12 : 13}: ${samples} samples a side, interleaved; nobody uses the Mac until the last sample`},
    ...sessions(kind === 'typing' ? ['textedit'] : ['textedit', 'electron']),
    ...(kind === 'clicks' ? [{watch: 'on the fixture\'s button presses (route 3), the cursor may start up to 100 ms after the click', id: 'route-3-lag'}] : []),
    {wait: SAMPLE_GAP_MS},
    ...sampleOrder(samples).flatMap((pair, i) => pair.flatMap(side => [...sample(side, i), {wait: SAMPLE_GAP_MS}])),
    {close: 'off'}, {close: 'on'},
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
