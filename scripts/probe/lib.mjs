// Pure helpers behind scripts/probe-runtime.mjs: relocated paths, the probe's allowlisted child environment,
// process-tree classification, socket-holder parsing and evidence sanitization. No I/O here, so the verdict-bearing
// logic is testable without the vendor runtime.

// Only these ambient variables reach the vendor runtime; everything else (NODE_REPL_*, SKY_*, BROWSER_USE_*,
// NODE_OPTIONS, CODEX_HOME, ...) is dropped so a stray override cannot redirect the relocated launch.
const AMBIENT_ALLOWLIST = ['HOME', 'USER', 'LOGNAME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', '__CF_USER_TEXT_ENCODING'];
const FIXED_PATH = '/usr/bin:/bin:/usr/sbin:/sbin';

export function runtimePaths({home, release}) {
  const root = `${home}/runtimes/${release}`;
  const moduleDir = `${root}/cua_node/lib/node_modules`;
  return {
    root,
    node: `${root}/cua_node/bin/node`,
    nodeRepl: `${root}/cua_node/bin/node_repl`,
    moduleDir,
    cuaRepl: `${moduleDir}/@oai/cua-repl/bin/cua-repl.mjs`,
    codexCli: `${root}/CodexCLI.app/Contents/MacOS/codex`,
    codexCliApp: `${root}/CodexCLI.app`,
    skyServiceApp: `${moduleDir}/@oai/sky/Codex Computer Use.app`,
    skyVendorService: `${moduleDir}/@oai/sky/dist/project/cua/sky_js/src/service.js`,
    codexHome: `${home}/state/codex`,
  };
}

export function probeEnv({ambient, paths, wrapperPath, trustedCodeDirs, allowUnixSockets = []}) {
  const env = {};
  for (const key of AMBIENT_ALLOWLIST) if (typeof ambient[key] === 'string') env[key] = ambient[key];
  Object.assign(env, {
    PATH: FIXED_PATH,
    CODEX_HOME: paths.codexHome,
    CUA_REPL_NODE_REPL_PATH: paths.nodeRepl,
    CUA_REPL_ENABLED_SURFACES: 'computer',
    NODE_REPL_NODE_PATH: paths.node,
    NODE_REPL_NODE_MODULE_DIRS: paths.moduleDir,
    NODE_REPL_TRUSTED_CODE_PATHS: [paths.codexHome, paths.moduleDir, ...trustedCodeDirs].join(':'),
    NODE_REPL_TRUSTED_SERVICES: JSON.stringify({sky: wrapperPath}),
    NODE_REPL_NATIVE_PIPE_CONNECT_TIMEOUT_MS: '1000',
    NODE_REPL_DISABLE_ANALYTICS: '1',
    CODEX_CLI_PATH: paths.codexCli,
    SKY_CUA_SERVICE_PATH: paths.skyServiceApp,
    CUA_SKY_VENDOR_SERVICE: paths.skyVendorService,
  });
  if (allowUnixSockets.length) env.NODE_REPL_SANDBOX_ALLOWED_UNIX_SOCKETS = allowUnixSockets.join(':');
  return env;
}

// `ps -axo pid=,ppid=,comm=` text -> the probe child and everything below it, breadth-first. `comm` is the full
// executable path, which may contain spaces ("Codex Computer Use.app"), so it is the rest of the line.
export function descendants(psText, rootPid) {
  const rows = psText.split('\n').map(line => line.match(/^\s*(\d+)\s+(\d+)\s+(.*?)\s*$/)).filter(Boolean)
    .map(([, pid, ppid, executable]) => ({pid: Number(pid), ppid: Number(ppid), executable}));
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
  const relocated = p => p.executable.startsWith(relocatedRoot + '/');
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
