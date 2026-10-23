#!/usr/bin/env node
// Opt-in live sentinel probe of native secret substitution (M5). It needs the installed runtime in $CUA_HOME. Its
// secrets live in a store it owns: a temporary $HOME (scripts/accept/secret-seed.mjs) whose .config/claude-secrets
// holds one generated key, stored and then replaced with generated sentinel values through `cua secrets set` typed at
// a pseudo-terminal, and removed with the temporary home in `finally`. Every server it starts resolves its store from
// that $HOME, so the account's own store (~/.config/claude-secrets) is never read or written.
//
//   node scripts/probe-secrets.mjs [--report <file>]
//
// Path under test, with no GUI and no native delivery: MCP client -> `cua serve` -> vendor cua-repl -> node_repl ->
// sandboxed kernel cell -> nodeRepl.rpc("sky") -> trusted worker -> src/services/sky.mjs (src/secrets/store.mjs) ->
// the store file in the temporary $HOME -> substitution -> a CONTROLLED FAKE target module standing in
// for the vendor sky service. The fake target forwards each request it receives, over nativePipe, to a recorder
// socket owned by this probe, which is the only place a value is allowed to arrive.
//   target connections (scripts/probe/serve-fake-sky-target.mjs): paste/type_text/set_value substitution, ordinary
//     input, a marker in an unsupported method, unknown/invalid label, unsupported shape, a target failure whose error
//     carries the value (induced substituted-command failure), and a cell timeout while a substituted call is in
//     flight (node_repl writes the cell source to stderr); then the value is replaced and substitution re-checked.
//   the production server (scripts/accept/serve-with-store.mjs) with the vendor sky service: a substituted command
//     against a nonexistent app (a real vendor failure after substitution), an unknown label, and model cells trying
//     to write an importable module into every trusted code root (and, for comparison, their own working and temporary
//     directories), once under the default sandbox (`scoped`, the guarantee: no trusted root written, the run
//     directory and $TMPDIR written) and once on a second connection with CUA_SHIM_SANDBOX=disabled (informational,
//     what a cell could write, accepted under #20).
//     Every file a cell manages to write is removed and checked gone before the step is recorded
//     (scripts/probe/trusted-roots.mjs).
//   fail-closed connections through the fake target: with CUA_SHIM_SECRETS=off (secrets_disabled) and with a store
//     the server cannot read (a second temporary $HOME whose store directory is mode 0000: secret_unreadable), a
//     reference in each of the three methods fails before anything reaches the target.
// `node scripts/accept-native.mjs --live-secrets` runs this probe as acceptance 6's live roundtrip.
// The engine (#117 M3.4): on macOS with the computer surface every server is pinned to one engine (CUA_NATIVE_ENGINE,
// else the launcher's default; accept-native passes its --engine so) and selects it from the account's own engine.json
// and approved engine, not the store's temporary $HOME (scripts/accept/secret-seed.mjs accountEngine). Every js result
// must attest it (`_meta['cua/nativeEngine']`): the first that does not stops the probe, nothing more is sent, and the
// step "every result attests the pinned engine" fails. With cua's engine "real vendor" steps run against cua's engine
// service; their names are kept, since acceptance phases name them.
// Every observable channel is scanned for both sentinels (raw and as base64 at every alignment): the MCP transport in
// both directions, serve/anchor/cua-repl/node_repl/kernel/trusted-worker stderr (all inherited by the served
// process), every regular file the runtime left under $CUA_HOME/state and run (read whole; an unreadable one fails the
// scan as incomplete evidence), and this report; each `cua secrets set`'s terminal output is checked for its value.
// Behavioural failures, including cleanup, are FAIL; an informational step is INFO and never decides the verdict.
// Exit 0 PASS, 1 FAIL, 3 BLOCKED. The report holds metadata only.
import {openSession} from './accept/mcp-session.mjs';
import {openSecretSession, finishSecretSessions} from './probe/secrets-session.mjs';
import {randomBytes, randomUUID} from 'node:crypto';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import net from 'node:net';
import {basename, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {settingsFrom} from '../src/mcp/server.mjs';
import {defaultHome} from '../src/runtime/layout.mjs';
import {resolveRuntime} from '../src/runtime/manifest.mjs';
import {SKY_SERVICE, SERVICE_SUPPORT_DIRS} from '../src/runtime/launch.mjs';
import {storeDir} from '../src/secrets/store.mjs';
import {accountHome, createStoreHome, generatedKey, removeStoreHome, seedSecret} from './accept/secret-seed.mjs';
import {ATTEST_STEP, AttestationRefusal, attestReplies} from './accept/engine-lane.mjs';
import {pinLane, selectLane} from './probe/pinned-engine.mjs';
import {fingerprints, scanFiles, textLeaks} from './probe/leak-scan.mjs';
import {plantCell, trustedRootStep} from './probe/trusted-roots.mjs';
import {SECRETS_OFF, STORE_UNREADABLE, closeStep, failClosedStep, refusedLaunchResult} from './probe/fail-closed.mjs';
import {tmpdirRoot} from '../src/runtime/sandbox.mjs';

const {values: options} = parseArgs({options: {report: {type: 'string'}}, strict: true});
const REPO = fileURLToPath(new URL('..', import.meta.url));
const SERVE = join(REPO, 'scripts', 'accept', 'serve-with-store.mjs');
const FAKE_SERVE = join(REPO, 'scripts', 'probe', 'serve-fake-sky-target.mjs');
const STEP_MS = 15_000;

const home = defaultHome();
const surfaces = settingsFrom(process.env).surfaces;
let pin;
try { ({pin} = pinLane({flag: undefined, env: process.env, home, surfaces})); } catch (error) {
  console.error(`probe-secrets: ${error.message}`);
  process.exit(2);
}
// The attestation every js result must carry (selectLane, at the preconditions), how many did, and the refusal that
// stopped the probe.
const engine = {expected: null, attested: 0, refused: null};
const label = generatedKey('CUA_PROBE');
const sentinels = [1, 2].map(() => `cua-m5-sentinel-${randomBytes(18).toString('base64url')}`);
const REF = `{{secret:${label}}}`;
const steps = [];
const channels = [];          // {name, text}: everything observable, scanned at the end
const record = (name, status, detail) => { steps.push({name, status, detail}); return status === 'PASS'; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PRINTS = sentinels.flatMap(fingerprints);
const leaks = text => textLeaks(text, PRINTS);

// --- the recorder: the only place the fake target may deliver a value ---------------------------------------------
function startRecorder(path) {
  const received = [];
  const server = net.createServer(socket => {
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk.toString('utf8');
      const nl = buffer.indexOf('\n');
      if (nl < 0) return;
      try { received.push(JSON.parse(buffer.slice(0, nl))); } catch { received.push({unreadable: true}); }
      socket.end('ack\n');
    });
    socket.on('error', () => {});
  });
  return new Promise(resolve => server.listen(path, () => resolve({received, close: () => new Promise(r => server.close(r))})));
}

