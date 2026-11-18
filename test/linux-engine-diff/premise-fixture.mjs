// Ruling 823's samples made through the real paths, display-free: each premise case's own read (device.mjs
// `dropStatus`, through drag.mjs's parser) of a page tree carrying the drag page's status lines as pages/drag.html
// writes them, the case's own check (its reads through a scripted engine), and its evidence record, on its row and in
// the run's `premise-evidence.jsonl`. A whole V5 step is made from V5's own command as the gate prints it (gate.mjs
// `launchCommand`), read back through the harness's own parser (cli.mjs `parseArgs`) by a stand-in for the sitting
// (`v5Runner`), which lays the step's directory out as the sitting and the runner leave it (step.json, run/results.jsonl,
// the sidecar, all-clear.json), so premise-refill.mjs reads it as it reads a real step's.
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { DEVICE_OPS, PREMISE_OPS, dndCancelledSentence, dndLateNotice, dndLateRefusal, dndMayHaveDroppedSentence, judgeDevice } from '../../scripts/linux-engine-diff/device.mjs';
import { SCENE_OPS } from '../../scripts/linux-engine-diff/ops.mjs';
import { launchCommand, parseGateArgs, stepDir } from '../../scripts/linux-engine-gate/gate.mjs';
import { runName, stepNamed } from '../../scripts/linux-engine-gate/steps.mjs';

export const APP = 'Google-chrome';
export const SCENE = 'device-chrome-dnd';
export const WINDOW = 25165890;
export const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
export const cancelled = dndCancelledSentence(APP);

/** A scratch directory of the test's own. */
const made = [];
export const scratch = (name) => {
  // a short root, as a :0 step's out is: a refill run's decoy buses lie under it (gate.mjs `zeroStepProblems`), and macOS's
  // own temporary directory is too long for them
  const dir = mkdtempSync(join(tmpdir().length <= 32 ? tmpdir() : '/tmp', `p-${name.replace(/\W+/g, '-').slice(0, 12)}-`));
  made.push(dir);
  return dir;
};
/** Every scratch directory the file's tests made, removed (`after`): the suite's cleanup check finds none left. */
export const removeScratch = () => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
};

/** A stand-in engine binary, its bytes the run's "engine". */
export function engineBin(dir, bytes = 'cua-engine 0.4.1 stand-in') {
  const bin = join(dir, `engine-${createHash('sha256').update(bytes).digest('hex').slice(0, 8)}`);
  writeFileSync(bin, bytes);
  return bin;
}
export const shaOf = (bin) => createHash('sha256').update(readFileSync(bin)).digest('hex');

/** A run's fixture label as scenes.mjs `label` gives one: the run's name, its Desktop's nonce, then the parts. */
export const labelOf = (run, nonce) => `cua171-diff-${run}-${nonce}-device_cua`;
const newNonce = () => randomBytes(4).toString('hex');

// the page's status lines, as pages/drag.html writes them (`showDnd`, `showLog`)
const dndLine = (c) => `dnd starts ${c.starts} drops ${c.drops} downs ${c.downs} detail 1 gap -1 selects 0 ends ${c.ends} effect -1 lat -1 dur -1 ups ${c.ups} at ${c.at}`;
const at = (t) => `${t.toFixed(1)}/${(t + 0.4).toFixed(1)}`;
const movesLine = (seq, { start = -1, up = -1, cancel = -1, end = -1, moves = [[0, 0, 0, 1, 1], [95, 194, 12, 1, 1]] } = {}) =>
  `moves seq ${seq} n ${moves.length} start ${start === -1 ? -1 : at(start)} up ${up === -1 ? -1 : at(up)} cancel ${cancel === -1 ? -1 : at(cancel)} end ${end === -1 ? -1 : at(end)} m${moves.map(([t, dx, dy, b, c]) => ` ${at(t)}/${dx}/${dy}/${b}/${c}`).join('')}`;

/**
 * The page after a sample, from the page before it (`{starts, drops, downs, ends, ups}`) and the press time: `plain` a
 * press the page saw released (no drag session), `took` a press Chrome turned into a drag and drop, `landed` one that
 * dropped on the zone, or a function of `(before, at)` answering the lines itself.
 */
