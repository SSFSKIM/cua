// Pure helpers behind scripts/probe-runtime.mjs, scripts/probe-lifecycle.mjs and verify.mjs: process-tree
// classification, socket-holder parsing, evidence sanitization, and the engine-aware checks of #117 M3 (the engine a
// lane pins, its attestation, the approval observed by behaviour, the own host's tree, the approved engine's socket
// holders, what a session starts from cua's roots). No I/O here, so the verdict-bearing logic is testable without the
// vendor runtime or an engine. (The probe's launch is cua serve's own, src/runtime/launch.mjs buildLaunch, since #115
// M4: a copy here had drifted to the Codex CLI cua no longer installs.)

// `ps -axo pid=,ppid=,comm=` text -> [{pid, ppid, executable}]. `comm` is argv[0] on macOS, which for the processes
// these checks look at (spawned or launched by absolute path) is the full executable path; it may contain spaces
// ("Codex Computer Use.app"), so it is the rest of the line.
export const psRows = psText => psText.split('\n').map(line => line.match(/^\s*(\d+)\s+(\d+)\s+(.*?)\s*$/)).filter(Boolean)
  .map(([, pid, ppid, executable]) => ({pid: Number(pid), ppid: Number(ppid), executable}));

// A path inside the directory `root` (a sibling whose name only starts with it is not).
const isUnder = (path, root) => path.startsWith(root + '/');

// `ps -axo pid=,ppid=,comm=` text -> the probe child and everything below it, breadth-first.
export function descendants(psText, rootPid) {
  const rows = psRows(psText);
  const out = [];
  const queue = rows.filter(r => r.pid === rootPid);
  while (queue.length) {
    const next = queue.shift();
    out.push(next);
    queue.push(...rows.filter(r => r.ppid === next.pid));
  }
  return out;
}

// The installed desktop app's runtime: its macOS bundle, its Linux deb, or the computer-use copy it keeps under ~/.codex.
const DESKTOP_RUNTIME = /\/ChatGPT\.app\/Contents\/|^\/usr\/lib\/chatgpt\/|\/\.codex\/computer-use\//;

// `systemSandbox`: the system sandbox launcher's executable paths (Linux: bubblewrap, which the pinned codex runs to
// sandbox each runtime child), the one executable outside the release a runtime tree may hold.
export function classifyProcesses(tree, {relocatedRoot, systemSandbox = []}) {
  const relocated = p => isUnder(p.executable, relocatedRoot);
  return {
    desktopRuntimePaths: tree.filter(p => DESKTOP_RUNTIME.test(p.executable)),
    allExecutablesRelocated: tree.some(relocated) && tree.every(p => relocated(p) || systemSandbox.includes(p.executable)),
  };
}

// The processes of `tree` outside the anchor's process group (pgid = anchorPid), except a system sandbox launcher and
// everything below it: bubblewrap starts its child in a new session (--new-session), so that subtree leaves the group
// by design; it is tied to its parent instead (--die-with-parent), which `survivors` checks after the close.
export function outsideAnchorGroup(tree, {anchorPid, pgidOf, systemSandbox = []}) {
  const byPid = new Map(tree.map(p => [p.pid, p]));
  const underLauncher = p => {
    for (let at = p; at; at = byPid.get(at.ppid)) if (systemSandbox.includes(at.executable)) return true;
    return false;
  };
  return tree.filter(p => pgidOf(p.pid) !== anchorPid && !underLauncher(p));
}

// The processes of `tree` still alive by `isAlive(pid)`.
export const survivors = (tree, isAlive) => tree.filter(p => isAlive(p.pid));

// `ps -eo pid=,ppid=` text and a reader of /proc/<pid>/exe -> the same `pid ppid executable` lines `descendants`
// reads. Linux's ps truncates `comm` to 15 characters, so the executable path comes from /proc. `readExe(pid)` returns
// the path or throws: a process that is gone by then (ENOENT, ESRCH) is dropped, its children having been reparented
// already; any other failure (EACCES: another user's process, or one that made itself non-dumpable, as a sandbox
// launcher may) keeps its row as `<unreadable CODE>`, so the tree stays connected and such a process can never pass
// as relocated. The report's process ancestry names its pid.
export const UNREADABLE_EXE = code => `<unreadable ${code}>`;
const GONE = new Set(['ENOENT', 'ESRCH']);
export function procTable(psText, readExe) {
  return psText.split('\n').map(line => line.match(/^\s*(\d+)\s+(\d+)\s*$/)).filter(Boolean)
    .flatMap(([, pid, ppid]) => {
      let exe;
      try { exe = readExe(Number(pid)); } catch (error) {
        if (GONE.has(error?.code)) return [];
        exe = UNREADABLE_EXE(error?.code ?? 'error');
      }
      return [`${pid} ${ppid} ${exe}`];
    }).join('\n');
}

