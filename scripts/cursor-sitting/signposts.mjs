// A timing series' signposts, kept while it runs (#235's task-8 report). `log show` once a series ended lost its start
// at the second sitting (signposts-13 began 10 minutes after its judged run; item 12 kept 27 of 40 samples): under a
// load of about 2,400 signpost lines a second the store kept about 3 minutes (measured on the MacBook). A live
// `log stream --signpost` delivers everything (plain `log stream` carries none), but it makes every signpost cost its
// emitter about 80 µs instead of 2 (measured, 1,200 intervals a second): far too much to run under timed samples, where
// the cursor-on side emits more of them. So the engine's signposts are read in chunks while the series runs, `log show`
// over the last CHUNK_PERIOD_MS plus an overlap every CHUNK_PERIOD_MS, well inside what the store keeps, de-duplicated at
// the chunk edges, the same on both sides. A FrameUpdate stream (`startFrameStream`) runs only for the fps60 cap's
// proof, before any session opens. `signpostCoverage` then checks every sample against the engine's requests, so a
// series whose signposts do not cover it reads incomplete, never silently short.
import {execFile, spawn as nodeSpawn} from 'node:child_process';
import {createWriteStream} from 'node:fs';
import {FRAME_UPDATE_PREDICATE} from './frames.mjs';

export const ENGINE_PREDICATE = 'subsystem == "io.github.ssfskim.cua.engine" AND category == "timing"';
export const STREAM_READY_MS = 10_000;
// The chunks: a read every 20 s of the last 20 s and 10 s before it, against a store that keeps about 3 minutes under load.
export const CHUNK_PERIOD_MS = 20_000, CHUNK_OVERLAP_MS = 10_000;

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
  child.on('exit', code => { ended = {code, stopping}; clearTimeout(timer); markReady(started); });
  // `exit` can come before stdout is drained; `close` comes once it has ended, so the last lines are in.
  const closed = new Promise(resolve => child.on('close', resolve));
  child.on('error', error => { stderr += error.message; ended ??= {code: null, stopping}; markReady(false); });
  return {
    ready,
    // -> {ok, error?}: ok when it started and ran until asked to stop.
    stop: async () => {
      stopping = true;
      if (ended === null) child.kill('SIGINT');
      let bound;
      await Promise.race([closed, new Promise(resolve => { bound = setTimeout(resolve, 5000); })]);
      clearTimeout(bound);
      if (!started) return {ok: false, error: `log stream did not start within ${readyMs / 1000} s${stderr ? ` (${stderr.trim().split('\n')[0]})` : ''}`};
      if (ended && !ended.stopping) return {ok: false, error: `log stream ended before the series did (exit ${ended.code})`};
      return {ok: true};
    },
  };
}

// A FrameUpdate stream, for the fps60 cap's proof only, waited on until it delivers (or `readyMs` passes).
// -> {started, frameTimes(), stop() -> {ok, error?, times}}: the times so far, in order.
export async function startFrameStream({spawn = nodeSpawn, readyMs = STREAM_READY_MS} = {}) {
  const times = [];
  const frames = stream(FRAME_UPDATE_PREDICATE, text => {
    try {
      const e = JSON.parse(text);
      if (e.signpostName === 'FrameUpdate' && e.subsystem === 'com.apple.SkyLight' && e.category === 'tracing' && Number.isFinite(e.machTimestamp)) times.push(e.machTimestamp);
    } catch {}
  }, {spawn, readyMs});
  const started = await frames.ready;
  const sorted = () => [...times].sort((a, b) => a - b);
  return {started, frameTimes: sorted, stop: async () => ({...(await frames.stop()), times: sorted()})};
}

