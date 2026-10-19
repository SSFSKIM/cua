// CUA_HOME layout and the active-release pointer. Everything the server owns lives under one home:
//   runtimes/<release>/   immutable verified vendor components plus our install.json record
//   current.json          {schema, release}: the active release, replaced atomically
//   staging/              per-operation scratch for downloads and extraction (same volume, so renames are atomic), and
//                         bind's short-lived copies of Chrome extension stores (src/profiles/directory-map.mjs)
//   state/codex/          CODEX_HOME for the macOS vendor host's node_repl: its config and per-user approvals (the
//                         Codex CLI's leftovers there are removed by `cua install --prune-leftovers`:
//                         src/runtime/codex-leftovers.mjs)
//   state/handshake/      per release, the runtime's recorded MCP handshake answers (src/mcp/lazy-runtime.mjs)
//   state/compat/         per vendor-host session, the compat executable's settings (src/sandbox/compat-settings.mjs)
//   node/                 the pinned Node cua's own REPL host runs on, and its pointer (src/runtime/managed-node.mjs)
//   sandbox/<tag>/        Linux: the pinned sandbox helper, codex-linux-sandbox (src/sandbox/linux.mjs)
//   run/<session>/        per-connection working directory and private endpoints
//   kernel/<session>/     Linux under the default sandbox mode: the confined kernel's working directory, with tmp/ (its
//                         TMPDIR), outside run/, which is denied to it whole (src/runtime/launch.mjs kernelDir)
import {readFileSync, writeFileSync, renameSync, rmSync, mkdirSync, realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {isAbsolute, join, resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {fail} from './errors.mjs';

// $CUA_HOME, else the platform's per-user data directory: ~/Library/Application Support/cua on macOS,
// ${XDG_DATA_HOME:-~/.local/share}/cua on Linux (a relative XDG_DATA_HOME is ignored, as the XDG Base Directory
// specification requires).
export function defaultHome(env = process.env, host = {platform: process.platform}) {
  if (env.CUA_HOME) return env.CUA_HOME;
  if (host.platform === 'linux') return join(isAbsolute(env.XDG_DATA_HOME ?? '') ? env.XDG_DATA_HOME : join(env.HOME || homedir(), '.local', 'share'), 'cua');
  return join(env.HOME || homedir(), 'Library', 'Application Support', 'cua');
}

// Where cua's native engine keeps its socket, lock and state under a home: beside the default macOS CUA_HOME, and not
// moved by CUA_HOME (#117: the approved engine's directory, docs/doperpowers/specs/2026-10-18-own-native-engine-design.md,
// "Install, signing and permissions"). The kernel's sandbox denies it (src/sandbox/index.mjs).
export const ENGINE_DIRECTORY_IN_HOME = 'Library/Application Support/cua/engine';

export function homeLayout(home) {
  return {
    home,
    runtimes: join(home, 'runtimes'),
    pointer: join(home, 'current.json'),
    staging: join(home, 'staging'),
    codexHome: join(home, 'state', 'codex'),
    handshake: join(home, 'state', 'handshake'),
    compat: join(home, 'state', 'compat'),
    node: join(home, 'node'),
    sandbox: join(home, 'sandbox'),
    run: join(home, 'run'),
    kernel: join(home, 'kernel'),
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
