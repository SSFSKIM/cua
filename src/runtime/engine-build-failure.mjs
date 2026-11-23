// The last failed build of cua's macOS engine (design ruling 1148): build-failed.json in the engine directory, beside
// approved.json and the pending slot, {code, cause, failedAt}. buildEngine (src/runtime/engine.mjs) writes it when a
// build fails, under `cua install` and `cua engine build` alike, and removes it when a build succeeds; an approve
// removes it too. It exists so that a session and `cua doctor` can say why there is no build to approve
// (src/runtime/engine-notice.mjs). The cause is one short line: never the compiler's output, a stack, a signing identity
// (masked as engine-sign.mjs masks it) or the home's path. Reading and writing it never throw: the record must not mask
// the build's own error, and a record that cannot be read is no record.
import {mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {redact} from './engine-sign.mjs';

const RECORD = 'build-failed.json';
const MAX_CAUSE = 200;

// The words of a failed build's cause, by what failed: the causes the owner can act on are named (swift missing means
// Xcode, an identity missing), a compile error by its first error line without the file's path; anything else by its
// code and the first line of its message.
export function buildFailureCause(error, {identity, home = homedir()} = {}) {
  const message = String(error?.message ?? error ?? '');
  const first = message.split('\n')[0];
  let cause;
  if (error?.code === 'engine_identity_missing') cause = 'no signing identity is configured';
  else if (error?.code === 'engine_build_failed' && /^swift is not installed/.test(first)) cause = 'Xcode is not installed (no swift)';
  else if (error?.code === 'engine_build_failed' && /^swift build failed/.test(first)) {
    const exit = /\(exit ([^)]+)\)/.exec(first)?.[1];
    const line = message.split('\n').find(text => /\berror: /.test(text));
    const what = line?.slice(line.indexOf('error: ') + 'error: '.length).trim();
    cause = `compile error${exit ? ` (swift build exit ${exit})` : ''}${what ? `: ${what}` : ''}`;
  } else {
    const code = error?.code ?? 'error';
    cause = first.startsWith(`${code}:`) ? first : `${code}: ${first}`;
  }
  let out = redact(cause, identity);
  if (home && home !== '/') out = out.split(home).join('~');
  return out.length > MAX_CAUSE ? `${out.slice(0, MAX_CAUSE - 1)}…` : out;
}

// What the owner does about a failed build before building again, or null when there is nothing to name (a compile
// error is the plugin's source, its detail printed with the message): Xcode for a missing swift, else the thrower's hint.
export function buildFailureFix(error) {
  const first = String(error?.message ?? '').split('\n')[0];
  if (error?.code === 'engine_build_failed' && /^swift is not installed/.test(first)) return 'install Xcode or its command line tools (xcode-select --install)';
  if (error?.code === 'engine_build_failed' && /^swift build failed/.test(first)) return null;
  return error?.hint ?? null;
}

export function recordBuildFailure({dir, error, identity, home, now = Date.now}) {
  try {
    mkdirSync(dir, {recursive: true, mode: 0o700});
    const path = join(dir, RECORD);
    const temporary = `${path}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify({code: error?.code ?? 'error', cause: buildFailureCause(error, {identity, home}), failedAt: new Date(now()).toISOString()}, null, 2) + '\n', {mode: 0o600});
    renameSync(temporary, path);
  } catch { /* best effort: the build's own error is what the caller reports */ }
}

export function clearBuildFailure({dir}) {
  try { rmSync(join(dir, RECORD), {force: true}); } catch { /* a stale record is outranked by a pending or approved build */ }
}

// -> {code, cause, failedAt} | null.
export function readBuildFailure({dir}) {
  try {
    const value = JSON.parse(readFileSync(join(dir, RECORD), 'utf8'));
    return value && typeof value === 'object' && typeof value.code === 'string' && typeof value.cause === 'string'
      ? {code: value.code, cause: value.cause, failedAt: typeof value.failedAt === 'string' ? value.failedAt : null} : null;
  } catch { return null; }
}
