// Item 1's order from its recording (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md, Acceptance 1: "the
// button's state changes before or while the cursor arrives"; its Decision Log, 2026-10-31). The order comes from the
// clip's frames on the clip's own clock: for each of the item's two clicks, the first frame where the control changes
// against the first frame where the arrow's tip reaches it. The request meta is then put on the same clock as support:
// how long after the engine received each click its control changed and the cursor arrived.
//
// Two steps, both run by the operator after the sitting (ffmpeg's load would disturb the timing series):
//   frames  every frame around each click, cropped to the target scene's window, written outside the repository with
//           frames.json (each frame's index in the clip and its presentation time). The window around a click spans
//           every start the recorder could have had (its first frame 0–RECORDING_START_MAX_MS after its launch), from
//           FRAMES_BEFORE_MS before the click to FRAMES_AFTER_MS after it, past the longest glide (0.97 s).
//   order   the judged frames, by index: each target's change and arrival (the first-target's arrival being the
//           cursor's first frame, as it fades in at its first target). Judged by eye, since the arrow and its frosted
//           halo cover the very control whose pixels change, which no pixel difference tells apart.
// The join: the cursor's first frame is put at the first click's action start plus the motion plan's lead (CURSOR_LEAD_MS,
// CursorHub's beginTime), since the cursor is shown by the act just before the click's action (Input.swift, route 1).
// That is a model of the engine, so the join is checked against the recorder's launch and flagged when it does not fit;
// the order verdict never depends on it.
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {insideRepository, REPO_ROOT} from './recording.mjs';

// Item 1's two clicks, by the scene each lands in.
export const ORDER_TARGETS = Object.freeze({'first-target': 'textedit', 'second-target': 'chrome'});
export const RECORDING_START_MAX_MS = 3000;
export const FRAMES_BEFORE_MS = 300;
export const FRAMES_AFTER_MS = 1500;
export const CURSOR_LEAD_MS = 20;
// How far before the recorder's launch a join may put the clip's first frame and still count (the anchor's own error).
const JOIN_SLACK_MS = 50;

export const frameFile = (target, index) => `${target}-f${String(index).padStart(6, '0')}.jpg`;

// The recording and the two clicks in item 1's last attempt. -> {recording, stop, clicks: {target: {label, at, route, meta}}}.
export function clipEvidence(rows) {
  const recording = rows.findLast(r => r.kind === 'task' && r.task === 'record-start' && r.result?.ok)?.result;
  if (!recording) throw new Error('item 1\'s last attempt has no recording started (its record-start task)');
  const stop = rows.findLast(r => r.kind === 'task' && r.task === 'record-stop')?.result ?? null;
  const clicks = {};
  for (const target of Object.keys(ORDER_TARGETS)) {
    const row = rows.findLast(r => r.kind === 'cell' && r.orderTarget === target);
    if (!row?.ok) throw new Error(`item 1's last attempt has no answered click for the ${target}`);
    if (!Number.isFinite(row.meta?.receivedAt)) throw new Error(`the ${target}'s click kept no receivedAt in its meta`);
    clicks[target] = {label: row.label, at: row.at, route: row.route ?? null, meta: row.meta};
  }
  return {recording, stop, clicks};
}

// The clip's seconds to keep around a click the engine received at `receivedAt` (ms), the recorder launched at `spawnAt`.
export function framesWindow({receivedAt, spawnAt, startMaxMs = RECORDING_START_MAX_MS, beforeMs = FRAMES_BEFORE_MS, afterMs = FRAMES_AFTER_MS}) {
  const since = receivedAt - spawnAt;
  return [Math.max(0, (since - startMaxMs - beforeMs) / 1000), (since + afterMs) / 1000];
}

// The first and last frame index whose presentation time lies in [from, to] seconds, or null.
export function indexRange(pts, from, to) {
  const first = pts.findIndex(t => t >= from);
  if (first < 0 || pts[first] > to) return null;
  let last = first;
  while (last + 1 < pts.length && pts[last + 1] <= to) last++;
  return [first, last];
}

