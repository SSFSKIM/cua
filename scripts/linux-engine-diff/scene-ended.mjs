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
 * run's end), as `windows[sceneName].text[label]` holds it: `{window, restart}`, the same window and no restart while it
 * is the run's; else, for a vendor lane, the fresh one `restart()` opened and its record (emitted as a `scene-ended`
 * row), or `{window: null, restart: null}` when `restart` is null (the run's end: no request is left for it). A record
 * with `invalid` (its warm-up's preparation refused) leaves the next sample invalid (`invalidRestartRow`). A
 * candidate's ended window throws `CandidateSceneEnded`.
 */
export async function keepLaneScene({ desktop, windows, sceneName, label, vendors, at, restart, emit }) {
  const scene = windows[sceneName].text[label];
  const ended = await desktop.sceneEnded(scene);
  if (!ended) return { window: scene, restart: null };
  const record = { engine: label, scene: sceneName, ...at, ended, id: scene.id, pid: scene.pid ?? null, last: scene.lastRequest ?? null };
  if (!vendors.includes(label)) throw new CandidateSceneEnded(label, record);
  const restarted = restart ? await restart() : null;
  emit({ kind: 'scene-ended', ...record, restart: restarted });
  return { window: restart ? windows[sceneName].text[label] : null, restart: restarted };
}

/**
 * A vendor lane's restart: `restore(warmUp)` opens the fresh window (run.mjs `restoreLaneScene`), warmed by the
 * operation for a warm sample (`warmUp`, null for a cold one). Two outcomes of the warm-up are kept apart:
 * - its preparation refused at the oracle (`invalid`, as the backstop records it): the warm condition could not be
 *   reproduced, so the record is returned as it is and its sample is left invalid, never scored (prepare.mjs's rule);
 * - its request ended the fresh window too (`endedNow()`, the vendor crash again): one more restart, unwarmed, so the
 *   next request still finds a window; both are recorded, and both ends are counted (`judgeSceneEnds`).
 */
export async function restartLaneScene({ restore, endedNow, warmUp }) {
  const record = await restore(warmUp);
  if (!warmUp || record.invalid) return record;
  const again = await endedNow();
  return again ? { ...record, warm_up_ended: again, then: await restore(null) } : record;
}

/**
 * The sample a restart left invalid (its warm-up's preparation refused at the oracle): a `prepare-failure` row with
 * outcome `invalid`, no request sent, counted by the gate's rule as the backstop's invalid samples are (prepare.mjs
 * `judgePrepareFaults`). The restart itself is on its `scene-ended` row.
 */
export function invalidRestartRow({ label, sceneName, op, block, i, restart }) {
  return { kind: 'prepare-failure', engine: label, scene: sceneName, op, block, series: i === 0 ? 'cold' : 'warm', i, step: 'oracle', error: restart.invalid, attempts: [], outcome: 'invalid', why: `the restart of the lane's ended window could not reproduce the warm condition: ${restart.invalid}` };
}

/**
 * The text windows a lane ended, over a run's rows: every lane counted, one at 0 named too, a vendor's restarts
 * (`scene-ended`, and a window its restart's warm-up ended too, `warm_up_ended`) and a candidate's stop (`scene-lost`)
 * alike. A restart is recorded only for a vendor lane, so a `scene-ended` row of a candidate's fails the run.
 * `{lanes, ended, pass, reasons}`.
 */
export function judgeSceneEnds(rows, lanes, vendors) {
  const ended = rows.filter((r) => r.kind === 'scene-ended' || r.kind === 'scene-lost');
  const counts = Object.fromEntries(lanes.map((l) => [l, 0]));
  for (const r of ended) counts[r.engine] = (counts[r.engine] ?? 0) + 1 + (r.restart?.warm_up_ended ? 1 : 0);
  const reasons = ended
    .filter((r) => r.kind === 'scene-ended' && !vendors.includes(r.engine))
    .map((r) => `${r.engine}'s own ${r.scene} window ended at ${r.op ?? r.pass} ${r.block ?? ''}/${r.i ?? ''}: a candidate's window is never restarted`);
  return { lanes: counts, ended, pass: reasons.length === 0, reasons };
}

/**
 * The audit's requests on one lane window (fix wave 1): `samples` audited requests in as few lifecycles as the window
 * allows. `segment({from, samples, stopAfter})` runs one audit lifecycle (its proxy, its ancestry watch of the window as
 * it is now, its engine) from request `from`, asking `stopAfter(i)` after each request whether to end there, and answers
 * its record with `ran`, the requests it sent. A request that ended the window (`ended()`) ends its lifecycle; the window
 * is then recovered (`recover(next)`: keepLaneScene's restart for a vendor, its stop for a candidate) and the next request
 * audited in a fresh lifecycle on the replacement, its ancestry watched anew. Answers every lifecycle's record.
 */
export async function auditInSegments({ samples, segment, ended, recover }) {
  const segments = [];
  for (let next = 0; next < samples; ) {
    const done = await segment({ from: next, samples, stopAfter: async (i) => i + 1 < samples && (await ended()) });
    segments.push(done);
    next += done.ran;
    if (next < samples) await recover(next);
  }
  return segments;
}

/** The audit lifecycles' judgments as one (`auditRequests`, `auditForeground` shapes): clean and traced only if each is, counts summed. */
export function mergeAudits(audits) {
  const merged = { clean: audits.every((a) => a.clean), traced: audits.every((a) => a.traced), requests: audits.reduce((n, a) => n + a.requests, 0), forbidden: audits.flatMap((a) => a.forbidden) };
  if (audits.some((a) => a.allowed)) merged.allowed = audits.flatMap((a) => a.allowed ?? []);
  if (audits.some((a) => a.samples)) merged.samples = audits.flatMap((a) => a.samples ?? []);
  return merged;
}
