// A timing series' signposts, streamed while it runs (#235's task-8 report). `log show` after a series lost its start
// at the second sitting (signposts-13 began 10 minutes after its judged run; item 12 kept 27 of 40 samples), and even
// seconds-old WindowServer FrameUpdate signposts go missing from it, while `log stream --signpost` (plain `log stream`
// carries none) delivered every one of a scratch signposter's 4,700 a second. So two `log stream --signpost` processes
// run from before the series' first step to after its last, the same on both sides: the engine's timing signposts go
// to the item's file, WindowServer's FrameUpdate times are kept in memory (their lines are about 1.7 kB each, at up to
// 120 a second). `signpostCoverage` then checks every sample against the engine's signposts, so a series whose
// signposts do not cover it reads incomplete, never silently short.
import {spawn as nodeSpawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {FRAME_UPDATE_PREDICATE} from './frames.mjs';

export const ENGINE_PREDICATE = 'subsystem == "io.github.ssfskim.cua.engine" AND category == "timing"';
export const STREAM_READY_MS = 10_000;

// A `log` timestamp ("2026-10-31 10:10:19.681911-0700") as epoch milliseconds, fractions kept; null if unreadable.
export function logTimestampMs(text) {
  const m = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d+))?([+-]\d{2})(\d{2})$/.exec(text ?? '');
  if (!m) return null;
  const whole = Date.parse(`${m[1]}T${m[2]}${m[4]}:${m[5]}`);
  return Number.isNaN(whole) ? null : whole + (m[3] ? Number(`0.${m[3]}`) * 1000 : 0);
}

// One `log stream --signpost` with `predicate`: each complete line to `line`. -> {ready: Promise<boolean>, stop}.
function stream(predicate, line, {spawn, readyMs}) {
  const child = spawn('/usr/bin/log', ['stream', '--signpost', '--style', 'ndjson', '--predicate', predicate], {stdio: ['ignore', 'pipe', 'pipe']});
  let buffer = '', started = false, stopping = false, ended = null, stderr = '';
  let markReady;
  const ready = new Promise(resolve => { markReady = resolve; });
  const timer = setTimeout(() => markReady(false), readyMs);
  child.stdout.setEncoding?.('utf8');
  child.stdout.on('data', chunk => {
    buffer += chunk;
    let k;
    while ((k = buffer.indexOf('\n')) >= 0) {
      const text = buffer.slice(0, k);
      buffer = buffer.slice(k + 1);
      // log stream's first line says what it filters with: from then on it delivers.
      if (!started) { started = true; clearTimeout(timer); markReady(true); }
      if (text.startsWith('{')) line(text);
    }
  });
  child.stderr?.on('data', chunk => { stderr += chunk; });
  const exited = new Promise(resolve => child.on('exit', code => { ended = {code, stopping}; clearTimeout(timer); markReady(started); resolve(); }));
  child.on('error', error => { stderr += error.message; ended ??= {code: null, stopping}; markReady(false); });
  return {
    ready,
    // -> {ok, error?}: ok when it started and ran until asked to stop.
    stop: async () => {
      stopping = true;
      if (ended === null) { child.kill('SIGINT'); await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]); }
      if (!started) return {ok: false, error: `log stream did not start within ${readyMs / 1000} s${stderr ? ` (${stderr.trim().split('\n')[0]})` : ''}`};
      if (ended && !ended.stopping) return {ok: false, error: `log stream ended before the series did (exit ${ended.code})`};
      return {ok: true};
    },
  };
}

// Starts both streams and waits until each delivers (or `readyMs` passes). -> {started, frameTimes(), stop()}:
// `frameTimes()` the FrameUpdate times so far, in order; `stop()` -> {engine: {ok, error?}, frames: {ok, error?, times}}.
export async function startSignpostStreams({engineFile, spawn = nodeSpawn, readyMs = STREAM_READY_MS}) {
  const file = createWriteStream(engineFile);
  const times = [];
  const engine = stream(ENGINE_PREDICATE, text => file.write(`${text}\n`), {spawn, readyMs});
  const frames = stream(FRAME_UPDATE_PREDICATE, text => {
    try {
      const e = JSON.parse(text);
      if (e.signpostName === 'FrameUpdate' && e.subsystem === 'com.apple.SkyLight' && e.category === 'tracing' && Number.isFinite(e.machTimestamp)) times.push(e.machTimestamp);
    } catch {}
  }, {spawn, readyMs});
  const started = (await Promise.all([engine.ready, frames.ready])).every(Boolean);
  const sorted = () => [...times].sort((a, b) => a - b);
  return {
    started,
    frameTimes: sorted,
    stop: async () => {
      const [e, f] = await Promise.all([engine.stop(), frames.stop()]);
      await new Promise(resolve => file.end(resolve));
      return {engine: e, frames: {...f, times: sorted()}};
    },
  };
}

// Whether the engine's signposts in `text` (ndjson) cover the item's samples in `rows` (its last attempt): each sample
// whose cell answered, on either side, made engine requests between the row before it and its own row, so it is
// covered when an engine signpost falls there. -> {complete, samples, covered, missing: [{side, i}], first, last, why?}.
export function signpostCoverage(text, rows) {
  const stamps = text.split('\n').flatMap(line => {
    if (!line.startsWith('{')) return [];
    try { const ms = logTimestampMs(JSON.parse(line).timestamp); return ms === null ? [] : [ms]; } catch { return []; }
  }).sort((a, b) => a - b);
  const windows = rows.flatMap((row, k) => (row.kind === 'cell' && row.ok && row.sample && k > 0 ? [{from: rows[k - 1].at, to: row.at, sample: row.sample}] : []));
  const missing = windows.filter(w => !stamps.some(t => t > w.from && t <= w.to)).map(w => ({side: w.sample.side, i: w.sample.i}));
  const first = stamps[0] ?? null, last = stamps.at(-1) ?? null;
  const result = {complete: windows.length > 0 && missing.length === 0, samples: windows.length, covered: windows.length - missing.length, missing, first, last};
  if (result.complete) return result;
  if (!windows.length) return {...result, why: 'the series has no answered sample'};
  if (!stamps.length) return {...result, why: `no engine signpost was kept for any of its ${windows.length} samples`};
  const late = first > windows[0].from ? `; the first signpost is ${((first - windows[0].from) / 1000).toFixed(1)} s after the series' first sample began` : '';
  return {...result, why: `${missing.length} of ${windows.length} samples have no engine signpost${late}`};
}
