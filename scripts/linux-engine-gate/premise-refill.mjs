// V5's refill of ruling 823's unmet premise (the design session's rulings 823 and 825). After V5's step, its five premise
// cells (device.mjs `PREMISE_OPS`) are judged again from the run's rows and the evidence its samples recorded
// (`run/premise-evidence.jsonl`). A cell that excluded a sample is refilled by more runs of the unchanged runner, each
// another run's pass of the same kind (timed blocks for timed samples, the audit pass for audited ones), at the same
// head, engine bytes and load as the main run, until the cell's cold, warm and audit quotas are judged again or as many
// extra samples as each pass planned have been asked for. A refill run goes through V5's own launcher, the sitting's
// (sitting.mjs, run71.sh and wrap71.py: its start and end checks, its all-clear, the unclean-end rule), its command V5's
// own from step.json with the scene, case, blocks and run name its refill's; each is printed before it runs.
//
// The record, in the step's directory: premise-refill.jsonl (every run combined, with its run name, head, engine sha256,
// load and engine lifecycles, and whether it was used; each cell's final verdict, its excluded samples and its refill's
// samples apart, cold and warm; the end) and premise.md. The exit status is V5's final status for the five cells; V5's
// other cells stand as the main run recorded them. With nothing excluded nothing is refilled, and the main run's
// verdicts of the five are final.
//
//   node scripts/linux-engine-gate/premise-refill.mjs <V5 step dir> [--print]
//
// `--print` prints the refill run it would launch next, or that there is none, and launches nothing.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { zeroStepProblems } from './gate.mjs';
import { DEVICE_OPS, PREMISE_OPS, judgeDevice } from '../linux-engine-diff/device.mjs';
import { bindAudit } from '../linux-engine-diff/premise.mjs';

const readJsonl = (file) => {
  const bytes = readFileSync(file);
  return (file.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
};
const first = (dir, names) => names.map((n) => join(dir, n)).find(existsSync) ?? null;
const readJson = (file) => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null);

/** A step's directory as the gate leaves it: its step record, rows, evidence (null with none), meta, end and all-clear. */
export function loadStep(dir) {
  const results = first(dir, ['run/results.jsonl', 'run/results.jsonl.gz']);
  const rows = results ? readJsonl(results) : [];
  const sidecar = first(dir, ['run/premise-evidence.jsonl', 'run/premise-evidence.jsonl.gz']);
  const meta = rows.find((r) => r.kind === 'meta') ?? null;
  return { dir, step: readJson(join(dir, 'step.json')), rows, lines: sidecar ? readJsonl(sidecar) : null, meta, run: meta?.run ?? null, end: rows.find((r) => r.kind === 'end') ?? null, allClear: readJson(join(dir, 'all-clear.json')) };
}

const cuaOf = (meta) => meta?.engines?.find((e) => e.label === 'cua') ?? null;
const loadOf = (meta) => ({ ballast: meta?.ballast ?? null, occlusion: meta?.occlusion ?? null });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Whether a refill run matches the main run it fills (ruling 825): the same head, engine bytes and load. */
export function matchProblems(main, refill) {
  const problems = [];
  if (!refill.meta) return ['it recorded no meta row'];
  if (refill.meta.commit !== main.meta.commit) problems.push(`another head (${refill.meta.commit} against ${main.meta.commit})`);
  if (cuaOf(refill.meta)?.sha256 !== cuaOf(main.meta)?.sha256) problems.push(`other engine bytes (${cuaOf(refill.meta)?.sha256} against ${cuaOf(main.meta)?.sha256})`);
  if (!same(cuaOf(refill.meta)?.args ?? [], cuaOf(main.meta)?.args ?? [])) problems.push('other engine arguments');
  if (!same(loadOf(refill.meta), loadOf(main.meta))) problems.push(`another load (${JSON.stringify(loadOf(refill.meta))} against ${JSON.stringify(loadOf(main.meta))})`);
  return problems;
}

/**
 * A run's evidence against its own rows and meta, for one case: each timed line must be the evidence on exactly one row
 * of the run (its run, scene, case, block, request number, engine lifecycle, request id, window and page), each row's
 * evidence must have its line, and every line must carry the run's head, engine sha256 and load. Answers the problems
 * (any of them fails the cell closed); none for a run that recorded no evidence at all (before the fix).
 */
