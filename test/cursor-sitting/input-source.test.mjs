// The sitting's input-source switch (scripts/cursor-sitting/input-source.mjs): with the owner's yes recorded (and the
// source they were on kept), ABC for the judged series and their own source for the recorded ones and at the end; a
// selection counts only when the source read back is the one selected; with no yes, nothing is switched.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {CONSENT_FILE, LATIN_SOURCE, liveSourceSwitch, readConsent, selectionProblem, SOURCE_SCRIPT, sourceToSelect, switchSource, writeConsent} from '../../scripts/cursor-sitting/input-source.mjs';

const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-235-src-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };
const KOREAN = {id: 'com.apple.inputmethod.Korean.2SetKorean', name: '2-Set Korean'};
// A GitHub-hosted runner's environment, the only place a source is selected (ruling 1188); the owner's Mac's.
const HOSTED = {env: {RUNNER_ENVIRONMENT: 'github-hosted'}, platform: 'darwin'}, OWNERS_MAC = {env: {}, platform: 'darwin'};

// Ruling 1188: the input sources are how the owner types every day, so off a GitHub-hosted runner nothing selects one,
// the owner's yes recorded or not. The selection becomes a read: the step holds only when the source it needs is
// already the current one, so nothing is sent under another, and its result says nothing was written.
test('off a hosted runner no source is selected, even with the owner\'s yes: the current one is read instead, and the step holds only when it is the one needed', t => {
  const out = scratch(t), asked = [];
  writeConsent(out, {consent: true, reading: KOREAN});
  const sources = current => ({current: () => { asked.push('read'); return current; }, select: id => { asked.push(id); return {requested: id, status: 0, current: {id}}; }});
  const onKorean = switchSource({at: OWNERS_MAC, out, which: 'latin', sources: sources(KOREAN), beforeSelect: () => asked.push('marked')});
  assert.deepEqual([onKorean.ok, onKorean.switched, onKorean.written, onKorean.holds, onKorean.requested, onKorean.current], [false, false, false, false, LATIN_SOURCE, KOREAN]);
  assert.match(onKorean.problem, /needs com\.apple\.keylayout\.ABC, and the current source reads com\.apple\.inputmethod\.Korean\.2SetKorean: nothing is selected \(off a GitHub-hosted runner .*ruling 1188/);
  const onAbc = switchSource({at: OWNERS_MAC, out, which: 'latin', sources: sources({id: LATIN_SOURCE}), beforeSelect: () => asked.push('marked')});
  assert.deepEqual([onAbc.ok, onAbc.switched, onAbc.written, onAbc.holds, onAbc.problem], [true, false, false, true, undefined]);
  assert.match(onAbc.reason, /com\.apple\.keylayout\.ABC is already the current source: nothing selected/);
  assert.deepEqual(asked, ['read', 'read'], 'read only: never selected, never marked as an attempt');
  // The read goes under the same target check as a selection; a read that fails holds nothing.
  const covered = switchSource({at: OWNERS_MAC, out, which: 'owner', sources: sources(KOREAN), targetProblem: 'the frontmost is process 9'});
  assert.deepEqual([covered.ok, covered.written, covered.holds], [false, false, false]);
  assert.match(covered.problem, /not read: the frontmost is process 9/);
  const unread = switchSource({at: OWNERS_MAC, out, which: 'owner', sources: {current: () => { throw new Error('probe exited 1'); }}});
  assert.deepEqual([unread.ok, unread.written, unread.holds], [false, false, false]);
  assert.match(unread.problem, /the current input source could not be read \(probe exited 1\)/);
  assert.deepEqual(asked, ['read', 'read']);
  const ran = [];
  const live = liveSourceSwitch({at: OWNERS_MAC, compile: () => { ran.push('compile'); return '/bin/probe'; }, exec: (bin, args) => { ran.push(args.join(' ')); return '{"current":{"id":"com.apple.keylayout.ABC"}}'; }});
  assert.throws(() => live.select(LATIN_SOURCE), /GitHub-hosted runner/);
  assert.deepEqual(ran, []);
  assert.deepEqual(live.current(), {id: 'com.apple.keylayout.ABC'}, 'reading the current source is no selection');
});

test('the owner\'s answer is kept with the source they were on; one that cannot be read records nothing', t => {
  const out = scratch(t);
  const record = writeConsent(out, {consent: true, reading: KOREAN, now: () => 'then'});
  assert.deepEqual(record, {consent: true, at: 'then', owner: KOREAN});
  assert.deepEqual(readConsent(out), record);
  assert.deepEqual(JSON.parse(readFileSync(join(out, CONSENT_FILE), 'utf8')), record);
  assert.throws(() => writeConsent(scratch(t), {consent: true, reading: null}), /could not be read/);
  assert.equal(readConsent(scratch(t)), null);
});

test('ABC for the judged series, the owner\'s own for the recorded ones, nothing without a yes', () => {
  const yes = {consent: true, owner: KOREAN};
  assert.equal(sourceToSelect(yes, 'latin'), LATIN_SOURCE);
  assert.equal(LATIN_SOURCE, 'com.apple.keylayout.ABC');
  assert.equal(sourceToSelect(yes, 'owner'), KOREAN.id);
  assert.equal(sourceToSelect({...yes, consent: false}, 'latin'), null);
  assert.equal(sourceToSelect(null, 'owner'), null);
  assert.throws(() => sourceToSelect(yes, 'other'), /latin, owner or named/);
});

test('a selection holds only when the source read back is the one selected', () => {
  const ok = {requested: LATIN_SOURCE, status: 0, current: {id: LATIN_SOURCE, name: 'ABC'}};
  assert.equal(selectionProblem(ok, LATIN_SOURCE), null);
  assert.match(selectionProblem({...ok, current: KOREAN}, LATIN_SOURCE), /current source reads com\.apple\.inputmethod\.Korean\.2SetKorean/);
  assert.match(selectionProblem({...ok, status: null, current: KOREAN}, LATIN_SOURCE), /no enabled input source is com\.apple\.keylayout\.ABC/);
  assert.match(selectionProblem({...ok, status: -50}, LATIN_SOURCE), /refused \(status -50\)/);
  assert.match(selectionProblem(undefined, LATIN_SOURCE), /no answer/);
});

test('the switch task: selects from the recorded answer, fails closed on a wrong read-back, skips without a yes', t => {
  const out = scratch(t), asked = [];
  const sources = reads => ({select: id => { asked.push(id); return {requested: id, status: 0, current: {id: reads ?? id}}; }});
  assert.deepEqual(switchSource({at: HOSTED, out, which: 'latin', sources: sources()}), {ok: true, which: 'latin', switched: false, reason: 'no answer recorded (source consent): nothing is switched'});
  writeConsent(out, {consent: true, reading: KOREAN});
  assert.equal(switchSource({at: HOSTED, out, which: 'latin', sources: sources()}).ok, true);
  assert.equal(switchSource({at: HOSTED, out, which: 'owner', sources: sources()}).requested, KOREAN.id);
  const wrong = switchSource({at: HOSTED, out, which: 'latin', sources: sources(KOREAN.id)});
  assert.equal(wrong.ok, false);
  assert.match(wrong.problem, /current source reads/);
  assert.deepEqual(asked, [LATIN_SOURCE, KOREAN.id, LATIN_SOURCE]);
});

const hasSwiftc = process.platform === 'darwin' && (() => { try { execFileSync('/usr/bin/swiftc', ['--version'], {stdio: 'ignore'}); return true; } catch { return false; } })();
test('the probe type-checks (it is never run by the tests: selecting would change this Mac\'s keyboard)', {skip: hasSwiftc ? false : 'needs swiftc'}, () => {
  execFileSync('/usr/bin/swiftc', ['-typecheck', SOURCE_SCRIPT], {stdio: 'pipe', timeout: 300_000});
});

test('after a failure the owner\'s source is put back, if a selection was tried; nothing otherwise', async () => {
  const {restoreAfterFailure} = await import('../../scripts/cursor-sitting/input-source.mjs');
  const {mkdtempSync} = await import('node:fs');
  const out = mkdtempSync(join(tmpdir(), 'cua-235-src-'));
  writeConsent(out, {consent: true, reading: KOREAN});
  const asked = [];
  const sources = {select: id => { asked.push(id); return {requested: id, status: 0, current: {id}}; }};
  assert.equal(restoreAfterFailure({at: HOSTED, ctx: {sourceChanged: true}, out, sources}), null, 'a run that ended well keeps its source for the next series');
  assert.equal(restoreAfterFailure({at: HOSTED, ctx: {sourceChanged: false, error: new Error('x')}, out, sources}), null);
  assert.deepEqual(asked, []);
  const restored = restoreAfterFailure({at: HOSTED, ctx: {sourceChanged: true, error: new Error('x')}, out, sources});
  assert.equal(restored.ok, true);
  assert.deepEqual(asked, [KOREAN.id]);
  rmSync(out, {recursive: true, force: true});
});

test('the source is selected only for the scene\'s own window: its launch, its run window in front, and it on top of the frontmost app', async () => {
  const {sourceTargetProblem} = await import('../../scripts/cursor-sitting/input-source.mjs');
  const record = {id: 'textedit', pid: 11, window: {number: 70}};
  assert.equal(sourceTargetProblem({record, problem: null, frontmost: {pid: 11, topWindow: {number: 70}}}), null);
  assert.match(sourceTargetProblem({record, problem: 'the textedit app\'s front window is window 71, not the run\'s window 70', frontmost: {pid: 11, topWindow: {number: 71}}}), /window 71/);
  assert.match(sourceTargetProblem({record, problem: null, frontmost: {pid: 40, topWindow: {number: 3}}}), /frontmost is process 40/);
  assert.match(sourceTargetProblem({record, problem: null, frontmost: {pid: 11, topWindow: {number: 71}}}), /top window is 71, not the run window 70/);
  assert.match(sourceTargetProblem({record, problem: null, frontmost: null}), /frontmost is process none/);
  const out = mkdtempSync(join(tmpdir(), 'cua-235-src-'));
  writeConsent(out, {consent: true, reading: KOREAN});
  let selected = false;
  const refused = switchSource({at: HOSTED, out, which: 'latin', sources: {select: () => { selected = true; }}, targetProblem: 'another TextEdit window is on top'});
  assert.equal(refused.ok, false);
  assert.equal(selected, false, 'nothing selected');
  assert.match(refused.problem, /not selected: another TextEdit window is on top/);
  rmSync(out, {recursive: true, force: true});
});

test('an attempt is marked only right before the TIS call: never for a refused target or no yes, always for a failed read-back', () => {
  const out = mkdtempSync(join(tmpdir(), 'cua-235-src-'));
  const marks = [];
  const mark = label => () => marks.push(label);
  const select = reads => ({select: id => ({requested: id, status: 0, current: {id: reads ?? id}})});
  switchSource({at: HOSTED, out, which: 'latin', sources: select(), beforeSelect: mark('no yes')});
  writeConsent(out, {consent: true, reading: KOREAN});
  switchSource({at: HOSTED, out, which: 'latin', sources: select(), targetProblem: 'an owner window is on top', beforeSelect: mark('refused')});
  const wrong = switchSource({at: HOSTED, out, which: 'latin', sources: select(KOREAN.id), beforeSelect: mark('read back wrong')});
  assert.equal(wrong.ok, false);
  switchSource({at: HOSTED, out, which: 'latin', sources: select(), beforeSelect: mark('selected')});
  assert.deepEqual(marks, ['read back wrong', 'selected']);
  rmSync(out, {recursive: true, force: true});
});

test('the restore after a failure: also after an ordinary failed result, and never onto a window that is not the scene\'s', async () => {
  const {restoreAfterFailure} = await import('../../scripts/cursor-sitting/input-source.mjs');
  const out = mkdtempSync(join(tmpdir(), 'cua-235-src-'));
  writeConsent(out, {consent: true, reading: KOREAN});
  const asked = [];
  const sources = {select: id => { asked.push(id); return {requested: id, status: 0, current: {id}}; }};
  assert.equal(restoreAfterFailure({at: HOSTED, ctx: {sourceChanged: true, failed: 1}, out, sources}).ok, true, 'a cell that answered ok: false');
  assert.deepEqual(asked, [KOREAN.id]);
  const left = restoreAfterFailure({at: HOSTED, ctx: {sourceChanged: true, error: new Error('x')}, out, sources, targetProblem: 'an owner window is on top'});
  assert.equal(left.ok, false);
  assert.equal(left.left, true);
  assert.match(left.problem, /left as it is: an owner window is on top; .*source restore/);
  assert.deepEqual(asked, [KOREAN.id], 'nothing selected onto the owner\'s window');
  rmSync(out, {recursive: true, force: true});
});

test('a named source is selected only with the owner\'s yes, and read back like the others', () => {
  const id = 'com.apple.inputmethod.Korean.2SetKorean';
  assert.equal(sourceToSelect({consent: true, owner: {id: LATIN_SOURCE}}, 'named', id), id);
  assert.equal(sourceToSelect({consent: false, owner: {id: LATIN_SOURCE}}, 'named', id), null);
  assert.throws(() => sourceToSelect({consent: true, owner: {id: LATIN_SOURCE}}, 'named'), /names its source/);
  const out = mkdtempSync(join(tmpdir(), 'cua-235-src-'));
  writeConsent(out, {consent: true, reading: {id: LATIN_SOURCE, name: 'ABC'}});
  const asked = [];
  const result = switchSource({at: HOSTED, out, which: 'named', id, sources: {select: s => { asked.push(s); return {requested: s, status: 0, current: {id: s}}; }}});
  assert.equal(result.ok, true);
  assert.deepEqual(asked, [id]);
  assert.equal(switchSource({at: HOSTED, out, which: 'named', id, sources: {select: s => ({requested: s, status: 0, current: {id: LATIN_SOURCE}})}}).ok, false, 'a wrong read-back fails closed');
  rmSync(out, {recursive: true, force: true});
});
