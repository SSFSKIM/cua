// Hold 3's route A/B (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M2b; `cell route-ab`): whether a
// background Electron button press takes effect because of route 3's held fake activation. The Electron fixture's
// button (./plan.mjs's click.button case) is pressed behind the user window ROUTE_AB_SAMPLES times on the run's own
// lane, alternating (VARIANTS):
//   forced1  AXPress alone: route 1 forced through the engine's spike-only `spikeRoute: "1"`, sent straight to the
//            service (`nodeRepl.rpc("sky", …)`, as the spike harness does) with the index the prepare observed on this
//            connection. A sample whose act reports another route is invalid: the argument did not reach the engine.
//   natural  the facade's click, routed as the engine chooses (route 3 then AXPress under the engine change).
// The first sample is forced, so it runs before any route-3 action on the fixture in the connection. Before every
// sample that follows a natural one, that sample's hold is released by one request aimed at another app (an
// observation of the user window's app) and the release is verified from the fixture's counters (releaseOf); a sample
// whose release cannot be shown is invalid and sends nothing. `--natural-only` (NATURAL_ONLY) runs six natural samples,
// each after the first released so, so every press begins with the fixture not believing it is active and runs the
// activation. Every row that acted records the activation's click as the engine reported it (`activation`: {click,
// posted, guardMs}), or null when the act's meta carries none (the service passes no `cua/activationClick` today).
//
// Per sample: the fixture's counters (./matrix-device.mjs electron-counters); the prepare (count and index); the
// oracle's reading with the focus probe on the user window; the act (its route and in-cell ms); the effect, polled by
// observation up to EFFECT_BOUND_MS after the act's end on the device clock (effectMs, or null); the oracle's reading
// and the counters again. The row's window runs from its release (or its first counters read) to its last read, so
// the activation watcher's events in it are the row's and the oracle judges it (./oracle.mjs).
import {cell} from '../native-baseline/cells.mjs';
import {caseCells, prelude} from './matrix-cells.mjs';
import {userWindowOf} from './oracle.mjs';
import {CASES, pressed} from './plan.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {activate, focusOf, js, mark, push, read, sameWindow} from './steps.mjs';

const j = JSON.stringify;
export const ROUTE_AB = Object.freeze({driven: 'electron', user: 'finder'});
export const VARIANTS = Object.freeze(['forced1', 'natural', 'forced1', 'natural', 'forced1', 'natural']);
export const NATURAL_ONLY = Object.freeze(VARIANTS.map(() => 'natural'));
export const ROUTE_AB_SAMPLES = VARIANTS.length;
export const variantsOf = routeAb => (routeAb.naturalOnly ? NATURAL_ONLY : VARIANTS);
export const ROUTE_AB_ID = 'electron/background/click.button';
export const EFFECT_BOUND_MS = 2000;
// The fixture writes its counters after the app's events, which arrive after the request that caused them returns: the
// release is read up to this many times, this far apart.
const RELEASE_READS = 4, RELEASE_GAP_MS = 250;

const BUTTON = CASES.electron.find(c => c.method === 'click' && c.case === 'button');
// The cells, each marked so a row's calls are told apart in the lane's record.
const act = (app, variant) => (variant === 'forced1'
  ? `/* cua-matrix:route-ab:act */ await nodeRepl.rpc("sky", {type: "execute", method: "click", args: [{app: ${j(app)}, element_index: __m.index, spikeRoute: "1"}]});`
  : `/* cua-matrix:route-ab:act */ ${BUTTON.act}`);