// The native-socket holder step of verify.mjs: null where it applies (macOS), else why it is skipped. On Linux the
// computer-use helper is a child process of the runtime over stdio and holds no socket.
export function nativeSocketStep(platform) {
  return platform === 'darwin' ? null
    : {status: 'skip', reason: `${platform}: the computer-use helper (sky_linux) is a child process of the runtime over stdio, not a native socket holder`};
}

// `lsof -F pc <path>` field output -> [{pid, command}].
export function socketHolders(lsofText) {
  const out = [];
  for (const line of lsofText.split('\n')) {
    if (line.startsWith('p')) out.push({pid: Number(line.slice(1)), command: ''});
    else if (line.startsWith('c') && out.length) out.at(-1).command = line.slice(1);
  }
  return out;
}

export function sanitize(value, {cuaHome, userHome}) {
  if (typeof value === 'string') return value.split(cuaHome).join('$CUA_HOME').split(userHome).join('~');
  if (Array.isArray(value)) return value.map(v => sanitize(v, {cuaHome, userHome}));
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, {cuaHome, userHome})]));
  return value;
}

// ---- engine-aware checks (#117 M3; docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, acceptance 2 and 9,
// the Decision Log's "M3 pre-flight") ----

export const NATIVE_ENGINES = ['vendor', 'cua'];
export const ENGINE_META_KEY = 'cua/nativeEngine';

// The engine a lane pins, so the account's ~/.config/cua/engine.json never chooses it (the whole-M1b rule): `flag`
// (--engine), else CUA_NATIVE_ENGINE in `env` (empty reads as unset, as the launcher reads it), else `defaultEngine`
// (the launcher's DEFAULT_NATIVE_ENGINE). -> {engine, pinnedBy}; an unknown value throws.
export function pinnedEngine({flag, env, defaultEngine}) {
  if (flag !== undefined) {
    if (!NATIVE_ENGINES.includes(flag)) throw new Error(`--engine must be ${NATIVE_ENGINES.join(' or ')}`);
    return {engine: flag, pinnedBy: '--engine'};
  }
  const value = env.CUA_NATIVE_ENGINE;
  if (value !== undefined && value !== '') {
    if (!NATIVE_ENGINES.includes(value)) throw new Error(`CUA_NATIVE_ENGINE must be ${NATIVE_ENGINES.join(' or ')}`);
    return {engine: value, pinnedBy: 'CUA_NATIVE_ENGINE'};
  }
  return {engine: defaultEngine, pinnedBy: 'default'};
}

// A result's `_meta['cua/nativeEngine']` against `expected` {engine, version, build}: null when it attests exactly that
// engine, else the problem. Checked on every result, never on the selection alone.
export function attestationProblem(meta, expected) {
  const attested = meta?.[ENGINE_META_KEY];
  if (!attested || typeof attested !== 'object') return `no ${ENGINE_META_KEY} attestation on the result`;
  if (['engine', 'version', 'build'].every(key => attested[key] === expected[key])) return null;
  const show = a => `engine ${a.engine} version ${a.version} build ${a.build}`;
  return `the result attested ${show(attested)} where ${show(expected)} was expected`;
}

// Whether a work result is the connection lifecycle's rejection of work it never dispatched (src/mcp/server.mjs
// rejectionResult: isError, {status: 'error', code}, no _meta), so no engine ran it and there is nothing to attest. Only
// two codes are always pre-dispatch in src/mcp/task.mjs: `task_ending`, refused at submit (#refusal) or taken off the
// queue when ending begins (#beginEnding's #rejectQueued), and `cancelled`, a queued item's cancel. `connection_failed`
// and `connection_closing` also settle the in-flight item (fail, abandon, #finish, #completionFailed), work the runtime
// may have run, so they are never exempt. A result with `cua/taskId` was answered by the runtime (runWork) and must
// attest whatever its code. Every other result, an error or not, must attest.
const PRE_DISPATCH_CODES = new Set(['task_ending', 'cancelled']);
const rejectionCode = result => result?.isError === true && result.structuredContent?.status === 'error'
  && !Object.hasOwn(result._meta ?? {}, 'cua/taskId') ? result.structuredContent.code : null;