export function evidenceProblems(run, op) {
  const rows = run.rows.filter((r) => r.kind === 'sample' && r.engine === 'cua' && r.op === op);
  const withEvidence = rows.filter((r) => r.premise_evidence);
  if (run.lines == null) return withEvidence.length ? ['its samples carry evidence, but the run has no premise-evidence.jsonl'] : [];
  const lines = run.lines.filter((l) => l.op === op);
  const problems = [];
  const fit = (l) => l.run === run.run && l.head === run.meta?.commit && l.engine_sha256 === cuaOf(run.meta)?.sha256 && same(l.load, loadOf(run.meta));
  for (const l of lines.filter((x) => !fit(x))) problems.push(`a line not of this run's run, head, engine or load (${l.run} ${l.block}/${l.i})`);
  const key = (x) => `${x.run}|${x.scene}|${x.block}|${x.i}`;
  const timed = lines.filter((l) => l.block !== 'audit');
  for (const r of withEvidence) {
    const found = timed.filter((l) => key(l) === key(r));
    if (found.length !== 1) problems.push(`${found.length} lines for ${r.block}/${r.i}`);
    else if (!same(found[0], r.premise_evidence)) problems.push(`${r.block}/${r.i}'s line is not its row's evidence`);
  }
  for (const l of timed.filter((x) => !withEvidence.some((r) => key(r) === key(x)))) problems.push(`a line for no row of the run (${l.block}/${l.i})`);
  return problems;
}

/** One case's timed rows and audit from one run, bound to its evidence; a refill run's marked `fill`. */
function caseFrom(run, op, { fill = false } = {}) {
  const scene = run.rows.find((r) => r.kind === 'sample' && r.op === op)?.scene ?? run.rows.find((r) => r.kind === 'audit' && r.op === op)?.scene;
  const rows = run.rows
    .filter((r) => r.kind === 'sample' && r.engine === 'cua' && r.op === op)
    .map((r) => (fill ? { ...r, fill: true, fill_block: r.block, block: `${run.run}:${r.block}` } : r));
  const auditRow = run.rows.find((r) => r.kind === 'audit' && r.engine === 'cua' && r.op === op) ?? null;
  const window = Array.isArray(auditRow?.ancestry) && Number.isInteger(auditRow.ancestry[0]) ? auditRow.ancestry[0] : null;
  const audit = auditRow && { clean: auditRow.clean, kind: auditRow.audit, answered: auditRow.answered ?? [], forbidden: (auditRow.forbidden ?? []).map((f) => f?.what ?? f), lifecycles: auditRow.lifecycles ?? 1 };
  const bound = audit ? bindAudit(audit, run.lines, { run: run.run, scene, op, window }) : { entries: [], problems: [] };
  return { scene, rows, audit, entries: fill ? bound.entries.map((e) => ({ ...e, fill: true })) : bound.entries, problems: [...bound.problems, ...evidenceProblems(run, op)] };
}

/**
 * A cell judged on the main run and the refill runs used for it (device.mjs `judgeDevice`, with the audits combined and
 * their entries bound to each run's evidence): its verdict, what it still needs (`cold`, `warm`, `audit`) and its
 * refill's samples apart.
 */
export function judgeCell(op, main, refills = []) {
  const parts = [caseFrom(main, op), ...refills.map((r) => caseFrom(r, op, { fill: true }))];
  const rows = parts.flatMap((p) => p.rows);
  const audits = parts.filter((p) => p.audit);
  const audit = audits.length
    ? { clean: audits.every((p) => p.audit.clean), kind: audits[0].audit.kind, answered: audits.flatMap((p) => p.audit.answered), forbidden: audits.flatMap((p) => p.audit.forbidden) }
    : null;
  const problems = parts.flatMap((p) => p.problems);
  const judged = judgeDevice(op, rows, audit, { entries: audits.flatMap((p) => p.entries), problems });
  const timed = judged.premise_unmet?.timed?.need ?? {};
  const audited = judged.premise_unmet?.audit?.need ?? {};
  const fills = rows.filter((r) => r.fill);
  const fillAudit = audits.slice(main.rows.some((r) => r.kind === 'audit' && r.op === op) ? 1 : 0).flatMap((p) => p.entries);
  return {
    scene: parts[0].scene,
    op,
    judged,
    // the evidence that did not fit its samples: the cell fails closed on it, and nothing is refilled on it
    problems,
    need: { cold: timed.cold ?? 0, warm: timed.warm ?? 0, audit: audited.all ?? 0 },
    refill: {
      runs: refills.map((r) => r.run),
      samples: fills.length,
      cold: fills.filter((r) => r.series === 'cold').map((r) => `${r.block}/${r.i}`),
      warm: fills.filter((r) => r.series !== 'cold').map((r) => `${r.block}/${r.i}`),
      audit: fillAudit.map((e) => `${e.run}/audit/${e.i}`),
    },
  };
}

