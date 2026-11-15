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

/**
 * One process's fields, `{pid, program, fields, unobserved: [{field, reason}]}`, or null when it ended while being read.
 * A zombie has released its files, working directory and memory: it holds nothing, so it is fully observed as empty.
 */
function observeOne(pid, at) {
  const stat = read(join(at, 'stat'));
  const state = stat?.slice(stat.lastIndexOf(')') + 2).split(' ')[0];
  const fields = {};
  const unobserved = [];
  const field = (name, readIt) => {
    try {
      fields[name] = readIt();
    } catch (error) {
      fields[name] = null;
      unobserved.push({ field: name, reason: error.code ?? String(error.message) });
    }
  };
  if (state === 'Z' || state === 'X') {
    for (const f of [...TEXT_FIELDS, ...LINK_FIELDS]) fields[f] = ['cwd', 'root', 'exe'].includes(f) ? null : [];
  } else {
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
  // a process that ended meanwhile is gone, not unobserved
  if (!existsSync(at)) return null;
  const comm = read(join(at, 'comm'))?.trim() ?? '';
  const program = fields.exe ? basename(fields.exe.replace(DELETED, '')) : comm;
  return { pid, program, ...(state === 'Z' || state === 'X' ? { zombie: true } : {}), fields, unobserved };
}

/**
 * Every live process of this user's but this one (`self`), as far as each can be read: `{processes, unlisted}`, where
 * `unlisted` is the reason /proc could not be listed (then nothing was observed at all), else null. Another user's
 * process is left out: it cannot reach a mode-700 directory of this user's (root aside). A process whose owner cannot
 * be read is kept, as possibly this user's.
 */
export function observeProcesses({ proc = '/proc', uid = process.getuid?.(), self = process.pid } = {}) {
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
