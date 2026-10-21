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

// The holders of the approved engine's socket ([{pid, executable}], lsof's pids with their executables): the approved
// bundle's engine, once, and clients `mayConnect` admits (cua's Node; on the vendor host, its node_repl relay). Another
// engine at the socket (a copy from elsewhere) or any other holder is a problem; with `requireEngine` (an app was bound)
// the approved engine must be there. lsof may list a pid once per descriptor. -> {engine: pids, clients: pids, problems}.
export function engineSocketHolders(holders, {engineExecutable, mayConnect, requireEngine}) {
  const engine = new Set();
  const clients = new Set();
  const problems = [];
  const seen = new Set();
  for (const {pid, executable} of holders) {
    if (seen.has(pid)) continue;
    seen.add(pid);
    if (executable === engineExecutable) engine.add(pid);
    else if (mayConnect(executable)) clients.add(pid);
    else problems.push(`pid ${pid} ${executable} holds the engine socket, which only the approved engine and cua's Node may`);
  }
  if (engine.size > 1) problems.push(`${engine.size} engine processes (${[...engine].join(', ')}) hold the engine socket`);
  if (requireEngine && engine.size === 0) problems.push('no approved engine holds the engine socket');
  return {engine: [...engine], clients: [...clients], problems};
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

// `lsappinfo info -only pid -app <bundle id>` text -> the running app's pid, or null when it is not running.
export const runningPid = text => Number(/"pid"\s*=\s*(\d+)/.exec(text ?? '')?.[1]) || null;
