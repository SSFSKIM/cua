// The end check of what runs left behind (#171 M5, T4's second round; the design session's rulings 721 and 724). A
// run's scratch directory (scenes.mjs: `<TMPDIR or /tmp>/cua171-run-XXXXXX`, its home, its session bus's config and
// socket, its TMPDIR) goes at the run's end; a run that died first left it, and its session bus kept running, orphaned
// (task 87 found five, four with their buses). The check lists every such directory that is not the current run's, and
// every session-bus process whose config or socket lies in one, as a finding: named, never removed or signalled, since
// another run may own them. It runs at every run's end (scenes.mjs `closeEverything`, whatever ended the run) and after
// every gate step (gate.mjs, whatever ended the step's process), and on its own (`gate.mjs leftovers`).
//
// The next run's start check (ruling 730) refuses to start on any leftover, naming it and its evidence, and removes
// nothing (fix wave 3). A leftover is removed only by the explicit command `gate.mjs leftovers --remove <dir>
// --confirm`, whose proof needs every process of this user's fully observed (process-references.mjs).

import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { processState } from './pid-identity.mjs';
import { SCRATCH_PREFIX, observeProcesses, referenceText, referencesTo, scratchPathsIn, scratchReferences, unobservedText } from './process-references.mjs';

export { SCRATCH_PREFIX };

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
 * The session-bus processes (`BUS_PROGRAMS`) whose config (an argument naming a path in a scratch directory) or socket
 * (a bus address in its environment naming one) lies in a `cua171-run-*` directory, found by the path they name,
 * whether or not the directory still exists (review finding 2: a run's cleanup removes its scratch even when stopping
 * its bus failed): `{pid, program, dir, by: 'config' | 'socket', dir_exists}`, by pid; none of the directories in
 * `own`, or, with `only`, of those directories alone. `proc` is /proc, a test's own, or null for none.
 */
