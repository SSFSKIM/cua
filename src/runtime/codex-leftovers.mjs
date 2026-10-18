// The Codex CLI's leftovers in a cua home (#115 M4; docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Design
// "Removal, CODEX_HOME and the install"). Since #115 cua confines its children with its own sandbox and runs no Codex
// CLI, so two kinds of things the CLI left behind are dead weight to this cua, which `cua install --prune-leftovers`
// removes and `cua doctor` reports until then. Removal is explicit, never part of a plain install: run records cannot
// see version skew, an older cua sharing the same CUA_HOME (an installed plugin snapshot, a long-lived shim, a
// checkout's serve or agent) whose vendor host still launches the CLI and which may write no run record, or an
// old-format one. So the user updates every cua using the home first, then prunes:
//   - in the runtime's CODEX_HOME ($CUA_HOME/state/codex), what the signed CLI wrote when it ran there, by name only
//     (CODEX_HOME_LEFTOVERS, plus `*.sqlite` with its `-wal` and `-shm`, at CODEX_HOME's top level). What node_repl still
//     keeps there for the macOS vendor host (config.toml, computer-use/sessions, node_repl/active_execs) is not on the
//     list and never touched;
//   - in an installed release tree, the CLI component its pin used to list and lists no more: CodexCLI.app (darwin, a
//     directory; the darwin pin kept its release id when M2 dropped it) or `codex` (linux, a file; M3). Only in a tree
//     cua installed (a real directory holding an install record valid for its checked-in pin), only by that exact name,
//     and never while a session may be running from this home: run/ records no session's release, so any session the
//     stale sweep leaves (a live owner, a record not yet readable, an entry with no record, or a run/ that cannot be
//     read) defers it to a later install. A session started by a cua before #115 runs its children through that CLI.
// Only cua's own CODEX_HOME is ever looked at, $CUA_HOME/state/codex from the home's layout: the environment's
// CODEX_HOME (the Codex CLI's own setting, which may name the user's ~/.codex) is never read.
// Every path is reached from the real home through real directories only (a link on the way is not followed, and is
// reported as not inspected, so it never reads as clean): a symbolic link at any step (state/,
// state/codex, runtimes/, a release directory, tmp/ or browser/ in CODEX_HOME) is never followed, and a leftover that is
// itself a link is unlinked, its target left as it is. Results carry paths, never content. A removal that fails is
// reported and left for doctor to keep naming; it never fails the install.
import {lstatSync, readFileSync, readdirSync, renameSync, rmSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {dirname, join} from 'node:path';
import {CuaError, fail} from './errors.mjs';
import {homeLayout, realHome} from './layout.mjs';
import {RECORD_FILE, readInstalledRecord} from './manifest.mjs';
import {assertSessionParents, sweepRun} from './run-dir.mjs';

export const CODEX_HOME_LEFTOVERS = ['auth.json', 'installation_id', 'models_cache.json', 'cache', 'plugins', 'skills', 'log', 'tmp/arg0', 'browser/sessions'];
const SQLITE = /\.sqlite(-wal|-shm)?$/;
// The Codex CLI component a release pin used to list, per platform, and whether it is a directory.
const CLI_COMPONENT = {darwin: {name: 'CodexCLI.app', directory: true}, linux: {name: 'codex', directory: false}};
// What a prune renames a release's CLI to before deleting it (removeCodexLeftovers); one left by a failed delete or a
// crash is a leftover too, found by exactly this shape.
const tombstoneName = name => `.${name}.pruning-${randomBytes(4).toString('hex')}`;
const TOMBSTONE = /^\.(CodexCLI\.app|codex)\.pruning-[0-9a-f]+$/;

// A scan of the home: every lstat or listing error other than a missing path (ENOENT, ENOTDIR) is recorded in
// `errors`, and every symbolic link on the way to a leftover (`ownDirectory`) in `uninspected`, so neither an
// unreadable directory nor a link that is not followed ever reads as clean.
export const UNINSPECTED = 'symlink_not_inspected';
function scanner() {
  const errors = [], uninspected = [];
  const record = (path, error) => { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') errors.push({path, code: error.code ?? 'error'}); };
  const lstat = path => { try { return lstatSync(path); } catch (error) { record(path, error); return null; } };
  return {
    errors,
    uninspected,
    lstat,
    // A directory of cua's own on the way to a leftover: a link there is not followed, and is reported.
    ownDirectory: path => {
      const stat = lstat(path);
      if (stat?.isSymbolicLink()) uninspected.push(path);
      return stat?.isDirectory() ?? false;
    },
    names: dir => { try { return readdirSync(dir).sort(); } catch (error) { record(dir, error); return []; } },
    readable: path => { try { readFileSync(path); return true; } catch (error) { record(path, error); return false; } },
  };
}

// -> {codexHome, files: CODEX_HOME-relative names present, trees: [{release, name, path}], errors: [{path, code}],
// uninspected: [path of a link on the way, not followed]}.
export function findCodexLeftovers({home, pins}) {
  const layout = homeLayout(realHome(home));
  const scan = scanner();
  return {codexHome: layout.codexHome, files: codexHomeLeftovers(layout, scan), trees: unusedCliComponents(layout, pins, scan), errors: scan.errors, uninspected: scan.uninspected};
}

function codexHomeLeftovers({home, codexHome}, {lstat, ownDirectory, names}) {
  if (!ownDirectory(join(home, 'state')) || !ownDirectory(codexHome)) return [];
  const found = CODEX_HOME_LEFTOVERS.filter(rel => {
    const parent = rel.includes('/') ? join(codexHome, rel.split('/')[0]) : null;
    return (!parent || ownDirectory(parent)) && lstat(join(codexHome, rel)) !== null;
  });
  return [...found, ...names(codexHome).filter(name => SQLITE.test(name))];
}

// The release CLI components, and the tombstones a prune left (`tombstone: true`, whichever the pin lists).
function unusedCliComponents({runtimes}, pins, {lstat, ownDirectory, names, readable, uninspected}) {
  if (!ownDirectory(runtimes)) return [];
  const found = [];
  for (const release of names(runtimes)) {
    const pin = pins.find(p => p.release === release);
    const component = pin && CLI_COMPONENT[pin.platform];
    if (!component) continue;
    const root = join(runtimes, release);
    if (!ownDirectory(root)) continue;
    // The record must be readable to tell a tree cua installed: an unreadable one is a scan error (any error but
    // ENOENT), not a stranger's tree; readable content that is not a valid record is one, and is left alone.
    if (!readable(join(root, RECORD_FILE))) continue;
    try { readInstalledRecord(root, pin); } catch (error) { if (error instanceof CuaError) continue; throw error; }
    for (const name of names(root)) {
      const match = TOMBSTONE.exec(name);
      if (match && lstat(join(root, name))) found.push({release, name: match[1], path: join(root, name), tombstone: true});
    }
    if (Object.hasOwn(pin.components ?? {}, component.name)) continue;
    const path = join(root, component.name);
    const stat = lstat(path);
    if (stat?.isSymbolicLink()) uninspected.push(path);
    else if (stat && (component.directory ? stat.isDirectory() : stat.isFile())) found.push({release, name: component.name, path});
  }
  return found;
}

// What in run/ may still be a running session, after `sweep` (sweepRun) removed the dead ones: one description each.
export function sessionsInUse(home, sweep = sweepRun) {
  let found;
  try { found = sweep(home); } catch (error) { return [`${homeLayout(realHome(home)).run} could not be read (${error.code ?? error.message})`]; }
  return [...found.live.map(s => `session ${s.session} (pid ${s.pid})`), ...found.unowned.map(name => `${name} (no owner record)`)];
}

export const PRUNE_COMMAND = 'cua install --prune-leftovers';
const PRUNE_ADVICE = `once every cua using this home is updated (an older one may still launch the Codex CLI), \`${PRUNE_COMMAND}\` removes them`;

// `cua install --prune-leftovers`'s cleanup -> {codexHome, removed: [path], deferred: [{path, reason}], failed: [{path,
// code}]} (`failed` also carries the scan's errors). `sweep` is the run/ sweep (injectable for tests). Refuses
// (prune_refused), removing nothing, when a directory a session's entries live in is a symbolic link
// (run-dir.mjs assertSessionParents), since the sweep would have to look through it.
// A release's CLI is checked for sessions right before it goes and again after it is renamed aside to a tombstone in
// its own directory (one rename, so no launch ever sees half a bundle); a session found the second time puts it back.
// What remains is a session that starts after that second check and launches the CLI before the tombstone is deleted:
// only an older cua does that (this one never launches it). On macOS its launch then fails; on Linux an older cua on
// the vendor host may run its kernel unconfined after a failed launch (#135), so updating every cua that shares the
// home before pruning is a precondition, not a nicety. A tombstone whose delete failed (an unreadable directory inside, a crash)
// stays a leftover by its exact shape, `.<component>.pruning-<hex>` in an installed tree: doctor names it and the next
// prune removes it with no session condition, since no cua launches that name. It is never renamed back.
export function removeCodexLeftovers({home, pins, sweep = sweepRun}) {
  try { assertSessionParents(realHome(home)); } catch (error) {
    if (!error.code) throw error;
    fail('prune_refused', `the Codex CLI's leftovers were not pruned: ${error.message}`, {hint: 'make it a real directory of the cua home again, then run cua install --prune-leftovers'});
  }
  const found = findCodexLeftovers({home, pins});
  const result = {codexHome: found.codexHome, removed: [], deferred: [], failed: [...found.errors, ...found.uninspected.map(path => ({path, code: UNINSPECTED}))]};
  const remove = (path, removing = path) => {
    try { rmSync(removing, {recursive: true, force: true}); result.removed.push(path); } catch (error) { result.failed.push({path: removing, code: error.code ?? 'error'}); }
  };
  for (const rel of found.files) remove(join(found.codexHome, rel));
  const busy = () => { const inUse = sessionsInUse(home, sweep); return inUse.length ? `a session may be running from this home: ${inUse.join(', ')}` : null; };
  for (const {path, name, tombstone: left} of found.trees) {
    // A tombstone's name is launched by no cua (an older one launches the component's exact name), so it goes now.
    if (left) { remove(path); continue; }
    const before = busy();
    if (before) { result.deferred.push({path, reason: before}); continue; }
    const tombstone = join(dirname(path), tombstoneName(name));
    try { renameSync(path, tombstone); } catch (error) { result.failed.push({path, code: error.code ?? 'error'}); continue; }
    const after = busy();
    if (after) {
      try { renameSync(tombstone, path); result.deferred.push({path, reason: after}); } catch (error) { result.failed.push({path: tombstone, code: error.code ?? 'error'}); }
      continue;
    }
    remove(path, tombstone);
  }
  return result;
}

// The line a plain `cua install` prints when leftovers are there (it removes nothing), or none.
const notInspected = path => `${path} is a symbolic link and was not inspected (cua never follows one)`;

export function describeLeftovers({codexHome, files, trees, errors = [], uninspected = []}) {
  if (!files.length && !trees.length && !errors.length && !uninspected.length) return [];
  const parts = [...(files.length ? [`${codexHome}: ${files.join(', ')}`] : []), ...trees.map(t => t.path), ...errors.map(e => `${e.path} could not be read (${e.code})`),
    ...uninspected.map(notInspected)];
  return [`the Codex CLI's leftovers are still here (${parts.join('; ')}); once every cua using this home is updated, run \`${PRUNE_COMMAND}\``];
}

// The lines `cua install --prune-leftovers` prints for its result: names and paths only.
export function describeRemoval({codexHome, removed, deferred, failed}) {
  const inHome = removed.filter(path => path.startsWith(`${codexHome}/`)).map(path => path.slice(codexHome.length + 1));
  return [
    ...(inHome.length ? [`removed the Codex CLI's leftovers from ${codexHome}: ${inHome.join(', ')}`] : []),
    ...removed.filter(path => !path.startsWith(`${codexHome}/`)).map(path => `removed the Codex CLI's unused ${path}`),
    ...deferred.map(({path, reason}) => `left the Codex CLI's unused ${path} in place, since ${reason}; run ${PRUNE_COMMAND} again when none is`),
    ...failed.map(({path, code}) => (code === UNINSPECTED
      ? `${notInspected(path)}, so whatever the Codex CLI left behind it stays; cua doctor keeps naming it`
      : `could not read or remove ${path} (${code}), so what the Codex CLI left there stays; cua doctor keeps naming it`)),
  ];
}

// doctor's runtime.leftovers row: `warn` naming every leftover and the command that removes it, else `pass`. `inUse` is
// sessionsInUse's answer after doctor's own sweep.
export function leftoversCheck({home, pins, inUse}) {
  const {codexHome, files, trees, errors, uninspected} = findCodexLeftovers({home, pins});
  const unread = (errors.length ? `; what is there could not be read: ${errors.map(e => `${e.path} (${e.code})`).join(', ')}` : '')
    + (uninspected.length ? `; ${uninspected.map(notInspected).join('; ')}` : '');
  if (!files.length && !trees.length && !errors.length && !uninspected.length) return {name: 'runtime.leftovers', status: 'pass', detail: 'nothing the Codex CLI left behind is here; cua runs no Codex CLI (#115)'};
  const parts = [...(files.length ? [`${codexHome}: ${files.join(', ')}`] : []), ...trees.map(t => t.path)];
  if (!parts.length) return {name: 'runtime.leftovers', status: 'warn', detail: `whether the Codex CLI left anything here is unknown${unread}`};
  const held = trees.filter(t => !t.tombstone);
  const waiting = held.length && inUse.length ? ` (the release's ${held.map(t => t.name).join(', ')} once no session runs from this home (now: ${inUse.join(', ')}))` : '';
  return {name: 'runtime.leftovers', status: 'warn', detail: `the Codex CLI's leftovers, unused by this cua since it runs its own sandbox (#115): ${parts.join('; ')}; ${PRUNE_ADVICE}${waiting}${unread}`};
}