// A scene window's bounds (points) as a crop of the clip (pixels: `scale` per point from the region's origin), inside
// the frame of `size`.
export function cropOf(bounds, region, scale, size) {
  const clamp = (v, max) => Math.min(max, Math.max(0, Math.round(v)));
  const x0 = clamp((bounds.x - region.x) * scale, size.width), x1 = clamp((bounds.x + bounds.width - region.x) * scale, size.width);
  const y0 = clamp((bounds.y - region.y) * scale, size.height), y1 = clamp((bounds.y + bounds.height - region.y) * scale, size.height);
  return {x: x0, y: y0, width: x1 - x0, height: y1 - y0};
}

const run = (command, args) => execFileSync(command, args, {encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});

// The clip's size and every frame's presentation time (s), in presentation order (ffprobe). -> {width, height, pts}.
export function probeClip(clip, {exec = run} = {}) {
  const read = JSON.parse(exec('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:frame=best_effort_timestamp_time', '-of', 'json', clip]));
  const pts = (read.frames ?? []).map(f => Number(f.best_effort_timestamp_time));
  if (!read.streams?.[0]?.width || !pts.length || !pts.every(Number.isFinite)) throw new Error(`ffprobe read no video frames with times from ${clip}`);
  return {width: read.streams[0].width, height: read.streams[0].height, pts};
}

// Frames `range` ([first, last] indices, inclusive) of the clip, cropped, as JPEGs named by their index (ffmpeg's
// `select` on the frame number, so the files match ffprobe's order).
export function extractFrames({clip, range: [first, last], crop, dir, target, exec = run}) {
  exec('ffmpeg', ['-v', 'error', '-i', clip, '-vf', `select='between(n,${first},${last})',crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`,
    '-fps_mode', 'passthrough', '-start_number', String(first), '-q:v', '2', join(dir, `${target}-f%06d.jpg`)]);
  const missing = Array.from({length: last - first + 1}, (_, k) => frameFile(target, first + k)).filter(f => !existsSync(join(dir, f)));
  if (missing.length) throw new Error(`ffmpeg wrote ${last - first + 1 - missing.length} of the ${target}'s ${last - first + 1} frames (first missing: ${missing[0]})`);
}

