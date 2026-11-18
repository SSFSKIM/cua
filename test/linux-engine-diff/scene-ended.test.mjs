// M5's T4: a lane whose own text window its vendor build ended (the pinned build's text input crashed gedit on every
// sample on arm64, 2026-10-06) is restarted lane-neutrally, counted, and never scored against cua; a candidate's ended
// window stops the run as a failure, never restarted.

import assert from 'node:assert/strict';
import test from 'node:test';

import { renderSummary, textSceneEndsMarkdown } from '../../scripts/linux-engine-diff/report.mjs';
import { judgePrepareFaults, judgeTextRestores } from '../../scripts/linux-engine-diff/prepare.mjs';
import { CandidateSceneEnded, DECLARED_VENDOR_ENDS, auditInSegments, invalidRestartRow, judgeSceneEnds, keepLaneScene, mergeAudits, restartLaneScene } from '../../scripts/linux-engine-diff/scene-ended.mjs';
import { Desktop } from '../../scripts/linux-engine-diff/scenes.mjs';
import { runOutcome, verdictLine } from '../../scripts/linux-engine-diff/stats.mjs';

const VENDORS = ['pinned', 'newest'];
const LANES = [...VENDORS, 'cua'];

/** A desktop whose lane windows end as `ended` says, by id (null while still the run's). */
function fakeDesktop(ended = {}) {
  return { checked: [], async sceneEnded(scene) {
    this.checked.push(scene.id);
    return ended[scene.id] ?? null;
  } };
}

const gedit = (label, id, extra = {}) => ({ kind: 'gedit', role: `text_${label}`, label: `cua171-diff-r-gedit-text_${label}`, id, pid: id + 1000, ...extra });

test("a lane's window still the run's is kept: nothing restarted, nothing recorded", async () => {
  const windows = { gedit: { text: { pinned: gedit('pinned', 42) } } };
  const rows = [];
  let restarted = 0;
  const kept = await keepLaneScene({ desktop: fakeDesktop(), windows, sceneName: 'gedit', label: 'pinned', vendors: VENDORS, at: { op: 'type_text', block: 0, i: 3, series: 'warm' }, restart: async () => restarted++, emit: (r) => rows.push(r) });
  assert.deepEqual(kept, { window: windows.gedit.text.pinned, restart: null });
  assert.equal(restarted, 0);
  assert.deepEqual(rows, []);
});

test("a vendor lane's ended window is restarted before its next request, recorded with the request that last reached it", async () => {
  const old = gedit('pinned', 42, { lastRequest: { op: 'type_text', block: 0, i: 2 } });
  const windows = { gedit: { text: { pinned: old } } };
  const rows = [];
  const restart = async () => {
    windows.gedit.text.pinned = gedit('pinned', 100);
    return { old_id: 42, new_id: 100, old_pid: 1042, new_pid: 1100, warm_up: null, ms: 900 };
  };
  const kept = await keepLaneScene({ desktop: fakeDesktop({ 42: 'gone' }), windows, sceneName: 'gedit', label: 'pinned', vendors: VENDORS, at: { op: 'type_text', block: 0, i: 3, series: 'warm' }, restart, emit: (r) => rows.push(r) });
  assert.equal(kept.window.id, 100, 'the next request goes to the fresh window');
  assert.equal(kept.restart.new_id, 100);
  assert.deepEqual(rows, [{ kind: 'scene-ended', engine: 'pinned', scene: 'gedit', op: 'type_text', block: 0, i: 3, series: 'warm', ended: 'gone', id: 42, pid: 1042, last: { op: 'type_text', block: 0, i: 2 }, restart: { old_id: 42, new_id: 100, old_pid: 1042, new_pid: 1100, warm_up: null, ms: 900 } }]);
});

