// #188, `cell electron-focus`: why a background Electron field click fails the matrix's focus PREPARE. Five cua
// samples: four selected-field variants, one empty-field natural control; vendor is a selected natural reference. No keys, paste, native changes or inferred plan tags.
// Every arm ends with route-ab's other-app request and counters-proven release; a failed release blocks ALL later
// arms. Counters and pre-click focus are retained, including focus acquired by the held3 primer itself. These are
// successive samples of one fixture, not independent fresh-document trials; DOM focus may persist across release.
import {cell} from '../native-baseline/cells.mjs';
import {prelude} from './matrix-cells.mjs';
import {releaseCell, releaseOf} from './route-ab.mjs';
import {activate, focusOf, js, mark, push, read, sameWindow, Stop} from './steps.mjs';
import {userWindowOf} from './oracle.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';

const j = JSON.stringify;
export const FOCUS_VARIANTS = Object.freeze(['forced1', 'forced3', 'held3', 'natural', 'natural-empty']);
const SECTION_MS = 240_000, CELL_MS = 15_000;
const reading = `const fieldIndex = indexOfTarget(ax, "Fixture text"), focusedIndex = focusedIndexOf(ax);
return {fieldIndex, focusedIndex, focusedIsField: fieldIndex !== null && focusedIndex === fieldIndex,
  selectedTextPresent: selectedTextOf(ax) !== null, selectedCount: selectedIndexesOf(ax).length};`;
const input = body => cell(`${prelude('electron')}
const __ef = globalThis.__ef;
if (!__ef?.ready) throw new Error("the field was not found; nothing was sent");
const from = Date.now(), t = performance.now();
let error = null;
try {${body}} catch (e) {error = String(e?.message ?? e).slice(0, 300);}
return {at: [from, Date.now()], actMs: performance.now() - t, threw: error !== null, error};`);
export function focusCells(app, variant) {
  if (!FOCUS_VARIANTS.includes(variant)) throw new Error(`unknown focus variant ${variant}`);
  return {
    seed: cell(`/* cua-matrix:electron-focus:seed */ ${prelude('electron')}
let ax = await observe();
if (!inFront(ax)) return {ready: false};
let index = indexOfTarget(ax, "Fixture text");
if (index === null) return {ready: false};
await __app.setValue(index, ${j(variant === 'natural-empty' ? '' : 'alpha bravo charlie delta')});
ax = await observe(); index = indexOfTarget(ax, "Fixture text");
if (index === null) return {ready: false};
${variant === 'natural-empty' ? '' : 'await __app.selectText(index, "charlie"); ax = await observe();'}
const selected = selectedTextOf(ax);
return {ready: ${variant === 'natural-empty' ? 'selected === null && (valueOfIndex(ax, index) ?? "") === ""' : 'selected === "charlie"'}, selectedTextPresent: selected !== null};`),
    prepare: cell(`/* cua-matrix:electron-focus:prepare */ ${prelude('electron')}
const ax = await observe();
const index = indexOfTarget(ax, "Fixture text"), button = indexOfTarget(ax, "Fixture button");
globalThis.__ef = {index, button, ready: inFront(ax) && index !== null && button !== null};
const facts = (() => {${reading}})();
return {ready: globalThis.__ef.ready, ...facts};`),
    prime: input('/* cua-matrix:electron-focus:prime */ await __app.click(__ef.button);'),
    act: input(`/* cua-matrix:electron-focus:act */ ${variant.startsWith('natural') ? 'await __app.click(__ef.index);'
      : `await nodeRepl.rpc("sky", {type: "execute", method: "click", args: [{app: ${j(app)}, element_index: __ef.index, spikeRoute: ${j(variant === 'forced1' ? '1' : '3')}}]});`}`),
    observe: cell(`/* cua-matrix:electron-focus:observe */ ${prelude('electron')}
const ax = await observe();
${reading}`),
  };
}

// The engine reports a route, not an elementClickPlan tag. Forced 1 proves the action branch, forced 3 proves synthesis
// only when its route is acknowledged. Natural route 3 can be EITHER branch; never claim it names the plan.
function planReading(variant, route) {
  return {reported: null, requested: variant === 'forced1' ? 'action' : variant.startsWith('natural') ? 'natural' : 'synthesized',
    consistentWith: String(route) === '1' ? 'AX action' : String(route) === '3'
      ? variant.startsWith('natural') ? 'held AX action OR synthesized click' : variant === 'forced1' ? 'forced route not acknowledged' : 'synthesized click'
      : null};
}
// A synthesized click can activate AND resign before its RPC returns. Unlike route-ab's held button, that arm owes
// no further resignation. Keep route-ab's balance test, and require a new resignation only for an outstanding lease.
export function focusReleaseOf({start, before, after, now}) {
  const values = [before, after].flatMap(c => [c?.counts?.appDidBecomeActive, c?.counts?.appDidResignActive]);
  if (!values.every(Number.isSafeInteger)) return {released: false, held: null, balanced: null, resignAdvanced: null};
  const [b0, r0, b1, r1] = values;
  const outstanding = b1 - b0 > r1 - r0;
  return {...releaseOf({start, natural: {before: outstanding ? before : after, after}, now}), outstandingAtRelease: outstanding};
}
const actReading = r => ({inputRoute: r.route, inCellMs: r.value?.actMs ?? null, at: r.value?.at ?? r.at,
  threw: r.value?.threw === true, error: r.value?.error ?? r.error ?? null, engineMeta: r.engine ?? null});

