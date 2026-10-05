// M9 static layer: how does the original OpenAI Chrome native host find its configuration, and does anything in it
// check registry liveness? Read-only tools only (nm -u, otool -L, strings, otool -l/-tV, codesign --verify, shasum);
// neither host binary is ever executed. Every conclusion carries its evidence tag:
//   string-evidence       the literal is present in the binary (strings), nothing about how it is used;
//   disassembly-evidence  direct calls / adrp+add literal references in `otool -tV` output (indirect calls through
//                         function pointers or vtables are not followed, and are named as such);
//   unknown               neither settles it.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, statSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {parseOtool, stringRefs, calls, parseSections, makeReader, literalAddresses, pointerTables} from './disasm.mjs';
import {verifiedVendor} from './hosts.mjs';

const HOST_SUBPATH = 'extension-host/macos/arm64/ChatGPT for Chrome';
// The archived host is read from the reference-app source tree (the directory holding `_dist/` with the extracted
// ChatGPT.app of each build). Its location is a required input of the static layer, never a default here.
export const ARCHIVED_HOST = join('_dist/chatgpt-26.928.40906/ChatGPT.app/Contents/Resources/plugins/openai-bundled/plugins/chrome', HOST_SUBPATH);
export const binaries = readableSource => [
  {label: 'installed', path: join(homedir(), '.codex/plugins/cache/openai-bundled/chrome/latest', HOST_SUBPATH)},
  {label: 'archived-26.928.40906', path: join(readableSource, ARCHIVED_HOST)},
];

// Literals of interest, grouped by the question they serve. Matching is exact: a literal counts as referenced by a
// function only when an adrp+add in it materialises the literal's first byte.
export const KEYS = {
  configFiles: ['extension-host-config.json', 'chrome-native-hosts-v2.json', '.codex-global-state.json'],
  registryPathSegments: ['OpenAI', 'Codex', 'Library', 'Application Support', 'HOME', 'CODEX_HOME', 'USERPROFILE'],
  registryFields: ['schemaVersion', 'entries', 'updatedAt', 'presence', 'pid', 'clientId', 'paths', 'nativeHostNames', 'extensionIds', 'extensionBuildChannels', 'resourcesPath', 'extensionHostPath', 'constraints', 'requiredAppServerProtocolVersion', 'requiredNativeHostProtocolVersion'],
  configFields: ['browserClientPath', 'browserServicePath', 'codexCliPath', 'codexHome', 'nodeReplPath', 'nodePath', 'proxyHost', 'proxyPort'],
  childEnv: ['CODEX_CLI_PATH', 'CODEX_EXTENSION_ID', 'CODEX_BROWSER_USE_NODE_PATH', 'CODEX_BROWSER_CLIENT_PATH', 'CODEX_NODE_REPL_PATH', 'CODEX_APP_SERVER_PROXY_HOST', 'CODEX_APP_SERVER_PROXY_PORT'],
  errorCodes: ['app_server_runtime_error', 'chrome_extension_update_required', 'codex_app_update_required', 'manifest_invalid', 'manifest_missing', 'no_matching_codex_install', 'required_path_missing'],
  errorMessages: ['Codex Chrome native host v2 manifest is missing', 'No compatible Codex app-server entry was found', 'No Codex app-server entry matches the required protocol version', 'Manifest entry must use schemaVersion 2', 'Codex Chrome native host manifest must use schemaVersion 2', 'Matching manifest entry is malformed', 'Codex app-server manifest entry is missing required path', 'Failed to start Codex app-server with '],
  socket: ['/tmp/codex-browser-use', 'unix socket directory path is not a directory', 'peer parent', 'unexpected peer audit token length'],
};
const PROCESS_IMPORTS = ['_proc_pidinfo', '_proc_pidpath', '_proc_listpids', '_kill', '_getppid', '_sysctl', '_audit_token_to_pid', '_SecCodeCopyGuestWithAttributes', '_posix_spawnp', '_posix_spawnattr_setpgroup', '_fork', '_execvp', '_waitpid', '_setsid', '_bind', '_listen', '_socket', '_clock_gettime'];
const TOOL = {encoding: 'utf8', maxBuffer: 256 << 20, timeout: 120_000};

const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');

// Mach-O names carry one extra leading underscore; c++filt demangles the rest (Rust v0 included).
function demangler(names) {
  const list = [...names];
  let out = [];
  try { out = execFileSync('/usr/bin/c++filt', {...TOOL, input: list.map(n => n.replace(/^_/, '')).join('\n')}).split('\n'); } catch {}
  const map = new Map(list.map((n, i) => [n, (out[i] || n).replace(/\[[0-9a-f]{16}\]/g, '')]));
  return n => map.get(n) ?? n;
}