export const isLifecycleRejection = result => PRE_DISPATCH_CODES.has(rejectionCode(result));

// The connection's terminal codes for work it may have dispatched and then dropped (src/mcp/task.mjs fail, abandon,
// #completionFailed): accepted unattested only for a call its caller declared abandoned (probe-lifecycle's stuck cell).
const ABANDONED_CODES = new Set(['connection_failed', 'connection_closing', 'completion_timeout', 'completion_failed']);

// A js result against `expected` -> {kind, problem}: 'rejected' (isLifecycleRejection: never dispatched), 'abandoned'
// (a declared abandoned call the lifecycle failed, no `cua/taskId`), else 'attested' with attestationProblem's problem.
export function resultAttestation(result, expected, {abandoned = false} = {}) {
  if (isLifecycleRejection(result)) return {kind: 'rejected', problem: null};
  if (abandoned && ABANDONED_CODES.has(rejectionCode(result))) return {kind: 'abandoned', problem: null};
  return {kind: 'attested', problem: attestationProblem(result?._meta, expected)};
}

// The approval either engine's policy asks before it first uses `app` (a bundle id) in a connection, and nothing else:
// the message names the app, the form asks for no field, the meta is the computer-use connector's and its tool
// parameters are exactly the app (src/services/engine/policy.mjs approvalRequest; the vendor's, which
// scripts/accept/lib.mjs isTextEditApproval pins for TextEdit).
export function isAppApproval(msg, app) {
  if (msg?.method !== 'elicitation/create') return false;
  const params = msg.params ?? {};
  const meta = params._meta ?? {};
  const toolParams = meta.tool_params;
  const schema = params.requestedSchema;
  return typeof params.message === 'string' && /^Allow Computer Use to use ".+"\?$/s.test(params.message)
    && params.mode === 'form'
    && schema !== null && typeof schema === 'object' && schema.type === 'object'
    && schema.properties !== null && typeof schema.properties === 'object' && Object.keys(schema.properties).length === 0
    && meta.connector_id === 'computer-use'
    && meta.codex_approval_kind === 'mcp_tool_call'
    && toolParams !== null && typeof toolParams === 'object'
    && Object.keys(toolParams).length === 1 && toolParams.app === app;
}

// The approvals of binds observed by behaviour, not by any file the host keeps: `connections` [{name, binds: [{asked,
// accepted, error}], declined}], each bind's count of the expected approval asked and accepted while it ran, and the
// connection's other elicitations, declined. A connection's first bind asks once and is accepted; every later bind in
// that connection asks nothing (the host's memory answers it); every connection asks again (the memory is per
// connection); nothing else is asked. -> {ok, problems, detail}.
export function approvalsByBehaviour(connections) {
  const problems = [];
  if (!connections?.length) problems.push('no connection ran');
  for (const {name, binds = [], declined = 0} of connections ?? []) {
    if (!binds.length) problems.push(`${name}: no bind ran`);
    binds.forEach((bind, i) => {
      const n = i + 1;
      if (bind.error) problems.push(`${name}: bind ${n} failed`);
      if (i === 0 && bind.asked === 0) problems.push(`${name}: the first bind asked nothing (the app may be remembered beyond the connection, or always allowed)`);
      else if (i === 0 && bind.asked > 1) problems.push(`${name}: the first bind asked ${bind.asked} times`);
      else if (i > 0 && bind.asked > 0) problems.push(`${name}: bind ${n} asked ${bind.asked} time${bind.asked === 1 ? '' : 's'}; a later bind in the same connection must ask nothing`);
      if (bind.accepted !== bind.asked) problems.push(`${name}: bind ${n} asked ${bind.asked}, accepted ${bind.accepted}`);
    });
    if (declined > 0) problems.push(`${name}: ${declined} other request${declined === 1 ? '' : 's'} declined`);
  }
  const detail = (connections ?? []).map(({name, binds = [], declined = 0}) =>
    `${name}: ${binds.length} bind${binds.length === 1 ? '' : 's'}, asked ${binds.map(b => b.asked).join(', ')}; accepted ${binds.map(b => b.accepted).join(', ')}; declined ${declined}`).join('; ');
  return {ok: problems.length === 0, problems, detail};
}

