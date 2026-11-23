// The key-window requirement in the matrix run (ruling 1169's addition; scripts/hosted-sittings/alert-guard.mjs
// keyWindowCause): before a click or key cell bound to a scene, the device reads whether the scene's app holds the scene
// window as its own key window (`read --key-window <scene>`); a cell whose app does not is refused unsent, NO VERDICT
// `keyWindow`, on either engine alike; one whose reading was not taken is sent and counted. While TextEdit's Open panel
// is up, its focused window is the panel, by design: nothing is checked then.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {sampleCause} from '../../scripts/native-matrix/front-key.mjs';
import {CASES} from '../../scripts/native-matrix/plan.mjs';
import {planOf} from '../../scripts/native-matrix/run.mjs';
import {runWith} from './run-doubles.mjs';

const METHOD = planOf('method', {scene: 'electron'});
const caseOf = (target, method, kase) => CASES[target].find(c => c.method === method && c.case === kase);
const sent = (calls, code) => calls.some(c => c.code.includes(code));
const rowOf = (result, id) => result.rows.find(r => r.section === 'method' && r.id === id);
const keyScene = a => (a[0] === 'read' && a.includes('--key-window') ? a[a.indexOf('--key-window') + 1] : null);
// Every key-window read answered by `answer(scene)` (merged over a reading that holds).
const ownKeyBy = answer => ({matrix: (base, a) => {
  const out = base(a), scene = keyScene(a);
  return scene ? {...out, ownKey: {...out.ownKey, ...answer(scene)}} : out;
}});

test('the double\'s reading holds: every click and key cell of a scene is read for its key window and sent', async () => {
  const calls = [], reads = [];
  const {result} = await runWith({plan: METHOD, calls, ops: {matrix: (base, a) => { if (keyScene(a)) reads.push(keyScene(a)); return base(a); }}});
  assert.ok(reads.length > 0 && reads.every(s => s === 'electron' || s === 'finder'), JSON.stringify([...new Set(reads)]));
  assert.ok(sent(calls, caseOf('electron', 'click', 'button').act));
  assert.equal(result.meta.alertGuards, undefined);
  assert.equal(result.meta.keyWindowUnread, undefined);
});

test('a scene whose app holds no key window of its own: its click and key cells are refused unsent, NO VERDICT keyWindow, on cua and the vendor alike; the rest run', async () => {
  for (const engine of ['cua', 'vendor']) {
    const calls = [];
    const {result} = await runWith({engine, plan: METHOD, calls,
      ops: ownKeyBy(scene => (scene === 'electron' ? {frontmost: true, focusedWindow: 'none', mainWindow: 'run'} : {}))});
    assert.deepEqual(validateCellResult(result), [], engine);
    const button = rowOf(result, 'electron/frontmost/click.button');
    assert.equal(button.alertGuard?.cause, 'keyWindow', engine);
    assert.match(button.alertGuard.detail, /the electron app holds no key window .* while frontmost/);
    assert.equal(sampleCause({...button, hosted: true}).category, 'keyWindow');
    assert.ok(!sent(calls, caseOf('electron', 'click', 'button').act), `${engine}: the click was sent`);
    // A key cell alike: its keys never sent.
    const typed = rowOf(result, 'electron/frontmost/typeText.replace');
    assert.equal(typed.alertGuard?.cause, 'keyWindow', engine);
    assert.ok(!sent(calls, caseOf('electron', 'typeText', 'replace').act));
    // A cell that sends neither a pointer nor a key runs.
    assert.equal(rowOf(result, 'electron/frontmost/getAXState.tree').alertGuard, undefined, engine);
    assert.ok(result.meta.alertGuards.some(g => g.cause === 'keyWindow'));
  }
});

test('a background cell whose app keeps the scene window as its main window, with no window focused, is sent; one whose key window is another is refused', async () => {
  const calls = [];
  const {result} = await runWith({plan: METHOD, calls, ops: ownKeyBy(() => ({frontmost: false, focusedWindow: 'none', mainWindow: 'run'}))});
  assert.equal(rowOf(result, 'electron/background/click.button@finder').alertGuard, undefined);
  const other = await runWith({plan: METHOD, ops: ownKeyBy(() => ({frontmost: false, focusedWindow: 'other', mainWindow: 'other'}))});
  const row = rowOf(other.result, 'electron/background/click.button@finder');
  assert.equal(row.alertGuard?.cause, 'keyWindow');
  assert.match(row.alertGuard.detail, /key window is another of its windows/);
});

test('a key-window reading not taken: the cell is sent, counted per cell (meta.keyWindowUnread), never refused', async () => {
  const calls = [];
  const {result} = await runWith({plan: METHOD, calls, ops: ownKeyBy(() => ({trusted: false, ok: false}))});
  assert.ok(sent(calls, caseOf('electron', 'click', 'button').act));
  assert.equal(rowOf(result, 'electron/frontmost/click.button').alertGuard, undefined);
  const index = result.rows.findIndex(r => r.section === 'method' && r.id === 'electron/frontmost/click.button');
  assert.ok((result.meta.keyWindowUnread?.[`row:${index}`] ?? 0) > 0, JSON.stringify(result.meta.keyWindowUnread));
});

test('the Open panel up: TextEdit\'s focused window is the panel, and nothing is checked until it closes', async () => {
  const calls = [];
  let open = false;
  const cell = code => {
    if (code.includes('pressKey("super+o")')) { open = true; return {opened: true}; }
    if (code.includes('pressKey("Escape")')) { open = false; return {closed: true}; }
    return null;
  };
  const panelPlan = {id: 'test', frontmost: ['openPanel', 'textedit'], speed: false, finding: false, background: [], launch: []};
  const asked = [];
  const {result} = await runWith({plan: panelPlan, calls, cell, ops: {matrix: (base, a) => {
    const out = base(a), scene = keyScene(a);
    if (scene) asked.push({scene, open});
    return scene && open ? {...out, ownKey: {...out.ownKey, focusedWindow: 'other'}} : out;
  }}});
  assert.equal(result.complete, true, result.problems.join('; '));
  assert.deepEqual(asked.filter(a => a.open), [], 'no key-window read while the panel was up');
  assert.ok(asked.some(a => a.scene === 'textedit'), 'the document\'s cells (and ⌘O) were checked');
  assert.ok(result.rows.filter(r => r.id.startsWith('openPanel/')).every(r => r.alertGuard === undefined));
});
