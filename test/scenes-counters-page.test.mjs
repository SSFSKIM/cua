// The Chrome scene's counters page (#187's live slot, scripts/native-matrix/fixtures/scene-page.mjs): the shared page
// unchanged byte for byte, the counters page the same DOM with one more script whose hash is the only addition to the
// CSP, the script's counts and its beacon (numbers only, never the textarea's value), the server keeping only numeric
// fields, and `scenes-mac.mjs up chrome --page counters` passed through to the page server. No browser runs.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {COUNTER_NAMES, COUNTERS_CSP, COUNTERS_PAGE_HTML, COUNTERS_PATH, COUNTERS_SCRIPT, CSP, countersRecord, PAGE_HTML, PAGE_VARIANTS, READY_PATH, SCRIPT,
  startScenePage} from '../scripts/native-matrix/fixtures/scene-page.mjs';
import {PAGE_COUNTERS, pageVariantProblem, parse, readPageCounters, spawnPage} from '../scripts/repl-parity/scenes-mac.mjs';

const sha256 = text => createHash('sha256').update(text).digest('hex');
const scriptHash = text => `'sha256-${createHash('sha256').update(text).digest('base64')}'`;

test('the shared page is byte-identical to the one every earlier record used', () => {
  assert.equal(sha256(PAGE_HTML), '67d628ac5fbb8568140649e3ae68d0558e0940495b00275864a708b94b53ba84');
  assert.equal(sha256(CSP), '6af8ad1d6acfb72ceebd4eadcfa1a86c636ce261e381d09b29431e27d170aa99');
  assert.equal(sha256(SCRIPT), '1795a24d8619bd7c548947d659eadd07ee0663263efa4d34bad94a3749d6f706');
  assert.deepEqual(PAGE_VARIANTS, ['shared', 'counters']);
});

test('the counters page is the shared DOM plus one script, and its CSP adds only that script\'s hash', () => {
  const extra = `<script>${COUNTERS_SCRIPT}</script>`;
  assert.equal(COUNTERS_PAGE_HTML.replace(extra, ''), PAGE_HTML, 'removing the second script gives the shared page back');
  assert.equal(COUNTERS_PAGE_HTML.split('<script>').length - 1, 2);
  assert.equal(COUNTERS_CSP, CSP.replace(`script-src ${scriptHash(SCRIPT)}`, `script-src ${scriptHash(SCRIPT)} ${scriptHash(COUNTERS_SCRIPT)}`));
  assert.notEqual(COUNTERS_CSP, CSP);
  // Nothing else in the policy moves: the beacon still goes only to the page's own origin.
  assert.match(COUNTERS_CSP, /connect-src 'self'/);
  assert.match(COUNTERS_CSP, /default-src 'none'/);
});

// The script run against a fake window, document and navigator: the listeners it adds, and every beacon it sends.
function runScript({value = ''} = {}) {
  const listeners = {window: {}, document: {}, notes: {}}, beacons = [];
  const on = where => (type, fn, capture) => { (listeners[where][type] ??= []).push({fn, capture: capture === true}); };
  const notes = {value, addEventListener: on('notes')};
  const window = {addEventListener: on('window')};
  const document = {focused: false, getElementById: id => (id === 'notes' ? notes : null), addEventListener: on('document'), hasFocus: () => document.focused};
  const navigator = {sendBeacon: (path, body) => { beacons.push({path, body: JSON.parse(body)}); return true; }};
  new Function('window', 'document', 'navigator', COUNTERS_SCRIPT)(window, document, navigator);
  const fire = (where, type, event = {}) => { for (const l of listeners[where][type] ?? []) l.fn({target: where === 'window' ? window : {}, ...event}); };
  return {listeners, beacons, notes, window, document, fire};
}

test('the script counts window and textarea focus and blur and document-level mousedown and click, and beacons numbers only', () => {
  const page = runScript({value: 'not to be sent'});
  assert.ok(page.listeners.document.mousedown[0].capture && page.listeners.document.click[0].capture, 'mousedown and click are counted in the capture phase, before the page can stop them');
  page.fire('window', 'load');
  page.document.focused = true;
  page.fire('window', 'focus');
  page.fire('window', 'focus', {target: {}});  // an element's focus reaching the window is not the window's
  page.fire('notes', 'focus');
  page.fire('document', 'mousedown');
  page.fire('document', 'click');
  page.notes.value = '한글 테스트';
  page.fire('notes', 'input');
  page.fire('notes', 'blur');
  page.document.focused = false;
  page.fire('window', 'blur');
  assert.ok(page.beacons.every(b => b.path === COUNTERS_PATH), 'every beacon goes to /counters');
  const last = page.beacons.at(-1).body;
  assert.deepEqual(Object.keys(last).sort(), ['counts', 'focused', 'length', 'seq']);
  // The document's focus as hasFocus() read it at each beacon: none at load, held from the window's focus to its blur.
  assert.deepEqual(page.beacons.map(b => b.body.focused), [false, true, true, true, true, true, true, false]);
  assert.deepEqual(Object.keys(last.counts).sort(), [...COUNTER_NAMES].sort());
  assert.deepEqual(last.counts, {windowFocus: 1, windowBlur: 1, textFocus: 1, textBlur: 1, mousedown: 1, click: 1});
  assert.equal(last.length, '한글 테스트'.length);
  assert.deepEqual(page.beacons.map(b => b.body.seq), page.beacons.map((_, k) => k + 1), 'the sequence counts every beacon');
  assert.ok(!JSON.stringify(page.beacons).includes('not to be sent') && !JSON.stringify(page.beacons).includes('한글'), 'the value never leaves the page');
});

