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
// removes just that nested key (./unset-per-context.sh, the one implementation, which a person can also run): the
// dictionary is read through cfprefsd (`defaults export`), the key removed by plutil, and the dictionary written back
// as that one top-level key's value (`defaults write <domain> <key> <XML>`, which keeps every value's type, integer,
// real, date and data included). The dictionary's other keys, and every other key of
// the domain (the input sources the owner may switch during a run), are never written. A dictionary the run created
// (absent before it, empty once the key is gone) is deleted, so the domain is as the owner had it. Never a whole-domain
// import, never an edit of the plist file, which cfprefsd's cache would override.
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
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

// Why the harness may not write the input source or this domain here, or null on a GitHub-hosted runner. `at`: the
// device's {env, platform}, the process's by default.
export const INPUT_WRITES_HOSTED_ONLY = 'off a GitHub-hosted runner the harness never selects an input source or writes com.apple.HIToolbox (ruling 1188): they are how the owner types every day';
export const inputWriteRefusal = ({env = process.env, platform = process.platform} = {}) => (isGithubHosted(env, platform) ? null : INPUT_WRITES_HOSTED_ONLY);
export const assertInputWrite = (what, {env = process.env, platform = process.platform} = {}) => assertGithubHosted(env, platform, `${what} (ruling 1188)`);
// Whether a probe's arguments select an input source (`input-source <id>`, scheduled with `--at` or not); reading the
// current one (`input-source current`) writes nothing.
export const selectsSource = args => args[0] === 'input-source' && args[1] !== 'current';

// The preference read as typed, from one snapshot of the domain (`defaults export` through cfprefsd, then plutil on
// its output): the dictionary's presence and the key's value. A key that is not a Boolean, or a top-level value that is
// not a dictionary, is malformed, never "unset". -> {dict: boolean, value: true | false | null | {malformed: why}}.
const NO_VALUE = /No value at that key path/;
export function readPerContextState({exec = run} = {}) {
  let exported;
  try { exported = exec('/usr/bin/defaults', ['export', HITOOLBOX, '-']); } catch (error) { throw new Error(`could not read ${PER_CONTEXT_NAME}: ${failure(error)}`); }
  const type = keyPath => {
    try { return exec('/usr/bin/plutil', ['-type', keyPath, '-'], {input: exported}).trim(); } catch (error) {
      if (NO_VALUE.test(String(error.stderr ?? ''))) return null;
      throw new Error(`could not read ${PER_CONTEXT_NAME}: ${failure(error)}`);
    }
  };
  const dictType = type(GLOBAL_PROPERTIES);
  if (dictType === null) return {dict: false, value: null};
  if (dictType !== 'dictionary') return {dict: true, value: {malformed: `${GLOBAL_PROPERTIES} is a ${dictType}, not a dictionary`}};
  const keyType = type(`${GLOBAL_PROPERTIES}.${PER_CONTEXT_KEY}`);
  if (keyType === null) return {dict: true, value: null};
  if (keyType !== 'bool') return {dict: true, value: {malformed: `${PER_CONTEXT_KEY} is a ${keyType}, not a Boolean`}};
  const raw = exec('/usr/bin/plutil', ['-extract', `${GLOBAL_PROPERTIES}.${PER_CONTEXT_KEY}`, 'raw', '-o', '-', '-'], {input: exported}).trim();
  return {dict: true, value: raw === 'true'};
}

// The preference set on or off (the dictionary's other keys kept: -dict-add).
export function writePerContext(value, {exec = run, env, platform} = {}) {
  assertInputWrite('writing the per-context input preference', {env, platform});
  exec('/usr/bin/defaults', ['write', HITOOLBOX, GLOBAL_PROPERTIES, '-dict-add', PER_CONTEXT_KEY, '-bool', value ? 'true' : 'false']);
}

// The preference unset again through ./unset-per-context.sh: the nested key removed and only the one top-level key
// written back, or deleted when the run created it (`dictBefore` false, the saved record's) and nothing else is left in
// it. `dictBefore` unknown (a record saved before it was kept) leaves an empty dictionary rather than delete one the
// owner may have had. It fails closed and writes nothing when the key is already absent. `domain`: a scratch plist's
// path in tests. -> {changed: 'none' | 'rewritten' | 'deleted'}.
export const UNSET_SCRIPT = fileURLToPath(new URL('./unset-per-context.sh', import.meta.url));
export function unsetPerContext({dictBefore, exec = run, env, platform, domain = HITOOLBOX} = {}) {
  assertInputWrite('unsetting the per-context input preference', {env, platform});
  let out;
  // The script guards itself too (hosted or --manual-recovery): it gets the environment this call was judged on.
  const scriptEnv = {...process.env, ...(env ?? {})};
  try { out = exec('/bin/sh', [UNSET_SCRIPT, ...(dictBefore === false ? ['--delete-if-empty'] : []), domain], {env: scriptEnv}).trim(); } catch (error) {
    throw new Error(`could not unset ${PER_CONTEXT_NAME}: ${failure(error)}`);
  }
  if (!['none', 'rewritten', 'deleted'].includes(out)) throw new Error(`could not unset ${PER_CONTEXT_NAME}: the script printed ${JSON.stringify(out.slice(0, 80))}`);
  return {changed: out};
}

// The owner's value as a person reads it.
export const ownerValueName = value => (value === true ? 'on' : value === false ? 'off' : value?.malformed ? `malformed (${value.malformed})` : 'unset');
// The exact command that sets the preference back to the owner's value (`dictBefore`: whether the dictionary existed
// before the run). For "unset" it is the script unsetPerContext runs, from the harness checkout, in its owner's
// manual-recovery mode (off a hosted runner a plain run refuses the real domain); a System Settings toggle cannot
// express it. Each is safe to repeat.
export function perContextCommand(owner, {dictBefore} = {}) {
  if (owner === true || owner === false) return `defaults write ${HITOOLBOX} ${GLOBAL_PROPERTIES} -dict-add ${PER_CONTEXT_KEY} -bool ${owner ? 'true' : 'false'}`;
  if (owner?.malformed) return `none: the owner's value was saved malformed (${owner.malformed}); set ${PER_CONTEXT_NAME} by hand`;
  return `sh scripts/native-matrix/unset-per-context.sh --manual-recovery${dictBefore === false ? ' --delete-if-empty' : ''} (in the harness checkout)`;
}
