// The frames the window server composited during each of the cursor's glides (#235's task-8 report), so an arm that caps
// the cursor's frame rate (`fps60`) is proven to have taken effect, or shown not to, in the same run as its timing.
// WindowServer marks every frame it composites with a FrameUpdate signpost (subsystem com.apple.SkyLight, category
// tracing), which `log show --signpost` keeps; the engine marks every motion it installs with a `cursor.motion`
// signpost carrying the motion's span in mach continuous ticks and its cursor (native/engine/Sources/Engine/Cursor/
// CursorPanel.swift), the clock those signposts are stamped with, and every removal of a cursor's motion with no new
// one (a snap, a hide, a close) with `cursor.stop`; a motion's span ends where the next of either for its cursor
// removed it. The cursor probe's `--glides` prints the same spans for its own glides and its rock. The count is the whole display's: what the cursor's animations make WindowServer composite, plus
// whatever else drew meanwhile (the display runs at the highest rate anything on it asks for).
import {execFileSync} from 'node:child_process';

export const FRAME_UPDATE_PREDICATE = 'process == "WindowServer" AND subsystem == "com.apple.SkyLight" AND category == "tracing" AND signpostName == "FrameUpdate"';
// On the MacBook's 120 Hz ProMotion display a default glide's frames come a display frame (8.3 ms) apart, a capped one's
// two (16.7 ms). The verdict reads the median interval, which a burst of another app's frames inside a glide (the
// count is the whole display's) barely moves, where it can lift the rate past 66 Hz (measured, #235's task-8 report).
export const CAPPED_INTERVAL_MS = 14, FULL_INTERVAL_MS = 10;

const events = text => text.split('\n').flatMap(line => {
  if (!line.startsWith('{')) return [];
  try { return [JSON.parse(line)]; } catch { return []; }
});
const median = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// WindowServer's FrameUpdate times in `text` (log show's ndjson), in order.
export const frameUpdateTimes = text => events(text)
  .filter(e => e.signpostName === 'FrameUpdate' && e.subsystem === 'com.apple.SkyLight' && e.category === 'tracing' && Number.isFinite(e.machTimestamp))
  .map(e => e.machTimestamp).sort((a, b) => a - b);

// The engine's motion spans in `text` (its timing signposts as log show's ndjson), leaving out `excludePids`' (the cursor
// probes a series ran, whose signposts share the engine's subsystem). A motion's install removes its cursor's earlier
// one at once, and a stop removes it with none to follow, so each span is cut at the first later `cursor.motion` or
// `cursor.stop` of the same process and cursor (`cut`, its ms the part that played), and one replaced before it began is
// left out. A build before the cursor field gives null: one cursor a process. -> [{pid, cursor, begin, end, ms, mode,
// cut}].
export function motionSpans(text, {excludePids = []} = {}) {
  const marks = events(text).filter(e => (e.signpostName === 'cursor.motion' || e.signpostName === 'cursor.stop') && !excludePids.includes(e.processID))
    .map(e => ({e, at: e.machTimestamp, cursor: /cursor=(\d+)/.exec(e.eventMessage ?? '')?.[1] ?? null}))
    .map(m => ({...m, cursor: m.cursor === null ? null : Number(m.cursor)}));
  return marks.flatMap(mark => {
    if (mark.e.signpostName !== 'cursor.motion') return [];
    const m = /begin=(\d+) end=(\d+) ms=([\d.]+) mode=(\w+)/.exec(mark.e.eventMessage ?? '');
    if (!m) return [];
    const begin = Number(m[1]), end = Number(m[2]), ms = Number(m[3]);
    const removed = Math.min(...marks.filter(o => o !== mark && o.e.processID === mark.e.processID && o.cursor === mark.cursor && o.at > mark.at).map(o => o.at));
    if (removed <= begin) return [];
    const cut = removed < end;
    const until = cut ? removed : end;
    return [{pid: mark.e.processID, cursor: mark.cursor, begin, end: until, ms: cut ? ms * (until - begin) / (end - begin) : ms, mode: m[4], cut}];
  });
}

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
    const {verdict, why} = capVerdict(base, capped);
    return {ok: verdict === 'capped', arm, verdict, why, base, capped, pids};
  } catch (error) {
    if (error?.stuck) throw error;
    return {ok: false, arm, verdict: 'undetermined', why: `the frames were not counted: ${String(error.message).split('\n')[0]}`, pids};
  }
}

const logDate = date => {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

// WindowServer's FrameUpdate times since `since` (a Date, a second's resolution), read now with `log show`.
export function readFrameUpdates(since, {exec = execFileSync} = {}) {
  return frameUpdateTimes(exec('/usr/bin/log', ['show', '--signpost', '--style', 'ndjson', '--start', logDate(since), '--predicate', FRAME_UPDATE_PREDICATE],
    {encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024, timeout: 300_000}));
}
