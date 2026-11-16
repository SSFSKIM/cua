// Which processes refer to a run's scratch directory (#171 M5, T4's second round, fix wave 3): the one model both the
// start check's refusal and the removal command's proof read (leftovers.mjs). Each process of this user's is read field
// by field from /proc, metadata only: its argv and environment, and the paths its cwd, root, executable, open files and
// mappings name. Every field that was read is kept when another was not. A field that could not be read is recorded as
// unobserved: never proof that the process refers to nothing, and never, alone, proof that it refers to anything.
// Nothing here signals a process.

import { existsSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { basename, join } from 'node:path';

/** The run's scratch directory's name, before mkdtemp's six characters: short, since gedit's titles show the path. */
export const SCRATCH_PREFIX = 'cua171-run-';

/** A process's texts: its argv and its environment. */
export const TEXT_FIELDS = ['argv', 'environ'];
/** The paths a process holds: its working directory, its root, its executable, its open files and its mappings. */
export const LINK_FIELDS = ['cwd', 'root', 'exe', 'fds', 'maps'];

/** A scratch directory's path inside a text (an argument, a bus address): `<...>/cua171-run-XXXXXX`, mkdtemp's six. */
const SCRATCH_PATH = new RegExp(`(/[^\\s,;=]*?/${SCRATCH_PREFIX}[A-Za-z0-9]{6})(?=/|$|[,;\\s])`, 'g');
export const scratchPathsIn = (text) => [...text.matchAll(SCRATCH_PATH)].map((m) => m[1]);

/** /proc's mark on a link to a file or directory that was removed. */
const DELETED = / \(deleted\)$/;

/** The scratch directory an absolute path lies in: the path up to its first `cua171-run-*` component, or null. */
export function scratchOf(path) {
  const parts = path.replace(DELETED, '').split('/');
  const i = parts.findIndex((x) => x.startsWith(SCRATCH_PREFIX) && x.length > SCRATCH_PREFIX.length);
  return parts[0] === '' && i > 0 ? parts.slice(0, i + 1).join('/') : null;
}

const read = (path) => {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
};

/** A /proc/<pid>/maps line's path: what follows its five fixed columns. */
const MAPS_PATH = /^\S+ \S+ \S+ \S+ \S+\s+(.+)$/;

/** A process's or task's state, from its stat (`S`, `R`, `Z`...), or undefined when the stat does not read. */
const stateAt = (at) => {
  const stat = read(join(at, 'stat'));
  return stat?.slice(stat.lastIndexOf(')') + 2).split(' ')[0];
};
const exited = (state) => state === 'Z' || state === 'X';

/** Each field at `at` (a process's directory, or one task's), handed to `got(name, value)` or `missed(name, reason)`. */
function readFields(at, got, missed) {
  const field = (name, readIt) => {
    try {
      got(name, readIt());
    } catch (error) {
      missed(name, error.code ?? String(error.message));
    }
  };
  const parts = (text) => text.split('\0').filter(Boolean);
  field('argv', () => parts(readFileSync(join(at, 'cmdline'), 'utf8')));
  field('environ', () => parts(readFileSync(join(at, 'environ'), 'utf8')));
  for (const name of ['cwd', 'root', 'exe']) field(name, () => readlinkSync(join(at, name)));
  field('fds', () =>
    readdirSync(join(at, 'fd')).flatMap((fd) => {
      try {
        return [readlinkSync(join(at, 'fd', fd))];
      } catch (error) {
        // closed meanwhile: not a file it holds
        if (error.code === 'ENOENT') return [];
        throw error;
      }
    }),
  );
  field('maps', () => [...new Set(readFileSync(join(at, 'maps'), 'utf8').split('\n').map((l) => MAPS_PATH.exec(l)?.[1]).filter((p) => p?.startsWith('/')))]);
}

/**
 * One process's fields, `{pid, program, fields, unobserved: [{field, reason}]}`, or null when it ended while being read.
 * A leader that has exited (`Z`) while worker threads live (fix wave 4: its main thread called pthread_exit) is read
 * through its live tasks, `/proc/<pid>/task/<tid>/`: every live task's fields count, each a list of what the tasks hold,
 * and a task that cannot be read is unobserved. Only a leader with no live task is a zombie: it has released its
 * files, working directory and memory, so it holds nothing and is fully observed as empty. A task list that cannot be
 * read is unobserved.
 */
function observeOne(pid, at) {
  const state = stateAt(at);
  const fields = {};
  const unobserved = [];
  let zombie = false;
  if (!exited(state)) {
    readFields(at, (name, value) => (fields[name] = value), (name, reason) => {
      fields[name] = null;
      unobserved.push({ field: name, reason });
    });
  } else {
    for (const f of [...TEXT_FIELDS, ...LINK_FIELDS]) fields[f] = [];
    let tids = null;
    try {
      tids = readdirSync(join(at, 'task')).filter((x) => /^\d+$/.test(x));
    } catch (error) {
      unobserved.push({ field: 'tasks', reason: error.code ?? String(error.message) });
    }
    // a task whose stat does not read is taken for live, and then read like one
    const live = (tids ?? []).filter((tid) => !exited(stateAt(join(at, 'task', tid))));
    for (const tid of live) {
      const task = join(at, 'task', tid);
      const missed = [];
      readFields(task, (name, value) => fields[name].push(...[value].flat()), (name, reason) => missed.push({ field: `task ${tid} ${name}`, reason }));
      // a task that ended meanwhile is gone, not unobserved
      if (existsSync(task)) unobserved.push(...missed);
    }
    zombie = tids !== null && !live.length;
  }
  // a process that ended meanwhile is gone, not unobserved
  if (!existsSync(at)) return null;
  const comm = read(join(at, 'comm'))?.trim() ?? '';
  const exe = [fields.exe].flat().find((e) => typeof e === 'string');
  const program = exe ? basename(exe.replace(DELETED, '')) : comm;
  return { pid, program, ...(zombie ? { zombie: true } : {}), fields, unobserved };
}

/**
 * Every live process of this user's but this one (`self`), as far as each can be read: `{processes, unlisted}`, where
 * `unlisted` is the reason /proc could not be listed or was not read (`proc: null`), and then nothing was observed at
 * all; else null. Another user's process is left out: it cannot reach a mode-700 directory of this user's (root
 * aside). A process whose owner cannot be read is kept, as possibly this user's.
 */
export function observeProcesses({ proc = '/proc', uid = process.getuid?.(), self = process.pid } = {}) {
  // a test process names its own /proc or reads none (hermetic.mjs)
  if (proc === null) return { processes: [], unlisted: 'no process table is read here' };
  let pids;
  try {
    pids = readdirSync(proc).filter((x) => /^\d+$/.test(x)).map(Number).sort((a, b) => a - b);
  } catch (error) {
    return { processes: [], unlisted: `${proc} cannot be listed (${error.code ?? error.message})` };
  }
  const processes = [];
  for (const pid of pids.filter((p) => p !== self)) {
    const at = join(proc, String(pid));
    const owner = /^Uid:\s+(\d+)/m.exec(read(join(at, 'status')) ?? '')?.[1];
    if (owner !== undefined && uid !== undefined && Number(owner) !== uid) continue;
    const p = observeOne(pid, at);
    if (p) processes.push(p);
  }
  return { processes, unlisted: null };
}

/** A field's values: a list, a single link, or none when it was not read. */
const valuesOf = (p, f) => [p.fields[f]].flat().filter((v) => typeof v === 'string');

/**
 * The scratch directories a process refers to, `[{dir, by}]`, each field once per directory: the absolute scratch paths
 * in its argv and environment, and every link (cwd, root, exe, open file, mapping) inside a `cua171-run-*` path, a
 * removed one included. The start check finds what a gone scratch left still running by these.
 */
export function scratchReferences(p) {
  const seen = new Set();
  const out = [];
  const add = (dir, by) => {
    if (seen.has(`${by}\0${dir}`)) return;
    seen.add(`${by}\0${dir}`);
    out.push({ dir, by });
  };
  for (const by of TEXT_FIELDS) for (const v of valuesOf(p, by)) for (const dir of scratchPathsIn(v)) add(dir, by);
  for (const by of LINK_FIELDS) for (const v of valuesOf(p, by)) {
    const dir = scratchOf(v);
    if (dir) add(dir, by);
  }
  return out;
}

const escaped = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * The fields by which a process refers to the scratch directory `dir`: any field whose value holds the directory's
 * name as a path component, so a literal path, a relative one (`cua171-run-XXXXXX/home/log` beside a cwd above it) and
 * a link inside it, removed or not, all count. mkdtemp's names are random, so the name stands for the directory; a
 * same-named directory elsewhere counts too, which errs towards keeping it.
 */
export function referencesTo(p, dir) {
  const component = new RegExp(`(^|[/=:\\s])${escaped(basename(dir))}(?=$|[/\\s,;:])`);
  return [...TEXT_FIELDS, ...LINK_FIELDS].filter((f) => valuesOf(p, f).some((v) => component.test(v)));
}

/** A process as a finding: `pid N program (its cwd, fds)`. */
export const referenceText = (p, by) => `pid ${p.pid} ${p.program} (its ${by.join(', ')})`;

/** A process's unobserved fields as a finding: `pid N's environ (EACCES), cwd (EACCES)`. */
export const unobservedText = (p) => `pid ${p.pid}'s ${p.unobserved.map((u) => `${u.field} (${u.reason})`).join(', ')}`;
