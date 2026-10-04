// CUA_HOME layout and the active-release pointer. Everything the server owns lives under one home:
//   runtimes/<release>/   immutable verified vendor components plus our install.json record
//   current.json          {schema, release}: the active release, replaced atomically
//   staging/              per-operation scratch for downloads and extraction (same volume, so renames are atomic)
//   state/codex/          CODEX_HOME for the runtime: its config and per-user approvals
//   run/<session>/        per-connection working directory and private endpoints
import {readFileSync, writeFileSync, renameSync, rmSync, mkdirSync, realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fail} from './errors.mjs';

export function defaultHome(env = process.env) {
  if (env.CUA_HOME) return env.CUA_HOME;
  return join(env.HOME || homedir(), 'Library', 'Application Support', 'cua');
}

export function homeLayout(home) {
  return {
    home,
    runtimes: join(home, 'runtimes'),
    pointer: join(home, 'current.json'),
    staging: join(home, 'staging'),
    codexHome: join(home, 'state', 'codex'),
    run: join(home, 'run'),
  };
}

// The home as the vendor runtime will see it: absolute and with symlinks resolved (the trusted worker compares real
// paths, and macOS temp directories sit below /var -> /private/var). Created private when `create` is set.
export function realHome(home, {create = false} = {}) {
  const absolute = resolve(home);
  if (create) mkdirSync(absolute, {recursive: true, mode: 0o700});
  try {
    return realpathSync(absolute);
  } catch (error) {
    if (error.code === 'ENOENT') return absolute;
    throw error;
  }
}

export function readPointer(home) {
  let text;
  try {
    text = readFileSync(homeLayout(home).pointer, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  let pointer;
  try { pointer = JSON.parse(text); } catch { pointer = null; }
  if (!pointer || pointer.schema !== 1 || typeof pointer.release !== 'string')
    fail('installed_record_invalid', `${homeLayout(home).pointer} is not a valid release pointer`, {hint: 'run `cua install` to rewrite it'});
  return pointer.release;
}

// Write-then-rename: readers see the old pointer or the new one, never a partial file.
export function writePointer(home, release) {
  const {pointer} = homeLayout(home);
  const temp = `${pointer}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, JSON.stringify({schema: 1, release}) + '\n', {mode: 0o600});
    renameSync(temp, pointer);
  } catch (error) {
    rmSync(temp, {force: true});
    throw error;
  }
}
