#!/usr/bin/env node
// The native (sky) performance baseline (#114, #116): what the native surface costs through a given REPL host, recorded
// before cua's own REPL host (#116) and native engine (#117) replace the vendor's, and compared after. It drives the real
// pinned runtime as the browser parity harness does (scripts/browser-parity.mjs): `cua serve` of the parity clone on the
// device over an ssh stdio pipe, an MCP client, js cells, every sample journaled. The surface is the native one
// (CUA_SHIM_SURFACES=computer) and the REPL host is the requested one (--host vendor|cua, CUA_REPL_HOST, independent of
// the browser service, which a computer-only serve does not use). The platform comes from the device: macOS drives
// TextEdit (scripts/native-baseline/macos.mjs), which must not be running when a run starts; Linux drives gedit in the X
// session (scripts/native-baseline/linux.mjs, --display, default :0), and no gedit may be running either. Either way
// every window the run touches is its own.
//
//   node scripts/native-baseline.mjs run --device <alias> --host vendor|cua [--node <path>] --out docs/evidence/<dir>/run-1
//     --node (cua only): the absolute path of the device's Node for cua's own host, passed as CUA_NODE in the serve's
//     command environment; the serve itself runs on the device's node, as the vendor baseline's does.
//   node scripts/native-baseline.mjs summary docs/evidence/<dir>
//   node scripts/native-baseline.mjs compare <vendor-dir> <cua-dir> [--out comparison.md]
//
// A run writes results.jsonl (one row per sample: op, sample, ok, wallMs, inCellMs and the sample's counts) and
// meta.json (what it ran against: platform, commit, Node, runtime release, sandbox policy, hardware, OS, display, the
// requested host and
// what answered each connection (hostAttestations: initialize's serverInfo and the first js result's _meta), the helper,
// approvals, the processes it owned and what was left). `summary` pools the run-* directories into summary.md
// (scripts/native-baseline/summary.mjs); `compare` judges cua's runs against the vendor's (compare.mjs, acceptance 8).
// What a run measures, in order:
//   ssh.roundtrip        `ssh <device> true`, the pipe's own cost, to read the cold numbers against
//   cold.<miss|hit>.*    a fresh `cua serve`: initialize, tools/list, the first js cell (bootstrap and API document);
//                        the selected host's handshake record is cleared before a planned miss and kept for a hit, and
//                        each connection is labelled by the record observed just before it started
//   warm.noop, warm.getState, warm.listApps     on one warm connection
//   the target's part (the platform adapter): binding the app (bind.getApp; on macOS its approval, answered by the
//                        harness and timed apart as approval.elicitation), warm.getAXState and warm.getScreenshot of
//                        the run's own scratch window, the observe -> act -> verify task (task.*), and on Linux the
//                        method cases (method.*: typeText and paste on windows of their own, the binder's refusals)
//   end_task
// Nothing a cell returns is screen content: counts, lengths, booleans, ids, hashes and the vendor's error sentences
// (scripts/native-baseline/cells.mjs, linux-cells.mjs). A cell that times out stops all further GUI input (something
// may be waiting on the device; the harness never answers a permission prompt).
import {parseArgs} from 'node:util';
import {appendFileSync, existsSync, mkdirSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioClient, textOf} from './browser-parity/mcp.mjs';
import {execute, remoteCommand} from './browser-parity/topology.mjs';
import * as cells from './native-baseline/cells.mjs';
import {linuxAdapter} from './native-baseline/linux.mjs';
import {macosAdapter} from './native-baseline/macos.mjs';
import {assertOwnNode, handshakeScript, HOSTS, preflightScript, PROTOCOL_VERSION, serveCommand, SPIKE_SCRIPT} from './native-baseline/remote.mjs';
import {hostProblem, readRuns, renderMarkdown, summarize} from './native-baseline/summary.mjs';
import {compare, renderComparison} from './native-baseline/compare.mjs';

// Cold connections cycle through this plan; each is labelled by the record it found.
const COLD_PLAN = ['miss', 'hit', 'miss', 'hit', 'hit'];
const CELL_MS = 60_000;
const BIND_MS = 120_000;
const ADAPTERS = {darwin: macosAdapter, linux: linuxAdapter};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const round = ms => Math.round(ms * 1000) / 1000;

class Stop extends Error {}

