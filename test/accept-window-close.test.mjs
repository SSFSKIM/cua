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

// FrontWindowProbe's `windows <pid>` exits 3 with {"error"} when the window server's list cannot be read: the reading
// fails, never an empty list (the fixture's cleanup reads an empty list as "no document left" and may quit TextEdit).
test('readWindows fails closed on the probe\'s own failure, a malformed reading, or a reading of another pid', async () => {
  const exec = answer => async (file, args) => {
    assert.equal(file, '/usr/bin/swift');
    assert.deepEqual(args.slice(1), ['windows', '7']);
    return answer();
  };
  const exited = () => { throw Object.assign(new Error('Command failed'), {code: 3, stdout: '{"error":"the window list could not be read"}\n'}); };
  assert.equal(await readWindows([7], {exec: exec(exited)}), null);
  for (const stdout of ['{"error":"the window list could not be read"}', '{"at":1,"pid":7}', '{"at":1,"pid":8,"windows":[]}', 'not json']) {
    assert.equal(await readWindows([7], {exec: exec(() => ({stdout}))}), null, stdout);
  }
  assert.deepEqual(await readWindows([7], {exec: exec(() => ({stdout: '{"at":1,"pid":7,"hidden":false,"windows":[]}'}))}), []);
});

// The default reading drops windows with no visible size or a zero alpha; cleanup, which may quit the app on an empty
// list, asks for the unfiltered inventory (`windows <pid> --all`), and only the probe's answer that it is unfiltered
// counts as one: a filtered list is never taken for it.
test('readWindows({all: true}) asks for the unfiltered inventory and accepts only an answer that is one', async () => {
  const seen = [];
  const exec = stdout => async (file, args) => { seen.push(args.slice(1)); return {stdout}; };
  const invisible = {ownerPid: 7, number: 71, bounds: {x: 0, y: 0, width: 0, height: 0}, onScreen: false};
  assert.deepEqual(await readWindows([7], {all: true, exec: exec(JSON.stringify({at: 1, pid: 7, hidden: false, all: true, windows: [invisible]}))}),
    [{ownerPid: 7, number: 71, onScreen: false, bounds: {x: 0, y: 0, width: 0, height: 0}}]);
  assert.deepEqual(seen, [['windows', '7', '--all']]);
  assert.equal(await readWindows([7], {all: true, exec: exec('{"at":1,"pid":7,"hidden":false,"windows":[]}')}), null, 'a filtered answer is no inventory');
  seen.length = 0;
  await readWindows([7], {exec: exec('{"at":1,"pid":7,"hidden":false,"windows":[]}')});
  assert.deepEqual(seen, [['windows', '7']], 'the other callers keep the visible reading');
});
