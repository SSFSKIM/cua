#!/usr/bin/env node
// The native (sky) performance baseline (#114, #116): what the native surface costs through a given REPL host, recorded
// before cua's own REPL host (#116) and native engine (#117) replace the vendor's, and compared after. It drives the real
// pinned runtime as the browser parity harness does (scripts/browser-parity.mjs): `cua serve` of the parity clone on the
// device over an ssh stdio pipe, an MCP client, js cells, every sample journaled. The surface is the native one
// (CUA_SHIM_SURFACES=computer; --surfaces browser measures a browser-only session's cold start instead, below) and the
// REPL host is the requested one (--host vendor|cua, CUA_REPL_HOST, independent of the browser service, which a
// computer-only serve does not use). The platform comes from the device: macOS drives
// TextEdit (scripts/native-baseline/macos.mjs), which must not be running when a run starts; Linux drives gedit in the X
// session (scripts/native-baseline/linux.mjs, discovered on that device), and no gedit may be running either. Either way
// every window the run touches is its own.
//
//   node scripts/native-baseline.mjs prepare --device <alias> --commit <reviewed SHA>
//   node scripts/native-baseline.mjs run --device <alias> --experiment <sitting-id> --host vendor|cua [--engine vendor|cua --approved-engine <bundle>] [--surfaces browser] --out <dir>/run-1
//     Run three fresh vendor controls and three own runs with one experiment id on the same device/controller.
//     --surfaces browser measures a browser-only session instead (#115 acceptance 11): the browser surface alone with
//     cua's browser service, the same cold connections and nothing else (no warm series, no native call, no app).
//     Every run installs the runtime and managed Node in its own private CUA_HOME, then removes that home after cleanup.
//     --node (cua only) is a recorded diagnostic override, never accepted by compare. Ambient CUA_NODE is cleared.
//     --display asserts the discovered display; it never guesses an X cookie or moves the run to another session.
//     --approved-runtime <CUA_HOME> (required for a macOS computer run): serve the runtime copy the owner approved in
//     place instead of a fresh install, whose new helper copy would raise the screen-capture confirmation again; the
//     run refuses if the serve would resolve any other copy. The home's state/ and run/ are the run's own (moved aside
//     and back), HOME is the account's and XDG_CONFIG_HOME the run's scratch (scripts/native-baseline/prepare.mjs).
//     meta.json records it as runtimeReuse, and measurement.freshInstall is false.
//     --engine vendor|cua and --approved-engine <the approved cua Engine.app> (both required for a macOS computer run,
//     #117; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Verification system part 1): the native engine,
//     selected apart from --host (CUA_NATIVE_ENGINE; --host vendor --engine cua is cua's service in the vendor trusted
//     worker, --host cua --engine vendor is refused), and the one approved engine of the device, served in place and
//     never built by a harness. The preparation stops the engine at the start and the end of the run, under the
//     admission (prepare.mjs); the run refuses unless the approved engine is the one named and its build is the
//     checkout's, and is complete only when every js result attests that engine and build (`_meta['cua/nativeEngine']`)
//     and the requested engine's own process started during the run (./native-baseline/engine.mjs). On cua's engine, a
//     cell that fails because the engine did not launch is recorded as that (meta.engineLaunch), never as a timing.
//     TextEdit is brought to the front after the bind (setup.activate, not judged), and every key cell runs only while
//     the run's TextEdit process is frontmost (#162, by pid).
//     Device declarations live in repl-parity/devices.mjs; native preparation needs no H4 home or Chrome binding.
//   node scripts/native-baseline.mjs summary docs/evidence/<dir>
//   node scripts/native-baseline.mjs compare <vendor-dir> <cua-dir> [--out comparison.md]
//   node scripts/native-baseline.mjs compare --same-host <before-dir> <after-dir> [--out comparison.md]
//     One host's runs before a change against its runs after it (#115 acceptance 11): the cold first_js rows judged,
//     only the declared configuration differences permitted, each recorded (compare.mjs compareSameHost).
//   node scripts/native-baseline.mjs compare --engines <vv-dir> <vc-dir> | --hosts <vc-dir> <cc-dir> | --end-to-end <vv-dir> <cc-dir> [--out comparison.md]
//     #117's comparisons A (engine and service), B (host only) and C (end to end), each between two triples of one
//     sitting, every row the default compare judges, and only the attested fields its mode names allowed to differ
//     (compare.mjs compareLanes).
//
// A run writes results.jsonl (one row per sample: op, sample, ok, wallMs, inCellMs, the service's cua/serviceMs and cua's
// engine's cua/engineMs where the result carried them, and the sample's counts) and
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
import {parseArgs, isDeepStrictEqual} from 'node:util';
import {execFileSync} from 'node:child_process';
import {arch, hostname, platform, release, cpus} from 'node:os';
import {declaredDevice} from './repl-parity/devices.mjs';
import {assertManagedNode} from './repl-parity/node-provenance.mjs';
import {nativePrepareCommand} from './repl-parity/topology.mjs';
import {appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {StdioClient, textOf} from './browser-parity/mcp.mjs';
import {execute, remoteCommand} from './browser-parity/topology.mjs';
import * as cells from './native-baseline/cells.mjs';
import {linuxAdapter} from './native-baseline/linux.mjs';
import {macosAdapter} from './native-baseline/macos.mjs';
import {assertOwnNode, assertSurface, handshakeScript, HOSTS, preflightScript, PROTOCOL_VERSION, serveCommand, preparationScript, SPIKE_SCRIPT} from './native-baseline/remote.mjs';
import {browserAdapter} from './native-baseline/browser.mjs';
import {DEFAULT_PLAN, hostProblem, readRuns, renderMarkdown, summarize} from './native-baseline/summary.mjs';
import {compare, compareLanes, compareSameHost, LANE_MODES, renderComparison} from './native-baseline/compare.mjs';
import {assertEngineOptions, attestEngine, checkApprovedEngine, engineProblem, launchFailureOf} from './native-baseline/engine.mjs';

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
  controllerLoad: () => execFileSync('uptime', [], {encoding:'utf8'}).trim(),
});

