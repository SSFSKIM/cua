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

import { auditRequests, parseXtrace, startProxy } from './audit.mjs';
import { startMonitor } from './busmon.mjs';
import { stacking, within } from './clip.mjs';
import { desktopEntry } from './desktop-entry.mjs';
import { declaredDeviation, declaredParity } from './deviations.mjs';
import { Engine } from './engine.mjs';
import { medianDifferenceInterval, normalizeAnswer } from './events.mjs';
import { compareShots, xprobeDiff } from './images.mjs';
import { compareStates, normalizeState, retainedIds } from './normalize.mjs';
import { OPS, SCENE_OPS, inputOp, ownWindow, shotOf, targeted } from './ops.mjs';
import { Oracle } from './oracle.mjs';
import { writeSummary } from './report.mjs';
import { routeWitness, runCases } from './safety.mjs';
import { Desktop, XPROBE, a11yBusAddress } from './scenes.mjs';
import { blockOrder, judgeCalls, judgeOperation, runOutcome, verdictLine } from './stats.mjs';
import { expectedRoute, resolveField } from './text.mjs';
import { VendorJsEngine } from './vendor-js.mjs';
import { judgeForegroundSpan, startWitness } from './witness.mjs';

export { SCENE_OPS };

const here = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VENDORS = ['pinned', 'newest'];
/** The text calls no cua request may make (Constraints: never called; Acceptance 6: "the accessibility-bus trace of the whole run"). */
export const FORBIDDEN_TEXT_CALLS = ['PasteText', 'InsertText', 'SetTextContents'];
const isCase = (op) => OPS[op].kind === 'case';
const isText = (op) => OPS[op].kind === 'text';

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
  const ctx = { desktop: s.desktop, scene: s.target, sceneName: s.sceneName, engine: s.engine, i: s.i, witness: s.witness };
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
  const expected = VENDORS.includes(s.label) ? null : expectedRoute(op, s.sceneName);
  const answered = witness && target && isText(op) ? await routeWitness(witness, tag, target.id, expected, send) : await span(tag, send);
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
  if (row.effect === null) delete row.effect;
  if (def.check) Object.assign(row, await def.check(ctx, response));
  if (ctx.prepareError) row.prepare_error = ctx.prepareError;
  if (def.cleanup) await def.cleanup(ctx, response);
  if (def.restore) await def.restore(ctx);
  const main = answered.judged ?? answered.witness;
  if (main) {
    const all = [main, ...spans.filter((w) => w !== answered.witness)];
    row.witness = all.every((w) => w.clean);
    if (!row.witness) row.witness_fields = [...new Set(all.flatMap((w) => w.fields))];
    if (!row.witness && answered.report) row.witness_changes = (answered.report.changes ?? []).slice(0, 20);
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
 * The foreground allowance's negative check: inside one span, the window just below the top is raised and the top
 * window raised back over it, so the stacking order ends as it began. Judged as a foreground request whose target is the
 * top window, the span must fail on the stacking order: the witness judges each of its changes, not the orders before
 * and after. Returns whether it did.
 */
export async function foregroundNegativeCheck(witness, emit) {
  const order = stacking();
  if (order.length < 2) {
    emit({ kind: 'stub-check-foreground', witness_failed_it: false, why: 'fewer than two windows to restack' });
    process.stdout.write('foreground negative check: fewer than two windows to restack\n');
    return false;
  }
  const [other, target] = order.slice(-2);
  const raise = (w) => execFileSync('xdotool', ['windowraise', String(w)]);
  const { report } = await witness.span('stub:foreground', async () => {
    raise(other);
    await sleep(50);
    raise(target);
    await sleep(50);
  });
  const judged = judgeForegroundSpan(report, { target, focusWithin: (w) => within(w, target) });
  const restored = stacking().join() === order.join();
  const failedIt = judged.fields.includes('stacking');
  emit({ kind: 'stub-check-foreground', target, raised: other, restored, witness: judged, changes: (report.changes ?? []).slice(0, 10), witness_failed_it: failedIt });
  process.stdout.write(`foreground negative check: the allowance ${failedIt ? 'failed' : 'PASSED'} another window raised and the order restored (${judged.fields.join(', ') || 'no violation'}; order ${restored ? 'restored' : 'not restored'})\n`);
  return failedIt;
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
  if (scene === 'gnome-text-editor') return resolveField(desktop, await desktop.openFamilyScene('gnome-text-editor', role), scene);
  if (FAMILY_OF[scene]) return desktop.openFamilyScene(FAMILY_OF[scene], role);
  const opened = await desktop.openChrome(role, PAGE_OF[scene], { stem: scene === 'retention' ? 'retention' : undefined });
  if (scene === 'chrome-input') opened.elements = await desktop.elementsByName(opened, INPUT_ELEMENTS);
  return opened;
}

/** The engine a candidate runs an operation with: its flags plus the operation's own (M2: `--desktop dedicated`). */
export function engineSpecFor(spec, op, scene) {
  if (VENDORS.includes(spec.label) || !OPS[op].cuaArgs) return spec;
  return { ...spec, args: [...spec.args, ...OPS[op].cuaArgs(scene)] };
}

/** Whether an engine runs an operation: a candidate-only operation (`cuaOnly`) is not sent to the vendor builds. */
export const runsOp = (label, op) => !(OPS[op].cuaOnly && VENDORS.includes(label));

export async function runDiff(args) {
  const run = args.run ?? `run-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`;
  mkdirSync(args.out, { recursive: true });
  const results = join(args.out, 'results.jsonl');
  const emit = (row) => appendFileSync(results, `${JSON.stringify({ run, ...row })}\n`);
  if (!existsSync(XPROBE)) throw new Error(`build the harness's X client first: cargo build --release --manifest-path ${join(here, 'xprobe', 'Cargo.toml')}`);
  const via = args.via ?? 'wire';

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
      if (ops.some((op) => ownWindow(op) && !isText(op))) {
        for (const label of labels) windows[scene].own[label] = await open(label.replace(/[^a-z0-9]+/gi, '_'));
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
    const foregroundPlanned = plan.some((p) => (isText(p.op) && expectedRoute(p.op, p.scene) === 'foreground') || p.op === 'restore_refused');
    if (foregroundPlanned && !(await foregroundNegativeCheck(witness, emit))) valid = false;

    for (let block = 0; block < args.blocks; block++) {
      for (const { scene: sceneName, op } of blockPlan) {
        for (const label of blockOrder(labels, block).filter((l) => runsOp(l, op))) {
          const spec = engineSpecFor(engines.find((e) => e.label === label), op, sceneName);
          const target = measuredTarget(windows, sceneName, op, label);
          if (target && args.occlusion === 'visible') desktop.raise(target);
          const engine = makeEngine(spec, OPS[op].apps ? launch.env : undefined);
          const n = 1 + samplesFor(op);
          for (let i = 0; i < n; i++) {
            const { row, response } = await runSample({ desktop, witness: targeted(op) ? witness : null, engine, target, op, i, block, label, sceneName });
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
            for (let i = 0; i < 2; i++) oks.push((await runSample({ desktop, witness: null, engine, target, op, i, block: 'audit', label: spec.label, sceneName })).row.ok);
          } finally {
            await engine.close();
            if (ownWindow(op)) target.retainedBy = null;
            if (OPS[op].reset) await OPS[op].reset({ desktop, scene: target, cua: args.cua });
          }
          const audited = auditRequests(parseXtrace(await proxy.stop()));
          // the judge compares these answers with the timed pass's: an operation that failed early is not audited
          audits[`${sceneName}|${op}|${spec.label}`] = { clean: audited.clean, oks };
          emit({ kind: 'audit', engine: spec.label, scene: sceneName, op, ok: oks.every(Boolean), oks, clean: audited.clean, traced: audited.traced, requests: audited.requests, forbidden: audited.forbidden.slice(0, 10) });
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
    for (const { scene: sceneName, op } of blockPlan) {
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
        const foreground = expectedRoute(op, sceneName) === 'foreground';
        const opAudits = args.audit && targeted(op) && !foreground ? Object.fromEntries(labels.map((l) => [l, audits[`${sceneName}|${op}|${l}`]])) : null;
        const parity = ['cold', 'warm'].map((series) => declaredParity({ op, scene: sceneName, series })).filter(Boolean);
        const verdict = judgeOperation(opRows.filter((r) => [...VENDORS, candidate].includes(r.engine)), { vendors: VENDORS, candidate, audits: opAudits, judgeSpeed: via === 'wire', text: isText(op), noise: medianDifferenceInterval, parity });
        const extra = {};
        if (routes.length) extra.routes = routes;
        if (isText(op) && expectedRoute(op, sceneName)) extra.route_expected = expectedRoute(op, sceneName);
        if (foreground) extra.audit_note = 'foreground route: the activation and the desktop input are the route itself; judged by the witness allowance';
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
    emit({ kind: 'end', valid: outcome.valid, pass: outcome.pass, failed: outcome.failed, parity: outcome.parity, finished: new Date().toISOString() });
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
