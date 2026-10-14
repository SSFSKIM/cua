#!/usr/bin/env node
// The native (sky) performance baseline (#114): what today's vendor engine costs, recorded before cua's own REPL host
// (#116) and native engine (#117) replace it. It drives the real pinned runtime as the browser parity harness does
// (scripts/browser-parity.mjs): `cua serve` of the parity clone on the device over an ssh stdio pipe, an MCP client,
// js cells, every sample journaled. The surface is the native one (CUA_SHIM_SURFACES=computer); the scratch app is
// TextEdit, which must not be running when a run starts (so every TextEdit window the run sees is its own).
//
//   node scripts/native-baseline.mjs run --device mini --out docs/evidence/<date>-native-baseline/run-1
//   node scripts/native-baseline.mjs summary docs/evidence/<date>-native-baseline
//
// A run writes results.jsonl (one row per sample: op, sample, ok, wallMs, inCellMs and the sample's counts) and
// meta.json (what it ran against: commit, runtime release, hardware, OS, display, the helper that answered, approvals,
// processes left). `summary` pools the run-* directories into summary.md (scripts/native-baseline/summary.mjs).
// What a run measures, in order:
//   ssh.roundtrip        `ssh <device> true`, the pipe's own cost, to read the cold numbers against
//   cold.<miss|hit>.*    a fresh `cua serve`: initialize, tools/list, the first js cell (bootstrap and API document);
//                        the handshake record is cleared before a planned miss and kept for a hit, and each connection
//                        is labelled by the record observed just before it started
//   warm.noop, warm.getState, warm.listApps     on one warm connection
//   bind.getApp          the first cua.getApp(TextEdit): approval (answered by the harness, timed apart as
//                        approval.elicitation) and the launch
//   warm.getAXState, warm.getScreenshot         full tree and screenshot of a new, empty scratch document
//   task.act/verify/close/total                 new document, typeText a fixed sentence, verify it in the full tree,
//                        close without saving
//   end_task
// Nothing a cell returns is screen content: counts, lengths, booleans and hashes only (scripts/native-baseline/cells.mjs).
// A cell that times out stops all further GUI input (a permission prompt may be waiting; the harness never answers one).
import {parseArgs} from 'node:util';
import {appendFileSync, existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioClient, textOf} from './browser-parity/mcp.mjs';
import {execute, remoteCommand} from './browser-parity/topology.mjs';
import {isTextEditApproval} from './accept/lib.mjs';
import * as cells from './native-baseline/cells.mjs';
import {classifyHelpers, handshakeScript, HELPER_SCRIPT, LEFTOVER_SCRIPT, preflightScript, PROTOCOL_VERSION, serveCommand, SPIKE_SCRIPT} from './native-baseline/remote.mjs';
import {readRuns, renderMarkdown, summarize} from './native-baseline/summary.mjs';

// Cold connections cycle through this plan; each is labelled by the record it found.
const COLD_PLAN = ['miss', 'hit', 'miss', 'hit', 'hit'];
const CELL_MS = 60_000;
const BIND_MS = 120_000;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = ms => Math.round(ms * 1000) / 1000;

class Stop extends Error {}

