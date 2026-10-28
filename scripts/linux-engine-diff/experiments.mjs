// M0's measurements for the Retention paragraph (Design, Retention and the fixed waits), on harness-owned windows:
//
// - capture-readiness: how long after RedirectWindow the first GetImage shows the window's real contents, with the
//   window fully covered and with it visible, and what a poll for two consecutive equal captures would see at each
//   interval (the readiness condition that replaces the fixed wait).
// - key-pace: whether a toolkit drops or reorders keys sent faster than the pinned build's 33 ms per key edge, and
//   with no teardown wait: bursts of pipelined press_key requests to gedit and to Chrome, read back through the tree.
//
// Whether background input needs retention at all is measured by the differential run itself (`--variant` with
// `--retention none`, under `--occlusion covered` and `visible`), where every input's effect is read back, and per
// application family by the matrix (`cua:none`).
//
// M0.4 runs both per family (`--family`, families.mjs; without it, gedit and Chrome as M0.3 ran them), the
// readiness once more with every core busy (`--load`), and adds the matrix (`--experiment matrix`, matrix.mjs).

import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { availableParallelism, loadavg } from 'node:os';
import { join } from 'node:path';

import { Engine } from './engine.mjs';
import { familyNames, openFamily, readText } from './families.mjs';
import { matrixMarkdown, runMatrix } from './matrix.mjs';
import { Oracle } from './oracle.mjs';
import { qtBridge } from './qt-bridge.mjs';
import { analyzeTrial } from './readiness.mjs';
import { writeSummary } from './report.mjs';
import { Desktop, GEOMETRY, XPROBE } from './scenes.mjs';
import { median } from './stats.mjs';

/** The fixed wait before a window's first capture (Decision Log, M0.3), and the margin M0.4 holds it to. */
export const CAPTURE_WAIT_MS = 40;
export const CAPTURE_RAISE_ABOVE_MS = 30;

const POLLS = [1, 2, 5, 10, 20];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (v) => (v === null ? null : Math.round(v * 10) / 10);
const pct = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] : null;
};

function retentionTrials(window, trials, spanMs, gapMs, dump) {
  const text = execFileSync(XPROBE, ['retention', String(window), String(trials), String(spanMs), String(gapMs), dump], { encoding: 'utf8', timeout: 600000 });
  return text.trim().split('\n').map((l) => JSON.parse(l));
}

/** How many interim (pre-ready) captures were mostly black, of all interim captures. */
function interim(analyzed) {
  const all = analyzed.flatMap((a) => a.black_before_ready);
  return all.length ? `${all.filter((b) => b > 0.5).length}/${all.length}` : 'none';
}

/**
 * The windows an experiment measures: each family's (opened one at a time, closed after), or M0.3's gedit and Chrome
 * scene windows.
 */
function sources(desktop, families, role, defaults) {
  if (!families?.length) return defaults;
  const oracle = new Oracle();
  return familyNames(families).map((name) => ({ name, open: () => openFamily(desktop, oracle, name, role), close: true, oracle }));
}

/** The readiness's maximum against the fixed wait: the margin, and whether it is under the line that raises it. */
export function captureMargin(readyMs, { wait = CAPTURE_WAIT_MS, line = CAPTURE_RAISE_ABOVE_MS } = {}) {
  const max = Math.max(...readyMs);
  return { max_ms: Math.round(max * 10) / 10, margin_ms: Math.round((wait - max) * 10) / 10, over_line: max > line };
}