// The press judged from the last count read: once exactly, and passed only when first seen within the bound (an
// observation that began inside the bound and returned past it is recorded as late, not passed). Embedded in the cell.
export function effectVerdict(count, before, effectMs, bound) {
  const pressedOnce = count === before + 1, inBound = effectMs !== null && effectMs <= bound;
  return {ok: pressedOnce && inBound, pressedOnce, late: pressedOnce && !inBound};
}
// The effect: observed until the count reads before + 1 (or past it) or the bound from the act's end passes; at least one
// observation. -> {ok, outcome: {pressedOnce, effectMs, late, polls, firstMs, pressed}} (`pressed`: the count's change; `ok` only
// for an effect seen within the bound, `late` for one seen after it).
const effect = actEnd => `/* cua-matrix:route-ab:effect */
const __actEnd = ${Number(actEnd)};
let count = null, polls = 0, firstMs = null, effectMs = null;
do {
  const ax = await observe();
  const ms = Date.now() - __actEnd;
  polls += 1; firstMs ??= ms; count = ${pressed};
  if (count !== null && count >= __m.before + 1) { if (count === __m.before + 1) effectMs = ms; break; }
} while (Date.now() - __actEnd < ${EFFECT_BOUND_MS});
const __verdict = ${effectVerdict};
const v = __verdict(count, __m.before, effectMs, ${EFFECT_BOUND_MS});
return {ok: v.ok, outcome: {pressedOnce: v.pressedOnce, effectMs, late: v.late, polls, firstMs, pressed: count === null ? null : count - __m.before}};`;
export const routeAbCells = (app, variant, actEnd) => caseCells('electron', {...BUTTON, act: act(app, variant), check: effect(actEnd)});
// One observation of the user window's app: a request aimed at another app than the held one, which releases the hold.
export const releaseCell = user => cell(`/* cua-matrix:route-ab:release */
${prelude(user)}
await observe();
return {observed: true};`);

const become = c => c?.counts?.appDidBecomeActive, resign = c => c?.counts?.appDidResignActive;
// Whether the previous natural sample's hold is shown released: no more activations than resignations since the cell
// began (`start`), and, when that sample activated the app, a resignation since its end. A natural sample that activated
// nothing left nothing held, so the balance alone shows it. -> {released, held, resignAdvanced, balanced}.
export function releaseOf({start, natural, now}) {
  const read = [start, natural?.before, natural?.after, now].every(c => Number.isSafeInteger(become(c)) && Number.isSafeInteger(resign(c)));
  if (!read) return {released: false, held: null, resignAdvanced: null, balanced: null};
  const held = become(natural.after) > become(natural.before);
  const resignAdvanced = resign(now) > resign(natural.after);
  const balanced = become(now) - become(start) <= resign(now) - resign(start);
  return {released: balanced && (!held || resignAdvanced), held, resignAdvanced, balanced};
}

// What route 3's activation click did, from the act's engine meta (./lane.mjs engineMetaOf): "posted", or why it was
// skipped (noPoint, outsideFrame, spared, control, hitTestFailed), with the activation's guard time. -> that, or null.
const activationOf = meta => (typeof meta?.activationClick === 'string'
  ? {click: meta.activationClick, posted: meta.activationClick === 'posted', guardMs: meta.activationGuardMs ?? null} : null);

// The fixture's counters on the device, its window the harness's (it activates nothing). -> {answer: counters | null, at}.
function counters(ctx) {
  const {answer = null, at = null} = ctx.ops.matrix(['electron-counters', '--run', ctx.run]) ?? {};
  mark(ctx, 'harness', 'electron-counters', at, []);
  return {answer, at};
}

// The cell's section: the user window in front, then the samples. Every sample's row is pushed, invalid with its reason
// when its precondition did not hold.
export async function routeAbSection(ctx, routeAb) {
  const {driven, user} = routeAb, variants = variantsOf(routeAb);
  const base = {section: 'route-ab', id: ROUTE_AB_ID, engine: ctx.engine, ok: false, scene: driven, target: driven, user, regime: 'background', method: 'click', case: 'button'};
  const sampleOf = i => (ctx.n - 1) * ROUTE_AB_SAMPLES + i + 1;
  const front = activate(ctx, user);
  const r0 = front?.ok ? read(ctx) : null;
  const userWindow = r0 ? userWindowOf(r0.reading, ctx.records[user].pid) : null;
  if (!userWindow) {
    variants.forEach((variant, i) => push(ctx, {...base, variant, sample: sampleOf(i), invalid: `the user window (${user}) did not come to the front`}));
    return;
  }
  const start = counters(ctx).answer;
  ctx.meta.routeAb = {variants, countersAtStart: start};
  let natural = null;
  for (const [i, variant] of variants.entries()) {
    await ctx.checkpoint();
    const row = await sample(ctx, {base: {...base, variant, sample: sampleOf(i)}, variant, user, userWindow, start, natural: i > 0 && variants[i - 1] === 'natural' ? natural : null,
      app: ctx.records[driven].app});
    // A natural sample that sent nothing held nothing: its counters before stand for after.
    if (variant === 'natural') natural = {before: row.countersBefore ?? null, after: row.countersAfter ?? (row.actAt === undefined ? row.countersBefore ?? null : null)};
  }
}