export async function run(options) {
  const {device, out, host, engine, approvedEngine, node, display, experiment, surface = 'computer', approvedRuntime, io = liveIo(device)} = options;
  const declaration = declaredDevice(device);
  if (!HOSTS.includes(host)) throw new Error('run requires --host vendor|cua');
  assertSurface(surface);
  assertOwnNode(host, node);
  assertEngineOptions({platform: declaration.platform, surface, host, engine, approvedEngine});
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(experiment ?? '')) throw new Error('run requires --experiment <same-sitting id>');
  // On macOS a native run serves the owner-approved runtime copy in place, never a fresh one (prepare.mjs).
  if (declaration.platform === 'darwin' && surface === 'computer' && !approvedRuntime)
    throw new Error('a macOS computer run needs --approved-runtime <CUA_HOME whose runtime copy the owner approved>: a fresh install would raise the screen-capture confirmation again');
  if (approvedRuntime !== undefined && !/^\/[^\0\n]*$/.test(approvedRuntime)) throw new Error('--approved-runtime needs an absolute path');
  const file = join(resolve(out), 'meta.json');
  if (existsSync(file) || existsSync(join(resolve(out),'preparation.json')) || existsSync(join(resolve(out),'results.jsonl'))) throw new Error('Output directory already contains a run');
  mkdirSync(resolve(out), {recursive:true});
  const prepared = JSON.parse(io.remote(preparationScript('prepare', {device, display, node, ...(approvedRuntime ? {approvedHome: approvedRuntime} : {})})).split('\n').at(-1));
  let code;
  try {
    writeFileSync(join(resolve(out),'preparation.json'),JSON.stringify(prepared,null,2)+'\n');
    code = await runPrepared({...options, surface, io, prepared});
  }
  finally {
    const meta = existsSync(file) ? JSON.parse(readFileSync(file,'utf8')) : null;
    // Do not remove a runtime while a surviving process may still use it; journal its ownership for explicit cleanup.
    if (meta?.leftovers?.serves > 0 || meta?.leftovers?.error) {
      meta.preparationCleanup = {removed:false, reason:'serve cleanup unconfirmed'}; meta.complete = false; code = 1;
    } else {
      try {
        const result = JSON.parse(io.remote(preparationScript('cleanup', prepared)).split('\n').at(-1));
        if (result.removed !== true) throw new Error('Scratch home removal was not confirmed');
        if (meta) meta.preparationCleanup = result;
        // The engine stop that ends every macOS computer run (prepare.mjs cleanupRun): one that would not stop fails it.
        if (meta && result.engineStop !== undefined) {
          meta.engineStop = {...meta.engineStop, end: result.engineStop};
          if (result.engineStop?.error) { meta.complete = false; meta.error ??= `cua's engine did not stop when the run ended: ${result.engineStop.error}`; code = 1; }
        }
      } catch (error) {
        if (!meta) throw error;
        meta.preparationCleanup = {removed:false, error:error.message}; meta.complete = false; code = 1;
      }
    }
    if (meta) writeFileSync(file, JSON.stringify(meta,null,2)+'\n');
  }
  return code;
}

