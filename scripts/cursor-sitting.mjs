#!/usr/bin/env node
// The agent cursor's attended sitting on the MacBook (#235; docs/doperpowers/specs/2026-10-30-macos-agent-cursor-
// design.md, M3 and Acceptance 1–13). The runbook, docs/evidence/2026-10-30-macos-agent-cursor/README.md, says when each
// command runs, what the owner watches or does meanwhile, and what is kept.
//
//   cursor-sitting.mjs save --home <dir> --to <new dir>
//       Before the sitting: `cua engine status --json`, a copy of <home>'s whole engine directory (its socket, lock,
//       build scratch and staging left out) and of ~/.config/cua/engine.json, checked against a manifest of the tree
//       (./cursor-sitting/engine-copy.mjs). --home is always given: this script never defaults to this account's.
//   cursor-sitting.mjs restore --home <dir> --from <saved dir> --aside <new dir>
//       After the sitting: `cua engine stop`, the current engine directory and engine.json moved to --aside, the saved
//       ones put back and checked, `cua engine status` read for the saved build, approved. Exit 1 says what follows.
//   cursor-sitting.mjs drive <1|2|3|4|5|6|7|9|10|11> --run <scenes run dir> --out <evidence dir> [--engine vendor|cua]
//                     [--other-session <Claude Code session id>] [--quiet] [--dry-run]
//       One item's scripted steps (./cursor-sitting/plans.mjs) on the harness scenes the run directory holds
//       (scripts/repl-parity/scenes-mac.mjs up <scene> --run <dir>), recorded in <out>/item-<n>.jsonl. Owner cues are
//       spoken (`say`; --quiet prints them only); an instruction the owner confirms waits for <out>/go, which the
//       operator creates (`touch`) once the owner says done. --engine is item 11's (the side-by-side: vendor, then cua);
//       --other-session gives item 2's second session another Claude Code session's sminos name.
//   cursor-sitting.mjs timing typing|clicks --run <dir> --out <dir> [--samples 20] [--quiet] [--dry-run]
//       Acceptance 12 (typing) or 13 (clicks): interleaved cursor-on and cursor-off samples (./cursor-sitting/timing.mjs),
//       recorded in <out>/item-12.jsonl or item-13.jsonl, then judged as `judge` does.
//   cursor-sitting.mjs judge --out <dir>
//       The timing items' verdicts by #171's noise rule (./cursor-sitting/stats.mjs), written to <out>/timing.md.
//   cursor-sitting.mjs verdict <item> <watch id> pass|fail [note…] --out <dir>
//       The owner's verdict on what an item asked them to watch, appended to <out>/verdicts.jsonl.
//   cursor-sitting.mjs summary --out <dir>
//       Every item's cells, tasks, watches and verdicts, and the timing verdicts, in <out>/summary.md.
//   cursor-sitting.mjs remote prepare|enroll|run --kit <dir> [--port n] [--run <dir> --out <dir>] [--quiet] [--dry-run]
//       Acceptance 8's loopback device (./cursor-sitting/remote.mjs): prepare the kit (and print what it still needs),
//       enrol it on a loopback relay, then run: the relay and the agent started, three client sessions driven
//       (recorded as item 8), both stopped.
import {execFileSync} from 'node:child_process';
import {appendFileSync, existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {restoreEngine, saveEngine} from './cursor-sitting/engine-copy.mjs';
import {PLANS} from './cursor-sitting/plans.mjs';
import {agentConnected, enrollKit, kitPaths, prepareKit, remoteSteps, startLoopback, DEFAULT_PORT} from './cursor-sitting/remote.mjs';
import {liveIo, runSteps} from './cursor-sitting/runner.mjs';
import {judgeTiming} from './cursor-sitting/stats.mjs';
import {SERIES, timingRows, timingSteps} from './cursor-sitting/timing.mjs';

const SCRIPT = fileURLToPath(import.meta.url);
const CLI = fileURLToPath(new URL('../bin/cua.mjs', import.meta.url));
const OPTIONS = {home: {type: 'string'}, to: {type: 'string'}, from: {type: 'string'}, aside: {type: 'string'}, run: {type: 'string'}, out: {type: 'string'},
  engine: {type: 'string'}, 'other-session': {type: 'string'}, samples: {type: 'string'}, kit: {type: 'string'}, port: {type: 'string'},
  quiet: {type: 'boolean', default: false}, 'dry-run': {type: 'boolean', default: false}};
const TIMING_ITEM = {typing: 12, clicks: 13};

const absolute = (values, name) => {
  const value = values[name];
  if (!value || !isAbsolute(value)) throw new Error(`--${name} <absolute path> is required`);
  return resolve(value);
};
const print = value => process.stdout.write(`${typeof value === 'string' ? value : JSON.stringify(value, null, 2)}\n`);

// `cua <args> --json` with HOME set to `home`. -> its JSON, or {ok: false, detail} when it failed.
function cuaJson(home, args) {
  try { return JSON.parse(execFileSync(process.execPath, [CLI, ...args, '--json'], {encoding: 'utf8', env: {...process.env, HOME: home}, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60_000})); } catch (error) {
    return {ok: false, detail: String(error.stderr || error.stdout || error.message).trim().split('\n').at(-1)};
  }
}

const readJsonl = file => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : []);
// An item's last attempt: its rows from the last `start` on.
const lastAttempt = rows => rows.slice(Math.max(0, rows.map(r => r.kind).lastIndexOf('start')));