// What answered one connection (the hostAttestation ruling, docs/doperpowers/specs/2026-10-14-own-repl-host-design.md
// Decision Log): initialize's serverInfo as returned, and the _meta of the connection's first real js result (null when
// it had none). The observed host is cua when either carries cua's own marker, else vendor; scripts/bench-summary.mjs
// validateHostAttestations judges it against the requested host.
export function hostAttestationOf(serverInfo, toolResult) {
  const meta = toolResult?._meta ?? null;
  const own = meta?.['cua/replHost']?.host === 'cua' || serverInfo?.name === 'cua-repl-host';
  return {host: own ? 'cua' : 'vendor', serverInfo: serverInfo ?? null, _meta: meta};
}

// The live device: scripts over `ssh <device>`, the parity clone's serve over an ssh stdio pipe. Tests pass doubles.
const liveIo = device => ({
  remote: script => execute(remoteCommand(device, script)).trim(),
  connect: options => new StdioClient(options),
});

export async function run({device, out, host, node, samples = 30, cold = 5, tasks = 10, display = ':0', spikeWaitMs = 3 * 3600_000, io = liveIo(device), log = console.log}) {
  if (device === 'local') throw new Error('the native baseline runs on a device (--device <ssh alias>), never on this machine');
  if (!HOSTS.includes(host)) throw new Error('run requires --host vendor|cua');
  assertOwnNode(host, node);
  const dir = resolve(out);
  if (existsSync(join(dir, 'meta.json')) || existsSync(join(dir, 'results.jsonl'))) throw new Error('Output directory already contains a run');
  const remote = io.remote;

  // Waits for the device's cua-116-spike work to finish: two measurements must not share the helper.
  const waitStarted = Date.now();
  while (remote(SPIKE_SCRIPT) === 'running') {
    if (Date.now() - waitStarted > spikeWaitMs) throw new Error('a cua-116-spike process is still running on the device');
    log('waiting for cua-116-spike on the device to finish');
    await sleep(30_000);
  }
  const pre = JSON.parse(remote(preflightScript({host, display, node})).split('\n').at(-1));
  const adapter = ADAPTERS[pre.platform];
  if (!adapter) throw new Error(`the native baseline has no adapter for ${pre.platform}`);
  if (pre.dirty) throw new Error('the parity clone is dirty');
  if (!pre.release) throw new Error('no runtime installed in the device home');
  if (!pre.sandbox?.mode) throw new Error(`the serve's sandbox policy could not be resolved on the device (${pre.sandbox?.error ?? 'not reported'})`);
  const refusal = adapter.refuse(pre);
  if (refusal) throw new Error(refusal);
  if (pre.serves) throw new Error('a serve of the parity clone is already running on the device');
  if (node !== undefined && !pre.ownNode?.version) throw new Error(`the own host's Node ${node} did not run on the device`);

  mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'results.jsonl'), '');
  const emit = row => { appendFileSync(join(dir, 'results.jsonl'), JSON.stringify(row) + '\n'); return row; };
  const linux = pre.platform === 'linux';
  const meta = {device, platform: pre.platform, host, hostAttestations: [], connections: 0, protocolVersion: PROTOCOL_VERSION,
    environment: {CUA_REPL_HOST: host, ...(node === undefined ? {} : {CUA_NODE: node}), CUA_SHIM_SURFACES: 'computer', CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: 'off', ...(linux ? {DISPLAY: display, XAUTHORITY: '~/.Xauthority'} : {})},
    plan: {samples, cold, tasks, coldPlan: COLD_PLAN}, started: new Date().toISOString(), spikeWaitMs: Date.now() - waitStarted, elicitations: [], complete: false};
  Object.assign(meta, {commit: pre.commit, checkout: pre.checkout, home: pre.home, node: pre.node, ...(pre.ownNode ? {ownNode: pre.ownNode} : {}), runtime: {release: pre.release}, sandbox: pre.sandbox, hardware: pre.hardware, os: pre.os, display: pre.display});
  adapter.start(meta, pre);
  log(`device ${device} (${pre.platform}): ${[pre.hardware?.model, pre.hardware?.chip].filter(Boolean).join(', ')} ${pre.os?.name ?? ''} ${pre.os?.version ?? ''}, runtime ${pre.release}, clone ${pre.commit.slice(0, 10)}, host ${host}`);
  const ops = io.device ? io.device(adapter, {pre, display}) : adapter.device(remote, {pre, display});

  const clients = new Set();
  let stopped = null;   // why no further GUI input is sent
  let warm = null;      // the warm connection, while it is open

  // The computer-use helpers running now, each with its age; one that started during this run was launched by it.
  const runStarted = Date.now();
  const helperAttestation = () => {
    const helpers = ops.helpers().map(h => ({...h, startedDuringRun: h.ageSeconds !== null && h.ageSeconds * 1000 < Date.now() - runStarted}));
    return {helper: helpers.length ? [...new Set(helpers.map(h => h.origin))].join(', ') : 'none observed', helpers};
  };
  meta.helperAtStart = helperAttestation();
  const connect = () => {
    const client = io.connect({...serveCommand({device, checkout: pre.checkout, home: pre.home, host, platform: pre.platform, display, node}), clientName: 'cua-native-baseline',
      answer: adapter.answer,
      onElicitation: (row, msg) => {
        const entry = {t: row.t, at: performance.now(), app: msg.params?._meta?.tool_params?.app ?? null, action: row.action};
        meta.elicitations.push(entry); client.elicited.push(entry);
      }});
    client.elicited = [];
    client.attested = false;
    meta.connections++;
    clients.add(client);
    return client;
  };
  const initialize = async client => { client.serverInfo = (await client.initialize())?.serverInfo ?? null; };
  // A js cell: harness wall time around the call, and the cell's own report. A connection's first result attests the
  // host that answered it.
  const js = async (client, code, timeoutMs = CELL_MS) => {
    const started = performance.now();
    let result;
    try { result = await client.request('tools/call', {name: 'js', arguments: {code, timeout_ms: timeoutMs}}, timeoutMs + 15_000); } catch (error) {
      return {wallMs: performance.now() - started, started, failure: error.message, timedOut: /timed out/.test(error.message)};
    }
    if (!client.attested) { meta.hostAttestations.push(hostAttestationOf(client.serverInfo, result)); client.attested = true; }
    const text = textOf(result), cell = cells.parseCell(text);
    const timedOut = !cell && /timed? ?out|timeout/i.test(text);
    return {wallMs: performance.now() - started, started, text, cell, isError: result.isError === true, timedOut,
      failure: cell ? null : (text.split('\n').filter(Boolean).at(-1) ?? 'no output').slice(0, 300)};
  };
  // A sample's row: a value carrying `invalid` (its target was not the scratch document) is not a success.
  const record = (op, sample, r, extra = {}) => {
    const value = r.cell?.ok ? r.cell.value ?? {} : null;
    const ok = Boolean(value) && !value.invalid;
    return {op, sample, ok, wallMs: round(r.wallMs), ...(r.cell?.inCellMs !== undefined ? {inCellMs: round(r.cell.inCellMs)} : {}),
      ...(value ?? {error: r.cell?.error ?? r.failure ?? 'failed'}), ...extra};
  };
  const row = (op, sample, r, extra = {}) => emit(record(op, sample, r, extra));
  const stop = reason => { stopped = reason; throw new Stop(reason); };
  // A cell whose answer did not come stops the GUI work: something may be waiting on a human.
  const guard = (r, what) => {
    if (r.timedOut) stop(`${what} timed out; no further input was sent (a prompt may be waiting on the device, never answered by the harness)`);
    return r;
  };
  // `hold`: the rows are returned, not written, for a caller that validates the series afterwards.
  const measure = async (op, n, code, {hold = false} = {}) => {
    const rows = [];
    for (let sample = 1; sample <= n; sample++) {
      const r = record(op, sample, guard(await js(warm, code), `${op} sample ${sample}`));
      rows.push(hold ? r : emit(r));
    }
    log(`${op}: ${rows.filter(r => r.ok).length}/${n} ok`);
    return rows;
  };
  // What the platform adapter works with: the warm connection's cells, the rows and the device.
  const ctx = {meta, pre, device: ops, samples, tasks, log, emit, record, row, guard, stop, measure, helperAttestation,
    js: (code, timeoutMs) => js(warm, code, timeoutMs), elicited: () => warm.elicited.splice(0), warmOpen: () => warm !== null, stopped: () => stopped !== null};

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
      let totalWritten = false;
      const phase = (name, wallMs, extra = {}) => emit({op: `cold.${label}.${name}`, sample, wallMs: round(wallMs), planned, ...extra});
      try {
        await initialize(client);
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
        totalWritten = true;
        // The connection's cleanup is not part of the cold start: its failure is its own row.
        const ended = await client.call('end_task');
        if (ended.isError) emit({op: `cold.${label}.end_task`, sample, planned, ok: false, error: textOf(ended).slice(0, 300)});
      } catch (error) {
        if (error instanceof Stop) throw error;
        emit(totalWritten ? {op: `cold.${label}.end_task`, sample, planned, ok: false, error: error.message}
          : {op: `cold.${label}.total`, sample, planned, ok: false, wallMs: round(performance.now() - t0), error: error.message});
      } finally {
        await client.close(); clients.delete(client);
      }
      log(`cold ${sample}: handshake ${label} (planned ${planned})`);
    }

    // The warm connection.
    const client = warm = connect();
    await initialize(client);
    await client.request('tools/list');
    const first = await js(client, cells.FIRST, BIND_MS);
    if (!first.cell?.ok) throw new Error(`the warm connection's first cell failed: ${first.failure ?? first.cell?.error}`);
    await measure('warm.noop', samples, cells.NOOP);
    await measure('warm.getState', samples, cells.GET_STATE);
    const listed = await measure('warm.listApps', samples, cells.LIST_APPS);
    // An engine that answers no inventory call is not driven any further: no app is bound or launched.
    if (!listed.some(r => r.ok)) throw new Error(`the native engine answered no listApps call (${listed[0]?.error}); no GUI step was attempted`);

    await adapter.gui(ctx);

    if (adapter.beforeEnd) await adapter.beforeEnd(ctx);
    const started = performance.now();
    const ended = await client.call('end_task');
    emit({op: 'end_task', sample: 1, ok: ended.isError !== true, wallMs: round(performance.now() - started), ...(ended.isError ? {error: textOf(ended).slice(0, 300)} : {})});
    meta.complete = true;
  } catch (error) {
    meta.error = error.message;
    if (!(error instanceof Stop)) console.error(error.message);
  } finally {
    try { await adapter.cleanup(ctx); } catch (error) { meta.cleanupError = error.message; meta.complete = false; }
    for (const client of clients) { try { await client.close(); } catch {} }
    try {
      meta.leftovers = adapter.leftovers(ops);
      if (adapter.leftBehind(meta.leftovers, pre)) meta.complete = false;
    } catch (error) { meta.leftovers = {error: error.message}; meta.complete = false; }
    if (stopped) { meta.complete = false; meta.stopped = stopped; }
    // Every connection must have attested the requested host; an unattested or mixed run is not a measurement of it.
    const attestation = hostProblem(meta, 'this run');
    if (attestation) { meta.complete = false; meta.error ??= attestation; meta.attestationProblem = attestation; }
    meta.finished = new Date().toISOString();
    writeFileSync(join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  }
  log(`${meta.complete ? 'complete' : `INCOMPLETE: ${meta.stopped ?? meta.error ?? 'leftover processes'}`}; leftovers: ${JSON.stringify(meta.leftovers)}`);
  return meta.complete ? 0 : 1;
}

