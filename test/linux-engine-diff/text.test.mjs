// M2.3's text scenes and paste safety cases in the differential harness (#171,
// docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Acceptance 6; Plan of Work, M2): the pure judges.

import assert from 'node:assert/strict';
import test from 'node:test';

import { judgeForegroundSpan, raisedOnly } from '../../scripts/linux-engine-diff/witness.mjs';
import { landed, occurrences } from '../../scripts/linux-engine-diff/text.mjs';
import {
  judgeConcurrent,
  judgeContention,
  judgeLateConvert,
  judgeRefusal,
  judgeUnconfirmed,
} from '../../scripts/linux-engine-diff/safety-judge.mjs';

const TEXT = 'cua171 안녕 é 🙂\nline2';
const UNCONFIRMED = 'Paste was sent once and could not be confirmed; read the field before retrying';
const CHANGED = 'requested field or selection changed before dispatch; nothing was sent';

test('a paste landed exactly once at the caret, counted in characters, not UTF-16 units', () => {
  const before = { text: '🙂ab', caret: 2, selection: null };
  assert.equal(landed(before, { text: `🙂a${TEXT}b` }, TEXT), true);
  assert.equal(landed(before, { text: `🙂a${TEXT}${TEXT}b` }, TEXT), false, 'twice is not once');
  assert.equal(landed(before, { text: `🙂ab${TEXT}` }, TEXT), false, 'at another place');
  assert.equal(landed(before, { text: '🙂ab' }, TEXT), false, 'not at all');
  assert.equal(landed(before, { text: `🙂a${TEXT.normalize('NFC')}b` }, TEXT), false, 'the combining mark is kept as sent');
  assert.equal(landed(before, null, TEXT), null);
  assert.equal(landed({ text: null, caret: 0 }, { text: 'x' }, TEXT), null);
});

test('a paste over a selection replaces exactly the selection', () => {
  const before = { text: 'cua171 differential scene', caret: 6, selection: [0, 6] };
  assert.equal(landed(before, { text: `${TEXT} differential scene` }, TEXT), true);
  assert.equal(landed(before, { text: `cua171${TEXT} differential scene` }, TEXT), false, 'inserted at the caret, the selection kept');
});

test('occurrences count non-overlapping copies of a marker', () => {
  assert.equal(occurrences('a-m1-b-m1', 'm1'), 2);
  assert.equal(occurrences('', 'm1'), 0);
});

test('the stacking order may change only by the target rising to the top', () => {
  assert.equal(raisedOnly([1, 2, 3], [1, 3, 2], 2), true);
  assert.equal(raisedOnly([1, 2, 3], [1, 2, 3], 3), true, 'already on top');
  assert.equal(raisedOnly([1, 2, 3], [2, 1, 3], 3), false, 'another window moved');
  assert.equal(raisedOnly([1, 2, 3], [1, 3, 2, 4], 2), false, 'a window appeared');
  assert.equal(raisedOnly([1, 3], [1, 3, 2], 2), false, 'the target was not listed before');
});

