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
//   invalid     the harness's own reason (Row.invalid: its target was not in front, its probe post fell outside the
//               action's interval)
//   unmeasured  a speed or finding sample not measured: its `ok` false, or a speed sample without a numeric duration
// and one the judge decides, since it needs both engines' samples:
//   unpaired    a cua sample whose verdict rests on the vendor's answer (a frontmost method row, a fixed-string
//               Unicode row's failure, the pressKey row, a declared departure) with no vendor sample with a verdict
//               from the same eligible run (ruling 1116: no valid pair, no verdict); a speed or finding sample outside
//               the complete run pairs (./cell-verdict.mjs).

export const NO_VERDICT_CAUSES = Object.freeze({
  unread: 'front/key readings missing (hosted) or unread',
  activation: 'the activate step did not take front and key',
  alert: 'an app other than the cell\'s front or key (an alert)',
  invalid: 'the harness\'s own invalid reason',
  unmeasured: 'a speed or finding sample not measured (no numeric duration)',
  unpaired: 'no vendor sample with a verdict from the same eligible run (ruling 1116); for speed and finding, outside the complete run pairs',
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
// its meta). -> {category, detail?} | null.
export function sampleCause(row) {
  const readings = frontKeyCause(row.frontKey, {hosted: row.hosted === true});
  if (readings) return readings;
  if (row.invalid) return {category: 'invalid', detail: row.invalid};
  if ((row.section === 'speed' || row.section === 'finding') && row.ok !== true) return {category: 'unmeasured'};
  if (row.section === 'speed' && !Number.isFinite(row.inCellMs)) return {category: 'unmeasured', detail: 'no numeric duration'};
  return null;
}
