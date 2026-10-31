// The differential run: the same well-formed requests to every engine, in blocks. A block is one engine with its
// process started fresh for the block, so nothing an engine retained outlives it: the cold sample (the first
// request after the spawn) and then the warm series. Block order rotates across the sitting. Tree reads of a scene
// window serve every engine; screenshots and input go to each engine's own equivalent window, so one engine's
// retained window is never the window another is measured on. Every window-targeted request runs inside a witness
// span; input effects are read back; accessibility-bus calls are counted, and each input operation's X requests
// audited, in separate untimed passes. The operations are ops.mjs's; `--via vendor-js` drives every engine through
// OpenAI's own JavaScript client (vendor-js.mjs) instead of over the wire. M2's text and clipboard commands (text.mjs)
// run in the blocks over the wire, their accessibility-bus calls in a pass of their own; its paste safety cases
// (safety.mjs) run after the blocks, cua alone.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditForeground, auditNothingSent, auditRequests, parseXtrace, startProxy } from './audit.mjs';
import { startMonitor } from './busmon.mjs';
import { stacking, toplevel, waitQuarantineOver, within } from './clip.mjs';
import { desktopEntry } from './desktop-entry.mjs';
import { DEVICE_REFUSAL, declaredDeviation, declaredParity, declaredRefusal, describe } from './deviations.mjs';
import { judgeDevice } from './device.mjs';
import { Engine } from './engine.mjs';
import { medianDifferenceInterval, normalizeAnswer } from './events.mjs';
import { compareShots, xprobeDiff } from './images.mjs';
import { compareStates, normalizeState, retainedIds } from './normalize.mjs';
import { OPS, SCENE_OPS, inputOp, ownWindow, shotOf, targeted } from './ops.mjs';
import { Oracle } from './oracle.mjs';
import { writeSummary } from './report.mjs';
import { routeWitness, runCases } from './safety.mjs';
import { Desktop, XPROBE, a11yBusAddress } from './scenes.mjs';
import { MIN_NOISE_SAMPLES, auditVerdict, blockOrder, judgeCalls, judgeOperation, runOutcome, verdictLine } from './stats.mjs';
import { resolveField } from './text.mjs';
import { VendorJsEngine } from './vendor-js.mjs';
import { judgeForegroundSpan, judgeInFrontSpan, startWitness } from './witness.mjs';

export { SCENE_OPS };

const here = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VENDORS = ['pinned', 'newest'];
/** The text calls no cua request may make (Constraints: never called; Acceptance 6: "the accessibility-bus trace of the whole run"). */
export const FORBIDDEN_TEXT_CALLS = ['PasteText', 'InsertText', 'SetTextContents'];
const isCase = (op) => OPS[op].kind === 'case';
const isText = (op) => OPS[op].kind === 'text';
const isDevice = (op) => Boolean(OPS[op].device);
/**
 * The route cua's request of an operation must take on a scene (a text operation's, text.mjs; a device case's,
 * device.mjs), or null where none is expected: its witness is judged against it and the route the engine reports.
 */
export const routeOf = (op, scene) => OPS[op].route?.(scene) ?? null;

/**
 * The plan: each scene's operations that `ops` names. An operation no scene has, an operation none of the scenes
 * asked for runs, a scene none of whose operations is named, and a plan with nothing in it are refused, so a
 * mistyped or unsupported operation never runs as a pass. A plan of desktop operations alone (`--ops list_windows`)
 * needs no scene and ignores the scenes it is given.
 */
export function planOps(scenes, ops) {
  const known = new Set(Object.values(SCENE_OPS).flat());
  if (ops !== 'all') for (const op of ops) if (!known.has(op)) throw new Error(`unknown operation ${op}; known: ${[...known].join(', ')}`);
  const plan = [];
  const wanted = (op) => ops === 'all' || ops.includes(op);
  const desktopOnly = ops !== 'all' && ops.length > 0 && ops.every((op) => SCENE_OPS.desktop.includes(op));
  for (const op of SCENE_OPS.desktop) if (wanted(op)) plan.push({ scene: 'desktop', op });
  for (const scene of scenes) {
    if (!SCENE_OPS[scene]) throw new Error(`unknown scene ${scene}`);
    if (desktopOnly) continue;
    if (scene === 'desktop' && ops === 'all') continue;
    const mine = SCENE_OPS[scene].filter(wanted);
    if (scene === 'desktop') {
      if (mine.length === 0) throw new Error(`scene desktop has none of the operations asked for (it has ${SCENE_OPS.desktop.join(', ')})`);
      continue;
    }
    if (mine.length === 0) throw new Error(`scene ${scene} has none of the operations asked for (it has ${SCENE_OPS[scene].join(', ')})`);
    for (const op of mine) plan.push({ scene, op });
  }
  if (plan.length === 0) throw new Error('nothing to run: no scene and no desktop operation');
  if (ops !== 'all') {
    for (const op of ops) if (!plan.some((p) => p.op === op)) throw new Error(`operation ${op} is not run by any scene asked for`);
  }
  return plan;
}

const sha = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

function fileSha(path) {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    return null;
  }
}

