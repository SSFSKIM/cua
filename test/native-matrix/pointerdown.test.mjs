// Ruling 1168 (#534): the pointerdown-only cell. Web UI kits open menus on `pointerdown` (Radix-style triggers); cua
// presses a web button through AXPress where the vendor posts a click, so a button whose only handler is `pointerdown`
// is the cell that catches a press that dispatches no pointer event. The scene variants that carry the button (the
// Chrome page's `pointerdown` variant, the Electron fixture's `--cua-fixture-page=pointerdown`), the gating that keeps
// them out of every consumer but the matrix, the plan's two cells on doubles, the judge and the refused declaration.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as vm from 'node:vm';
import {createHash} from 'node:crypto';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseCell} from '../../scripts/native-baseline/cells.mjs';
import {judgeMethod} from '../../scripts/native-matrix/cell-verdict.mjs';
import {departureProblems, usableDepartures} from '../../scripts/native-matrix/departures.mjs';
import {POINTERDOWN_SWITCH} from '../../scripts/native-matrix/fixtures/electron-fixture.mjs';
import {CSP, PAGE_HTML, PAGE_VARIANTS, POINTERDOWN, POINTERDOWN_CSP, POINTERDOWN_LINE, POINTERDOWN_PAGE_HTML, POINTERDOWN_SCRIPT, SCRIPT, startScenePage}
  from '../../scripts/native-matrix/fixtures/scene-page.mjs';
import {caseCells} from '../../scripts/native-matrix/matrix-cells.mjs';
import {manifestOf} from '../../scripts/native-matrix/manifest.mjs';
import {CASES, casesOf, isPointerdownRow, MATRIX_SCENE_ARGS, POINTERDOWN_ROWS} from '../../scripts/native-matrix/plan.mjs';
import {FULL_PLAN, planOf} from '../../scripts/native-matrix/run.mjs';
import {args, runWith} from './run-doubles.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CHROME = 'chrome/frontmost/click.pointerdown', ELECTRON = 'electron/frontmost/click.pointerdown';
const caseOf = target => CASES[target].find(c => c.method === 'click' && c.case === 'pointerdown');

// ---- the scene variants ---------------------------------------------------------------------------------------------

// A DOM just large enough for the scene scripts: elements by id, created elements, listeners, `main`.
function fakeDom(search = '') {
  const byId = new Map();
  const element = tag => {
    const el = {tag, children: [], attributes: {}, listeners: {}, textContent: '', type: '', _id: '',
      get id() { return this._id; }, set id(v) { this._id = v; byId.set(v, this); },
      setAttribute(k, v) { this.attributes[k] = v; if (k === 'id') this.id = v; },
      append(...nodes) { this.children.push(...nodes); },
      addEventListener(type, f) { (this.listeners[type] ??= []).push(f); },
      fire(type) { for (const f of this.listeners[type] ?? []) f({type}); }};
    return el;
  };
  const main = element('main');
  for (const id of ['apply', 'name', 'status', 'notes', 'button', 'text']) { const el = element('x'); el.id = id; main.append(el); }
  const document = {getElementById: id => byId.get(id) ?? null, createElement: element, querySelector: s => (s === 'main' ? main : null)};
  const window = {listeners: {}, addEventListener(type, f) { (this.listeners[type] ??= []).push(f); }};
  return {main, byId, context: vm.createContext({document, window, location: {search}, URLSearchParams, navigator: {sendBeacon: () => true}, addEventListener: () => {}})};
}
const listenerTypes = el => Object.keys(el.listeners).sort();

