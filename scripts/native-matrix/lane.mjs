// The native matrix's device steps and its lane (scripts/native-matrix.mjs; docs/doperpowers/specs/2026-10-18-own-native-
// engine-design.md, Verification system part 4): the device CLIs over ssh in the harness checkout (the scenes, the
// goldens' Finder steps and engine stop, the live hold's begin, watch and recover, the matrix's own reads), the
// preparation of the approved home, and the serve of the requested host and engine (CUA_NATIVE_ENGINE pinned to
// --engine, as the native baseline's lanes are) with its MCP client. Reused, not copied: the native baseline's remote
// scripts and engine attestation, the goldens' checkout CLI and approval matcher, the live hold's bounded, journaled ssh.
import {execFileSync} from 'node:child_process';
import {textOf} from '../browser-parity/mcp.mjs';
import {FIRST, parseCell} from '../native-baseline/cells.mjs';
import {attestEngine} from '../native-baseline/engine.mjs';
import {classifyHelpers, preflightScript, serveCommand} from '../native-baseline/remote.mjs';
import {hostAttestationOf} from '../native-baseline.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {checkoutCli, deviceOps, isSceneApproval} from './goldens.mjs';
import {sha256Hex} from './matrix-text.mjs';
import {boundedExec, journaledScript, SSH_OPTIONS} from './live.mjs';

export const CELL_MS = 60_000, BIND_MS = 120_000;
const LIVE_DEVICE = 'scripts/native-matrix/live-device.mjs';
const MATRIX_DEVICE = 'scripts/native-matrix/matrix-device.mjs';
const lastJson = text => JSON.parse(String(text).trim().split('\n').at(-1));

// Every lane call's device-clock window: the code wrapped so the REPL prints, after the cell's own marker, the device's
// Date.now() before and after it, which the run lays beside the activation watcher's times (./oracle.mjs
// accountActivations). The cell envelope (scripts/native-baseline/cells.mjs cell) catches the cell's errors, so the
// line follows every cell that ran. -> the wrapped code.
export const AT_MARKER = 'CUA_MATRIX_AT ';
export const timedCode = code => `{const __matrixAt0 = Date.now();\n${code}\nnodeRepl.write("\\n" + ${JSON.stringify(AT_MARKER)} + JSON.stringify([__matrixAt0, Date.now()]));}`;
// -> [from, to] from a result's text, or null when the line is missing.
export function atOf(text) {
  const line = String(text).split('\n').reverse().find(l => l.startsWith(AT_MARKER));
  if (!line) return null;
  const at = JSON.parse(line.slice(AT_MARKER.length));
  return Array.isArray(at) && at.length === 2 && at.every(Number.isFinite) ? at : null;
}

// Both engines' processes with their ages, the approved bundle's `--probe` instances left out: the matrix's own
// watcher and focus probes run the approved bundle on either engine's lane, and are not its engine.
export const MATRIX_HELPER_SCRIPT = `/bin/ps -axo etime=,args= | /usr/bin/grep -E '/(SkyComputerUseService|cua-engine)( |$)' | /usr/bin/grep -v -e ' --probe ' || true`;
// MATRIX_HELPER_SCRIPT's lines as the native baseline's helper attestation classifies them (remote.mjs classifyHelpers):
// each executable's path cut from its arguments. -> [{path, kind, origin, ageSeconds}].
export function helpersOf(output, runtimeRoot, engineBundle) {
  const lines = String(output).split('\n').map(line => /^\s*(\S+)\s+(.*?\/(?:SkyComputerUseService|cua-engine))(?: .*)?$/.exec(line)).filter(Boolean)
    .filter(m => !/ --probe /.test(m.input)).map(m => `${m[1]} ${m[2]}`);
  return classifyHelpers(lines.join('\n'), runtimeRoot, engineBundle);
}

// The device steps, each a bounded ssh whose node launch is journaled in the run's journal once `journalTo(run)` named
// it (./live.mjs boundedExec). -> {home, scenes, goldens, live, matrix, prepare, cleanup, preflight, serveSpec, helpers, journalTo}.
export function matrixOps(device, {exec = execFileSync} = {}) {
  const journal = {run: null};
  const bounded = boundedExec(exec, journal);
  const base = deviceOps(device, {exec: bounded});
  const {ssh, cli} = checkoutCli(device, {exec: bounded});
  return {
    home: base.home, scenes: base.scenes, goldens: base.goldens, prepare: base.prepare, cleanup: base.cleanup,
    live: args => cli(LIVE_DEVICE, args, {answersOnFailure: true}),
    matrix: args => cli(MATRIX_DEVICE, args),
    preflight: ({host, engine, approvedEngine, prepared}) => lastJson(ssh(preflightScript({host, engine, approvedEngine, prepared, surface: 'computer'}))),
    serveSpec: ({pre, prepared, host, engine}) => {
      const serve = serveCommand({device, checkout: pre.checkout, home: pre.home, userHome: prepared.userHome, configHome: prepared.configHome, tmpdir: prepared.tmpdir,
        admission: prepared.admission, xSession: {}, host, engine, platform: 'darwin', surface: 'computer'});
      return serve.command === 'ssh' ? {...serve, args: [...SSH_OPTIONS, ...serve.args.slice(0, -1), journaledScript(serve.args.at(-1), journal.run)]} : serve;
    },
    helpers: () => ssh(MATRIX_HELPER_SCRIPT),
    journalTo: run => { journal.run = run; },
  };
}

