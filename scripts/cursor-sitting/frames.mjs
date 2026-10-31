// The frames the window server composited during the cursor probe's glides (#235's task-8 report), so the arm that caps
// the cursor's frame rate (`fps60`) is proven to have taken effect, or shown not to, in the same run as its timing.
// WindowServer marks every frame it composites with a FrameUpdate signpost (subsystem com.apple.SkyLight, category
// tracing); a stream of them runs only while the probe glides, before the series' sessions open (./signposts.mjs
// startFrameStream). The probe's `--glides` prints each glide's span in mach continuous ticks, the clock those
// signposts are stamped with, and its rock's. The count is the whole display's: what the cursor's animations make
// WindowServer composite, plus whatever else drew meanwhile (the display runs at the highest rate anything on it asks
// for).
export const FRAME_UPDATE_PREDICATE = 'process == "WindowServer" AND subsystem == "com.apple.SkyLight" AND category == "tracing" AND signpostName == "FrameUpdate"';
// On the MacBook's 120 Hz ProMotion display a default glide's frames come a display frame (8.3 ms) apart, a capped one's
// two (16.7 ms). The verdict reads the median interval, which a burst of another app's frames inside a glide (the
// count is the whole display's) barely moves, where it can lift the rate past 66 Hz (measured, #235's task-8 report).
export const CAPPED_INTERVAL_MS = 14, FULL_INTERVAL_MS = 10;

const median = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// A probe's answer (`--probe cursor --glides`) as spans under its pid.
export function probeSpans(answer) {
  const pid = answer?.pid ?? null;
  return {pid, glides: (answer?.glides ?? []).map(g => ({pid, begin: g.begin, end: g.end, ms: g.ms, mode: g.mode})),
    rock: answer?.rock ? {pid, begin: answer.rock.begin, end: answer.rock.end, ms: answer.rock.ms, mode: 'rock'} : null};
}

// Each span with the frames inside it, their rate, and the median interval between them (ms), scaled by the span's own
// ticks and ms, so no timebase is assumed. `times`: FrameUpdate times, in order.
export const glideFrames = (spans, times) => spans.map(span => {
  const inside = times.filter(t => t >= span.begin && t <= span.end);
  const msPerTick = span.ms / (span.end - span.begin);
  const intervals = inside.slice(1).map((t, k) => (t - inside[k]) * msPerTick);
  return {...span, frames: inside.length, hz: inside.length / (span.ms / 1000), intervalMs: median(intervals)};
});

const round = (x, digits = 1) => (x === null ? null : Math.round(x * 10 ** digits) / 10 ** digits);
// Each figure's median over `rows` (glideFrames').
export function frameSummary(rows) {
  if (!rows.length) return {glides: 0};
  return {glides: rows.length, frames: median(rows.map(r => r.frames)), ms: round(median(rows.map(r => r.ms))), hz: round(median(rows.map(r => r.hz))),
    intervalMs: round(median(rows.map(r => r.intervalMs).filter(x => x !== null)))};
}

// Whether the cap took effect: `capped`'s glides' frames about 60 a second apart where `base`'s (no arm, the same probe,
// the same run) came at the display's full rate; each side's frameSummary. -> {verdict: capped | not capped |
// undetermined, why}.
export function capVerdict(base, capped) {
  if (!base?.glides || !capped?.glides || base.intervalMs == null || capped.intervalMs == null) return {verdict: 'undetermined', why: 'no glide was counted on one side'};
  const said = side => `a frame every ${side.intervalMs} ms (${side.hz} Hz)`;
  if (capped.intervalMs < CAPPED_INTERVAL_MS) return {verdict: 'not capped', why: `the capped glides composited ${said(capped)}, under ${CAPPED_INTERVAL_MS} ms apart`};
  if (base.intervalMs > FULL_INTERVAL_MS) return {verdict: 'undetermined', why: `the default glides composited ${said(base)}, over ${FULL_INTERVAL_MS} ms apart: the display did not run at its full rate for them, so a cap cannot show`};
  return {verdict: 'capped', why: `capped ${said(capped)} against the default's ${said(base)}`};
}

// The fps60 arm's cap check (the runner's glide-frames task): `probe` (the approved bundle's, args -> its answer) glides
// without the arm and then with it, and `readFrames` (since -> FrameUpdate times, or a promise of them) counts each
// side's frames. It does not
// stop the series for a failed count: a read that fails, or a probe that failed with its exit confirmed, is an
// undetermined verdict, with the pids of the probes that did run, so the series' own count still leaves their glides
// out. A probe whose end is unconfirmed (runProbe's `stuck`: never identified, or alive after SIGKILL) is rethrown and
// stops the series, since it may still be drawing a cursor over the display the series measures.
export async function glideFramesCheck(arm, {probe, readFrames, glides = 2, now = () => Date.now()}) {
  const since = new Date(now() - 2000), sides = [], pids = [];
  try {
    for (const extra of [[], ['--debug', arm]]) {
      const side = probeSpans(probe(['cursor', '--glides', String(glides), ...extra]));
      sides.push(side);
      if (Number.isInteger(side.pid)) pids.push(side.pid);
    }
    const times = await readFrames(since);
    const [base, capped] = sides.map(side => {
      const rows = glideFrames(side.glides, times);
      return {pid: side.pid, ...frameSummary(rows), rock: side.rock ? glideFrames([side.rock], times)[0] : null, rows};
    });
    // A glide with no frames is a gap in the collection, not a rate: frameSummary would pass over it.
    const empty = [['default', base], [arm, capped]].flatMap(([name, side]) => side.rows.filter(r => r.frames === 0).map(() => name));
    if (empty.length) return {ok: false, arm, verdict: 'undetermined', why: `a glide with no frames (${empty.join(', ')}): the frames were not all collected`, base, capped, pids};
    const {verdict, why} = capVerdict(base, capped);
    return {ok: verdict === 'capped', arm, verdict, why, base, capped, pids};
  } catch (error) {
    if (error?.stuck) throw error;
    return {ok: false, arm, verdict: 'undetermined', why: `the frames were not counted: ${String(error.message).split('\n')[0]}`, pids};
  }
}

// The cap check with its frames from a FrameUpdate stream (`startStream`: ./signposts.mjs startFrameStream) that runs
// for the check only: started before the probes, drained (stopped, its last lines in) once they end and `settleMs` has
// let the last frames arrive, and judged from the drained times. A stream that did not start or failed on the way is
// an undetermined verdict, never a partial count read as a rate.
export async function capCheckWithStream(arm, {probe, startStream, glides = 2, settleMs = 1000, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
  const frames = await startStream();
  let kept = null;
  const finish = async () => (kept ??= await frames.stop());
  try {
    return await glideFramesCheck(arm, {probe, glides, readFrames: async () => {
      if (frames.started) await sleep(settleMs);
      await finish();
      if (!frames.started || !kept.ok) throw new Error(`the FrameUpdate stream ${frames.started ? 'failed' : 'did not start'}: ${kept.error ?? 'no reason given'}`);
      return kept.times;
    }});
  } finally { await finish(); }
}
