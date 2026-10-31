// M3's save and restore of the Mac's approved engine around the attended sitting (docs/doperpowers/specs/2026-10-30-
// macos-agent-cursor-design.md, M3 Decisions): before the sitting the whole engine directory
// (<home>/Library/Application Support/cua/engine/: the bundle, approved.json, pending.json, usage.json and the
// installer's previous bundle) is copied outside the installer's own `previous`, which the next build replaces
// (src/runtime/engine.mjs), with ~/.config/cua/engine.json and the engine's status beside it; after the sitting the
// engine is stopped, the current directory moved aside whole (the branch's build is kept, not deleted: the owner may
// still keep it) and the saved one put in its place, then the status is checked for the saved build, approved.
//
// Left out of the copy, by name at the directory's top: the socket and the lock (the running engine's, recreated at its
// launch) and the build's scratch and staging (a cache and a transient; a restored engine without them builds cold).
// Every copy is checked against a manifest of the tree (each entry's path, type, permission bits, and a file's size
// and SHA-256 or a link's target), recorded at the save: a restore whose saved copy no longer matches changes nothing.
// Copies go through ditto on macOS (it keeps a bundle's extended attributes and signature intact), else cp -a.
// `home` is always given by the caller: nothing here defaults to this account's HOME.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {ENGINE_DIRECTORY_IN_HOME} from '../../src/runtime/layout.mjs';

export const SKIPPED = Object.freeze(['engine.sock', 'engine.lock', 'build', 'staging']);
const BUNDLE = 'cua Engine.app';
const RECORD = 'saved.json';

export const engineDirOf = home => join(home, ENGINE_DIRECTORY_IN_HOME);
export const engineJsonOf = home => join(home, '.config', 'cua', 'engine.json');

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const DITTO = '/usr/bin/ditto';

// One entry (a file, a directory or a link) copied to `to`, whose parent exists and which does not.
function copyEntry(from, to) {
  if (process.platform === 'darwin' && existsSync(DITTO)) execFileSync(DITTO, [from, to], {stdio: ['ignore', 'ignore', 'pipe']});
  else execFileSync('cp', ['-a', from, to], {stdio: ['ignore', 'ignore', 'pipe']});
}

// Every entry under `root` but the top-level SKIPPED names, sorted by path: [{path, type, mode, size?, sha256?, target?}].
export function treeManifest(root) {
  const out = [];
  const walk = (dir, rel) => {
    for (const name of readdirSync(dir).sort()) {
      if (rel === '' && SKIPPED.includes(name)) continue;
      const path = join(dir, name), at = rel ? `${rel}/${name}` : name, stat = lstatSync(path);
      const mode = stat.mode & 0o7777;
      if (stat.isSymbolicLink()) out.push({path: at, type: 'link', mode, target: readlinkSync(path)});
      else if (stat.isDirectory()) { out.push({path: at, type: 'dir', mode}); walk(path, at); }
      else if (stat.isFile()) out.push({path: at, type: 'file', mode, size: stat.size, sha256: sha256(readFileSync(path))});
      else out.push({path: at, type: 'other', mode});
    }
  };
  walk(root, '');
  return out;
}

const sameTree = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// `cua engine status --json`'s answer naming a bundle: its build and whether it is approved.
const identifiedStatus = status => status !== null && typeof status === 'object' && status.ok !== false && typeof status.build === 'string' && status.build !== ''
  && (status.approved === true || status.approved === false || status.approved === null);
// Whether the settings at `path` are what the record says: the file with the recorded SHA-256, or no file.
const settingsMatch = (path, engineJson) => (engineJson.present ? existsSync(path) && sha256(readFileSync(path)) === engineJson.sha256 : !existsSync(path));

// Moves `from` to `to` (a new path): a rename, else, across volumes, a copy and a removal.
function move(from, to) {
  mkdirSync(dirname(to), {recursive: true});
  try { renameSync(from, to); } catch (error) {
    if (error.code !== 'EXDEV') throw error;
    copyEntry(from, to);
    rmSync(from, {recursive: true, force: true});
  }
}