// cua's own REPL host's tree (the supervisor and everything below it): every process runs one of `cuaNodes` (the Node
// running cua serve, the own host's resolved Node) or a system sandbox launcher (macOS: sandbox-exec, which execs Node),
// and at least one runs cua's Node. `vendorRuntime`: the processes running from the vendor runtime's root (node_repl,
// the vendor's Node), which this host never starts.
export function classifyOwnHostTree(tree, {cuaNodes, systemSandbox = [], vendorRoot}) {
  const cuaNode = p => cuaNodes.includes(p.executable);
  return {
    allExecutablesExpected: tree.some(cuaNode) && tree.every(p => cuaNode(p) || systemSandbox.includes(p.executable)),
    vendorRuntime: tree.filter(p => isUnder(p.executable, vendorRoot)),
    unexpected: tree.filter(p => !cuaNode(p) && !systemSandbox.includes(p.executable)),
  };
}

// `lsof -U -F pcfdn` text (every Unix socket lsof can see) -> [{pid, command, fd, device, name}], one per descriptor.
// On macOS `device` is the socket's kernel address and `name` the path it is bound at, or `->0x…`, its peer's address.
export function unixSockets(lsofText) {
  const out = [];
  let process = null;
  for (const line of lsofText.split('\n')) {
    const field = line[0];
    const value = line.slice(1);
    if (field === 'p') process = {pid: Number(value), command: ''};
    else if (field === 'c' && process) process.command = value;
    else if (field === 'f' && process) out.push({pid: process.pid, command: process.command, fd: value, device: null, name: null});
    else if (field === 'd' && out.length) out.at(-1).device = value;
    else if (field === 'n' && out.length) out.at(-1).name = value;
  }
  return out;
}

// The ends of the Unix socket at `path` among `sockets` (unixSockets'). `bound`: the descriptors named by the path, the
// listener and every connection it accepted (macOS names an accepted socket by the listener's path). `clients`: every
// descriptor whose peer (`->address`) is one of those, matched by address, since a client's own end is unbound and a
// listing filtered by the path never shows it. `unseen`: accepted connections whose client is not in `sockets` (a bound
// end no client points to, beyond the one listener), so a listing that cannot show every client never reads as clean.
export function unixSocketEnds(sockets, path) {
  const bound = sockets.filter(s => s.name === path);
  const addresses = new Set(bound.map(s => s.device));
  const clients = sockets.filter(s => s.name?.startsWith('->') && addresses.has(s.name.slice(2)));
  const answered = new Set(clients.map(s => s.name.slice(2)));
  return {bound, clients, unseen: Math.max(0, bound.filter(s => !answered.has(s.device)).length - 1)};
}

// The approved engine's socket judged from its ends (unixSocketEnds'): only the approved bundle's engine
// (`engineExecutable`), one process, may hold its address; only clients `mayConnect` admits (cua's Node; on the vendor
// host, its relay) may be connected; and every connection's client must be seen, or the clients are unproven.
// `executableOf(pid)`: a process's executable. With `requireEngine` (an app was bound) the engine must be there.
// -> {engine: pids, clients: pids, problems}.
export function engineSocketPeers({bound, clients, unseen}, {engineExecutable, mayConnect, executableOf, requireEngine}) {
  const engine = new Set();
  const connected = new Set();
  const problems = [];
  for (const pid of new Set(bound.map(s => s.pid))) {
    const executable = executableOf(pid);
    if (executable === engineExecutable) engine.add(pid);
    else problems.push(`pid ${pid} ${executable} holds the engine socket's address, which only the approved engine may`);
  }
  for (const pid of new Set(clients.map(s => s.pid))) {
    const executable = executableOf(pid);
    if (mayConnect(executable)) connected.add(pid);
    else problems.push(`pid ${pid} ${executable} is connected to the engine socket, which only cua's Node may`);
  }
  if (unseen > 0) problems.push(`${unseen} connection${unseen === 1 ? '' : 's'} to the engine socket whose client${unseen === 1 ? '' : 's'} lsof does not show: the clients are unproven`);
  if (engine.size > 1) problems.push(`${engine.size} engine processes (${[...engine].join(', ')}) hold the engine socket`);
  if (requireEngine && engine.size === 0) problems.push('no approved engine holds the engine socket');
  return {engine: [...engine], clients: [...connected], problems};
}