async function runPrepared({device, out, host, engine, approvedEngine, node, experiment, prepared, surface, samples = DEFAULT_PLAN.samples, cold = DEFAULT_PLAN.cold, tasks = DEFAULT_PLAN.tasks, display = prepared.xSession.DISPLAY ?? ':0', spikeWaitMs = 3 * 3600_000, activateMs, io, log = console.log}) {
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
  const pre = JSON.parse(remote(preflightScript({host, engine, approvedEngine, display, node, prepared, surface})).split('\n').at(-1));
  pre.xSession = prepared.xSession; pre.userHome = prepared.userHome;
  if (declaredDevice(device).platform !== pre.platform) throw new Error('Device platform does not match its declaration');
  if (!ADAPTERS[pre.platform]) throw new Error(`the native baseline has no adapter for ${pre.platform}`);
  const adapter = surface === 'browser' ? browserAdapter(ADAPTERS[pre.platform]) : ADAPTERS[pre.platform];
  if (pre.dirty) throw new Error('the parity clone is dirty');
  if (!pre.release) throw new Error('no runtime installed in the device home');
  if (!pre.sandbox?.mode) throw new Error(`the serve's sandbox policy could not be resolved on the device (${pre.sandbox?.error ?? 'not reported'})`);
  const refusal = adapter.refuse(pre);
  if (refusal) throw new Error(refusal);
  if (pre.serves) throw new Error('a serve of the parity clone is already running on the device');
  if (node !== undefined && !pre.ownNode?.version) throw new Error(`the own host's Node ${node} did not run on the device`);

  if (node === undefined) assertManagedNode({home: prepared.home, ownNode: pre.ownNode});
  const reuse = prepared.runtimeReuse ?? null;
  if (reuse && (pre.home !== reuse.approvedHome || pre.runtimeRoot !== reuse.runtimeRoot))
    throw new Error(`the serve resolves the runtime ${pre.runtimeRoot}, not the approved ${reuse.runtimeRoot}; refusing rather than serving another copy`);
  // A macOS computer run (#117): the engine was stopped at preparation, and the approved engine the serve will resolve is
  // the one named, built from this checkout (./native-baseline/engine.mjs). The record collects the attestation.
  let nativeEngine = null;
  if (pre.platform === 'darwin' && surface === 'computer') {
    if (!prepared.engineStop) throw new Error('the device\'s preparation did not stop cua\'s engine (every live run begins with cua engine stop, scripts/native-baseline/prepare.mjs): is the parity clone at this checkout\'s commit?');
    const {approved, checkoutBuild} = checkApprovedEngine(pre.engine, approvedEngine);
    nativeEngine = {requested: engine, approved, checkoutBuild, attested: [], unattested: 0};
  }

  mkdirSync(dir, {recursive: true});
  writeFileSync(join(dir, 'results.jsonl'), '');
  const emit = row => { appendFileSync(join(dir, 'results.jsonl'), JSON.stringify(row) + '\n'); return row; };
  const linux = pre.platform === 'linux';
  const meta = {measurement: {schema:2, experiment, freshInstall:!reuse}, ...(reuse ? {runtimeReuse: reuse} : {}), nodeMode: node ? 'diagnostic-override' : 'managed',
    preparation: prepared, controllerIdentity: io.controllerIdentity ?? {hostname:hostname(),platform:platform(),arch:arch(),os:release(),node:process.version,cpu:{model:cpus()[0]?.model,count:cpus().length}}, userHome: prepared.userHome, xSession: prepared.xSession,
    deviceIdentity: {alias:device,arch:pre.arch,hostname:pre.hostname,os:pre.os,cpu:pre.cpu},
    load: {device:{before:pre.uptime,after:null},controller:{before:io.controllerLoad(),after:null}},
    device, platform: pre.platform, host, surface, hostAttestations: [], connections: 0, protocolVersion: PROTOCOL_VERSION,
    environment: {CUA_REPL_HOST: host, ...(engine === undefined ? {} : {CUA_NATIVE_ENGINE: engine}), ...(node === undefined ? {} : {CUA_NODE: node}), CUA_SHIM_SURFACES: surface, CUA_SHIM_PERSIST: 'session', CUA_SHIM_SECRETS: 'off', ...(linux ? prepared.xSession : {})},
    plan: {samples, cold, tasks, coldPlan: COLD_PLAN}, started: new Date().toISOString(), spikeWaitMs: Date.now() - waitStarted, elicitations: [], complete: false,
    ...(nativeEngine ? {nativeEngine, engineStop: {start: prepared.engineStop}} : {})};
  Object.assign(meta, {commit: pre.commit, checkout: pre.checkout, home: pre.home, node: pre.node, ...(pre.ownNode ? {ownNode: pre.ownNode} : {}), runtime: {release: pre.release}, sandbox: pre.sandbox, hardware: pre.hardware, os: pre.os, display: pre.display});
  adapter.start(meta, pre);
  log(`device ${device} (${pre.platform}): ${[pre.hardware?.model, pre.hardware?.chip].filter(Boolean).join(', ')} ${pre.os?.name ?? ''} ${pre.os?.version ?? ''}, runtime ${pre.release}, clone ${pre.commit.slice(0, 10)}, host ${host}${nativeEngine ? `, engine ${engine} (approved build ${nativeEngine.approved.build.slice(0, 12)})` : ''}, ${surface} surface`);
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
    const client = io.connect({...serveCommand({device, checkout: pre.checkout, home: pre.home, userHome: prepared.userHome, configHome: prepared.configHome, tmpdir: prepared.tmpdir, admission: prepared.admission, xSession:prepared.xSession, host, engine, platform: pre.platform, display, node, surface}), clientName: 'cua-native-baseline',
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
  // host that answered it, the Node it ran on and what confined its children (the sandbox launch witness, checked for
  // every connection when the run ends).
  const js = async (client, code, timeoutMs = CELL_MS) => {
    const started = performance.now();
    let result;
    try { result = await client.request('tools/call', {name: 'js', arguments: {code, timeout_ms: timeoutMs}}, timeoutMs + 15_000); } catch (error) {
      return {wallMs: performance.now() - started, started, failure: error.message, timedOut: /timed out/.test(error.message)};
    }
    attestEngine(meta.nativeEngine, result);
    if (!client.attested) {
      meta.hostAttestations.push(hostAttestationOf(client.serverInfo, result)); client.attested = true;
      const answering = result?._meta?.['cua/nativeExecution'];
      if (!answering?.path || !answering?.version) throw new Error('Missing answering Node executable/version on real call');
      if (host === 'cua' && !isDeepStrictEqual(answering, pre.ownNode)) throw new Error('The answering Node differs from the prepared own host Node');
      if (meta.answeringNode && !isDeepStrictEqual(answering, meta.answeringNode)) throw new Error('The answering Node changed between connections');
      meta.answeringNode = answering;
      meta.sandboxLaunch ??= result?._meta?.['cua/sandboxLaunch'] ?? null;
    }
    const text = textOf(result), cell = cells.parseCell(text);
    const timedOut = !cell && /timed? ?out|timeout/i.test(text);
    const engineMs = result?._meta?.['cua/engineMs'], serviceMs = result?._meta?.['cua/serviceMs'];
    return {wallMs: performance.now() - started, started, text, cell, isError: result.isError === true, timedOut, ...(Number.isFinite(engineMs) ? {engineMs} : {}),
      ...(Number.isFinite(serviceMs) ? {serviceMs} : {}),
      failure: cell ? null : (text.split('\n').filter(Boolean).at(-1) ?? 'no output').slice(0, 300)};
  };
  // On cua's engine, a cell that failed because the engine did not come up is the engine's launch failure: the run stops
  // there and records it (meta.engineLaunch), and no row is written for it, so it is never read as a timing. The first
  // call into the engine launches it (prepare.mjs stopped it), through the host's relay.
  let engineAnswered = false;
  const launchFailed = (op, sample, error) => {
    const via = host === 'vendor' ? 'the vendor host\'s relay (open -a)' : 'cua\'s own host\'s relay (open -n -g -a)';
    meta.engineLaunch = {ok: false, op, sample, via, error};
    stop(`cua's engine did not launch: ${op} sample ${sample}, ${engineAnswered ? 'after earlier calls had reached it (it stopped and did not come up again)' : 'the run\'s first call into it'}, failed launching it through ${via}: ${error}`);
  };
  // A sample's row: a value carrying `invalid` (its target was not the scratch document) is not a success.
  const record = (op, sample, r, extra = {}) => {
    if (meta.nativeEngine?.requested === 'cua') {
      const failed = launchFailureOf(r);
      if (failed) launchFailed(op, sample, failed);
      if (r.cell?.ok && op !== 'warm.noop') engineAnswered = true;
    }
    const value = r.cell?.ok ? r.cell.value ?? {} : null;
    const ok = Boolean(value) && !value.invalid;
    // engineMs: cua's service's cua/engineMs, the socket round trip of the cell's last engine call (results merge it by
    // key), kept to attribute a row's time between the engine and the rest; recorded, never judged. serviceMs: the
    // wrapper's cua/serviceMs (src/services/sky.mjs), its time around the service on either engine's lane, which
    // separates the host's transport from everything below it on a single-call row (comparison A); recorded, never
    // judged, and on a multi-call cell its last call's.
    return {op, sample, ok, wallMs: round(r.wallMs), ...(r.cell?.inCellMs !== undefined ? {inCellMs: round(r.cell.inCellMs)} : {}),
      ...(r.engineMs !== undefined ? {engineMs: round(r.engineMs)} : {}), ...(r.serviceMs !== undefined ? {serviceMs: round(r.serviceMs)} : {}),
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
  const ctx = {meta, pre, device: ops, samples, tasks, activateMs, log, emit, record, row, guard, stop, measure, helperAttestation,
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

    // The warm connection and the target's part: the native surface only. A browser-surface run is its cold rows.
    if (surface === 'computer') {
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
    }
    meta.complete = true;
  } catch (error) {
    meta.error = error.message;
    if (!(error instanceof Stop)) log(error.message);
  } finally {
    try { await adapter.cleanup(ctx); } catch (error) { meta.cleanupError = error.message; meta.complete = false; }
    for (const client of clients) { try { await client.close(); } catch {} }
    try {
      meta.leftovers = adapter.leftovers(ops);
      if (adapter.leftBehind(meta.leftovers, pre)) meta.complete = false;
    } catch (error) { meta.leftovers = {error: error.message}; meta.complete = false; }
    if (stopped) { meta.complete = false; meta.stopped = stopped; }
    // Every connection must have attested the requested host; an unattested or mixed run is not a measurement of it.
    const nodeProof = meta.hostAttestations.every(a => isDeepStrictEqual(a?._meta?.['cua/nativeExecution'], meta.answeringNode));
    if (!meta.answeringNode || !nodeProof) { meta.complete = false; meta.error ??= 'Missing or inconsistent answering Node witness'; }
    const launchProof = meta.hostAttestations.every(a => isDeepStrictEqual(a?._meta?.['cua/sandboxLaunch'], meta.sandboxLaunch));
    if (!meta.sandboxLaunch || !launchProof) { meta.complete = false; meta.error ??= 'Missing or inconsistent sandbox launch witness'; }
    const attestation = hostProblem(meta, 'this run');
    if (attestation) { meta.complete = false; meta.error ??= attestation; meta.attestationProblem = attestation; }
    // Every result attested the requested engine at the approved build, and its own process was the one the run started.
    const engineIssue = engineProblem(meta, 'this run');
    if (engineIssue) { meta.complete = false; meta.error ??= engineIssue; meta.engineAttestationProblem = engineIssue; }
    try { meta.load.device.after = remote('uptime'); meta.load.controller.after = io.controllerLoad(); }
    catch (error) { meta.complete = false; meta.error ??= `Load recording failed: ${error.message}`; }
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

// Compares the vendor host's runs under `baselineDir` with cua's under `candidateDir`; with `sameHost` one host's runs
// before a change with its runs after it; with `lanes` (a LANE_MODES key: engines, hosts, end-to-end) the two lanes that
// comparison names (scripts/native-baseline/compare.mjs). Prints the comparison, or writes it to `out`, and the verdict
// line. -> 0 only on a PASS verdict.
export function compareDirs(baselineDir, candidateDir, {out, sameHost = false, lanes} = {}) {
  const [baseline, candidate] = [baselineDir, candidateDir].map(dir => readRuns(resolve(dir)));
  const result = lanes ? compareLanes(lanes, baseline, candidate) : (sameHost ? compareSameHost : compare)(baseline, candidate);
  const text = renderComparison(result);
  if (out) writeFileSync(resolve(out), text); else process.stdout.write(text);
  for (const problem of result.problems) console.error(`problem: ${problem}`);
  console.error(`VERDICT: ${result.verdict}`);
  return result.verdict === 'PASS' ? 0 : 1;
}

export async function main(argv = process.argv.slice(2)) {
  const {values, positionals} = parseArgs({args: argv, allowPositionals: true, options: {
    device: {type: 'string'}, host: {type: 'string'}, engine: {type: 'string'}, node: {type: 'string'}, display: {type: 'string'}, experiment: {type:'string'}, commit:{type:'string'}, out: {type: 'string'},
    surfaces: {type: 'string', default: 'computer'}, 'same-host': {type: 'boolean', default: false}, 'approved-runtime': {type: 'string'}, 'approved-engine': {type: 'string'},
    ...Object.fromEntries(Object.keys(LANE_MODES).map(mode => [mode, {type: 'boolean', default: false}])),
    samples: {type: 'string', default: String(DEFAULT_PLAN.samples)}, cold: {type: 'string', default: String(DEFAULT_PLAN.cold)}, tasks: {type: 'string', default: String(DEFAULT_PLAN.tasks)}}});
  const [action, dir, other] = positionals;
  if (action === 'prepare') { process.stdout.write(execute(nativePrepareCommand({device:values.device,commit:values.commit}))); return 0; }
  if (action === 'summary') { if (!dir) throw new Error('summary requires the evidence directory'); return summary(dir); }
  if (action === 'compare') {
    const modes = ['same-host', ...Object.keys(LANE_MODES)].filter(mode => values[mode]);
    if (modes.length > 1) throw new Error(`compare takes one of --same-host, ${Object.values(LANE_MODES).map(m => m.flag).join(', ')}, not ${modes.map(m => `--${m}`).join(' and ')}`);
    const lanes = modes[0] && modes[0] !== 'same-host' ? modes[0] : undefined;
    if (!dir || !other) throw new Error(lanes ? `compare ${LANE_MODES[lanes].flag} requires ${LANE_MODES[lanes].usage}` : values['same-host'] ? 'compare --same-host requires <before-dir> <after-dir>' : 'compare requires <vendor-dir> <cua-dir>');
    return compareDirs(dir, other, {out: values.out, sameHost: values['same-host'], lanes});
  }
  if (action !== 'run') throw new Error('Usage: native-baseline.mjs prepare --device <declared alias> --commit <SHA> | run --device <declared alias> --experiment <sitting-id> --host vendor|cua [--engine vendor|cua --approved-engine <cua Engine.app>, macOS computer runs] [--surfaces computer|browser] [--approved-runtime <CUA_HOME>, macOS computer runs] [--node <diagnostic override, cua only>] [--display <X display assertion>] --out <dir> | summary <dir> | compare <vendor-dir> <cua-dir> [--out <file>] | compare --same-host <before-dir> <after-dir> [--out <file>] | compare --engines <vv-dir> <vc-dir> | --hosts <vc-dir> <cc-dir> | --end-to-end <vv-dir> <cc-dir> [--out <file>]');
  if (!values.device || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(values.device)) throw new Error('run requires --device <ssh alias>');
  if (!HOSTS.includes(values.host)) throw new Error('run requires --host vendor|cua');
  if (!values.out) throw new Error('run requires --out');
  const count = name => { const n = Number(values[name]); if (!Number.isInteger(n) || n < 1) throw new Error(`--${name} must be a positive integer`); return n; };
  assertSurface(values.surfaces);
  return run({device: values.device, host: values.host, engine: values.engine, approvedEngine: values['approved-engine'], surface: values.surfaces, node: values.node, display: values.display, approvedRuntime: values['approved-runtime'], experiment:values.experiment, out: values.out, samples: count('samples'), cold: count('cold'), tasks: count('tasks')});
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }, error => { console.error(error.message); process.exitCode = 1; });
}
