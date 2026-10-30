// Regression tests for the M2.3 review (#171, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md,
// Acceptance 3 and 6): the routes each scene's requests must take, a candidate's failed preparation, the noise rule's
// bound on the interval, the declared parity of the cold desktop screenshot, and the safety cases' cleanup.

import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { PARITY, declaredParity } from '../../scripts/linux-engine-diff/deviations.mjs';
import { eventSpeeds, eventsPass, medianDifferenceInterval } from '../../scripts/linux-engine-diff/events.mjs';
import { Cases } from '../../scripts/linux-engine-diff/safety.mjs';
import { judgeOperation, noiseBound, runOutcome } from '../../scripts/linux-engine-diff/stats.mjs';
import { NO_HANDLE, expectedRoute, handleOfFirstWord } from '../../scripts/linux-engine-diff/text.mjs';
import { judgeRouteSpan } from '../../scripts/linux-engine-diff/witness.mjs';

const VENDORS = ['pinned', 'newest'];

// ---------------------------------------------------------------------------------------------------------------
// the routes

test("each cua text scene's route is known beforehand: background everywhere but dedicated gnome-text-editor", () => {
  assert.equal(expectedRoute('type_text', 'gnome-text-editor'), 'foreground');
  for (const scene of ['gedit', 'chrome-textarea', 'chrome-address-bar']) assert.equal(expectedRoute('type_text', scene), 'background', scene);
  assert.equal(expectedRoute('type_text_dedicated', 'gedit'), 'background', 'dedicated mode on a family with a background route');
  assert.equal(expectedRoute('type_text_selection', 'gedit'), 'background');
  assert.equal(expectedRoute('type_characters', 'gedit'), 'background');
  assert.equal(expectedRoute('clipboard_write', 'gedit'), 'background');
  assert.equal(expectedRoute('clipboard_read', 'gedit'), null, 'no paste, no route record');
  assert.equal(expectedRoute('clipboard_release', 'gedit'), null);
  assert.equal(expectedRoute('tree', 'gedit'), null);
});

test('the allowance is granted only where the expected route is the one taken; a missing route record fails', () => {
  const target = 0x1200005;
  const facts = { target, frame: 0x47a900, focusWithin: (w) => w === target };
  const activated = { focus: [], tree: [[0x400001, 1, 0], [0x47a900, 1, 0]], restacks: [{ kind: 'configure', window: 0x47a900, above: 0x400001, or: 0 }], changes: [{ field: 'active', from: [0x400001], to: [target] }, { field: 'stacking', from: [target, 0x400001], to: [0x400001, target] }] };
  // expected and taken: the foreground allowance
  assert.deepEqual(judgeRouteSpan(activated, { ...facts, expected: 'foreground', reported: 'foreground' }), { clean: true, fields: [], allowed: ['active', 'stacking'], foreground: true });
  // a background scene whose request reported the foreground route: no allowance, and the route itself fails
  const wrong = judgeRouteSpan(activated, { ...facts, expected: 'background', reported: 'foreground' });
  assert.equal(wrong.clean, false);
  assert.equal(wrong.foreground, false);
  assert.deepEqual(wrong.fields, ['route foreground, expected background', 'active', 'stacking']);
  // the foreground scene's request with no route record, or the background one: no allowance either
  assert.deepEqual(judgeRouteSpan({ changes: [] }, { ...facts, expected: 'foreground', reported: null }).fields, ['route not recorded, expected foreground']);
  assert.deepEqual(judgeRouteSpan(activated, { ...facts, expected: 'foreground', reported: 'background' }).fields, ['route background, expected foreground', 'active', 'stacking']);
  // a background request with nothing changed is clean
  assert.deepEqual(judgeRouteSpan({ changes: [] }, { ...facts, expected: 'background', reported: 'background' }), { clean: true, fields: [], allowed: [], foreground: false });
  // an operation with no expected route (a vendor build, a clipboard read) is judged strictly, whatever it reports
  assert.deepEqual(judgeRouteSpan(activated, { ...facts, expected: null, reported: 'foreground' }).fields, ['active', 'stacking']);
});