// The processes a session started from cua's own roots (`roots`: the home, the approved engine's directory): `during`
// against `before` (ps rows, a process being its pid and executable, so a reused pid is a new process). Each started one
// must run an `allowed` executable (the approved engine, cua's Node), so the pinned runtime's SkyComputerUseService,
// node_repl or vendor Node is a problem; processes already running before the session were not started by it and are
// only reported, and other installations' (the ChatGPT app's helper) are outside the roots by path.
// -> {started, preExisting, problems}.
export function cuaRootProcesses({before, during, roots, allowed}) {
  const key = p => `${p.pid} ${p.executable}`;
  const earlier = new Set(before.map(key));
  const ours = during.filter(p => roots.some(root => isUnder(p.executable, root)));
  const started = ours.filter(p => !earlier.has(key(p)));
  return {
    started,
    preExisting: ours.filter(p => earlier.has(key(p))),
    problems: started.filter(p => !allowed.includes(p.executable))
      .map(p => `pid ${p.pid} ${p.executable} started from cua's home during the session; only cua-engine and cua's Node may`),
  };
}

// What a closed connection left running, by pid: the processes of its observed tree still alive (`isAlive`), and every
// process `psText` shows running from the vendor runtime's root. The resident engine is neither: it outlives
// connections by design.
export function leftoverProcesses({observed, isAlive, psText, runtimeRoot}) {
  const out = new Map(survivors(observed, isAlive).map(p => [p.pid, p]));
  for (const p of psRows(psText)) if (isUnder(p.executable, runtimeRoot) && !out.has(p.pid)) out.set(p.pid, p);
  return [...out.values()];
}

// An error text for a report that may carry no window content: its first line, every quoted span elided (window titles
// and app names appear quoted in the engines' sentences), at most `max` characters.
export const boundedError = (text, max = 200) => String(text ?? '').split('\n')[0]
  .replace(/"[^"]*"/g, '"…"').replace(/'[^']*'/g, '\'…\'').replace(/“[^”]*”/g, '“…”').slice(0, max);

// lsappinfo's pid (`info -only pid …`, or a full info line) -> the pid, or null when there is none (an app that is not
// running prints nothing). macOS 26 prints `"pid"=736`, others `pid = 736`; a longer key ending in pid is not it.
export const lsappinfoPid = text => {
  const pid = Number(/(?:^|[\s,{])"?pid"?\s*=\s*(\d+)/m.exec(text ?? '')?.[1]);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
};

// Whether verify's --bind may observe `app` now, judged from the window server alone (FrontWindowProbe's layer-0
// windows, scripts/accept/window-close.mjs readWindows), never by an observation: the engine reopens a running app
// that has no primary window and every observation captures, so binding a TextEdit whose fixture document has closed
// would open and capture its Open panel, which can list the owner's documents. `pid`: the app's pid now (null: not
// running); `windows`: its layer-0 windows now ([{ownerPid, number, onScreen}], null when the reading failed), at least
// one of them on screen at every bind (a minimized document, one on another Space or an off-screen helper window, as
// Finder keeps, is no window to the engine's preparation); `first`: the {pid, windows} read before the first bind, given
// before every later one, whose pid must be the same and whose windows must all still be there, on screen or not (a
// window replaced is gone). -> null when the bind may run, else the refusal sentence.
export function bindRefusal({app, pid, windows, first}) {
  if (pid === null) return `${app} is not running: verify binds only an app that is running with its window open, so the engine never launches it`;
  if (first && pid !== first.pid) return `${app} is now pid ${pid}, not the pid ${first.pid} read before the first bind: it was relaunched, so the bind would observe a process the first bind never saw; bring the scene up again and re-run`;
  if (windows === null) return `the window server's windows of ${app} (pid ${pid}) could not be read (FrontWindowProbe), so whether its window is still open is unknown; nothing was bound`;
  if (windows.length === 0) return `${app} (pid ${pid}) has no window: an observation would reopen it and capture what it opens (TextEdit's Open panel), so verify binds only an app whose window is open; bring the scene up and re-run`;
  if (first) {
    const now = new Set(windows.map(w => `${w.ownerPid}:${w.number}`));
    const gone = first.windows.filter(w => !now.has(`${w.ownerPid}:${w.number}`));
    if (gone.length) return `window ${gone.map(w => w.number).join(', ')} of ${app} read before the first bind is gone, so the second bind could observe something other than the scene's window; bring the scene up again and re-run`;
  }
  if (!windows.some(w => w.onScreen)) return `${app} (pid ${pid}) has no window on screen (${windows.length} off screen: minimized, on another Space or hidden): an observation would treat it as windowless and reopen it, so verify binds only an app with a window on screen; bring the scene up and re-run`;
  return null;
}