test('the Chrome page\'s pointerdown variant: the shared page plus one line below every control and its script; the shared page unchanged', async () => {
  assert.ok(PAGE_VARIANTS.includes(POINTERDOWN.variant));
  // The shared page is byte-identical (every record so far was taken on it): removing the line and the script gives it back.
  assert.equal(createHash('sha256').update(PAGE_HTML).digest('hex'), '67d628ac5fbb8568140649e3ae68d0558e0940495b00275864a708b94b53ba84');
  assert.equal(POINTERDOWN_PAGE_HTML.replace(POINTERDOWN_LINE, '').replace(`<script>${POINTERDOWN_SCRIPT}</script>`, ''), PAGE_HTML);
  assert.doesNotMatch(PAGE_HTML, /Pointer/);
  // Below every control: after the status line, which is the page's last control.
  const status = POINTERDOWN_PAGE_HTML.indexOf('id="status"'), line = POINTERDOWN_PAGE_HTML.indexOf(POINTERDOWN_LINE);
  assert.ok(status > 0 && line > status, 'the line follows the status line');
  assert.ok(POINTERDOWN_LINE.includes(`>${POINTERDOWN.button}</button>`) && POINTERDOWN_LINE.includes(`aria-label="${POINTERDOWN.status}"`) && POINTERDOWN_LINE.includes(POINTERDOWN.text(0)));
  // Its CSP is the shared one with the script's hash added.
  const hash = createHash('sha256').update(POINTERDOWN_SCRIPT).digest('base64');
  assert.equal(POINTERDOWN_CSP.replace(` 'sha256-${hash}'`, ''), CSP);
  const page = await startScenePage({page: 'pointerdown'}), shared = await startScenePage();
  try {
    const served = await fetch(page.url);
    assert.equal(await served.text(), POINTERDOWN_PAGE_HTML);
    assert.equal(served.headers.get('content-security-policy'), POINTERDOWN_CSP);
    assert.equal(await (await fetch(shared.url)).text(), PAGE_HTML);
  } finally { await page.close(); await shared.close(); }
});

test('the Chrome page\'s button counts pointer downs only: no click handler, the count in its status line', () => {
  const {byId, main, context} = fakeDom();
  const button = {listeners: {}, addEventListener(type, f) { (this.listeners[type] ??= []).push(f); }, fire(type) { for (const f of this.listeners[type] ?? []) f({type}); }};
  const status = {textContent: POINTERDOWN.text(0)};
  byId.set('pointer', button); byId.set('pointer-status', status);
  vm.runInContext(SCRIPT, context);
  vm.runInContext(POINTERDOWN_SCRIPT, context);
  assert.deepEqual(listenerTypes(button), ['pointerdown']);
  button.fire('click');
  assert.equal(status.textContent, POINTERDOWN.text(0), 'a click without a pointer down counts nothing');
  button.fire('pointerdown'); button.fire('pointerdown');
  assert.equal(status.textContent, POINTERDOWN.text(2));
  assert.equal(main.children.length, 6, 'the page script adds nothing');
});

const FIXTURE = join(ROOT, 'scripts/native-matrix/fixtures/electron');
const RENDERER = fs.readFileSync(join(FIXTURE, 'renderer.js'), 'utf8');
test('the Electron fixture: the second button exists only under ?page=pointerdown, counting pointer downs only', () => {
  // Without the flag (every consumer but the matrix): the DOM is the fixture's as recorded.
  const plain = fakeDom('');
  vm.runInContext(RENDERER, plain.context);
  assert.equal(plain.main.children.length, 6);
  assert.equal(plain.byId.get('pointer'), undefined);
  // index.html itself is unchanged: the line is the renderer's, under the flag.
  assert.doesNotMatch(fs.readFileSync(join(FIXTURE, 'index.html'), 'utf8'), /Pointer|pointer/);
  const flagged = fakeDom('?page=pointerdown');
  vm.runInContext(RENDERER, flagged.context);
  assert.equal(flagged.main.children.length, 7, 'one line, appended below every control');
  const button = flagged.byId.get('pointer'), status = flagged.byId.get('pointer-status');
  assert.deepEqual([button.textContent, button.type], [POINTERDOWN.button, 'button']);
  assert.deepEqual([status.attributes.role, status.attributes['aria-label'], status.textContent], ['status', POINTERDOWN.status, POINTERDOWN.text(0)]);
  assert.deepEqual(listenerTypes(button), ['pointerdown']);
  button.fire('click');
  assert.equal(status.textContent, POINTERDOWN.text(0));
  button.fire('pointerdown');
  assert.equal(status.textContent, POINTERDOWN.text(1));
  // The fixture's own button keeps its click counting.
  assert.deepEqual(listenerTypes(flagged.byId.get('button')), ['click']);
});

test('the Electron fixture loads the flagged page only when launched with the matrix\'s switch', () => {
  assert.equal(POINTERDOWN_SWITCH, '--cua-fixture-page=pointerdown');
  const main = fs.readFileSync(join(FIXTURE, 'main.js'), 'utf8');
  assert.match(main, /argument\('cua-fixture-page'\) === 'pointerdown'/);
  assert.match(main, /loadFile\(path\.join\(__dirname, 'index\.html'\), pointerdown \? \{query: \{page: 'pointerdown'\}\} : \{\}\)/);
});

// ---- the gating: no consumer but the matrix gets the variant ------------------------------------------------------------