const FAKE_TARGET = recorderPath => `// Generated by scripts/probe-secrets.mjs: a controlled fake sky target. It forwards each request to the probe's
// recorder over nodeRepl.nativePipe and never logs. app "probe.fail" throws an error carrying the whole request;
// app "probe.slow" answers after 4 s.
const RECORDER = ${JSON.stringify(recorderPath)};
function forward(request) {
  return new Promise((resolve, reject) => {
    globalThis.nodeRepl.nativePipe.createConnection(RECORDER).then(stream => {
      let ack = '';
      stream.on('data', data => { ack += Buffer.from(data).toString('utf8'); if (ack.includes('\\n')) { stream.end(); resolve(); } });
      stream.on('error', reject);
      stream.on('close', () => resolve());
      stream.write(Buffer.from(JSON.stringify(request) + '\\n'));
    }, reject);
  });
}
export async function handleRpc(request) {
  // The vendor API banner binds the mac surface from this answer; the method list is the pinned mac client's.
  if (request?.type === 'setup') return {target: 'mac', methods: ['list_apps', 'get_app_state', 'click', 'drag', 'paste', 'perform_secondary_action', 'press_key', 'scroll', 'select_text', 'set_value', 'type_text']};
  await forward(request);
  const app = request?.args?.[0]?.app;
  if (app === 'probe.fail') { const error = new Error('fake target refused ' + JSON.stringify(request)); error.request = request; throw error; }
  if (app === 'probe.slow') await new Promise(r => setTimeout(r, 4000));
  return undefined;
}
`;

