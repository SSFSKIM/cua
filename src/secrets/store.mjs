// The secret store: the plain-file directory the plugin's `/secret` mod writes (hooks/mods/secrets.tsx, in Claude Code),
// $HOME/.config/claude-secrets/<KEY>, one value per file, mode 0600 in a 0700 directory. cua reads it in two places:
// the trusted services (src/services, inside node_repl's trusted worker), which read a value to substitute a
// {{secret:KEY}} reference, and `cua serve`/`cua secrets`, which list keys and (the CLI) write or remove one file.
//
// The store has two tiers (issue #99). The global one is the directory above; a project's is
// $HOME/.config/claude-secrets/projects/<slug>/<KEY>, the slug being the project's path in the form Claude Code names
// its ~/.claude/projects/ folders (projectSlug below), and the project the main worktree root of the git repository
// around a working directory, else that directory (src/secrets/project.mjs). A {{secret:KEY}} reference reads the
// project's file first and the global one only when the project has none (tieredStore). Each tier is a directory of the
// same kind, read by the same rules.
//
// A value is read only from a regular file owned by this user with mode exactly 0600: it is opened without following a
// symlink and without blocking (a FIFO is refused, never waited on), checked on the open descriptor, bounded in size
// and decoded as UTF-8; exactly one trailing newline is dropped (a file written by `echo`). Every refusal is a
// SecretStoreError with a stable code and a fixed sentence naming at most the key and its file; none carries a cause,
// file bytes or anything derived from a value. Keys are not secret. A value that is empty once the newline is dropped
// is refused: neither writer stores one, so such a file is a partial write. The store has no lock. cua's own write
// replaces a file by rename, so a reader racing it sees the old value or the new one; the mod rewrites the file in
// place, so a reader racing it can see a truncated (refused as empty) or partly written file.
import {constants} from 'node:fs';
import {chmod, mkdir, open, readdir, rename, rm, unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {isLabel, isReserved, LABEL_RULE} from './label.mjs';

export const STORE_RELATIVE = join('.config', 'claude-secrets');
// The trusted worker's launch variables (src/runtime/launch.mjs): the global store directory `cua serve` resolved and,
// when the connection has a project, that project's directory; or why the connection has none (secrets_disabled under
// CUA_SHIM_SECRETS=off).
export const STORE_ENV = {dir: 'CUA_SECRETS_DIR', projectDir: 'CUA_SECRETS_PROJECT_DIR', unavailable: 'CUA_SECRETS_UNAVAILABLE'};
export const MAX_VALUE_BYTES = 262_144;
// Claude Code cuts a slug at this length and adds a hash of the whole path, so that long paths stay distinct.
const SLUG_MAX = 200;

// The store directory for an environment: $HOME's, as the mod resolves it.
export const storeDir = (env = process.env) => join(env.HOME || homedir(), STORE_RELATIVE);

// A project's path as Claude Code names its folder under ~/.claude/projects/: every character other than an ASCII
// letter or digit becomes '-' (/Users/me/repo is -Users-me-repo), and a slug longer than 200 characters keeps its first
// 200 and gains '-' and a base-36 hash of the path. The mod (hooks/mods/secrets.tsx) carries the same function.
export function projectSlug(path) {
  const slug = path.replace(/[^a-zA-Z0-9]/g, '-');
  if (slug.length <= SLUG_MAX) return slug;
  let hash = 0;
  for (let i = 0; i < path.length; i++) hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0;
  return `${slug.slice(0, SLUG_MAX)}-${Math.abs(hash).toString(36)}`;
}

// The store directory of a project (an absolute path) for an environment.
export const projectStoreDir = (project, env = process.env) => join(storeDir(env), 'projects', projectSlug(project));

const SENTENCES = {
  invalid_label: () => LABEL_RULE,
  not_found: key => `no secret named "${key}"`,
  not_regular_file: (key, path) => `the secret file for "${key}" (${path}) is not a regular file, so it was not read`,
  wrong_owner: (key, path) => `the secret file for "${key}" (${path}) is not owned by this user, so it was not read`,
  insecure_mode: (key, path) => `the secret file for "${key}" (${path}) is not mode 0600, so it was not read (chmod 600 it)`,
  too_large: key => `secret "${key}" is larger than ${MAX_VALUE_BYTES} bytes`,
  unsupported_value: key => `secret "${key}" is not valid UTF-8 text`,
  empty: key => `secret "${key}" is empty`,
  unreadable: (key, path, errno) => `the secret store could not be read${key ? ` for "${key}"` : ''} (${errno ?? 'error'})`,
  not_configured: () => 'no secret store is configured for this connection',
};

export class SecretStoreError extends Error {
  constructor(code, {key, path, errno} = {}) {
    super((SENTENCES[code] ?? SENTENCES.unreadable)(key, path, errno));
    this.name = 'SecretStoreError';
    this.code = code;
    if (errno) this.errno = errno;
  }
}

const utf8 = new TextDecoder('utf-8', {fatal: true});
const errnoOf = error => (typeof error?.code === 'string' && /^E[A-Z0-9]+$/.test(error.code) ? error.code : undefined);
const ownUid = () => (typeof process.geteuid === 'function' ? process.geteuid() : null);

export function fileStore({dir}) {
  const pathOf = key => {
    if (!isLabel(key)) throw new SecretStoreError('invalid_label');
    return join(dir, key);
  };

  return {
    dir,
    // The value stored under `key`. Only the trusted services call this.
    async read(key) {
      const path = pathOf(key);
      let handle;
      try {
        handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
      } catch (error) {
        if (error?.code === 'ENOENT') throw new SecretStoreError('not_found', {key});
        if (error?.code === 'ELOOP') throw new SecretStoreError('not_regular_file', {key, path});
        throw new SecretStoreError('unreadable', {key, errno: errnoOf(error)});
      }
      let bytes = null;
      try {
        const stat = await handle.stat();
        if (!stat.isFile()) throw new SecretStoreError('not_regular_file', {key, path});
        const uid = ownUid();
        if (uid !== null && stat.uid !== uid) throw new SecretStoreError('wrong_owner', {key, path});
        if ((stat.mode & 0o777) !== 0o600) throw new SecretStoreError('insecure_mode', {key, path});
        if (stat.size > MAX_VALUE_BYTES) throw new SecretStoreError('too_large', {key});
        try { bytes = await handle.readFile(); } catch (error) { throw new SecretStoreError('unreadable', {key, errno: errnoOf(error)}); }
        if (bytes.length > MAX_VALUE_BYTES) throw new SecretStoreError('too_large', {key});
        let text;
        try { text = utf8.decode(bytes); } catch { throw new SecretStoreError('unsupported_value', {key}); }
        const value = text.endsWith('\n') ? text.slice(0, -1) : text;
        if (!value) throw new SecretStoreError('empty', {key});
        return value;
      } finally {
        bytes?.fill(0);
        await handle.close().catch(() => {});
      }
    },
    // The stored keys, sorted: the names of the regular files that follow the key grammar. No directory, no keys.
    async list() {
      let entries;
      try { entries = await readdir(dir, {withFileTypes: true}); } catch (error) {
        if (error?.code === 'ENOENT') return [];
        throw new SecretStoreError('unreadable', {errno: errnoOf(error)});
      }
      return entries.filter(entry => entry.isFile() && isLabel(entry.name)).map(entry => entry.name).sort();
    },
    // Stores `value` under `key` (the CLI's masked prompt): the directory is made 0700 as the mod makes it, the value
    // is written to a new 0600 file beside the target and renamed over it.
    async write(key, value) {
      const path = pathOf(key);
      await mkdir(dir, {recursive: true, mode: 0o700});
      await chmod(dir, 0o700);
      const temp = join(dir, `.${key}.${randomUUID()}.tmp`);
      try {
        const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        try {
          await handle.chmod(0o600);
          await handle.writeFile(value, 'utf8');
          await handle.sync();
        } finally { await handle.close(); }
        await rename(temp, path);
      } catch (error) {
        await rm(temp, {force: true}).catch(() => {});
        throw error;
      }
      return path;
    },
    // Deletes the file stored under `key`.
    async remove(key) {
      const path = pathOf(key);
      try { await unlink(path); } catch (error) {
        if (error?.code === 'ENOENT') throw new SecretStoreError('not_found', {key});
        throw new SecretStoreError('unreadable', {key, errno: errnoOf(error)});
      }
      return path;
    },
  };
}

// The two tiers read as one: a key is read from the project's store, and from the global one only when the project's
// has no such key (not_found). Any other refusal of the project's file stands, so a broken project file never falls
// through to a global value. `list` is every key either tier holds, once.
export function tieredStore({project, global}) {
  return {
    dir: global.dir,
    projectDir: project.dir,
    async read(key) {
      try { return await project.read(key); } catch (error) {
        if (error?.code !== 'not_found') throw error;
      }
      return global.read(key);
    },
    async list() {
      return [...new Set([...await project.list(), ...await global.list()])].sort();
    },
  };
}

// The secrets side of one connection in `cua serve`: the store's directories (handed to the trusted worker) and its
// key listing for secrets_list, or why the connection has none. `project` is the project `cua serve` was started in
// (src/secrets/project.mjs); without one (the HTTP agent that serves remote clients) the connection has the global
// tier only. The listing is the model's, so reserved keys (device credentials, label.mjs) are left out of it.
export function connectionSecrets({enabled, env = process.env, project = null}) {
  if (!enabled) return {unavailable: {code: 'secrets_disabled', message: 'secret storage is turned off for this server (CUA_SHIM_SECRETS=off)'}};
  const global = fileStore({dir: storeDir(env)});
  const store = project ? tieredStore({project: fileStore({dir: projectStoreDir(project, env)}), global}) : global;
  return {dir: store.dir, ...(project ? {projectDir: store.projectDir} : {}), list: async () => (await store.list()).filter(key => !isReserved(key))};
}
