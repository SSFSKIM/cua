// The hosted setup's `input sources` step (ruling 1189): the input sources sitting C's input rows select, enabled on
// the runner. A fresh GitHub-hosted image enables U.S. alone (pilot C, run 45299196290: every Latin and Korean
// selection read the US layout back, so all 230 input rows were invalid), so the probe cells and the Korean and
// Unicode matrix could never be judged there.
//
// What is enabled: com.apple.keylayout.ABC (a keyboard layout), and Korean 2-Set, which is an input mode
// (com.apple.inputmethod.Korean.2SetKorean) of the Korean input method (com.apple.inputmethod.Korean, itself enabled
// but never selectable). The IDs were read from macOS's own data: the input method's Info.plist (KoreanIM.app's
// KIM_Extension, tsInputModeListKey) and TISCreateInputSourceList on macOS 27.
//
// How: TISEnableInputSource (./input-sources.swift), the call System Settings makes, so the text input system's state
// and its preference (com.apple.HIToolbox AppleEnabledInputSources) stay one; never a preference write. Nothing is
// selected here: the runs select through the approved bundle's probe. The input method first, then its mode.
//
// The read-back: each selectable source listed by TIS's enabled list (TISCreateInputSourceList, enabled only), enabled
// and selectable there, read in a fresh process after a settle, up to READ_ROUNDS times. The preference's value is
// read beside it and recorded, never judged: the rows depend on the list. A source that does not read back does not
// fail the setup. It is named in the venue record (`missing`), and every input row that needs it is NO VERDICT
// `venue` (../native-matrix/owner-input.mjs venueInputCause), never run against the US layout and judged.
//
// Hosted only (assertGithubHosted): the input sources are how the owner types every day. Nothing is restored: the VM
// is thrown away after the job, as with TextEdit's preferences (ruling 1188's logic).
import {fileURLToPath} from 'node:url';
import {ABC, KOREAN_2SET} from '../native-matrix/live-checks.mjs';
import {assertGithubHosted} from './runner.mjs';

export const INPUT_SOURCES_SCRIPT = fileURLToPath(new URL('./input-sources.swift', import.meta.url));
export {ABC, KOREAN_2SET};
export const KOREAN_IM = 'com.apple.inputmethod.Korean';
// In enabling order; `selects`: a run selects it (the rows' sources), else it only carries one that does.
export const VENUE_INPUT_SOURCES = Object.freeze([{id: ABC, selects: true}, {id: KOREAN_IM, selects: false}, {id: KOREAN_2SET, selects: true}]);
export const READ_ROUNDS = 3, READ_SETTLE_MS = 1000;

// The helper's one JSON line. -> its answer; throws with the exit and the last stderr line otherwise.
function helper(exec, args, env) {
  const result = exec('swift', [INPUT_SOURCES_SCRIPT, ...args], {env});
  let answer = null;
  try { answer = JSON.parse(String(result.stdout ?? '').trim().split('\n').at(-1)); } catch { answer = null; }
  if (result.status !== 0 || !answer) throw new Error(`input-sources.swift ${args[0]}: exit ${result.status}${result.stderr ? `: ${String(result.stderr).trim().split('\n').at(-1)}` : ''}`);
  return answer;
}

// Whether the preference's value lists a source: a layout by its name, a mode by its id, an input method by its bundle.
export function preferenceLists(entries, id) {
  if (!Array.isArray(entries)) return null;
  return entries.some(e => (id.startsWith('com.apple.keylayout.') ? e?.['KeyboardLayout Name'] === id.slice('com.apple.keylayout.'.length)
    : e?.['Input Mode'] === id || (e?.['Bundle ID'] === id && !e?.['Input Mode'])));
}
// One source's read-back: in TIS's enabled list, enabled, and selectable when a run selects it.
const holds = (source, reading) => reading?.enabledList?.listed === true && reading.enabledList.enabled === true && (!source.selects || reading.enabledList.selectCapable === true);

