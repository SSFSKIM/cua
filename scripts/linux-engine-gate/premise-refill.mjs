// V5's refill of ruling 823's unmet premise (the design session's rulings 823 and 825, by the controller's route B').
// After V5's step, its five premise cells (device.mjs `PREMISE_OPS`) are judged again from the run's rows and the
// evidence its samples recorded (`run/premise-evidence.jsonl`, validated whole first). When a cell is short of its
// planned count, of its cold or warm quota, or of its audit's, V5 is rerun whole: its own command from step.json, as the
// gate printed it, unchanged but for the step's directory, which lies under a fresh out root (`<out>.r<n>`). A whole
// rerun has the main run's plan, scenes, windows, ballast and load by construction; its head, engine bytes and load are
// still checked against the main run's meta by positive equality. At most `MAX_REFILL_RUNS` reruns; a cell still short
// after them is incomplete and fails.
//
// Every run's failures count, and no rerun erases one: each run's terminal failures beyond the premise cells' own
// verdicts (V5's other cells, its harness and guard failures), a sitting that is not all-clear, a terminal record that
// is missing or invalid or that the launcher's exit disagrees with, evidence that does not fit, and each run's premise
// cells' own failures beyond their shortage. Only samples proven premise-unmet are excluded. The premise cells' judged
// samples are pooled across the runs, each tagged with its run, its engine's lifecycle and its series. A run's unclean
// end (what it left on its own side) is listed, and fails nothing (ruling 730 (a)). V5 passes only when every run is
// free of failures and every premise cell's quotas are met. When V5 already fails for anything but the shortage, no
// rerun is launched: the record names every such failure.
//
// The record, in the main step's directory: premise-refill.jsonl (every run, with its origin, run name, head, engine
// sha256, load, exit, engine lifecycles and fixture labels, its failures and whether its samples were pooled; each
// premise cell, its pooled verdict and its samples tagged; the end, V5's verdict) and premise.md. The exit status is
// V5's final status.
//
//   node scripts/linux-engine-gate/premise-refill.mjs <V5 step dir> [--print]
//
// `--print` prints the whole-V5 command it would launch next, in `gate.mjs print`'s form, or that there is none, and
// launches and writes nothing.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { resolvedAsRun71, zeroStepProblems } from './gate.mjs';
import { PREMISE_OPS, judgeDevice } from '../linux-engine-diff/device.mjs';
import { MAX_REFILL_RUNS, TIMED_QUOTAS, bindAudit, bindTimed, evidenceLabel, hasReply, judgePremise, lifecycleOf } from '../linux-engine-diff/premise.mjs';

/** The scene of every premise cell, and a premise cell's name in a run's terminal failures. */
const SCENE = 'device-chrome-dnd';
const cellName = (op) => `${SCENE} ${op} cua`;
const PREMISE_NAMES = new Set([...PREMISE_OPS].map(cellName));
/** A premise cell's reasons that are its shortage, which a refill answers, and the in-run verdict's provisional mark. */
const SHORTAGE = /^(incomplete|the \w+ audit is incomplete): Chrome never started a drag and drop/;
const PROVISIONAL = /^provisional:/;
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
 * Whether a refill run matches the main run it fills (ruling 825), by positive equality of what each meta records: the
 * head, the engine's bytes and arguments, the load (ballast, occlusion) and the plan (operations, scenes, blocks, gate).
 * A field missing or empty on either side fails: two runs that record nothing never match. Answers the problems.
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

/**
 * A run's own checks: its terminal record (one end row, valid), the exit its launcher answered (`exit`; the sitting's
 * recorded one must agree), its sitting's all-clear on `:0`, and its plan holding every premise cell with a verdict.
 * Answers `{failures, recombined, unclean, held}`: `recombined` the premise cells' own verdicts in its terminal
 * failures, which premise-refill judges again from every run; `failures` everything else, each kept.
 */
export function runChecks(run, { exit = run.exit } = {}) {
  const failures = [];
  const recombined = [];
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
  let held = false;
  if (run.step?.display === ':0') {
    if (!run.allClear) failures.push('no all-clear: the sitting did not make its end check');
    else {
      if (run.allClear.clear !== true) {
        held = true;
        failures.push(`its sitting is not all-clear: ${(run.allClear.person ?? []).join('; ') || 'unshown'}`);
      }
      if (Number.isInteger(exit) && run.allClear.exit !== exit) failures.push(`the sitting recorded exit ${run.allClear.exit}, its launcher answered ${exit}`);
    }
  }
  for (const op of PREMISE_OPS) {
    if (!(run.meta?.ops ?? []).includes(`${SCENE}:${op}`)) failures.push(`its plan has no premise cell ${SCENE}:${op}`);
    else if (!run.rows.some((r) => r.kind === 'verdict' && r.scene === SCENE && r.op === op && r.candidate === 'cua')) failures.push(`no verdict for ${cellName(op)}`);
  }
  for (const f of failed) (PREMISE_NAMES.has(f) ? recombined : failures).push(f);
  const unclean = run.allClear?.run ?? end?.desktop?.unclean ?? [];
  return { failures, recombined, unclean, held };
}

