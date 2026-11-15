// The end check of what runs left behind (#171 M5, T4's second round; the design session's rulings 721 and 724). A
// run's scratch directory (scenes.mjs: `<TMPDIR or /tmp>/cua171-run-XXXXXX`, its home, its session bus's config and
// socket, its TMPDIR) goes at the run's end; a run that died first left it, and its session bus kept running, orphaned
// (task 87 found five, four with their buses). The check lists every such directory that is not the current run's, and
// every session-bus process whose config or socket lies in one, as a finding: named, never removed or signalled, since
// another run may own them. It runs at every run's end (scenes.mjs `closeEverything`, whatever ended the run) and after
// every gate step (gate.mjs, whatever ended the step's process), and on its own (`gate.mjs leftovers`).

import { readFileSync, readdirSync, readlinkSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

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

/**
 * The session-bus processes (`BUS_PROGRAMS`) whose config (an argument naming a path in the directory) or socket (a
 * bus address in its environment naming one) lies in one of `dirs`: `{pid, program, dir, by: 'config' | 'socket'}`, by
 * pid. `proc` is /proc, or a test's own.
 */
export function busesIn(dirs, { proc = '/proc' } = {}) {
  if (!dirs.length) return [];
  let pids;
  try {
    pids = readdirSync(proc).filter((x) => /^\d+$/.test(x)).map(Number).sort((a, b) => a - b);
  } catch {
    return [];
  }
  const inside = (text, dir) => text === dir || text.includes(`${dir}/`);
  const out = [];
  for (const pid of pids) {
    const at = join(proc, String(pid));
    const program = programOf(at);
    if (!BUS_PROGRAMS.includes(program)) continue;
    const argv = (read(join(at, 'cmdline')) ?? '').split('\0').filter(Boolean);
    const env = (read(join(at, 'environ')) ?? '').split('\0').filter((kv) => BUS_VARS.some((v) => kv.startsWith(`${v}=`)));
    for (const dir of dirs) {
      const by = argv.some((a) => inside(a, dir)) ? 'config' : env.some((kv) => inside(kv, dir)) ? 'socket' : null;
      if (by) {
        out.push({ pid, program, dir, by });
        break;
      }
    }
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
  const buses = busesIn(dirs.map((d) => d.dir), { proc });
  return { roots, dirs, buses, clear: dirs.length === 0 && buses.length === 0 };
}

/** The check in lines, each a finding: every directory, then each of its buses under it. */
export function leftoverLines(check) {
  const lines = [];
  for (const d of check.dirs) {
    lines.push(`a cua171-run-* directory not this run's, left alone: ${d.dir} (modified ${d.modified})`);
    for (const b of check.buses.filter((x) => x.dir === d.dir)) lines.push(`a session-bus process of it, left alone: pid ${b.pid} ${b.program} (its ${b.by} in ${d.dir})`);
  }
  return lines;
}