// The engine's per-call meta on a result, as the probe cells and the web scenes' rows read it (src/services/engine/
// service.mjs, reset at each call and set on an input error too): the action's interval, the engine's receipt time, the
// idle time it measured, the characters a type_text entered, `intervention: "off"` when detection is not running, and
// the observation's own diagnostics (`cua/observation`: web enablement, the web area, the settle; the result's _meta
// only, never its text). Response meta merges across a cell's calls with each call resetting its keys, so a cell's meta
// is its last facade call's. The vendor reports none. With route 3, the activation's guard time and what its click did
// (`cua/activationClick`: "posted", or why it was skipped) when the service passes them on.
// -> {actionInterval, receivedAt, hidIdleMs, entered, intervention, observation, activationGuardMs, activationClick}, each null when absent.
export const engineMetaOf = meta => Object.fromEntries([['actionInterval', 'cua/actionInterval'], ['receivedAt', 'cua/receivedAt'], ['hidIdleMs', 'cua/hidIdleMs'],
  ['entered', 'cua/entered'], ['intervention', 'cua/intervention'], ['observation', 'cua/observation'], ['activationGuardMs', 'cua/activationGuardMs'],
  ['activationClick', 'cua/activationClick']].map(([key, name]) => [key, meta?.[name] ?? null]));

// The lane: the serve of `host` and `engine` on the prepared home, an MCP client that accepts only the computer-use
// approval of one of the scenes' apps (recorded in meta.elicitations), and its first cell. Every js result's engine
// attestation is collected (meta.nativeEngine, ./native-baseline/engine.mjs attestEngine) and one naming another engine
// stops the lane at once; the first result attests the host. -> {client, js(code, timeoutMs) -> {ok, value|error,
// inCellMs, wallMs, route, engine, at}} (`at`: the device-clock window around the call, timedCode; `engine`: the last
// call's input meta, engineMetaOf).
export async function connectLane({ops, pre, prepared, host, engine, connect, bundleIds, meta, stderrFile, now = () => performance.now()}) {
  const client = connect({...ops.serveSpec({pre, prepared, host, engine}), clientName: 'cua-native-matrix',
    answer: msg => (isSceneApproval(msg, bundleIds) ? {action: 'accept', content: {}} : {action: 'decline'}),
    onElicitation: (row, msg) => meta.elicitations.push({t: row.t, app: msg.params?._meta?.tool_params?.app ?? null, action: row.action}),
    stderrFile});
  const closing = async error => { try { await client.close(); } catch {} throw error; };
  const serverInfo = await client.initialize().then(answer => answer?.serverInfo ?? null, closing);
  await client.request('tools/list').catch(closing);
  const js = async (code, timeoutMs = CELL_MS) => {
    const t0 = now();
    const result = await client.request('tools/call', {name: 'js', arguments: {code: timedCode(code), timeout_ms: timeoutMs}}, timeoutMs + 15_000);
    const wallMs = now() - t0;
    attestEngine(meta.nativeEngine, result);
    const attested = result?._meta?.['cua/nativeEngine'];
    if (attested?.engine !== engine) throw new Error(`a result attested ${attested?.engine ? `the ${attested.engine} engine` : 'no engine'}, not the requested ${engine}: the lane stopped`);
    if (!meta.hostAttestation) {
      meta.hostAttestation = hostAttestationOf(serverInfo, result);
      if (meta.hostAttestation.host !== host) throw new Error(`the ${meta.hostAttestation.host} host answered a --host ${host} lane`);
    }
    const text = textOf(result);
    const parsed = parseCell(text);
    if (!parsed) throw new Error(`a cell printed no result marker${result?.isError ? ' (an error result)' : ''}`);
    const at = atOf(text);
    if (!at) throw new Error('a cell printed no device-clock window: its activations could not be accounted for; the lane stopped');
    const route = result?._meta?.['cua/inputRoute'];
    return {...parsed, wallMs, route: route === undefined ? null : route, engine: engineMetaOf(result?._meta), at};
  };
  const first = await js(FIRST, BIND_MS).catch(closing);
  if (!first.ok) await closing(new Error(`the lane's first cell failed: ${first.error}`));
  return {client, js};
}