test('only the matrix\'s run brings the scenes up with the variants; every other up caller loads the shared page and fixture', async () => {
  assert.deepEqual(MATRIX_SCENE_ARGS, {chrome: ['--page', 'pointerdown'], electron: ['--electron-arg', POINTERDOWN_SWITCH]});
  // The run's ups, on its doubles.
  const {steps} = await runWith({plan: planOf('method', {scene: 'chrome'})});
  const ups = steps.filter(s => s.startsWith('scenes ') && args(s)[0] === 'up').map(args);
  assert.deepEqual(ups.find(a => a[1] === 'chrome').slice(-2), ['--page', 'pointerdown']);
  const electron = (await runWith({plan: planOf('method', {scene: 'electron'})})).steps.filter(s => s.startsWith('scenes ') && args(s)[0] === 'up').map(args);
  assert.deepEqual(electron.find(a => a[1] === 'electron').slice(-2), ['--electron-arg', '--cua-fixture-page=pointerdown']);
  // Every script that names the variants: the fixtures that carry them, the plan that judges them, the run that passes
  // them. The renderer goldens' recorder, sitting B's native-mac suite, the live hold, the cursor sitting and the spike
  // bring their scenes up without them.
  const files = dir => fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => (e.isDirectory() ? (e.name === 'node_modules' ? [] : files(join(dir, e.name))) : /\.(mjs|js)$/.test(e.name) ? [join(dir, e.name)] : []));
  const naming = files(join(ROOT, 'scripts')).filter(f => /MATRIX_SCENE_ARGS|POINTERDOWN|cua-fixture-page|'pointerdown'/.test(fs.readFileSync(f, 'utf8'))).map(f => relative(ROOT, f)).sort();
  assert.deepEqual(naming, ['scripts/native-matrix/fixtures/electron-fixture.mjs', 'scripts/native-matrix/fixtures/electron/main.js', 'scripts/native-matrix/fixtures/electron/renderer.js',
    'scripts/native-matrix/fixtures/scene-page.mjs', 'scripts/native-matrix/plan.mjs', 'scripts/native-matrix/run.mjs']);
  // The scene targets (the finding-elements cells, the fixed-state checks) do not name the new controls.
  const {SCENES} = await import('../../scripts/repl-parity/scenes-mac.mjs');
  for (const scene of ['chrome', 'electron']) assert.ok(!SCENES[scene].targets.some(t => /Pointer/.test(t.name ?? '')), scene);
});

// ---- the plan -------------------------------------------------------------------------------------------------------

test('the two cells: element clicks on the pointerdown buttons, frontmost only, after every other case of their target', () => {
  assert.deepEqual(POINTERDOWN_ROWS, [CHROME, ELECTRON]);
  assert.ok(isPointerdownRow(CHROME) && isPointerdownRow(ELECTRON) && !isPointerdownRow('electron/frontmost/click.button'));
  for (const target of ['chrome', 'electron']) {
    const c = caseOf(target);
    assert.deepEqual([c.expect, c.act, c.regimes], ['outcome', 'await __app.click(__m.index);', ['frontmost']]);
    assert.equal(c.keys, undefined);
    assert.equal(CASES[target].at(-1), c, 'last, so every row before it starts where it did');
    assert.ok(!casesOf(target, 'background').includes(c));
  }
  const ids = manifestOf({run: 1, samples: 1}, FULL_PLAN).map(r => `${r.section} ${r.id}`);
  for (const id of [CHROME, ELECTRON]) assert.ok(ids.includes(`method ${id}`), id);
  assert.ok(ids.includes('speed chrome/method.click.pointerdown') && ids.includes('speed electron/method.click.pointerdown'));
  assert.ok(!ids.some(id => /click\.pointerdown@/.test(id)), 'no background row');
});

