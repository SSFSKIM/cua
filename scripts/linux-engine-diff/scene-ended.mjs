// A lane's own text window that a request of its lane ended (#171 M5's T4). On the arm64 VM of 2026-10-06 the pinned
// build's `typeText` and `paste` ended gedit with SIGSEGV on every sample (docs/evidence/2026-10-06-linux-acceptance.md,
// "Text input, measured"), so on arm64 a vendor lane is expected to end its own scene window wherever it types. The rule,
// the same for every lane and in the spirit of task 24's (Decision Log 2026-11-01):
// - before each request of a lane's on its text window (each timed sample, and the audit's and the bus pass's) and once
//   at the run's end, the harness looks whether the window is still the run's (scenes.mjs `sceneEnded`);
// - a vendor lane's ended window is restarted before its next request: a fresh window on the scene's own text, warmed by
//   the operation for a warm sample as the backstop's is (run.mjs `restoreLaneScene`), recorded with the request that
//   last reached it, and counted per lane. The request that ended it was answered and stays that build's own outcome;
//   none of its later requests meets a dead window, so none is scored as a vendor failure that lowers the bar cua is
//   held to, and none is a harness preparation failure counted against the run's caps;
// - a candidate's ended window is never restarted: a request of cua's ended the person's application, so the run stops
//   as a failure there (`CandidateSceneEnded`), as a candidate's lost text does.

/** A candidate's own text window ended: a request of its lane ended it, so the run stops there. */
export class CandidateSceneEnded extends Error {
  constructor(label, record) {
    const last = record.last ? ` after ${record.last.op} ${record.last.block}/${record.last.i}` : '';
    super(`${label}'s ${record.scene} window ended (${record.ended})${last}: a request of its lane ended the application`);
    this.record = record;
  }
}

/**
 * The lane's text window before its next request (`at`: `{op, block, i, series}`, or `{pass}` for an untimed pass or the
 * run's end), as `windows[sceneName].text[label]` holds it: the same window while it is the run's; else, for a vendor
 * lane, the fresh one `restart()` opened (its record emitted as a `scene-ended` row), or null when `restart` is null
 * (the run's end: no request is left for it). A candidate's ended window throws `CandidateSceneEnded`.
 */
export async function keepLaneScene({ desktop, windows, sceneName, label, vendors, at, restart, emit }) {
  const scene = windows[sceneName].text[label];
  const ended = await desktop.sceneEnded(scene);
  if (!ended) return scene;
  const record = { engine: label, scene: sceneName, ...at, ended, id: scene.id, pid: scene.pid ?? null, last: scene.lastRequest ?? null };
  if (!vendors.includes(label)) throw new CandidateSceneEnded(label, record);
  emit({ kind: 'scene-ended', ...record, restart: restart ? await restart() : null });
  return restart ? windows[sceneName].text[label] : null;
}

/**
 * A vendor lane's restart: `restore(warmUp)` opens the fresh window (run.mjs `restoreLaneScene`), warmed by the
 * operation for a warm sample (`warmUp`, null for a cold one). A warm-up that ended the fresh window too (`endedNow()`) is
 * followed by one more restart, unwarmed, so the next request still finds a window; both are recorded.
 */
export async function restartLaneScene({ restore, endedNow, warmUp }) {
  const record = await restore(warmUp);
  if (!warmUp) return record;
  const again = await endedNow();
  return again ? { ...record, warm_up_ended: again, then: await restore(null) } : record;
}

/**
 * The text windows a lane ended, over a run's rows: every lane counted, one at 0 named too, a vendor's restarts
 * (`scene-ended`) and a candidate's stop (`scene-lost`) alike. A restart is recorded only for a vendor lane, so a
 * `scene-ended` row of a candidate's fails the run. `{lanes, ended, pass, reasons}`.
 */
export function judgeSceneEnds(rows, lanes, vendors) {
  const ended = rows.filter((r) => r.kind === 'scene-ended' || r.kind === 'scene-lost');
  const counts = Object.fromEntries(lanes.map((l) => [l, 0]));
  for (const r of ended) counts[r.engine] = (counts[r.engine] ?? 0) + 1;
  const reasons = ended
    .filter((r) => r.kind === 'scene-ended' && !vendors.includes(r.engine))
    .map((r) => `${r.engine}'s own ${r.scene} window ended at ${r.op ?? r.pass} ${r.block ?? ''}/${r.i ?? ''}: a candidate's window is never restarted`);
  return { lanes: counts, ended, pass: reasons.length === 0, reasons };
}