test('the server keeps only numeric fields of a beacon, and refuses anything else', () => {
  const counts = Object.fromEntries(COUNTER_NAMES.map((n, k) => [n, k]));
  assert.deepEqual(countersRecord(JSON.stringify({seq: 3, length: 5, counts: {...counts, extra: 9}, focused: true, value: 'secret', title: 'x'})), {seq: 3, length: 5, counts, focused: true});
  assert.equal(countersRecord(JSON.stringify({seq: 3, length: 5, counts})), null, 'a beacon without the focus reading');
  assert.equal(countersRecord(JSON.stringify({seq: 3, length: 5, counts, focused: 'yes'})), null);
  assert.equal(countersRecord('not json'), null);
  assert.equal(countersRecord(JSON.stringify({seq: 1, length: 'abc', counts})), null);
  assert.equal(countersRecord(JSON.stringify({seq: 1, length: 2, counts: {...counts, click: -1}})), null);
  assert.equal(countersRecord(JSON.stringify({seq: 1, length: 2, counts: {...counts, click: '3'}})), null);
  assert.equal(countersRecord(JSON.stringify({seq: 1, length: 2})), null);
});

test('the shared page answers /counters with 404; the counters page serves its own document and takes the beacon', async t => {
  const got = [];
  const shared = await startScenePage();
  const counters = await startScenePage({page: 'counters', onCounters: record => got.push(record)});
  t.after(() => Promise.all([shared.close(), counters.close()]));
  const body = JSON.stringify({seq: 1, length: 0, counts: Object.fromEntries(COUNTER_NAMES.map(n => [n, 0])), focused: false, value: 'x'});
  assert.equal((await fetch(new URL(COUNTERS_PATH, shared.url), {method: 'POST', body})).status, 404);
  const sharedPage = await fetch(shared.url);
  assert.equal(await sharedPage.text(), PAGE_HTML);
  assert.equal(sharedPage.headers.get('content-security-policy'), CSP);
  const page = await fetch(counters.url);
  assert.equal(await page.text(), COUNTERS_PAGE_HTML);
  assert.equal(page.headers.get('content-security-policy'), COUNTERS_CSP);
  assert.equal((await fetch(new URL(COUNTERS_PATH, counters.url), {method: 'POST', body})).status, 204);
  assert.equal((await fetch(new URL(READY_PATH, counters.url), {method: 'POST'})).status, 204, 'the load beacon still answers');
  assert.deepEqual(got, [{seq: 1, length: 0, counts: Object.fromEntries(COUNTER_NAMES.map(n => [n, 0])), focused: false}]);
  await assert.rejects(startScenePage({page: 'other'}), /page variant/);
});

test('up chrome --page counters: parsed, refused for another scene or variant, and passed through to the page server', async t => {
  assert.equal(parse(['up', 'chrome', '--run', '/r', '--page', 'counters']).flags.page, 'counters');
  assert.equal(pageVariantProblem('chrome', undefined), null);
  assert.equal(pageVariantProblem('chrome', 'counters'), null);
  assert.match(pageVariantProblem('textedit', 'counters'), /chrome scene only/);
  assert.match(pageVariantProblem('chrome', 'fancy'), /shared or counters/);
  const run = mkdtempSync(join(tmpdir(), 'cua-counters-page-'));
  let page = null;
  t.after(() => { if (page) { try { process.kill(page.pid, 'SIGTERM'); } catch {} } rmSync(run, {recursive: true, force: true}); });
  page = await spawnPage(run, {page: 'counters'});
  assert.equal(page.variant, 'counters');
  assert.equal(await (await fetch(page.url)).text(), COUNTERS_PAGE_HTML);
  assert.equal(readPageCounters(run), null);
  const counts = Object.fromEntries(COUNTER_NAMES.map(n => [n, 1]));
  for (const seq of [2, 1]) await fetch(new URL(COUNTERS_PATH, page.url), {method: 'POST', body: JSON.stringify({seq, length: 7 + seq, counts, focused: true, value: 'never kept'})});
  const kept = readPageCounters(run);
  assert.equal(kept.seq, 2, 'a beacon that arrives after a later one is not kept over it');
  assert.equal(kept.length, 9);
  assert.deepEqual(kept.counts, counts);
  assert.ok(Number.isFinite(kept.receivedAt));
  assert.ok(!readFileSync(join(run, PAGE_COUNTERS), 'utf8').includes('never kept'));
});