const logDate = date => {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
// The engine's timing signposts from `start` to `end` (Dates, a second's resolution, widened by one each way).
export const readEngineWindow = (start, end) => new Promise((resolve, reject) => execFile('/usr/bin/log',
  ['show', '--signpost', '--style', 'ndjson', '--start', logDate(new Date(+start - 1000)), '--end', logDate(new Date(+end + 1000)), '--predicate', ENGINE_PREDICATE],
  {encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 60_000}, (error, stdout) => (error ? reject(error) : resolve(stdout))));

// The engine's signposts read in chunks while a series runs, into `engineFile`: from `since` on, every `periodMs` the
// span from the last read's end less `overlapMs` to now, each line kept once (by its time, process, signpost id, type
// and name). A read that fails is said and the next one starts where it would have. -> {stop() -> {ok, reads,
// failures: [message]}}: `stop` reads once more, up to now, then closes the file.
export function startSignpostChunks({engineFile, since = new Date(), periodMs = CHUNK_PERIOD_MS, overlapMs = CHUNK_OVERLAP_MS, read = readEngineWindow, now = () => new Date()}) {
  const file = createWriteStream(engineFile);
  const seen = new Map();  // line key -> its time (ms), for the overlap only
  let from = since, reads = 0, timer = null, stopped = false, running = Promise.resolve();
  const failures = [];
  const chunk = async () => {
    const until = now(), start = new Date(+from - overlapMs);
    let text;
    try { text = await read(start, until); } catch (error) { failures.push(String(error.message).split('\n')[0]); return; }
    reads++;
    for (const line of text.split('\n')) {
      if (!line.startsWith('{')) continue;
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      const key = `${e.machTimestamp}|${e.processID}|${e.signpostID}|${e.signpostType}|${e.signpostName}`;
      if (seen.has(key)) continue;
      seen.set(key, logTimestampMs(e.timestamp) ?? +until);
      file.write(`${line}\n`);
    }
    for (const [key, ms] of seen) if (ms < +start - overlapMs) seen.delete(key);
    from = until;
  };
  const schedule = () => { timer = setTimeout(() => { running = chunk().then(() => { if (!stopped) schedule(); }); }, periodMs); };
  schedule();
  return {
    stop: async () => {
      stopped = true;
      clearTimeout(timer);
      await running;
      await chunk();
      await new Promise(resolve => file.end(resolve));
      return {ok: failures.length === 0, reads, failures};
    },
  };
}

// Runs `run` (the series) with its engine signposts read in chunks into `engineFile` throughout; nothing streams.
// -> {result: run's, signposts: the chunks' outcome}.
export async function keepSeriesSignposts({engineFile, run, read = readEngineWindow, since = new Date(Date.now() - 1000)}) {
  const chunks = startSignpostChunks({engineFile, since, read});
  let result, signposts;
  try { result = await run(); } finally { signposts = await chunks.stop(); }
  return {result, signposts};
}

// The engine method each timed series calls (Methods.swift's dispatch).
export const SERIES_METHODS = Object.freeze({'coordinate click': 'click', 'element click': 'click', drag: 'drag', type_text: 'type_text', 'press_key x30': 'press_key'});

// Whether the engine's signposts in `text` (ndjson) cover the item's samples in `rows` (its last attempt): every sample
// whose cell answered, on either side, is covered when, for each series it times, a `request` interval of that method
// began inside its own cell (from its `startedAt` to its row's `at`). The waits between cells have no row, and a visible
// cursor's own signposts (its window-state reads) run through them, so only the cell's own requests count. A row from
// before cells kept their start falls back to the row before it. The signposts carry no connection, so the match is by
// method and time. -> {complete, samples, covered, missing: [{side, i}], first, last, why?}.
export function signpostCoverage(text, rows) {
  const all = [], requests = [];
  for (const line of text.split('\n')) {
    if (!line.startsWith('{')) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const ms = logTimestampMs(e.timestamp);
    if (ms === null) continue;
    all.push(ms);
    if (e.signpostName === 'request' && e.signpostType === 'begin') requests.push({ms, method: e.eventMessage});
  }
  all.sort((a, b) => a - b);
  const windows = rows.flatMap((row, k) => (row.kind === 'cell' && row.ok && row.sample && k > 0
    ? [{from: row.startedAt ?? rows[k - 1].at, to: row.at, sample: row.sample,
      methods: [...new Set((row.sample.series ? [row.sample.series] : row.sample.covers ?? []).map(series => SERIES_METHODS[series]).filter(Boolean))]}] : []));
  // A sample that names no series (a record from before samples named theirs) needs a request of any method.
  const inside = (w, method) => requests.some(r => (method === null || r.method === method) && r.ms >= w.from && r.ms <= w.to);
  const covered = w => (w.methods.length ? w.methods.every(method => inside(w, method)) : inside(w, null));
  const missing = windows.filter(w => !covered(w)).map(w => ({side: w.sample.side, i: w.sample.i}));
  const first = all[0] ?? null, last = all.at(-1) ?? null;
  const result = {complete: windows.length > 0 && missing.length === 0, samples: windows.length, covered: windows.length - missing.length, missing, first, last};
  if (result.complete) return result;
  if (!windows.length) return {...result, why: 'the series has no answered sample'};
  if (!all.length) return {...result, why: `no engine signpost was kept for any of its ${windows.length} samples`};
  const late = first > windows[0].from ? `; the first signpost is ${((first - windows[0].from) / 1000).toFixed(1)} s after the series' first sample began` : '';
  return {...result, why: `${missing.length} of ${windows.length} samples have no request signpost of their own${late}`};
}