export const PAGES = {
  plain: (b, t) => ({ counts: { ...b, downs: b.downs + 1, ups: b.ups + 1, at: t }, moves: movesLine(b.downs + 1, { up: 158 }) }),
  took: (b, t) => ({ counts: { ...b, starts: b.starts + 1, ends: b.ends + 1, downs: b.downs + 1, at: t }, moves: movesLine(b.downs + 1, { start: 0, cancel: 95, end: 165 }) }),
  landed: (b, t) => ({ counts: { ...b, starts: b.starts + 1, ends: b.ends + 1, drops: b.drops + 1, downs: b.downs + 1, at: t }, moves: movesLine(b.downs + 1, { start: 0, cancel: 95, end: 165 }) }),
};
export { dndLine, movesLine };

/** A page tree as cua reads it: Chrome's frame titled with the scene's label, the page's status paragraphs. */
const tree = (label, lines) => ({ role: 'frame', name: `${label} - Google Chrome`, children: lines.map((name) => ({ role: 'paragraph', name })) });

/** An engine stand-in: its binary, and the answers its scripted reads give (by command), each with its request id. */
export function scriptedEngine(bin, answers = {}) {
  let next = 1000;
  return {
    bin,
    nextId: () => next++,
    async request(command) {
      const id = next++;
      const response = { id, ok: true, ...(answers[command] ?? {}) };
      return { id, response, stats: null };
    },
  };
}

/**
 * One sample of a premise case through its own read and check: the page before (`base` counts), the request answered
 * (`reply`), the page after (`page`, a PAGES key or a function, or `lines` to give the status lines outright), and the
 * row as run.mjs keeps it. `engine` is the sample's engine (one per series or audit lifecycle); `label` the run's fixture.
 */
export async function sample({ out, run, op, block, i, engine, reply = { ok: true }, page = 'plain', lines = null, base, label, row = {}, window = WINDOW, titled = true }) {
  let current = [dndLine({ ...base, at: 0 }), movesLine(base.downs, { start: 0, cancel: 90, end: 160 })];
  const desktop = { run, logs: join(out, 'apps'), state: async () => ({ ax_tree: tree(titled ? label : 'another page', current) }) };
  const scene = { id: window, label, app: APP, dndAt: { page: true }, lastRequest: { op, block, i } };
  const ctx = { desktop, scene, sceneName: SCENE, engine, i, dispose: () => {} };
  ctx.before = await DEVICE_OPS[op].read(ctx);
  // the request: the press lands now
  await new Promise((r) => setTimeout(r, 2));
  const pressed = Date.now() % 1e9;
  if (lines) current = lines(base, pressed);
  else {
    const after = (typeof page === 'function' ? page : PAGES[page])(base, pressed);
    current = [dndLine(after.counts), after.moves];
  }
  const response = { id: engine.nextId(), ok: reply.ok, ...(reply.ok ? {} : { error: reply.error }), ...(reply.notice ? { notice: reply.notice } : {}) };
  const checked = await DEVICE_OPS[op].check(ctx, response);
  return { run, kind: 'sample', engine: 'cua', scene: SCENE, op, block, i, series: i === 0 ? 'cold' : 'warm', ok: response.ok, ...(response.ok ? {} : { error: response.error }), witness: true, ...checked, ...row };
}

/** Counts far apart per sample, so no two samples' pages are alike. */
export const baseFor = (k) => ({ starts: 10 * k, drops: 0, downs: 10 * k, ends: 10 * k, ups: 0 });

/**
 * A run's samples of one case: `blocks` of `[spec, ...]` (each spec a sample's fields), every block on its own engine;
 * and its audit's `[spec, ...]` on one more, all on the run's one fixture (`nonce`, the run's Desktop's). Made in
 * parallel (each check waits its quiet time). Answers the timed rows, the audit row's answered entries, and the label.
 */
export async function caseSamples({ out, run, op, bin, blocks, audit = [], offset = 0, answers = {}, nonce = newNonce() }) {
  const label = labelOf(run, nonce);
  let k = offset;
  const jobs = [];
  blocks.forEach((specs, b) => {
    const engine = scriptedEngine(bin, answers);
    specs.forEach((spec, i) => jobs.push(sample({ out, run, op, block: b, i, engine, base: baseFor(k++), label, ...spec })));
  });
  const auditEngine = scriptedEngine(bin, answers);
  const auditJobs = audit.map((spec, i) => sample({ out, run, op, block: 'audit', i, engine: auditEngine, base: baseFor(k++), label, ...spec }));
  const rows = await Promise.all(jobs);
  const audited = await Promise.all(auditJobs);
  return { rows, label, answered: audited.map((r) => ({ ok: r.ok, error: r.error ?? null, expected_error: r.expected_error ?? null, late_error: r.late_error ?? null })) };
}

