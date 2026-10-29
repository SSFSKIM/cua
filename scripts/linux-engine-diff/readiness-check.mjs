// The engine's capture readiness judged by content (Design, Retention and the fixed waits; Decision Log, M1a.1, last
// bullet): M0.3's visible-window and covered readiness trials re-run under the rule cua-engine ships (the DAMAGE rule
// with the unobscured shortcut), on every family of M0.4's matrix, idle and with every core busy (`--load`).
//
// A trial is one fresh cua-engine process (nothing retained) asked for the window's state with its screenshot: the
// first capture after its redirect, waited for by the engine's rule. The same engine captures the window again 400 ms
// later, when the retained pixmap holds the real contents; the first capture is right when it matches that one within
// the differential run's image tolerance. The pinned build captures the same window too (its fixed 100 ms after the
// redirect), so each condition's truth is also checked against the vendor's.
//
// Conditions: `unobscured` (the window raised, the front window clear of it: the shortcut's case), `partial` (raised,
// the front window over part of it: the window is on screen but obscured, so the rule waits for damage) and `covered`
// (the front window over the whole screen). The engine reports which way it judged the window (`--stats`), so a
// trial the engine did not judge unobscured is never counted as the shortcut's.

import { execFileSync } from 'node:child_process';
import { copyFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { Engine } from './engine.mjs';
import { familyNames, openFamily } from './families.mjs';
import { IMAGE_TOLERANCE, imageVerdict } from './images.mjs';
import { Oracle } from './oracle.mjs';
import { XPROBE, configure, xdotool } from './scenes.mjs';
import { median } from './stats.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r1 = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : null);

export const CONDITIONS = ['unobscured', 'partial', 'covered'];
/** The later capture that holds the real contents, after the first. */
export const TRUTH_AFTER_MS = 400;

/**
 * Where the front window stands for each condition, `[x, y, w, h]` (every family's window is placed at 0,0; some open
 * maximized). Unobscured: off the right edge of the 1280-column screen, still holding the focus, so it overlaps no
 * window whatever its size.
 */
export const FRONT_FOR = {
  unobscured: [1300, 0, 100, 80],
  partial: [300, 200, 300, 200],
  covered: [0, 0, 1280, 800],
};

/** A same-window comparison: nothing masked, the differential run's tolerance. */
export function captureVerdict(diff) {
  return imageVerdict(diff, { ...IMAGE_TOLERANCE, maskTopRows: 0 });
}

/**
 * The judgement of a run's trials: per condition and family the count of wrong first captures, and the stop
 * condition the design session set: any trial the engine judged unobscured whose first capture is wrong.
 */
export function judgeReadiness(trials) {
  const wrong = trials.filter((t) => t.ok === false);
  const unobscuredWrong = wrong.filter((t) => t.capture?.unobscured === true);
  const unjudged = trials.filter((t) => t.ok === null);
  return {
    trials: trials.length,
    wrong: wrong.length,
    unobscured_wrong: unobscuredWrong.length,
    unjudged: unjudged.length,
    stop: unobscuredWrong.length > 0,
    pass: trials.length > 0 && wrong.length === 0 && unjudged.length === 0,
  };
}

/**
 * The run's verdict: every first capture right, and the truth each was judged against confirmed by the pinned build,
 * whose captures of every condition must agree with it. A vendor capture off the truth, or one that could not be
 * judged, leaves that truth unconfirmed, so the run does not pass; nor does a run with no vendor capture at all.
 */
export function judgeReadinessRun(trials, vendorTrials) {
  const verdict = judgeReadiness(trials);
  const vendorWrong = vendorTrials.filter((t) => t.ok === false).length;
  const vendorUnjudged = vendorTrials.filter((t) => t.ok !== true && t.ok !== false).length;
  return {
    ...verdict,
    vendor_trials: vendorTrials.length,
    vendor_wrong: vendorWrong,
    vendor_unjudged: vendorUnjudged,
    pass: verdict.pass && vendorTrials.length > 0 && vendorWrong === 0 && vendorUnjudged === 0,
  };
}

function imgdiff(a, b) {
  return JSON.parse(execFileSync(XPROBE, ['imgdiff', a, b, '0'], { encoding: 'utf8' }));
}

/** Arranges the front window for a condition, the scene raised beneath it; returns the front's real geometry. */
function arrange(desktop, scene, condition) {
  if (condition !== 'covered') xdotool('windowraise', scene.id);
  configure(desktop.front.id, ...FRONT_FOR[condition]);
  desktop.focusFront();
  const g = Object.fromEntries(xdotool('getwindowgeometry', '--shell', desktop.front.id).split('\n').map((l) => l.split('=')));
  return [g.X, g.Y, g.WIDTH, g.HEIGHT].map(Number);
}

async function trial(ctx, scene, condition, i) {
  const { args, emit, keepDir } = ctx;
  await sleep(ctx.gapMs);
  const engine = new Engine({ label: 'cua', bin: args.cua, stats: true }).start();
  const row = { kind: 'readiness-trial', family: scene.family, condition, i, load: args.load };
  try {
    const first = await engine.request('get_window_state', { window: { id: scene.id }, include_screenshot: true });
    row.ms = r1(first.sinceSpawnMs);
    row.capture = first.stats?.capture ?? null;
    await sleep(TRUTH_AFTER_MS);
    const second = await engine.request('get_window_state', { window: { id: scene.id }, include_screenshot: true });
    const a = first.response.output?.screenshots?.[0]?.filepath;
    const b = second.response.output?.screenshots?.[0]?.filepath;
    if (!first.response.ok || !second.response.ok || !a || !b) {
      row.ok = null;
      row.error = String(first.response.error ?? second.response.error ?? 'no screenshot').slice(0, 300);
    } else {
      const d = imgdiff(b, a);
      const v = captureVerdict(d);
      Object.assign(row, { ok: v.ok, over: d.over, mad: d.mad, compared: d.compared, reason: v.reason });
      if (!v.ok || d.over > 0) {
        // the wrong frame and its truth, kept for the report (the harness's own window)
        const stem = join(keepDir, `${scene.family}-${condition}-${args.load ? 'load' : 'idle'}-${i}`);
        copyFileSync(a, `${stem}-first.jpg`);
        copyFileSync(b, `${stem}-truth.jpg`);
        row.kept = stem;
      }
      ctx.truth.set(`${scene.family}|${condition}`, `${ctx.dir}/${scene.family}-${condition}-truth.jpg`);
      copyFileSync(b, ctx.truth.get(`${scene.family}|${condition}`));
    }
  } finally {
    await engine.close();
  }
  emit(row);
  return row;
}

/** The pinned build's capture of the same window (its own fixed waits), against cua's truth. */
async function vendorCapture(ctx, scene, condition, i) {
  const { args, emit } = ctx;
  await sleep(ctx.gapMs);
  const engine = new Engine({ label: 'pinned', bin: args.vendor }).start();
  const row = { kind: 'readiness-vendor', family: scene.family, condition, i, load: args.load };
  try {
    const { response, sinceSpawnMs } = await engine.request('get_window_state', { window: { id: scene.id }, include_screenshot: true });
    row.ms = r1(sinceSpawnMs);
    const file = response.output?.screenshots?.[0]?.filepath;
    const truth = ctx.truth.get(`${scene.family}|${condition}`);
    if (!response.ok || !file || !truth) {
      row.ok = null;
      row.error = String(response.error ?? 'no screenshot or no truth').slice(0, 300);
    } else {
      const d = imgdiff(truth, file);
      const v = captureVerdict(d);
      Object.assign(row, { ok: v.ok, over: d.over, mad: d.mad, reason: v.reason });
    }
    if (file) rmSync(file, { force: true });
  } finally {
    await engine.close();
  }
  emit(row);
  return row;
}

export async function engineReadiness(desktop, emit, args) {
  if (!args.vendor) throw new Error('engine-readiness needs --vendor (the pinned build captures each condition too)');
  const oracle = new Oracle();
  const names = familyNames(args.families.length ? args.families : ['gedit', 'gnome-text-editor', 'kate', 'qtcreator', 'firefox', 'chrome', 'electron', 'writer', 'writer-gen', 'xterm', 'xterm-allow']);
  const trialsPer = args.samplesTrials ?? 12;
  const ctx = { args, emit, dir: desktop.dir, keepDir: desktop.keepDir ?? desktop.dir, truth: new Map(), gapMs: 500 };
  await desktop.openFront('covered');
  const all = [];
  const vendor = [];
  const md = [];
  for (const name of names) {
    // `--geometry`: the families that open maximized (Firefox, Writer) open at that size instead, so the front window
    // can stand clear of them for the unobscured condition
    const scene = await openFamily(desktop, oracle, name, 'ready', { geometry: args.geometry ?? null });
    try {
      for (const condition of CONDITIONS) {
        const front = arrange(desktop, scene, condition);
        emit({ kind: 'readiness-arrangement', family: name, condition, front, window: scene.window });
        await sleep(800);
        for (let i = 0; i < trialsPer; i++) all.push(await trial(ctx, scene, condition, i));
        for (let i = 0; i < 2; i++) vendor.push(await vendorCapture(ctx, scene, condition, i));
        const mine = all.filter((t) => t.family === name && t.condition === condition);
        const verdict = judgeReadiness(mine);
        process.stdout.write(`${name} ${condition}${args.load ? ' (loaded)' : ''}: ${mine.length - verdict.wrong - verdict.unjudged}/${mine.length} right, engine judged unobscured ${mine.filter((t) => t.capture?.unobscured).length}/${mine.length}\n`);
        if (verdict.stop) {
          emit({ kind: 'readiness-stop', family: name, condition, wrong: mine.filter((t) => t.ok === false && t.capture?.unobscured) });
          process.stdout.write(`STOP: an unobscured trial captured wrong (${name}, ${condition}); see readiness-trial rows with kept frames\n`);
        }
      }
    } finally {
      desktop.focusFront();
      await desktop.close([scene]);
    }
  }
  md.push(`Every family, ${trialsPer} trials per condition, a fresh cua-engine per trial${args.load ? ', every core busy (stress-ng)' : ', idle'}: the first capture against the same engine's capture ${TRUTH_AFTER_MS} ms later (same size, at most 0.1% of the pixels off by more than 32). The pinned build captured each condition twice, against that truth.`, '');
  md.push('| family | condition | engine judged unobscured | first capture right | wait median ms | wait max ms | reasons | first damage median ms | cold request median ms | pinned against the truth |');
  md.push('|---|---|---:|---:|---:|---:|---|---:|---:|---:|');
  for (const name of names) {
    for (const condition of CONDITIONS) {
      const mine = all.filter((t) => t.family === name && t.condition === condition);
      const theirs = vendor.filter((t) => t.family === name && t.condition === condition);
      const waits = mine.map((t) => t.capture?.wait_ms).filter((v) => typeof v === 'number');
      const reasons = [...new Set(mine.map((t) => t.capture?.reason).filter(Boolean))].join(', ');
      const firsts = mine.map((t) => t.capture?.first_damage_ms).filter((v) => typeof v === 'number');
      md.push(`| ${name} | ${condition} | ${mine.filter((t) => t.capture?.unobscured).length}/${mine.length} | ${mine.filter((t) => t.ok).length}/${mine.length} | ${r1(median(waits)) ?? '–'} | ${waits.length ? r1(Math.max(...waits)) : '–'} | ${reasons} | ${r1(median(firsts)) ?? '–'} | ${r1(median(mine.map((t) => t.ms))) ?? '–'} | ${theirs.filter((t) => t.ok).length}/${theirs.length} |`);
    }
  }
  const verdict = judgeReadinessRun(all, vendor);
  emit({ kind: 'readiness-verdict', ...verdict });
  const firsts = verdict.wrong === 0 && verdict.unjudged === 0 ? 'every first capture right' : `${verdict.wrong} wrong first captures (${verdict.unobscured_wrong} judged unobscured), ${verdict.unjudged} unjudged`;
  md.push('', `**${verdict.pass ? 'PASS' : 'FAIL'}: ${firsts}** of ${verdict.trials}; the pinned build's captures against the truth: ${verdict.vendor_wrong} off and ${verdict.vendor_unjudged} unjudged of ${verdict.vendor_trials}.`);
  return { md, pass: verdict.pass };
}