async function sample(ctx, {base, variant, user, userWindow, start, natural, app}) {
  const key = `row:${ctx.rows.length}`;
  const row = {...base};
  let from = null, to = null;
  const span = r => { from ??= r?.at?.[0] ?? null; to = r?.at?.[1] ?? to; return r; };
  const done = extra => { if (from !== null) mark(ctx, 'row', key, [from, to]); return push(ctx, {...row, ...extra}); };
  // The device steps' own windows are the harness's; the row's span covers them too, so an activation in them that the
  // harness does not intend is the row's. The release intends at most the user window's app coming back to the front.
  if (natural) {
    const released = span(await js(ctx, 'harness', `route-ab:release:${row.sample}`, releaseCell(user), {apps: [SCENES[user].bundleId]}));
    if (!released.ok) return done({released: false, invalid: `the release request failed: ${released.error}`});
    let release = null;
    for (let n = 0; n < RELEASE_READS; n++) {
      if (n) await ctx.sleep(RELEASE_GAP_MS);
      release = releaseOf({start, natural, now: span(counters(ctx)).answer});
      if (release.released) break;
    }
    row.released = release.released;
    row.release = release;
    if (!release.released) return done({invalid: `the previous natural sample's hold was not shown released (${release.held === null ? 'the counters were not read' : `held ${release.held}, resigned since ${release.resignAdvanced}, balanced ${release.balanced}`}); nothing was sent`});
  }
  row.countersBefore = span(counters(ctx)).answer;
  const cells = routeAbCells(app, variant, 0);
  const prepared = span(await ctx.lane.js(cells.prepare));
  if (!prepared.ok) return done({invalid: 'the prepare cell failed', error: prepared.error});
  if (!prepared.value?.ready) return done({invalid: `not prepared: ${prepared.value?.reason ?? 'no reason'}`});
  // The user window in front with the focus probe on it, once re-activated when it is not.
  let before = span(read(ctx, focusOf(userWindow)));
  if (!sameWindow(userWindowOf(before.reading, userWindow.pid), userWindow)) {
    activate(ctx, user);
    before = span(read(ctx, focusOf(userWindow)));
    if (!sameWindow(userWindowOf(before.reading, userWindow.pid), userWindow)) return done({focus: before.focus ?? null, invalid: 'the user window was not in front before the action'});
  }
  row.focus = before.focus ?? null;
  if (before.watcher !== true) return done({invalid: 'the activation watcher was not running before the action'});
  const acted = span(await ctx.lane.js(cells.act));
  if (!acted.ok) return done({invalid: 'the act cell failed', error: acted.error});
  Object.assign(row, {inputRoute: acted.route, inCellMs: acted.value.actMs, wallMs: acted.wallMs, actAt: acted.value.at ?? acted.at, activation: activationOf(acted.engine)});
  const effected = span(await ctx.lane.js(routeAbCells(app, variant, (acted.value.at ?? acted.at)[1]).check));
  const after = span(read(ctx, focusOf(userWindow)));
  row.focusAfter = after.focus ?? null;
  row.countersAfter = span(counters(ctx)).answer;
  if (!effected.ok) return done({invalid: 'the effect cell failed', error: effected.error});
  if (effected.value?.invalid) return done({invalid: effected.value.invalid});
  if (after.watcher !== true) return done({invalid: 'the activation watcher was not running after the action'});
  const outcome = effected.value?.outcome ?? {};
  Object.assign(row, {effectMs: outcome.effectMs ?? null, pressedOnce: outcome.pressedOnce === true, outcome});
  if (variant === 'forced1' && String(acted.route) !== '1') {
    return done({invalid: `the engine reported route ${acted.route ?? 'none'}, not the forced route 1${acted.value.threw ? ' (the act threw: outcome.threw)' : ': spikeRoute did not reach it'}`});
  }
  // The check's own verdict: pressed once and first seen within the bound (a late effect is recorded, never passed).
  const pushed = done({ok: effected.value?.ok === true && outcome.pressedOnce === true && outcome.late !== true && !acted.value.threw});
  ctx.judged.set(key, {row: pushed, oracle: {before: before.reading, after: after.reading, focus: after.focus ?? null, inputRoute: acted.route, scene: base.scene, userPid: userWindow.pid}});
  return pushed;
}