const took = (dnd) => ({ dnd: { outcome: 'in_time', started: true, in_front: false, held_at_start: false, ...dnd } });
/** A cancelled sample, as Chrome took the drag in time: the cancel's sentence. */
export const CANCEL = { reply: { ok: false, error: cancelled }, page: 'took', row: took() };
/** The obscured cancel case's: the engine watched the drag with the signature already held, not in front. */
export const HELD_CANCEL = { ...CANCEL, row: took({ held_at_start: true }) };
/** A late cancel, honestly answered that the drop may have happened. */
export const LATE = { reply: { ok: false, error: dndMayHaveDroppedSentence(APP) }, page: 'took', row: took() };
export const HELD_LATE = { ...LATE, row: took({ held_at_start: true }) };
/** The late take: a plain drag at the release whose drop landed, the witness showing it. */
export const LANDED = { reply: { ok: true }, page: 'landed', row: { witness: false, dnd: { outcome: 'no_start', started: false, in_front: false, held_at_start: false } } };
/** The late take's reads: the read carries the late notice, the next acting request is refused with it. */
export const LATE_TAKE_ANSWERS = { list_windows: { notice: dndLateNotice(APP) }, move: { ok: false, error: dndLateRefusal(APP, 'move') } };
/** A plain-drag ok Chrome never started a drag session for: the unmet premise. */
export const UNMET = { reply: { ok: true }, page: 'plain', row: { dnd: { outcome: 'no_start', started: false, in_front: false, held_at_start: false }, press: { taken: false } } };
/** The obscured cases' unmet premise, the engine's guard held as it should be. */
export const HELD_UNMET = { ...UNMET, row: { ...UNMET.row, dnd: { ...UNMET.row.dnd, held_at_start: true } } };
export { dndLateRefusal };

/** Each premise cell as a whole V5 run passes it: its block's samples, its audit's, and its engine's answers. */
export const GOOD = {
  chrome_dnd_shared: { block: [CANCEL, CANCEL, CANCEL], audit: [CANCEL, CANCEL] },
  chrome_dnd_obscured_in_front_shared: { block: [HELD_CANCEL, HELD_CANCEL, HELD_CANCEL], audit: [CANCEL, CANCEL] },
  chrome_dnd_late_shared: { block: [LATE, LATE, LATE], audit: [LATE, LATE] },
  chrome_dnd_obscured_in_front_late_shared: { block: [HELD_LATE, HELD_LATE, HELD_LATE], audit: [LATE, LATE] },
  chrome_dnd_late_take_shared: { block: [LANDED, LANDED, LANDED], audit: [LANDED, LANDED], answers: LATE_TAKE_ANSWERS },
};

// ---------------------------------------------------------------------------------------------------------------
// a whole V5 step, from V5's own command

/**
 * V5's step as the gate prints it on the pinned release: a run home whose engine is the stand-in's bytes, the out
 * root, V5's labelled directory (`stepDir`), its command (`launchCommand`, the sitting's form) and its run name. The
 * step's directory and step.json are written as `gate.mjs print` writes them.
 */
export function v5Step(name, { bytes = 'cua-engine 0.4.1 stand-in' } = {}) {
  const root = scratch(name);
  const home = join(root, 'home');
  const bin = join(home, 'engine', 'linux', 'cua-engine');
  mkdirSync(dirname(bin), { recursive: true });
  writeFileSync(bin, bytes);
  const a = parseGateArgs(['print', 'V5', '--pinned', home, '--out', join(root, 'out')]);
  const step = stepNamed('V5');
  const dir = stepDir(step, a);
  const command = launchCommand(step, a);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'step.json'), `${JSON.stringify({ label: 'acceptance on the pinned release', step: 'V5', display: step.display, run_name: runName(step, a), command }, null, 2)}\n`);
  return { root, home, bin, dir, command, argv: command.split(' '), run: runName(step, a) };
}

/** The plan a run's arguments make: each scene's operations among `--ops`, as the meta row lists them. */
const planOf = (args) => args.scenes.flatMap((scene) => (SCENE_OPS[scene] ?? []).filter((op) => args.ops.includes(op)).map((op) => ({ scene, op })));

/**
 * The sitting's stand-in: `launch(argv)` reads a V5 command as the sitting and run71.sh take it (the sitting's `--dir`,
 * run71.sh's out, the harness's arguments through the harness's own parser), refuses an out whose `run/` exists as
 * run71.sh does, and writes the run: its meta row (the head, engine bytes and load `spec(n)` names, the main run's by
 * default), each premise cell's samples through the real paths (`spec(n).cells[op]`, else `GOOD`'s), every other cell's
 * verdict (failing those `spec(n).failing` names), the end row and the all-clear, answering the sitting's exit. Call `n`
 * is 0 for the first command it runs. `spec(n)` may also give `run` (the run name loaded), `exit` (the launcher's),
 * `end: false` (no end row), `valid`, `clear`, `unclean`, `meta(meta)` to change the meta row, and `after(dir)`.
 */
