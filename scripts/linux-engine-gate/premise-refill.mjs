// V5's refill of ruling 823's unmet premise (the design session's rulings 823, 825 and 836; the controller's route C).
// Each V5 run, the main one and each whole rerun, is judged alone, on its own rows and the evidence its samples recorded
// (`run/premise-evidence.jsonl`): device.mjs's own judge, its exclusions counted inside the run. Nothing is pooled
// across runs.
//
// A run's premise cells are its plan's (meta.ops), never the ones it happened to record. Each cell's slots are checked
// against the plan: every planned timed sample (block, request) and audited request exactly once, every evidence line
// bound to its slot, its run and its fixture. A cell is
// - `pass`: its recorded verdict and its replay here both pass;
// - `short`: both fail, and solely for its shortage, a quota left short by samples proven premise-unmet (premise.mjs),
//   with the existence conditions that no judged sample was left to test reading untested;
// - `fail`: anything else, which is final.
// A run passes when it has no failure and no short cell. Its failures are everything else it recorded: its terminal
// failures beyond its premise cells' own verdicts, a missing or invalid terminal record or one its launcher's exit
// disagrees with, a sitting that is not all-clear, a plan without a premise cell, slots or evidence that do not fit.
// A run's unclean end (what it left on its own side) is listed, and fails nothing (ruling 730 (a)).
//
// When the main run's only failures are short cells, V5 is rerun whole: its own command from step.json, as the gate
// printed it, unchanged but for the step's directory, under a fresh out root (`<out>.r<n>`), at the main run's head,
// engine bytes, load and plan (checked by positive equality). At most `MAX_REFILL_RUNS` reruns. A rerun that passes alone
// passes V5; one short again for the same reason only may be followed by the next; one with any other failure fails V5,
// and so does a shortage left after the last. With any other failure in the main run no rerun is launched, and the
// record names every one.
//
// The record, in the main step's directory: premise-refill.jsonl (each run with its own verdict, its failures, its
// unclean end, and per premise cell its status and its counts, cold and warm, judged and excluded, and the audit's; then
// the end, V5's verdict) and premise.md, every run side by side. The exit status is V5's final status.
//
//   node scripts/linux-engine-gate/premise-refill.mjs <V5 step dir> [--print]
//
// `--print` prints the whole-V5 command it would launch next, in `gate.mjs print`'s form, or that there is none, and
// launches and writes nothing; it exits 1 when the step needs a rerun that cannot be launched.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { resolvedAsRun71, zeroStepProblems } from './gate.mjs';
import { DEVICE_OPS, PREMISE_OPS, judgeDevice } from '../linux-engine-diff/device.mjs';
import { TIMED_QUOTAS, bindAudit, bindTimed, evidenceLabel, hasReply, judgePremise } from '../linux-engine-diff/premise.mjs';

/** The whole reruns of V5 a shortage may be answered by (the controller's route C). */
export const MAX_REFILL_RUNS = 2;
/** The scene of every premise cell, and a premise cell's name in a run's terminal failures. */
const SCENE = 'device-chrome-dnd';
const cellName = (op) => `${SCENE} ${op} cua`;
/** A premise cell's reasons that are its shortage: an incomplete quota, an untested existence condition, the provisional mark. */
const SHORTAGE = [/^(incomplete|the \w+ audit is incomplete): Chrome never started a drag and drop/, /^untested: every sample was excluded for its unmet premise/, /^provisional:/];
const isShortage = (reason) => SHORTAGE.some((re) => re.test(reason));
/** The audited requests each lifecycle-free audit plans (run.mjs's audit pass: two samples of each operation). */
const AUDIT_SAMPLES = 2;
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;