export function busesIn({ own = [], only = null, proc = '/proc' } = {}) {
  if (proc === null) return [];
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
 * made the directory (its pid and start time, pid-identity.mjs) and when. A leftover is removed only by it, and only
 * through the explicit command (`removalProof`).
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

/** A marker's creator by its stat alone (pid-identity.mjs `processState`): `{absent, text}`; unreadable is never absent. */
function creatorOf(marker, creator) {
  if (!/^\d+$/.test(marker.pid_start)) return { absent: false, text: `the start time of pid ${marker.pid} is unknown (${marker.pid_start})` };
  const made = creator(marker.pid);
  if (made.state === 'absent') return { absent: true, text: `pid ${marker.pid} is absent` };
  if (made.state === 'unknown') return { absent: false, text: `pid ${marker.pid} cannot be read (${made.reason})` };
  if (made.start === marker.pid_start) return { absent: false, text: `pid ${marker.pid} is still running` };
  return { absent: true, text: `pid ${marker.pid} is another process now (start ${made.start}; the creator's was ${marker.pid_start})` };
}

/** The observed processes referring to `dir`, each as a finding (`pid N program (its cwd, fds)`). */
const referencing = (processes, dir) => processes.map((p) => [p, referencesTo(p, dir)]).filter(([, by]) => by.length).map(([p, by]) => referenceText(p, by));

/**
 * The start check (ruling 730, part (a); fix wave 3): every `cua171-run-*` directory under `roots` but the run's own
 * (`own`), and every scratch already gone that a live process of this user's still refers to (a session bus, a scene
 * process that outlived its run), each refused with its evidence. It removes nothing and signals nothing. Removing a
 * directory needs every process of this user's fully observed, which a start cannot count on ((sd-pam)'s environment
 * never reads), so removal is `removeLeftover`'s: a person's or the controller's explicit command. Here a field that
 * could not be read is evidence of nothing, so an unobservable process blocks no run. Answers `{refused: [{dir,
 * reason}]}`; a run starts only when it is empty.
 */
export function startCheck({ own = [], roots = scratchRoots(), proc = '/proc', creator = (pid) => processState(pid, { proc }), uid = process.getuid?.() } = {}) {
  const mine = new Set(own);
  const { processes } = observeProcesses({ proc, uid });
  const listed = scratchDirs(roots).filter((d) => !mine.has(d.dir)).map((d) => d.dir);
  const refused = [];
  for (const dir of listed) {
    const marker = readMarker(dir);
    const refs = referencing(processes, dir);
    let st = null;
    try {
      st = statSync(dir);
    } catch {
      // gone meanwhile: still named, as it was there
    }
    const evidence = [
      ...(marker ? [`its marker reads (run ${marker.run ?? 'unnamed'}, pid ${marker.pid})`, `its creator ${creatorOf(marker, creator).text}`] : ["no marker of the harness's"]),
      ...(st && uid !== undefined && st.uid !== uid ? [`owned by uid ${st.uid}, not this user's`] : []),
      ...(st && (st.mode & 0o777) !== 0o700 ? [`mode ${(st.mode & 0o777).toString(8)}, not 700`] : []),
      refs.length ? `referenced by ${refs.join(', ')}` : 'no observed process references it',
    ];
    refused.push({ dir, reason: `a cua171-run-* directory not this run's: ${evidence.join('; ')}; the start check removes nothing: \`gate.mjs leftovers --remove ${dir} --confirm\` removes it once its proof holds` });
  }
  // a scratch already gone: nothing to remove, and no process is the check's to end
  const gone = new Map();
  for (const p of processes) {
    for (const { dir, by } of scratchReferences(p)) {
      if (mine.has(dir) || listed.includes(dir) || existsSync(dir)) continue;
      const holders = gone.get(dir) ?? new Map();
      gone.set(dir, holders);
      holders.set(p, [...(holders.get(p) ?? []), by]);
    }
  }
  for (const [dir, holders] of gone) refused.push({ dir, reason: `its directory is gone and a process still references it: ${[...holders].map(([p, by]) => referenceText(p, by)).join(', ')}` });
  return { refused };
}

/** A start check's refusal in one line. */
export const startRefusalText = (refused) => `the start check refuses to run: ${refused.map((r) => `${r.dir}: ${r.reason}`).join('; ')}`;

/**
 * The proof that a leftover scratch directory may be removed (fix wave 3; `gate.mjs leftovers --remove <dir>`), every
 * condition read and shown: it is a `cua171-run-*` directory and not a link; its marker reads; it is this user's, mode
 * 700; the run that made it is absent by its stat (gone, or its pid another start's); the marker's time is before now;
 * every process of this user's was fully observed (argv, environ, cwd, root, exe, fds and maps); and none refers to
 * it. `{dir, holds, checks: [{what, holds, detail}], text}`. Nothing is removed or signalled here.
 */
export function removalProof(dir, { proc = '/proc', creator = (pid) => processState(pid, { proc }), uid = process.getuid?.(), now = () => Date.now() } = {}) {
  const path = resolve(dir);
  const checks = [];
  const check = (what, holds, detail) => checks.push({ what, holds: Boolean(holds), detail });
  let st = null;
  let unread = null;
  try {
    st = lstatSync(path);
  } catch (error) {
    unread = error.code ?? error.message;
  }
  const name = basename(path);
  const scratch = Boolean(st?.isDirectory()) && name.startsWith(SCRATCH_PREFIX) && name.length > SCRATCH_PREFIX.length;
  check('a cua171-run-* directory, not a link', scratch, scratch ? path : !st ? `${path} cannot be read (${unread})` : st.isSymbolicLink() ? `${path} is a link` : !st.isDirectory() ? `${path} is not a directory` : `${name} is not a cua171-run-* name`);
  if (scratch) {
    const marker = readMarker(path);
    check('its marker reads', marker, marker ? `run ${marker.run ?? 'unnamed'}, pid ${marker.pid}, created ${marker.created}` : `no ${MARKER} of the harness's reads`);
    check("this user's", uid === undefined || st.uid === uid, `owned by uid ${st.uid}`);
    check('mode 700', (st.mode & 0o777) === 0o700, `mode ${(st.mode & 0o777).toString(8)}`);
    const made = marker ? creatorOf(marker, creator) : { absent: false, text: 'no marker names it' };
    check('its creator is absent', made.absent, made.text);
    check("its marker's time is before now", marker && Date.parse(marker.created) <= now(), marker ? `created ${marker.created}` : 'no marker');
    const { processes, unlisted } = observeProcesses({ proc, uid });
    const unobserved = processes.filter((p) => p.unobserved.length);
    check('every same-user process was fully observed', !unlisted && !unobserved.length, unlisted ?? (unobserved.length ? unobserved.map(unobservedText).join('; ') : `${processes.length} processes, each's argv, environ, cwd, root, exe, fds and maps`));
    const refs = referencing(processes, path);
    check('no same-user process references it', !refs.length, refs.length ? refs.join(', ') : 'none of those observed');
  }
  const holds = checks.every((c) => c.holds);
  const text = [`the removal proof of ${path}:`, ...checks.map((c) => `- ${c.holds ? 'holds' : 'FAILS'}: ${c.what}: ${c.detail}`)].join('\n');
  return { dir: path, holds, checks, text };
}

/**
 * `gate.mjs leftovers --remove <dir> [--confirm]`: the proof printed first, then the directory removed only when the
 * proof holds and `confirm` is given. Never signals. `{proof, removed, text}`.
 */
export function removeLeftover(dir, { confirm = false, remove = (d) => rmSync(d, { recursive: true }), ...options } = {}) {
  const proof = removalProof(dir, options);
  const lines = [proof.text];
  let removed = false;
  if (!proof.holds) lines.push(`refused: ${proof.checks.filter((c) => !c.holds).map((c) => c.what).join('; ')}: not proved; nothing removed`);
  else if (!confirm) lines.push('the proof holds; not removed without --confirm');
  else {
    remove(proof.dir);
    removed = true;
    lines.push(`removed ${proof.dir}`);
  }
  return { proof, removed, text: lines.join('\n') };
}