async function captureReadiness(desktop, emit, { families, trials = 20, spanMs = 400, gapMs = 400 } = {}) {
  const md = ['| window | condition | trials | ready median ms | ready p90 ms | ready max ms | real before redirect | real at span end | interim captures mostly black | ' + POLLS.map((p) => `poll ${p} ms: stop median / premature`).join(' | ') + ' |'];
  md.push(`|---|---|---:|---:|---:|---:|---|---|---|${POLLS.map(() => '---').join('|')}|`);
  const rowsMd = [];
  const notes = [];
  const list = sources(desktop, families, 'capture', [
    { name: 'gedit', open: () => desktop.openGedit('capture', 'cua171 capture readiness\nline two\n') },
    { name: 'chrome', open: () => desktop.openChrome('capture', 'scene.html') },
  ]);
  await desktop.openFront('visible');
  const all = [];
  for (const source of list) {
    const scene = await source.open();
    scene.name = source.name;
    const width = scene.window?.width ?? GEOMETRY[scene.kind][0];
    const truth = {};
    for (const condition of ['visible', 'covered']) {
      desktop.arrangeFront(condition);
      if (condition === 'visible') desktop.raise(scene);
      await sleep(800);
      const raw = retentionTrials(scene.id, trials, spanMs, gapMs, join(desktop.dir, `${scene.name}-${condition}`));
      const analyzed = raw.map((t) => analyzeTrial(t, { pollMs: POLLS }));
      // the window's real contents: what it shows visible and redirected, at the end of every visible trial
      if (condition === 'visible') truth.hash = analyzed.every((a) => a.final === analyzed[0].final) ? analyzed[0].final : null;
      for (const [i, a] of analyzed.entries()) {
        emit({ kind: 'experiment', experiment: 'capture-readiness', window: scene.name, condition, trial: i, samples: raw[i].samples, ...a, real_at_end: truth.hash ? a.final === truth.hash : null });
      }
      const ready = analyzed.map((a) => a.ready_ms);
      all.push(...ready.map((ms) => ({ window: scene.name, condition, ms })));
      const cells = POLLS.map((p) => {
        const stops = analyzed.map((a) => a.polls[p].consecutive_equal_ms).filter((v) => v !== null);
        return `${r1(median(stops))} / ${analyzed.filter((a) => a.polls[p].premature).length}`;
      });
      rowsMd.push(`| ${scene.name} | ${condition} | ${analyzed.length} | ${r1(median(ready))} | ${r1(pct(ready, 90))} | ${r1(Math.max(...ready))} | ${analyzed.filter((a) => a.equal_before).length}/${analyzed.length} | ${truth.hash ? `${analyzed.filter((a) => a.final === truth.hash).length}/${analyzed.length}` : 'no stable truth'} | ${interim(analyzed)} | ${cells.join(' | ')} |`);
    }
    const last = trials - 1;
    const d = pixelDifference(join(desktop.dir, `${scene.name}-visible-${last}.bgr`), join(desktop.dir, `${scene.name}-covered-${last}.bgr`), width);
    emit({ kind: 'experiment', experiment: 'capture-readiness', window: scene.name, covered_vs_visible: d });
    notes.push(`- ${scene.name}: the covered window's final capture differs from the visible one's in ${d.pixels} of ${d.of} pixels${d.bbox ? ` (box ${d.bbox.join(',')}, largest channel difference ${d.max})` : ''}`);
    if (source.close) await desktop.close([scene]);
  }
  const margin = captureMargin(all.map((r) => r.ms));
  const worst = all.reduce((a, b) => (b.ms > a.ms ? b : a));
  emit({ kind: 'experiment', experiment: 'capture-readiness', margin, worst });
  notes.push(`- **the slowest real contents: ${margin.max_ms} ms after RedirectWindow (${worst.window}, ${worst.condition}); against the fixed ${CAPTURE_WAIT_MS} ms wait the margin is ${margin.margin_ms} ms${margin.over_line ? `, over the ${CAPTURE_RAISE_ABOVE_MS} ms line: the wait must be raised` : ''}**`);
  return [...md, ...rowsMd, '', ...notes];
}

/** Differing pixels between two raw colour captures of one window, with their bounding box. */
export function pixelDifference(a, b, width) {
  const x = readFileSync(a);
  const y = readFileSync(b);
  let pixels = 0;
  let max = 0;
  let bbox = null;
  for (let i = 0; i + 2 < Math.min(x.length, y.length); i += 3) {
    const diff = Math.max(Math.abs(x[i] - y[i]), Math.abs(x[i + 1] - y[i + 1]), Math.abs(x[i + 2] - y[i + 2]));
    if (diff === 0) continue;
    pixels += 1;
    max = Math.max(max, diff);
    const p = i / 3;
    const px = p % width;
    const py = Math.floor(p / width);
    bbox = bbox ? [Math.min(bbox[0], px), Math.min(bbox[1], py), Math.max(bbox[2], px), Math.max(bbox[3], py)] : [px, py, px, py];
  }
  return { pixels, of: Math.floor(Math.min(x.length, y.length) / 3), max, bbox, sizes_equal: x.length === y.length };
}

