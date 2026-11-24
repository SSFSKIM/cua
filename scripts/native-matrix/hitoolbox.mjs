// The input source and the per-context input preference on the device (#117 M5, rulings 1181 and 1188): what the
// harness reads and writes of com.apple.HIToolbox, and the gate in front of every write.
//
// Hosted only (ruling 1188). The input sources are how the owner types every day (Korean and English switching), so a
// restore that missed would change their typing in every app. So every write here, and every input-source selection
// the probe makes (./live-device.mjs launchProbe, the cursor sitting's own probe), runs only on a GitHub-hosted runner
// (../hosted-sittings/runner.mjs assertGithubHosted), as TextEdit's preferences do. Off one the harness only reads:
// a row that needs another source or preference than the owner's is NO VERDICT, `ownerInput` (./owner-input.mjs).
//
// The one key (ruling 1181: every preference the harness changes is restored and read back). The per-context
// preference is a key inside a dictionary, com.apple.HIToolbox AppleGlobalTextInputProperties
// TextInputGlobalPropertyPerContextInput. Setting it uses `defaults write … -dict-add`. Putting back an owner's "unset"
// removes just that nested key: the dictionary is read through cfprefsd (`defaults export`), the key removed by plutil,
// and the dictionary written back as that one top-level key's value (`defaults write <domain> <key> <XML>`, which keeps
// every value's type, integer, real, date and data included). The dictionary's other keys, and every other key of
// the domain (the input sources the owner may switch during a run), are never written. A dictionary the run created
// (absent before it, empty once the key is gone) is deleted, so the domain is as the owner had it. Never a whole-domain
// import, never an edit of the plist file, which cfprefsd's cache would override.
import {execFileSync} from 'node:child_process';
import {assertGithubHosted, isGithubHosted} from '../hosted-sittings/runner.mjs';

export const HITOOLBOX = 'com.apple.HIToolbox';
export const GLOBAL_PROPERTIES = 'AppleGlobalTextInputProperties';
export const PER_CONTEXT_KEY = 'TextInputGlobalPropertyPerContextInput';
// The preference as a person names it in a failure, with where it lives.
export const PER_CONTEXT_NAME = `the per-context input preference (${HITOOLBOX} ${GLOBAL_PROPERTIES} ${PER_CONTEXT_KEY})`;

// The bound on each defaults or plutil call.
const PREFERENCE_MS = 15_000;
const run = (cmd, args, options = {}) => execFileSync(cmd, args, {encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: PREFERENCE_MS, ...options});
const failure = error => String(error.stderr || error.message).trim().slice(0, 200);
// How `defaults read` says a key is unset (exit 1): macOS 26 "does not exist", macOS 27 "Could not find key".
const UNSET = /does not exist|Could not find/;

// Why the harness may not write the input source or this domain here, or null on a GitHub-hosted runner. `at`: the
// device's {env, platform}, the process's by default.
export const INPUT_WRITES_HOSTED_ONLY = 'off a GitHub-hosted runner the harness never selects an input source or writes com.apple.HIToolbox (ruling 1188): they are how the owner types every day';
export const inputWriteRefusal = ({env = process.env, platform = process.platform} = {}) => (isGithubHosted(env, platform) ? null : INPUT_WRITES_HOSTED_ONLY);
export const assertInputWrite = (what, {env = process.env, platform = process.platform} = {}) => assertGithubHosted(env, platform, `${what} (ruling 1188)`);
// Whether a probe's arguments select an input source (`input-source <id>`, scheduled with `--at` or not); reading the
// current one (`input-source current`) writes nothing.
export const selectsSource = args => args[0] === 'input-source' && args[1] !== 'current';

// `defaults read com.apple.HIToolbox AppleGlobalTextInputProperties` (old-style text): the per-context preference,
// true or false, or null when it is not set.
export function parsePerContext(text) {
  const match = new RegExp(`${PER_CONTEXT_KEY}\\s*=\\s*(\\d+);`).exec(String(text ?? ''));
  return match ? match[1] !== '0' : null;
}

// The dictionary's presence and the preference's value. -> {dict: boolean, value: true | false | null}.
export function readPerContextState({exec = run} = {}) {
  let text;
  try { text = exec('/usr/bin/defaults', ['read', HITOOLBOX, GLOBAL_PROPERTIES]); } catch (error) {
    if (error.status === 1 && UNSET.test(String(error.stderr ?? ''))) return {dict: false, value: null};
    throw new Error(`could not read ${PER_CONTEXT_NAME}: ${failure(error)}`);
  }
  return {dict: true, value: parsePerContext(text)};
}