test("a candidate's ended window is never restarted: the run stops as a failure there", async () => {
  const windows = { gedit: { text: { cua: gedit('cua', 9, { lastRequest: { op: 'type_text', block: 1, i: 7 } }) } } };
  let restarted = 0;
  const rows = [];
  await assert.rejects(
    keepLaneScene({ desktop: fakeDesktop({ 9: 'replaced' }), windows, sceneName: 'gedit', label: 'cua', vendors: VENDORS, at: { op: 'type_text_selection', block: 1, i: 0, series: 'cold' }, restart: async () => restarted++, emit: (r) => rows.push(r) }),
    (error) => {
      assert.ok(error instanceof CandidateSceneEnded);
      assert.match(error.message, /cua's gedit window ended \(replaced\) after type_text 1\/7/);
      assert.deepEqual(error.record, { engine: 'cua', scene: 'gedit', op: 'type_text_selection', block: 1, i: 0, series: 'cold', ended: 'replaced', id: 9, pid: 1009, last: { op: 'type_text', block: 1, i: 7 } });
      return true;
    },
  );
  assert.equal(restarted, 0);
  assert.deepEqual(rows, [], 'the stop records it, not a restart row');
});

test("the run's last look at a vendor window records its end with no restart: no request is left for it", async () => {
  const windows = { gedit: { text: { newest: gedit('newest', 50, { lastRequest: { op: 'clipboard_release', block: 'bus', i: 0 } }) } } };
  const rows = [];
  const kept = await keepLaneScene({ desktop: fakeDesktop({ 50: 'gone' }), windows, sceneName: 'gedit', label: 'newest', vendors: VENDORS, at: { pass: 'end' }, restart: null, emit: (r) => rows.push(r) });
  assert.deepEqual(kept, { window: null, restart: null });
  assert.equal(rows[0].restart, null);
  assert.equal(rows[0].pass, 'end');
});

test("a warm sample's fresh window is warmed by the operation, as the backstop's is; a cold one's is not", async () => {
  const calls = [];
  const restore = async (warmUp) => {
    calls.push(warmUp ? 'restore, warmed' : 'restore');
    return { new_id: calls.length, warm_up: warmUp ? { ok: true } : null };
  };
  const warm = await restartLaneScene({ restore, endedNow: async () => null, warmUp: async () => ({}) });
  assert.deepEqual(calls, ['restore, warmed']);
  assert.deepEqual(warm, { new_id: 1, warm_up: { ok: true } });
  calls.length = 0;
  const cold = await restartLaneScene({ restore, endedNow: async () => assert.fail('a cold restart is not looked at again'), warmUp: null });
  assert.deepEqual(calls, ['restore']);
  assert.equal(cold.warm_up, null);
});

test('a warm-up that ended the fresh window too is followed by one more restart, unwarmed, both recorded', async () => {
  const calls = [];
  const restore = async (warmUp) => {
    calls.push(warmUp ? 'restore, warmed' : 'restore');
    return { new_id: 100 + calls.length, warm_up: warmUp ? { ok: false, error: 'NoReply' } : null };
  };
  const record = await restartLaneScene({ restore, endedNow: async () => 'gone', warmUp: async () => ({}) });
  assert.deepEqual(calls, ['restore, warmed', 'restore']);
  assert.deepEqual(record, { new_id: 101, warm_up: { ok: false, error: 'NoReply' }, warm_up_ended: 'gone', then: { new_id: 102, warm_up: null } });
});

test('the ends are counted per lane, every lane named; a vendor\'s never fail the run, a candidate\'s always do', () => {
  const rows = [
    { kind: 'scene-ended', engine: 'pinned', scene: 'gedit', op: 'type_text', block: 0, i: 1, ended: 'gone' },
    { kind: 'scene-ended', engine: 'pinned', scene: 'gedit', op: 'type_text', block: 0, i: 2, ended: 'gone' },
    { kind: 'sample', engine: 'cua', scene: 'gedit', op: 'type_text', block: 0, i: 1 },
  ];
  const judged = judgeSceneEnds(rows, LANES, VENDORS);
  assert.deepEqual(judged.lanes, { pinned: 2, newest: 0, cua: 0 });
  assert.equal(judged.pass, true);
  assert.equal(judged.ended.length, 2);
  // negative control: a candidate's end recorded as a restart (no path makes one) fails the run, where the run's judges
  // before T4 had no such record and passed it
  const bad = judgeSceneEnds([...rows, { kind: 'scene-ended', engine: 'cua', scene: 'gedit', op: 'type_text', block: 0, i: 3, ended: 'gone' }], LANES, VENDORS);
  assert.equal(bad.pass, false);
  assert.match(bad.reasons[0], /cua's own gedit window ended at type_text 0\/3/);
  const before = runOutcome([{ kind: 'verdict', scene: 'gedit', op: 'type_text', candidate: 'cua', pass: true }], { valid: true });
  assert.equal(before.code, 0);
  const after = runOutcome([{ kind: 'verdict', scene: 'gedit', op: 'type_text', candidate: 'cua', pass: true }], { valid: true, sceneEnds: bad });
  assert.equal(after.code, 1);
  assert.ok(after.failed.some((f) => /cua's own gedit window ended/.test(f)));
  // a candidate's stop (scene-lost) is counted on its lane; the stop itself carries the failure
  assert.deepEqual(judgeSceneEnds([{ kind: 'scene-lost', engine: 'cua', scene: 'gedit', op: 'type_text', block: 0, i: 0 }], LANES, VENDORS).lanes, { pinned: 0, newest: 0, cua: 1 });
});

test('the verdict line and the summary carry the count per lane; a vendor\'s restarts leave every verdict PASS', () => {
  const sceneEnds = judgeSceneEnds([{ kind: 'scene-ended', engine: 'pinned', scene: 'gedit', op: 'type_text', block: 0, i: 1, ended: 'gone', last: { op: 'type_text', block: 0, i: 0 }, restart: { old_pid: 7, new_pid: 8, old_id: 42, new_id: 100, warm_up: null } }], LANES, VENDORS);
  const outcome = runOutcome([{ kind: 'verdict', scene: 'gedit', op: 'type_text', candidate: 'cua', pass: true }], { valid: true, sceneEnds });
  assert.equal(outcome.code, 0);
  assert.equal(verdictLine(outcome), 'every verdict PASS; text windows a lane ended (a vendor\'s restarted, never scored): pinned 1, newest 0, cua 0; vendor ends undeclared (never scored, for a look): gedit type_text pinned (an unnamed build) 1');
  const md = textSceneEndsMarkdown([{ kind: 'text-scene-ends', ...sceneEnds }]).join('\n');
  assert.match(md, /pinned 1, newest 0, cua 0/);
  assert.match(md, /gedit type_text pinned 0\/1: gone after type_text 0\/0; restarted \(gedit 7 replaced by 8, window 42 by 100\)/);
  assert.deepEqual(textSceneEndsMarkdown([]), [], 'a run from before the count shows nothing');
});

test("the summary's verdict line names the run's ends per lane, as the run printed it", () => {
  const rows = [{ kind: 'meta', run: 'r', engines: [] },{ kind: 'end', run: 'r', valid: true, pass: true, failed: [], restores: { pinned: 0, newest: 0, cua: 0 }, scene_ends: { pinned: 1, newest: 0, cua: 0 } }];
  assert.match(renderSummary(rows), /text windows a lane ended \(a vendor's restarted, never scored\): pinned 1, newest 0, cua 0/);
});

test("Desktop.sceneEnded: a window read as the run's once is kept; an end is taken only on every read", async () => {
  const fake = (reads, titleNow) => ({ reads, stillOurs() {
    return this.reads.shift();
  }, windowTitle: () => titleNow });
  const scene = gedit('pinned', 42);
  assert.equal(await Desktop.prototype.sceneEnded.call(fake([true]), scene, { gapMs: 0 }), null);
  assert.equal(await Desktop.prototype.sceneEnded.call(fake([false, true]), scene, { gapMs: 0 }), null, 'a read the load made fail is not an end');
  assert.equal(await Desktop.prototype.sceneEnded.call(fake([false, false, false], null), scene, { gapMs: 0 }), 'gone');
  assert.equal(await Desktop.prototype.sceneEnded.call(fake([false, false, false], 'a title of someone else'), scene, { gapMs: 0 }), 'replaced');
});

// Fix wave 1, finding 2: a restart whose warm-up's preparation the oracle refused could not reproduce the warm condition,
// so its sample is left invalid as the backstop leaves one, never scored; a crash in the warm-up is the other case.
test("a restart whose warm-up preparation was refused is invalid: no second restart, and its sample is not taken", async () => {
  const calls = [];
  const restore = async (warmUp) => {
    calls.push(warmUp ? 'restore, warmed' : 'restore');
    return { new_id: 101, warm_up: { refused: 'gedit refused the selection' }, invalid: "the warm-up's preparation was refused: gedit refused the selection" };
  };
  const record = await restartLaneScene({ restore, endedNow: async () => assert.fail('an invalid restart is not looked at again'), warmUp: async () => ({}) });
  assert.deepEqual(calls, ['restore, warmed']);
  assert.match(record.invalid, /refused/);
  // the vendor-crash fallback stays apart: a warm-up that ran and ended the window is restarted again, never invalid
  const crashed = await restartLaneScene({ restore: async (w) => ({ new_id: 5, warm_up: w ? { ok: false } : null }), endedNow: async () => 'gone', warmUp: async () => ({}) });
  assert.equal(crashed.invalid, undefined);
  assert.equal(crashed.warm_up_ended, 'gone');

  const windows = { gedit: { text: { pinned: gedit('pinned', 42) } } };
  const rows = [];
  const kept = await keepLaneScene({ desktop: fakeDesktop({ 42: 'gone' }), windows, sceneName: 'gedit', label: 'pinned', vendors: VENDORS, at: { op: 'type_text', block: 0, i: 3, series: 'warm' }, restart: async () => record, emit: (r) => rows.push(r) });
  assert.equal(kept.restart.invalid, record.invalid, 'the invalid record reaches the sampling');
  const invalid = invalidRestartRow({ label: 'pinned', sceneName: 'gedit', op: 'type_text', block: 0, i: 3, restart: kept.restart });
  assert.equal(invalid.kind, 'prepare-failure');
  assert.equal(invalid.outcome, 'invalid');
  assert.equal(invalid.step, 'oracle');
  // counted by the gate's rule as the backstop's invalid samples are
  const faults = judgePrepareFaults([invalid, ...Array.from({ length: 3 }, (_, i) => ({ kind: 'sample', engine: 'pinned', scene: 'gedit', op: 'type_text', i }))]);
  assert.deepEqual(faults.total, { samples: 4, resampled: 0, invalid: 1, limit: 0.04, over: true });
});

// Fix wave 1, finding 4: a window a restart's warm-up ended is a second end, counted.
test("an end inside a restart's warm-up is counted as an end of its own", () => {
  const rows = [{ kind: 'scene-ended', engine: 'pinned', scene: 'gedit', op: 'type_text', block: 0, i: 2, ended: 'gone', restart: { new_id: 101, warm_up: { ok: false }, warm_up_ended: 'gone', then: { new_id: 102, warm_up: null } } }];
  const judged = judgeSceneEnds(rows, LANES, VENDORS);
  assert.deepEqual(judged.lanes, { pinned: 2, newest: 0, cua: 0 });
  assert.equal(judged.pass, true);
});

test("a restart's warm-up that put the first word back counts in its lane's text restores", () => {
  const rows = [{ kind: 'scene-ended', engine: 'pinned', scene: 'gedit', op: 'type_text_selection', block: 0, i: 2, series: 'warm', restart: { warm_up: { ok: false, text_restored: { inserted: 'cua171', found: '' } } } }];
  assert.deepEqual(judgeTextRestores(rows, LANES).lanes, { pinned: 1, newest: 0, cua: 0 });
});

// Fix wave 1, finding 1: the audit's two requests on a lane's text window. A first request that ends its window ends
// that audit's lifecycle; the window is recovered and the second request is audited in a fresh one, on the replacement.
test('an audited request that ends its window: the next is audited on the recovered window, in a lifecycle of its own', async () => {
  const log = [];
  let alive = true;
  const segment = async ({ from, stopAfter }) => {
    log.push(`lifecycle from ${from}`);
    let ran = 0;
    for (let i = from; i < 2; i++) {
      log.push(`sample ${i}`);
      if (i === 0) alive = false; // the pinned build's text request ended gedit
      ran++;
      if (await stopAfter(i)) break;
    }
    return { ran, audit: { clean: true, traced: true, requests: ran, forbidden: [] }, foreign: [], watched: true };
  };
  const segments = await auditInSegments({ samples: 2, segment, ended: async () => !alive, recover: async (next) => {
    log.push(`recover before ${next}`);
    alive = true;
  } });
  assert.deepEqual(log, ['lifecycle from 0', 'sample 0', 'recover before 1', 'lifecycle from 1', 'sample 1']);
  assert.equal(segments.length, 2);
  // a window that stays: one lifecycle, both requests in it, as before
  const once = [];
  const one = await auditInSegments({ samples: 2, segment: async ({ from, stopAfter }) => {
    let ran = 0;
    for (let i = from; i < 2; i++) {
      once.push(i);
      ran++;
      if (await stopAfter(i)) break;
    }
    return { ran };
  }, ended: async () => false, recover: async () => assert.fail('nothing to recover') });
  assert.deepEqual(once, [0, 1]);
  assert.equal(one.length, 1);
  // a candidate's ended window: the recovery throws (keepLaneScene's stop), and no second request is sent
  const sent = [];
  await assert.rejects(auditInSegments({ samples: 2, segment: async ({ from, stopAfter }) => {
    sent.push(from);
    await stopAfter(from);
    return { ran: 1 };
  }, ended: async () => true, recover: async () => {
    throw new CandidateSceneEnded('cua', { scene: 'gedit', ended: 'gone', last: { op: 'type_text', block: 'audit', i: 0 } });
  } }), CandidateSceneEnded);
  assert.deepEqual(sent, [0]);
});

test("the audit lifecycles' judgments merge: clean only if every one is, forbidden requests and counts summed", () => {
  const merged = mergeAudits([
    { clean: true, traced: true, requests: 3, forbidden: [] },
    { clean: false, traced: true, requests: 2, forbidden: [{ what: 'ConfigureWindow' }], allowed: ['a'] },
  ]);
  assert.deepEqual(merged, { clean: false, traced: true, requests: 5, forbidden: [{ what: 'ConfigureWindow' }], allowed: ['a'] });
  assert.equal(mergeAudits([{ clean: true, traced: false, requests: 0, forbidden: [] }, { clean: true, traced: true, requests: 1, forbidden: [] }]).traced, false);
  assert.deepEqual(mergeAudits([{ clean: true, traced: true, requests: 1, forbidden: [] }]), { clean: true, traced: true, requests: 1, forbidden: [] });
});

// #171 M5, T4's arm64 round, item (a), the design session's word (B): the arm64 vendor builds' gedit ends are declared per
// build (its binary's sha256 and release), scene and the operation of the request that last reached the window, with
// their counts and evidence. Declared ends and undeclared ones are each listed apart in the verdict line; neither fails
// the step, and neither is ever counted as a cua pass or loss. A candidate's end is judged exactly as before.
const PINNED_ARM64 = DECLARED_VENDOR_ENDS.find((d) => d.release === '26.928.40906-linux-arm64' && d.op === 'type_text').sha256;
const NEWEST_ARM64 = DECLARED_VENDOR_ENDS.find((d) => d.release === '26.1023.51421-linux-arm64').sha256;
const BUILDS = { pinned: PINNED_ARM64, newest: NEWEST_ARM64, cua: '0cbde8f0' };
const end = (engine, lastOp, extra = {}) => ({ kind: 'scene-ended', engine, scene: 'gedit', op: lastOp, block: 0, i: 1, ended: 'gone', last: { op: lastOp, block: 0, i: 0 }, restart: { old_pid: 7, new_pid: 8, old_id: 42, new_id: 100, warm_up: null }, ...extra });

test("the arm64 vendor builds' declared ends: the pilot's, each with its build, counts and evidence", () => {
  assert.deepEqual(DECLARED_VENDOR_ENDS.map((d) => `${d.release} ${d.scene} ${d.op}`).sort(), [
    '26.1023.51421-linux-arm64 gedit clipboard_write',
    '26.928.40906-linux-arm64 gedit clipboard_write',
    '26.928.40906-linux-arm64 gedit type_text',
    '26.928.40906-linux-arm64 gedit type_text_selection',
  ]);
  for (const d of DECLARED_VENDOR_ENDS) {
    assert.match(d.sha256, /^[0-9a-f]{64}$/, d.id);
    assert.ok(Number.isInteger(d.counts.ended) && d.counts.ended > 0 && d.counts.ended <= d.counts.requests, d.id);
    assert.match(d.evidence, /^docs\/evidence\/2026-10-28-own-linux-engine\/m5\/arm64\/pilot\//, d.id);
  }
  assert.equal(new Set(DECLARED_VENDOR_ENDS.map((d) => d.id)).size, DECLARED_VENDOR_ENDS.length);
});

test('a declared vendor end is listed apart as declared; an undeclared one apart as undeclared; neither fails', () => {
  const rows = [
    end('pinned', 'type_text'),
    end('pinned', 'type_text', { restart: { old_pid: 7, new_pid: 8, old_id: 42, new_id: 100, warm_up: { ok: false }, warm_up_ended: 'gone', then: {} } }),
    end('newest', 'clipboard_write'),
    // the newest build has no declared type_text end, and clipboard_read is declared for neither
    end('newest', 'type_text'),
    end('pinned', 'clipboard_read'),
  ];
  const judged = judgeSceneEnds(rows, LANES, VENDORS, { builds: BUILDS });
  assert.equal(judged.pass, true);
  assert.deepEqual(judged.reasons, []);
  assert.deepEqual(judged.lanes, { pinned: 4, newest: 2, cua: 0 });
  assert.deepEqual(judged.vendor.declared.map((d) => [d.engine, d.op, d.count]), [['pinned', 'type_text', 3], ['newest', 'clipboard_write', 1]], 'the warm-up that ended the restarted window counts with its operation');
  assert.deepEqual(judged.vendor.undeclared.map((d) => [d.engine, d.op, d.count]), [['newest', 'type_text', 1], ['pinned', 'clipboard_read', 1]]);
  const outcome = runOutcome([{ kind: 'verdict', scene: 'gedit', op: 'type_text', candidate: 'cua', pass: true }], { valid: true, sceneEnds: judged });
  assert.equal(outcome.code, 0, 'no vendor end fails the step');
  assert.deepEqual(outcome.failed, []);
  const line = verdictLine(outcome);
  assert.match(line, /^every verdict PASS; /);
  assert.match(line, /; vendor ends declared \(never scored\): gedit type_text pinned \(26\.928\.40906-linux-arm64\) 3, gedit clipboard_write newest \(26\.1023\.51421-linux-arm64\) 1/);
  assert.match(line, /; vendor ends undeclared \(never scored, for a look\): gedit type_text newest \(26\.1023\.51421-linux-arm64\) 1, gedit clipboard_read pinned \(26\.928\.40906-linux-arm64\) 1/);
  // a build no table names (x64's, another release) declares nothing: its ends are listed undeclared
  const other = judgeSceneEnds([end('pinned', 'type_text')], LANES, VENDORS, { builds: { ...BUILDS, pinned: 'f'.repeat(64) } });
  assert.deepEqual([other.vendor.declared.length, other.vendor.undeclared.length, other.pass], [0, 1, true]);
});

test("a candidate's end still fails as before, and is never listed among the vendor's", () => {
  const judged = judgeSceneEnds([end('pinned', 'type_text'), end('cua', 'type_text')], LANES, VENDORS, { builds: BUILDS });
  assert.equal(judged.pass, false);
  assert.match(judged.reasons[0], /cua's own gedit window ended at type_text 0\/1/);
  assert.deepEqual([...judged.vendor.declared, ...judged.vendor.undeclared].map((d) => d.engine), ['pinned']);
  // even a candidate whose sha256 a table entry named is never declared: the table names vendor builds alone
  const named = judgeSceneEnds([end('cua', 'type_text')], LANES, VENDORS, { builds: { ...BUILDS, cua: PINNED_ARM64 } });
  assert.equal(named.pass, false);
  assert.deepEqual(named.vendor.declared, []);
  const outcome = runOutcome([{ kind: 'verdict', scene: 'gedit', op: 'type_text', candidate: 'cua', pass: true }], { valid: true, sceneEnds: judged });
  assert.equal(outcome.code, 1);
});

test('the summary lists declared and undeclared vendor ends apart, and a run with none shows neither', () => {
  const judged = judgeSceneEnds([end('pinned', 'type_text'), end('newest', 'type_text')], LANES, VENDORS, { builds: BUILDS });
  const md = textSceneEndsMarkdown([{ kind: 'text-scene-ends', ...judged }]).join('\n');
  assert.match(md, /Vendor ends declared \(scene-ended\.mjs DECLARED_VENDOR_ENDS; never scored\):\n\n- gedit type_text pinned \(26\.928\.40906-linux-arm64, a2ee3b61…\): 1, declared as arm64-pinned-gedit-type_text/);
  assert.match(md, /Vendor ends undeclared \(never scored; a vendor behaviour the pilot did not see, for a look\):\n\n- gedit type_text newest \(26\.1023\.51421-linux-arm64, b407257f…\): 1/);
  const none = judgeSceneEnds([], LANES, VENDORS, { builds: BUILDS });
  assert.equal(verdictLine(runOutcome([], { valid: true, sceneEnds: none })), "every verdict PASS; text windows a lane ended (a vendor's restarted, never scored): pinned 0, newest 0, cua 0");
  assert.doesNotMatch(textSceneEndsMarkdown([{ kind: 'text-scene-ends', ...none }]).join('\n'), /Vendor ends/);
  // the summary's verdict line reads them from the end row
  const rows = [{ kind: 'meta', run: 'r', engines: [] }, { kind: 'end', run: 'r', valid: true, pass: true, failed: [], restores: { pinned: 0, newest: 0, cua: 0 }, scene_ends: judged.lanes, vendor_ends: judged.vendor }];
  assert.match(renderSummary(rows), /vendor ends undeclared \(never scored, for a look\): gedit type_text newest/);
});

test("x64's stored verdict runs re-judge unchanged: no vendor end, counts and pass as recorded", async () => {
  const { rejudgeSceneEnds } = await import('../../scripts/linux-engine-diff/rejudge-scene-ends.mjs');
  const { readFileSync } = await import('node:fs');
  const { gunzipSync } = await import('node:zlib');
  const x64 = new URL('../../docs/evidence/2026-10-28-own-linux-engine/m5/x64/', import.meta.url);
  // every x64 M5 run that counted its text windows' ends
  const files = ['out/V1.pinned-release/run/results.jsonl', 'out/V2.pinned-release/run/results.jsonl.gz', 'out/V4.pinned-release/run/results.jsonl', 'f3-out/V2.development-run/run/results.jsonl.gz'];
  for (const f of files) {
    const bytes = readFileSync(new URL(f, x64));
    const rows = (f.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const [run] = rejudgeSceneEnds(rows);
    assert.equal(run.stands, true, f);
    assert.deepEqual([run.now.vendor.declared, run.now.vendor.undeclared], [[], []], f);
  }
  // a run whose stored count a judge would now read differently does not stand
  const moved = rejudgeSceneEnds([{ run: 'r', kind: 'meta', engines: [{ label: 'pinned', sha256: 'p' }, { label: 'newest', sha256: 'n' }, { label: 'cua', sha256: 'c' }] }, end('cua', 'type_text'), { run: 'r', kind: 'text-scene-ends', lanes: { pinned: 0, newest: 0, cua: 1 }, pass: true, reasons: [] }].map((r) => ({ run: 'r', ...r })));
  assert.equal(moved[0].stands, false);
});

// Fix wave 1, finding 4: (B) keeps a vendor's ended windows out of the scoring. A vendor sample whose request ended its
// own window (the `last` request a scene-ended row names) is excluded from the speed bar, even one that answered ok and
// is otherwise usable; its row stays as evidence, and nothing of the candidate's changes.
test('a vendor sample that ended its own window, ok or not, sets no bar; its row stays, and the candidate\'s are untouched', async () => {
  const { judgeOperation } = await import('../../scripts/linux-engine-diff/stats.mjs');
  const { markEndedTargets } = await import('../../scripts/linux-engine-diff/scene-ended.mjs');
  const sample = (engine, i, ms) => ({ kind: 'sample', engine, scene: 'gedit', op: 'type_text', block: 0, i, series: 'warm', ok: true, ms, witness: true });
  const rows = [];
  for (let i = 0; i < 20; i++) rows.push(sample('pinned', i, 100), sample('pinned', 100 + i, 10), sample('newest', i, 100), sample('cua', i, 90));
  // each fast pinned sample answered ok and ended its window: the end found before the next request names it `last`
  const ends = Array.from({ length: 20 }, (_, k) => ({ ...end('pinned', 'type_text'), i: 101 + k, last: { op: 'type_text', block: 0, i: 100 + k } }));
  // and the candidate's own end is never a reason to drop its sample
  ends.push({ ...end('cua', 'type_text'), last: { op: 'type_text', block: 0, i: 3 } });
  const marked = markEndedTargets(rows, [...rows, ...ends], VENDORS);
  assert.equal(marked.length, rows.length, 'every row stays');
  assert.equal(marked.filter((r) => r.ended_target).length, 20);
  assert.ok(marked.filter((r) => r.ended_target).every((r) => r.engine === 'pinned' && r.ms === 10 && r.ok), 'the ok vendor replies that ended their window');
  assert.equal(marked.filter((r) => r.engine === 'cua' && r.ended_target).length, 0, "a candidate's sample is never dropped");
  assert.equal(rows.some((r) => r.ended_target), false, 'the stored rows are not changed');
  const options = { vendors: VENDORS, candidate: 'cua', text: true };
  assert.equal(judgeOperation(rows, options).bar.warm, 55, 'unmarked, the ended samples lower the bar');
  assert.equal(judgeOperation(marked, options).bar.warm, 100, 'marked, they set none of it');
  // an audit request's end names no timed sample
  assert.equal(markEndedTargets(rows, [...rows, { ...end('pinned', 'type_text'), last: { op: 'type_text', block: 'audit', i: 0 } }], VENDORS).filter((r) => r.ended_target).length, 0);
  // without the text rule too: an ok reply that ended its window is still no bar sample
  assert.equal(judgeOperation(marked, { ...options, text: false }).bar.warm, 100);
});