test("the foreground route's witness allows the target's activation and the pointer, nothing else", () => {
  const target = 0x1200005;
  // the spans carry the restack record (judgeRestacks): here nothing was restacked
  const facts = { target, frame: 0x47a900, focusWithin: (w) => w === target || w === target + 1 };
  const none = { tree: [], restacks: [], focus: [] };
  const report = {
    ...none,
    changes: [
      { field: 'active', notify: true },
      { field: 'active', from: [0x400001], to: [target] },
      { field: 'stacking', notify: true },
      { field: 'stacking', from: [0x400001, target, 0x400003], to: [0x400001, 0x400003, target] },
      { field: 'focus', from: 0x400002, to: target + 1 },
      { field: 'pointer', from: [1, 2], to: [3, 4] },
    ],
  };
  assert.deepEqual(judgeForegroundSpan(report, facts), { clean: true, fields: [], allowed: ['active', 'stacking', 'focus', 'pointer'] });
  assert.deepEqual(judgeForegroundSpan({ ...none, changes: [] }, facts), { clean: true, fields: [], allowed: [] });
  // the window manager passes through no active window and no focus on its way to the target
  const through = {
    ...none,
    changes: [
      { field: 'active', from: [0x400001], to: [0] },
      { field: 'focus', from: 0x400002, to: 1 },
      { field: 'active', from: [0], to: [target] },
      { field: 'focus', from: 1, to: target },
    ],
  };
  assert.deepEqual(judgeForegroundSpan(through, facts), { clean: true, fields: [], allowed: ['active', 'focus'] });
  // but not to end there
  assert.deepEqual(judgeForegroundSpan({ ...none, changes: [through.changes[0]] }, facts).fields, ['active']);
  assert.deepEqual(judgeForegroundSpan({ ...none, changes: [through.changes[1]] }, facts).fields, ['focus']);
  const elsewhere = { ...none, changes: [{ field: 'active', from: [target], to: [0x400001] }] };
  assert.deepEqual(judgeForegroundSpan(elsewhere, facts).fields, ['active'], 'the active window went to another window');
  assert.deepEqual(judgeForegroundSpan({ ...none, changes: [{ field: 'focus', from: target, to: 0x400002 }] }, facts).fields, ['focus']);
  assert.deepEqual(judgeForegroundSpan({ ...none, changes: [{ field: 'protocol', note: 'x' }] }, facts).fields, ['protocol']);
  assert.equal(judgeForegroundSpan({ error: 'no span' }, facts).clean, false);
});

test('each change of the stacking order is judged: only the target rises', () => {
  const [a, b, target] = [0x400001, 0x400002, 0x1200005];
  const facts = { target, frame: 0x47a900, focusWithin: (w) => w === target };
  const none = { tree: [], restacks: [], focus: [] };
  // another window raised and the order restored: the orders before and after the span are the same
  const raisedAndRestored = {
    ...none,
    changes: [
      { field: 'stacking', notify: true },
      { field: 'stacking', from: [a, b, target], to: [a, target, b] },
      { field: 'stacking', notify: true },
      { field: 'stacking', from: [a, target, b], to: [a, b, target] },
    ],
  };
  assert.deepEqual(judgeForegroundSpan(raisedAndRestored, facts).fields, ['stacking'], 'the restore is the target rising, the raise before it is not');
  // the target's raise followed by another window's
  const thenAnother = { ...none, changes: [{ field: 'stacking', from: [target, a, b], to: [a, b, target] }, { field: 'stacking', from: [a, b, target], to: [b, target, a] }] };
  assert.deepEqual(judgeForegroundSpan(thenAnother, facts).fields, ['stacking']);
  // a window that appears is not the target's raise
  assert.deepEqual(judgeForegroundSpan({ ...none, changes: [{ field: 'stacking', from: [a, target], to: [a, target, b] }] }, facts).fields, ['stacking']);
  // a notify that leaves the order as it was (the window manager rewriting it, the target already on top) is allowed
  assert.deepEqual(judgeForegroundSpan({ ...none, changes: [{ field: 'stacking', notify: true }] }, facts), { clean: true, fields: [], allowed: ['stacking'] });
  // a change recorded without its orders (a witness that records only the lengths) cannot be judged
  assert.deepEqual(judgeForegroundSpan({ ...none, changes: [{ field: 'stacking', from_len: 3, to_len: 3 }] }, facts).fields, ['stacking']);
});

