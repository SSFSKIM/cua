// The front/key readings of a judged sample, and what keeps a sample from having a verdict: one contract for the
// harness that fills them (T10b′, the harness on a runner) and the judge that reads them (./summary.mjs). Rulings
// 1136 (the alert-frontmost rule) and 1141 (on a hosted runner replayd's capture alert stays up: "alert up, scene
// activated first"; front and key sampled around each judged cell; a failed activate is NO VERDICT, not FAIL; NO
// VERDICT never counts as a pass and is counted per cell), docs/doperpowers/specs/2026-10-18-own-native-engine-m5-wave1.md.
//
// Row.frontKey, on every judged row of a full matrix run (./cell-result.mjs; required on a run whose meta.hosted is true,
// optional elsewhere, so records from before the rule, hold 3's and the mini's, still judge as they read):
//   apps       [bundleId]: the applications the cell itself puts on screen: the driven scene's app, the user window's
//              scene's app in a background, concurrent-use or Unicode-behind-a-user-window cell, and an out-of-process
//              panel the cell opens (TextEdit's Open panel's service). Any other application front or key is an alert
//              (UserNotificationCenter carrying replayd's capture alert, H0 (ii)).
//   activate   {app, front, key}: the cell's activate step and its own check, before the cell's first act: `app` the
//              bundle id it activated (the driven scene's in the frontmost regime, the user window's in the background
//              regime), `front` whether that app was then the frontmost application, `key` whether it then held
//              keyboard focus.
//   before     {front, key}: read after the activate step and before the act: the frontmost application, and the
//              application holding keyboard focus (the system-wide focused application, as `--probe focus` reports
//              it); each a bundle id, or null when it could not be read.
//   after      {front, key}: the same, read after the act and its check; null when the act was skipped because its
//              activate step failed (nothing ran, so nothing is read after it, and the cause stays `activation`).
// Bundle ids only: never a pid, a window's title or anything of a window the run does not own. A full run marked
// hosted carries meta.hosted: true (set on a GitHub-hosted runner, RUNNER_ENVIRONMENT=github-hosted).
//
// A sample has no verdict (NO VERDICT: never a pass, never a fail; the judge counts it per cell by category), the first
// cause that applies:
//   activation  the activate step did not take front and key (1141: NO VERDICT, not FAIL), its act skipped or not
//   unread      a hosted run's sample without readings, or any sample whose readings hold a null (an act that ran
//               with `after` null among them)
//   alert       an application outside `apps` front or key, before or after the act (1136)
//   ownerInput  off a GitHub-hosted runner, a row that needs another input source or per-context preference than the
//               owner's (Row.ownerInput, ./owner-input.mjs; ruling 1188: the harness never changes them there)
//   invalid     the harness's own reason (Row.invalid: its target was not in front, its probe post fell outside the
//               action's interval)
//   unmeasured  a speed or finding sample not measured: its `ok` false, or a speed sample without a numeric duration
// and one the judge decides, since it needs both engines' samples:
//   unpaired    a cua sample whose verdict rests on the vendor's answer (a frontmost method row, a fixed-string
//               Unicode row's failure, the pressKey row, a declared departure) with no vendor sample with a verdict
//               from the same eligible run (ruling 1116: no valid pair, no verdict); a speed or finding sample outside
//               the complete run pairs (./cell-verdict.mjs).

export const NO_VERDICT_CAUSES = Object.freeze({
  unread: 'front/key readings missing (hosted) or unread, or the alert guard could not read the alert windows\' bounds',
  activation: 'the activate step did not take front and key',
  alert: 'an app other than the cell\'s front or key (an alert), or the alert guard refused the cell unsent (an alert over the run\'s window, or holding the front or key)',
  venue: 'the run\'s vendor and cua runs did not stand on one frame (ruling 1169): no sample of that run, on either side, is judged; or an input source the row selects that the runner\'s setup could not enable (ruling 1189), or a hosted runner\'s per-context preference read malformed, a baseline no restore could put back, so nothing was written',
  keyWindow: 'a click or key cell refused unsent because its scene\'s app did not hold the window the cell acts in as its own key window (ruling 1169\'s addition)',
  ownerInput: 'off a GitHub-hosted runner, the owner\'s input source or per-context preference was not the row\'s, and the harness never changes them there (ruling 1188)',
  ownerSitting: 'a pointer cell on the Open panel a hosted runner left unsent, the panel\'s x clamped short of the strip left of the capture alerts: the owner\'s sitting judges it (ruling 1203)',
  invalid: 'the harness\'s own invalid reason',
  unmeasured: 'a speed or finding sample not measured (no numeric duration)',
  unpaired: 'no vendor sample with a verdict from the same eligible run (ruling 1116); for speed and finding, outside the complete run pairs',
  reference: 'the vendor\'s sample of the run could not be the reference (ruling 1168\'s pointerdown cell: the vendor\'s click did not raise the count by exactly one)',
});

const isBundle = value => typeof value === 'string' && value.length > 0;
const readingOk = value => value === null || isBundle(value);

