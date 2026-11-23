// The process watch around each fixture of acceptance 12's driver (#171 M6a, T6; the M6a pre-flight §5.2): a 50 ms
// sampler of /proc over the fixture's own process tree (its root, never anyone else's processes), folded as it goes so a
// long run keeps no samples. It records what M5's sampler did (scripts/linux-engine-gate/engine-watch.mjs reads the same
// record): the most sky_linux processes at once and every cua-engine with its executable and its parent's command line;
// and beside it each sky_linux's executable with the service and engine its parent was launched with
// (CUA_SKY_SERVICE, OAI_SKY_LINUX_BIN), and every process of the REPL host (Node running src/repl-host/<role>.mjs).
// Executables are read from /proc, never taken from a name.
import {readdirSync, readFileSync, readlinkSync} from 'node:fs';
import {basename} from 'node:path';
import {watchVerdict} from '../linux-engine-gate/engine-watch.mjs';

const SAMPLE_MS = 50;
const REPL_HOST = /\/src\/repl-host\/([\w-]+)\.mjs$/;
const isEngine = ({comm, exe}) => comm === 'cua-engine' || (typeof exe === 'string' && basename(exe) === 'cua-engine');
const isSky = ({comm, exe}) => /^sky_linux/.test(comm ?? '') || (typeof exe === 'string' && /^sky_linux_/.test(basename(exe)));
// A REPL host process is Node itself running the script: bubblewrap and the helper carry the same words after `--`.
const replRole = ({exe, argv}) => {
  const program = typeof exe === 'string' ? basename(exe) : basename(argv?.[0] ?? '');
  if (!/^node/.test(program)) return null;
  for (const arg of argv ?? []) { const role = REPL_HOST.exec(arg)?.[1]; if (role) return role; }
  return null;
};

/** An empty watch. */
export const newWatch = () => ({samples: 0, maxSkyLinux: 0, engines: new Map(), sky: new Map(), replHost: new Map()});

/**
 * One sample folded in: `entries`, each `{pid, ppid, state, comm, exe, argv, parent?: {argv, env}}` for the root's
 * process tree at that moment (`parent` read for engines only); a zombie (`state` Z) is skipped. -> the state.
 */
export function foldSample(state, entries) {
  state.samples += 1;
  let skyNow = 0;
  for (const entry of entries) {
    // A process that has exited and not yet been reaped (strace holds its children so) has no executable to read.
    if (entry.state === 'Z') continue;
    const parent = (entry.parent?.argv ?? []).join(' ');
    // An executable unread at one sample (the process was going) is filled by any sample that read it.
    const keep = (map, record) => { const seen = map.get(entry.pid); if (!seen) map.set(entry.pid, record); else if (seen.exe === null && record.exe !== null) map.set(entry.pid, record); };
    if (isEngine(entry)) keep(state.engines, {pid: entry.pid, exe: entry.exe ?? null, parent});
    if (isSky(entry)) {
      skyNow += 1;
      keep(state.sky, {pid: entry.pid, exe: entry.exe ?? null, parent, service: entry.parent?.env?.CUA_SKY_SERVICE ?? null, bin: entry.parent?.env?.OAI_SKY_LINUX_BIN ?? null});
    }
    const role = replRole(entry);
    if (role && !state.replHost.has(entry.pid)) state.replHost.set(entry.pid, {pid: entry.pid, role});
  }
  state.maxSkyLinux = Math.max(state.maxSkyLinux, skyNow);
  return state;
}

/** The watch's record: `{samples, maxSkyLinux, engines, skyLinux, replHost}`, in the order each was first seen. */
export const watchRecord = state => ({samples: state.samples, maxSkyLinux: state.maxSkyLinux, engines: [...state.engines.values()], skyLinux: [...state.sky.values()], replHost: [...state.replHost.values()]});

const sampled = watch => (watch.samples > 0 ? [] : ['the sampler took no samples']);
const skySeen = watch => (watch.maxSkyLinux > 0 ? [`sky_linux was seen (${watch.maxSkyLinux} at once at most)`] : []);
const enginesRan = watch => watch.engines.map(e => `cua-engine ${e.pid} ran (${e.exe ?? 'its executable unread'})`);

