// Acceptance 5's focus readings (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md; the runbook,
// docs/evidence/2026-10-30-macos-agent-cursor/README.md): the approved bundle's focus probe (`--probe focus --window
// <pid,x,y,w,h>`, native/engine/Sources/Engine/FocusProbe.swift) reads the system's focused app, its focused window and
// the focused element's value hash, before and after the cursor appears over the Electron fixture; the proof needs both
// readings usable and equal.
//
// Two things the first sitting's readings got wrong (its record, "5's focus proof: the kit's first reading"):
// - The probe reads the focused app once, right after it sets AXManualAccessibility on the fixture, and Chromium turns
//   its accessibility on about 2 s after that: the first readings found no focused app. So a reading of a scene that
//   keeps an accessibility record (the fixture's cua-fixture-accessibility.jsonl, scripts/native-matrix/fixtures/
//   electron/main.js) first waits, bounded, until the record's last line says it is on, priming it with one probe run
//   when it is off (the probe's own AXManualAccessibility, which the engine's observations also set).
// - The window was named by the bounds the scene recorded at `up`, after the owner had moved it. So each reading names
//   the run window where the window list puts it now.

export const ACCESSIBILITY_WAIT_MS = 10_000;
export const ACCESSIBILITY_POLL_MS = 100;

// The fixture's accessibility now: its record's last complete line {at, enabled, source}, or null when it has none.
export function fixtureAccessibility(text) {
  const lines = String(text ?? '').split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const line = JSON.parse(lines[i]);
      if (typeof line?.enabled === 'boolean') return line;
    } catch {}  // a line still being written
  }
  return null;
}

// Waits until the record `read()` answers says accessibility is on: at once when it is, else after `prime()`, polling
// every `pollMs` up to `timeoutMs`. -> {enabled, waitedMs, primed, since (the record line's time, or null)}.
export async function awaitAccessibility({read, prime, now = Date.now, sleep, timeoutMs = ACCESSIBILITY_WAIT_MS, pollMs = ACCESSIBILITY_POLL_MS}) {
  const start = now();
  let state = fixtureAccessibility(read());
  if (state?.enabled) return {enabled: true, waitedMs: 0, primed: false, since: state.at};
  await prime();
  while (!state?.enabled && now() - start < timeoutMs) {
    await sleep(pollMs);
    state = fixtureAccessibility(read());
  }
  return {enabled: state?.enabled === true, waitedMs: now() - start, primed: true, since: state?.at ?? null};
}

// The bounds of the on-screen window `number` among a process's windows (front-window.swift's `windows`), or null.
export function runWindowBounds(windows, number) {
  return (windows ?? []).find(w => w.number === number && w.onScreen !== false)?.bounds ?? null;
}

// What a focus probe's answer says of the focus: the focused app, the focused window, whether it is the named window,
// and the focused element's value hash there (the probe's own time and grant left out).
export const focusReading = answer => ({focusedApp: answer?.focusedApp ?? null, focusedWindow: answer?.focusedWindow ?? null,
  named: answer?.named ?? null, valueHash: answer?.valueHash ?? null});

// Why a focus probe's answer cannot serve the proof, or null: it must come from a trusted probe, name the scene's
// process (`pid`) as the focused app and its window as the focused window, the named run window, and carry the focused
// element's value hash (the fixture's autofocused text field gives one, empty or not).
export function focusProblem(answer, pid) {
  if (answer?.accessibility !== true) return 'the focus probe is not trusted for Accessibility';
  if (answer.focusedApp?.pid !== pid) return `the focused app is ${answer.focusedApp?.pid ?? 'none'}, not the scene's process ${pid}`;
  if (answer.focusedWindow?.pid !== pid) return `the focused window belongs to ${answer.focusedWindow?.pid ?? 'none'}, not the scene's process ${pid}`;
  if (answer.named !== true) return 'the focused window is not the scene\'s run window (its bounds differ)';
  if (typeof answer.valueHash !== 'string' || !/^[0-9a-f]{64}$/.test(answer.valueHash)) return 'the focused element\'s value hash was not read';
  return null;
}

// One focus reading kept in `store` under `label`, and its verdict: usable (focusProblem), and with `equalTo`, equal to
// that earlier reading, both usable (two failed reads would otherwise compare equal). -> the task's result.
export function focusStep({label, answer, pid, equalTo, store}) {
  const reading = focusReading(answer), problem = focusProblem(answer, pid);
  store[label] = {reading, problem};
  if (equalTo === undefined) return {ok: problem === null, label, reading, ...(problem ? {problem} : {})};
  const earlier = store[equalTo];
  const same = problem === null && earlier?.problem === null && JSON.stringify(reading) === JSON.stringify(earlier.reading);
  return {ok: same, label, reading, equalTo, same, ...(problem ? {problem} : {}), ...(earlier?.problem ? {earlierProblem: earlier.problem} : {}), ...(earlier ? {} : {earlierProblem: `no reading named ${equalTo}`})};
}

// One reading of `record`'s focus ({id, pid, window: {number}}): its run window's bounds read now (`windows(pid)`),
// the accessibility wait when `accessibilityText` reads a record (null: the scene keeps none), then the probe
// (`probe(args)`: the approved bundle's, its last JSON line). -> focusStep's result, with the bounds named and the wait.
export async function readFocus({label, record, equalTo, store, windows, probe, accessibilityText, now = Date.now,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), timeoutMs = ACCESSIBILITY_WAIT_MS, pollMs = ACCESSIBILITY_POLL_MS}) {
  const bounds = runWindowBounds(windows(record.pid), record.window.number);
  if (!bounds) {
    const problem = `the ${record.id} scene's run window ${record.window.number} is not on screen`;
    store[label] = {reading: null, problem};
    return {ok: false, label, problem};
  }
  const args = ['focus', '--window', [record.pid, bounds.x, bounds.y, bounds.width, bounds.height].join(',')];
  const accessibility = accessibilityText
    ? await awaitAccessibility({read: accessibilityText, prime: () => probe(args), now, sleep, timeoutMs, pollMs}) : null;
  const step = focusStep({label, answer: probe(args), pid: record.pid, equalTo, store});
  const accessibilityProblem = accessibility && !accessibility.enabled ? `the fixture's accessibility did not come on within ${timeoutMs} ms` : null;
  return {...step, ok: step.ok && !accessibilityProblem, bounds, ...(accessibility ? {accessibility} : {}), ...(accessibilityProblem ? {accessibilityProblem} : {})};
}
