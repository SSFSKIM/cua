// The end check of what runs left behind (#171 M5, T4's second round; the design session's rulings 721 and 724). A
// run's scratch directory (scenes.mjs: `<TMPDIR or /tmp>/cua171-run-XXXXXX`, its home, its session bus's config and
// socket, its TMPDIR) goes at the run's end; a run that died first left it, and its session bus kept running, orphaned
// (task 87 found five, four with their buses). The check lists every such directory that is not the current run's, and
// every session-bus process whose config or socket lies in one, as a finding: named, never removed or signalled, since
// another run may own them. It runs at every run's end (scenes.mjs `closeEverything`, whatever ended the run) and after
// every gate step (gate.mjs, whatever ended the step's process), and on its own (`gate.mjs leftovers`).

import { readFileSync, readdirSync, readlinkSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { processIdentity } from './pid-identity.mjs';

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

/** Every live process (but this one) whose argv or environment names `dir` or a path in it: `{pid, program}`. */
export function processesNaming(dir, { proc = '/proc' } = {}) {
  let pids;
  try {
    pids = readdirSync(proc).filter((x) => /^\d+$/.test(x)).map(Number).sort((a, b) => a - b);
  } catch {
    return [];
  }
  const names = (text) => text.split('\0').some((part) => part === dir || part.includes(`${dir}/`) || part.endsWith(`=${dir}`));
  return pids
    .filter((pid) => pid !== process.pid)
    .filter((pid) => names(read(join(proc, String(pid), 'cmdline')) ?? '') || names(read(join(proc, String(pid), 'environ')) ?? ''))
    .map((pid) => ({ pid, program: programOf(join(proc, String(pid))) }));
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
export function startCheck({ own = [], roots = scratchRoots(), proc = '/proc', identity = (pid) => processIdentity(pid, { proc }), uid = process.getuid?.(), now = () => Date.now(), remove = (dir) => rmSync(dir, { recursive: true, force: true }) } = {}) {
  const mine = new Set(own);
  const cleared = [];
  const refused = [];
  for (const { dir } of scratchDirs(roots).filter((d) => !mine.has(d.dir))) {
    const marker = readMarker(dir);
    let st = null;
    try {
      st = statSync(dir);
    } catch {
      continue;
    }
    const naming = processesNaming(dir, { proc });
    const why = !marker
      ? "no marker of the harness's: it cannot be proved a run's own"
      : uid !== undefined && st.uid !== uid
        ? `owned by uid ${st.uid}, not this user's`
        : (st.mode & 0o777) !== 0o700
          ? `mode ${(st.mode & 0o777).toString(8)}, not 700`
          : identity(marker.pid)?.start === marker.pid_start
            ? `the run that made it is still running (pid ${marker.pid})`
            : !(Date.parse(marker.created) <= now())
              ? `its marker's time ${marker.created} is not before now`
              : naming.length
                ? `a live process names it: ${naming.map((p) => `pid ${p.pid} ${p.program}`).join(', ')}`
                : null;
    if (why) {
      refused.push({ dir, reason: why });
      continue;
    }
    remove(dir);
    cleared.push({ dir, run: marker.run ?? null });
  }
  // a bus whose scratch is gone: nothing to remove, and no process is the check's to end (an existing one's bus is a
  // live process naming it, refused above)
  for (const b of busesIn({ own, proc })) {
    if (b.dir_exists) continue;
    refused.push({ dir: b.dir, reason: `its directory is gone and a process of it still runs: pid ${b.pid} ${b.program}` });
  }
  return { cleared, refused };
}

/** A start check's refusal in one line. */
export const startRefusalText = (refused) => `the start check refuses to run: ${refused.map((r) => `${r.dir}: ${r.reason}`).join('; ')}`;