// `clip frames`: from item 1's rows, every frame around each click into the new directory `dir` (outside the repository),
// with frames.json. -> the frames record.
export function writeFrames({rows, dir, exec = run}) {
  if (insideRepository(dir, REPO_ROOT)) throw new Error(`the frames are kept outside the repository (${REPO_ROOT}); only the judged ones are copied in`);
  if (existsSync(dir)) throw new Error(`${dir} exists: give the frames a new directory`);
  const {recording, stop, clicks} = clipEvidence(rows);
  if (!existsSync(recording.clip)) throw new Error(`the clip ${recording.clip} is not there`);
  const sha256 = createHash('sha256').update(readFileSync(recording.clip)).digest('hex');
  if (stop?.sha256 && stop.sha256 !== sha256) throw new Error(`the clip ${recording.clip} is not the one recorded (its SHA-256 differs from the stop's)`);
  const video = probeClip(recording.clip, {exec});
  const scale = video.width / recording.region.width;
  if (Math.abs(video.height / recording.region.height - scale) > 0.02 * scale) throw new Error(`the clip (${video.width} × ${video.height} px) is not the region (${recording.region.width} × ${recording.region.height} pt) at one scale`);
  mkdirSync(dir, {recursive: true, mode: 0o700});
  const targets = {};
  for (const [target, scene] of Object.entries(ORDER_TARGETS)) {
    const click = clicks[target];
    const window = framesWindow({receivedAt: click.meta.receivedAt, spawnAt: recording.spawnAt});
    const range = indexRange(video.pts, ...window);
    if (!range) throw new Error(`the clip has no frames from ${window[0]} s to ${window[1]} s, where the ${target}'s click lies`);
    const crop = cropOf(recording.windows[scene], recording.region, scale, video);
    extractFrames({clip: recording.clip, range, crop, dir, target, exec});
    targets[target] = {scene, click, window, crop,
      frames: Array.from({length: range[1] - range[0] + 1}, (_, k) => ({index: range[0] + k, pts: video.pts[range[0] + k], file: frameFile(target, range[0] + k)}))};
  }
  const record = {clip: recording.clip, sha256, region: recording.region, scale,
    video: {width: video.width, height: video.height, frames: video.pts.length, firstPts: video.pts[0]},
    recording: {spawnAt: recording.spawnAt, readyAt: recording.readyAt ?? null}, targets};
  writeFileSync(join(dir, 'frames.json'), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}

// The order of each target's judged frames ({change, arrival}: frame indices), and the clip put on the request meta's
// clock. -> {join, targets: {target: {change, arrival, framesApart, msApart, order, pass, request}}, pass}.
export function judgeOrder(record, judged, {leadMs = CURSOR_LEAD_MS, startMaxMs = RECORDING_START_MAX_MS} = {}) {
  const frameOf = (target, index) => {
    const frame = record.targets[target]?.frames.find(f => f.index === index);
    if (!frame) throw new Error(`frame ${index} is not among the ${target}'s extracted frames`);
    return frame;
  };
  for (const target of Object.keys(ORDER_TARGETS)) {
    if (!Number.isInteger(judged[target]?.change) || !Number.isInteger(judged[target]?.arrival)) throw new Error(`the ${target}'s change and arrival frames are needed`);
  }
  const first = record.targets['first-target'].click.meta;
  const anchorFrame = frameOf('first-target', judged['first-target'].arrival);
  const anchor = {target: 'first-target', index: anchorFrame.index, pts: anchorFrame.pts, wall: (first.actionInterval?.startedAt ?? first.receivedAt) + leadMs};
  const offsetMs = anchor.wall - anchor.pts * 1000;
  const firstFrameAfterLaunchMs = offsetMs + record.video.firstPts * 1000 - record.recording.spawnAt;
  const problem = firstFrameAfterLaunchMs < -JOIN_SLACK_MS ? `the join puts the clip's first frame ${Math.round(-firstFrameAfterLaunchMs)} ms before its recorder was launched`
    : firstFrameAfterLaunchMs > startMaxMs ? `the join puts the clip's first frame ${Math.round(firstFrameAfterLaunchMs)} ms after its recorder was launched, past the ${startMaxMs} ms a start takes`
      : null;
  const join = {anchor, offsetMs, firstFrameAfterLaunchMs, consistent: problem === null, ...(problem ? {problem} : {})};
  const targets = {};
  for (const target of Object.keys(ORDER_TARGETS)) {
    const {meta, route, label} = record.targets[target].click;
    const event = index => { const f = frameOf(target, index), wallMs = offsetMs + f.pts * 1000; return {index, pts: f.pts, wallMs, sinceReceivedMs: wallMs - meta.receivedAt}; };
    const change = event(judged[target].change), arrival = event(judged[target].arrival);
    const framesApart = arrival.index - change.index;
    const order = framesApart > 1 ? 'before' : framesApart >= -1 ? 'while' : 'after';
    targets[target] = {label, change, arrival, framesApart, msApart: (arrival.pts - change.pts) * 1000, order, pass: order !== 'after',
      request: {receivedAt: meta.receivedAt, engineMs: meta.engineMs ?? null, actionInterval: meta.actionInterval ?? null, route}};
  }
  return {join, targets, pass: Object.values(targets).every(t => t.pass)};
}

const ms = v => `${Math.round(v)} ms`;
// The verdict note of one target's order.
export function orderNote(t, join) {
  const how = t.order === 'while' ? 'while it arrived (within a frame)' : `${t.order} by ${Math.abs(t.framesApart)} frames (${ms(Math.abs(t.msApart))})`;
  return `from the recording's frames: the control changed at frame ${t.change.index} (${t.change.pts.toFixed(3)} s), the arrow's tip reached it at frame ${t.arrival.index} (${t.arrival.pts.toFixed(3)} s): ${how}`
    + `; on the request's clock the change came ${ms(t.change.sinceReceivedMs)} and the arrival ${ms(t.arrival.sinceReceivedMs)} after the engine received the click (its round trip ${t.request.engineMs === null ? 'not kept' : ms(t.request.engineMs)})`
    + (join.consistent ? '' : `; the clock join is not trusted: ${join.problem}`);
}

export function orderMarkdown(judgement, record) {
  const lines = ['# Acceptance 1: each control\'s change against the cursor\'s arrival, from the recording', '',
    `The clip: \`${record.clip}\` (outside the repository), SHA-256 ${record.sha256}, ${record.video.width} × ${record.video.height} px of the region ${record.region.width} × ${record.region.height} pt at (${record.region.x}, ${record.region.y}).`, '',
    'The order is the frames\' own: "while" is within one frame either way. The times after receipt put the clip on the engine\'s clock by the cursor\'s first frame (the first click\'s action start plus the plan\'s 20 ms lead); they support the order and never decide it.', '',
    '| target | change: frame (s) | arrival: frame (s) | order | change after receipt | arrival after receipt | round trip | route |', '|---|---|---|---|---|---|---|---|'];
  for (const [target, t] of Object.entries(judgement.targets)) {
    lines.push(`| ${target} (${t.label}) | ${t.change.index} (${t.change.pts.toFixed(3)}) | ${t.arrival.index} (${t.arrival.pts.toFixed(3)}) | ${t.order}${t.order === 'while' ? '' : ` by ${Math.abs(t.framesApart)} frames, ${ms(Math.abs(t.msApart))}`} | ${ms(t.change.sinceReceivedMs)} | ${ms(t.arrival.sinceReceivedMs)} | ${t.request.engineMs === null ? '–' : ms(t.request.engineMs)} | ${t.request.route ?? '–'} |`);
  }
  lines.push('', judgement.join.consistent
    ? `The join puts the clip's first frame ${ms(judgement.join.firstFrameAfterLaunchMs)} after its recorder was launched.`
    : `The clock join is not trusted: ${judgement.join.problem}. The order above stands; the times after receipt do not.`, '');
  return lines.join('\n');
}

// `clip order`: the judgement from <dir>/frames.json and the judged frames, into <out>: item-1-order.json and .md, the
// judged frames and the one before each copied into item-1-frames/, and one verdict per target appended. -> the judgement.
export function writeOrder({dir, out, judged, now = () => new Date().toISOString()}) {
  const record = JSON.parse(readFileSync(join(dir, 'frames.json'), 'utf8'));
  const judgement = judgeOrder(record, judged);
  writeFileSync(join(out, 'item-1-order.json'), `${JSON.stringify({clip: record.clip, sha256: record.sha256, judged, ...judgement}, null, 2)}\n`);
  writeFileSync(join(out, 'item-1-order.md'), orderMarkdown(judgement, record));
  const kept = join(out, 'item-1-frames');
  rmSync(kept, {recursive: true, force: true});
  mkdirSync(kept, {recursive: true});
  for (const [target, t] of Object.entries(judgement.targets)) {
    for (const [role, index] of [['change', t.change.index], ['before-change', t.change.index - 1], ['arrival', t.arrival.index], ['before-arrival', t.arrival.index - 1]]) {
      const frame = record.targets[target].frames.find(f => f.index === index);
      if (frame) copyFileSync(join(dir, frame.file), join(kept, `${target}-${role}-f${String(index).padStart(6, '0')}.jpg`));
    }
    appendFileSync(join(out, 'verdicts.jsonl'), `${JSON.stringify({item: '1', id: `order-${target}`, verdict: t.pass ? 'pass' : 'fail', note: orderNote(t, judgement.join), at: now()})}\n`);
  }
  return judgement;
}