test('a refusal before dispatch passes only with its sentence, nothing in either field and the expected clipboard', () => {
  const fields = [
    { before: 'a', after: 'a' },
    { before: 'b', after: 'b' },
  ];
  const ok = { answer: { ok: false, error: CHANGED }, sentence: CHANGED, fields, clipboard: { ok: true, text: 'prior' }, expectClipboard: 'prior' };
  assert.deepEqual(judgeRefusal(ok), { pass: true, reasons: [] });
  assert.equal(judgeRefusal({ ...ok, answer: { ok: true, output: null } }).pass, false);
  assert.equal(judgeRefusal({ ...ok, answer: { ok: false, error: UNCONFIRMED } }).pass, false, 'sent');
  assert.equal(judgeRefusal({ ...ok, fields: [{ before: 'a', after: 'aX' }, fields[1]] }).pass, false, 'something arrived');
  assert.equal(judgeRefusal({ ...ok, clipboard: { ok: true, text: 'paste' } }).pass, false, 'the clipboard was not left as expected');
  // with an external takeover any refusal that says nothing was sent will do: which check sees it first is a race
  assert.equal(judgeRefusal({ ...ok, sentence: /; nothing was sent$/, answer: { ok: false, error: 'another program took the clipboard before the paste was sent; nothing was sent' } }).pass, true);
});

test('an unconfirmed answer passes only with the sentence, within its bound, and the field as the case expects', () => {
  const base = { answer: { ok: false, error: UNCONFIRMED }, ms: 2130, boundMs: 3000, field: { before: 'x', after: 'x' }, expectField: 'x', next: { ok: true, ms: 3 } };
  assert.deepEqual(judgeUnconfirmed(base), { pass: true, reasons: [] });
  assert.equal(judgeUnconfirmed({ ...base, ms: 3500 }).pass, false, 'past the bound');
  assert.equal(judgeUnconfirmed({ ...base, answer: { ok: true, output: null } }).pass, false, 'a success');
  assert.equal(judgeUnconfirmed({ ...base, answer: { ok: false, error: CHANGED } }).pass, false, 'a not-applied sentence would invite a retry');
  assert.equal(judgeUnconfirmed({ ...base, field: { before: 'x', after: 'xy' } }).pass, false);
  assert.equal(judgeUnconfirmed({ ...base, next: { ok: true, ms: 1500 } }).pass, false, 'the request queue was still held');
  assert.equal(judgeUnconfirmed({ ...base, next: null }).pass, true, 'no next request asked for');
});

test('a late conversion is either served the paste itself or refused, never the snapshot', () => {
  const base = { answer: { ok: false, error: UNCONFIRMED }, received: [{ received: 'refused' }], paste: 'M', prior: 'P', mustRefuse: true };
  assert.equal(judgeLateConvert(base).pass, true);
  assert.equal(judgeLateConvert({ ...base, received: [{ received: 'served', text: 'P' }] }).pass, false, 'the snapshot served as the paste');
  assert.equal(judgeLateConvert({ ...base, received: [{ received: 'served', text: 'M' }] }).pass, false, 'past the cleanup it must be refused');
  assert.equal(judgeLateConvert({ ...base, mustRefuse: false, received: [{ received: 'served', text: 'M' }] }).pass, true, 'before the cleanup the paste itself');
  assert.equal(judgeLateConvert({ ...base, received: [] }).pass, false, 'the conversion never answered');
  assert.equal(judgeLateConvert({ ...base, answer: { ok: true, output: null } }).pass, false);
});

test('concurrent pastes each land once in their own field, and the prior clipboard stays', () => {
  // each lands at its own field's caret: the second's is before a trailing newline
  const fields = [
    { before: { text: 'a ', caret: 2, selection: null }, after: 'a M1', marker: 'M1' },
    { before: { text: 'b \n', caret: 2, selection: null }, after: 'b M2\n', marker: 'M2' },
  ];
  const base = { answers: [{ ok: true }, { ok: true }], fields, clipboard: { ok: true, text: 'P' }, prior: 'P' };
  assert.deepEqual(judgeConcurrent(base), { pass: true, reasons: [] });
  assert.equal(judgeConcurrent({ ...base, fields: [{ ...fields[0], after: 'a M2' }, fields[1]] }).pass, false, 'cross-delivered');
  assert.equal(judgeConcurrent({ ...base, fields: [{ ...fields[0], after: 'a M1M1' }, fields[1]] }).pass, false, 'twice');
  assert.equal(judgeConcurrent({ ...base, clipboard: { ok: true, text: 'M1' } }).pass, false, 'a stale clipboard restored');
  assert.equal(judgeConcurrent({ ...base, answers: [{ ok: true }, { ok: false, error: 'clipboard busy' }] }).pass, false);
});