// --- an MCP connection to a served process -----------------------------------------------------------------------
const sessions = [];
let storeHome = null;         // the probe's own temporary $HOME, whose store every server reads
function connect(name, args, extraEnv = {}) {
  if (engine.refused) throw engine.refused;
  const session = openSession({args, clientName: 'cua-probe-secrets',
    env: {...process.env, CUA_HOME: home, HOME: storeHome, ...(pin ? {CUA_NATIVE_ENGINE: pin.engine} : {}), ...extraEnv}});
  session.name = name;
  // Register before initialize/banner: even a failed open has streams which must be scanned after teardown.
  sessions.push(session);
  session.js = (code, timeoutMs = 30_000, cellTimeout) => session.request('tools/call',
    {name: 'js', arguments: {code, ...(cellTimeout ? {timeout_ms: cellTimeout} : {})}}, timeoutMs + 5000);
  attestReplies(session, {expected: engine.expected, onAttested: () => engine.attested++, onRefused: problem => {
    engine.refused = new AttestationRefusal(problem);
    record(ATTEST_STEP, 'FAIL', `${name}: ${engine.refused.message}; nothing more was sent`);
  }});
  session.open = () => openSecretSession(session);
  return session;
}

// A cell that calls the sky service directly (as the cua API does) and writes {ok, result} or {ok:false, message}.
const rpcCell = request => `let out;
try { out = {ok: true, result: (await nodeRepl.rpc("sky", ${JSON.stringify(request)})) ?? null}; }
catch (error) { out = {ok: false, message: String(error?.message ?? error)}; }
nodeRepl.write(JSON.stringify(out));`;
const cellOutput = reply => {
  const text = (reply.result?.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  const line = text.split('\n').reverse().find(l => l.startsWith('{"ok"'));
  try { return line ? JSON.parse(line) : {raw: text.slice(0, 200), isError: reply.result?.isError ?? null, timedOut: reply.timedOut ?? false}; } catch { return {raw: text.slice(0, 200)}; }
};
const errorCode = out => out?.message?.match(/\[([a-z_]+)\]$/)?.[1] ?? null;
const exec = (method, input) => ({type: 'execute', method, args: [input]});

async function seed(name, value) {
  const r = await seedSecret({home: storeHome, key: label, value, timeoutMs: STEP_MS});
  if (r.echoed) return record(name, 'FAIL', 'the value appeared in terminal output');
  if (r.timedOut) return record(name, 'FAIL', `cua secrets set did not finish within ${STEP_MS} ms (${r.prompts} prompt(s) answered)`);
  if (r.exit !== 0 || !r.stored) return record(name, 'FAIL', `cua secrets set exited ${r.exit ?? r.signal}, key stored: ${r.stored}: ${r.said}`);
  return record(name, 'PASS', 'stored by cua secrets set, typed twice at its masked prompt on a pty, in the probe\'s temporary $HOME');
}

// One connection through the fake target. `value` is the sentinel the item currently holds.
async function targetConnection(tag, value, recorder, targetModule, {full}) {
  const c = connect(`target-${tag}`, [FAKE_SERVE, targetModule]);
  await c.open();
  const since = recorder.received.length;
  const newlyReceived = () => recorder.received.slice(since);
  const lastReceived = () => recorder.received.at(-1);

  const substitutions = full ? [
    ['paste', {app: 'probe.record', text: REF, format: 'text'}, r => r.args[0].text],
    ['type_text', {app: 'probe.record', text: REF}, r => r.args[0].text],
    ['set_value', {app: 'probe.record', element_index: 3, value: REF}, r => r.args[0].value],
  ] : [['type_text', {app: 'probe.record', text: REF}, r => r.args[0].text]];
  for (const [method, input, field] of substitutions) {
    const before = recorder.received.length;
    const out = cellOutput(await c.js(rpcCell(exec(method, input))));
    const name = `${tag}: ${method} substitution`;
    const got = recorder.received.length === before + 1 ? lastReceived() : null;
    const others = object => JSON.stringify(Object.entries(object).filter(([key]) => key !== 'text' && key !== 'value').sort());
    // On macOS the wrapper marks a substituted request `concealed: true` for cua's engine (src/services/sky.mjs, #117).
    const expected = process.platform === 'darwin' ? {...input, concealed: true} : input;
    const exact = got && field(got) === value && others(got.args[0]) === others(expected);
    record(name, out.ok && exact ? 'PASS' : 'FAIL', out.ok && exact
      ? 'the fake target received exactly the stored value in the eligible field; the cell got no value back'
      : `cell ${out.ok ? 'succeeded' : `failed (${errorCode(out) ?? 'no code'})`}; target ${got ? (field(got) === value ? `got the value with other fields changed (${others(got.args[0])} vs ${others(expected)})` : 'did not get the value') : 'received nothing'}`);
  }
  if (!full) return c;

  {
    const out = cellOutput(await c.js(rpcCell(exec('type_text', {app: 'probe.record', text: 'probe ordinary text'}))));
    record(`${tag}: ordinary input`, out.ok && lastReceived()?.args?.[0]?.text === 'probe ordinary text' ? 'PASS' : 'FAIL', 'ordinary text reaches the target unchanged');
  }
  {
    const out = cellOutput(await c.js(rpcCell(exec('press_key', {app: 'probe.record', key: REF}))));
    record(`${tag}: unsupported method`, out.ok && lastReceived()?.args?.[0]?.key === REF ? 'PASS' : 'FAIL', 'a marker in press_key is delegated literally, not expanded');
  }
  for (const [name, request, expected] of [
    ['unknown label', exec('type_text', {app: 'probe.record', text: `{{secret:${label}_ABSENT}}`}), 'secret_not_found'],
    ['invalid label', exec('paste', {app: 'probe.record', text: '{{secret:not a label}}', format: 'text'}), 'invalid_secret_label'],
    ['unsupported shape', exec('type_text', {app: 'probe.record', text: REF, delay: 1}), 'unsupported_secret_shape'],
  ]) {
    const before = recorder.received.length;
    const out = cellOutput(await c.js(rpcCell(request)));
    const ok = !out.ok && errorCode(out) === expected && recorder.received.length === before;
    record(`${tag}: ${name}`, ok ? 'PASS' : 'FAIL', ok ? `failed before input with ${expected}` : `got ${out.ok ? 'success' : errorCode(out)}; target calls ${recorder.received.length - before}`);
  }
  {
    const before = recorder.received.length;
    const out = cellOutput(await c.js(rpcCell(exec('type_text', {app: 'probe.fail', text: REF}))));
    const substituted = recorder.received.length === before + 1 && lastReceived()?.args?.[0]?.text === value;
    const ok = !out.ok && errorCode(out) === 'secret_input_failed' && substituted && !leaks(out.message);
    record(`${tag}: induced substituted-command failure`, ok ? 'PASS' : 'FAIL', ok
      ? 'the target received the value and threw an error containing it; the cell got only the fixed diagnostic'
      : `cell ${out.ok ? 'succeeded' : errorCode(out)}; substituted ${substituted}`);
  }
  {
    // node_repl writes a timed-out cell's source to stderr; the substituted call is still in flight in the worker.
    const reply = await c.js(rpcCell(exec('type_text', {app: 'probe.slow', text: REF})), 30_000, 1500);
    const timedOut = reply.result?.isError === true && /timed out/i.test(JSON.stringify(reply.result.content ?? []));
    record(`${tag}: cell timeout during a substituted call`, timedOut ? 'PASS' : 'FAIL', timedOut
      ? 'the cell timed out while the target held the substituted request; node_repl logged the redacted cell source (stderr is scanned below)'
      : `the cell did not time out as arranged (${JSON.stringify(reply.result ?? reply).slice(0, 160)})`);
    await sleep(4500);
  }
  record(`${tag}: target saw only what it should`, newlyReceived().every(r => !r.unreadable) ? 'PASS' : 'FAIL', `${newlyReceived().length} target calls recorded`);
  return c;
}

// The production server, real vendor sky service: what a model cell can and cannot do around the trusted worker.
async function realServeConnection(runtime) {
  // The default (scoped) sandbox, whatever the probe's own environment says.
  const c = connect('real-serve', [SERVE], {CUA_SHIM_SANDBOX: undefined});
  await c.open();
  {
    const out = cellOutput(await c.js(rpcCell(exec('type_text', {app: 'com.example.cua-m5-probe-absent', text: REF})), 60_000));
    const ok = !out.ok && errorCode(out) === 'secret_input_failed';
    record('real vendor: failure after substitution', ok ? 'PASS' : 'FAIL',
      ok ? `value-free diagnostic: ${out.message.replace(/^cua: /, '').slice(0, 160)}` : `got ${out.ok ? 'success' : errorCode(out) ?? out.raw}`);
  }
  {
    const out = cellOutput(await c.js(rpcCell(exec('type_text', {app: 'com.example.cua-m5-probe-absent', text: `{{secret:${label}_ABSENT}}`}))));
    record('real vendor: unknown label', !out.ok && errorCode(out) === 'secret_not_found' ? 'PASS' : 'FAIL', 'fails before input with secret_not_found');
  }
  await plantModules(c, runtime, 'scoped');
  const exit = await c.close();
  record('real serve: close', exit?.code === 0 ? 'PASS' : 'FAIL', `exit ${exit?.code ?? 'timeout'}`);
}

// The same attempt on a connection that asks for the disabled sandbox, where it only records what a cell could write.
async function sandboxDisabledConnection(runtime) {
  const c = connect('real-serve sandbox disabled', [SERVE], {CUA_SHIM_SANDBOX: 'disabled'});
  await c.open();
  await plantModules(c, runtime, 'disabled');
  const exit = await c.close();
  record('real serve (sandbox disabled): close', exit?.code === 0 ? 'PASS' : 'FAIL', `exit ${exit?.code ?? 'timeout'}`);
}

// A model cell tries to create a uniquely named importable module in every trusted code root. Whatever it wrote is
// removed, in the trusted roots and in its own directories, and the trusted roots are checked again before the step
// is recorded: the probe must leave cua's checkout and the installed runtime as it found them.
async function plantModules(c, runtime, mode) {
  const roots = [
    {label: 'state/codex', path: join(runtime.home, 'state', 'codex')},
    {label: 'src/services', path: dirname(SKY_SERVICE)},
    ...SERVICE_SUPPORT_DIRS.map(path => ({label: `src/${basename(path)}`, path})),
    {label: 'vendor modules', path: runtime.paths.moduleDir},
  ];
  const name = `cua-m5-planted-${randomUUID()}.mjs`;
  const out = cellOutput(await c.js(plantCell(roots.map(root => root.path), name)));
  const planted = roots.filter(root => existsSync(join(root.path, name)));
  for (const root of planted) rmSync(join(root.path, name), {force: true});
  for (const dir of [out.result?.cwdDir, out.result?.tmpDir]) if (typeof dir === 'string') rmSync(join(dir, name), {force: true});
  const runDir = join(runtime.home, 'run');
  for (const entry of readdirSync(runDir, {withFileTypes: true})) if (entry.isDirectory()) rmSync(join(runDir, entry.name, name), {force: true});
  const survivors = roots.map(root => join(root.path, name)).filter(path => existsSync(path));
  const step = trustedRootStep(mode, {roots, results: out.result?.roots ?? null, planted: planted.map(root => root.label), survivors,
    // The served process inherits this probe's TMPDIR, which is what the scoped profile's temp root comes from.
    cwd: out.result?.cwd, tmp: out.result?.tmp, tmpGranted: tmpdirRoot(process.env.TMPDIR) !== null, raw: out.raw ?? (out.result ? undefined : JSON.stringify(out).slice(0, 200))});
  record(step.name, step.status, step.detail);
}

// Secrets turned off, or a store the server cannot read: an exact reference must fail closed before any input. Run
// through the fake target, so "before any input" is observed at the target, not inferred.
async function failClosedConnection(tag, recorder, targetModule, {env = {}, expected, reason}) {
  const c = connect(`fail-closed ${tag}`, [FAKE_SERVE, targetModule], env);
  await c.open();
  for (const [method, input] of [
    ['type_text', {app: 'probe.record', text: REF}],
    ['paste', {app: 'probe.record', text: REF, format: 'text'}],
    ['set_value', {app: 'probe.record', element_index: 3, value: REF}],
  ]) {
    const before = recorder.received.length;
    const out = cellOutput(await c.js(rpcCell(exec(method, input))));
    const delivered = recorder.received.length - before;
    const ok = !out.ok && errorCode(out) === expected && (!reason || out.message.includes(`(${reason})`)) && delivered === 0;
    record(failClosedStep(tag, method), ok ? 'PASS' : 'FAIL', ok
      ? `failed with ${expected}${reason ? ` (${reason})` : ''}; the target received nothing`
      : `got ${out.ok ? 'success' : `${errorCode(out)}: ${String(out.message ?? out.raw).replace(/^cua: /, '').slice(0, 120)}`}; target calls ${delivered}`);
  }
  const exit = await c.close();
  record(closeStep(tag), exit?.code === 0 ? 'PASS' : 'FAIL', `exit ${exit?.code ?? 'timeout'}`);
}

// A connection the server refuses before its handshake (a refused launch): `initialize` gets no answer, the server
// exits non-zero, and its stderr carries `expected` (the classified code) and every string in `names`. The target
// receives nothing.
async function refusedConnection(tag, recorder, targetModule, {env = {}, expected, names = []}) {
  const c = connect(`fail-closed ${tag}`, [FAKE_SERVE, targetModule], env);
  const before = recorder.received.length;
  const init = await c.request('initialize', {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'cua-probe-secrets', version: '0'}}, 30_000);
  const exit = await Promise.race([c.exited, sleep(20_000).then(() => null)]);
  if (!exit) await c.terminate();
  const step = refusedLaunchResult(tag, {answered: Boolean(init.result), exit, stderr: c.stderr, delivered: recorder.received.length - before, expected, names});
  record(step.name, step.status, step.detail);
}