// Functions that can reach any of `targets` through direct calls (reverse BFS).
function reachers(graph, targets) {
  const callers = new Map();
  for (const [fn, callees] of graph) for (const c of callees) { if (!callers.has(c)) callers.set(c, new Set()); callers.get(c).add(fn); }
  const seen = new Set();
  const queue = [...targets];
  while (queue.length) for (const c of callers.get(queue.shift()) ?? []) if (!seen.has(c)) { seen.add(c); queue.push(c); }
  return seen;
}

// Caller chains of one target up to `depth`, by readable name.
function chains(graph, target, name, depth = 5) {
  const callers = new Map();
  for (const [fn, callees] of graph) for (const c of callees) { if (!callers.has(c)) callers.set(c, new Set()); callers.get(c).add(fn); }
  const out = [];
  const walk = (node, path) => {
    const up = [...(callers.get(node) ?? [])];
    if (!up.length || path.length >= depth) { out.push(path.map(name)); return; }
    for (const c of up) path.includes(c) ? out.push([...path, c].map(name)) : walk(c, [...path, c]);
  };
  walk(target, [target]);
  return out.map(p => p.join(' <- '));
}

export function analyzeBinary({label, path}) {
  if (!existsSync(path)) return {label, present: false};
  const buffer = readFileSync(path);
  const imports = execFileSync('/usr/bin/nm', ['-u', path], TOOL).split('\n').filter(Boolean);
  const libraries = execFileSync('/usr/bin/otool', ['-L', path], TOOL).split('\n').slice(1).map(l => l.trim().split(' (')[0]).filter(Boolean);
  const stringsText = execFileSync('/usr/bin/strings', ['-a', '-n', '3', path], TOOL);
  const sections = parseSections(execFileSync('/usr/bin/otool', ['-l', path], TOOL));
  const fns = parseOtool(execFileSync('/usr/bin/otool', ['-tV', path], TOOL));
  const read = makeReader(buffer, sections);
  const graph = new Map(fns.map(f => [f.name, new Set(calls(f))]));
  const refsByFn = new Map(fns.map(f => [f.name, new Set(stringRefs(f))]));
  const name = demangler(new Set([...graph.keys(), ...[...graph.values()].flatMap(s => [...s])]));

  const present = {};
  const referencedBy = {};
  for (const [group, keys] of Object.entries(KEYS)) {
    present[group] = keys.filter(k => stringsText.includes(k));
    referencedBy[group] = {};
    for (const key of keys) {
      const literals = literalAddresses(buffer, sections, key).filter(a => read(a, key.length) === key);
      const direct = new Set(literals);
      const tables = literals.flatMap(a => pointerTables(buffer, sections, a));
      const users = fns.filter(f => [...refsByFn.get(f.name)].some(a => direct.has(a))).map(f => name(f.name));
      const viaTable = fns.filter(f => [...refsByFn.get(f.name)].some(a => tables.some(t => a >= t.base && a <= t.slot))).map(f => `${name(f.name)} (via pointer table)`);
      referencedBy[group][key] = [...new Set([...users, ...viaTable])];
    }
  }

  const callSites = target => fns.filter(f => graph.get(f.name).has(target)).map(f => ({fn: name(f.name), count: f.instructions.filter(i => i.comment?.includes(`symbol stub for: ${target}`)).length}));
  const loader = fns.find(f => /AppServerHostConfig4load$/.test(f.name));
  const socketBind = fns.find(f => /bind_owner_only_socket$/.test(f.name));
  const mainFn = fns.find(f => /14extension_host4main$/.test(f.name));
  const errorResponse = fns.find(f => /codex_runtime_error_response$/.test(f.name));
  const pidReachers = reachers(graph, ['_proc_pidinfo']);
  const killReachers = reachers(graph, ['_kill']);
  const loaderReachers = loader ? reachers(graph, [loader.name]) : new Set();
  const indirect = fns.reduce((n, f) => n + f.instructions.filter(i => i.op === 'blr' || i.op === 'br').length, 0);
  const loaderIndirect = loader ? loader.instructions.filter(i => i.op === 'blr' || i.op === 'br').length : null;
  return {
    label, present: true, bytes: statSync(path).size, sha256: sha256(path), signatureVerified: verifiedVendor(path),
    libraries, importCount: imports.length, processImports: PROCESS_IMPORTS.filter(s => imports.includes(s)),
    symbolsStripped: fns.length < 50, functionCount: fns.length, indirectBranches: indirect,
    strings: present, referencedBy,
    calls: {
      proc_pidinfo: {sites: callSites('_proc_pidinfo'), chains: chains(graph, '_proc_pidinfo', name)},
      kill: {sites: callSites('_kill'), chains: chains(graph, '_kill', name)},
      configLoader: loader ? {
        fn: name(loader.name),
        directCallees: [...graph.get(loader.name)].map(name).filter(n => !/drop_in_place|core::ptr|__rust_|panicking|raw_vec|unwrap_failed|_memcpy|_memcmp|Unwind/.test(n)),
        callerChains: chains(graph, loader.name, name, 7),
        reachesProcPidinfo: pidReachers.has(loader.name) || graph.get(loader.name).has('_proc_pidinfo'),
        reachesKill: killReachers.has(loader.name) || graph.get(loader.name).has('_kill'),
        indirectBranchesInLoader: loaderIndirect,
        reachableFromMainDirectly: mainFn ? loaderReachers.has(mainFn.name) : null,
      } : null,
      errorResponse: errorResponse ? {fn: name(errorResponse.name), callerChains: chains(graph, errorResponse.name, name, 5), reachableFromMainDirectly: mainFn ? reachers(graph, [errorResponse.name]).has(mainFn.name) : null} : null,
      socketBind: socketBind ? {fn: name(socketBind.name), callerChains: chains(graph, socketBind.name, name), reachesConfigLoader: loader ? reachers(graph, [loader.name]).has(socketBind.name) : null} : null,
    },
  };
}