/**
 * The text a burst added to gedit's document. The scratch document's caret starts at 0 and every burst types at
 * the caret, so the document is everything typed so far followed by the original text.
 */
export function typedByBurst(before, after, originalLength) {
  return after.slice(before.length - originalLength, after.length - originalLength);
}

export const BURSTS = {
  letters: { keys: 'abcdefghijklmnopqrst'.split(''), expected: 'abcdefghijklmnopqrst' },
  chords: { keys: Array.from({ length: 10 }, (_, i) => (i % 2 ? 'shift+b' : 'c')), expected: 'cBcBcBcBcB' },
};

/** Reads until two reads 150 ms apart agree (an occluded Chrome page updates its tree late), at most 5 s. */
async function settled(read) {
  const started = Date.now();
  let previous = await read();
  for (;;) {
    await sleep(150);
    const now = await read();
    if (now === previous || Date.now() - started > 5000) return { value: now, ms: Date.now() - started };
    previous = now;
  }
}

// [key pace, teardown]: the pinned build's waits, then each lowered alone and together
const PACE_CONFIGS = [
  [33, 100],
  [33, 0],
  [8, 0],
  [0, 100],
  [0, 50],
  [0, 33],
  [0, 20],
  [0, 10],
  [0, 0],
];

/**
 * What a window's bursts need, from its runs: whether every burst arrived at 0 ms pacing with the 100 ms teardown,
 * and the lowest teardown (at 0 ms pacing) from which every burst arrived at it and at every longer one.
 */
export function paceVerdict(runs) {
  const at = (pace, teardown) => runs.filter((r) => r.key_pace_ms === pace && r.teardown_ms === teardown);
  const allOk = (rows) => rows.length > 0 && rows.every((r) => r.ok);
  const lost = (rows) => rows.filter((r) => !r.ok).length;
  const teardowns = [...new Set(runs.filter((r) => r.key_pace_ms === 0).map((r) => r.teardown_ms))].sort((a, b) => b - a);
  let lowest = null;
  for (const t of teardowns) {
    if (!allOk(at(0, t))) break;
    lowest = t;
  }
  return {
    pace0_with_teardown100: allOk(at(0, 100)),
    lowest_teardown_ms: lowest,
    failed_at_pace0_teardown100: lost(at(0, 100)),
    failed_at_pace33_teardown100: lost(at(33, 100)),
  };
}

async function keyPace(desktop, emit, cua, { families, reps = 3 } = {}) {
  const md = ['| window | burst | key pace ms | teardown ms | runs | all keys arrived in order | median burst ms |', '|---|---|---:|---:|---:|---|---:|'];
  const notes = [];
  const original = 'cua171 key pace';
  // M0.3's windows: gedit's document, typed at its caret ahead of the original text, and the scene page's typed
  // sequence, cleared with Escape before each burst. A family's: its own text, typed at the caret at its start, into
  // its empty field, or appended by its terminal, which typedByBurst reads alike.
  const list = sources(desktop, families, 'keys', [
    { name: 'gedit', open: () => desktop.openGedit('keys', `${original}\n`), read: (scene) => desktop.geditText(scene) },
    { name: 'chrome', open: () => desktop.openChrome('keys', 'scene.html'), read: (scene) => desktop.chromeCounters(scene).then((c) => c.seq), resetWithEscape: true },
  ]);
  await desktop.openFront('covered');
  for (const source of list) {
    const scene = await source.open();
    desktop.arrangeFront('covered');
    await sleep(500);
    const read = source.read ?? ((s) => readText(desktop, source.oracle, s));
    const originalLength = source.resetWithEscape ? 0 : (await read(scene)).length;
    const rows = [];
    for (const [name, burst] of Object.entries(BURSTS)) {
      for (const [pace, teardown] of PACE_CONFIGS) {
        const runs = [];
        for (let rep = 0; rep < reps; rep++) {
          if (source.resetWithEscape) {
            // the page clears its typed sequence on Escape, sent with the vendor's waits
            const reset = new Engine({ label: 'reset', bin: cua }).start();
            await reset.request('press_key', { window: { id: scene.id }, key: 'Escape' });
            await reset.close();
            if ((await settled(() => read(scene))).value !== '') throw new Error('the scene page did not clear its sequence');
          }
          const before = (await settled(() => read(scene))).value;
          const engine = new Engine({ label: 'cua', bin: cua, args: ['--key-pace-ms', String(pace), '--teardown-ms', String(teardown)] }).start();
          const { responses, ms } = await engine.pipeline(burst.keys.map((key) => ({ command: 'press_key', input: { window: { id: scene.id }, key } })));
          await engine.close();
          const after = await settled(() => read(scene));
          let got = null;
          if (before !== null && after.value !== null) got = source.resetWithEscape ? after.value : typedByBurst(before, after.value, originalLength);
          const ok = responses.every((r) => r.ok) && got === burst.expected;
          runs.push({ ok, ms });
          const row = { kind: 'experiment', experiment: 'key-pace', window: source.name, burst: name, key_pace_ms: pace, teardown_ms: teardown, rep, answered_ok: responses.every((r) => r.ok), arrived: got, expected: burst.expected, ok, burst_ms: Math.round(ms), settled_ms: after.ms };
          rows.push(row);
          emit(row);
        }
        md.push(`| ${source.name} | ${name} | ${pace} | ${teardown} | ${runs.length} | ${runs.filter((r) => r.ok).length}/${runs.length} | ${Math.round(median(runs.map((r) => r.ms)))} |`);
      }
    }
    const verdict = paceVerdict(rows);
    emit({ kind: 'experiment', experiment: 'key-pace', window: source.name, verdict });
    const pace = verdict.pace0_with_teardown100
      ? 'every burst arrived at 0 ms pacing with the 100 ms teardown'
      : `**${verdict.failed_at_pace0_teardown100} bursts lost or misordered keys at 0 ms pacing with the 100 ms teardown** (${verdict.failed_at_pace33_teardown100} at the pinned build's 33 ms)`;
    notes.push(`- ${source.name}: ${pace}; the lowest teardown with every burst arriving at it and above: ${verdict.lowest_teardown_ms ?? 'none'} ms`);
    if (source.close) await desktop.close([scene]);
  }
  return [...md, '', ...notes];
}