// The problems with a Row's frontKey, each naming the field. -> [string]; empty when it conforms.
export function frontKeyProblems(frontKey, at = 'frontKey') {
  if (!frontKey || typeof frontKey !== 'object' || Array.isArray(frontKey)) return [`${at} is not an object`];
  const out = [];
  if (!Array.isArray(frontKey.apps) || !frontKey.apps.length || !frontKey.apps.every(isBundle)) out.push(`${at}.apps is not a list of bundle ids`);
  const activate = frontKey.activate;
  if (!activate || typeof activate !== 'object') out.push(`${at}.activate is not {app, front, key}`);
  else {
    if (!isBundle(activate.app)) out.push(`${at}.activate.app is not a bundle id`);
    for (const k of ['front', 'key']) if (typeof activate[k] !== 'boolean') out.push(`${at}.activate.${k} is not a boolean`);
  }
  for (const when of ['before', 'after']) {
    const reading = frontKey[when];
    if (when === 'after' && reading === null) continue;
    if (!reading || typeof reading !== 'object') { out.push(`${at}.${when} is not {front, key}${when === 'after' ? ', nor null for a skipped act' : ''}`); continue; }
    for (const k of ['front', 'key']) if (!readingOk(reading[k])) out.push(`${at}.${when}.${k} is neither a bundle id nor null`);
  }
  return out;
}

// What the readings say about the sample. `hosted`: the run is marked hosted. -> {category, detail} | null.
export function frontKeyCause(frontKey, {hosted = false} = {}) {
  if (frontKey === undefined) return hosted ? {category: 'unread', detail: 'no front/key readings on a hosted run'} : null;
  const activate = frontKey.activate;
  if (typeof activate?.front !== 'boolean' || typeof activate?.key !== 'boolean') return {category: 'unread', detail: 'the activate step\'s check is missing'};
  if (!(activate.front && activate.key)) return {category: 'activation', detail: `${activate.app} did not take ${[!activate.front && 'front', !activate.key && 'key'].filter(Boolean).join(' and ')}`};
  const values = [frontKey.before?.front, frontKey.before?.key, frontKey.after?.front, frontKey.after?.key];
  if (values.some(v => !isBundle(v))) return {category: 'unread', detail: 'a front/key reading is missing'};
  const apps = new Set(frontKey.apps ?? []);
  const foreign = [...new Set(values.filter(v => !apps.has(v)))];
  return foreign.length ? {category: 'alert', detail: foreign.join(', ')} : null;
}

// Why a judged row's sample has no verdict, from the row alone (the judge tags each full run's rows with `hosted` from
// its meta). A row the harness left invalid before it read anything (its prepare failed, say) carries no readings: its
// own reason is why it has no verdict, not the readings it never needed. A row whose guarded key replayd's capture alert
// held (`alertHeld`: {keys, front}, ./steps.mjs AlertHeld) is `alert` by that mark alone: the guard saw the alert in
// front, so the act never ran, whatever a later reading shows. So is a row the alert guard refused (`alertGuard`: {cause,
// detail}, ./steps.mjs AlertGuarded; ruling 1154), by its own cause, `alert` or `unread`. A row of a run whose pair did
// not stand on one frame (`frameSplit`, which the judge tags, ./summary.mjs splitFrameRuns) is `venue` before anything
// else: the pair was no measurement. A row whose input source or preference the owner's Mac did not allow
// (`ownerInput`, ruling 1188), or whose source the runner could not enable (`venueInput`, `venue`, ruling 1189), was
// never sent: that is its cause; so was one a hosted runner left to the owner's sitting (`ownerSitting`, ruling 1203).
// -> {category, detail?} | null.
export function sampleCause(row) {
  // A row left unsent to the owner's sitting keeps that cause even where its opening's frames split (one lane clamped,
  // the other placed): it was never a measurement on either frame (review finding 6). The other side's row is the split's.
  if (row.ownerSitting) return {category: 'ownerSitting', detail: row.ownerSitting};
  if (row.frameSplit) return {category: 'venue', detail: `the run's pair did not stand on one frame (${row.frameSplit})`};
  if (row.venueInput) return {category: 'venue', detail: row.venueInput};
  if (row.ownerInput) return {category: 'ownerInput', detail: row.ownerInput};
  if (row.alertHeld) return {category: 'alert', detail: `${row.alertHeld.front} in front at the key guard; ${row.alertHeld.keys.join(', ')} held`};
  if (row.alertGuard) return {category: row.alertGuard.cause, detail: `the alert guard: ${row.alertGuard.detail}`};
  // A row of a panel's opening whose close did not take (./panels.mjs closePanel, ruling 1195): by the refusal's cause,
  // or `invalid` when the close was merely ineffective.
  if (row.panelClose) return {category: row.panelClose.cause, detail: `the panel's close: ${row.panelClose.detail}`};
  const readings = row.frontKey === undefined && row.invalid ? null : frontKeyCause(row.frontKey, {hosted: row.hosted === true});
  if (readings) return readings;
  if (row.invalid) return {category: 'invalid', detail: row.invalid};
  if ((row.section === 'speed' || row.section === 'finding') && row.ok !== true) return {category: 'unmeasured'};
  if (row.section === 'speed' && !Number.isFinite(row.inCellMs)) return {category: 'unmeasured', detail: 'no numeric duration'};
  return null;
}
