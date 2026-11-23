// The last failed build of cua's macOS engine (design ruling 1148): build-failed.json in the engine directory, beside
// approved.json and the pending slot, {code, cause, failedAt}. buildEngine (src/runtime/engine.mjs) writes it when a
// build fails, under `cua install` and `cua engine build` alike, and removes it when a build succeeds; an approve
// removes it too. It exists so that a session, `cua doctor` and a device's remote client can say why there is no build
// to approve (src/runtime/engine-notice.mjs). Its cause is public: a classified, bounded phrase chosen by what failed,
// never text taken from a diagnostic (a compiler's output, a codesign message, a path, a signing identity), which stays
// in the installer's own output. A recorded cause is classified again when read, so a record from an older cua, or one
// edited by hand, never carries free text into a notice. Reading and writing it never throw: the record must not mask
// the build's own error, and a record that cannot be read is no record.
import {mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

const RECORD = 'build-failed.json';

// swift's own words when it cannot run at all: the /usr/bin shim finds no active developer directory, or only the
// command line tools where it needs Xcode. A missing toolchain, never a compile error.
export const DEVELOPER_TOOLS_MISSING = /xcrun: error: invalid active developer path|xcrun: error: unable to find utility|missing xcrun at|xcode-select: error: (tool '[^']*' requires Xcode|no developer tools)|requires Xcode, but active developer directory/i;
export const XCODE_NOT_SELECTED = 'Xcode is not installed or not selected';
export const XCODE_FIX = 'install Xcode or its command line tools (xcode-select --install), or select an installed one with xcode-select --switch';
const NO_SWIFT = 'Xcode is not installed (no swift)';
// The public phrase of each failure the owner can act on, by its code.
const BY_CODE = Object.freeze({
  engine_identity_missing: 'no signing identity is configured',
  engine_sign_failed: 'codesign failed',
  engine_sign_prompt_waiting: 'codesign is waiting for its keychain prompt at the console',
  engine_no_gui_login: 'no one is logged in at the console to sign',
  engine_settings_invalid: 'the engine settings cannot be read',
  engine_sign_wait_invalid: 'the sign wait setting is invalid',
});
const PHRASES = [NO_SWIFT, XCODE_NOT_SELECTED, ...Object.values(BY_CODE)];
const COMPILE = /^compile error(?: \(swift build exit (-?\d{1,4})\))?/;
const SAFE_CODE = /^[A-Za-z0-9_]{1,64}$/;
const compileError = exit => `compile error${exit ? ` (swift build exit ${exit})` : ''}`;
const byCode = code => BY_CODE[code] ?? (SAFE_CODE.test(code ?? '') ? code : 'the build failed');

// A failed build's public cause, by what failed: swift missing, or a swift that cannot run for want of a selected
// Xcode, means Xcode; a compile error by swift's exit status alone; a known code by its phrase; anything else by its
// code. The diagnostic itself is the installer's to print.
export function buildFailureCause(error) {
  const message = String(error?.message ?? '');
  const first = message.split('\n')[0];
  if (error?.code === 'engine_build_failed') {
    if (/^swift is not installed/.test(first)) return NO_SWIFT;
    if (first.startsWith(XCODE_NOT_SELECTED) || DEVELOPER_TOOLS_MISSING.test(message)) return XCODE_NOT_SELECTED;
    if (/^swift build failed/.test(first)) return compileError(/^swift build failed \(exit (-?\d{1,4})\)/.exec(first)?.[1]);
  }
  return byCode(error?.code);
}

// A recorded cause as it may be shown: one of the phrases above as recorded, else what its code classifies as.
export function publicCause({code, cause}) {
  const text = typeof cause === 'string' ? cause : '';
  const phrase = PHRASES.find(known => text === known || text.startsWith(`${known} `) || text.startsWith(`${known}:`));
  if (phrase) return phrase;
  const compile = code === 'engine_build_failed' ? COMPILE.exec(text) : null;
  return compile ? compileError(compile[1]) : byCode(code);
}

// What the owner does about a failed build before building again, or null when there is nothing to name (a compile
// error is the plugin's source, its detail printed with the message): Xcode for a missing swift, else the thrower's hint.
export function buildFailureFix(error) {
  const first = String(error?.message ?? '').split('\n')[0];
  if (error?.code === 'engine_build_failed' && /^swift is not installed/.test(first)) return 'install Xcode or its command line tools (xcode-select --install)';
  if (error?.code === 'engine_build_failed' && (first.startsWith(XCODE_NOT_SELECTED) || DEVELOPER_TOOLS_MISSING.test(String(error?.message ?? '')))) return XCODE_FIX;
  if (error?.code === 'engine_build_failed' && /^swift build failed/.test(first)) return null;
  return error?.hint ?? null;
}

export function recordBuildFailure({dir, error, now = Date.now}) {
  try {
    mkdirSync(dir, {recursive: true, mode: 0o700});
    const path = join(dir, RECORD);
    const temporary = `${path}.${process.pid}.tmp`;
    const code = SAFE_CODE.test(error?.code ?? '') ? error.code : 'error';
    writeFileSync(temporary, JSON.stringify({code, cause: buildFailureCause(error), failedAt: new Date(now()).toISOString()}, null, 2) + '\n', {mode: 0o600});
    renameSync(temporary, path);
  } catch { /* best effort: the build's own error is what the caller reports */ }
}

export function clearBuildFailure({dir}) {
  try { rmSync(join(dir, RECORD), {force: true}); } catch { /* a stale record is outranked by a pending or approved build */ }
}

// -> {code, cause, failedAt} | null, the cause classified again (publicCause).
export function readBuildFailure({dir}) {
  try {
    const value = JSON.parse(readFileSync(join(dir, RECORD), 'utf8'));
    if (!value || typeof value !== 'object' || typeof value.code !== 'string') return null;
    const code = SAFE_CODE.test(value.code) ? value.code : 'error';
    const failedAt = typeof value.failedAt === 'string' && !Number.isNaN(Date.parse(value.failedAt)) ? value.failedAt : null;
    return {code, cause: publicCause({code, cause: value.cause}), failedAt};
  } catch { return null; }
}