// ---- the dry run ------------------------------------------------------------------------------------------------------

// The keyboard layout a dry source reads with: 2-Set's own once engaged, ABC otherwise.
const dryLayout = id => (id === 'com.apple.inputmethod.Korean.2SetKorean' ? 'com.apple.keylayout.2SetHangul' : 'com.apple.keylayout.ABC');
// What a dry run's device answers: made up, each consistent with the step that asks, so the whole run's sequence is
// exercised (and logged) with nothing sent anywhere. `clock` is the made-up device clock of every `at`.
export function dryOps({log, engine, approvedEngine = '/Users/owner/Library/Application Support/cua/engine/cua Engine.app', commit, clock = Date.now}) {
  const build = 'd'.repeat(64);
  let pid = 500, home = '/Users/owner/cua-home';
  const step = (name, answer) => (...args) => { log(`dry: ${name} ${JSON.stringify(args.length === 1 ? args[0] : args)}`); return typeof answer === 'function' ? answer(...args) : answer; };
  const bounds = {x: 100, y: 100, width: 800, height: 600};
  // The scenes as up made them, and the last one activated in front: what the dry reads and key guard see.
  const records = {};
  let front = null;
  // The scheduled probe pending, and the focused field's hash the focus probe reads: empty once a scene is activated
  // (each probe cell empties its field after one), the keystroke's text after its finish (an ANSI r composes ㄱ).
  let pending = null, focusHash = sha256Hex(''), source = 'com.apple.keylayout.ABC';
  const reading = () => ({at: 0, frontmost: front ? {pid: front.pid, bundleId: front.bundleId, owned: true} : null,
    topWindow: front ? {ownerPid: front.pid, number: front.window.number, bounds, owned: true} : null});
  return {
    home: step('home', '/Users/owner'),
    scenes: step('scenes', args => {
      switch (args[0]) {
        case 'place-chrome': return {appPath: '/tmp/chrome.app'};
        case 'build-electron': return {appPath: '/tmp/fixture.app'};
        case 'preflight': return {refusals: []};
        case 'up': return (records[args[1]] = {scene: args[1], pid: ++pid, bundleId: SCENES[args[1]].bundleId, app: `/Applications/${args[1]}.app`, window: {number: pid, bounds}});
        case 'activate': front = records[args[1]] ?? front; return {scene: args[1], ok: true};
        case 'down': return {down: true};
        case 'frontmost': return {bundleId: 'com.example.owner'};
        default: return {};
      }
    }),
    goldens: step('goldens', {steps: [], stopped: true}),
    live: step('live', args => ({begin: {refusals: [], frontmost: {bundleId: 'com.example.owner'}, engineStop: {stopped: true}}, watch: args[1] === 'start' ? {watching: true, pid: 1} : {activations: []},
      recover: {ok: true, putBack: {ok: true, steps: {'engine-stop': {ok: true}}}}})[args[0]] ?? {}),
    matrix: step('matrix', args => {
      const at = [clock(), clock()];
      switch (args[0]) {
        case 'compile': return {front: 'front-window-dry', windows: 'system-windows-dry'};
        case 'read': return {reading: reading(), watcher: args.includes('--watcher'), at, ...(args.includes('--focus') ? {focus: {appOwned: true, appPid: front?.pid ?? null, named: true, valueHash: focusHash}} : {}),
          ...(args.includes('--electron-mode') ? {electronMode: {enabled: true, at: at[0]}} : {})};
        case 'electron-mode': return {records: [{at: 0, enabled: false, source: 'start'}]};
        case 'electron-counters': return {answer: {seq: 0, at: 0, counts: {appDidBecomeActive: 0, appDidResignActive: 0}}, at};
        case 'probe': {
          if (args[1] !== 'finish') {
            const flag = name => args[args.indexOf(`--${name}`) + 1];
            const typed = args[1] !== 'keystroke' ? null : args.includes('--mode') && flag('text') === 'r' ? 'ㄱ' : flag('text');
            pending = {kind: args[1], scheduled: clock() + Number(flag('lead')), text: typed, source: args[1] === 'input-source' ? flag('source') : null};
            return {answer: {scheduled: pending.scheduled, pid: ++pid}, at};
          }
          const done = pending;
          pending = null;
          if (done?.kind === 'keystroke') focusHash = sha256Hex(done.text);
          if (done?.kind === 'input-source') source = done.source;
          return {answer: {answer: done?.kind === 'input-source' ? {selected: true, selectedAt: done.scheduled, current: {id: done.source}}
            : {postedAt: done?.scheduled ?? clock(), units: done?.text?.length ?? 0, chars: done?.text?.length ?? 0, mode: 'typed', presses: []}}, at};
        }
        case 'source':
          if (args[1] === 'select') source = args[args.indexOf('--source') + 1];
          return {answer: {save: {kept: false, saved: {source: 'com.apple.keylayout.ABC', perContext: false}}, current: {current: source, layout: dryLayout(source)},
            select: {selected: true, current: source, layout: dryLayout(source)},
            'per-context': {perContext: args[args.indexOf('--value') + 1] === 'on'}, restore: {sourceRestored: true, perContextRestored: true}}[args[1]] ?? {}, at};
        case 'step':
          if (args[1] === 'activate') { front = records[args[2]] ?? front; focusHash = sha256Hex(''); }
          return {answer: args[1] === 'down' ? {down: true} : {scene: args[2], ok: true}, at};
        case 'alerts': return args[1] === 'baseline' ? {baseline: 0} : {abort: false, export: {alerts: [], keywords: [], unknown: {count: 0, windows: []}}, at};
        case 'launched':
          if (args[1] === 'intent') return {at: clock(), pids: []};
          if (args[1] === 'record') return {recorded: true, pid: ++pid, candidates: 1};
          return args[1] === 'settle' ? {quit: 0, remaining: 0, pending: 0, waitedMs: 0} : {quit: 1, remaining: 0, gone: 0, pending: 0};
        case 'windowless': return {answer: {pid: ++pid, app: '/tmp/windowless.app'}, at};
        case 'load': return {answer: {loadavg: [1.5, 1.2, 1], uptimeS: 86_400, cpus: 10}, at};
        default: return {};
      }
    }),
    prepare: step('prepare', approvedHome => ({home: (home = approvedHome), userHome: '/Users/owner', configHome: '/tmp/config', tmpdir: '/tmp/session', admission: 'dry', engineStop: {stopped: true},
      runtimeReuse: {approvedHome: home, runtimeRoot: `${home}/runtime`}})),
    cleanup: step('cleanup', {removed: true, engineStop: {stopped: true}}),
    preflight: step('preflight', ({prepared}) => ({checkout: '/Users/owner/Developer/GitHub/cua-parity', home: prepared.home, runtimeRoot: prepared.runtimeReuse.runtimeRoot, commit, dirty: false,
      release: '26.0-dry', serves: 0, engine: {checkoutBuild: build, installed: {bundlePath: approvedEngine, engineVersion: '0.0.0', build}, installedReal: approvedEngine, approvedEngineReal: approvedEngine}})),
    serveSpec: step('serve', {command: 'ssh', args: ['dry']}),
    helpers: step('helpers', () => (engine === 'cua' ? `00:00 ${approvedEngine}/Contents/MacOS/cua-engine --probe watch-activations\n00:00 ${approvedEngine}/Contents/MacOS/cua-engine`
      : `00:00 ${home}/runtime/SkyComputerUseService`)),
    journalTo: () => {},
  };
}
// A dry client: every cell answers one made-up value carrying every field a matrix cell reads, attested as the
// requested engine; the vendor's helper path is made up to match dryOps' runtime root.
export function dryConnect({log, engine, host, clock = Date.now}) {
  return () => {
    const value = {ready: true, ok: true, inFront: true, scratchInFront: true, opened: true, closed: true, panel: false, documentInFront: true, bound: true, actMs: 1, threw: false,
      targets: [], lines: 1, named: 1, unclassified: 0, ids: 0, outcome: {}, typed: true, clicked: true, sceneInFront: true, landed: true, observed: true, hash: sha256Hex(''), length: 0};
    const meta = {'cua/nativeEngine': {engine, version: '0.0.0', build: engine === 'cua' ? 'd'.repeat(64) : '26.0-dry'}, ...(host === 'cua' ? {'cua/replHost': {host: 'cua'}} : {})};
    return {
      initialize: async () => ({serverInfo: {name: host === 'cua' ? 'cua-repl-host' : 'dry'}}),
      request: async (method, params) => {
        if (method !== 'tools/call') return {};
        log(`dry: js ${String(params.arguments.code).slice(0, 60).replace(/\s+/g, ' ')}…`);
        return {content: [{type: 'text', text: `CUA_NATIVE_BASELINE ${JSON.stringify({ok: true, value, inCellMs: 1})}\n${AT_MARKER}${JSON.stringify([clock(), clock()])}`}], _meta: meta};
      },
      call: async () => ({}),
      close: async () => {},
    };
  };
}