export function summary(dir) {
  const result = summarize(readRuns(resolve(dir)));
  writeFileSync(join(resolve(dir), 'summary.md'), renderMarkdown(result));
  for (const problem of result.problems) console.error(`problem: ${problem}`);
  return result.problems.length ? 1 : 0;
}

// Compares the vendor host's runs under `baselineDir` with cua's under `candidateDir` (scripts/native-baseline/compare.mjs);
// prints the comparison, or writes it to `out`. -> 0 only on a PASS verdict.
export function compareDirs(baselineDir, candidateDir, {out} = {}) {
  const result = compare(readRuns(resolve(baselineDir)), readRuns(resolve(candidateDir)));
  const text = renderComparison(result);
  if (out) writeFileSync(resolve(out), text); else process.stdout.write(text);
  for (const problem of result.problems) console.error(`problem: ${problem}`);
  console.error(`verdict: ${result.verdict}`);
  return result.verdict === 'PASS' ? 0 : 1;
}

export async function main(argv = process.argv.slice(2)) {
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {
    device: {type: 'string'}, host: {type: 'string'}, node: {type: 'string'}, display: {type: 'string', default: ':0'}, out: {type: 'string'},
    samples: {type: 'string', default: '30'}, cold: {type: 'string', default: '5'}, tasks: {type: 'string', default: '10'}}});
  const [action, dir, other] = positionals;
  if (action === 'summary') { if (!dir) throw new Error('summary requires the evidence directory'); return summary(dir); }
  if (action === 'compare') { if (!dir || !other) throw new Error('compare requires <vendor-dir> <cua-dir>'); return compareDirs(dir, other, {out: values.out}); }
  if (action !== 'run') throw new Error('Usage: native-baseline.mjs run --device <alias> --host vendor|cua [--node <own host Node, cua only>] [--display :0] --out <dir> | summary <dir> | compare <vendor-dir> <cua-dir> [--out <file>]');
  if (!values.device || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(values.device)) throw new Error('run requires --device <ssh alias>');
  if (!HOSTS.includes(values.host)) throw new Error('run requires --host vendor|cua');
  if (!values.out) throw new Error('run requires --out');
  const count = name => { const n = Number(values[name]); if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer`); return n; };
  return run({device: values.device, host: values.host, node: values.node, display: values.display, out: values.out, samples: count('samples'), cold: count('cold'), tasks: count('tasks')});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
}