const sameSet = (a, b) => a.length === b.length && a.every(x => b.includes(x));

// The conclusions the M9 entry asks for, each with its evidence tag, derived from the analysed binaries.
export function findings(results) {
  const ok = results.filter(r => r.present);
  const out = [];
  const add = (id, conclusion, evidence, detail) => out.push({id, conclusion, evidence, detail});
  for (const r of ok) {
    const L = r.label;
    const loader = r.calls.configLoader;
    add(`${L}:config-file-names`, `references ${r.strings.configFiles.join(', ')}`, 'string-evidence', {present: r.strings.configFiles});
    if (loader) {
      const cfgUsers = r.referencedBy.configFiles;
      add(`${L}:config-loader`, `${loader.fn} materialises ${Object.entries(cfgUsers).filter(([, fns]) => fns.includes(loader.fn)).map(([k]) => k).join(' and ')}; it directly calls ${['current_exe', 'Path>::parent', 'var_os', 'read_to_string', 'canonicalize', 'required_manifest_path_exists'].filter(c => loader.directCallees.some(n => n.includes(c))).join(', ')} (exact path composition not reconstructed)`, 'disassembly-evidence', {referencedBy: cfgUsers, directCallees: loader.directCallees});
      add(`${L}:registry-path`, `registry path segments ${r.strings.registryPathSegments.filter(s => ['OpenAI', 'Codex', 'Library', 'Application Support', 'HOME'].includes(s)).join(' / ')} next to chrome-native-hosts-v2.json; consistent with $HOME/Library/Application Support/OpenAI/Codex/chrome-native-hosts-v2.json, segment order not proven`, 'string-evidence', {segmentsReferencedByLoader: Object.entries(r.referencedBy.registryPathSegments).filter(([, f]) => f.includes(loader.fn)).map(([k]) => k)});
      add(`${L}:registry-fields-read`, `the config loader references registry fields ${Object.entries(r.referencedBy.registryFields).filter(([, f]) => f.includes(loader.fn)).map(([k]) => k).join(', ')}`, 'disassembly-evidence', {referencedBy: r.referencedBy.registryFields});
      add(`${L}:pid-liveness`, `proc_pidinfo call sites: ${r.calls.proc_pidinfo.sites.map(s => s.fn).join(', ') || 'none'}${r.calls.proc_pidinfo.sites.length === 1 && /code_identity/.test(r.calls.proc_pidinfo.sites[0].fn) ? ' (socket-peer ancestry for code-identity checks)' : ''}; kill call sites: ${r.calls.kill.sites.map(s => s.fn).join(', ') || 'none'}${r.calls.kill.chains.every(c => /stop_app_server_child/.test(c)) ? ' (reached only from app-server child stop)' : ''}. The config loader reaches neither through direct calls${loader.reachesProcPidinfo || loader.reachesKill ? ' -- CONTRADICTED: see detail' : ''}. ${['_getppid', '_sysctl', '_proc_listpids', '_proc_pidpath'].filter(x => !r.processImports.includes(x)).map(x => x.slice(1)).join('/')} not imported. No PID-probe path for registry presence.pid was found; any time-based or other use of "presence" is unknown`, loader.reachesProcPidinfo || loader.reachesKill ? 'unknown' : 'disassembly-evidence', {procPidinfo: r.calls.proc_pidinfo, kill: r.calls.kill, loaderIndirectBranches: loader.indirectBranchesInLoader, processImports: r.processImports});
      add(`${L}:presence-semantics`, `"presence" and "pid" are read by the config loader, but how they affect entry selection is not established`, 'unknown', {presenceReferencedBy: r.referencedBy.registryFields.presence, pidReferencedBy: r.referencedBy.registryFields.pid});
      add(`${L}:socket-vs-app-server`, `the socket is created on main's path (${r.calls.socketBind?.callerChains?.[0] ?? 'unknown'}); the config/registry loader is reached only via ${loader.callerChains.map(c => c.split(' <- ').slice(1, 3).join(' <- ')).join('; ')} (app-server ensure on a native-host control message), not from main directly -- registry absence/mismatch gates the app-server spawn, not socket creation`, r.calls.socketBind && loader.reachableFromMainDirectly === false ? 'disassembly-evidence' : 'unknown', {socketBind: r.calls.socketBind, loaderCallerChains: loader.callerChains, reachableFromMainDirectly: loader.reachableFromMainDirectly});
      const er = r.calls.errorResponse;
      const codeUsers = [...new Set(Object.values(r.referencedBy.errorCodes).flat())];
      const msgUsers = [...new Set(Object.values(r.referencedBy.errorMessages).flat())];
      const gated = er && er.reachableFromMainDirectly === false && codeUsers.length > 0;
      add(`${L}:error-code-gates`, `the native-host error codes (${Object.keys(r.referencedBy.errorCodes).filter(k => r.referencedBy.errorCodes[k].length).join(', ')}) are emitted only by ${codeUsers.join(', ') || 'no located function'}${er ? `, whose caller is ${er.callerChains.map(c => c.split(' <- ')[1]).join(', ')}` : ''}; the manifest/registry error messages are built by ${msgUsers.join(', ') || 'no located function'}. main does not reach them through direct calls (main binds the socket itself; the handler runs per incoming native-messaging control message on the transport thread), so they gate app-server spawning after the socket exists, not socket creation`, gated ? 'disassembly-evidence' : 'unknown', {errorCodes: r.referencedBy.errorCodes, errorMessages: r.referencedBy.errorMessages, errorResponse: er});
    }
  }
  if (ok.length === 2) {
    const [a, b] = ok;
    add('installed-vs-archived', `same imports class (${sameSet(a.processImports, b.processImports) ? 'identical process imports' : 'process imports differ'}), same config/registry literals (${sameSet(a.strings.configFiles, b.strings.configFiles) && sameSet(a.strings.registryFields, b.strings.registryFields) ? 'identical' : 'different'}); binaries differ by hash`, 'string-evidence', {sha256: {[a.label]: a.sha256, [b.label]: b.sha256}, errorCodes: {[a.label]: a.strings.errorCodes, [b.label]: b.strings.errorCodes}});
  }
  return out;
}