// The timing items' judgements from their recorded rows. -> [{item, kind, pass, series, routes?}].
function judgeAll(out) {
  return Object.entries(TIMING_ITEM).flatMap(([kind, item]) => {
    const rows = lastAttempt(readJsonl(join(out, `item-${item}.jsonl`)));
    if (!rows.length) return [];
    const timed = timingRows(rows, kind);
    const judged = judgeTiming(timed, {series: SERIES[kind]});
    const routes = kind === 'clicks' ? Object.entries(timed.filter(r => r.series === 'element click').reduce((m, r) => ({...m, [r.route ?? 'none']: (m[r.route ?? 'none'] ?? 0) + 1}), {})) : null;
    return [{item, kind, ...judged, ...(routes ? {routes: Object.fromEntries(routes)} : {})}];
  });
}

const fmt = v => (v === null || v === undefined ? '–' : Number(v).toFixed(2));
function timingMarkdown(judged) {
  const lines = ['# Acceptance 12 and 13: timing, cursor on against cursor off', '',
    'Judged by #171\'s noise rule (scripts/cursor-sitting/stats.mjs): the bootstrap 95 % interval of median(on) − median(off) must include 0, or lie wholly below it, with its upper end at most max(5 % of the off median, 1 ms), whatever the medians.', ''];
  for (const j of judged) {
    lines.push(`## Acceptance ${j.item} (${j.kind}): ${j.pass ? 'PASS' : 'FAIL'}`, '', '| series | n on / off | median on (ms) | median off (ms) | 95 % interval of the difference (ms) | bound (ms) | verdict |', '|---|---|---|---|---|---|---|');
    for (const s of j.series) lines.push(`| ${s.series} | ${s.n.on} / ${s.n.off} | ${fmt(s.medians.on)} | ${fmt(s.medians.off)} | ${s.interval ? `[${fmt(s.interval[0])}, ${fmt(s.interval[1])}]` : '–'} | ${fmt(s.bound)} | ${s.verdict} |`);
    if (j.errors) lines.push('', `${j.errors} timed call(s) failed and are not in the samples (item-${j.item}.jsonl has their errors).`);
    if (j.routes) lines.push('', `The element clicks' routes: ${Object.entries(j.routes).map(([r, n]) => `route ${r} × ${n}`).join(', ')}.`);
    lines.push('');
  }
  return lines.join('\n');
}

function summaryMarkdown(out) {
  const verdicts = readJsonl(join(out, 'verdicts.jsonl'));
  const files = readdirSync(out).filter(f => /^item-[\w-]+\.jsonl$/.test(f)).sort((a, b) => a.localeCompare(b, 'en', {numeric: true}));
  const lines = ['# The agent cursor\'s sitting: what each item recorded', ''];
  for (const f of files) {
    const rows = lastAttempt(readJsonl(join(out, f))), item = f.slice(5, -6);
    const cells = rows.filter(r => r.kind === 'cell'), tasks = rows.filter(r => r.kind === 'task');
    lines.push(`## Item ${item}`, '', `${cells.length} cell(s), ${cells.filter(c => !c.ok).length} failed; ${tasks.length} task(s), ${tasks.filter(t => t.result?.ok === false).length} failed.`, '');
    for (const t of tasks.filter(x => x.result?.ok === false)) lines.push(`- task ${t.task} failed: ${JSON.stringify(t.result)}`);
    for (const c of cells.filter(x => !x.ok)) lines.push(`- ${c.session}: ${c.label} failed: ${c.error}`);
    for (const w of rows.filter(r => r.kind === 'watch')) {
      const said = verdicts.filter(v => String(v.item) === item.split('-')[0] && v.id === w.id).at(-1);
      lines.push(`- watch \`${w.id}\`: ${w.text} — ${said ? `**${said.verdict}**${said.note ? ` (${said.note})` : ''}` : '**no verdict recorded**'}`);
    }
    lines.push('');
  }
  const judged = judgeAll(out);
  if (judged.length) lines.push(timingMarkdown(judged));
  return lines.join('\n');
}

async function drive(steps, {item, values}) {
  const out = absolute(values, 'out');
  const run = values['dry-run'] ? values.run ?? '/nonexistent' : absolute(values, 'run');
  const io = liveIo({run, out, quiet: values.quiet});
  const {failed} = await runSteps(steps, {item, out, io, dryRun: values['dry-run']});
  print(values['dry-run'] ? `dry run: ${steps.length} steps, nothing sent` : `${failed} cell(s) or task(s) failed; recorded in ${join(out, `item-${item}.jsonl`)}`);
  return failed ? 1 : 0;
}