/**
 * A refill run's command, from the main run's own (step.json's, in the sitting's form): its directory and run name its
 * own, the scene the drag page's, the case its own, `blocks` series of the case's length, and the audit pass only where
 * it is wanted. Refuses a command it cannot read so.
 */
export function refillCommand(command, { dir, to, run, op, blocks, audit }) {
  const argv = command.split(' ').filter(Boolean);
  const value = (flag) => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] : null);
  if (resolve(value('--dir') ?? '') !== resolve(dir)) throw new Error(`step.json's command names another step directory (${value('--dir')}) than ${dir}`);
  for (const flag of ['--scene', '--ops', '--blocks', '--run']) if (value(flag) == null) throw new Error(`step.json's command has no ${flag}`);
  if (argv.includes('--no-audit')) throw new Error("step.json's command already runs with no audit");
  const set = { '--scene': 'device-chrome-dnd', '--ops': op, '--blocks': String(blocks), '--run': run };
  const from = value('--dir');
  const out = argv.map((a, i) => (a === from ? to : argv[i - 1] in set ? set[argv[i - 1]] : a));
  if (!audit) out.splice(out.indexOf('--blocks') + 2, 0, '--no-audit');
  return out;
}

/** The samples a case's timed series takes: its cold one and its warm ones (run.mjs's blocks, device.mjs `warmSamples`). */
const seriesLength = (op) => 1 + (DEVICE_OPS[op].warmSamples ?? 0);

/**
 * The refill of a V5 step (`dir`): each premise cell judged, refilled while it needs and its bound allows, the record
 * written. `launch(argv)` runs a refill run's command and answers its exit status; `print` only prints the next one.
 * Answers `{code, record, printed}`.
 */
export async function refillStep({ dir, launch = defaultLaunch, print = false, log = (line) => process.stdout.write(`${line}\n`) }) {
  const main = loadStep(dir);
  if (!main.meta) throw new Error(`${dir}: no run rows`);
  const cells = [...PREMISE_OPS].filter((op) => main.rows.some((r) => r.kind === 'sample' && r.op === op));
  const state = Object.fromEntries(cells.map((op) => [op, { refills: [], asked: { timed: 0, audit: 0 }, problems: [] }]));
  const runs = [{ role: 'main', ...describe(main), used: true, problems: [] }];
  const planned = (op) => ({ timed: main.rows.filter((r) => r.kind === 'sample' && r.engine === 'cua' && r.op === op).length, audit: main.rows.find((r) => r.kind === 'audit' && r.op === op)?.answered?.length ?? 0 });
  let n = 0;
  const printed = [];
  let held = false;
  for (const op of cells) {
    for (;;) {
      const cell = judgeCell(op, main, state[op].refills);
      if (!cell.judged.premise_unmet || cell.problems.length || held || state[op].problems.length) break;
      const p = planned(op);
      const len = seriesLength(op);
      const wantBlocks = Math.max(cell.need.cold, Math.ceil(cell.need.warm / (len - 1 || 1)));
      const blocks = Math.min(wantBlocks, Math.floor((p.timed - state[op].asked.timed) / len));
      const audit = cell.need.audit > 0 && state[op].asked.audit + p.audit <= p.audit;
      if (blocks <= 0 && !audit) break;
      n += 1;
      const to = `${dir.replace(/\/$/, '')}.r${n}`;
      const run = `${main.run}-r${n}`;
      const guard = zeroStepProblems({ run, dir: to });
      let argv;
      try {
        if (guard.length) throw new Error(guard.join('; '));
        argv = refillCommand(main.step?.command ?? '', { dir, to, run, op, blocks, audit });
      } catch (error) {
        state[op].problems.push(`its refill could not be launched: ${error.message}`);
        break;
      }
      log(`premise-refill: ${argv.join(' ')}`);
      printed.push(argv.join(' '));
      if (print) break;
      state[op].asked.timed += blocks * len;
      if (audit) state[op].asked.audit += p.audit;
      const exit = await launch(argv);
      const refill = loadStep(to);
      const problems = matchProblems(main, refill);
      if (refill.end?.valid !== true) problems.push('its run is not valid (the negative check, or no end record)');
      if (refill.allClear?.clear !== true) {
        problems.push('its sitting is not all-clear (hold-sittings written)');
        held = true;
      }
      // its own other checks, kept: anything it failed beyond this case's own verdict
      const other = (refill.end?.failed ?? []).filter((f) => f !== `device-chrome-dnd ${op} cua`);
      const used = problems.length === 0;
      runs.push({ role: 'refill', for: op, ...describe(refill), exit, used, problems, other_failures: other, unclean: refill.allClear?.run ?? [] });
      if (!used) {
        state[op].problems.push(`refill run ${run} is not used: ${problems.join('; ')}`);
        break;
      }
      if (other.length) state[op].problems.push(`refill run ${run} failed its other checks: ${other.join('; ')}`);
      state[op].refills.push(refill);
    }
    if (print && printed.length) break;
  }
  if (print) {
    if (!printed.length) log('premise-refill: nothing to refill');
    return { code: 0, printed };
  }
  const judgedCells = cells.map((op) => {
    const cell = judgeCell(op, main, state[op].refills);
    const reasons = [...cell.judged.reasons.filter((r) => !r.startsWith('provisional:')), ...state[op].problems];
    return { kind: 'cell', scene: cell.scene, op, verdict: reasons.length ? 'fail' : 'pass', reasons, premise_unmet: cell.judged.premise_unmet ?? null, refill: cell.refill, asked: state[op].asked };
  });
  for (const r of runs) r.lifecycles = lifecyclesOf(r.role === 'main' ? main : state[r.for]?.refills.find((x) => x.run === r.run) ?? loadStep(r.dir));
  const failed = judgedCells.filter((c) => c.verdict !== 'pass').map((c) => `${c.scene} ${c.op} cua`);
  const record = [...runs.map((r) => ({ kind: 'run', ...r })), ...judgedCells, { kind: 'end', pass: failed.length === 0, failed, refilled: runs.length > 1 }];
  writeFileSync(join(dir, 'premise-refill.jsonl'), `${record.map((r) => JSON.stringify(r)).join('\n')}\n`);
  writeFileSync(join(dir, 'premise.md'), premiseMarkdown(record));
  return { code: failed.length ? 1 : 0, record };
}