export function runStaticLayer({readableSource}) {
  if (!readableSource) throw new Error('the static layer needs the reference-app source tree (--readable-source or CUA_READABLE_SOURCE)');
  const results = binaries(readableSource).map(analyzeBinary);
  const all = findings(results);
  const s = (pass, blocked) => pass ? 'PASS' : blocked ? 'BLOCKED' : 'FAIL';
  const present = results.filter(r => r.present);
  const missing = results.filter(r => !r.present).map(r => r.label);
  const scenarios = [
    {id: 'static-inputs', title: 'both host binaries present and signature-valid (codesign --verify only, never executed)', status: s(present.length === 2 && present.every(r => r.signatureVerified), missing.length), detail: {missing, signatureVerified: Object.fromEntries(present.map(r => [r.label, r.signatureVerified]))}},
    {id: 'static-config-files', title: 'configuration file names and registry location referenced', status: s(present.length && present.every(r => r.strings.configFiles.includes('extension-host-config.json') && r.strings.configFiles.includes('chrome-native-hosts-v2.json') && r.calls.configLoader), !present.length)},
    {id: 'static-pid-symbols', title: 'proc_pidinfo/kill presence and proximity to registry reading', status: s(present.length && all.filter(f => f.id.endsWith(':pid-liveness')).length === present.length, !present.length)},
    {id: 'static-gates', title: 'error codes gating socket creation versus app-server spawning', status: s(present.length && all.filter(f => f.id.endsWith(':socket-vs-app-server')).every(f => f.evidence !== 'unknown') && all.some(f => f.id.endsWith(':socket-vs-app-server')), !present.length)},
  ];
  return {layer: 'static', executedBinaries: 0, tools: ['nm -u', 'otool -L', 'otool -l', 'otool -tV', 'strings -a', 'codesign --verify', 'sha256 (node:crypto)', 'c++filt (symbol names only)'], binaries: results, findings: all, scenarios};
}