let recorder;
let unreadableHome = null;
const scratch = realpathSync(mkdtempSync('/tmp/cm5-'));
try {
  const runtime = resolveRuntime({home});
  // The pinned engine as the servers select it: the account's (accountEngine), whatever the store's HOME holds.
  if (pin) ({expected: engine.expected} = selectLane({pin, serveEnv: {...process.env, CUA_HOME: home, CUA_NATIVE_ENGINE: pin.engine, HOME: accountHome()}, home, runtime, surfaces}));
  storeHome = createStoreHome('cua-probe-secrets-');
  record('preconditions', 'PASS', `runtime ${runtime.release}; key ${label} in a temporary $HOME${pin ? `; the ${pin.engine} engine pinned (${pin.pinnedBy}), version ${engine.expected.version} build ${engine.expected.build}` : ''}`);
  recorder = await startRecorder(join(scratch, 'r.sock'));
  const targetModule = join(scratch, 'target', 'sky-target.mjs');
  mkdirSync(dirname(targetModule));
  writeFileSync(targetModule, FAKE_TARGET(join(scratch, 'r.sock')));
  if (await seed('create', sentinels[0])) {
    const first = await targetConnection('first value', sentinels[0], recorder, targetModule, {full: true});
    const exit = await first.close();
    record('first value: close', exit?.code === 0 ? 'PASS' : 'FAIL', `exit ${exit?.code ?? 'timeout'}`);
    if (await seed('replace', sentinels[1])) {
      const second = await targetConnection('replaced value', sentinels[1], recorder, targetModule, {full: false});
      const exit2 = await second.close();
      record('replaced value: close', exit2?.code === 0 ? 'PASS' : 'FAIL', `exit ${exit2?.code ?? 'timeout'}`);
      await realServeConnection(runtime);
      await sandboxDisabledConnection(runtime);
    }
    await failClosedConnection(SECRETS_OFF, recorder, targetModule, {env: {CUA_SHIM_SECRETS: 'off'}, expected: 'secrets_disabled'});
    // A second temporary home whose store directory this user cannot enter. Since #115 M1 a confined connection
    // cannot establish the store's tiers there (a tier's target outside the store, hidden by the unreadable directory,
    // would stay readable to the kernel), so the launch itself is refused, classified and naming the store, before any
    // call: it fails closed earlier than the read's secret_unreadable did.
    unreadableHome = createStoreHome('cua-probe-unreadable-');
    mkdirSync(storeDir({HOME: unreadableHome}), {recursive: true, mode: 0o700});
    chmodSync(storeDir({HOME: unreadableHome}), 0o000);
    await refusedConnection(STORE_UNREADABLE, recorder, targetModule, {env: {HOME: unreadableHome}, expected: 'sandbox_state_invalid',
      names: ['the secret store', storeDir({HOME: unreadableHome})]});
  }
} catch (error) {
  // A refusal on the attestation is recorded where it happened (ATTEST_STEP).
  if (!(error instanceof AttestationRefusal)) record('unexpected', 'FAIL', `${error.code ?? 'error'}: ${error.message}`);
} finally {
  await finishSecretSessions(sessions, channels);
  if (storeHome) {
    if (unreadableHome) { try { chmodSync(storeDir({HOME: unreadableHome}), 0o700); } catch {} }
    const remove = async target => { try { return await removeStoreHome(target); } catch { return {keyGone: false, homeGone: false}; } };
    const removed = await remove({home: storeHome, key: label});
    const extra = unreadableHome ? await remove({home: unreadableHome}) : {homeGone: true};
    const ok = removed.keyGone && removed.homeGone && extra.homeGone;
    record('cleanup', ok ? 'PASS' : 'FAIL', ok ? 'the probe\'s key file and its temporary homes were removed'
      : `CLEANUP FAILED: remove ${storeHome}${unreadableHome ? ` and ${unreadableHome}` : ''} by hand (key ${label})`);
  }
  await recorder?.close();
  rmSync(scratch, {recursive: true, force: true});
}