function gitHead() {
  try {
    return execFileSync('git', ['-C', here, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function engineVersion(bin) {
  try {
    return execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

/** Where each scene's windows come from: a harness page in Chrome, gedit on a scratch file, or a family's application. */
const PAGE_OF = { chrome: 'scene.html', 'over-budget': 'over-budget.html', 'big-text': 'big-text.html', 'chrome-input': 'input.html', retention: 'scene.html' };
const FAMILY_OF = { 'gtk-table': 'gtk-table', calc: 'calc' };
const GEDIT_TEXT = 'cua171 differential scene\nline two of the scratch file\n';
/**
 * Scenes whose application makes new accessible objects on every read (Calc's cells): their reads compare by position,
 * not by native id, as equivalent windows do.
 */
const TRANSIENT_IDS = new Set(['calc']);
/** Whether a read compares native ids exactly: a tree read of a shared window whose ids are stable. */
export const exactIdsFor = (op, scene) => OPS[op].kind === 'read' && !TRANSIENT_IDS.has(scene);

/** The input scene's buttons, by their accessible names. */
const INPUT_ELEMENTS = { press: 'Press', menu: 'Menu', far: 'Far' };

/**
 * A state read once it has settled: the same twice in a row, `gapMs` apart, or the last read at `deadlineMs`. A page
 * that scrolls smoothly is otherwise read mid-animation, and a sample's before-state with it.
 */
export async function settledRead(read, { gapMs = 120, deadlineMs = 1500 } = {}) {
  const started = Date.now();
  let last = await read();
  for (;;) {
    await sleep(gapMs);
    const now = await read();
    if (JSON.stringify(now) === JSON.stringify(last) || Date.now() - started > deadlineMs) return now;
    last = now;
  }
}

/**
 * The effect, judged on the settled state: read until the effect shows and the state holds still (two equal reads),
 * or 2.5 s have passed, when the last judgement stands. A judgement on a state still moving could pass a sample that
 * then moves on, or fail one whose effect is on its way.
 */
export async function pollEffect(read, judge, { gapMs = 120, deadlineMs = 2500 } = {}) {
  const started = Date.now();
  let last = await read();
  for (;;) {
    await sleep(gapMs);
    const now = await read();
    const verdict = judge(now);
    const steady = JSON.stringify(now) === JSON.stringify(last);
    if ((steady && verdict !== false) || Date.now() - started > deadlineMs) return verdict;
    last = now;
  }
}

/** The answer a sample is compared by: its state, its screenshot, or its normalized answer. */
function answerDigest(op, scene, response, labelPattern) {
  if (!response.ok) return sha(JSON.stringify(normalizeAnswer(response)));
  if (op === 'clipboard_read') return sha(JSON.stringify(answerOf(op, response)));
  const kind = OPS[op].kind;
  if (op === 'list_windows' || op === 'list_apps') return sha(JSON.stringify(response.output));
  if (op === 'get_screenshot') return sha(JSON.stringify(response.output.map(() => ({}))));
  // a retention case is judged by its screenshot (compared with the pinned build's of the same sample) and its effect:
  // the page's tree around a resize or a remap settles on its own time, and the tree reads have their own operations
  if (kind === 'retention') return sha(JSON.stringify({ ok: true, screenshots: response.output.screenshots.length }));
  if (kind === 'read' || kind === 'shot') {
    const exactIds = exactIdsFor(op, scene);
    const normalized = normalizeState(response.output, { exactIds, label: exactIds ? null : labelPattern });
    let rendered = typeof response.output.rendered === 'string' ? response.output.rendered.replace(labelPattern, '<label>').replace(/Memory usage - [\d.]+ [KMG]B/g, 'Memory usage - <n>') : undefined;
    // the client's decimal ids follow the native ids it has seen: by position wherever native ids are
    if (rendered !== undefined && !exactIds) rendered = rendered.split('\n').map((line, i) => line.replace(/^(\t*)\d+ /, `$1${i} `)).join('\n');
    return sha(JSON.stringify(rendered === undefined ? normalized : { normalized, rendered }));
  }
  return sha(JSON.stringify(normalizeAnswer(response)));
}

/** A non-state answer as compared: a clipboard handle by its kind (each engine names its own handles). */
export function answerOf(op, response) {
  const answer = normalizeAnswer(response);
  if (op === 'clipboard_read' && answer.ok) return { ok: true, output: typeof answer.output === 'string' ? '<handle>' : answer.output };
  return answer;
}

/** Where two answers differ, for the deviations: the answer's success, its error, or its output. */
export function differingField(reference, candidate) {
  if (!reference || !candidate) return 'answer';
  if (reference.ok !== candidate.ok) return 'answer';
  if (!candidate.ok) return reference.error === candidate.error ? null : 'error';
  return 'output';
}

/**
 * One sample: the operation's untimed preparation, its before-state, the request inside a witness span (the engine
 * started inside it when nothing had to come first), the untimed companion, the effect read back and the follow-up
 * input of a retention case. Returns the row and the raw response.
 */
export async function runSample(s) {
  const ctx = { desktop: s.desktop, scene: s.target, sceneName: s.sceneName, engine: s.engine, i: s.i, witness: s.witness, cuaVersion: s.cuaVersion };
  try {
    return await measureSample(s, ctx);
  } finally {
    // the sample's clipboard owner ends with the sample, however it ends (a check stops it on the way)
    await ctx.prior?.stop();
  }
}

async function measureSample(s, ctx) {
  const { witness, engine, target, op, i } = s;
  const def = OPS[op];
  // cua's display-wide unconfirmed-paste window refuses every cua engine's text request while it runs: a text sample
  // starts once it has closed (waited out, never removed: its target may still convert until it ends)
  const quarantined = isText(op) ? await waitQuarantineOver() : null;
  const spans = [];
  const span = async (tag, fn) => {
    if (!witness || !target) return { value: await fn(), witness: null };
    const result = await witness.span(tag, fn);
    spans.push(result.witness);
    return result;
  };
  // every request the engine under measurement sends besides the timed one runs inside a witness span of its own; the
  // harness's own changes to the window (a resize, a remap) stay outside the spans
  ctx.witnessed = (fn) =>
    span(`${s.label}:${s.sceneName}:${op}:companion`, () => {
      if (!engine.started) engine.start();
      return fn();
    }).then((r) => r.value);
  const needsIds = target?.elements && typeof engine.resolveElements === 'function';
  if (def.prepare || needsIds) {
    // a text operation's preparation is the harness's own (a caret, a clipboard owner) unless it sends a companion,
    // so its cold sample still times the engine's start
    if (!engine.started && !isText(op)) engine.start();
    if (needsIds) {
      if (!engine.started) engine.start();
      // read once per engine process and window: the client keeps its numbering for the window
      engine.ids ??= new Map();
      if (!engine.ids.has(target.id)) engine.ids.set(target.id, await ctx.witnessed(() => engine.resolveElements(target, target.elements)));
      ctx.ids = engine.ids.get(target.id);
    }
    if (def.prepare) await def.prepare(ctx);
  }
  const before = def.read && !def.follow ? await settledRead(() => def.read(ctx)) : null;
  ctx.before = before;
  const [command, input] = def.request(ctx);
  let startedInSpan = false;
  const send = () => {
    if (!engine.started) {
      engine.start();
      startedInSpan = true;
    }
    return engine.request(command, input);
  };
  const tag = `${s.label}:${s.sceneName}:${op}`;
  // a cua text command's route is known beforehand: its witness is judged against it and the route the engine reports
  // taking (Decision Log, M2.2); a vendor build's is judged strictly
  const expected = VENDORS.includes(s.label) ? null : routeOf(op, s.sceneName);
  const answered = witness && target && (isText(op) || isDevice(op)) ? await routeWitness(witness, tag, target.id, expected, send, { inFront: OPS[op].inFront === true, opensWindows: command === 'click' && input.mouse_button === 'right' }) : await span(tag, send);
  const { response, ms, sinceSpawnMs, stats } = answered.value;
  const row = { kind: 'sample', engine: s.label, scene: s.sceneName, op, block: s.block, series: i === 0 ? 'cold' : 'warm', i };
  if (expected) row.route_expected = expected;
  row.ms = Math.round((i === 0 && startedInSpan ? sinceSpawnMs : ms) * 100) / 100;
  row.timed = i === 0 && startedInSpan ? 'spawn' : 'request';
  row.request_ms = Math.round(ms * 100) / 100;
  row.ok = response.ok === true;
  if (!row.ok) row.error = String(response.error).slice(0, 300);
  if (stats) {
    row.stats = { calls: stats.bus.calls, waits_alone: stats.bus.waits_alone, max_in_flight: stats.bus.max_in_flight, connections: stats.bus.connections };
    if (stats.tree) row.stats.tree = stats.tree;
    if (stats.capture) row.stats.capture = stats.capture;
    if (stats.paste) row.stats.paste = { confirmed: stats.paste.confirmed, confirm_ms: stats.paste.confirm_ms, transfer: stats.paste.transfer, clicked: stats.paste.clicked, restored: stats.paste.restored, focus_ms: stats.paste.focus_ms, clicks: stats.paste.clicks };
    if (stats.route) row.route = stats.route;
    if (stats.dnd) row.dnd = stats.dnd;
    if (stats.event_time) row.event_time = stats.event_time;
    if (stats.dnd_wait) row.dnd_wait = stats.dnd_wait;
  }
  if (def.after) await def.after(ctx, response);
  if (def.effect && row.ok && def.read && !def.follow) {
    row.effect = await pollEffect(() => def.read(ctx), (after) => def.effect(ctx, input, before, after));
  }
  if (def.follow && row.ok) {
    // the retention case's input after the change, its effect read back
    const followBefore = await settledRead(() => def.read(ctx));
    const [c2, i2] = def.follow(ctx);
    const f = await span(`${s.label}:${s.sceneName}:${op}:follow`, () => engine.request(c2, i2));
    row.follow_ok = f.value.response.ok === true;
    row.effect = row.follow_ok ? await pollEffect(() => def.read(ctx), (after) => def.effect(ctx, i2, followBefore, after)) : false;
  }
  if (def.changeEffect && row.ok) row.effect = await def.changeEffect(ctx);
  // a text operation must prove its effect (M2 whole-branch review): one it could not read is not shown, so it is a
  // miss, whatever the other samples of the operation could read
  if (isText(op) && def.effect) {
    row.effect_required = true;
    if (row.ok && typeof row.effect !== 'boolean') {
      row.effect = false;
      row.effect_unread = true;
    }
  }
  if (row.effect === null) delete row.effect;
  if (def.check) Object.assign(row, await def.check(ctx, response));
  if (ctx.prepareError) row.prepare_error = ctx.prepareError;
  if (quarantined?.waited_ms) row.quarantine_waited_ms = quarantined.waited_ms;
  if (def.cleanup) await def.cleanup(ctx, response);
  if (def.restore) await def.restore(ctx);
  const main = answered.judged ?? answered.witness;
  if (main) {
    const all = [main, ...spans.filter((w) => w !== answered.witness)];
    row.witness = all.every((w) => w.clean);
    if (!row.witness) row.witness_fields = [...new Set(all.flatMap((w) => w.fields))];
    // what the witness saw, wherever it failed or an allowance excused a change (each stacking change with its orders)
    if ((!row.witness || answered.judged?.allowed?.length) && answered.report) {
      row.witness_changes = (answered.report.changes ?? []).slice(0, 20);
      row.witness_restacks = (answered.report.restacks ?? []).slice(0, 20);
      row.witness_focus = (answered.report.focus ?? []).slice(0, 20);
    }
    if (answered.judged?.allowed?.length) row.witness_allowed = answered.judged.allowed;
  }
  return { row, response };
}

/**
 * The negative check: the activate-and-restore stub engine, through the audit's proxy display, must fail both the
 * witness and the audit. Returns whether it did.
 */
export async function negativeCheck(desktop, witness, stubScene, emit, { audit = false } = {}) {
  const proxy = audit ? await startProxy() : null;
  const stub = new Engine({ label: 'stub-activating', bin: join(here, 'stub-activating.mjs'), env: proxy?.env }).start();
  const { value, witness: w } = await witness.span('stub', () => stub.request('press_key', { window: { id: stubScene.id }, key: 'x' }));
  await stub.close();
  desktop.focusFront();
  const witnessFailed = !w.clean;
  let audited = null;
  if (proxy) audited = auditRequests(parseXtrace(await proxy.stop()));
  const auditFailed = audited ? !audited.clean && audited.traced : null;
  emit({ kind: 'stub-check', ok: value.response.ok, witness: w, witness_failed_it: witnessFailed, audit: audited ? { traced: audited.traced, requests: audited.requests, forbidden: audited.forbidden.map((f) => f.what) } : null, audit_failed_it: auditFailed });
  process.stdout.write(`negative check: the witness ${witnessFailed ? 'failed' : 'PASSED'} the activating stub (${w.fields.join(', ') || 'no change'})${audited ? `; the audit ${auditFailed ? 'failed' : 'PASSED'} it (${[...new Set(audited.forbidden.map((f) => f.what))].join(', ') || 'nothing forbidden'})` : ''}\n`);
  return witnessFailed && (auditFailed ?? true);
}

/**
 * The in-front allowance's checks (witness.mjs `judgeInFrontSpan`), on the top window of the desktop activated, judged
 * with it as the target; the allowance must pass `own` and fail `other` and `restacked`, or the run is invalid:
 * - `own`: the top window activated again, already active (as Chrome's drop activates its own window): the window
 *   manager's no-op raise and its property rewrites, which the allowance passes;
 * - `other`: the window below it activated through the window manager, then the top one again;
 * - `restacked`: the window below raised and the top one raised back under one server grab (`xprobe restack-grabbed`),
 *   which leaves the stacking property as it was: only the restack events tell.
 * Returns whether all three held.
 */
export async function inFrontNegativeCheck(witness, emit) {
  const order = stacking();
  if (order.length < 2) {
    emit({ kind: 'stub-check-in-front', witness_failed_it: false, why: 'fewer than two windows' });
    process.stdout.write('in-front checks: fewer than two windows\n');
    return false;
  }
  const [other, top] = order.slice(-2);
  const activate = (w) => execFileSync('xdotool', ['windowactivate', '--sync', String(w)]);
  activate(top);
  await sleep(200);
  const judge = (report) => judgeInFrontSpan(report, { target: top, frame: toplevel(top) });
  const own = await witness.span('stub:in-front:own', async () => {
    activate(top);
    await sleep(100);
  });
  const switched = await witness.span('stub:in-front:other', async () => {
    activate(other);
    await sleep(100);
    activate(top);
    await sleep(100);
  });
  const restacked = await witness.span('stub:in-front:restacked', async () => {
    execFileSync(XPROBE, ['restack-grabbed', String(other), String(top)]);
    await sleep(100);
  });
  const shown = (report) => ({ changes: (report.changes ?? []).slice(0, 10), restacks: (report.restacks ?? []).slice(0, 10), focus: (report.focus ?? []).slice(0, 10) });
  const checks = {
    own: { ...judge(own.report), ...shown(own.report) },
    other: { ...judge(switched.report), ...shown(switched.report) },
    restacked: { ...judge(restacked.report), ...shown(restacked.report) },
  };
  const held = checks.own.clean && !checks.other.clean && checks.restacked.fields.includes('stacking');
  emit({ kind: 'stub-check-in-front', top, other, checks, witness_failed_it: held });
  const line = (name, c) => `${name}: ${c.clean ? 'clean' : c.fields.join(', ')}`;
  process.stdout.write(`in-front checks: ${held ? 'held' : 'DID NOT HOLD'} (${line('the target activated again', checks.own)}; ${line('another window activated and the target again', checks.other)}; ${line('another raised and the target raised back under one server grab', checks.restacked)})\n`);
  return held;
}

/**
 * The foreground allowance's checks, on the two top windows of the desktop. Each span is judged as a foreground request
 * on one of them; the allowance must fail `spaced`, `coalesced` and `switched` and pass `raised` and `activated`, or the
 * run is invalid:
 * - `spaced`: the window just below the top raised, then the top window raised back 50 ms later, inside one span;
 * - `coalesced`: the same two raises under one server grab (`xprobe restack-grabbed`), so the window manager processes
 *   them together and `_NET_CLIENT_LIST_STACKING` may show no change at all: only the restack events tell;
 * - `raised`: the window below the top raised, judged with it as the target: its frame rises to the top, with the
 *   window manager's property rewrites, which the allowance passes. The top window is raised back after the span.
 * - `switched`: the focus and `_NET_ACTIVE_WINDOW` set to the other window and back under one server grab (`xprobe
 *   focus-grabbed`), which only the focus events show;
 * - `activated`: the other window activated through the window manager (`xdotool windowactivate`), judged with it as
 *   the target: activated, raised and focused, which the allowance passes. The top window is activated again after it.
 * - `popup`: an override-redirect window of another client (`xprobe popup`) mapped and destroyed, judged with the top
 *   window as the target: only the target client's own override-redirect windows may come and go.
 * Each judgement names the target's frame (`toplevel`). Returns whether all six held.
 */
export async function foregroundNegativeCheck(witness, emit) {
  const order = stacking();
  if (order.length < 2) {
    emit({ kind: 'stub-check-foreground', witness_failed_it: false, why: 'fewer than two windows to restack' });
    process.stdout.write('foreground checks: fewer than two windows to restack\n');
    return false;
  }
  const [other, top] = order.slice(-2);
  const raise = (w) => execFileSync('xdotool', ['windowraise', String(w)]);
  const judge = (report, target) => judgeForegroundSpan(report, { target, frame: toplevel(target), focusWithin: (w) => within(w, target) });
  const shown = (report) => ({ changes: (report.changes ?? []).slice(0, 10), restacks: (report.restacks ?? []).slice(0, 10) });
  const spaced = await witness.span('stub:foreground:spaced', async () => {
    raise(other);
    await sleep(50);
    raise(top);
    await sleep(50);
  });
  const coalesced = await witness.span('stub:foreground:coalesced', async () => {
    execFileSync(XPROBE, ['restack-grabbed', String(other), String(top)]);
    await sleep(100);
  });
  const restored = stacking().join() === order.join();
  const raised = await witness.span('stub:foreground:raised', async () => {
    raise(other);
    await sleep(100);
  });
  raise(top);
  await sleep(100);
  // the activation evidence (M2 whole-branch review): the focus and the active window switched to the other window and
  // back under one server grab, which the property read after its notifies and the sampled focus cannot show; then the
  // other window activated through the window manager as the foreground route activates its target
  const activate = (w) => execFileSync('xdotool', ['windowactivate', '--sync', String(w)]);
  activate(top);
  await sleep(100);
  const switched = await witness.span('stub:foreground:switched', async () => {
    execFileSync(XPROBE, ['focus-grabbed', String(other), String(top)]);
    await sleep(100);
  });
  const activated = await witness.span('stub:foreground:activated', async () => {
    activate(other);
    await sleep(100);
  });
  activate(top);
  await sleep(100);
  // another client's override-redirect window (the harness's own) mapped and destroyed inside the span: the target
  // client's own may come and go (Decision Log, M3.1), another's may not
  const popup = await witness.span('stub:foreground:popup', async () => {
    execFileSync(XPROBE, ['popup', '40', '40', '120', '80', '100']);
    await sleep(50);
  });
  const shownFocus = (report) => ({ ...shown(report), focus: (report.focus ?? []).slice(0, 10) });
  const checks = {
    spaced: { ...judge(spaced.report, top), ...shown(spaced.report) },
    coalesced: { ...judge(coalesced.report, top), ...shown(coalesced.report) },
    raised: { ...judge(raised.report, other), ...shown(raised.report) },
    switched: { ...judge(switched.report, top), ...shownFocus(switched.report) },
    activated: { ...judge(activated.report, other), ...shownFocus(activated.report) },
    popup: { ...judge(popup.report, top), ...shown(popup.report) },
  };
  const held =
    checks.spaced.fields.includes('stacking') &&
    checks.coalesced.fields.includes('stacking') &&
    checks.raised.clean &&
    checks.raised.allowed.includes('stacking') &&
    checks.switched.fields.includes('focus') &&
    checks.activated.clean &&
    checks.activated.allowed.includes('active') &&
    checks.popup.fields.includes('stacking');
  emit({ kind: 'stub-check-foreground', top, other, restored, checks, witness_failed_it: held });
  const line = (name, c) => `${name}: ${c.clean ? 'clean' : c.fields.join(', ')}`;
  process.stdout.write(
    `foreground checks: ${held ? 'held' : 'DID NOT HOLD'} (${line('another raised and the top raised back', checks.spaced)}; ${line('the same under one server grab', checks.coalesced)}; ${line('the target raised', checks.raised)}; ${line('the focus and the active window switched away and back under one server grab', checks.switched)}; ${line('the target activated', checks.activated)}; ${line("another client's override-redirect window mapped", checks.popup)}; order ${restored ? 'restored' : 'not restored'})\n`,
  );
  return held;
}

/**
 * The harness's own desktop entry for launch_app: its program appends a line to a file the harness counts. The
 * script's text is fixed; the file (under the run's directory, so carrying its label) is its quoted argument.
 */
export function launchEntry(dir) {
  const apps = join(dir, 'launch', 'applications');
  mkdirSync(apps, { recursive: true });
  const marker = join(dir, 'launch', 'launched');
  const script = join(dir, 'launch', 'launch.sh');
  writeFileSync(script, '#!/bin/sh\necho launched >> "$1"\n', { mode: 0o755 });
  writeFileSync(join(apps, 'cua171-launch-probe.desktop'), desktopEntry('cua171 Launch Probe', ['/bin/sh', script, marker]));
  return { env: { XDG_DATA_HOME: join(dir, 'launch'), XDG_DATA_DIRS: '/nonexistent' }, count: () => (existsSync(marker) ? readFileSync(marker, 'utf8').split('\n').filter(Boolean).length : 0) };
}

/**
 * Opens one window of a scene: gedit on a scratch file, a harness page in Chrome, a family's application; M2's text
 * scenes with their field resolved (text.mjs).
 */
export async function openScene(desktop, scene, role, { text = false } = {}) {
  if (scene === 'gedit') {
    const opened = await desktop.openGedit(role, GEDIT_TEXT);
    opened.originalLength = (await desktop.geditText(opened)).length;
    return text ? resolveField(desktop, opened, scene) : opened;
  }
  if (scene === 'chrome-textarea') return resolveField(desktop, await desktop.openChrome(role, 'text.html', { stem: 'textarea', query: 'paste=plain' }), scene);
  if (scene === 'chrome-address-bar') return resolveField(desktop, await desktop.openChrome(role, 'scene.html', { stem: 'addressbar' }), scene);
  if (scene === 'gnome-text-editor') return withApp(desktop, await resolveField(desktop, await desktop.openFamilyScene('gnome-text-editor', role), scene));
  // M3.1's device cases (device.mjs): each window's application as list_windows names it (the Device mode sentence's)
  // and its size (a case moves it and puts it back)
  if (scene === 'device-gtk4') return withApp(desktop, await desktop.openFamilyScene('gtk4-input', role));
  if (scene === 'device-xterm') return withApp(desktop, await desktop.openFamilyScene('xterm', role));
  if (scene === 'device-qt') {
    const { openFamily } = await import('./families.mjs');
    const { DRAG_DOC, verticalScrollBar } = await import('./drag.mjs');
    desktop.oracle ??= new Oracle();
    const opened = await openFamily(desktop, desktop.oracle, 'kate', role, { doc: DRAG_DOC });
    opened.scrollbar = await verticalScrollBar(desktop, desktop.oracle, opened);
    return withApp(desktop, opened);
  }
  if (scene === 'device-chrome-dnd') {
    const { openFamily, FAMILIES } = await import('./families.mjs');
    const { PAGE, locate, runPath } = await import('./drag.mjs');
    desktop.oracle ??= new Oracle();
    const opened = await openFamily(desktop, desktop.oracle, 'chrome', `device_${role}`, { page: PAGE, geometry: FAMILIES.chrome.geometry });
    opened.kindOf = 'page';
    opened.dndAt = await locate({ desktop, oracle: desktop.oracle }, opened, ['dnd']);
    opened.dndPath = runPath(opened.dndAt, 'dnd', 0);
    return withApp(desktop, opened);
  }
  if (scene === 'device-firefox' || scene === 'device-chrome') {
    const { openFamily, FAMILIES } = await import('./families.mjs');
    desktop.oracle ??= new Oracle();
    const family = scene === 'device-firefox' ? 'firefox' : 'chrome';
    // a role of the scene's own: chrome-input's windows show the same page, and a window is found by its title
    const opened = await openFamily(desktop, desktop.oracle, family, `device_${role}`, { page: 'input.html', geometry: FAMILIES[family].geometry });
    opened.kindOf = 'page';
    opened.elements = await desktop.elementsByName(opened, INPUT_ELEMENTS);
    return withApp(desktop, opened);
  }
  if (FAMILY_OF[scene]) return desktop.openFamilyScene(FAMILY_OF[scene], role);
  const opened = await desktop.openChrome(role, PAGE_OF[scene], { stem: scene === 'retention' ? 'retention' : undefined });
  if (scene === 'chrome-input') opened.elements = await desktop.elementsByName(opened, INPUT_ELEMENTS);
  return opened;
}

/** A scene window with its application's name as `list_windows` gives it and its size. */
async function withApp(desktop, scene) {
  const listed = (await desktop.listWindows()).find((w) => w.id === scene.id);
  if (!listed) throw new Error(`${scene.label} is not listed`);
  scene.app = listed.app;
  scene.size = [listed.width, listed.height];
  return scene;
}

/** The engine a candidate runs an operation with: its flags plus the operation's own (M2: `--desktop dedicated`). */
export function engineSpecFor(spec, op, scene) {
  if (VENDORS.includes(spec.label) || !OPS[op].cuaArgs) return spec;
  return { ...spec, args: [...spec.args, ...OPS[op].cuaArgs(scene)] };
}

/** Whether an engine runs an operation: a candidate-only operation (`cuaOnly`) is not sent to the vendor builds. */
export const runsOp = (label, op) => !(OPS[op].cuaOnly && VENDORS.includes(label));

/**
 * The samples a side a series is topped up to while it is undetermined (Acceptance 3, revised at M3.1): 20, the fewest
 * it is judged on (stats.mjs `MIN_NOISE_SAMPLES`), then 40; one still undetermined at 40 fails.
 */
export const SAMPLE_LEVELS = [MIN_NOISE_SAMPLES, 2 * MIN_NOISE_SAMPLES];

/**
 * The top-up rounds a desktop-route group needs: each round is one fresh engine per engine, its cold sample, and its
 * `warmPerRound` warm ones only when the warm series is short too. `{rounds, warm}`.
 */
export function topUpRounds({ cold, warm }, { min, warmPerRound }) {
  if (warm < min) return { rounds: Math.max(min - cold, Math.ceil((min - warm) / warmPerRound), 0), warm: true };
  return { rounds: Math.max(min - cold, 0), warm: false };
}

export async function runDiff(args) {
  const run = args.run ?? `run-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`;
  mkdirSync(args.out, { recursive: true });
  const results = join(args.out, 'results.jsonl');
  const emit = (row) => appendFileSync(results, `${JSON.stringify({ run, ...row })}\n`);
  if (!existsSync(XPROBE)) throw new Error(`build the harness's X client first: cargo build --release --manifest-path ${join(here, 'xprobe', 'Cargo.toml')}`);
  const via = args.via ?? 'wire';
  const cuaVersion = engineVersion(args.cua);

  const engines = [
    { label: 'pinned', bin: args.vendor, args: [] },
    { label: 'newest', bin: args.newest, args: [] },
    { label: 'cua', bin: args.cua, args: [], stats: via === 'wire' },
    ...args.variants.map((v) => ({ label: v.label, bin: args.cua, args: v.args, stats: via === 'wire' })),
  ];
  const makeEngine = (spec, env) => (via === 'vendor-js' ? new VendorJsEngine({ label: spec.label, bin: spec.bin, skyDir: args.vendorJs, env }) : new Engine({ ...spec, env: env ? { ...process.env, ...env } : undefined }));
  const labels = engines.map((e) => e.label);
  const plan = planOps(args.scenes, args.ops);
  if (via === 'vendor-js' && plan.some((p) => isText(p.op) || isCase(p.op))) {
    throw new Error("M2's text operations and paste cases run over the wire; their facade-level proof is the facade suites (repl-parity's native text cases, the native baseline)");
  }
  const blockPlan = plan.filter((p) => !isCase(p.op));
  const samplesFor = (op) => OPS[op].warmSamples ?? (inputOp(op) ? args.samplesInput : args.samplesTree);

  emit({
    kind: 'meta',
    commit: gitHead(),
    cua_version: engineVersion(args.cua),
    via,
    engines: engines.map((e) => ({ label: e.label, args: e.args, sha256: fileSha(e.bin) })),
    vendor: args.vendor,
    newest: args.newest,
    scenes: args.scenes,
    ops: plan.map((p) => `${p.scene}:${p.op}`),
    blocks: args.blocks,
    samples_tree: args.samplesTree,
    samples_input: args.samplesInput,
    occlusion: args.occlusion,
    started: new Date().toISOString(),
  });

  const desktop = new Desktop({ cua: args.cua, run });
  if (plan.some((p) => isText(p.op) || isCase(p.op))) desktop.oracle ??= new Oracle();
  // Every scene label of this run: equivalent windows differ in their own label and list each other's (gedit's
  // recent files), so comparisons across windows replace them all.
  const labelPattern = new RegExp(`cua171-diff-${run.replace(/[^A-Za-z0-9_-]/g, '\\$&')}-[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*`, 'g');
  let witness = null;
  let valid = true;
  const keep = {}; // first ok output per engine/scene/op, for the first difference
  const shots = []; // every screenshot sample
  const answers = new Map(); // normalized answers of non-state samples, for the deviations
  let outcome = { valid: false, pass: false, failed: ['the run did not finish'], code: 1 };
  try {
    const launch = plan.some((p) => OPS[p.op].apps) ? launchEntry(desktop.dir) : null;
    if (launch) desktop.launchCount = launch.count;
    // Scenes: one shared window per scene for tree reads, one window per engine for screenshots and input.
    const windows = {};
    for (const scene of args.scenes.filter((s) => s !== 'desktop')) {
      // the safety cases open windows of their own (safety.mjs)
      const ops = blockPlan.filter((p) => p.scene === scene).map((p) => p.op);
      const open = (role, text = false) => openScene(desktop, scene, role, { text });
      windows[scene] = { shared: ops.some((op) => !ownWindow(op)) ? await open('read') : null, own: {}, text: {} };
      // each engine that runs one of the scene's own-window operations gets its own window
      for (const label of labels.filter((l) => ops.some((op) => ownWindow(op) && !isText(op) && runsOp(l, op)))) {
        windows[scene].own[label] = await open(label.replace(/[^a-z0-9]+/gi, '_'));
      }
      // the text operations on windows of their own, so a document they grow never changes another operation's scene
      for (const label of labels.filter((l) => ops.some((op) => isText(op) && runsOp(l, op)))) {
        windows[scene].text[label] = await open(`text_${label.replace(/[^a-z0-9]+/gi, '_')}`, true);
      }
    }
    const needsStub = plan.some((p) => inputOp(p.op) || isCase(p.op));
    const stubScene = needsStub ? await desktop.openChrome('stub', 'scene.html') : null;
    await desktop.openFront(args.occlusion);
    witness = await startWitness(XPROBE);
    const busAddress = a11yBusAddress();

    if (stubScene && !(await negativeCheck(desktop, witness, stubScene, emit, { audit: args.audit }))) valid = false;
    // the foreground route's allowance, wherever a request is expected to take that route
    const foregroundPlanned = plan.some((p) => routeOf(p.op, p.scene) === 'foreground' || p.op === 'restore_refused');
    if (foregroundPlanned && !(await foregroundNegativeCheck(witness, emit))) valid = false;
    // the in-front allowance's controls, in every run with the stub's
    if (stubScene && !(await inFrontNegativeCheck(witness, emit))) valid = false;

    // One engine's series of an operation in a block: a fresh process, its cold sample and `n - 1` warm ones.
    const measureSeries = async ({ sceneName, op, label, block, n }) => {
      const spec = engineSpecFor(engines.find((e) => e.label === label), op, sceneName);
      const target = measuredTarget(windows, sceneName, op, label);
      if (target && args.occlusion === 'visible') desktop.raise(target);
      const engine = makeEngine(spec, OPS[op].apps ? launch.env : undefined);
      for (let i = 0; i < n; i++) {
        const { row, response } = await runSample({ desktop, witness: targeted(op) ? witness : null, engine, target, op, i, block, label, sceneName, cuaVersion });
        if (row.ok && (OPS[op].kind === 'read' || OPS[op].kind === 'shot' || OPS[op].kind === 'retention')) {
          row.nodes = retainedIds(response.output).length;
          row.source = response.output.ax_tree_source;
          if (response.output.rendered !== undefined) row.rendered_lines = response.output.rendered?.split('\n').length ?? null;
          const exactIds = exactIdsFor(op, sceneName);
          keep[`${label}|${sceneName}|${op}`] ??= { output: response.output, label: exactIds ? null : labelPattern };
        } else if (row.ok && (op === 'list_windows' || op === 'list_apps')) {
          row.items = response.output.length;
        }
        row.digest = answerDigest(op, sceneName, response, labelPattern);
        if (!['read', 'shot', 'retention'].includes(OPS[op].kind)) answers.set(`${label}|${sceneName}|${op}|${block}|${i}`, answerOf(op, response));
        if (row.ok && shotOf(op)) {
          // every sample's screenshot is kept for the comparison after the blocks
          const shot = op === 'get_screenshot' ? response.output[0] : response.output.screenshots[0];
          const copy = join(desktop.dir, `${label.replace(/[^a-z0-9]+/gi, '_')}-${sceneName}-${op}-${block}-${i}.jpg`);
          if (shot) copyFileSync(shot.filepath, copy);
          shots.push({ engine: label, scene: sceneName, op, block, i, image: shot ? copy : null, pair: OPS[op].kind === 'retention' ? 'i' : 'last' });
        }
        if (row.ok) {
          const files = op === 'get_screenshot' ? response.output : (response.output?.screenshots ?? []);
          for (const shot of files) {
            if (shot.filepath.startsWith('/tmp/') && !shot.filepath.startsWith('/tmp/cua-engine-')) rmSync(shot.filepath, { force: true });
          }
        }
        emit(row);
      }
      await engine.close();
      if (target) target.retainedBy = null;
      if (OPS[op].reset) await OPS[op].reset({ desktop, scene: target, cua: args.cua });
      // gedit's press_key series ends with the document back at its original length
      if (op === 'press_key' && target.kind === 'gedit' && (await desktop.geditText(target)).length > target.originalLength) {
        const fix = new Engine({ label: 'restore', bin: args.cua }).start();
        await fix.request('press_key', { window: { id: target.id }, key: 'BackSpace' });
        await fix.close();
      }
    };

    for (let block = 0; block < args.blocks; block++) {
      for (const { scene: sceneName, op } of blockPlan) {
        for (const label of blockOrder(labels, block).filter((l) => runsOp(l, op))) {
          await measureSeries({ sceneName, op, label, block, n: 1 + samplesFor(op) });
        }
      }
    }

    // The top-up (Acceptance 3, revised at M3.1): a series is judged only on 20 samples a side and through its interval,
    // so every series the blocks leave undetermined (too few samples, or an interval too wide) gets fresh-engine rounds
    // until each engine has 20 samples in it, then 40 if it is still undetermined; one undetermined at 40 fails. A round
    // is one more series per engine, its cold sample alone unless the warm series is short too; the engines' order
    // rotates on from the blocks'.
    if (via === 'wire') {
      let round = 0;
      for (const level of SAMPLE_LEVELS) {
        const sampled = readFileSync(results, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.run === run && r.kind === 'sample');
        for (const { scene: sceneName, op } of blockPlan.filter((p) => !isDevice(p.op) && !OPS[p.op].cuaOnly)) {
          const opRows = sampled.filter((r) => r.scene === sceneName && r.op === op);
          const parity = ['cold', 'warm'].map((series) => declaredParity({ op, scene: sceneName, series })).filter(Boolean);
          const open = labels
            .filter((l) => !VENDORS.includes(l))
            .flatMap((candidate) => judgeOperation(opRows.filter((r) => [...VENDORS, candidate].includes(r.engine)), { vendors: VENDORS, candidate, text: isText(op), noise: medianDifferenceInterval, parity }).undetermined)
            .filter((u) => u.samples < level);
          if (!open.length) continue;
          const engineLabels = labels.filter((l) => runsOp(l, op));
          const count = (series) => Math.min(...engineLabels.map((l) => opRows.filter((r) => r.engine === l && r.series === series).length));
          const series = [...new Set(open.map((u) => u.series))];
          const need = topUpRounds({ cold: series.includes('cold') ? count('cold') : level, warm: series.includes('warm') ? count('warm') : level }, { min: level, warmPerRound: samplesFor(op) });
          // the warm samples only in the rounds the warm series needs, the rest a fresh engine's cold sample alone
          const warmRounds = series.includes('warm') ? Math.max(0, Math.ceil((level - count('warm')) / samplesFor(op))) : 0;
          emit({ kind: 'top-up', scene: sceneName, op, level, series, rounds: need.rounds, warm_rounds: warmRounds, open });
          for (let r = 0; r < need.rounds; r++, round++) {
            for (const label of blockOrder(engineLabels, args.blocks + round)) {
              await measureSeries({ sceneName, op, label, block: `topup-${level}-${r}`, n: r < warmRounds ? 1 + samplesFor(op) : 1 });
            }
          }
        }
      }
    }
    // Accessibility-bus calls, in their own untimed pass: a fresh process per engine, the cold read then a warm one.
    if (args.counts && via === 'wire') {
      for (const { scene: sceneName, op } of plan.filter((p) => p.op === 'tree')) {
        const target = windows[sceneName].shared;
        for (const spec of engines) {
          const engine = new Engine(spec);
          let names = [];
          for (const pass of ['cold', 'warm']) {
            const monitor = await startMonitor(busAddress);
            if (pass === 'cold') engine.start();
            const { response, stats } = await engine.request('get_window_state', { window: { id: target.id }, include_screenshot: false });
            const calls = await monitor.stop({ names });
            names = Object.keys(calls.by_connection);
            const row = { kind: 'counts', engine: spec.label, scene: sceneName, op, pass, ok: response.ok === true, calls: calls.calls, serial_calls: calls.serial_calls, max_in_flight: calls.max_in_flight, connections: calls.connections, by_member: calls.by_member };
            if (response.ok) row.nodes = retainedIds(response.output).length;
            if (stats) row.engine_reported = { calls: stats.bus.calls, waits_alone: stats.bus.waits_alone, wasted: stats.tree?.wasted_calls ?? null };
            emit(row);
          }
          await engine.close();
        }
      }
    }

    // The X request audit, in its own untimed pass: each engine's connections through an xtrace proxy, a fresh
    // process for two samples of each window-targeted operation (reads and screenshots too) on the window it is
    // measured on.
    const audits = {};
    if (args.audit) {
      for (const { scene: sceneName, op } of auditPlan(plan)) {
        for (const spec of engines.filter((e) => runsOp(e.label, op)).map((e) => engineSpecFor(e, op, sceneName))) {
          const target = measuredTarget(windows, sceneName, op, spec.label);
          const proxy = await startProxy();
          const engine = makeEngine({ ...spec, stats: false }, { ...(OPS[op].apps ? launch.env : {}), DISPLAY: proxy.env.DISPLAY, XAUTHORITY: proxy.env.XAUTHORITY });
          const oks = [];
          try {
            for (let i = 0; i < 2; i++) oks.push((await runSample({ desktop, witness: null, engine, target, op, i, block: 'audit', label: spec.label, sceneName, cuaVersion })).row.ok);
          } finally {
            await engine.close();
            if (ownWindow(op)) target.retainedBy = null;
            if (OPS[op].reset) await OPS[op].reset({ desktop, scene: target, cua: args.cua });
          }
          // a cua request that must take the foreground route is audited against that route: only its target's activation,
          // raise and focus and XTEST input (M2 whole-branch review)
          const foregroundAudit = !VENDORS.includes(spec.label) && routeOf(op, sceneName) === 'foreground';
          // a refused device case sends nothing at all (device.mjs)
          const nothingAudit = OPS[op].device === 'refusal';
          const trace = parseXtrace(await proxy.stop());
          const audited = foregroundAudit ? auditForeground(trace, target.id) : nothingAudit ? auditNothingSent(trace) : auditRequests(trace);
          const auditKind = foregroundAudit ? 'foreground' : nothingAudit ? 'nothing-sent' : 'background';
          // the judge compares these answers with the timed pass's: an operation that failed early is not audited
          audits[`${sceneName}|${op}|${spec.label}`] = { clean: audited.clean, oks, foreground: foregroundAudit, kind: auditKind, forbidden: [...new Set(audited.forbidden.map((f) => f.what))] };
          emit({ kind: 'audit', engine: spec.label, scene: sceneName, op, ok: oks.every(Boolean), oks, clean: audited.clean, traced: audited.traced, requests: audited.requests, audit: auditKind, ...(foregroundAudit ? { route: 'foreground', allowed: audited.allowed } : {}), forbidden: audited.forbidden.slice(0, 10) });
          desktop.focusFront();
        }
      }
    }

    // The text commands' accessibility-bus calls, in their own untimed pass: one sample per engine, a fresh process with
    // a monitor on the bus, every connection that appeared counted (Acceptance 6: no PasteText, InsertText or
    // SetTextContents in the run's trace).
    if (args.counts && via === 'wire') {
      for (const { scene: sceneName, op } of blockPlan.filter((p) => isText(p.op))) {
        for (const spec of engines.filter((e) => runsOp(e.label, op)).map((e) => engineSpecFor(e, op, sceneName))) {
          const target = measuredTarget(windows, sceneName, op, spec.label);
          const engine = makeEngine({ ...spec, stats: false });
          const monitor = await startMonitor(busAddress);
          let ok = false;
          try {
            ok = (await runSample({ desktop, witness: null, engine, target, op, i: 0, block: 'bus', label: spec.label, sceneName })).row.ok;
          } finally {
            await engine.close();
          }
          const calls = await monitor.stop();
          emit({ kind: 'text-bus', engine: spec.label, scene: sceneName, op, ok, calls: calls.calls, forbidden: Object.fromEntries(FORBIDDEN_TEXT_CALLS.map((m) => [m, calls.by_member[m] ?? 0])) });
          desktop.focusFront();
        }
      }
    }

    // The paste safety cases (safety.mjs): cua alone, on windows of their own, the bus watched for the whole phase.
    const casePlan = plan.filter((p) => isCase(p.op));
    if (casePlan.length) {
      const monitor = await startMonitor(busAddress);
      try {
        await runCases({ desktop, witness, cua: args.cua, emit, plan: casePlan, openScene: (scene, role) => openScene(desktop, scene, role, { text: true }) });
      } finally {
        const calls = await monitor.stop();
        emit({ kind: 'case-bus', calls: calls.calls, connections: calls.connections, forbidden: Object.fromEntries(FORBIDDEN_TEXT_CALLS.map((m) => [m, calls.by_member[m] ?? 0])) });
      }
    }

    // Screenshots: every sample's against the pinned build's of its block, before any verdict is drawn.
    const written = readFileSync(results, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.run === run);
    const rows = written.filter((r) => r.kind === 'sample');
    const countRows = written.filter((r) => r.kind === 'counts');
    const busRows = written.filter((r) => r.kind === 'text-bus');
    const imageOf = new Map();
    for (const c of compareShots(shots, xprobeDiff(XPROBE))) {
      const { image, pair, ...rest } = c;
      emit({ kind: 'image', ...rest });
      imageOf.set(`${c.engine}|${c.scene}|${c.op}|${c.block}|${c.i}`, c.ok);
    }

    // Verdicts: each sample's answer against the pinned build's of its block, a difference excused only by a declared
    // deviation, then the operation judged per candidate.
    const verdicts = [];
    // the device cases (device.mjs): cua alone, each judged by its expectation
    for (const { scene: sceneName, op } of blockPlan.filter((p) => isDevice(p.op))) {
      const opRows = rows.filter((r) => r.scene === sceneName && r.op === op && r.engine === 'cua');
      const judged = judgeDevice(op, opRows, args.audit ? audits[`${sceneName}|${op}|cua`] : { clean: true, kind: 'skipped' });
      const row = { kind: 'verdict', scene: sceneName, op, candidate: 'cua', device: OPS[op].device, ...judged, verdict: judged.pass ? 'pass' : 'fail' };
      verdicts.push(row);
      emit(row);
    }
    for (const { scene: sceneName, op } of blockPlan.filter((p) => !isDevice(p.op))) {
      const opRows = rows.filter((r) => r.scene === sceneName && r.op === op);
      // The reference is the pinned build's answer in the same block: a scene's own windows change across blocks
      // (gedit marks a document modified, a counter grows), and so does the window list. A text command's is the
      // answer of a build whose route applied it in that block (the newest build's for its own type_characters).
      const refEngine = (block) => OPS[op].reference ?? (isText(op) ? (VENDORS.find((v) => opRows.some((r) => r.engine === v && r.block === block && r.ok)) ?? 'pinned') : 'pinned');
      const refRows = (block) => {
        const mine = opRows.filter((r) => r.engine === refEngine(block) && r.block === block);
        return isText(op) && mine.some((r) => r.ok) ? mine.filter((r) => r.ok) : mine;
      };
      const reference = (block) => mode(refRows(block).map((r) => r.digest));
      const refAnswer = (block) => {
        const digest = reference(block);
        const r = refRows(block).find((x) => x.digest === digest);
        return r ? answers.get(`${r.engine}|${sceneName}|${op}|${block}|${r.i}`) : null;
      };
      const refKept = keep[`pinned|${sceneName}|${op}`];
      for (const r of opRows) {
        // an operation no vendor build runs has no answer to equal
        if (OPS[op].cuaOnly) continue;
        const image = imageOf.get(`${r.engine}|${r.scene}|${r.op}|${r.block}|${r.i}`);
        r.equal = r.digest === reference(r.block) && image !== false;
        if (!r.equal && image !== false && answers.has(`${r.engine}|${sceneName}|${op}|${r.block}|${r.i}`)) {
          const candidate = answers.get(`${r.engine}|${sceneName}|${op}|${r.block}|${r.i}`);
          const field = differingField(refAnswer(r.block), candidate);
          const deviation = field ? declaredDeviation({ op, scene: sceneName, field, candidate }) : null;
          if (deviation) {
            r.equal = true;
            r.deviation = deviation.op;
          }
        }
      }
      for (const candidate of labels.filter((l) => !VENDORS.includes(l))) {
        const mine = opRows.filter((r) => r.engine === candidate);
        const routes = [...new Set(mine.map((r) => r.route).filter(Boolean))];
        // the foreground route's activation and desktop input are the route itself, which its witness allowance judges
        // where the scene's expected route is the foreground one (a sample that took another route fails its witness);
        // the audit's forbidden requests are the background route's
        const foreground = routeOf(op, sceneName) === 'foreground';
        const opAudits = args.audit && targeted(op) && !foreground ? Object.fromEntries(labels.map((l) => [l, audits[`${sceneName}|${op}|${l}`]])) : null;
        const parity = ['cold', 'warm'].map((series) => declaredParity({ op, scene: sceneName, series })).filter(Boolean);
        // every series judged on 20 samples a side through its interval (the top-up above), never on fewer
        const verdict = judgeOperation(opRows.filter((r) => [...VENDORS, candidate].includes(r.engine)), { vendors: VENDORS, candidate, audits: opAudits, judgeSpeed: via === 'wire', text: isText(op), noise: medianDifferenceInterval, parity });
        const extra = {};
        if (routes.length) extra.routes = routes;
        if (isText(op) && routeOf(op, sceneName)) extra.route_expected = routeOf(op, sceneName);
        if (foreground && args.audit) {
          // the foreground audit: the route's own requests on the target and nothing else, required of cua
          const mine = auditVerdict(audits[`${sceneName}|${op}|${candidate}`], opRows.filter((r) => r.engine === candidate));
          extra.audit_note = `foreground route: only the target's activation, raise and focus and XTEST input allowed; the audit ${mine}`;
          if (mine !== 'clean') {
            verdict.pass = false;
            verdict.verdict = 'fail';
            verdict.reasons.push(`${candidate}: the foreground audit ${mine}`);
          }
        }
        if (isText(op) && via === 'wire' && args.counts) {
          // Acceptance 6: no PasteText, InsertText or SetTextContents from cua
          const bus = busRows.find((r) => r.scene === sceneName && r.op === op && r.engine === candidate);
          const forbidden = bus ? Object.entries(bus.forbidden).filter(([, n]) => n > 0).map(([m, n]) => `${m} ${n}`) : null;
          extra.text_bus = bus ? { ok: bus.ok, forbidden: bus.forbidden } : null;
          if (!bus || !bus.ok || forbidden.length) {
            verdict.pass = false;
            verdict.reasons.push(!bus ? `${candidate}: the bus pass did not run` : !bus.ok ? `${candidate}: the bus pass's request failed` : `${candidate}: called ${forbidden.join(', ')}`);
          }
        }
        if (op === 'tree' && via === 'wire') {
          // the bus-call bound (Design, Observation; Acceptance 4): the cold and the warm count pass, each measured,
          // cua's calls at most the vendor's plus M0's constant; a missing or failed count fails it
          const calls = judgeCalls(countRows.filter((r) => r.scene === sceneName && r.op === op), { vendors: VENDORS, candidate });
          extra.calls_bound = calls;
          if (!calls.pass) {
            verdict.pass = false;
            verdict.reasons.push(...calls.reasons);
          }
        }
        const kept = keep[`${candidate}|${sceneName}|${op}`];
        if (kept && refKept && OPS[op].kind !== 'retention') {
          const cmp = compareStates(refKept.output, kept.output, { exactIds: exactIdsFor(op, sceneName), labelA: refKept.label, labelB: kept.label });
          extra.first_comparison = cmp;
          if (sceneName === 'over-budget') extra.retained_ids_equal = JSON.stringify(retainedIds(refKept.output)) === JSON.stringify(retainedIds(kept.output));
        }
        const declared = [...new Set(opRows.filter((r) => r.engine === candidate && r.deviation).map((r) => r.deviation))];
        if (declared.length) extra.deviations = declared;
        // a reason added beside the judge (the bus trace, the bus-call bound, the foreground audit) is a failure, parity or not
        if (verdict.reasons.length) verdict.verdict = 'fail';
        // a declared refusal (M3.1): every cua sample the Device mode sentence with the witness unchanged, in place of
        // the judge's verdict; anything else fails
        const refusal = declaredRefusal({ op, scene: sceneName });
        if (refusal) {
          const bad = mine.filter((r) => r.ok || !(refusal.answer ?? DEVICE_REFUSAL).test(String(r.error ?? '')) || r.witness !== true);
          extra.refusal = describe(refusal);
          Object.assign(verdict, bad.length ? { pass: false, verdict: 'fail', reasons: [`${candidate}: ${bad.length} of ${mine.length} samples not the declared refusal with the witness unchanged`] } : { pass: false, verdict: 'declared refusal', reasons: [] });
        }
        const row = { kind: 'verdict', scene: sceneName, op, candidate, ...verdict, ...extra };
        verdicts.push(row);
        emit(row);
      }
      for (const vendor of ['newest']) {
        const kept = keep[`${vendor}|${sceneName}|${op}`];
        if (kept && refKept && OPS[op].kind !== 'retention') {
          emit({ kind: 'vendor-agreement', scene: sceneName, op, engine: vendor, first_comparison: compareStates(refKept.output, kept.output, { exactIds: exactIdsFor(op, sceneName), labelA: refKept.label, labelB: kept.label }) });
        }
      }
    }
    // the equal flags are folded into the verdicts; record the per-sample equality summary too
    for (const label of labels) {
      // an operation no vendor build runs (cuaOnly) has no answer to equal
      for (const { scene: sceneName, op } of blockPlan.filter((p) => !OPS[p.op].cuaOnly)) {
        const mine = rows.filter((r) => r.engine === label && r.scene === sceneName && r.op === op && r.digest);
        if (mine.length) emit({ kind: 'equality', engine: label, scene: sceneName, op, equal: mine.filter((r) => r.equal).length, of: mine.length, declared: mine.filter((r) => r.deviation).length });
      }
    }
    // the safety cases: each passes when it ran and every trial passed; the phase's bus trace has no forbidden call
    const after = readFileSync(results, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.run === run);
    for (const { scene: sceneName, op } of casePlan) {
      const trials = after.filter((r) => r.kind === 'case' && r.scene === sceneName && r.op === op);
      const row = { kind: 'verdict', scene: sceneName, op, candidate: 'cua', pass: trials.length > 0 && trials.every((t) => t.pass), reasons: trials.length ? trials.flatMap((t) => t.reasons) : ['the case did not run'] };
      verdicts.push(row);
      emit(row);
    }
    const caseBus = after.find((r) => r.kind === 'case-bus');
    if (casePlan.length) {
      const forbidden = caseBus ? Object.entries(caseBus.forbidden).filter(([, n]) => n > 0).map(([m, n]) => `${m} ${n}`) : ['the trace did not run'];
      const row = { kind: 'verdict', scene: 'cases', op: 'bus_trace', candidate: 'cua', pass: forbidden.length === 0, reasons: forbidden };
      verdicts.push(row);
      emit(row);
    }
    outcome = runOutcome(verdicts, { valid });
    emit({ kind: 'end', valid: outcome.valid, pass: outcome.pass, failed: outcome.failed, parity: outcome.parity, refused: outcome.refused, finished: new Date().toISOString() });
  } finally {
    if (witness) await witness.stop();
    await desktop.closeAll();
  }
  writeSummary(args.out);
  process.stdout.write(`run ${outcome.valid ? 'valid' : 'INVALID (the negative check did not hold)'}; ${verdictLine(outcome)}\nresults: ${results}\n`);
  return outcome.code === 0;
}

/** The operations the X request audit covers: every window-targeted one of the blocks (reads and screenshots included). */
export const auditPlan = (plan) => plan.filter((p) => targeted(p.op) && !isCase(p.op));

/** The window an engine's samples of an operation go to: none (desktop), its own (a text window for M2's), or the scene's shared one. */
export function measuredTarget(windows, sceneName, op, label) {
  if (sceneName === 'desktop') return null;
  if (isText(op)) return windows[sceneName].text[label];
  return ownWindow(op) ? windows[sceneName].own[label] : windows[sceneName].shared;
}

function mode(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = null;
  for (const [v, n] of counts) if (best === null || n > counts.get(best)) best = v;
  return best;
}