/** The audited window of a premise cell's audit row: its ancestry's first, the window the audit's requests named. */
const auditedWindow = (row) => (Array.isArray(row?.ancestry) && Number.isInteger(row.ancestry[0]) ? row.ancestry[0] : null);
const premiseRows = (run) => run.rows.filter((r) => r.kind === 'sample' && r.engine === 'cua' && r.scene === SCENE && PREMISE_OPS.has(r.op));
const auditRow = (run, op) => run.rows.find((r) => r.kind === 'audit' && r.engine === 'cua' && r.scene === SCENE && r.op === op) ?? null;

/**
 * A run's whole sidecar against what the run recorded, validated before anything is read from it: every line premise
 * evidence of a premise cell, of this run's name, head, engine bytes and load, on its cell's one fixture (the label its
 * cell's timed rows' evidence names: the window both passes measure the cell on, run.mjs `measuredTarget`), with cua's
 * reply recorded whole, and the record of exactly one sample with evidence or one
 * audited request of the run; every such sample and request with its one line, a sample's line its row's evidence.
 * Answers the problems: any fails the run's premise cells closed, and nothing is refilled on them.
 */
export function sidecarProblems(run) {
  const rows = premiseRows(run).filter((r) => r.premise_evidence);
  if (run.lines == null) return rows.length ? ["its samples carry evidence, but the run has no premise-evidence.jsonl"] : [];
  const problems = [];
  const labels = new Map([...PREMISE_OPS].map((op) => [op, evidenceLabel(rows.filter((r) => r.op === op))]));
  const expected = new Map();
  for (const r of rows) expected.set(`${r.op}|${r.block}|${r.i}`, r.premise_evidence);
  for (const op of PREMISE_OPS) (auditRow(run, op)?.answered ?? []).forEach((_, i) => expected.set(`${op}|audit|${i}`, null));
  const seen = new Map();
  run.lines.forEach((l, n) => {
    const where = `line ${n + 1} (${l?.op} ${l?.block}/${l?.i})`;
    if (l?.kind !== 'premise-evidence') return problems.push(`${where}: not a premise-evidence record`);
    if (!PREMISE_OPS.has(l.op)) return problems.push(`${where}: a line of no premise cell (${l.op})`);
    if (l.scene !== SCENE) problems.push(`${where}: a line of another scene (${l.scene})`);
    if (l.run !== run.run) problems.push(`${where}: a line of another run (${l.run})`);
    if (l.head !== run.meta?.commit || l.engine_sha256 !== cuaOf(run.meta)?.sha256 || !same(l.load, loadOf(run.meta))) problems.push(`${where}: a line not of this run's head, engine or load`);
    if (!hasReply(l)) problems.push(`${where}: its line does not record the reply's ok, error and notice`);
    if (labels.get(l.op) == null) problems.push(`${where}: its cell's timed samples name no one fixture to bind it to`);
    else if (l.fixture?.label !== labels.get(l.op)) problems.push(`${where}: a line of another fixture (${l.fixture?.label ?? 'none'})`);
    const key = `${l.op}|${l.block}|${l.i}`;
    if (!expected.has(key)) return problems.push(`${where}: a line for no sample or audited request of the run`);
    seen.set(key, (seen.get(key) ?? 0) + 1);
    const evidence = expected.get(key);
    if (evidence && !same(evidence, l)) problems.push(`${where}: its line is not its row's evidence`);
  });
  for (const key of expected.keys()) {
    const k = seen.get(key) ?? 0;
    if (k !== 1) problems.push(`${k} lines for ${key.replace(/\|/g, ' ')}`);
  }
  return problems;
}

/** A run's labels and lifecycles in its evidence: a refill's must be its own, never another run's. */
const fixturesOf = (run) => ({ labels: [...new Set((run.lines ?? []).map((l) => l.fixture?.label).filter(Boolean))], lifecycles: [...new Set((run.lines ?? []).map((l) => l.lifecycle).filter(Boolean))] });

