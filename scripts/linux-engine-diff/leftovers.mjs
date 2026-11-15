// The end check of what runs left behind (#171 M5, T4's second round; the design session's rulings 721 and 724). A
// run's scratch directory (scenes.mjs: `<TMPDIR or /tmp>/cua171-run-XXXXXX`, its home, its session bus's config and
// socket, its TMPDIR) goes at the run's end; a run that died first left it, and its session bus kept running, orphaned
// (task 87 found five, four with their buses). The check lists every such directory that is not the current run's, and
// every session-bus process whose config or socket lies in one, as a finding: named, never removed or signalled, since
// another run may own them. It runs at every run's end (scenes.mjs `closeEverything`, whatever ended the run) and after
// every gate step (gate.mjs, whatever ended the step's process), and on its own (`gate.mjs leftovers`).

import { existsSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { processState } from './pid-identity.mjs';

/** The run's scratch directory's name, before mkdtemp's six characters: short, since gedit's titles show the path. */
export const SCRATCH_PREFIX = 'cua171-run-';

/** The programs of a run's session bus (session-bus.mjs): its daemon, the accessibility bus launcher and its registry. */
export const BUS_PROGRAMS = ['dbus-daemon', 'dbus-broker', 'at-spi-bus-launcher', 'at-spi2-registryd'];
/** The variables that name a bus's socket in a process's environment. */
const BUS_VARS = ['DBUS_SESSION_BUS_ADDRESS', 'AT_SPI_BUS_ADDRESS'];

/** The roots a run's scratch may lie in (scenes.mjs `scratchRoot`): the harness's TMPDIR, and /tmp. */
export const scratchRoots = () => [...new Set([tmpdir(), '/tmp'])];

/** Every `cua171-run-*` directory under `roots`, `{dir, modified}`, by name. */
export function scratchDirs(roots = scratchRoots()) {
  const out = [];
  for (const root of roots) {
    let names;
    try {
      names = readdirSync(root);
    } catch {
      continue;
    }
    for (const name of names.filter((x) => x.startsWith(SCRATCH_PREFIX)).sort()) {
      const dir = join(root, name);
      try {
        const st = statSync(dir);
        if (st.isDirectory()) out.push({ dir, modified: st.mtime.toISOString() });
      } catch {
        // gone meanwhile
      }
    }
  }
  return out;
}

const read = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

/** A process's program: its executable's name, else its command name (a kernel-truncated 15 characters). */
function programOf(dir) {
  try {
    return basename(readlinkSync(join(dir, 'exe')));
  } catch {
    const comm = read(join(dir, 'comm'))?.trim() ?? '';
    return BUS_PROGRAMS.find((p) => p.startsWith(comm) && comm.length) ?? comm;
  }
}

/** A scratch directory's path inside a text (an argument, a bus address): `<...>/cua171-run-XXXXXX`, mkdtemp's six. */
const SCRATCH_PATH = new RegExp(`(/[^\\s,;=]*?/${SCRATCH_PREFIX}[A-Za-z0-9]{6})(?=/|$|[,;\\s])`, 'g');
const scratchPathsIn = (text) => [...text.matchAll(SCRATCH_PATH)].map((m) => m[1]);

/**
 * The session-bus processes (`BUS_PROGRAMS`) whose config (an argument naming a path in a scratch directory) or socket
 * (a bus address in its environment naming one) lies in a `cua171-run-*` directory, found by the path they name,
 * whether or not the directory still exists (review finding 2: a run's cleanup removes its scratch even when stopping
 * its bus failed): `{pid, program, dir, by: 'config' | 'socket', dir_exists}`, by pid; none of the directories in
 * `own`, or, with `only`, of those directories alone. `proc` is /proc, or a test's own.
 */
export function busesIn({ own = [], only = null, proc = '/proc' } = {}) {
  let pids;
  try {
    pids = readdirSync(proc).filter((x) => /^\d+$/.test(x)).map(Number).sort((a, b) => a - b);
  } catch {
    return [];
  }
  const mine = new Set(own);
  const out = [];
  for (const pid of pids) {
    const at = join(proc, String(pid));
    const program = programOf(at);
    if (!BUS_PROGRAMS.includes(program)) continue;
    const argv = (read(join(at, 'cmdline')) ?? '').split('\0').filter(Boolean);
    const env = (read(join(at, 'environ')) ?? '').split('\0').filter((kv) => BUS_VARS.some((v) => kv.startsWith(`${v}=`)));
    // `only`: the buses of those directories alone (a run's own, at its end); else every directory's but `own`
    const wanted = (d) => (only ? only.includes(d) : !mine.has(d));
    const config = argv.flatMap(scratchPathsIn).find(wanted);
    const socket = env.flatMap(scratchPathsIn).find(wanted);
    const dir = config ?? socket;
    if (!dir) continue;
    let exists = false;
    try {
      exists = statSync(dir).isDirectory();
    } catch {
      // gone: the bus outlived its scratch
    }
    out.push({ pid, program, dir, by: config ? 'config' : 'socket', dir_exists: exists });
  }
  return out;
}

/**
 * The check: every scratch directory under `roots` but the run's own (`own`, paths), and the session-bus processes of
 * those directories. `{roots, dirs, buses, clear}`; nothing is removed or signalled.
 */
export function leftoverCheck({ own = [], roots = scratchRoots(), proc = '/proc' } = {}) {
  const mine = new Set(own);
  const dirs = scratchDirs(roots).filter((d) => !mine.has(d.dir));
  const buses = busesIn({ own, proc });
  return { roots, dirs, buses, clear: dirs.length === 0 && buses.length === 0 };
}

/** The check in lines, each a finding: every directory, each of its buses under it, then the buses of directories gone. */
export function leftoverLines(check) {
  const lines = [];
  for (const d of check.dirs) {
    lines.push(`a cua171-run-* directory not this run's, left alone: ${d.dir} (modified ${d.modified})`);
    for (const b of check.buses.filter((x) => x.dir === d.dir)) lines.push(`a session-bus process of it, left alone: pid ${b.pid} ${b.program} (its ${b.by} in ${d.dir})`);
  }
  for (const b of check.buses.filter((x) => !check.dirs.some((d) => d.dir === x.dir))) {
    lines.push(`a session-bus process of a cua171-run-* directory ${b.dir_exists ? 'outside the roots read' : 'that is gone'}, left alone: pid ${b.pid} ${b.program} (its ${b.by} in ${b.dir})`);
  }
  return lines;
}

/**
 * The marker a run's Desktop writes in its scratch at once (scenes.mjs; ruling 730): the run, its nonce, the process that
 * made the directory (its pid and start time, pid-identity.mjs) and when. The start check removes a leftover only by it.
 */
export const MARKER = 'cua171-run.json';

/** Writes the marker into a run's own scratch. */
export function writeMarker(dir, info) {
  writeFileSync(join(dir, MARKER), `${JSON.stringify({ schema: 1, ...info })}\n`, { mode: 0o600 });
}

/** A scratch's marker, or null when it has none that reads. */
export function readMarker(dir) {
  try {
    const m = JSON.parse(readFileSync(join(dir, MARKER), 'utf8'));
    return Number.isSafeInteger(m?.pid) && typeof m.pid_start === 'string' && typeof m.created === 'string' ? m : null;
  } catch {
    return null;
  }
}

/**
 * Every live process but this one, as far as it can be read: `{pid, program, texts}` (its argv and environment, NUL
 * separated), or `{pid, program, unread}` when a process of this user's has an argv or environment that cannot be read
 * (fix wave 2: unknown, never empty). Another user's process is left out: it cannot reach a mode-700 directory of this
 * user's (root aside).
 */
export function processTable({ proc = '/proc', uid = process.getuid?.() } = {}) {
  let pids;
  try {
    pids = readdirSync(proc).filter((x) => /^\d+$/.test(x)).map(Number).sort((a, b) => a - b);
  } catch {
    return [];
  }
  const out = [];
  const boot = bootTime(proc);
  for (const pid of pids.filter((p) => p !== process.pid)) {
    const at = join(proc, String(pid));
    const owner = /^Uid:\s+(\d+)/m.exec(read(join(at, 'status')) ?? '')?.[1];
    if (owner !== undefined && uid !== undefined && Number(owner) !== uid) continue;
    const texts = [];
    let unread = null;
    for (const what of ['cmdline', 'environ']) {
      try {
        texts.push(readFileSync(join(at, what), 'utf8'));
      } catch (error) {
        // a process that ended meanwhile is gone, not unread
        if (existsSync(at)) unread = `pid ${pid}'s ${what === 'cmdline' ? 'argv' : 'environment'} cannot be read (${error.code ?? error.message})`;
      }
    }
    if (!existsSync(at)) continue;
    const st = processState(pid, { proc });
    const started = st.state === 'live' && boot !== null ? boot + Number(st.start) / USER_HZ : null;
    out.push(unread ? { pid, program: programOf(at), unread, started } : { pid, program: programOf(at), texts });
  }
  return out;
}

/** /proc's clock for start times (USER_HZ, 100 on Linux), and the boot's wall time in seconds (/proc/stat), or null. */
const USER_HZ = 100;
const bootTime = (proc) => {
  const m = /^btime (\d+)$/m.exec(read(join(proc, 'stat')) ?? '');
  return m ? Number(m[1]) : null;
};

const namesDir = (text, dir) => text.split('\0').some((part) => part === dir || part.includes(`${dir}/`) || part.endsWith(`=${dir}`));

/** Every live process (but this one) whose argv or environment names `dir` or a path in it: `{pid, program}`. */
export function processesNaming(dir, { proc = '/proc', table = processTable({ proc }) } = {}) {
  return table.filter((p) => p.texts?.some((t) => namesDir(t, dir))).map(({ pid, program }) => ({ pid, program }));
}

/**
 * The next run's start check (ruling 730, part (a)): every `cua171-run-*` directory under `roots` but the run's own
 * (`own`), and every session bus of a scratch, cleared or refused. A directory is removed only when it is provably the
 * harness's own and done: its marker (`MARKER`) reads, it is this user's with mode 700, the run that made it is gone
 * (no live process has the marker's pid and start time: `identity`), the marker's time is before now, and no live
 * process names it. Anything else is refused with the reason and left as it is, and so is a bus whose directory is
 * gone (the check ends no process). Answers `{cleared: [{dir, run}], refused: [{dir, reason}]}`; a run starts only when
 * nothing is refused.
 */
export function startCheck({ own = [], roots = scratchRoots(), proc = '/proc', creator = (pid) => processState(pid, { proc }), uid = process.getuid?.(), now = () => Date.now(), remove = (dir) => rmSync(dir, { recursive: true, force: true }) } = {}) {
  const mine = new Set(own);
  const cleared = [];
  const refused = [];
  const table = processTable({ proc, uid });
  // a process whose argv or environment cannot be read is unknown, unless it started before the directory was made: its
  // argv and environment are its exec's, so it cannot name a path that did not exist then ((sd-pam), for one)
  const unreadFor = (marker) => table.filter((p) => p.unread && !(p.started !== null && p.started !== undefined && p.started * 1000 < Date.parse(marker.created))).map((p) => p.unread);
  for (const { dir } of scratchDirs(roots).filter((d) => !mine.has(d.dir))) {
    const marker = readMarker(dir);
    let st = null;
    try {
      st = statSync(dir);
    } catch {
      continue;
    }
    // the creator by its stat alone: absent, or its pid now another start's, is gone; unreadable is unknown (wave 2)
    const made = marker && /^\d+$/.test(marker.pid_start) ? creator(marker.pid) : null;
    const naming = processesNaming(dir, { table });
    const why = !marker
      ? "no marker of the harness's: it cannot be proved a run's own"
      : uid !== undefined && st.uid !== uid
        ? `owned by uid ${st.uid}, not this user's`
        : (st.mode & 0o777) !== 0o700
          ? `mode ${(st.mode & 0o777).toString(8)}, not 700`
          : !/^\d+$/.test(marker.pid_start)
            ? `the start time of the run that made it is unknown (${marker.pid_start}), so it cannot be proved gone`
            : made?.state === 'unknown'
              ? `whether the run that made it (pid ${marker.pid}) still runs cannot be read (${made.reason})`
              : made?.state === 'live' && made.start === marker.pid_start
                ? `the run that made it is still running (pid ${marker.pid})`
                : !(Date.parse(marker.created) <= now())
                  ? `its marker's time ${marker.created} is not before now`
                  : naming.length
                    ? `a live process names it: ${naming.map((p) => `pid ${p.pid} ${p.program}`).join(', ')}`
                    : unreadFor(marker).length
                      ? `whether a live process names it cannot be read: ${unreadFor(marker).join('; ')}`
                      : null;
    if (why) {
      refused.push({ dir, reason: why });
      continue;
    }
    remove(dir);
    cleared.push({ dir, run: marker.run ?? null });
  }
  // residue of a scratch already gone (a session bus, a scene process that outlived its run): nothing to remove, and no
  // process is the check's to end, so the start refuses, naming it (wave 2: any process naming the path, by its path)
  for (const p of table.filter((x) => x.texts)) {
    const gone = [...new Set(p.texts.flatMap((t) => t.split('\0')).flatMap(scratchPathsIn))].filter((d) => !mine.has(d) && !existsSync(d));
    for (const d of gone) refused.push({ dir: d, reason: `its directory is gone and a process naming it still runs: pid ${p.pid} ${p.program}` });
  }
  return { cleared, refused };
}

/** A start check's refusal in one line. */
export const startRefusalText = (refused) => `the start check refuses to run: ${refused.map((r) => `${r.dir}: ${r.reason}`).join('; ')}`;