export async function electronFocusSection(ctx) {
  const variants = ctx.engine === 'cua' ? FOCUS_VARIANTS : ['natural'];
  const firstRow = ctx.rows.length;
  const startTime = ctx.now();
  const check = async () => {await ctx.checkpoint(); if (ctx.now() - startTime >= SECTION_MS) throw new Stop('the Electron focus diagnostic exhausted its four-minute section budget');};
  ctx.meta.electronFocus = {variants, sectionBudgetMs: SECTION_MS, planTagAvailable: false,
    axFocusedSource: ctx.engine === 'cua' ? 'Skyshot node flag (missing AXFocused becomes false)' : 'unavailable on the fixed vendor probe',
    independentTrials: false, seededSelection: true, freshFieldControl: 'natural-empty'};
  const front = activate(ctx, 'finder');
  const first = front?.ok ? read(ctx) : null;
  const userWindow = first ? userWindowOf(first.reading, ctx.records.finder.pid) : null;
  let blocked = userWindow ? null : 'the Finder user window did not come to the front';
  let start = null;
  for (const [i, variant] of variants.entries()) {
    await check();
    const key = `row:${ctx.rows.length}`;
    const row = {section: 'route-ab', id: `electron/background/focus.${variant}@finder`, engine: ctx.engine, sample: ctx.n,
      scene: 'electron', user: 'finder', regime: 'background', method: 'click', case: 'field-focus', variant, ok: false};
    if (blocked) {push(ctx, {...row, invalid: blocked}); continue;}
    const status = ctx.ops.matrix(['electron-focus', '--engine', ctx.engine, '--approved-engine', ctx.approvedEngine, '--status-only', 'true', '--run', ctx.run]);
    mark(ctx, 'harness', `electron-focus:connections:${i}`, status?.at, []);
    row.connectionCheck = status?.answer ?? null;
    if (ctx.engine === 'cua' && row.connectionCheck?.connections !== 1) {
      push(ctx, {...row, invalid: 'the engine did not have exactly one driving connection before the arm'});
      blocked = 'an extra or missing driving connection invalidated the remaining arms';
      continue;
    }
    const cells = focusCells(ctx.records.electron.app, variant);
    // Establish the matrix's selection confound in the foreground, then put Finder back before ANY measured read.
    // The last natural arm instead starts from an empty field with no selection. These setup activations are the
    // harness's, outside the measured row; they never excuse an activation during the background click.
    const seedFront = activate(ctx, 'electron');
    const seeded = seedFront?.ok ? await js(ctx, 'harness', `electron-focus:seed:${i}`, cells.seed,
      {timeoutMs: CELL_MS, apps: [SCENES.electron.bundleId]}) : null;
    const restored = activate(ctx, 'finder');
    row.seed = seeded?.value ?? null;
    if (!seeded?.ok || seeded.value?.ready !== true || !restored?.ok) {
      push(ctx, {...row, invalid: 'the fixture selection state or restored Finder window was not established'});
      blocked = 'the preceding seed failed';
      continue;
    }
    let from = null, to = null;
    const span = r => {from ??= r?.at?.[0] ?? null; to = r?.at?.[1] ?? to; return r;};
    const device = async args => {await check(); const r = span(ctx.ops.matrix([...args, '--run', ctx.run])); mark(ctx, 'harness', `electron-focus:${args[0]}:${i}`, r?.at, []); return r?.answer ?? null;};
    const counters = () => device(['electron-counters']);
    const axRead = async stage => {
      const sidecar = {stage, countersBefore: await counters(), reading: null, countersAfter: null};
      (row.sidecars ??= []).push(sidecar);
      try {sidecar.reading = await device(['electron-focus', '--engine', ctx.engine, '--approved-engine', ctx.approvedEngine]);}
      catch (error) {sidecar.error = String(error.message).slice(0, 300); throw error;}
      finally {
        sidecar.countersAfter = await counters();
        sidecar.countersMoved = !sidecar.countersBefore?.counts || !sidecar.countersAfter?.counts
          || JSON.stringify(sidecar.countersBefore.counts) !== JSON.stringify(sidecar.countersAfter.counts);
      }
      if (sidecar.countersMoved) throw new Error('fixture counters changed around the focus sidecar observation');
      return sidecar.reading;
    };
    const lane = async code => {await check(); return span(await ctx.lane.js(code, CELL_MS));};
    // No reactivation here: unexpected front/focus is evidence, not permission to repair it inside the sample.
    const before = span(read(ctx, focusOf(userWindow)));
    row.focus = before.focus ?? null;
    if (before.watcher !== true || !sameWindow(userWindowOf(before.reading, userWindow.pid), userWindow) || before.focus?.named !== true) {
      push(ctx, {...row, invalid: 'the user window, its focus or the activation watcher was not established before the sample'});
      blocked = 'the preceding sample lost the user-window precondition';
      continue;
    }
    row.countersBefore = await counters();
    start ??= row.countersBefore;
    try {
      const prepared = await lane(cells.prepare);
      if (!prepared.ok || !prepared.value?.ready) throw new Error(prepared.error ?? 'the fixture field or button was not found');
      row.before = prepared.value;
      row.axBefore = await axRead('before');
      if (variant === 'held3') {
        row.primer = actReading(await lane(cells.prime));
        row.countersAfterPrime = await counters();
        const primed = await lane(cells.observe);
        row.afterPrime = primed.value ?? null;
        row.axAfterPrime = await axRead('after-primer');
        if (!primed.ok || row.primer.threw || String(row.primer.inputRoute) !== '3'
          || !(row.countersAfterPrime?.counts?.appDidBecomeActive > row.countersBefore?.counts?.appDidBecomeActive)
          || row.countersAfterPrime?.counts?.appDidResignActive !== row.countersBefore?.counts?.appDidResignActive) {
          throw new Error('the button primer did not establish a counters-proven route-3 hold');
        }
        // The observation may renumber the field: only this connection's most recent index may be clicked.
        const refreshed = await lane(cells.prepare);
        if (!refreshed.ok || !refreshed.value?.ready) throw new Error('the field was not found after the primer');
        row.beforeClick = refreshed.value;
      }
      const act = await lane(cells.act);
      Object.assign(row, actReading(act), {clickPlan: planReading(variant, act.route), actAt: act.value?.at ?? act.at});
      // Read the facade first, BEFORE the raw observer (which is itself an extra engine observation).
      const observed = await lane(cells.observe);
      row.after = observed.value ?? null;
      row.countersAfter = await counters();
      row.axAfter = await axRead('after');
      await ctx.sleep(500);
      const later = await lane(cells.observe);
      row.later = later.value ?? null;
      row.countersLater = await counters();
      if (!act.ok || !observed.ok || !later.ok || row.after?.fieldIndex == null || row.later?.fieldIndex == null) throw new Error('an action or focus observation cell failed');
      if (!row.axBefore?.fieldFound || !row.axAfter?.fieldFound) throw new Error('the independent field focus reading was missing');
      const forced = variant.startsWith('natural') ? null : variant === 'forced1' ? '1' : '3';
      const noAction = variant === 'forced1' && row.threw && Array.isArray(row.axBefore.actions)
        && !row.axBefore.actions.some(a => a === 'AXPick' || a === 'AXPress')
        && /spikeRoute 1 cannot carry this click: the element advertises neither AXPick nor AXPress/.test(row.error ?? '');
      if (noAction) row.declared = {kind: 'diagnostic', cause: 'the field advertises no AXPick/AXPress; forced route 1 is unavailable'};
      else if (forced && String(act.route) !== forced) throw new Error(`the engine reported ${act.route ?? 'no route'}, not forced route ${forced}`);
      // A focus failure is a measured result, never a failed PREPARE. First and later focus remain separate.
      row.ok = row.after.focusedIsField === true && !row.threw;
    } catch (error) {row.invalid = String(error.message).slice(0, 300);}
    // Even an unsuccessful arm may have acquired a hold. Read counters anew; never reuse a pre-action reading to
    // excuse an uncertain release. The same rule as route-ab, for EVERY variant, and failure blocks the entire suffix.
    row.countersBeforeRelease = await counters();
    const after = span(read(ctx, focusOf(userWindow)));
    row.focusAfter = after.focus ?? null;
    if (after.watcher !== true) row.invalid ??= 'the activation watcher was not running after the sample';
    const released = span(await js(ctx, 'harness', `electron-focus:release:${i}`, releaseCell('finder'), {timeoutMs: CELL_MS, apps: [SCENES.finder.bundleId]}));
    let release = {released: false};
    if (released.ok) for (let n = 0; n < 4; n++) {
      if (n) await ctx.sleep(250);
      row.countersAfterRelease = await counters();
      release = focusReleaseOf({start, before: row.countersBefore, after: row.countersBeforeRelease, now: row.countersAfterRelease});
      if (release.released) break;
    }
    row.release = release;
    if (!release.released) {row.invalid ??= 'the activation release was not proven by the counters'; blocked = 'the preceding activation release was not proven; no further click was sent';}
    if (from !== null) mark(ctx, 'row', key, [from, to]);
    const pushed = push(ctx, row);
    ctx.judged.set(key, {row: pushed, oracle: {before: before.reading, after: after.reading, focus: after.focus ?? null,
      inputRoute: row.inputRoute ?? null, scene: 'electron', userPid: userWindow.pid}});
  }
  // Every arm is mandatory evidence, including blocked rows. Keep them all before stopping for the run's recovery.
  const invalid = ctx.rows.slice(firstRow).filter(row => row.invalid);
  if (invalid.length) throw new Stop(`the Electron focus diagnostic lacks valid required evidence for: ${invalid.map(row => row.variant).join(', ')}`);
}