/**
 * One case's timed rows and audit from one run, tagged with the run's origin (`main`, `r1`, `r2`) and bound to its
 * evidence; a refill run's marked `fill`, its blocks named by its origin.
 */
function caseFrom(part, op) {
  const { run, origin } = part;
  const fill = origin !== 'main';
  const rows = run.rows
    .filter((r) => r.kind === 'sample' && r.engine === 'cua' && r.scene === SCENE && r.op === op)
    .map((r) => ({ ...r, origin, ...(fill ? { fill: true, fill_block: r.block, block: `${origin}:${r.block}` } : {}) }));
  const row = auditRow(run, op);
  const audit = row && { clean: row.clean, kind: row.audit, answered: row.answered ?? [], forbidden: (row.forbidden ?? []).map((f) => f?.what ?? f), lifecycles: row.lifecycles ?? 1 };
  const bound = audit ? bindAudit(audit, run.lines, { run: run.run, scene: SCENE, op, window: auditedWindow(row), label: evidenceLabel(rows), origin }) : { entries: [], problems: [] };
  return { rows, audit, entries: fill ? bound.entries.map((e) => ({ ...e, fill: true })) : bound.entries, problems: bound.problems };
}

/**
 * A premise cell judged over `parts` (`[{run, origin}]`, the main run first): its verdict by device.mjs `judgeDevice`
 * over every part's samples and audits pooled, each sample and audited request tagged (its run, lifecycle, series and
 * class under the ruling), and what it still needs.
 */