function gitHead() {
  try {
    return execFileSync('git', ['-C', import.meta.dirname, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/** Every core busy for the experiment's length (`--load`): stress-ng, one CPU worker per core, ended after. */
function startLoad(emit) {
  const cores = availableParallelism();
  const child = spawn('stress-ng', ['--cpu', String(cores), '--cpu-method', 'matrixprod', '--timeout', '3h', '--quiet'], { stdio: 'ignore', detached: true });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  emit({ kind: 'load', started: true, cores, pid: child.pid, loadavg_before: loadavg() });
  execFileSync('sleep', ['5']);
  emit({ kind: 'load', loadavg_running: loadavg() });
  return {
    async stop() {
      emit({ kind: 'load', loadavg_at_end: loadavg() });
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        // already ended
      }
      await exited;
      emit({ kind: 'load', stopped: true });
    },
  };
}

export async function runExperiment(args) {
  const run = args.run ?? `${args.experiment}-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`;
  mkdirSync(args.out, { recursive: true });
  const results = join(args.out, 'results.jsonl');
  const emit = (row) => appendFileSync(results, `${JSON.stringify({ run, ...row })}\n`);
  emit({ kind: 'meta', experiment: args.experiment, commit: gitHead(), cua_version: execFileSync(args.cua, ['--version'], { encoding: 'utf8' }).trim(), families: args.families, load: args.load, started: new Date().toISOString() });
  const desktop = new Desktop({ cua: args.cua, run });
  const load = args.load ? startLoad(emit) : null;
  let md;
  try {
    if (args.experiment === 'capture-readiness') md = await captureReadiness(desktop, emit, { families: args.families });
    else if (args.experiment === 'key-pace') md = await keyPace(desktop, emit, args.cua, { families: args.families });
    else if (args.experiment === 'qt-bridge') md = await qtBridge(desktop, emit, { vendor: args.vendor });
    else if (args.experiment === 'matrix') {
      await runMatrix(args, { desktop, emit, run });
      const rows = readFileSync(results, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.run === run);
      md = matrixMarkdown(rows);
    } else throw new Error(`unknown experiment ${args.experiment}`);
  } finally {
    await desktop.closeAll();
    if (load) await load.stop();
  }
  emit({ kind: 'experiment-summary', markdown: md, finished: new Date().toISOString() });
  process.stdout.write(`${md.join('\n')}\n`);
  writeSummary(args.out);
  return true;
}