// The scene's golden text with the variant's line after its status: the button, the status group and its text.
const golden = scene => fs.readFileSync(join(ROOT, 'test/native-goldens', scene, 'vendor.txt'), 'utf8');
function withPointer(ax, statusName) {
  const lines = ax.split('\n'), at = lines.findIndex(l => l.endsWith(` container ${statusName}`));
  const tabs = /^\t*/.exec(lines[at])[0];
  lines.splice(at + 2, 0, `${tabs}90 버튼 ${POINTERDOWN.button}`, `${tabs}91 container ${POINTERDOWN.status}`, `${tabs}\t92 텍스트 ${POINTERDOWN.text(0)}`);
  return lines.join('\n');
}
const AsyncFunction = (async () => {}).constructor;
async function runCell(text, apps) {
  let out = '';
  globalThis.__apps = apps;
  try { await new AsyncFunction('cua', 'nodeRepl', text)({}, {write: s => { out += s; }}); } finally { delete globalThis.__apps; }
  return parseCell(out);
}
// A fake app whose element click on the pointer button adds `rise` pointer downs (an AXPress that dispatches none: 0).
function pointerApp(ax, rise) {
  const app = {ax, clicks: [], async getAXState() { return app.ax; },
    async click(index) { app.clicks.push(index); if (index === 90) app.ax = app.ax.replace(/Pointer downs: (\d+)/, (_, n) => POINTERDOWN.text(Number(n) + rise)); }};
  return app;
}
async function runCase(target, app) {
  const cells = caseCells(target, caseOf(target));
  const apps = {[target]: app};
  const out = {prepare: await runCell(cells.prepare, apps), act: await runCell(cells.act, apps), check: await runCell(cells.check, apps)};
  delete globalThis.__m;
  return out;
}
const STATUS = {chrome: 'Scene status', electron: 'Fixture status'};

test('each cell passes on exactly one pointer down; none, or two, fails; the shared scene is not ready', async () => {
  for (const target of ['chrome', 'electron']) {
    const once = pointerApp(withPointer(golden(target), STATUS[target]), 1);
    const passed = await runCase(target, once);
    assert.equal(passed.prepare.value.ready, true, `${target}: ${JSON.stringify(passed.prepare)}`);
    assert.deepEqual(once.clicks, [90], 'one element click on the button');
    assert.deepEqual(passed.check.value, {ok: true, outcome: {pointerDownOnce: true, rose: 1}});
    // A second row on the same page counts from where the first left it.
    assert.deepEqual((await runCase(target, once)).check.value, {ok: true, outcome: {pointerDownOnce: true, rose: 1}});
    assert.deepEqual((await runCase(target, pointerApp(withPointer(golden(target), STATUS[target]), 0))).check.value, {ok: false, outcome: {pointerDownOnce: false, rose: 0}}, `${target}: AXPress with no pointer event`);
    assert.deepEqual((await runCase(target, pointerApp(withPointer(golden(target), STATUS[target]), 2))).check.value, {ok: false, outcome: {pointerDownOnce: false, rose: 2}}, `${target}: two is not one`);
    // The scene without the variant (a consumer's): nothing is sent, the row invalid.
    const shared = pointerApp(golden(target), 1);
    const {prepare} = await runCase(target, shared);
    assert.equal(prepare.value.ready, false);
    assert.match(prepare.value.reason, /pointerdown variant/);
    assert.deepEqual(shared.clicks, []);
  }
});

// ---- the judge ------------------------------------------------------------------------------------------------------

const row = (engine, sample, ok, rose) => ({section: 'method', id: CHROME, engine, sample, ok, regime: 'frontmost', method: 'click', case: 'pointerdown', outcome: {pointerDownOnce: rose === 1, rose}});
test('judged against the vendor\'s sample of the same run: cua missing the pointer down where the vendor\'s rose is worse', () => {
  const judge = (vendor, cua) => judgeMethod('frontmost', [row('vendor', 1, vendor === 1, vendor)], [row('cua', 1, cua === 1, cua)]).verdict;
  assert.equal(judge(1, 0), 'worse', 'AXPress dispatching no pointer event where the vendor\'s click did');
  assert.equal(judge(1, 1), 'equal');
  assert.equal(judge(1, 2), 'worse', 'two pointer downs is not the vendor\'s one');
  assert.equal(judge(0, 0), 'equal', 'the vendor missing it alike: no gap against the vendor');
  assert.equal(judge(0, 1), 'better');
  assert.equal(judge(2, 0), 'worse', 'two failures are equal only as the same failure');
});

test('no departure may name either cell (ruling 1168): a missed pointer handler is fixed, never declared', () => {
  const entry = id => ({section: 'method', id, vendor: {answer: 'ok'}, cua: {answer: 'unconfirmed', errorName: 'clickUnconfirmed', sentence: 'The click could not be confirmed'},
    decision: 'Decision Log, 2026-11-23, a made-up entry'});
  for (const id of [CHROME, ELECTRON]) {
    assert.ok(departureProblems([entry(id)]).some(p => /cannot be declared/.test(p) && /ruling 1168/.test(p)), id);
    assert.deepEqual(usableDepartures([entry(id)]), []);
  }
  assert.ok(!departureProblems([entry('electron/frontmost/click.button')]).some(p => /cannot be declared/.test(p)));
});
