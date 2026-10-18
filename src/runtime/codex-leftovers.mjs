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
// Every path is reached from the real home through real directories only: a symbolic link at any step (state/,
// state/codex, runtimes/, a release directory, tmp/ or browser/ in CODEX_HOME) is never followed, and a leftover that is
// itself a link is unlinked, its target left as it is. Results carry paths, never content. A removal that fails is
// reported and left for doctor to keep naming; it never fails the install.
import {lstatSync, readdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {CuaError} from './errors.mjs';
import {homeLayout, realHome} from './layout.mjs';
import {readInstalledRecord} from './manifest.mjs';
import {sweepRun} from './run-dir.mjs';

export const CODEX_HOME_LEFTOVERS = ['auth.json', 'installation_id', 'models_cache.json', 'cache', 'plugins', 'skills', 'log', 'tmp/arg0', 'browser/sessions'];
const SQLITE = /\.sqlite(-wal|-shm)?$/;
// The Codex CLI component a release pin used to list, per platform, and whether it is a directory.
const CLI_COMPONENT = {darwin: {name: 'CodexCLI.app', directory: true}, linux: {name: 'codex', directory: false}};

const lstat = path => { try { return lstatSync(path); } catch { return null; } };
const realDirectory = path => lstat(path)?.isDirectory() ?? false;
const names = dir => { try { return readdirSync(dir).sort(); } catch { return []; } };

// -> {codexHome, files: CODEX_HOME-relative names present, trees: [{release, name, path}]}.
export function findCodexLeftovers({home, pins}) {
  const layout = homeLayout(realHome(home));
  return {codexHome: layout.codexHome, files: codexHomeLeftovers(layout), trees: unusedCliComponents(layout, pins)};
}

function codexHomeLeftovers({home, codexHome}) {
  if (!realDirectory(join(home, 'state')) || !realDirectory(codexHome)) return [];
  const found = CODEX_HOME_LEFTOVERS.filter(rel => {
    const parent = rel.includes('/') ? join(codexHome, rel.split('/')[0]) : null;
    return (!parent || realDirectory(parent)) && lstat(join(codexHome, rel)) !== null;
  });
  return [...found, ...names(codexHome).filter(name => SQLITE.test(name))];
}

function unusedCliComponents({runtimes}, pins) {
  if (!realDirectory(runtimes)) return [];
  const found = [];
  for (const release of names(runtimes)) {
    const pin = pins.find(p => p.release === release);
    const component = pin && CLI_COMPONENT[pin.platform];
    if (!component || Object.hasOwn(pin.components ?? {}, component.name)) continue;
    const root = join(runtimes, release);
    if (!realDirectory(root)) continue;
    try { readInstalledRecord(root, pin); } catch (error) { if (error instanceof CuaError) continue; throw error; }
    const path = join(root, component.name);
    const stat = lstat(path);
    if (stat && (component.directory ? stat.isDirectory() : stat.isFile())) found.push({release, name: component.name, path});
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

// `cua install --prune-leftovers`'s cleanup -> {codexHome, removed: [path], deferred: [{path, reason}], failed: [{path, code}]}.
// `sweep` is the run/ sweep (injectable for tests), asked only when a release tree has something to remove.
export function removeCodexLeftovers({home, pins, sweep = sweepRun}) {
  const found = findCodexLeftovers({home, pins});
  const result = {codexHome: found.codexHome, removed: [], deferred: [], failed: []};
  const remove = path => {
    try { rmSync(path, {recursive: true, force: true}); result.removed.push(path); } catch (error) { result.failed.push({path, code: error.code ?? 'error'}); }
  };
  for (const rel of found.files) remove(join(found.codexHome, rel));
  const inUse = found.trees.length ? sessionsInUse(home, sweep) : [];
  for (const {path} of found.trees) {
    if (inUse.length) result.deferred.push({path, reason: `a session may be running from this home: ${inUse.join(', ')}`});
    else remove(path);
  }
  return result;
}

// The line a plain `cua install` prints when leftovers are there (it removes nothing), or none.
export function describeLeftovers({codexHome, files, trees}) {
  if (!files.length && !trees.length) return [];
  const parts = [...(files.length ? [`${codexHome}: ${files.join(', ')}`] : []), ...trees.map(t => t.path)];
  return [`the Codex CLI's leftovers are still here (${parts.join('; ')}); once every cua using this home is updated, run \`${PRUNE_COMMAND}\``];
}

// The lines `cua install --prune-leftovers` prints for its result: names and paths only.
export function describeRemoval({codexHome, removed, deferred, failed}) {
  const inHome = removed.filter(path => path.startsWith(`${codexHome}/`)).map(path => path.slice(codexHome.length + 1));
  return [
    ...(inHome.length ? [`removed the Codex CLI's leftovers from ${codexHome}: ${inHome.join(', ')}`] : []),
    ...removed.filter(path => !path.startsWith(`${codexHome}/`)).map(path => `removed the Codex CLI's unused ${path}`),
    ...deferred.map(({path, reason}) => `left the Codex CLI's unused ${path} in place, since ${reason}; run ${PRUNE_COMMAND} again when none is`),
    ...failed.map(({path, code}) => `could not remove the Codex CLI's leftover ${path} (${code}); cua doctor keeps naming it`),
  ];
}

// doctor's runtime.leftovers row: `warn` naming every leftover and the command that removes it, else `pass`. `inUse` is
// sessionsInUse's answer after doctor's own sweep.
export function leftoversCheck({home, pins, inUse}) {
  const {codexHome, files, trees} = findCodexLeftovers({home, pins});
  if (!files.length && !trees.length) return {name: 'runtime.leftovers', status: 'pass', detail: 'nothing the Codex CLI left behind is here; cua runs no Codex CLI (#115)'};
  const parts = [...(files.length ? [`${codexHome}: ${files.join(', ')}`] : []), ...trees.map(t => t.path)];
  const waiting = trees.length && inUse.length ? ` (the release's ${trees.map(t => t.name).join(', ')} once no session runs from this home (now: ${inUse.join(', ')}))` : '';
  return {name: 'runtime.leftovers', status: 'warn', detail: `the Codex CLI's leftovers, unused by this cua since it runs its own sandbox (#115): ${parts.join('; ')}; ${PRUNE_ADVICE}${waiting}`};
}
