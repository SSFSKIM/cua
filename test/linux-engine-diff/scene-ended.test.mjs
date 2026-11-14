// M5's T4: a lane whose own text window its vendor build ended (the pinned build's text input crashed gedit on every
// sample on arm64, 2026-10-06) is restarted lane-neutrally, counted, and never scored against cua; a candidate's ended
// window stops the run as a failure, never restarted.

import assert from 'node:assert/strict';
import test from 'node:test';

import { textSceneEndsMarkdown } from '../../scripts/linux-engine-diff/report.mjs';
import { CandidateSceneEnded, judgeSceneEnds, keepLaneScene, restartLaneScene } from '../../scripts/linux-engine-diff/scene-ended.mjs';
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
  assert.equal(kept, windows.gedit.text.pinned);
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
  assert.equal(kept.id, 100, 'the next request goes to the fresh window');
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
  assert.equal(kept, null);
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
  assert.equal(verdictLine(outcome), 'every verdict PASS; text windows a lane ended (a vendor\'s restarted, never scored): pinned 1, newest 0, cua 0');
  const md = textSceneEndsMarkdown([{ kind: 'text-scene-ends', ...sceneEnds }]).join('\n');
  assert.match(md, /pinned 1, newest 0, cua 0/);
  assert.match(md, /gedit type_text pinned 0\/1: gone after type_text 0\/0; restarted \(gedit 7 replaced by 8, window 42 by 100\)/);
  assert.deepEqual(textSceneEndsMarkdown([]), [], 'a run from before the count shows nothing');
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
