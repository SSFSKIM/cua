// Ruling 823's samples made through the real paths, display-free: each premise case's own read (device.mjs
// `dropStatus`, through drag.mjs's parser) of a page tree carrying the drag page's status lines as pages/drag.html
// writes them, the case's own check (its reads through a scripted engine), and its evidence record, on its row and in
// the run's `premise-evidence.jsonl`. A run's directory is laid out as the gate leaves it (step.json, run/results.jsonl,
// the sidecar), so premise-refill.mjs reads it as it reads a real step's.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEVICE_OPS, dndCancelledSentence, dndLateRefusal, judgeDevice } from '../../scripts/linux-engine-diff/device.mjs';

export const APP = 'Google-chrome';
export const SCENE = 'device-chrome-dnd';
export const WINDOW = 25165890;
export const HEAD = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
export const cancelled = dndCancelledSentence(APP);

/** A scratch directory of the test's own. */
const made = [];
export const scratch = (name) => {
  const dir = mkdtempSync(join(tmpdir(), `premise-${name}-`));
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

// the page's status lines, as pages/drag.html writes them (`showDnd`, `showLog`)
const dndLine = (c) => `dnd starts ${c.starts} drops ${c.drops} downs ${c.downs} detail 1 gap -1 selects 0 ends ${c.ends} effect -1 lat -1 dur -1 ups ${c.ups} at ${c.at}`;
const at = (t) => `${t.toFixed(1)}/${(t + 0.4).toFixed(1)}`;
const movesLine = (seq, { start = -1, up = -1, cancel = -1, end = -1, moves = [[0, 0, 0, 1, 1], [95, 194, 12, 1, 1]] } = {}) =>
  `moves seq ${seq} n ${moves.length} start ${start === -1 ? -1 : at(start)} up ${up === -1 ? -1 : at(up)} cancel ${cancel === -1 ? -1 : at(cancel)} end ${end === -1 ? -1 : at(end)} m${moves.map(([t, dx, dy, b, c]) => ` ${at(t)}/${dx}/${dy}/${b}/${c}`).join('')}`;

/**
 * The page after a sample, from the page before it (`{starts, drops, downs, ends, ups}`) and the press time: `plain` a
 * press the page saw released (no drag session), `took` a press Chrome turned into a drag and drop, or a function of
 * `(before, at)` answering the lines itself.
 */
export const PAGES = {
  plain: (b, t) => ({ counts: { ...b, downs: b.downs + 1, ups: b.ups + 1, at: t }, moves: movesLine(b.downs + 1, { up: 158 }) }),
  took: (b, t) => ({ counts: { ...b, starts: b.starts + 1, ends: b.ends + 1, downs: b.downs + 1, at: t }, moves: movesLine(b.downs + 1, { start: 0, cancel: 95, end: 165 }) }),
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
 * row as run.mjs keeps it. `engine` is the sample's engine (one per series or audit lifecycle).
 */
export async function sample({ out, run, op, block, i, engine, reply = { ok: true }, page = 'plain', lines = null, base, label = `cua171-diff-${run}-device_cua`, row = {}, window = WINDOW, titled = true }) {
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
 * and its audit's `[spec, ...]` on one more. Made in parallel (each check waits its quiet time). Answers the timed rows,
 * the audit row's answered entries, and the engines.
 */
export async function caseSamples({ out, run, op, bin, blocks, audit = [], offset = 0, answers = {} }) {
  let k = offset;
  const jobs = [];
  blocks.forEach((specs, b) => {
    const engine = scriptedEngine(bin, answers);
    specs.forEach((spec, i) => jobs.push(sample({ out, run, op, block: b, i, engine, base: baseFor(k++), ...spec })));
  });
  const auditEngine = scriptedEngine(bin, answers);
  const auditJobs = audit.map((spec, i) => sample({ out, run, op, block: 'audit', i, engine: auditEngine, base: baseFor(k++), ...spec }));
  const rows = await Promise.all(jobs);
  const audited = await Promise.all(auditJobs);
  return { rows, answered: audited.map((r) => ({ ok: r.ok, error: r.error ?? null, expected_error: r.expected_error ?? null, late_error: r.late_error ?? null })) };
}

/** A cancelled sample, as Chrome took the drag in time: the cancel's sentence. */
export const CANCEL = { reply: { ok: false, error: cancelled }, page: 'took', row: { dnd: { outcome: 'in_time', started: true, in_front: false, held_at_start: false } } };
/** A plain-drag ok Chrome never started a drag session for: the unmet premise. */
export const UNMET = { reply: { ok: true }, page: 'plain', row: { dnd: { outcome: 'no_start', started: false, in_front: false, held_at_start: false }, press: { taken: false } } };
export { dndLateRefusal };

/**
 * A step directory begun as run.mjs begins one: its meta row first (its head, engine bytes and load), and step.json (its
 * command, in the sitting's form). Answers the run's out directory.
 */
export function startRun({ dir, run, bin, ballast = 'gate', head = HEAD, ops, command = null }) {
  const out = join(dir, 'run');
  mkdirSync(out, { recursive: true });
  const meta = { run, kind: 'meta', commit: head, engines: [{ label: 'cua', args: [], sha256: shaOf(bin) }], ballast, occlusion: 'covered', scenes: [SCENE], ops: ops.map((op) => `${SCENE}:${op}`) };
  writeFileSync(join(out, 'results.jsonl'), `${JSON.stringify(meta)}\n`);
  const step = { step: 'V5', run_name: run, load: 'idle', command: command ?? `/locked.sh t5 /usr/bin/node /c/scripts/linux-engine-gate/sitting.mjs --dir ${dir} --hold /h/hold-sittings --terminal end -- env WRAP=/c/wrap71.py /c/run71.sh ${dir} /c/ --cua ${bin} --scene ${SCENE},identity --ops ${ops.join(',')},identity_apart --blocks 3 --run ${run} --ballast ${ballast} --pinned` };
  writeFileSync(join(dir, 'step.json'), JSON.stringify(step, null, 2));
  return out;
}

/**
 * The step finished as run.mjs and the sitting finish one: each case's rows, its audit row, its verdict by the real
 * judge (in this process, as in the run's), the end row (`failed` adds other failures), and the all-clear.
 */
export function finishRun({ dir, run, cases, failed = [], valid = true, clear = true }) {
  const results = join(dir, 'run', 'results.jsonl');
  const verdicts = [];
  for (const c of cases) {
    for (const r of c.rows) appendFileSync(results, `${JSON.stringify(r)}\n`);
    if (c.answered.length) {
      const auditRow = { run, kind: 'audit', engine: 'cua', scene: SCENE, op: c.op, ok: c.answered.every((a) => a.ok), oks: c.answered.map((a) => a.ok), answered: c.answered, clean: c.clean ?? true, traced: true, requests: 100, audit: 'background', forbidden: c.forbidden ?? [], foreign: [], ancestry: [WINDOW, 6217945] };
      appendFileSync(results, `${JSON.stringify(auditRow)}\n`);
    }
    const judged = judgeDevice(c.op, c.rows, { clean: c.clean ?? true, kind: 'background', answered: c.answered, forbidden: c.forbidden ?? [] });
    const v = { run, kind: 'verdict', scene: SCENE, op: c.op, candidate: 'cua', device: DEVICE_OPS[c.op].device, ...judged, verdict: judged.pass ? 'pass' : 'fail' };
    verdicts.push(v);
    appendFileSync(results, `${JSON.stringify(v)}\n`);
  }
  const names = [...verdicts.filter((v) => !v.pass).map((v) => `${v.scene} ${v.op} ${v.candidate}`), ...failed];
  appendFileSync(results, `${JSON.stringify({ run, kind: 'end', valid, pass: names.length === 0, failed: names })}\n`);
  writeFileSync(join(dir, 'all-clear.json'), JSON.stringify({ clear, run: [], person: [] }));
  return verdicts;
}