// The scanner must find a value relayed as base64 inside a framed reply at any offset, or its PASS means nothing.
const selfCheck = [0, 1, 2, 3, 4, 5].every(offset => {
  const frame = Buffer.concat([Buffer.alloc(offset, 0x41), Buffer.from(JSON.stringify({ok: true, value: sentinels[0]}))]);
  return leaks(frame.toString('base64')) > 0 && leaks(JSON.stringify({value: sentinels[1]})) > 0;
});
if (pin && !engine.refused) record(ATTEST_STEP, engine.attested > 0 ? 'PASS' : 'BLOCKED', engine.attested > 0
  ? `${engine.attested} result(s), each attesting the ${pin.engine} engine, version ${engine.expected.version} build ${engine.expected.build}` : 'no result came back to attest');
record('scanner self-check', selfCheck ? 'PASS' : 'FAIL', 'a generated value is found raw and as base64 at every byte offset');
// Every regular file the runtime left under $CUA_HOME/state and run, read whole. An unreadable file is incomplete
// evidence, so the scan cannot pass.
const files = await scanFiles([join(home, 'state'), join(home, 'run')], PRINTS);
const leaked = [...channels.filter(c => leaks(c.text)).map(c => c.name), ...files.leaked.map(f => `file ${f.replace(home, '$CUA_HOME')}`)];
const unread = files.unread.map(f => f.replace(home, '$CUA_HOME'));
const channelSummary = channels.map(c => ({
  name: c.name, bytes: Buffer.byteLength(c.text), containsReference: c.text.includes(REF),
  ...(c.name.includes('stderr') && c.text ? {excerpt: c.text.slice(0, 600)} : {}),
}));
record('sentinel scan', leaked.length || unread.length ? 'FAIL' : 'PASS', leaked.length
  ? `a generated value appeared in: ${leaked.join('; ')}`
  : unread.length ? `incomplete evidence: could not read ${unread.join('; ')}`
    : `no generated value (raw or base64) in ${channels.length} streams (${channels.map(c => c.name).join('; ')}) or in ${files.scanned} runtime files read whole (${files.links} symbolic links not followed)`);
const status = steps.some(s => s.status === 'FAIL') ? 'FAIL' : steps.some(s => s.status === 'BLOCKED') ? 'BLOCKED' : 'PASS';
const report = {
  scenario: 'live-native-secret-substitution', status, release: (() => { try { return resolveRuntime({home}).release; } catch { return null; } })(),
  label, steps, channels: channelSummary, runtimeFiles: {scanned: files.scanned, unread, symbolicLinks: files.links}, date: new Date().toISOString(),
};
const text = JSON.stringify(report, null, 2);
if (leaks(text)) {
  console.error('probe-secrets: refusing to write a report containing a generated value');
  process.exit(1);
}
if (options.report) writeFileSync(options.report, text + '\n', {mode: 0o600});
console.log(text);
process.exit(status === 'PASS' ? 0 : status === 'FAIL' ? 1 : 3);