// ---------------------------------------------------------------------------------------------------------------
// a failed preparation

const sample = (engine, series, ms, extra = {}) => ({ engine, series, ms, ok: true, witness: true, ...extra });

test("a candidate sample whose preparation failed fails the verdict, and no engine's such sample is timed", () => {
  const opts = { vendors: VENDORS, candidate: 'cua', text: true };
  const rows = [sample('pinned', 'cold', 1), sample('pinned', 'warm', 0.2), sample('newest', 'cold', 1), sample('newest', 'warm', 0.2), sample('cua', 'cold', 0.5), sample('cua', 'warm', 0.1)];
  assert.equal(judgeOperation(rows, opts).pass, true);
  // the candidate released a handle it never issued: it answered fast and succeeded, and still fails
  const failed = judgeOperation([...rows, sample('cua', 'warm', 0.01, { prepare_error: 'clipboard_read for a handle failed: x' })], opts);
  assert.equal(failed.pass, false);
  assert.match(failed.reasons.join('; '), /cua: 1 sample's preparation failed \(clipboard_read for a handle failed: x\)/);
  assert.equal(failed.engines.cua.exact.warm, 0.1, 'its time is out of the median');
  // a vendor build's failed preparation is recorded and leaves the bar alone
  const vendor = judgeOperation([...rows, sample('pinned', 'warm', 0.01, { prepare_error: 'x' }), sample('pinned', 'warm', 0.01, { prepare_error: 'x' })], opts);
  assert.equal(vendor.pass, true, vendor.reasons.join('; '));
  assert.equal(vendor.bar.warm, 0.2);
});

test('both Copy attempts failing give the sample a handle no engine issued, and its verdict fails', async () => {
  const requests = [];
  const ctx = {
    scene: { id: 7, field: 'f' },
    desktop: { oracle: { select: () => true, text: () => 'cua171 differential scene' } },
    engine: {
      request: async (command, input) => {
        requests.push(command);
        return { response: { ok: false, error: 'editable element has no selected text to Copy' } };
      },
    },
  };
  assert.equal(await handleOfFirstWord(ctx), NO_HANDLE);
  assert.deepEqual(requests, ['clipboard_read', 'clipboard_read'], 'tried twice');
  assert.match(ctx.prepareError, /^clipboard_read for a handle failed: editable element has no selected text to Copy/);
  // the release that follows answers success, fast; the sample still fails cua's verdict
  const rows = [sample('pinned', 'cold', 1), sample('pinned', 'warm', 0.2), sample('cua', 'cold', 0.5), sample('cua', 'warm', 0.05, { prepare_error: ctx.prepareError })];
  assert.equal(judgeOperation(rows, { vendors: VENDORS, candidate: 'cua', text: true }).pass, false);
});

// ---------------------------------------------------------------------------------------------------------------
// the noise rule's bound

test('the noise bound is max(5% of the bar, 1 ms)', () => {
  assert.equal(noiseBound(86.5), 86.5 * 0.05);
  assert.equal(noiseBound(0.12), 1);
  assert.equal(noiseBound(20), 1);
});

/** `n` samples spread evenly over [centre - spread, centre + spread], in an interleaved order. */
const spread = (centre, width, n = 31) => Array.from({ length: n }, (_, i) => centre - width + (2 * width * ((i * 7) % n)) / (n - 1));

test('a differential verdict whose interval includes 0 but reaches past the bound is undetermined, so it fails', () => {
  const series = (engine, values) => values.map((ms, i) => ({ engine, series: i === 0 ? 'cold' : 'warm', ms: i === 0 ? 1 : ms, ok: true }));
  // a bar of 10 ms: the bound is 1 ms; cua's samples spread over ±8 ms, its median a little above the bar's
  const rows = [...series('pinned', spread(10, 0.1)), ...series('newest', spread(10.5, 0.1)), ...series('cua', spread(10.05, 8))];
  const v = judgeOperation(rows, { vendors: VENDORS, candidate: 'cua', noise: medianDifferenceInterval });
  const interval = medianDifferenceInterval(rows.filter((r) => r.engine === 'cua' && r.series === 'warm').map((r) => r.ms), rows.filter((r) => r.engine === 'pinned' && r.series === 'warm').map((r) => r.ms));
  assert.ok(interval[0] <= 0 && interval[1] > 1, `the interval ${interval} includes 0 and reaches past 1 ms`);
  assert.equal(v.pass, false);
  assert.equal(v.noise.length, 0);
  assert.match(v.reasons.join('; '), /cua: warm .* ms > bar 10 ms, undetermined: the interval \[.*\] reaches past 1 ms/);
  // the same spread, narrow: a pass within noise
  const narrow = [...series('pinned', spread(10, 0.1)), ...series('newest', spread(10.5, 0.1)), ...series('cua', spread(10.01, 0.1))];
  assert.equal(judgeOperation(narrow, { vendors: VENDORS, candidate: 'cua', noise: medianDifferenceInterval }).noise.length, 1);
});

/** A desktop group of `n` block samples an engine, the engines' times around their centres. */
function blocks(centres, width, n = 31) {
  const records = Object.fromEntries(Object.entries(centres).map(([label, centre]) => [label, spread(centre, label === 'cua' ? width : 0.05, n).map((ms, i) => ({ command: 'click', scenario: 'desktop click', round: i, step: 0, ms, first: true }))]));
  return [{ route: 'desktop', records }];
}

test('a desktop group whose interval includes 0 but is wide is undetermined until its samples are final, then fails', () => {
  const wide = blocks({ pinned: 10, newest: 10.5, cua: 10.05 }, 8);
  const first = eventSpeeds([], { blocks: wide, gaps: [], final: false })[0];
  assert.ok(first.interval[0] <= 0 && first.interval[1] > 1, `${first.interval}`);
  assert.equal(first.verdict, 'undetermined');
  assert.equal(first.pass, null);
  assert.equal(eventsPass({ answers: true, speeds: [first], via: 'wire' }), false, 'an undetermined group is not a pass');
  const last = eventSpeeds([], { blocks: wide, gaps: [] })[0];
  assert.equal(last.verdict, 'fail');
  assert.equal(last.wide, true);
  // a declared gap still stands as the declared gap
  const gap = { op: 'click', route: 'desktop', series: 'first', reason: 'r', section: 'M4' };
  assert.equal(eventSpeeds([], { blocks: wide, gaps: [gap] })[0].verdict, 'declared gap');
  // narrow, it is the same within noise
  assert.equal(eventSpeeds([], { blocks: blocks({ pinned: 10, newest: 10.5, cua: 10.01 }, 0.1), gaps: [] })[0].verdict, 'same (within noise)');
});

// ---------------------------------------------------------------------------------------------------------------
// declared parity

test('the declared parity list names the cold desktop screenshot and its Decision Log entry', () => {
  assert.deepEqual(PARITY.map(({ op, scene, series }) => ({ op, scene, series })), [{ op: 'get_screenshot', scene: 'desktop', series: 'cold' }]);
  assert.match(PARITY[0].section, /Decision Log, M1a\.4/);
  assert.equal(declaredParity({ op: 'get_screenshot', scene: 'desktop', series: 'cold' }), PARITY[0]);
  assert.equal(declaredParity({ op: 'get_screenshot', scene: 'desktop', series: 'warm' }), null);
  assert.equal(declaredParity({ op: 'get_screenshot', scene: 'gedit', series: 'cold' }), null);
});

test("a listed operation above the bar is parity when cua's median lies within the bar's own spread of cold samples, else it fails", () => {
  const shot = (engine, cold, warm = [25, 25, 25]) => [...cold.map((ms) => sample(engine, 'cold', ms)), ...warm.map((ms) => sample(engine, 'warm', ms))];
  // m2-wire's cold samples: the pinned build sets the bar (33.58), spread 32.22-40.05; cua 36.44
  const rows = [...shot('pinned', [40.05, 32.22, 33.58], [29, 29, 29]), ...shot('newest', [39.44, 37.46, 38.97], [29, 29, 29]), ...shot('cua', [31.68, 36.85, 36.44], [24.6, 24.6, 24.6])];
  const parity = declaredParity({ op: 'get_screenshot', scene: 'desktop', series: 'cold' });
  const v = judgeOperation(rows, { vendors: VENDORS, candidate: 'cua', parity: [parity] });
  assert.equal(v.pass, false, 'parity is not a pass');
  assert.equal(v.verdict, 'parity');
  assert.deepEqual(v.reasons, []);
  assert.deepEqual(v.parity, [{ series: 'cold', candidate: 36.44, bar: 33.58, against: 'pinned', spread: [32.22, 40.05], section: parity.section }]);
  // outside the spread: a loss
  const slow = [...rows.filter((r) => r.engine !== 'cua'), ...shot('cua', [41, 42, 43], [24.6, 24.6, 24.6])];
  const lost = judgeOperation(slow, { vendors: VENDORS, candidate: 'cua', parity: [parity] });
  assert.equal(lost.verdict, 'fail');
  assert.match(lost.reasons.join(), /cold 42 ms > bar 33.58 ms, outside the bar's spread \[32.22, 40.05\]/);
  // an unlisted operation is unaffected
  assert.equal(judgeOperation(rows, { vendors: VENDORS, candidate: 'cua' }).verdict, 'fail');
  // the warm series is not listed: a warm loss fails even with the cold parity
  const warmLoss = [...rows.filter((r) => r.engine !== 'cua'), ...shot('cua', [36.44, 36.44, 36.44], [30, 30, 30])];
  assert.equal(judgeOperation(warmLoss, { vendors: VENDORS, candidate: 'cua', parity: [parity] }).verdict, 'fail');
});

test('a parity verdict neither fails the run nor counts as a pass', () => {
  const verdict = (pass, extra = {}) => ({ kind: 'verdict', candidate: 'cua', scene: 'desktop', op: 'get_screenshot', pass, reasons: [], ...extra });
  const outcome = runOutcome([verdict(true), verdict(false, { verdict: 'parity', parity: [{ series: 'cold' }] })], { valid: true });
  assert.deepEqual(outcome, { valid: true, pass: true, failed: [], parity: ['desktop get_screenshot cua'], code: 0 });
  assert.equal(runOutcome([verdict(false, { verdict: 'fail', reasons: ['x'] })], { valid: true }).code, 1);
});

// ---------------------------------------------------------------------------------------------------------------
// the safety cases' cleanup

test('a safety case that throws mid-setup still ends every engine it started', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-cases-'));
  try {
    // an engine that answers nothing and lives until its stdin closes
    const bin = join(dir, 'engine');
    writeFileSync(bin, '#!/bin/sh\ncat >/dev/null\n');
    chmodSync(bin, 0o755);
    const cases = new Cases({ desktop: { oracle: {} }, witness: null, cua: bin, emit: () => {}, settle: async () => ({}) });
    const started = [];
    const released = [];
    await assert.rejects(
      cases.guarded(async () => {
        started.push(cases.engine(), cases.engine());
        cases.defer(() => released.push('owner'));
        cases.defer(() => {
          throw new Error('a window already gone');
        });
        cases.defer(() => released.push('target'));
        throw new Error('setup failed half-way');
      }),
      /setup failed half-way/,
    );
    for (const engine of started) assert.notEqual(engine.child.exitCode ?? engine.child.signalCode, null, 'the engine exited');
    assert.deepEqual(released, ['target', 'owner'], "every cleanup ran, newest first, past one that threw");
    // nothing is left for the next case
    await cases.guarded(async () => true);
    assert.deepEqual(released, ['target', 'owner']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
