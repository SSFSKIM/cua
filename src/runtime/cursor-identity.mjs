// The agent cursor's identity and switch for one session, resolved on the trusted side (#235,
// docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md, "Lifecycle and identity" and "Settings"): the launcher
// (./launch.mjs) puts the result into the worker's environment as CUA_CURSOR_LABEL, CUA_CURSOR_COLOR and CUA_CURSOR,
// which are all cua's engine service reads (src/services/engine/service.mjs), and a client of a remote device sends it in
// the device session's initialize parameters as `cua/cursor` (src/remote/client.mjs), which the device checks field by
// field (remoteCursor) and resolves with in place of its own.
//
// {label, color, enabled}, each field from the first source that gives one:
// - label: what the session was given (a remote client's), MAWS's CUA_CURSOR_LABEL, the session's sminos name, the
//   project folder's name (CLAUDE_PROJECT_DIR's basename, else the working directory's); trimmed, stripped of control
//   characters and cut at 24 characters with an ellipsis, an empty one falling through. None at all: the engine keeps
//   its placeholder ("Agent <connection>").
// - color: what the session was given, MAWS's CUA_CURSOR_COLOR when it is #rrggbb (any other value is logged and
//   ignored), else a stable pick of the eight hues by a hash of the Claude Code session id, else of the label.
// - enabled: what the session was given, else false only under CUA_CURSOR=0 (a value other than 0 or 1 is logged and
//   leaves it on). The device's own `"cursor": false` in engine.json is the engine's and wins over every session.
//
// The sminos name (sminosName) is the alias the desk shows for the Claude Code session that owns this MCP server, by its
// CLAUDE_CODE_SESSION_ID: the sminos plugin's documented `sminos who --session <id>`, which prints the session's
// `Sminos-Session: <alias>#<short> (<project> on <machine>)` line (the address its commits carry), the short alone for a
// session with no name fit for one, and nothing for a session in no project. The CLI is the installed sminos plugin's
// (`skills/sminos/scripts/sminos` under the install path Claude Code records in its plugins/installed_plugins.json). The
// lookup is bounded to 500 ms, killed past it, and an answer is kept per session id for the process; any failure falls
// through to the folder's name.
import {execFile} from 'node:child_process';
import {accessSync, constants, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {basename, join} from 'node:path';

// The eight hues, in the engine's order (native/engine/Sources/Engine/Cursor/CursorPalette.swift cursorPalette; a test
// keeps the two equal).
export const CURSOR_PALETTE = Object.freeze(['#c9663f', '#2f6feb', '#1f883d', '#8250df', '#0f8b8d', '#bf8700', '#cf3a7f', '#57606a']);
export const CURSOR_LABEL_LIMIT = 24;
export const SMINOS_LOOKUP_MS = 500;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The sminos CLI's address line (its ADDRESS_RE): an alias, then `#` and the session's short, then (project on machine).
const ADDRESS = /^Sminos-Session:[ \t]*(?:(\S.*?)#)?[0-9a-f]{8}[ \t]+\([^\s()]+ on [^\s()]+\)[ \t]*$/;
const graphemes = new Intl.Segmenter(undefined, {granularity: 'grapheme'});

// A label as the pill shows it, or null when nothing is left.
export function cursorLabel(text) {
  if (typeof text !== 'string') return null;
  const kept = text.replace(/\p{Cc}/gu, '').trim();
  if (!kept) return null;
  const parts = [...graphemes.segment(kept)].map(part => part.segment);
  return parts.length <= CURSOR_LABEL_LIMIT ? kept : `${parts.slice(0, CURSOR_LABEL_LIMIT - 1).join('').trimEnd()}…`;
}

// `#rrggbb` (lower-cased), or null.
export const cursorColor = value => (typeof value === 'string' && COLOR.test(value) ? value.toLowerCase() : null);

// One of the eight hues by FNV-1a (32-bit) of the seed's UTF-8: the same seed always picks the same hue.
export function hashColor(seed) {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(String(seed), 'utf8')) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return CURSOR_PALETTE[hash % CURSOR_PALETTE.length];
}

const sessionIdOf = env => (SESSION_ID.test(env.CLAUDE_CODE_SESSION_ID ?? '') ? env.CLAUDE_CODE_SESSION_ID : null);
// The session's working directory: Claude Code's project directory, else this process's.
export const sessionDirectory = (env, cwd) => (typeof env.CLAUDE_PROJECT_DIR === 'string' && env.CLAUDE_PROJECT_DIR ? env.CLAUDE_PROJECT_DIR : cwd);

// The session's cursor: {label (null when no source gives one), color, enabled}. `given` is a remote client's checked
// context (remoteCursor), whose fields come first; `log` is told of a setting it ignores.
export function cursorContext({env = process.env, cwd = process.cwd(), sminosName = null, given = null, log = () => {}} = {}) {
  const label = given?.label ?? cursorLabel(env.CUA_CURSOR_LABEL) ?? cursorLabel(sminosName) ?? cursorLabel(basename(sessionDirectory(env, cwd)));
  let color = given?.color ?? null;
  if (!color && env.CUA_CURSOR_COLOR) {
    color = cursorColor(env.CUA_CURSOR_COLOR);
    if (!color) log('CUA_CURSOR_COLOR is not #rrggbb; the agent cursor takes the session\'s own colour');
  }
  color ??= hashColor(sessionIdOf(env) ?? label ?? '');
  let enabled = given?.enabled;
  if (enabled === undefined) {
    const setting = env.CUA_CURSOR ?? '';
    if (!['', '0', '1'].includes(setting)) log('CUA_CURSOR is neither 0 nor 1; the agent cursor stays on');
    enabled = setting !== '0';
  }
  return {label, color, enabled};
}

// The worker's environment for `context`: the three variables the service reads.
export function cursorEnv({label, color, enabled}) {
  return {...(label ? {CUA_CURSOR_LABEL: label} : {}), CUA_CURSOR_COLOR: color, ...(enabled ? {} : {CUA_CURSOR: '0'})};
}

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// A remote client's `cua/cursor` (src/mcp/http.mjs), checked field by field: a string label (cleaned and cut; empty is
// none), a #rrggbb colour, a boolean switch; a field that is none of these is refused and left to the device's own
// resolution. -> {cursor: {label?, color?, enabled?} | null (no key), refused: [field names]}.
export function remoteCursor(given) {
  if (given === undefined) return {cursor: null, refused: []};
  if (!isPlainObject(given)) return {cursor: null, refused: ['cua/cursor']};
  const cursor = {}, refused = [];
  if (given.label !== undefined) {
    if (typeof given.label !== 'string') refused.push('label');
    else if (cursorLabel(given.label)) cursor.label = cursorLabel(given.label);
  }
  if (given.color !== undefined) {
    if (cursorColor(given.color)) cursor.color = cursorColor(given.color);
    else refused.push('color');
  }
  if (given.enabled !== undefined) {
    if (typeof given.enabled === 'boolean') cursor.enabled = given.enabled;
    else refused.push('enabled');
  }
  return {cursor, refused};
}

// ---- the sminos name -------------------------------------------------------------------------------------------------

// The sminos CLI of the installed sminos plugin, or null: the first `sminos@<marketplace>` entry of Claude Code's
// plugins record whose install path holds an executable CLI.
export function locateSminos({env = process.env} = {}) {
  const config = env.CLAUDE_CONFIG_DIR || join(env.HOME || homedir(), '.claude');
  let record;
  try { record = JSON.parse(readFileSync(join(config, 'plugins', 'installed_plugins.json'), 'utf8')); } catch { return null; }
  const plugins = isPlainObject(record?.plugins) ? record.plugins : {};
  for (const [name, entries] of Object.entries(plugins)) {
    if (!name.startsWith('sminos@') || !Array.isArray(entries)) continue;
    for (const entry of entries) {
      if (typeof entry?.installPath !== 'string') continue;
      const cli = join(entry.installPath, 'skills', 'sminos', 'scripts', 'sminos');
      try { accessSync(cli, constants.X_OK); return cli; } catch { /* the next entry */ }
    }
  }
  return null;
}

// The alias an address line names, or null (no line, the short alone, or anything else).
export function aliasOf(output) {
  const line = String(output ?? '').split('\n').map(text => text.trim()).find(Boolean);
  return line ? ADDRESS.exec(line)?.[1] ?? null : null;
}

// Runs the CLI: -> Promise of its stdout; rejects on a failure or past `timeoutMs` (the child killed).
function runCli(cli, args, {cwd, env, timeoutMs}) {
  return new Promise((resolve, reject) => {
    execFile(cli, args, {cwd, env, timeout: timeoutMs, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: 64 * 1024},
      (error, stdout) => (error ? reject(error) : resolve(stdout)));
  });
}

const answered = new Map();   // session id -> Promise of its alias (or null): answers kept for the process

// The session's sminos alias, or null; never rejects, settles within `timeoutMs` (plus the kill). A lookup that failed is
// not kept, so the next connection asks again.
export function sminosName({env = process.env, cwd = process.cwd(), locate = locateSminos, run = runCli, timeoutMs = SMINOS_LOOKUP_MS} = {}) {
  const session = sessionIdOf(env);
  if (!session || env.SMNS_INTERNAL) return Promise.resolve(null);
  const kept = answered.get(session);
  if (kept) return kept;
  const pending = (async () => {
    const cli = locate({env});
    if (!cli) return null;
    let timer;
    const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('sminos did not answer in time')), timeoutMs); });
    try {
      return aliasOf(await Promise.race([run(cli, ['who', '--session', session], {cwd: sessionDirectory(env, cwd), env, timeoutMs}), late]));
    } finally { clearTimeout(timer); }
  })();
  answered.set(session, pending);
  return pending.catch(() => { if (answered.get(session) === pending) answered.delete(session); return null; });
}

// The session's whole cursor context, with its sminos name looked up (bounded): what a connection resolves once at open.
export async function resolveCursorContext({env = process.env, cwd = process.cwd(), given = null, log = () => {}, lookup = sminosName} = {}) {
  const name = given?.label || cursorLabel(env.CUA_CURSOR_LABEL) ? null : await lookup({env, cwd});
  return cursorContext({env, cwd, sminosName: name, given, log});
}