// The record from the helper's answers ({enabled} from `enable`, {readings, preference} from the last `list`).
// -> {via, restored, sources: [{id, selects, enable, tis, preference, held}], preference, missing, reads, error?}.
export function inputSourcesRecord({enable = null, read = null, reads = 0, error = null}) {
  const sources = VENUE_INPUT_SOURCES.map(source => {
    const reading = read?.readings?.find(r => r.id === source.id) ?? null;
    const enabled = enable?.find(e => e.id === source.id) ?? null;
    return {id: source.id, selects: source.selects,
      enable: enabled ? {status: enabled.status ?? null, ...(enabled.already ? {already: true} : {}), ...(enabled.reason ? {reason: enabled.reason} : {})} : null,
      tis: reading ? {installed: reading.installed === true, type: reading.type ?? null, ...(reading.enabledList ?? {listed: false})} : null,
      preference: preferenceLists(read?.preference, source.id), held: holds(source, reading)};
  });
  // A mode is usable only with its input method: a run's source is missing when it, or what carries it, did not hold.
  const imHeld = sources.find(s => s.id === KOREAN_IM).held;
  const missing = sources.filter(s => s.selects && (!s.held || (s.id === KOREAN_2SET && !imHeld))).map(s => s.id);
  return {via: 'TISEnableInputSource (./input-sources.swift)', restored: 'nothing: the VM is thrown away (ruling 1189)', sources,
    preference: Array.isArray(read?.preference) ? read.preference : null, missing, reads, ...(error ? {error} : {})};
}

// Enables the sources, then reads them back in a fresh process after each settle until all hold, for at most
// READ_ROUNDS reads. A helper that fails is recorded (every run's source missing), never thrown: the setup goes on.
// deps: {env, platform, exec(command, args, options) -> {status, stdout, stderr}, sleep(ms)}. -> inputSourcesRecord's.
export async function enableInputSources({env = process.env, platform = process.platform, exec, sleep = ms => new Promise(done => setTimeout(done, ms))} = {}) {
  assertGithubHosted(env, platform, 'enabling input sources (ruling 1189)');
  const ids = VENUE_INPUT_SOURCES.map(s => s.id);
  let enable = null, read = null, reads = 0;
  try {
    enable = helper(exec, ['enable', ...ids], env).enabled ?? null;
    while (reads < READ_ROUNDS) {
      await sleep(READ_SETTLE_MS);
      read = helper(exec, ['list', ...ids], env);
      reads += 1;
      if (!inputSourcesRecord({enable, read}).missing.length) break;
    }
  } catch (error) { return inputSourcesRecord({enable, read, reads, error: String(error.message).slice(0, 300)}); }
  return inputSourcesRecord({enable, read, reads});
}

// The setup step's detail line.
const tisText = s => (!s.tis ? 'unread' : !s.tis.installed ? 'not installed' : !s.tis.listed ? 'not in the enabled list'
  : `${s.tis.enabled ? 'enabled' : 'NOT enabled'}${s.selects ? `, ${s.tis.selectCapable ? 'selectable' : 'NOT selectable'}` : ''}`);
const preferenceText = p => (p === null ? 'the preference unread' : p ? 'in the preference' : 'not in the preference');
export function inputSourcesDetail(record) {
  const each = record.sources.map(s => `${s.id} ${tisText(s)} (${preferenceText(s.preference)})`).join('; ');
  const missing = record.missing.length ? `MISSING ${record.missing.join(', ')}: the input rows needing ${record.missing.length === 1 ? 'it' : 'them'} are NO VERDICT venue` : 'every run\'s source enabled and selectable';
  return `${record.via}, read back from TIS's enabled list after ${record.reads} read${record.reads === 1 ? '' : 's'}: ${each}; ${missing}${record.error ? ` (${record.error})` : ''}; restored: ${record.restored}`;
}