// Saves `home`'s engine directory, engine.json and status to `to` (a new directory): `to`/engine/, `to`/engine.json
// when there is one, `to`/saved.json. `status()` answers `cua engine status --json`. -> {to, files, engineJson}.
export async function saveEngine({home, to, status, now = () => new Date()}) {
  const dir = engineDirOf(home);
  if (!existsSync(join(dir, BUNDLE))) throw new Error(`no engine to save: ${join(dir, BUNDLE)} does not exist`);
  if (existsSync(to)) throw new Error(`${to} already exists; the save never writes over an earlier one`);
  const statusBefore = await status();
  // A save is only as good as the status it records: the restore checks the build against it.
  if (!identifiedStatus(statusBefore)) throw new Error(`the engine's status was not read (${statusBefore?.detail ?? JSON.stringify(statusBefore)}); nothing was saved`);
  mkdirSync(join(to, 'engine'), {recursive: true, mode: 0o700});
  const present = readdirSync(dir).sort();
  for (const name of present) if (!SKIPPED.includes(name)) copyEntry(join(dir, name), join(to, 'engine', name));
  const manifest = treeManifest(dir), copied = treeManifest(join(to, 'engine'));
  if (!sameTree(manifest, copied)) throw new Error(`the copy in ${to}/engine differs from ${dir} (did the engine write while it was copied? stop it and save again to a new directory)`);
  const settings = engineJsonOf(home);
  let engineJson = {present: false, path: settings};
  if (existsSync(settings)) {
    copyFileSync(settings, join(to, 'engine.json'));
    engineJson = {present: true, path: settings, sha256: sha256(readFileSync(settings))};
    if (sha256(readFileSync(join(to, 'engine.json'))) !== engineJson.sha256) throw new Error(`the copy of ${settings} differs from it; save again to a new directory`);
  }
  const record = {savedAt: now().toISOString(), engineDir: dir, skipped: SKIPPED.filter(name => present.includes(name)), engineJson, status: statusBefore, manifest};
  writeFileSync(join(to, RECORD), JSON.stringify(record, null, 2) + '\n', {mode: 0o600});
  return {to, files: manifest.length, engineJson, status: statusBefore};
}

// Puts the engine saved in `from` back in `home`: checks the saved copy against its record, stops the engine
// (`stop()` answers {ok, detail}), moves the current directory and engine.json to `aside` (a new directory), copies the
// saved ones in, checks the result against the record, and reads `status()` for the saved build, approved.
// -> {ok, aside, status: {build, approved, matches}, settings: {restored}, next?}. Throws, having changed nothing, when
// the saved record names no identified status, the saved tree or engine.json does not match it, or the engine does not
// stop.
export async function restoreEngine({home, from, aside, stop, status}) {
  const record = JSON.parse(readFileSync(join(from, RECORD), 'utf8'));
  const savedSettings = join(from, 'engine.json');
  // Everything the restore will put back is checked before anything is stopped or moved.
  if (!identifiedStatus(record.status)) throw new Error(`${RECORD} records no identified engine status; nothing was changed`);
  if (!sameTree(treeManifest(join(from, 'engine')), record.manifest)) throw new Error(`the saved copy in ${from}/engine no longer matches its record (${RECORD}); nothing was changed`);
  if (!record.engineJson || !settingsMatch(savedSettings, record.engineJson))
    throw new Error(`the saved engine.json in ${from} is not what ${RECORD} recorded (${record.engineJson?.present ? 'missing or changed' : 'present though none was saved'}); nothing was changed`);
  if (existsSync(aside)) throw new Error(`${aside} already exists; give the restore a new directory to move the current engine to`);
  const stopped = await stop();
  if (!stopped?.ok) throw new Error(`the engine did not stop (${stopped?.detail ?? 'no answer'}); nothing was changed`);
  const dir = engineDirOf(home), settings = engineJsonOf(home);
  mkdirSync(aside, {recursive: true, mode: 0o700});
  if (existsSync(dir)) move(dir, join(aside, 'engine'));
  mkdirSync(dir, {recursive: true, mode: 0o700});
  for (const name of readdirSync(join(from, 'engine')).sort()) copyEntry(join(from, 'engine', name), join(dir, name));
  if (!sameTree(treeManifest(dir), record.manifest)) throw new Error(`the restored ${dir} differs from the saved record; the sitting's engine is in ${aside}/engine`);
  if (existsSync(settings)) copyFileSync(settings, join(aside, 'engine.json'));
  if (record.engineJson.present) { mkdirSync(dirname(settings), {recursive: true, mode: 0o700}); copyFileSync(savedSettings, settings); }
  else if (existsSync(settings)) rmSync(settings);
  const settingsRestored = settingsMatch(settings, record.engineJson);
  const now = await status();
  const check = {build: now?.build ?? null, approved: now?.approved ?? null};
  check.matches = check.build === record.status.build && check.approved === true;
  const next = !settingsRestored ? `${settings} is not the saved one after the restore: copy ${savedSettings} over it by hand`
    : check.build !== record.status.build ? `the restored bundle reports build ${check.build}, not the saved ${record.status.build}: compare ${dir} with ${from}/engine`
      : !check.matches ? 'the restored bundle is the saved build but not approved: run cua engine approve with the owner at the console' : null;
  return {ok: settingsRestored && check.matches, aside, status: check, settings: {restored: settingsRestored}, ...(next ? {next} : {})};
}
