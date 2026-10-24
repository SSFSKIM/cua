// The TextEdit fixture's close of its document, judged from TextEdit's windows by number (scripts/accept/window-close.mjs,
// #117 M3.4): no observation of TextEdit after super+w, which would reopen a windowless TextEdit (its Open panel).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {awaitClose, closeVerdict, readWindows} from '../scripts/accept/window-close.mjs';

const w = (number, ownerPid = 500) => ({ownerPid, number});
const DOC = w(41), OWNER = w(42);

test('the document\'s window gone and none left: closed, and TextEdit holds nothing of anyone else\'s', () => {
  assert.deepEqual(closeVerdict({before: [DOC], after: []}), {status: 'PASS', closed: true, alone: true, detail: 'super+w closed the verified fixture window; TextEdit then had no window at all'});
});

test('the document\'s window gone with another TextEdit window left: closed, not alone, the other left as it is', () => {
  const v = closeVerdict({before: [DOC, OWNER], after: [OWNER]});
  assert.deepEqual([v.status, v.closed, v.alone], ['PASS', true, false]);
  assert.match(v.detail, /1 other TextEdit window\(s\) remain, left as they are/);
});

test('nothing closed is a failure; a window that appeared or more than one gone cannot be judged; an unreadable list is not a pass', () => {
  assert.deepEqual(['status', 'closed', 'alone'].map(k => closeVerdict({before: [DOC], after: [DOC]})[k]), ['FAIL', false, false]);
  assert.equal(closeVerdict({before: [DOC], after: [w(43)]}).status, 'BLOCKED', 'a panel or sheet appeared in its place');
  assert.equal(closeVerdict({before: [DOC, OWNER], after: []}).status, 'BLOCKED');
  assert.equal(closeVerdict({before: [DOC], after: null}).status, 'BLOCKED');
  // A window is its owner and number together: the same number under another pid is another window.
  assert.equal(closeVerdict({before: [DOC], after: [w(41, 501)]}).status, 'BLOCKED');
  // Without the reading before, only an empty list after confirms the close.
  assert.deepEqual(['status', 'alone'].map(k => closeVerdict({before: null, after: []})[k]), ['PASS', true]);
  assert.equal(closeVerdict({before: null, after: [OWNER]}).status, 'BLOCKED');
});

test('the close is read again while the window lingers, and judged on the last reading', async () => {
  const readings = [[DOC], [DOC], []];
  let reads = 0;
  const slept = [];
  const verdict = await awaitClose({before: [DOC], read: async () => { reads++; return readings.shift(); }, sleep: async ms => { slept.push(ms); }});
  assert.equal(verdict.status, 'PASS');
  assert.equal(reads, 3);
  assert.deepEqual(slept, [500, 500]);
  const stuck = await awaitClose({before: [DOC], read: async () => [DOC], attempts: 3, sleep: async () => {}});
  assert.equal(stuck.status, 'FAIL');
});

test('readWindows lists every pid\'s windows by owner, number and whether on screen, and null when any reading fails', async () => {
  const probe = async pid => ({at: 1, pid, hidden: false, windows: [{ownerPid: pid, number: pid * 10, bounds: {x: 0, y: 0, width: 9, height: 9}, onScreen: pid === 7}]});
  assert.deepEqual(await readWindows([7, 8], {probe}), [{...w(70, 7), onScreen: true, bounds: {x: 0, y: 0, width: 9, height: 9}}, {...w(80, 8), onScreen: false, bounds: {x: 0, y: 0, width: 9, height: 9}}]);
  assert.deepEqual(await readWindows([], {probe}), []);
  assert.equal(await readWindows([7], {probe: async () => { throw new Error('swift failed'); }}), null);
});