export async function main(argv) {
  const [command, ...rest] = argv;
  const {values, positionals} = parseArgs({args: rest, options: OPTIONS, allowPositionals: true});
  if (command === 'save') {
    const home = absolute(values, 'home');
    const saved = await saveEngine({home, to: absolute(values, 'to'), status: async () => cuaJson(home, ['engine', 'status'])});
    print({ok: true, ...saved});
    return 0;
  }
  if (command === 'restore') {
    const home = absolute(values, 'home');
    const restored = await restoreEngine({home, from: absolute(values, 'from'), aside: absolute(values, 'aside'),
      stop: async () => { const r = cuaJson(home, ['engine', 'stop']); return r.ok === false ? r : {ok: true, ...r}; },
      status: async () => cuaJson(home, ['engine', 'status'])});
    print(restored);
    return restored.ok ? 0 : 1;
  }
  if (command === 'drive') {
    const item = positionals[0];
    if (!PLANS[item]) throw new Error(`drive takes an item of ${Object.keys(PLANS).join(', ')} (8 is \`remote run\`, 12 and 13 are \`timing\`)`);
    if (item === '11' && !['vendor', 'cua'].includes(values.engine)) throw new Error('drive 11 takes --engine vendor or --engine cua');
    const steps = PLANS[item]({otherSession: values['other-session'] ?? null, engine: values.engine});
    return drive(steps, {item: item === '11' ? `11-${values.engine}` : item, values});
  }
  if (command === 'timing') {
    const kind = positionals[0], samples = Number(values.samples ?? 20);
    if (!SERIES[kind]) throw new Error('timing takes typing or clicks');
    if (!Number.isInteger(samples) || samples < 1) throw new Error('--samples takes a positive whole number');
    const code = await drive(timingSteps(kind, samples), {item: TIMING_ITEM[kind], values});
    if (values['dry-run']) return code;
    const out = absolute(values, 'out'), judged = judgeAll(out);
    writeFileSync(join(out, 'timing.md'), timingMarkdown(judged));
    print(timingMarkdown(judged.filter(j => j.kind === kind)));
    return judged.find(j => j.kind === kind)?.pass ? code : 1;
  }
  if (command === 'judge') {
    const out = absolute(values, 'out'), judged = judgeAll(out);
    writeFileSync(join(out, 'timing.md'), timingMarkdown(judged));
    print(timingMarkdown(judged));
    return judged.length && judged.every(j => j.pass) ? 0 : 1;
  }
  if (command === 'verdict') {
    const [item, id, verdict, ...note] = positionals;
    if (!item || !id || !['pass', 'fail'].includes(verdict)) throw new Error('verdict takes <item> <watch id> pass|fail [note…]');
    appendFileSync(join(absolute(values, 'out'), 'verdicts.jsonl'), JSON.stringify({item, id, verdict, note: note.join(' ') || null, at: new Date().toISOString()}) + '\n');
    return 0;
  }
  if (command === 'summary') {
    const out = absolute(values, 'out');
    writeFileSync(join(out, 'summary.md'), summaryMarkdown(out));
    print(`wrote ${join(out, 'summary.md')}`);
    return 0;
  }
  if (command === 'remote') {
    const kit = absolute(values, 'kit'), sub = positionals[0];
    if (sub === 'prepare') {
      const {needs} = prepareKit(kit);
      print(needs.length ? `the kit still needs, from the checkout's root:\n${needs.map(n => `  ${n}`).join('\n')}` : 'the kit is ready to enrol');
      return needs.length ? 1 : 0;
    }
    if (sub === 'enroll') {
      const record = await enrollKit(kit, {port: Number(values.port ?? DEFAULT_PORT)});
      print(`enrolled the kit's device ${record.deviceId} on the loopback relay ${record.relayUrl}; registered as \`loop\` for the kit's clients`);
      return 0;
    }
    if (sub === 'run') {
      const steps = remoteSteps(kit);
      if (values['dry-run']) return drive(steps, {item: '8', values});
      const loopback = startLoopback(kit);
      try {
        const {deviceHome} = kitPaths(kit);
        const deadline = Date.now() + 60_000;
        while (!agentConnected(deviceHome)) {
          if (Date.now() > deadline) throw new Error(`the agent did not report its relay link up within 60 s (see ${join(kit, 'agent.log')} and ${join(kit, 'relay.log')})`);
          await new Promise(r => setTimeout(r, 500));
        }
        return await drive(steps, {item: '8', values});
      } finally { await loopback.stop(); }
    }
    throw new Error('remote takes prepare, enroll or run');
  }
  throw new Error('usage: cursor-sitting.mjs save | restore | drive <item> | timing typing|clicks | judge | verdict | summary | remote prepare|enroll|run (see the header)');
}

if (process.argv[1] && SCRIPT === resolve(process.argv[1])) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, error => { process.stderr.write(`cursor-sitting: ${error.message}\n`); process.exitCode = 2; });
}