const readJsonl = (file) => {
  const bytes = readFileSync(file);
  return (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
};
const first = (dir, names) => names.map((n) => join(dir, n)).find(existsSync) ?? null;
const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A step's directory as the gate and the sitting leave it: its step record, rows, evidence (null with none), meta, ends and all-clear. */
export function loadStep(dir) {
  const results = first(dir, ['run/results.jsonl', 'run/results.jsonl.gz']);
  const rows = results ? readJsonl(results) : [];
  const sidecar = first(dir, ['run/premise-evidence.jsonl', 'run/premise-evidence.jsonl.gz']);
  const meta = rows.find((r) => r.kind === 'meta') ?? null;
  const step = readJson(join(dir, 'step.json'));
  const allClear = readJson(join(dir, 'all-clear.json'));
  return { dir, step, rows, lines: sidecar ? readJsonl(sidecar) : null, meta, run: meta?.run ?? null, ends: rows.filter((r) => r.kind === 'end'), allClear, exit: allClear?.exit ?? step?.exit ?? null };
}

const cuaOf = (meta) => meta?.engines?.find((e) => e.label === 'cua') ?? null;
const loadOf = (meta) => ({ ballast: meta?.ballast ?? null, occlusion: meta?.occlusion ?? null });

/**
 * Whether a rerun matches the main run (ruling 825), by positive equality of what each meta records: the head, the
 * engine's bytes and arguments, the load (ballast, occlusion) and the plan (operations, scenes, blocks, gate). A field
 * missing or empty on either side fails: two runs that record nothing never match. Answers the problems.
 */
export function matchProblems(main, refill) {
  const a = main.meta ?? {};
  const b = refill.meta ?? {};
  if (!refill.meta) return ['it recorded no meta row'];
  const problems = [];
  const show = (v) => (v === undefined ? 'none' : JSON.stringify(v));
  const check = (what, get, valid) => {
    const [x, y] = [get(a), get(b)];
    if (!valid(x) || !valid(y)) problems.push(`no ${what} recorded on both runs (main ${show(x)}, refill ${show(y)})`);
    else if (!same(x, y)) problems.push(`another ${what} (${show(y)} against ${show(x)})`);
  };
  const text = (v) => typeof v === 'string' && v !== '';
  const list = (v) => Array.isArray(v) && v.length > 0 && v.every(text);
  check('head', (m) => m.commit, (v) => HEX40.test(v ?? ''));
  check('engine sha256', (m) => cuaOf(m)?.sha256, (v) => HEX64.test(v ?? ''));
  check('engine arguments', (m) => cuaOf(m)?.args, (v) => Array.isArray(v) && v.every(text));
  check('ballast', (m) => m.ballast, text);
  check('occlusion', (m) => m.occlusion, text);
  check('plan', (m) => m.ops, list);
  check('plan scenes', (m) => m.scenes, list);
  check('plan blocks', (m) => m.blocks, (v) => Number.isInteger(v) && v > 0);
  check('gate label', (m) => m.gate, text);
  return problems;
}

/** The premise cells a run planned (its meta's `ops`), in PREMISE_OPS's order; a run planning none plans no V5. */
const plannedCells = (run) => [...PREMISE_OPS].filter((op) => (run.meta?.ops ?? []).includes(`${SCENE}:${op}`));
/** Whether the run's command audits (V5's always does; a command with `--no-audit` plans no audited request). */
const audits = (run) => !String(run.step?.command ?? '').split(' ').includes('--no-audit');
/** A planned cell's timed slots: each block's series, its cold request then its warm ones (run.mjs's blocks). */
const timedSlots = (run, op) => Array.from({ length: Number.isInteger(run.meta?.blocks) ? run.meta.blocks : 0 }, (_, b) => Array.from({ length: 1 + (DEVICE_OPS[op].warmSamples ?? 0) }, (_, i) => `${b}/${i}`)).flat();
const samplesOf = (run, op) => run.rows.filter((r) => r.kind === 'sample' && r.engine === 'cua' && r.scene === SCENE && r.op === op);
const auditRowsOf = (run, op) => run.rows.filter((r) => r.kind === 'audit' && r.engine === 'cua' && r.scene === SCENE && r.op === op);
const verdictsOf = (run, op) => run.rows.filter((r) => r.kind === 'verdict' && r.scene === SCENE && r.op === op && r.candidate === 'cua');

/**
 * A run's own checks: its terminal record (one end row, valid), the exit its launcher answered (`exit`; the sitting's
 * recorded one must agree), its sitting's all-clear on `:0`, and its plan holding every premise cell. Answers
 * `{failures, premise, unclean}`: `premise` the premise cells' names among its terminal failures, which the cells' own
 * judgment settles; `failures` everything else, each final.
 */
export function runChecks(run, { exit = run.exit } = {}) {
  const failures = [];
  const premise = [];
  if (!run.meta) failures.push('no meta row');
  const end = run.ends.length === 1 ? run.ends[0] : null;
  if (!run.ends.length) failures.push('no terminal record (end row)');
  else if (run.ends.length > 1) failures.push(`${run.ends.length} terminal records`);
  if (end && end.valid !== true) failures.push('its run is not valid (the negative check did not hold)');
  // the launcher's exit, as its terminal record explains it: 0 a passing run, 1 a recorded failing one (run.mjs, wrap71.py)
  const failed = Array.isArray(end?.failed) ? end.failed : [];
  if (!Number.isInteger(exit)) failures.push('its exit is not recorded');
  else if (exit === 0 && end && !(end.valid === true && end.pass === true && failed.length === 0)) failures.push('exit 0, but its terminal record does not pass');
  else if (exit !== 0 && !(exit === 1 && end && end.valid === true && end.pass === false && failed.length > 0)) failures.push(`exit ${exit} is not explained by its terminal record`);
  if (run.step?.display === ':0') {
    if (!run.allClear) failures.push('no all-clear: the sitting did not make its end check');
    else {
      if (run.allClear.clear !== true) failures.push(`its sitting is not all-clear: ${(run.allClear.person ?? []).join('; ') || 'unshown'}`);
      if (Number.isInteger(exit) && run.allClear.exit !== exit) failures.push(`the sitting recorded exit ${run.allClear.exit}, its launcher answered ${exit}`);
    }
  }
  for (const op of PREMISE_OPS) if (!plannedCells(run).includes(op)) failures.push(`its plan has no premise cell ${SCENE}:${op}`);
  const names = new Set(plannedCells(run).map(cellName));
  for (const f of failed) (names.has(f) ? premise : failures).push(f);
  const unclean = run.allClear?.run ?? end?.desktop?.unclean ?? [];
  return { failures, premise, unclean };
}

/**
 * A planned cell's slots and evidence against the plan, nothing collapsed: each planned timed slot one sample row and no
 * row outside them; with the audit planned, one audit row of `AUDIT_SAMPLES` requests; and every sidecar line of the
 * cell premise evidence of this run's name, head, engine and load, on the cell's one fixture, with cua's reply whole,
 * for exactly one slot (a timed one whose row carries evidence, its line that evidence, or an audited request), each
 * such slot with exactly one line. Answers the problems.
 */
export function slotProblems(run, op) {
  const problems = [];
  const slots = timedSlots(run, op);
  const rows = samplesOf(run, op);
  const count = (list, key) => list.reduce((m, x) => m.set(key(x), (m.get(key(x)) ?? 0) + 1), new Map());
  const rowCount = count(rows, (r) => `${r.block}/${r.i}`);
  for (const s of slots) if ((rowCount.get(s) ?? 0) !== 1) problems.push(`${rowCount.get(s) ?? 0} sample rows for the planned ${s}`);
  for (const k of rowCount.keys()) if (!slots.includes(k)) problems.push(`a sample row for no planned slot (${k})`);
  const auditRows = auditRowsOf(run, op);
  const audited = audits(run);
  if (audited && auditRows.length !== 1) problems.push(`${auditRows.length} audit rows, the plan's 1`);
  if (!audited && auditRows.length) problems.push('an audit row the plan has none for');
  const answered = auditRows.length === 1 ? auditRows[0].answered ?? [] : [];
  if (audited && auditRows.length === 1 && answered.length !== AUDIT_SAMPLES) problems.push(`${answered.length} audited requests, the plan's ${AUDIT_SAMPLES}`);
  // the sidecar, every line of the cell's
  const withEvidence = rows.filter((r) => r.premise_evidence);
  if (run.lines == null) return withEvidence.length ? [...problems, "its samples carry evidence, but the run has no premise-evidence.jsonl"] : problems;
  const label = evidenceLabel(withEvidence);
  const expected = new Map(withEvidence.map((r) => [`${r.block}/${r.i}`, r.premise_evidence]));
  answered.forEach((_, i) => expected.set(`audit/${i}`, null));
  const lines = run.lines.filter((l) => l?.op === op);
  const seen = count(lines, (l) => `${l.block}/${l.i}`);
  for (const l of lines) {
    const where = `${l.block}/${l.i}'s line`;
    if (l.kind !== 'premise-evidence') problems.push(`${where}: not a premise-evidence record`);
    if (l.scene !== SCENE || l.run !== run.run) problems.push(`${where}: a line of another scene or run (${l.scene} ${l.run})`);
    if (l.head !== run.meta?.commit || l.engine_sha256 !== cuaOf(run.meta)?.sha256 || !same(l.load, loadOf(run.meta))) problems.push(`${where}: a line not of this run's head, engine or load`);
    if (!hasReply(l)) problems.push(`${where}: its line does not record the reply's ok, error and notice`);
    if (label == null) problems.push(`${where}: the cell's timed samples name no one fixture to bind it to`);
    else if (l.fixture?.label !== label) problems.push(`${where}: a line of another fixture (${l.fixture?.label ?? 'none'})`);
    const key = `${l.block}/${l.i}`;
    if (!expected.has(key)) problems.push(`${where}: a line for no sample or audited request of the run`);
    else if (expected.get(key) && !same(expected.get(key), l)) problems.push(`${where}: its line is not its row's evidence`);
  }
  for (const key of expected.keys()) if ((seen.get(key) ?? 0) !== 1) problems.push(`${seen.get(key) ?? 0} lines for ${key}`);
  return problems;
}

/** A run's sidecar lines of no premise cell it planned: each a problem of the run's. */
const strayLines = (run) => (run.lines ?? []).filter((l) => !plannedCells(run).includes(l?.op)).map((l) => `a sidecar line of no planned premise cell (${l?.op} ${l?.block}/${l?.i})`);

/** One planned cell's counts in one run: its timed samples, cold and warm, judged and excluded, and its audit's. */
function countsOf(rows, entries) {
  const timed = bindTimed(rows).rows;
  const tc = judgePremise(timed, { name: () => '', quotas: TIMED_QUOTAS }).classes;
  const ac = judgePremise(entries, { name: () => '' }).classes;
  const of = (list, classes, pred) => {
    const picked = list.map((x, i) => [x, classes[i]]).filter(([x]) => pred(x));
    return { samples: picked.length, excluded: picked.filter(([, c]) => c === 'unmet').length, judged: picked.filter(([, c]) => c !== 'unmet').length };
  };
  return { cold: of(timed, tc, (r) => r.series === 'cold'), warm: of(timed, tc, (r) => r.series !== 'cold'), audit: of(entries, ac, () => true) };
}

/**
 * One planned premise cell judged in one run alone: its replay (device.mjs `judgeDevice` over its own rows and audit,
 * the audit bound to the run's evidence), its recorded verdict, and its status: `pass`, `short` (both fail solely for
 * the shortage) or `fail`, with what fails and its counts.
 */
export function judgeCellAlone(run, op) {
  const rows = samplesOf(run, op);
  const auditRow = auditRowsOf(run, op)[0] ?? null;
  const audit = auditRow && { clean: auditRow.clean, kind: auditRow.audit, answered: auditRow.answered ?? [], forbidden: (auditRow.forbidden ?? []).map((f) => f?.what ?? f), lifecycles: auditRow.lifecycles ?? 1 };
  const window = Array.isArray(auditRow?.ancestry) && Number.isInteger(auditRow.ancestry[0]) ? auditRow.ancestry[0] : null;
  const bound = audit ? bindAudit(audit, run.lines, { run: run.run, scene: SCENE, op, expect: DEVICE_OPS[op].device, window, label: evidenceLabel(rows) }) : { entries: [], problems: [] };
  const replayed = judgeDevice(op, rows, audit, bound);
  const verdicts = verdictsOf(run, op);
  const recorded = verdicts.length === 1 ? verdicts[0] : null;
  const failures = [];
  if (verdicts.length !== 1) failures.push(`${verdicts.length} recorded verdicts`);
  const excluded = (replayed.premise_unmet?.timed?.unmet ?? 0) + (replayed.premise_unmet?.audit?.unmet ?? 0);
  const shortOnly = (v) => v && v.pass === false && v.reasons?.length > 0 && v.reasons.every(isShortage);
  let status;
  if (replayed.pass && recorded?.pass === true) status = 'pass';
  else if (shortOnly(replayed) && shortOnly(recorded) && excluded > 0) status = 'short';
  else {
    status = 'fail';
    for (const r of replayed.reasons.filter((x) => !isShortage(x))) failures.push(r);
    for (const r of (recorded?.reasons ?? []).filter((x) => !isShortage(x) && !replayed.reasons.includes(x))) failures.push(`recorded: ${r}`);
    if (!failures.length) failures.push(`its recorded verdict (${recorded?.verdict ?? 'none'}) and its replay (${replayed.pass ? 'pass' : 'fail'}) do not agree, or its shortage has no exclusion`);
  }
  return { op, status, failures, reasons: replayed.reasons, counts: countsOf(rows, bound.entries), premise_unmet: replayed.premise_unmet ?? null };
}

/**
 * A V5 run judged alone (`checks`: its launcher's exit and the problems of its provenance, for a rerun): its failures,
 * its short cells, each planned premise cell's status and counts, and whether it passes.
 */
export function judgeRun(run, { exit, problems = [] } = {}) {
  const checks = runChecks(run, exit === undefined ? {} : { exit });
  const failures = [...problems, ...checks.failures, ...strayLines(run)];
  const cells = [];
  for (const op of plannedCells(run)) {
    const slots = slotProblems(run, op);
    const cell = judgeCellAlone(run, op);
    if (slots.length) {
      cell.status = 'fail';
      cell.failures.unshift(...slots.map((p) => `the plan's slots or evidence do not fit (ruling 823, never excluded on): ${p}`));
    }
    // its name among the terminal failures exactly when its recorded verdict failed
    if (checks.premise.includes(cellName(op)) !== (verdictsOf(run, op)[0]?.pass === false)) {
      cell.status = 'fail';
      cell.failures.push("its recorded verdict and the run's terminal failures do not agree");
    }
    cells.push(cell);
    for (const f of cell.status === 'fail' ? cell.failures : []) failures.push(`${cellName(op)}: ${f}`);
  }
  const short = cells.filter((c) => c.status === 'short').map((c) => c.op);
  return { failures, short, cells, unclean: checks.unclean, pass: failures.length === 0 && short.length === 0 };
}

/**
 * A refill run's command, from the main run's own (step.json's, in the sitting's form `gate.mjs print` gives): every
 * argument naming the step's directory `dir` names `to` instead, and nothing else changes. Refuses a command that
 * does not name the directory as an argument of its own, or names it inside another argument, or is quoted.
 */
export function refillCommand(command, { dir, to }) {
  if (typeof command !== 'string' || /['"\\]/.test(command)) throw new Error("step.json's command is missing or quoted: premise-refill reads only plain arguments");
  const from = resolve(dir);
  const argv = command.split(' ').filter(Boolean);
  let named = 0;
  const out = argv.map((a) => (a.startsWith('/') && resolve(a) === from ? (named++, to) : a));
  if (!named) throw new Error(`step.json's command does not name the step directory ${from}`);
  const inside = new RegExp(`(^|[=:,])${from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(/|$)`);
  if (out.some((a) => inside.test(a))) throw new Error(`step.json's command names the step directory inside another argument: premise-refill can change only the directory itself`);
  return out;
}

/** The run name a command loads: its `--run`'s value (V5's command always names one), else null. */
const commandRun = (argv) => (argv.includes('--run') ? (argv[argv.indexOf('--run') + 1] ?? null) : null);

/**
 * The refill of a V5 step (`dir`): the main run judged alone; while every run so far fails only by its short cells, V5
 * rerun whole, up to `MAX_REFILL_RUNS` times, each rerun judged alone; the record written. `launch(argv)` runs a rerun's
 * command and answers its exit status; `print` only prints the next one. Answers `{code, record, printed}`.
 */
export async function refillStep({ dir: given, launch = defaultLaunch, print = false, log = (line) => process.stdout.write(`${line}\n`) }) {
  const dir = resolve(given);
  const main = loadStep(dir);
  if (!main.meta) throw new Error(`${dir}: no run rows`);
  const runs = [{ origin: 'main', run: main, exit: main.exit, judged: judgeRun(main) }];
  const refusals = [];
  let skipped = null;
  const printed = [];
  const last = () => runs.at(-1).judged;
  for (let n = 1; !last().pass; n++) {
    const now = last();
    // a failure besides the shortage is final: no rerun, and the record names every one
    if (now.failures.length) {
      if (now.short.length) skipped = `no rerun: V5 fails for more than the shortage of ${now.short.join(', ')}: ${runs.flatMap((r) => r.judged.failures.map((f) => `${r.origin}: ${f}`)).join('; ')}`;
      break;
    }
    if (n > MAX_REFILL_RUNS) break;
    const root = `${dirname(dir)}.r${n}`;
    const to = join(root, basename(dir));
    let argv;
    try {
      if (existsSync(root)) throw new Error(`${root} exists: a rerun's out directory must be fresh`);
      const guard = main.step?.display === ':0' ? zeroStepProblems({ run: main.run, dir: resolvedAsRun71(to) }) : [];
      if (guard.length) throw new Error(guard.join('; '));
      argv = refillCommand(main.step?.command, { dir, to });
      if (commandRun(argv) !== main.run) throw new Error(`its command runs ${commandRun(argv)}, not the main run's ${main.run}`);
    } catch (error) {
      refusals.push(`rerun r${n} could not be launched: ${error.message}`);
      break;
    }
    log(`premise-refill: ${argv.join(' ')}`);
    printed.push(argv.join(' '));
    if (print) break;
    // the rerun's step directory, labelled as the gate's print labels a step's
    mkdirSync(to, { recursive: true });
    writeFileSync(join(to, 'step.json'), `${JSON.stringify({ ...main.step, command: argv.join(' '), refill_of: { dir, n } }, null, 2)}\n`);
    writeFileSync(join(to, 'README.md'), `# ${main.step?.step ?? 'V5'} (${main.step?.label ?? 'unlabelled'}), premise rerun r${n}\n\n**${main.step?.label ?? 'unlabelled'}.** A whole rerun of ${dir} (premise-refill.mjs, rulings 823, 825 and 836), its command the main run's with only this directory changed, judged alone:\n\n\`${argv.join(' ')}\`\n`);
    const exit = await launch(argv);
    const rerun = loadStep(to);
    const problems = rerun.meta ? [] : ['it recorded no meta row'];
    if (rerun.meta) {
      if (rerun.run !== commandRun(argv)) problems.push(`its run is ${rerun.run}, not its command's ${commandRun(argv)}`);
      problems.push(...matchProblems(main, rerun));
    }
    runs.push({ origin: `r${n}`, run: rerun, exit, judged: judgeRun(rerun, { exit, problems }) });
  }
  if (print) {
    if (!printed.length) log(`premise-refill: nothing to rerun${skipped ? ` (${skipped})` : refusals.length ? ` (${refusals.join('; ')})` : ''}`);
    return { code: refusals.length ? 1 : 0, printed };
  }
  const final = last();
  const failed = [...refusals, ...runs.flatMap((r) => r.judged.failures.map((f) => `${r.origin}: ${f}`))];
  if (!final.pass && !final.failures.length && !refusals.length) failed.push(`incomplete: ${final.short.join(', ')} still short for their unmet premise after ${runs.length - 1} whole rerun${runs.length === 2 ? '' : 's'} of V5 (at most ${MAX_REFILL_RUNS})`);
  const record = [
    ...runs.map((r) => ({
      kind: 'run',
      origin: r.origin,
      run: r.run.run,
      dir: r.run.dir,
      exit: r.exit,
      commit: r.run.meta?.commit ?? null,
      engine_sha256: cuaOf(r.run.meta)?.sha256 ?? null,
      load: loadOf(r.run.meta),
      verdict: r.judged.pass ? 'pass' : r.judged.failures.length ? 'fail' : 'short',
      failures: r.judged.failures,
      short: r.judged.short,
      unclean: r.judged.unclean,
      cells: r.judged.cells.map((c) => ({ op: c.op, status: c.status, counts: c.counts, failures: c.failures })),
    })),
    { kind: 'end', pass: failed.length === 0, failed, reruns: runs.length - 1, ...(final.pass && failed.length === 0 ? { passed_by: runs.at(-1).origin } : {}), ...(skipped ? { skipped } : {}) },
  ];
  writeFileSync(join(dir, 'premise-refill.jsonl'), `${record.map((r) => JSON.stringify(r)).join('\n')}\n`);
  writeFileSync(join(dir, 'premise.md'), premiseMarkdown(record));
  return { code: failed.length ? 1 : 0, record };
}

/** The record as a reader's page: V5's verdict, then every run side by side, each premise cell's status and counts. */
export function premiseMarkdown(record) {
  const runs = record.filter((r) => r.kind === 'run');
  const end = record.find((r) => r.kind === 'end');
  const n = (c) => `${c.judged} judged, ${c.excluded} excluded of ${c.samples}`;
  return [
    "# V5's unmet premise: each run judged alone (rulings 823, 825, 836)",
    '',
    end.pass ? `V5 passes${end.passed_by && end.passed_by !== 'main' ? `, on rerun ${end.passed_by} judged alone` : ''}.` : `**V5 FAILS**:\n\n${end.failed.map((f) => `- ${f}`).join('\n')}`,
    '',
    end.skipped ? `${end.skipped}.` : end.reruns ? `V5 was rerun whole ${end.reruns} time${end.reruns === 1 ? '' : 's'}.` : "Nothing was short, so nothing was rerun: the main run's verdicts are final.",
    '',
    '| run | head | engine sha256 | load | exit | verdict | failures | unclean (fails nothing) |',
    '|---|---|---|---|---|---|---|---|',
    ...runs.map((r) => `| ${r.origin} | ${r.commit?.slice(0, 8)} | ${r.engine_sha256?.slice(0, 12)} | ${JSON.stringify(r.load)} | ${r.exit} | ${r.verdict}${r.short.length ? ` (short: ${r.short.join(', ')})` : ''} | ${r.failures.length ? r.failures.join('; ') : 'none'} | ${r.unclean.length ? r.unclean.join('; ') : 'none'} |`),
    '',
    '| run | cell | status | cold | warm | audit |',
    '|---|---|---|---|---|---|',
    ...runs.flatMap((r) => r.cells.map((c) => `| ${r.origin} | ${c.op} | ${c.status} | ${n(c.counts.cold)} | ${n(c.counts.warm)} | ${n(c.counts.audit)} |`)),
    '',
  ].join('\n');
}

function defaultLaunch(argv) {
  return spawnSync(argv[0], argv.slice(1), { stdio: 'inherit' }).status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const print = argv.includes('--print');
  const dir = argv.find((a) => !a.startsWith('--'));
  if (!dir) {
    process.stderr.write('usage: premise-refill.mjs <V5 step dir> [--print]\n');
    process.exit(2);
  }
  const { code } = await refillStep({ dir, print });
  process.exit(code);
}
