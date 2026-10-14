// The native baseline's Linux cells run here against a scripted gedit desktop (no runtime, no X): finding and binding the
// run's own window by its unique file name, the observe -> pressKey -> verify -> clear task, and the method cases that
// record what typeText, paste and the Linux binder's explicit refusals do. Nothing a cell returns is screen content.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCell} from '../../scripts/native-baseline/cells.mjs';
import * as linux from '../../scripts/native-baseline/linux-cells.mjs';
import {geditDesktop} from './gedit-double.mjs';

const AsyncFunction = (async () => {}).constructor;
async function runCell(code, desktop) {
  const written = [];
  Object.assign(globalThis, {cua: desktop.cua, nodeRepl: {write: text => written.push(text)}});
  try { await new AsyncFunction(code)(); } finally { delete globalThis.cua; delete globalThis.nodeRepl; }
  assert.equal(written.length, 1);
  return parseCell(written[0]);
}
globalThis.__baselineTransitionMs = 300;
globalThis.__baselineWindowMs = 300;
const FILE = '/tmp/cua-native-baseline-AbC123/scratch-0a1b2c.txt';

async function bound(desktop = geditDesktop()) {
  const id = desktop.open(FILE);
  const found = await runCell(linux.findWindow('scratch-0a1b2c.txt'), desktop);
  assert.equal(found.ok, true, found.error);
  assert.deepEqual(found.value, {windowId: id, app: 'org.gnome.gedit', windows: 2});
  assert.deepEqual((await runCell(linux.bind(id), desktop)).value, {bound: true});
  return {desktop, id};
}

test('the run finds its own window by file name and binds it by X11 window id, returning no title', async () => {
  const {desktop} = await bound();
  assert.equal(typeof globalThis.app.pressKey, 'function');
  // Another window's title never selects it, and a window that does not appear fails the cell within its deadline.
  const missing = await runCell(linux.findWindow('scratch-ffffff.txt'), desktop);
  assert.equal(missing.ok, false);
  assert.match(missing.error, /the scratch window did not appear/);
  assert.throws(() => linux.findWindow('../evil'), /file name/);
  assert.throws(() => linux.bind(0), /window id/);
  assert.throws(() => linux.bind(1, 'globalThis.x'), /binding name/);
});

test('the observation cells return the tree\'s source and counts and the screenshot\'s shape, never text or bytes', async () => {
  const {desktop} = await bound();
  const ax = (await runCell(linux.AX_FULL, desktop)).value;
  assert.deepEqual(ax, {source: 'at_spi', chars: ax.chars, lines: 4, elements: 3});
  assert.doesNotMatch(JSON.stringify(ax), /gedit|scratch/);
});

test('a task types the sentence with pressKey, one keysym per call, verifies it and clears it; it never calls typeText', async () => {
  const {desktop, id} = await bound();
  const act = await runCell(linux.TASK_ACT, desktop);
  assert.deepEqual(act.value, {actions: linux.KEYS.length, observations: 1});
  assert.equal(desktop.windows.get(id).text, linux.SENTENCE);
  assert.deepEqual((await runCell(linux.TASK_VERIFY, desktop)).value, {observations: 1, present: true});
  const clear = await runCell(linux.TASK_CLEAR, desktop);
  assert.deepEqual({actions: clear.value.actions, cleared: clear.value.cleared}, {actions: 2, cleared: true});
  assert.equal(desktop.windows.get(id).text, '');
  assert.ok(!desktop.calls.some(c => c.method === 'type_text'));
  assert.deepEqual(desktop.calls.filter(c => c.method === 'press_key').slice(-2).map(c => c.key), linux.CLEAR_KEYS);
});

test('a task refuses to type into a window that already holds the sentence, and fails when the keys reach nothing', async () => {
  const {desktop, id} = await bound();
  desktop.windows.get(id).text = linux.SENTENCE;
  const refused = await runCell(linux.TASK_ACT, desktop);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /already holds the sentence; nothing was typed/);
  assert.equal(desktop.calls.filter(c => c.method === 'press_key').length, 0);
  const deaf = await bound(geditDesktop({ignoreKeys: true}));
  await runCell(linux.TASK_ACT, deaf.desktop);
  const verify = await runCell(linux.TASK_VERIFY, deaf.desktop);
  assert.equal(verify.ok, false);
  assert.match(verify.error, /the typed sentence is not in the scratch window/);
});

test('a method case records what the method did: the explicit Linux refusals, and typeText\'s GTK3 failure', async () => {
  const {desktop, id} = await bound();
  const outcome = async name => (await runCell(linux.METHOD_CASES[name].code, desktop)).value;
  assert.deepEqual(await outcome('method.setValue'), {outcome: 'threw', methodError: 'setValue is unavailable on Linux; use click, pressKey, and typeText.'});
  assert.deepEqual(await outcome('method.selectText'), {outcome: 'threw', methodError: 'selectText is unavailable on Linux.'});
  assert.deepEqual(await outcome('method.scroll.pages'), {outcome: 'threw', methodError: 'Linux scroll accepts { pixels }, not pages.'});
  assert.deepEqual(await outcome('method.paste.format'), {outcome: 'threw', methodError: 'Linux paste supports only text format.'});
  // None of the refusals sent input; the window is intact.
  assert.equal(desktop.calls.filter(c => c.method !== 'press_key').length, 0);
  assert.equal(desktop.windows.get(id).crashed, false);
  // typeText and paste run on a window of their own (`target`), which the GTK3 failure takes down.
  const victim = desktop.open('/tmp/cua-native-baseline-XyZ789/victim-111111.txt');
  await runCell(linux.bind(victim, '__target'), desktop);
  assert.deepEqual((await runCell(linux.METHOD_CASES['method.typeText'].code, desktop)).value, {outcome: 'threw', methodError: 'Resource temporarily unavailable (os error 11)'});
  assert.equal(desktop.windows.get(victim).crashed, true);
  assert.equal(linux.METHOD_CASES['method.typeText'].ownWindow, true);
  assert.equal(linux.METHOD_CASES['method.setValue'].ownWindow, false);
});

test('where typeText works, the inserted check reads the marker back from the target window', async () => {
  const desktop = geditDesktop({typeTextWorks: true});
  const victim = desktop.open('/tmp/cua-native-baseline-XyZ789/victim-222222.txt');
  await runCell(linux.bind(victim, '__target'), desktop);
  assert.deepEqual((await runCell(linux.METHOD_CASES['method.paste'].code, desktop)).value, {outcome: 'returned'});
  assert.deepEqual((await runCell(linux.INSERTED, desktop)).value, {inserted: true});
});
