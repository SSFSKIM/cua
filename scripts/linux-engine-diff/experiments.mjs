// M0's measurements for the Retention paragraph (Design, Retention and the fixed waits), on harness-owned windows:
//
// - capture-readiness: how long after RedirectWindow the first GetImage shows the window's real contents, with the
//   window fully covered and with it visible, and what a poll for two consecutive equal captures would see at each
//   interval (the readiness condition that replaces the fixed wait).
// - key-pace: whether a toolkit drops or reorders keys sent faster than the pinned build's 33 ms per key edge, and
//   with no teardown wait: bursts of pipelined press_key requests to gedit and to Chrome, read back through the tree.
//
// Whether background input needs retention at all is measured by the differential run itself (`--variant` with
// `--retention none`, under `--occlusion covered` and `visible`), where every input's effect is read back.

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Engine } from './engine.mjs';
import { analyzeTrial } from './readiness.mjs';
import { writeSummary } from './report.mjs';
import { Desktop, XPROBE } from './scenes.mjs';
import { median } from './stats.mjs';

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

async function captureReadiness(desktop, emit, { trials = 20, spanMs = 400, gapMs = 400 } = {}) {
  const md = ['| window | condition | trials | ready median ms | ready p90 ms | ready max ms | real before redirect | real at span end | interim captures mostly black | ' + POLLS.map((p) => `poll ${p} ms: stop median / premature`).join(' | ') + ' |'];
  md.push(`|---|---|---:|---:|---:|---:|---|---|---|${POLLS.map(() => '---').join('|')}|`);
  const rowsMd = [];
  const notes = [];
  const scenes = [await desktop.openGedit('capture', 'cua171 capture readiness\nline two\n'), await desktop.openChrome('capture', 'scene.html')];
  await desktop.openFront('visible');
  for (const scene of scenes) {
    const truth = {};
    for (const condition of ['visible', 'covered']) {
      desktop.arrangeFront(condition);
      if (condition === 'visible') desktop.raise(scene);
      await sleep(800);
      const raw = retentionTrials(scene.id, trials, spanMs, gapMs, join(desktop.dir, `${scene.kind}-${condition}`));
      const analyzed = raw.map((t) => analyzeTrial(t, { pollMs: POLLS }));
      // the window's real contents: what it shows visible and redirected, at the end of every visible trial
      if (condition === 'visible') truth.hash = analyzed.every((a) => a.final === analyzed[0].final) ? analyzed[0].final : null;
      for (const [i, a] of analyzed.entries()) {
        emit({ kind: 'experiment', experiment: 'capture-readiness', window: scene.kind, condition, trial: i, samples: raw[i].samples, ...a, real_at_end: truth.hash ? a.final === truth.hash : null });
      }
      const ready = analyzed.map((a) => a.ready_ms);
      const cells = POLLS.map((p) => {
        const stops = analyzed.map((a) => a.polls[p].consecutive_equal_ms).filter((v) => v !== null);
        return `${r1(median(stops))} / ${analyzed.filter((a) => a.polls[p].premature).length}`;
      });
      rowsMd.push(`| ${scene.kind} | ${condition} | ${analyzed.length} | ${r1(median(ready))} | ${r1(pct(ready, 90))} | ${r1(Math.max(...ready))} | ${analyzed.filter((a) => a.equal_before).length}/${analyzed.length} | ${truth.hash ? `${analyzed.filter((a) => a.final === truth.hash).length}/${analyzed.length}` : 'no stable truth'} | ${interim(analyzed)} | ${cells.join(' | ')} |`);
    }
    const last = trials - 1;
    const d = pixelDifference(join(desktop.dir, `${scene.kind}-visible-${last}.bgr`), join(desktop.dir, `${scene.kind}-covered-${last}.bgr`), scene.kind === 'chrome' ? 1050 : 910);
    emit({ kind: 'experiment', experiment: 'capture-readiness', window: scene.kind, covered_vs_visible: d });
    notes.push(`- ${scene.kind}: the covered window's final capture differs from the visible one's in ${d.pixels} of ${d.of} pixels${d.bbox ? ` (box ${d.bbox.join(',')}, largest channel difference ${d.max})` : ''}`);
  }
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

async function keyPace(desktop, emit, cua, { reps = 3 } = {}) {
  const md = ['| window | burst | key pace ms | teardown ms | runs | all keys arrived in order | median burst ms |', '|---|---|---:|---:|---:|---|---:|'];
  const original = 'cua171 key pace';
  const gedit = await desktop.openGedit('keys', `${original}\n`);
  const chrome = await desktop.openChrome('keys', 'scene.html');
  await desktop.openFront('covered');
  const originalLength = (await desktop.geditText(gedit)).length;
  // [key pace, teardown]: the pinned build's waits, then each lowered alone and together
  const configs = [
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
  const read = (scene) => (scene.kind === 'gedit' ? desktop.geditText(scene) : desktop.chromeCounters(scene).then((c) => c.seq));
  for (const scene of [gedit, chrome]) {
    for (const [name, burst] of Object.entries(BURSTS)) {
      for (const [pace, teardown] of configs) {
        const runs = [];
        for (let rep = 0; rep < reps; rep++) {
          if (scene.kind === 'chrome') {
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
          const got = scene.kind === 'gedit' ? typedByBurst(before, after.value, originalLength) : after.value;
          const ok = responses.every((r) => r.ok) && got === burst.expected;
          runs.push({ ok, ms });
          emit({ kind: 'experiment', experiment: 'key-pace', window: scene.kind, burst: name, key_pace_ms: pace, teardown_ms: teardown, rep, answered_ok: responses.every((r) => r.ok), arrived: got, expected: burst.expected, ok, burst_ms: Math.round(ms), settled_ms: after.ms });
        }
        md.push(`| ${scene.kind} | ${name} | ${pace} | ${teardown} | ${runs.length} | ${runs.filter((r) => r.ok).length}/${runs.length} | ${Math.round(median(runs.map((r) => r.ms)))} |`);
      }
    }
  }
  return md;
}

export async function runExperiment(args) {
  const run = args.run ?? `${args.experiment}-${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`;
  mkdirSync(args.out, { recursive: true });
  const results = join(args.out, 'results.jsonl');
  const emit = (row) => appendFileSync(results, `${JSON.stringify({ run, ...row })}\n`);
  emit({ kind: 'meta', experiment: args.experiment, cua_version: execFileSync(args.cua, ['--version'], { encoding: 'utf8' }).trim(), started: new Date().toISOString() });
  const desktop = new Desktop({ cua: args.cua, run });
  let md;
  try {
    if (args.experiment === 'capture-readiness') md = await captureReadiness(desktop, emit);
    else if (args.experiment === 'key-pace') md = await keyPace(desktop, emit, args.cua);
    else throw new Error(`unknown experiment ${args.experiment}`);
  } finally {
    await desktop.closeAll();
  }
  emit({ kind: 'experiment-summary', markdown: md, finished: new Date().toISOString() });
  process.stdout.write(`${md.join('\n')}\n`);
  writeSummary(args.out);
  return true;
}