test("M2's scenes plan the text operations and the safety cases, and their kinds decide where they run", async () => {
  const { OPS, SCENE_OPS, inputOp, ownWindow } = await import('../../scripts/linux-engine-diff/ops.mjs');
  const { planOps } = await import('../../scripts/linux-engine-diff/run.mjs');
  for (const scene of ['chrome-textarea', 'chrome-address-bar', 'gnome-text-editor', 'paste-target']) assert.ok(SCENE_OPS[scene], scene);
  for (const op of ['type_text', 'type_text_selection', 'type_text_dedicated', 'type_characters', 'clipboard_read', 'clipboard_write', 'clipboard_release', 'caret_placed']) assert.ok(SCENE_OPS.gedit.includes(op), op);
  assert.deepEqual(SCENE_OPS['paste-target'], ['stalled_incr', 'late_convert', 'unreadable']);
  assert.equal(OPS.type_text.kind, 'text');
  assert.equal(OPS.concurrent.kind, 'case');
  assert.equal(ownWindow('type_text'), true);
  assert.equal(inputOp('type_text'), true, 'audited, its effect read back');
  assert.equal(inputOp('concurrent'), false, 'a case runs apart from the blocks');
  assert.deepEqual(OPS.type_text.cuaArgs('gnome-text-editor'), ['--desktop', 'dedicated']);
  assert.deepEqual(OPS.type_text.cuaArgs('gedit'), []);
  assert.deepEqual(OPS.type_text_dedicated.cuaArgs('gedit'), ['--desktop', 'dedicated']);
  assert.equal(OPS.type_text_dedicated.cuaOnly, true);
  assert.equal(OPS.type_characters.reference, 'newest');
  assert.deepEqual(planOps(['chrome-address-bar', 'paste-target'], 'all').filter((p) => p.scene !== 'desktop'), [
    { scene: 'chrome-address-bar', op: 'type_text' },
    { scene: 'paste-target', op: 'stalled_incr' },
    { scene: 'paste-target', op: 'late_convert' },
    { scene: 'paste-target', op: 'unreadable' },
  ]);
});

test("a text command's verdict: the bar from the vendor samples that succeeded, every cua request answered, its clipboard kept", async () => {
  const { judgeOperation } = await import('../../scripts/linux-engine-diff/stats.mjs');
  const row = (engine, series, ms, ok, extra = {}) => ({ engine, series, ms, ok, witness: true, effect: ok, ...extra });
  // the bar and the answers are judged here; speed needs 20 samples a side (speed-guard.test.mjs)
  const opts = { vendors: ['pinned', 'newest'], candidate: 'cua', text: true, judgeSpeed: false };
  const rows = [
    // the pinned build fails fast here and the newest succeeds slowly: the bar is the newest build's success
    row('pinned', 'cold', 12, false),
    row('pinned', 'warm', 10, false),
    row('newest', 'cold', 900, true),
    row('newest', 'warm', 840, true),
    row('cua', 'cold', 300, true, { clipboard_kept: true }),
    row('cua', 'warm', 140, true, { clipboard_kept: true }),
  ];
  const v = judgeOperation(rows, opts);
  assert.equal(v.pass, true, v.reasons.join('; '));
  assert.deepEqual(v.bar, { cold: 900, warm: 840 });
  // without the option the failures' times would set the bar
  assert.equal(judgeOperation(rows, { vendors: opts.vendors, candidate: 'cua' }).bar.warm, 10);
  // no vendor success: no bar, and speed is not judged
  const none = rows.filter((r) => r.engine !== 'newest');
  assert.deepEqual(judgeOperation(none, opts).bar, { cold: null, warm: null });
  assert.equal(judgeOperation(none, opts).pass, true);
  // a cua request that fails fails the verdict even where the vendor builds fail too
  assert.match(judgeOperation([...none.slice(0, 2), row('cua', 'cold', 5, false), row('cua', 'warm', 5, false)], opts).reasons.join(), /a request failed/);
  // the clipboard is judged on every cua sample
  const lost = rows.map((r) => (r.engine === 'cua' && r.series === 'warm' ? { ...r, clipboard_kept: false } : r));
  assert.match(judgeOperation(lost, opts).reasons.join(), /clipboard/);
});