/** cua's engine answered (M5's judge, engine-watch.mjs): the home's `engine` under the trusted worker, no sky_linux. */
export const cuaEngineProblems = (watch, {engine}) => watchVerdict(watch, {engine}).problems;

/** No engine ran at any sample (a browser-only session). */
export const noEngineProblems = watch => [...sampled(watch), ...enginesRan(watch), ...skySeen(watch)];

/**
 * The vendor's engine answered (E5): a sky_linux whose executable is this home's `bin` (real path), its parent launched
 * with the vendor `service`, and no cua-engine at any sample.
 */
export function vendorEngineProblems(watch, {bin, service}) {
  const problems = [...sampled(watch), ...enginesRan(watch)];
  const own = watch.skyLinux.filter(s => s.exe === bin);
  if (!own.length) problems.push(`no sky_linux at any sample ran this home's ${bin}${watch.skyLinux.length ? ` (seen: ${watch.skyLinux.map(s => s.exe ?? 'unread').join(', ')})` : ''}`);
  else if (!own.some(s => s.service === service)) problems.push(`this home's sky_linux did not run behind the vendor service ${service} (its parent's CUA_SKY_SERVICE: ${own.map(s => s.service ?? 'unset').join(', ')})`);
  return problems;
}

/** Nothing launched: no REPL host process and no engine at any sample (a refused open). */
export const nothingLaunchedProblems = watch => [...sampled(watch), ...watch.replHost.map(p => `${p.role} ${p.pid} ran`), ...enginesRan(watch), ...skySeen(watch)];

// ---- the sampler -------------------------------------------------------------------------------------------------------

const read = path => { try { return readFileSync(path, 'utf8'); } catch { return null; } };
const exeOf = pid => { try { return readlinkSync(`/proc/${pid}/exe`); } catch { return null; } };
const argvOf = pid => (read(`/proc/${pid}/cmdline`) ?? '').split('\0').filter(Boolean);
const ENV_KEYS = ['CUA_SKY_SERVICE', 'OAI_SKY_LINUX_BIN'];
const envOf = pid => Object.fromEntries((read(`/proc/${pid}/environ`) ?? '').split('\0').map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]).filter(([k]) => ENV_KEYS.includes(k)));

/** The process tree under `root` now (root included), each entry as foldSample takes it. */
export function sampleTree(root) {
  const table = new Map();
  for (const name of readdirSync('/proc')) {
    if (!/^\d+$/.test(name)) continue;
    const stat = read(`/proc/${name}/stat`);
    if (!stat) continue;
    const close = stat.lastIndexOf(')');
    const fields = stat.slice(close + 2).split(' ');
    table.set(Number(name), {state: fields[0], ppid: Number(fields[1]), comm: stat.slice(stat.indexOf('(') + 1, close)});
  }
  const children = new Map();
  for (const [pid, {ppid}] of table) { if (!children.has(ppid)) children.set(ppid, []); children.get(ppid).push(pid); }
  const entries = [];
  const queue = table.has(root) ? [root] : [];
  while (queue.length) {
    const pid = queue.shift();
    const {state, ppid, comm} = table.get(pid);
    const entry = {pid, ppid, state, comm, exe: exeOf(pid), argv: argvOf(pid)};
    if (isEngine(entry) || isSky(entry)) entry.parent = {argv: argvOf(ppid), env: envOf(ppid)};
    entries.push(entry);
    queue.push(...(children.get(pid) ?? []));
  }
  return entries;
}

/** The watch over `root`: a sample now and every 50 ms until `stop()`, which takes a last one and returns the record. */
export function startWatch(root, {sample = sampleTree, interval = SAMPLE_MS} = {}) {
  const state = foldSample(newWatch(), sample(root));
  const timer = setInterval(() => foldSample(state, sample(root)), interval);
  return {stop: () => { clearInterval(timer); foldSample(state, sample(root)); return watchRecord(state); }};
}
