// Pure, testable pieces of the acceptance runner (scripts/accept-native.mjs): how sub-check statuses roll up, how the
// suites' summaries are read, the narrow TextEdit approval rule of the live fixture, the installed-tree snapshot that
// proves a reinstall mutated nothing, and the packaging/tracking policies of acceptance 10.
import {lstatSync, readdirSync, readlinkSync} from 'node:fs';
import {join} from 'node:path';

export const STATUSES = ['PASS', 'FAIL', 'BLOCKED'];

// An item passes only when it has checks and every one passed; any failure fails it; otherwise it is blocked. An item
// with nothing evaluated is BLOCKED, never PASS: a skipped check must not read as a pass.
export function rollup(statuses) {
  if (!statuses.length) return 'BLOCKED';
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('BLOCKED')) return 'BLOCKED';
  return 'PASS';
}

// The `# tests N` ... summary node:test prints at the end of a run, or null when there is none.
export function tapTotals(text) {
  const totals = {};
  for (const key of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const match = text.match(new RegExp(`^# ${key} (\\d+)$`, 'm'));
    if (!match) return null;
    totals[key] = Number(match[1]);
  }
  return totals;
}

// The vendor's app-use elicitation, exactly as the pinned computer-use policy builds it, for TextEdit and nothing
// else: the message names the app, the structured parameters carry its bundle identifier, and no field is asked for.
// The live TextEdit fixture accepts this one request (for the session only) and declines everything else.
export const TEXTEDIT_BUNDLE = 'com.apple.TextEdit';
export function isTextEditApproval(msg) {
  if (msg?.method !== 'elicitation/create') return false;
  const params = msg.params ?? {};
  const meta = params._meta ?? {};
  const toolParams = meta.tool_params;
  return params.message === 'Allow Computer Use to use "TextEdit"?'
    && meta.connector_id === 'computer-use'
    && meta.codex_approval_kind === 'mcp_tool_call'
    && toolParams !== null && typeof toolParams === 'object'
    && Object.keys(toolParams).length === 1 && toolParams.app === TEXTEDIT_BUNDLE
    && Object.keys(params.requestedSchema?.properties ?? {}).length === 0;
}

// Every entry under `root` (symbolic links are recorded, not followed) with what a mutation would change.
export function snapshotTree(root) {
  const entries = new Map();
  const visit = relative => {
    const path = join(root, relative);
    const stat = lstatSync(path);
    const kind = stat.isSymbolicLink() ? `link>${readlinkSync(path)}` : stat.isDirectory() ? 'dir' : stat.isFile() ? 'file' : 'other';
    entries.set(relative || '.', `${kind}:${stat.mode}:${stat.isDirectory() ? 0 : stat.size}:${stat.mtimeMs}:${stat.ino}`);
    if (stat.isDirectory()) for (const name of readdirSync(path).sort()) visit(relative ? join(relative, name) : name);
  };
  visit('');
  return entries;
}

export function diffSnapshots(before, after) {
  const added = [...after.keys()].filter(key => !before.has(key));
  const removed = [...before.keys()].filter(key => !after.has(key));
  const changed = [...before.keys()].filter(key => after.has(key) && after.get(key) !== before.get(key));
  return {added, removed, changed, same: !added.length && !removed.length && !changed.length};
}

// Acceptance 10: what must never be tracked or packed (runtime archives and trees, build output, credentials, logs,
// sockets), and what the package needs to run, diagnose and build its helper.
const FORBIDDEN = [
  [/\.zip$/i, 'a runtime archive'],
  [/(^|\/)runtimes\//, 'an extracted runtime'],
  [/(^|\/)\.build\//, 'build output'],
  [/(^|\/)node_modules\//, 'installed dependencies'],
  [/(^|\/)(auth\.json|\.env|credentials[^/]*)$/i, 'a credential file'],
  [/\.(log|sock)$/i, 'a log or socket'],
  [/(^|\/)current\.json$/, 'an active-release pointer'],
];
export function forbiddenPaths(paths) {
  return paths.flatMap(path => FORBIDDEN.filter(([pattern]) => pattern.test(path)).map(([, why]) => `${path} (${why})`));
}

export const PACKAGE_REQUIRED = [
  'bin/cua.mjs', 'cua-shim.mjs', 'verify.mjs', 'scripts/probe/lib.mjs', 'scripts/build-helper.mjs', 'README.md',
  '.claude-plugin/plugin.json', 'src/cli.mjs', 'src/mcp/server.mjs', 'src/services/sky.mjs', 'src/secrets/client.mjs',
  'native/keychain/Package.swift', 'native/keychain/Sources/cua-keychain/main.swift',
];
export function missingFromPackage(files) {
  const packed = new Set(files);
  const missing = PACKAGE_REQUIRED.filter(path => !packed.has(path));
  if (!files.some(path => /^runtime\/releases\/[^/]+\.json$/.test(path))) missing.push('runtime/releases/<release>.json');
  return missing;
}

// Strings that look like credentials or personal tokens in tracked text.
const TOKEN_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
];
export const tokenLike = text => TOKEN_PATTERNS.some(pattern => pattern.test(text));