export async function run({device, out, samples = 30, cold = 5, tasks = 10, spikeWaitMs = 3 * 3600_000}) {
  if (device === 'local') throw new Error('the native baseline runs on a device (--device <ssh alias>), never on this machine');
  const dir = resolve(out);
  if (existsSync(join(dir, 'meta.json')) || existsSync(join(dir, 'results.jsonl'))) throw new Error('Output directory already contains a run');
  mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'results.jsonl'), '');
  const remote = script => execute(remoteCommand(device, script)).trim();
  const emit = row => { appendFileSync(join(dir, 'results.jsonl'), JSON.stringify(row) + '\n'); return row; };
  const meta = {device, protocolVersion: PROTOCOL_VERSION, environment: {CUA_SHIM_SURFACES: 'computer', CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: 'off'},
    plan: {samples, cold, tasks, coldPlan: COLD_PLAN}, started: new Date().toISOString(), elicitations: [], complete: false};
  const clients = new Set();
  let stopped = null;   // why no further GUI input is sent

  // Waits for the device's cua-116-spike work to finish: two measurements must not share the helper.
  const waitStarted = Date.now();
  while (remote(SPIKE_SCRIPT) === 'running') {
    if (Date.now() - waitStarted > spikeWaitMs) throw new Error('a cua-116-spike process is still running on the device');
    console.log('waiting for cua-116-spike on the device to finish');
    await sleep(30_000);
  }
  meta.spikeWaitMs = Date.now() - waitStarted;
  const pre = JSON.parse(remote(preflightScript()).split('\n').at(-1));
  Object.assign(meta, {commit: pre.commit, checkout: pre.checkout, home: pre.home, runtime: {release: pre.release}, hardware: pre.hardware, os: pre.os, display: pre.display});
  meta.textEdit = {runningBefore: pre.textEditRunning};
  if (pre.dirty) throw new Error('the parity clone is dirty');
  if (!pre.release) throw new Error('no runtime installed in the device home');
  if (pre.textEditRunning) throw new Error('TextEdit is running on the device: its windows may be the owner\'s; quit it (or wait) and re-run');
  if (pre.serves) throw new Error('a serve of the parity clone is already running on the device');
  console.log(`device ${device}: ${pre.hardware.model} ${pre.os.version}, runtime ${pre.release}, clone ${pre.commit.slice(0, 10)}`);

  const connect = () => {
    const client = new StdioClient({...serveCommand({device, checkout: pre.checkout, home: pre.home}), clientName: 'cua-native-baseline',
      answer: msg => (isTextEditApproval(msg) ? {action: 'accept', content: {}} : {action: 'decline'}),
      onElicitation: (row, msg) => {
        const entry = {t: row.t, at: performance.now(), app: msg.params?._meta?.tool_params?.app ?? null, action: row.action};
        meta.elicitations.push(entry); client.elicited.push(entry);
      }});
    client.elicited = [];
    clients.add(client);
    return client;
  };
  // A js cell: harness wall time around the call, and the cell's own report.
  const js = async (client, code, timeoutMs = CELL_MS) => {
    const started = performance.now();
    let result;
    try { result = await client.request('tools/call', {name: 'js', arguments: {code, timeout_ms: timeoutMs}}, timeoutMs + 15_000); } catch (error) {
      return {wallMs: performance.now() - started, started, failure: error.message, timedOut: /timed out/.test(error.message)};
    }
    const text = textOf(result), cell = cells.parseCell(text);
    const timedOut = !cell && /timed? ?out|timeout/i.test(text);
    return {wallMs: performance.now() - started, started, text, cell, isError: result.isError === true, timedOut,
      failure: cell ? null : (text.split('\n').filter(Boolean).at(-1) ?? 'no output').slice(0, 300)};
  };
  const row = (op, sample, r, extra = {}) => {
    const ok = Boolean(r.cell?.ok);
    return emit({op, sample, ok, wallMs: round(r.wallMs), ...(r.cell?.inCellMs !== undefined ? {inCellMs: round(r.cell.inCellMs)} : {}),
      ...(ok ? r.cell.value ?? {} : {error: r.cell?.error ?? r.failure ?? 'failed'}), ...extra});
  };
  // A cell whose answer did not come stops the GUI work: something may be waiting on a human.
  const guard = (r, what) => {
    if (r.timedOut) { stopped = `${what} timed out; a permission prompt may be waiting on the device (never answered by the harness)`; throw new Stop(stopped); }
    return r;
  };
  const measure = async (client, op, n, code, timeoutMs) => {
    const rows = [];
    for (let sample = 1; sample <= n; sample++) rows.push(row(op, sample, guard(await js(client, code, timeoutMs), `${op} sample ${sample}`)));
    console.log(`${op}: ${rows.filter(r => r.ok).length}/${n} ok`);
    return rows;
  };

  try {
    for (let sample = 1; sample <= 5; sample++) {
      const started = performance.now();
      remote('true');
      emit({op: 'ssh.roundtrip', sample, ok: true, wallMs: round(performance.now() - started)});
    }

    // Cold connections.
    for (let sample = 1; sample <= cold; sample++) {
      const planned = COLD_PLAN[(sample - 1) % COLD_PLAN.length];
      const label = remote(handshakeScript({record: pre.handshakeRecord, clear: planned === 'miss'})) === 'present' ? 'hit' : 'miss';
      const client = connect();
      const t0 = performance.now();
      const phase = (name, wallMs, extra = {}) => emit({op: `cold.${label}.${name}`, sample, wallMs: round(wallMs), planned, ...extra});
      try {
        await client.initialize();
        const t1 = performance.now();
        phase('initialize', t1 - t0, {ok: true});
        await client.request('tools/list');
        const t2 = performance.now();
        phase('tools_list', t2 - t1, {ok: true});
        const first = guard(await js(client, cells.FIRST, BIND_MS), `cold connection ${sample}`);
        const t3 = performance.now();
        const document = first.text?.split(cells.MARKER)[0] ?? '';
        phase('first_js', t3 - t2, {ok: Boolean(first.cell?.ok), ...(first.cell ? {inCellMs: round(first.cell.inCellMs)} : {error: first.failure}),
          documentChars: document.length, nativeDocumented: /## Native apps/.test(document)});
        phase('total', t3 - t0, {ok: Boolean(first.cell?.ok)});
        await client.call('end_task');
      } catch (error) {
        if (error instanceof Stop) throw error;
        emit({op: `cold.${label}.total`, sample, planned, ok: false, wallMs: round(performance.now() - t0), error: error.message});
      } finally {
        await client.close(); clients.delete(client);
      }
      console.log(`cold ${sample}: handshake ${label} (planned ${planned})`);
    }

    // The warm connection.
    const client = connect();
    await client.initialize();
    await client.request('tools/list');
    const first = await js(client, cells.FIRST, BIND_MS);
    if (!first.cell?.ok) throw new Error(`the warm connection's first cell failed: ${first.failure ?? first.cell?.error}`);
    await measure(client, 'warm.noop', samples, cells.NOOP);
    await measure(client, 'warm.getState', samples, cells.GET_STATE);
    await measure(client, 'warm.listApps', samples, cells.LIST_APPS);

    const bind = guard(await js(client, cells.BIND, BIND_MS), 'cua.getApp(TextEdit)');
    const approvals = client.elicited.splice(0);
    row('bind.getApp', 1, bind, {approvals: approvals.length, textEditLaunched: !pre.textEditRunning});
    approvals.forEach((a, i) => emit({op: 'approval.elicitation', sample: i + 1, ok: a.action === 'accept', wallMs: round(a.at - bind.started), app: a.app, action: a.action,
      note: 'wallMs: from the start of the getApp call to the approval request; the harness answers at once'}));
    const helpers = classifyHelpers(remote(HELPER_SCRIPT), pre.runtimeRoot);
    meta.service = {surface: 'computer', engine: 'sky', answered: 'vendor', helper: helpers.length ? [...new Set(helpers.map(h => h.origin))].join(', ') : 'none observed', helpers};
    if (!bind.cell?.ok) throw new Error(`cua.getApp(TextEdit) failed: ${bind.cell?.error ?? bind.failure}`);
    meta.textEdit.launchedByRun = !pre.textEditRunning;

    const scratch = guard(await js(client, cells.NEW_DOCUMENT), 'the scratch document');
    row('setup.newDocument', 1, scratch);
    if (!scratch.cell?.ok) throw new Error(`no scratch document: ${scratch.cell?.error ?? scratch.failure}`);
    await measure(client, 'warm.getAXState', samples, cells.AX_FULL);
    await measure(client, 'warm.getScreenshot', samples, cells.SCREENSHOT);

    for (let sample = 1; sample <= tasks; sample++) {
      const steps = [];
      const act = guard(await js(client, cells.TASK_ACT), `task ${sample}`);
      steps.push(row('task.act', sample, act));
      if (act.cell?.ok) steps.push(row('task.verify', sample, guard(await js(client, cells.TASK_VERIFY), `task ${sample}`)));
      const close = guard(await js(client, cells.TASK_CLOSE), `task ${sample}`);
      steps.push(row('task.close', sample, close));
      const ok = steps.length === 3 && steps.every(s => s.ok);
      const sum = key => round(steps.reduce((total, s) => total + (s[key] ?? 0), 0));
      emit({op: 'task.total', sample, ok, wallMs: sum('wallMs'), inCellMs: sum('inCellMs'), cells: steps.length, actions: sum('actions'), observations: sum('observations'),
        outcome: ok ? 'typed text verified, document closed without saving' : steps.find(s => !s.ok)?.error ?? 'failed'});
      console.log(`task ${sample}: ${ok ? 'ok' : 'FAIL'}`);
      if (!close.cell?.ok && act.cell?.ok) { stopped = `task ${sample}'s document could not be confirmed closed: ${close.cell?.error ?? close.failure}`; throw new Stop(stopped); }
    }

    const closed = guard(await js(client, cells.CLOSE_SCRATCH), 'closing the scratch document');
    meta.textEdit.scratchClosed = Boolean(closed.cell?.ok);
    if (meta.textEdit.launchedByRun && closed.cell?.ok && !closed.cell.value.windowsLeft) {
      const quit = guard(await js(client, cells.QUIT_TEXTEDIT), 'quitting TextEdit');
      meta.textEdit.quitByRun = Boolean(quit.cell?.ok);
      if (!quit.cell?.ok) meta.textEdit.quitError = quit.cell?.error ?? quit.failure;
    }
    const started = performance.now();
    const ended = await client.call('end_task');
    emit({op: 'end_task', sample: 1, ok: ended.isError !== true, wallMs: round(performance.now() - started), ...(ended.isError ? {error: textOf(ended).slice(0, 300)} : {})});
    meta.complete = true;
  } catch (error) {
    meta.error = error.message;
    if (!(error instanceof Stop)) console.error(error.message);
  } finally {
    for (const client of clients) { try { await client.close(); } catch {} }
    const [serves, textEdit] = remote(LEFTOVER_SCRIPT).split(' ').map(Number);
    meta.leftovers = {serves, textEditRunning: textEdit > 0};
    if (serves) meta.complete = false;
    if (stopped) { meta.complete = false; meta.stopped = stopped; }
    meta.finished = new Date().toISOString();
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  }
  console.log(`${meta.complete ? 'complete' : `INCOMPLETE: ${meta.stopped ?? meta.error ?? 'leftover processes'}`}; leftovers: ${meta.leftovers.serves} serve(s), TextEdit ${meta.leftovers.textEditRunning ? 'running' : 'not running'}`);
  return meta.complete ? 0 : 1;
}

export function summary(dir) {
  const result = summarize(readRuns(resolve(dir)));
  writeFileSync(join(resolve(dir), 'summary.md'), renderMarkdown(result));
  for (const problem of result.problems) console.error(`problem: ${problem}`);
  return result.problems.length ? 1 : 0;
}

export async function main(argv = process.argv.slice(2)) {
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {
    device: {type: 'string'}, out: {type: 'string'}, samples: {type: 'string', default: '30'}, cold: {type: 'string', default: '5'}, tasks: {type: 'string', default: '10'}}});
  const [action, dir] = positionals;
  if (action === 'summary') { if (!dir) throw new Error('summary requires the evidence directory'); return summary(dir); }
  if (action !== 'run') throw new Error('Usage: native-baseline.mjs run --device <alias> --out <dir> | summary <dir>');
  if (!values.device || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(values.device)) throw new Error('run requires --device <ssh alias>');
  if (!values.out) throw new Error('run requires --out');
  const count = name => { const n = Number(values[name]); if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer`); return n; };
  return run({device: values.device, out: values.out, samples: count('samples'), cold: count('cold'), tasks: count('tasks')});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
}
