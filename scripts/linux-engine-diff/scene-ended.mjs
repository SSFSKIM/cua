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

const PILOT = 'docs/evidence/2026-10-28-own-linux-engine/m5/arm64/pilot/out-zero-r1/V1.development-run.pinned.pilot/run/results.jsonl (V1 at da306cc6, stopped by the restore fixed in item (c))';
/**
 * The vendor builds' declared ends of their own scene windows (#171 M5, T4's arm64 round, item (a); the design session's
 * word): each names the build by its binary's sha256 and its release, the scene, and the operation of the request that
 * ended the window, with what the pilot counted (`ended` of `requests`: timed samples, restarts' warm-ups and audit
 * requests) and where. A declared end is listed apart as declared, and an undeclared one apart as undeclared: neither
 * fails a step, and neither is ever counted as a cua pass or loss (the pre-flight's T4 row: a vendor's ended window is
 * restarted, counted and never scored against cua). The table documents what the pilot saw; an undeclared end is a
 * vendor behaviour it did not see, for a look.
 */
export const DECLARED_VENDOR_ENDS = Object.freeze([
  ...['type_text', 'type_text_selection', 'clipboard_write'].map((op) => ({
    id: `arm64-pinned-gedit-${op}`,
    release: '26.928.40906-linux-arm64',
    sha256: 'a2ee3b612a2a65a9e1cb429b69954f9cfddf26072568aeb882f42e0545da2193',
    scene: 'gedit',
    op,
    counts: { ended: 13, requests: 13 },
    evidence: PILOT,
    reason: `the pinned arm64 build's ${op} on gedit (GTK 3) ended gedit on every request that reached it (6 timed, 5 warm-ups, 2 audit), answering a D-Bus ServiceUnknown that names the ended window's accessibility connection`,
  })),
  {
    id: 'arm64-newest-gedit-clipboard_write',
    release: '26.1023.51421-linux-arm64',
    sha256: 'b407257f647fc135df7dec9d9c6c1afffd33c0e929169d8330f69f25fad3d7d9',
    scene: 'gedit',
    op: 'clipboard_write',
    counts: { ended: 12, requests: 13 },
    evidence: PILOT,
    reason: "the newest arm64 build's clipboard_write on gedit ended gedit on every request whose end was recorded (12 of 13: the 13th, the audit's last, was found ended as the run stopped); its type_text and type_text_selection left gedit alive",
  },
]);

/**
 * A run's vendor ends by build, scene and operation (`builds`: lane -> its binary's sha256, the meta row's): each counted
 * once per request that ended a window, the request that last reached it (`last`), and the restart's warm-up that ended
 * the fresh window too with its own operation. `{declared: [...], undeclared: [...]}`, each `{engine, release, sha256,
 * scene, op, count}`, a declared one with its table `id`.
 */
function vendorEnds(ended, vendors, builds) {
  const groups = new Map();
  const add = (r, op) => {
    const sha256 = builds?.[r.engine] ?? null;
    const declared = DECLARED_VENDOR_ENDS.find((d) => d.sha256 === sha256 && d.scene === r.scene && d.op === op) ?? null;
    const key = `${r.engine}|${r.scene}|${op}`;
    const g = groups.get(key) ?? { engine: r.engine, release: declared?.release ?? DECLARED_VENDOR_ENDS.find((d) => d.sha256 === sha256)?.release ?? null, sha256, scene: r.scene, op, count: 0, ...(declared ? { id: declared.id } : {}) };
    g.count++;
    groups.set(key, g);
  };
  for (const r of ended.filter((x) => x.kind === 'scene-ended' && vendors.includes(x.engine))) {
    add(r, r.last?.op ?? null);
    if (r.restart?.warm_up_ended) add(r, r.op ?? null);
  }
  const all = [...groups.values()];
  return { declared: all.filter((g) => g.id), undeclared: all.filter((g) => !g.id) };
}

/**
 * The text windows a lane ended, over a run's rows: every lane counted, one at 0 named too, a vendor's restarts
 * (`scene-ended`, and a window its restart's warm-up ended too, `warm_up_ended`) and a candidate's stop (`scene-lost`)
 * alike. A restart is recorded only for a vendor lane, so a `scene-ended` row of a candidate's fails the run. The
 * vendor's ends are also sorted into declared and undeclared (`DECLARED_VENDOR_ENDS`, by `builds`), which fail nothing.
 * `{lanes, ended, pass, reasons, vendor: {declared, undeclared}}`.
 */
export function judgeSceneEnds(rows, lanes, vendors, { builds = null } = {}) {
  const ended = rows.filter((r) => r.kind === 'scene-ended' || r.kind === 'scene-lost');
  const counts = Object.fromEntries(lanes.map((l) => [l, 0]));
  for (const r of ended) counts[r.engine] = (counts[r.engine] ?? 0) + 1 + (r.restart?.warm_up_ended ? 1 : 0);
  const reasons = ended
    .filter((r) => r.kind === 'scene-ended' && !vendors.includes(r.engine))
    .map((r) => `${r.engine}'s own ${r.scene} window ended at ${r.op ?? r.pass} ${r.block ?? ''}/${r.i ?? ''}: a candidate's window is never restarted`);
  return { lanes: counts, ended, pass: reasons.length === 0, reasons, vendor: vendorEnds(ended, vendors, builds) };
}

/** A vendor end group as a line names it: scene, operation, lane, build. */
export const vendorEndName = (g) => `${g.scene} ${g.op ?? 'an unrecorded request'} ${g.engine} (${g.release ?? 'an unnamed build'})`;

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