test('a median above the bar whose bootstrap interval includes 0 is same within noise, with at least 20 samples a side', async () => {
  const { judgeOperation } = await import('../../scripts/linux-engine-diff/stats.mjs');
  const { medianDifferenceInterval } = await import('../../scripts/linux-engine-diff/events.mjs');
  // 21 cold samples each, the same: the warm series is the one judged here
  const series = (engine, values) => [...values.map((ms) => ({ engine, series: 'warm', ms, ok: true })), ...Array.from({ length: 21 }, () => ({ engine, series: 'cold', ms: 0.1, ok: true }))];
  const noisy = (base) => Array.from({ length: 31 }, (_, i) => base + ((i * 7) % 5) * 0.01);
  const rows = [...series('pinned', noisy(0.11)), ...series('newest', noisy(0.12)), ...series('cua', noisy(0.115))];
  const opts = { vendors: ['pinned', 'newest'], candidate: 'cua', noise: medianDifferenceInterval };
  const v = judgeOperation(rows, opts);
  assert.equal(v.pass, true, v.reasons.join('; '));
  // the cold series, the same in every engine, is the same within noise too
  assert.deepEqual(v.noise.map((n) => n.series).sort(), ['cold', 'warm']);
  // a real loss past the bound, its interval above 0, still fails
  const slow = [...series('pinned', noisy(0.11)), ...series('newest', noisy(0.12)), ...series('cua', noisy(1.5))];
  assert.equal(judgeOperation(slow, opts).pass, false);
  // fewer than 20 samples a side: undetermined, never judged on the medians
  const few = [...series('pinned', noisy(0.11).slice(0, 10)), ...series('newest', noisy(0.12).slice(0, 10)), ...series('cua', noisy(0.115).slice(0, 10))];
  const v10 = judgeOperation(few, opts);
  assert.equal(v10.pass, false);
  assert.deepEqual(v10.undetermined.map((u) => [u.series, u.samples]), [['warm', 10]]);
});

test('lock contention: each field holds exactly its own markers, in order, once each', () => {
  const a = ['A1', 'A2', 'A3'];
  const b = ['B1', 'B2'];
  const at = (text) => ({ text, caret: [...text].length, selection: null });
  const base = { answers: [...a, ...b].map(() => ({ ok: true })), fields: [{ before: at('x'), after: `x${a.join('')}`, markers: a }, { before: at('y'), after: `y${b.join('')}`, markers: b }], clipboard: { ok: true, text: 'P' }, prior: 'P' };
  assert.deepEqual(judgeContention(base), { pass: true, reasons: [] });
  assert.equal(judgeContention({ ...base, fields: [{ ...base.fields[0], after: 'xA1A3A2' }, base.fields[1]] }).pass, false, 'out of order');
  assert.equal(judgeContention({ ...base, fields: [{ ...base.fields[0], after: 'xA1A2A3B1' }, { ...base.fields[1], after: 'yB2' }] }).pass, false, 'crossed');
  assert.equal(judgeContention({ ...base, answers: [{ ok: false, error: 'clipboard busy' }, ...base.answers.slice(1)] }).pass, false);
});