export function v5Runner(spec = () => ({})) {
  const calls = [];
  const launch = async (argv) => {
    const n = calls.length;
    calls.push(argv);
    const s = { head: HEAD, failing: [], cells: {}, ...spec(n) };
    const dir = argv[argv.indexOf('--dir') + 1];
    const rest = argv.slice(argv.indexOf('--') + 1);
    const r71 = rest.findIndex((x) => x.endsWith('/run71.sh'));
    if (rest[r71 + 1] !== dir) throw new Error(`the sitting's directory ${dir} is not run71.sh's ${rest[r71 + 1]}`);
    if (existsSync(join(dir, 'run'))) return 2;
    const args = parseArgs([...rest.slice(r71 + 3), '--out', join(dir, 'run')]);
    const run = s.run ?? args.run;
    const out = join(dir, 'run');
    mkdirSync(out, { recursive: true });
    const engine = s.engine ?? args.cua;
    const plan = planOf(args);
    const meta = { run, kind: 'meta', commit: s.head, gate: args.gate, engines: [{ label: 'cua', args: [], sha256: shaOf(engine) }], scenes: args.scenes, ops: plan.map((p) => `${p.scene}:${p.op}`), blocks: args.blocks, samples_tree: args.samplesTree, samples_input: args.samplesInput, occlusion: args.occlusion, ...(args.ballast ? { ballast: args.ballast } : {}) };
    s.meta?.(meta);
    const results = join(out, 'results.jsonl');
    writeFileSync(results, `${JSON.stringify(meta)}\n`);
    const nonce = newNonce();
    const names = [];
    let k = 0;
    for (const { scene, op } of plan) {
      if (scene !== SCENE || !PREMISE_OPS.has(op)) {
        const name = `${scene} ${op} cua`;
        const pass = !s.failing.includes(name);
        appendFileSync(results, `${JSON.stringify({ run, kind: 'verdict', scene, op, candidate: 'cua', pass, reasons: pass ? [] : ['a stand-in failure'], verdict: pass ? 'pass' : 'fail' })}\n`);
        if (!pass) names.push(name);
        continue;
      }
      const cell = { ...GOOD[op], ...s.cells[op] };
      const blocks = Array.from({ length: args.blocks }, (_, b) => cell.blocks?.[b] ?? cell.block);
      const { rows, answered } = await caseSamples({ out, run, op, bin: engine, blocks, audit: args.audit ? cell.audit : [], offset: 1000 * n + 100 * k++, answers: cell.answers ?? {}, nonce });
      for (const r of rows) appendFileSync(results, `${JSON.stringify(r)}\n`);
      const audit = { clean: true, kind: 'background', answered, forbidden: [] };
      if (answered.length) appendFileSync(results, `${JSON.stringify({ run, kind: 'audit', engine: 'cua', scene, op, ok: answered.every((a) => a.ok), oks: answered.map((a) => a.ok), answered, clean: true, traced: true, requests: 100, audit: 'background', forbidden: [], foreign: [], ancestry: [WINDOW, 6217945] })}\n`);
      const judged = judgeDevice(op, rows, args.audit ? audit : null);
      appendFileSync(results, `${JSON.stringify({ run, kind: 'verdict', scene, op, candidate: 'cua', device: DEVICE_OPS[op].device, ...judged, verdict: judged.pass ? 'pass' : 'fail' })}\n`);
      if (!judged.pass) names.push(`${scene} ${op} cua`);
    }
    const valid = s.valid ?? true;
    const pass = names.length === 0;
    if (s.end !== false) appendFileSync(results, `${JSON.stringify({ run, kind: 'end', gate: args.gate, valid, pass, failed: names, desktop: { unclean: s.unclean ?? [] } })}\n`);
    const exit = valid && pass ? 0 : 1;
    writeFileSync(join(dir, 'all-clear.json'), `${JSON.stringify({ finished: new Date().toISOString(), exit, clear: s.clear ?? true, person: s.clear === false ? ['a stand-in reach'] : [], run: s.unclean ?? [] }, null, 2)}\n`);
    s.after?.(dir);
    return s.exit ?? exit;
  };
  return { launch, calls };
}