export function judgeCell(op, parts) {
  const cases = parts.map((p) => caseFrom(p, op));
  const rows = cases.flatMap((c) => c.rows);
  const audits = cases.filter((c) => c.audit);
  const audit = audits.length ? { clean: audits.every((c) => c.audit.clean), kind: audits[0].audit.kind, answered: audits.flatMap((c) => c.audit.answered), forbidden: audits.flatMap((c) => c.audit.forbidden) } : null;
  const entries = audits.flatMap((c) => c.entries);
  const judged = judgeDevice(op, rows, audit, { entries, problems: audits.flatMap((c) => c.problems) });
  const reasons = judged.reasons.filter((r) => !PROVISIONAL.test(r));
  // the tags, by the ruling's own classes (premise.mjs `judgePremise`, as the judge reads them)
  const timedRows = bindTimed(rows).rows;
  const timedClasses = judgePremise(timedRows, { name: () => '', quotas: TIMED_QUOTAS }).classes;
  const auditClasses = judgePremise(entries, { name: () => '' }).classes;
  const timed = judged.premise_unmet?.timed?.need ?? {};
  const audited = judged.premise_unmet?.audit?.need ?? {};
  const need = { cold: timed.cold ?? 0, warm: timed.warm ?? 0, audit: audited.all ?? 0 };
  const fills = rows.filter((r) => r.fill);
  return {
    op,
    pass: reasons.length === 0,
    reasons,
    short: Object.values(need).some((n) => n > 0),
    need,
    premise_unmet: judged.premise_unmet ?? null,
    samples: timedRows.map((r, i) => ({ origin: r.origin, block: r.fill_block ?? r.block, i: r.i, lifecycle: lifecycleOf(r), series: r.series, class: timedClasses[i] })),
    audit: entries.map((e, i) => ({ origin: e.origin, i: e.i, lifecycle: e.lifecycle, class: auditClasses[i] })),
    refilled: { cold: fills.filter((r) => r.series === 'cold').length, warm: fills.filter((r) => r.series !== 'cold').length, audit: entries.filter((e) => e.fill).length },
  };
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

/** What failed in `runs` and their premise cells beyond the shortage, each named by its run. */
function failuresOf(runs) {
  const out = [];
  for (const r of runs) {
    for (const p of [...r.problems, ...r.failures]) out.push(`${r.origin}: ${p}`);
    for (const f of r.cellFailures) out.push(`${r.origin}: ${f}`);
  }
  return out;
}

/** A run's premise cells judged on its own samples alone, and as it recorded them: their failures beyond the shortage. */
function cellFailures(run) {
  const out = new Set();
  for (const op of PREMISE_OPS) {
    if (!run.rows.some((r) => r.kind === 'sample' && r.scene === SCENE && r.op === op)) continue;
    const own = judgeCell(op, [{ run, origin: 'main' }]);
    for (const r of own.reasons.filter((x) => !SHORTAGE.test(x))) out.add(`${cellName(op)}: ${r}`);
    const recorded = run.rows.find((r) => r.kind === 'verdict' && r.scene === SCENE && r.op === op && r.candidate === 'cua');
    for (const r of (recorded?.reasons ?? []).filter((x) => !SHORTAGE.test(x) && !PROVISIONAL.test(x))) out.add(`${cellName(op)}: ${r}`);
  }
  return [...out];
}

/** A run as the record keeps it. */
function described(run, origin, extra = {}) {
  const checks = runChecks(run, extra.exit === undefined ? {} : { exit: extra.exit });
  const evidence = sidecarProblems(run);
  return {
    origin,
    run,
    exit: extra.exit ?? run.exit,
    problems: [...(extra.problems ?? []), ...evidence.map((p) => `the evidence does not fit (ruling 823, never excluded on): ${p}`)],
    failures: checks.failures,
    recombined: checks.recombined,
    unclean: checks.unclean,
    held: checks.held,
    cellFailures: evidence.length ? [] : cellFailures(run),
    ...fixturesOf(run),
  };
}

/**
 * The refill of a V5 step (`dir`): its premise cells judged over the main run; while one is short and nothing else
 * fails V5, V5 rerun whole, up to `MAX_REFILL_RUNS` times; the record written. `launch(argv)` runs a refill run's
 * command and answers its exit status; `print` only prints the next one. Answers `{code, record, printed}`.
 */
export async function refillStep({ dir: given, launch = defaultLaunch, print = false, log = (line) => process.stdout.write(`${line}\n`) }) {
  const dir = resolve(given);
  const main = loadStep(dir);
  if (!main.meta) throw new Error(`${dir}: no run rows`);
  const runs = [described(main, 'main')];
  const refusals = [];
  let skipped = null;
  const printed = [];
  // the main run is always judged; a refill run's samples are pooled only when it fits the main run and its evidence fits it
  const used = () => runs.filter((r) => r.origin === 'main' || !r.problems.length);
  const cells = () => [...PREMISE_OPS].filter((op) => main.rows.some((r) => r.kind === 'sample' && r.scene === SCENE && r.op === op)).map((op) => judgeCell(op, used()));
  for (let n = 1; ; n++) {
    const short = cells().filter((c) => c.short);
    if (!short.length) break;
    // V5 fails already for something a refill cannot answer: no rerun, and the record says what
    const failures = failuresOf(runs);
    if (failures.length) {
      skipped = `no refill run: V5 already fails for more than the shortage of ${short.map((c) => c.op).join(', ')}: ${failures.join('; ')}`;
      break;
    }
    if (n > MAX_REFILL_RUNS) break;
    const root = `${dirname(dir)}.r${n}`;
    const to = join(root, basename(dir));
    let argv;
    try {
      if (existsSync(root)) throw new Error(`${root} exists: a refill run's out directory must be fresh`);
      const guard = main.step?.display === ':0' ? zeroStepProblems({ run: main.run, dir: resolvedAsRun71(to) }) : [];
      if (guard.length) throw new Error(guard.join('; '));
      argv = refillCommand(main.step?.command, { dir, to });
      if (commandRun(argv) !== main.run) throw new Error(`its command runs ${commandRun(argv)}, not the main run's ${main.run}`);
    } catch (error) {
      refusals.push(`refill r${n} could not be launched: ${error.message}`);
      break;
    }
    log(`premise-refill: ${argv.join(' ')}`);
    printed.push(argv.join(' '));
    if (print) break;
    // the refill's step directory, labelled as the gate's print labels a step's
    mkdirSync(to, { recursive: true });
    writeFileSync(join(to, 'step.json'), `${JSON.stringify({ ...main.step, command: argv.join(' '), refill_of: { dir, n } }, null, 2)}\n`);
    writeFileSync(join(to, 'README.md'), `# ${main.step?.step ?? 'V5'} (${main.step?.label ?? 'unlabelled'}), premise refill r${n}\n\n**${main.step?.label ?? 'unlabelled'}.** A whole rerun of ${dir} (premise-refill.mjs, rulings 823 and 825), its command the main run's with only this directory changed:\n\n\`${argv.join(' ')}\`\n`);
    const exit = await launch(argv);
    const refill = loadStep(to);
    const problems = refill.meta ? [] : ['it recorded no meta row'];
    if (refill.meta) {
      if (refill.run !== commandRun(argv)) problems.push(`its run is ${refill.run}, not its command's ${commandRun(argv)}`);
      problems.push(...matchProblems(main, refill));
      // its evidence its own: no fixture label or engine lifecycle of another run's
      const mine = fixturesOf(refill);
      for (const r of runs) if (mine.labels.some((l) => r.labels.includes(l)) || mine.lifecycles.some((l) => r.lifecycles.includes(l))) problems.push(`its evidence repeats run ${r.origin}'s fixture or engine lifecycles`);
    }
    const run = described(refill, `r${n}`, { exit, problems });
    runs.push(run);
    if (run.problems.length) break;
  }
  if (print) {
    if (!printed.length) log(`premise-refill: nothing to refill${skipped ? ` (${skipped})` : refusals.length ? ` (${refusals.join('; ')})` : ''}`);
    // a refill the step needs but that could not be launched is no plan
    return { code: refusals.length ? 1 : 0, printed };
  }
  const judged = cells();
  const failed = [...refusals, ...failuresOf(runs), ...judged.filter((c) => !c.pass).map((c) => `${cellName(c.op)}: ${c.reasons.join('; ')}`)];
  const record = [
    ...runs.map((r) => ({ kind: 'run', role: r.origin === 'main' ? 'main' : 'refill', origin: r.origin, run: r.run.run, dir: r.run.dir, exit: r.exit, commit: r.run.meta?.commit ?? null, engine_sha256: cuaOf(r.run.meta)?.sha256 ?? null, load: loadOf(r.run.meta), used: r.problems.length === 0, problems: r.problems, failures: [...r.failures, ...r.cellFailures], recombined: r.recombined, unclean: r.unclean, labels: r.labels, lifecycles: r.lifecycles })),
    ...judged.map((c) => ({ kind: 'cell', scene: SCENE, op: c.op, verdict: c.pass ? 'pass' : 'fail', reasons: c.reasons, need: c.need, premise_unmet: c.premise_unmet, refilled: c.refilled, samples: c.samples, audit: c.audit })),
    { kind: 'end', pass: failed.length === 0, failed, refilled: runs.length > 1, refill_runs: runs.length - 1, ...(skipped ? { skipped } : {}) },
  ];
  writeFileSync(join(dir, 'premise-refill.jsonl'), `${record.map((r) => JSON.stringify(r)).join('\n')}\n`);
  writeFileSync(join(dir, 'premise.md'), premiseMarkdown(record));
  return { code: failed.length ? 1 : 0, record };
}

/** The record as a reader's page: V5's verdict, the runs combined, then each premise cell with its refilled samples apart. */
export function premiseMarkdown(record) {
  const runs = record.filter((r) => r.kind === 'run');
  const cells = record.filter((r) => r.kind === 'cell');
  const end = record.find((r) => r.kind === 'end');
  const cell = (c) => {
    const t = c.premise_unmet?.timed;
    const a = c.premise_unmet?.audit;
    return `| ${c.op} | ${c.verdict === 'pass' ? 'pass' : `**fail**: ${c.reasons.join('; ')}`} | ${t ? `${t.unmet} of ${t.samples} (${t.unmet_samples.join(', ')})` : '0'} | ${a ? `${a.unmet} of ${a.samples}` : '0'} | ${c.refilled.cold} | ${c.refilled.warm} | ${c.refilled.audit} |`;
  };
  return [
    "# V5's unmet premise, refilled by whole reruns (rulings 823, 825)",
    '',
    end.pass ? 'V5 passes.' : `**V5 FAILS**:\n\n${end.failed.map((f) => `- ${f}`).join('\n')}`,
    '',
    end.skipped ? `${end.skipped}.` : end.refilled ? `Refilled by ${end.refill_runs} whole rerun${end.refill_runs === 1 ? '' : 's'} of V5.` : "Nothing was excluded, so nothing was refilled: the main run's verdicts are final.",
    '',
    '| origin | run | head | engine sha256 | load | exit | pooled | unclean (fails nothing) |',
    '|---|---|---|---|---|---|---|---|',
    ...runs.map((r) => `| ${r.origin} | ${r.run} | ${r.commit?.slice(0, 8)} | ${r.engine_sha256?.slice(0, 12)} | ${JSON.stringify(r.load)} | ${r.exit} | ${r.used ? 'yes' : `**no**: ${r.problems.join('; ')}`} | ${r.unclean.length ? r.unclean.join('; ') : 'none'} |`),
    '',
    '| cell | verdict | excluded, timed | excluded, audit | refilled cold | refilled warm | refilled audit |',
    '|---|---|---|---|---|---|---|',
    ...cells.map(cell),
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