const describe = (run) => ({ run: run.run, dir: run.dir, commit: run.meta?.commit ?? null, engine_sha256: cuaOf(run.meta)?.sha256 ?? null, load: loadOf(run.meta) });
const lifecyclesOf = (run) => [...new Set((run.lines ?? []).map((l) => l.lifecycle).filter(Boolean))];

/** The record as a reader's page: the runs combined, then each cell, its refill's samples listed apart, cold and warm. */
export function premiseMarkdown(record) {
  const runs = record.filter((r) => r.kind === 'run');
  const cells = record.filter((r) => r.kind === 'cell');
  const end = record.find((r) => r.kind === 'end');
  const md = [
    "# V5's unmet premise, refilled (rulings 823, 825)",
    '',
    `${end.pass ? 'Every premise cell passes' : `**FAIL**: ${end.failed.join(', ')}`}. ${end.refilled ? 'Refilled from the runs below.' : 'Nothing was excluded, so nothing was refilled: the main run\'s verdicts are final.'}`,
    '',
    '| run | role | head | engine sha256 | load | used |',
    '|---|---|---|---|---|---|',
    ...runs.map((r) => `| ${r.run} | ${r.role}${r.for ? ` (${r.for})` : ''} | ${r.commit?.slice(0, 8)} | ${r.engine_sha256?.slice(0, 12)} | ${JSON.stringify(r.load)} | ${r.used ? 'yes' : `**no**: ${r.problems.join('; ')}`} |`),
    '',
    '| cell | verdict | excluded, timed | excluded, audit | refilled cold | refilled warm | refilled audit |',
    '|---|---|---|---|---|---|---|',
    ...cells.map((c) => `| ${c.op} | ${c.verdict === 'pass' ? 'pass' : `**fail**: ${c.reasons.join('; ')}`} | ${c.premise_unmet?.timed ? `${c.premise_unmet.timed.unmet} of ${c.premise_unmet.timed.samples} (${c.premise_unmet.timed.unmet_samples.join(', ')})` : '0'} | ${c.premise_unmet?.audit ? `${c.premise_unmet.audit.unmet} of ${c.premise_unmet.audit.samples}` : '0'} | ${c.refill.cold.length}${c.refill.cold.length ? ` (${c.refill.cold.join(', ')})` : ''} | ${c.refill.warm.length}${c.refill.warm.length ? ` (${c.refill.warm.join(', ')})` : ''} | ${c.refill.audit.length} |`),
    '',
  ];
  return md.join('\n');
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

