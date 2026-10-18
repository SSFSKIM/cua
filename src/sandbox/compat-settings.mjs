// The vendor host's per-session compat settings (docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Design "The
// compat executable", "How the compat receives its per-launch settings"). node_repl hands the kernel's launcher a
// filtered environment (CODEX_HOME, HOME, PATH, TMPDIR, LANG and its own settings), so what buildLaunch computes for a
// vendor-host session reaches the compat executable through two files instead, written once per launch beside the
// runtime's CODEX_HOME:
//   <home>/state/compat/<sessionId>.json   {denyRead, sessionTmp, home}: the kernel's deny list (null for a disabled
//                                          connection, which builds none), the session temp and the home
//   <home>/state/compat/<sessionId>.node   one line, the Node the compat's `sandbox` runs on, read by the sh script
//                                          (bin/cua-codex-compat) before any JSON can be parsed
// Both are mode 0600 in a 0700 directory, under the cua home the kernel is denied and no child can write, and removed
// with the session temp. The compat locates them from what node_repl passes and no cell sets: the session from TMPDIR
// (the launch's sessionTmp, <home>/run/<id>/tmp) and the home from CODEX_HOME (<home>/state/<name>). Both must name the
// same home, and the file's `home` and `sessionTmp` must equal them; anything else refuses, so a launch never runs
// under another session's settings or none.
import {chmodSync, closeSync, constants, fstatSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {isAbsolute, posix} from 'node:path';
import {parseDenyRead} from './policy.mjs';

// A session id as buildLaunch accepts it (src/runtime/launch.mjs).
export const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,127}$/;

export class CompatSettingsError extends Error {}
const refuse = why => { throw new CompatSettingsError(`the session's compat settings cannot be used: ${why}`); };

// The two files of `sessionId` in `home` -> {dir, json, node}.
export function compatFiles({home, sessionId}) {
  const dir = posix.join(home, 'state', 'compat');
  return {dir, json: posix.join(dir, `${sessionId}.json`), node: posix.join(dir, `${sessionId}.node`)};
}

// Writes a launch's two files (an earlier launch's of the same session are replaced) -> compatFiles.
export function writeCompatSettings({home, sessionId, denyRead, sessionTmp, node}) {
  const files = compatFiles({home, sessionId});
  mkdirSync(files.dir, {recursive: true, mode: 0o700});
  chmodSync(files.dir, 0o700);
  for (const [path, content] of [[files.json, `${JSON.stringify({denyRead, sessionTmp, home})}\n`], [files.node, `${node}\n`]]) {
    writeFileSync(path, content, {mode: 0o600});
    chmodSync(path, 0o600);
  }
  return files;
}

export function removeCompatSettings({home, sessionId}) {
  const files = compatFiles({home, sessionId});
  for (const path of [files.json, files.node]) rmSync(path, {force: true});
}

const normalAbsolute = value => typeof value === 'string' && isAbsolute(value) && posix.normalize(value) === value && (value === '/' || !value.endsWith('/'));

// The session's settings file, located from `env` (the environment node_repl handed the launcher) -> {home, sessionId,
// file}. Refuses a TMPDIR that is not <home>/run/<id>/tmp, or a CODEX_HOME whose directory is not that home's state/.
export function locateSettings(env) {
  const tmp = env.TMPDIR, codexHome = env.CODEX_HOME;
  if (!normalAbsolute(tmp)) refuse(`TMPDIR (${tmp === undefined ? 'unset' : JSON.stringify(tmp)}) is not the session temp cua sets for a vendor-host session, <home>/run/<session id>/tmp`);
  const sessionDir = posix.dirname(tmp), run = posix.dirname(sessionDir), sessionId = posix.basename(sessionDir);
  if (posix.basename(tmp) !== 'tmp' || posix.basename(run) !== 'run' || !SESSION_ID.test(sessionId))
    refuse(`TMPDIR ${tmp} is not the session temp cua sets for a vendor-host session, <home>/run/<session id>/tmp`);
  const home = posix.dirname(run);
  if (!normalAbsolute(codexHome)) refuse(`CODEX_HOME (${codexHome === undefined ? 'unset' : JSON.stringify(codexHome)}) is not the runtime's CODEX_HOME cua sets, <home>/state/codex`);
  if (posix.dirname(codexHome) !== posix.join(home, 'state')) refuse(`CODEX_HOME ${codexHome} and TMPDIR ${tmp} do not name the same cua home`);
  return {home, sessionId, file: compatFiles({home, sessionId}).json};
}

// The located file's settings -> {denyRead (null for a disabled connection), sessionTmp, home}. Refuses a file that is
// missing, a symlink, not JSON of exactly that shape, or whose home or session temp is not the located one.
export function readSettings({home, file}, env) {
  let text;
  try {
    const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      if (!fstatSync(fd).isFile()) refuse(`${file} is not a file`);
      text = readFileSync(fd, 'utf8');
    } finally { closeSync(fd); }
  } catch (error) {
    if (error instanceof CompatSettingsError) throw error;
    refuse(error.code === 'ENOENT' ? `${file} does not exist (cua writes it when it launches a vendor-host session)`
      : error.code === 'ELOOP' ? `${file} is a symlink, not the file cua wrote` : `${file} could not be read (${error.code ?? error.message})`);
  }
  let parsed;
  try { parsed = JSON.parse(text); } catch { refuse(`${file} is not JSON`); }
  const keys = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).sort() : null;
  if (JSON.stringify(keys) !== JSON.stringify(['denyRead', 'home', 'sessionTmp'])) refuse(`${file} is not {denyRead, sessionTmp, home}`);
  const denyRead = parsed.denyRead === null ? null : parseDenyRead(JSON.stringify(parsed.denyRead));
  if (parsed.denyRead !== null && !denyRead) refuse(`${file}'s deny list is not {deny, reexpose, metadataOnly, tiers} of absolute paths`);
  if (parsed.home !== home) refuse(`${file} names the home ${JSON.stringify(parsed.home)}, not ${home}`);
  if (parsed.sessionTmp !== env.TMPDIR) refuse(`${file} names the session temp ${JSON.stringify(parsed.sessionTmp)}, not this launcher's TMPDIR ${env.TMPDIR}`);
  return {denyRead, sessionTmp: parsed.sessionTmp, home: parsed.home};
}