// The preference set on or off (the dictionary's other keys kept: -dict-add).
export function writePerContext(value, {exec = run, env, platform} = {}) {
  assertInputWrite('writing the per-context input preference', {env, platform});
  exec('/usr/bin/defaults', ['write', HITOOLBOX, GLOBAL_PROPERTIES, '-dict-add', PER_CONTEXT_KEY, '-bool', value ? 'true' : 'false']);
}

// The preference unset again: the nested key removed and only the one top-level key written back, or deleted when the
// run created it (`dictBefore` false, the saved record's) and nothing else is left in it. `dictBefore` unknown (a
// record saved before it was kept) leaves an empty dictionary rather than delete one the owner may have had.
// -> {changed: 'none' | 'rewritten' | 'deleted'}.
const EMPTY_DICT = /<plist[^>]*>\s*<dict\s*\/>\s*<\/plist>/;
export function unsetPerContext({dictBefore, exec = run, env, platform} = {}) {
  assertInputWrite('unsetting the per-context input preference', {env, platform});
  const domain = exec('/usr/bin/defaults', ['export', HITOOLBOX, '-']);
  let dict, rest;
  try { dict = exec('/usr/bin/plutil', ['-extract', GLOBAL_PROPERTIES, 'xml1', '-o', '-', '-'], {input: domain}); } catch (error) {
    if (/No value at that key path/.test(String(error.stderr ?? ''))) return {changed: 'none'};
    throw new Error(`could not read ${GLOBAL_PROPERTIES} from ${HITOOLBOX}: ${failure(error)}`);
  }
  try { rest = exec('/usr/bin/plutil', ['-remove', PER_CONTEXT_KEY, '-o', '-', '-'], {input: dict}); } catch (error) {
    if (/No value to remove/.test(String(error.stderr ?? ''))) return {changed: 'none'};
    throw new Error(`could not remove ${PER_CONTEXT_KEY} from ${GLOBAL_PROPERTIES}: ${failure(error)}`);
  }
  if (dictBefore === false && EMPTY_DICT.test(rest)) {
    exec('/usr/bin/defaults', ['delete', HITOOLBOX, GLOBAL_PROPERTIES]);
    return {changed: 'deleted'};
  }
  exec('/usr/bin/defaults', ['write', HITOOLBOX, GLOBAL_PROPERTIES, rest]);
  // defaults stores a value it cannot parse as a property list as a string: a dictionary that came back as anything
  // else is a broken write, never a restore.
  const type = exec('/usr/bin/defaults', ['read-type', HITOOLBOX, GLOBAL_PROPERTIES]);
  if (!/dictionary/.test(type)) throw new Error(`${GLOBAL_PROPERTIES} was written back as ${type.trim()}, not a dictionary`);
  return {changed: 'rewritten'};
}

// The owner's value as a person reads it.
export const ownerValueName = value => (value === true ? 'on' : value === false ? 'off' : 'unset');
// The exact command that sets the preference back to the owner's value (`dictBefore`: whether the dictionary existed
// before the run). For "unset" it is what unsetPerContext runs, as one shell line; a System Settings toggle cannot
// express it.
export function perContextCommand(owner, {dictBefore} = {}) {
  if (owner !== null) return `defaults write ${HITOOLBOX} ${GLOBAL_PROPERTIES} -dict-add ${PER_CONTEXT_KEY} -bool ${owner ? 'true' : 'false'}`;
  const rewrite = `defaults write ${HITOOLBOX} ${GLOBAL_PROPERTIES} "$(defaults export ${HITOOLBOX} - | plutil -extract ${GLOBAL_PROPERTIES} xml1 -o - - | plutil -remove ${PER_CONTEXT_KEY} -o - -)"`;
  if (dictBefore !== false) return rewrite;
  return `defaults delete ${HITOOLBOX} ${GLOBAL_PROPERTIES} when ${PER_CONTEXT_KEY} is its only key (the dictionary was absent before the run; \`defaults read ${HITOOLBOX} ${GLOBAL_PROPERTIES}\` shows it), else ${rewrite}`;
}
