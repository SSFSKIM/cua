import {test} from 'node:test';
import assert from 'node:assert/strict';
import {findIndex, lineShape} from '../cells.mjs';
import {chooseTarget, leftoverOf, judgeTabs, LEFTOVER} from '../tabs.mjs';

test('findIndex reads the element index on the line naming a label, in the plausible AX line formats', () => {
  const formats = [
    ['12 text field Probe input', 12],
    ['\t\t[7] textbox "Probe input"', 7],
    ['  - textbox "Probe input" [ref=e31]', 31],
    ['button "Mark probe page" [5]', 5],
    ['3: button Mark probe page', 3],
  ];
  for (const [line, index] of formats) {
    const label = line.includes('Probe input') ? 'Probe input' : 'Mark probe page';
    assert.equal(findIndex(`Tab: CUA probe page\nURL: http://127.0.0.1:5555/\n${line}\n8 text done`, label), index, line);
  }
  assert.equal(findIndex('heading CUA probe page\ntext field without a label', 'Probe input'), null);
  assert.equal(findIndex('textbox "Probe input"', 'Probe input'), null, 'no index on the line');
});

test('lineShape keeps only the format of our own label line: digits, URLs and the label are replaced', () => {
  assert.equal(lineShape('x\n\t[12] textbox "Probe input" value="" http://127.0.0.1:5555/\ny', 'Probe input'), '[N] textbox "<label>" value="" <url>');
  assert.equal(lineShape('nothing here', 'Probe input'), null);
});

const ok = {class: 'ok'};
test('chooseTarget: explicit index, a single browser, identical profiles; otherwise BLOCKED, never the first by default', () => {
  assert.deepEqual(chooseTarget({browsers: 1, listTabs: [ok]}), {index: 0, reason: 'only browser'});
  assert.deepEqual(chooseTarget({browsers: 2, listTabs: [ok, ok], browserIndex: 1}), {index: 1, reason: 'explicit --browser-index'});
  assert.deepEqual(chooseTarget({browsers: 2, listTabs: [ok, ok], sameProfile: true}), {index: 0, reason: 'every listed browser shows the same tabs (one profile)'});
  assert.equal(chooseTarget({browsers: 2, listTabs: [ok, ok], sameProfile: false}).index, null);
  assert.match(chooseTarget({browsers: 2, listTabs: [ok, ok], sameProfile: false}).reason, /--browser-index/);
  assert.equal(chooseTarget({browsers: 2, listTabs: [ok, ok], browserIndex: 2}).index, null);
  assert.equal(chooseTarget({browsers: 1, listTabs: [{class: 'identity-or-auth'}]}).index, null);
  assert.equal(chooseTarget({browsers: 0, listTabs: []}).index, null);
});

test('leftoverOf: only a confirmed absence means no leftover; a failed close is never followed by anything', () => {
  assert.equal(leftoverOf({created: false, createError: 'policy'}).status, LEFTOVER.unknown);
  assert.equal(leftoverOf({created: false}).status, LEFTOVER.none, 'nothing was attempted');
  assert.equal(leftoverOf({created: true, close: {class: 'ok'}, confirm: {class: 'ok', stillListed: false}}).status, LEFTOVER.none);
  assert.equal(leftoverOf({created: true, close: {class: 'ok'}, confirm: {class: 'ok', stillListed: true}}).status, LEFTOVER.open);
  assert.equal(leftoverOf({created: true, close: {class: 'transport'}}).status, LEFTOVER.possiblyOpen);
  assert.equal(leftoverOf({created: true, close: {class: 'ok'}, confirm: {class: 'transport'}}).status, LEFTOVER.unconfirmed);
  for (const status of [LEFTOVER.open, LEFTOVER.possiblyOpen, LEFTOVER.unconfirmed]) {
    const l = leftoverOf(status === LEFTOVER.open ? {created: true, close: {class: 'ok'}, confirm: {class: 'ok', stillListed: true}}
      : status === LEFTOVER.possiblyOpen ? {created: true, close: {class: 'other'}} : {created: true, close: {class: 'ok'}, confirm: {class: 'other'}});
    assert.match(l.note, /close it by hand/);
    assert.match(l.note, /did not reconnect/);
  }
});

const happy = () => ({
  withTabs: true,
  listBrowsers: {class: 'ok', browsers: [{type: 'extension', family: 'chrome'}]},
  listTabs: [{class: 'ok', tabCount: 4}],
  tabs: {
    target: {index: 0, reason: 'only browser'}, created: true, create: {class: 'ok'},
    goto: {class: 'ok', markerFound: true, inputIndex: 3, buttonIndex: 4},
    type: {class: 'ok'}, click: {class: 'ok', domChanged: true},
    screenshot: {class: 'ok', images: 1, bytes: 120, sizeMatches: true, sha256: 'a'.repeat(64)},
    close: {class: 'ok'}, confirm: {class: 'ok', stillListed: false},
  },
  elicitations: [{kind: 'origin-access', ownOrigin: true, answered: 'accept (session)'}, {kind: 'history', ownOrigin: false, answered: 'decline'}],
  cellsSent: ['listBrowsers', 'listTabs', 'createBrowserTab', 'gotoOwnedPage', 'typeText', 'clickAndVerify', 'getScreenshot', 'closeCreatedTab', 'confirmClosed'],
});
const statusOf = (scenarios, id) => scenarios.find(s => s.id === id)?.status;

test('judgeTabs: the full owned-page round trip passes', () => {
  const s = judgeTabs(happy());
  for (const id of ['list-tabs-reach', 'target-browser', 'create-tab', 'owned-page', 'type-input', 'click-dom-change', 'screenshot', 'close-created-tab', 'elicitations-own-origin-only', 'user-tabs-untouched'])
    assert.equal(statusOf(s, id), 'PASS', id);
});

test('judgeTabs: a leftover fails the close scenario and carries the note; a missing marker blocks input, not close', () => {
  const o = happy();
  o.tabs.close = {class: 'transport', text: 'disconnected'};
  delete o.tabs.confirm;
  const s = judgeTabs(o);
  assert.equal(statusOf(s, 'close-created-tab'), 'FAIL');
  assert.match(JSON.stringify(s.find(x => x.id === 'close-created-tab').detail), /close it by hand/);

  const m = happy();
  m.tabs.goto = {class: 'ok', markerFound: false};
  delete m.tabs.type; delete m.tabs.click; delete m.tabs.screenshot;
  const t = judgeTabs(m);
  assert.equal(statusOf(t, 'owned-page'), 'FAIL');
  for (const id of ['type-input', 'click-dom-change', 'screenshot']) assert.equal(statusOf(t, id), 'BLOCKED', id);
  assert.equal(statusOf(t, 'close-created-tab'), 'PASS');
});

test('judgeTabs: an unstructured request naming the probe origin is BLOCKED; anything accepted beyond the own origin FAILS', () => {
  const u = happy();
  u.elicitations.push({kind: 'unknown', ownOrigin: false, unstructuredOwnOrigin: true, answered: 'decline'});
  assert.equal(statusOf(judgeTabs(u), 'elicitations-own-origin-only'), 'BLOCKED');
  const r = happy();
  r.elicitations.push({kind: 'origin-access', ownOrigin: true, refusedOwnOrigin: true, answered: 'decline'});
  assert.equal(statusOf(judgeTabs(r), 'elicitations-own-origin-only'), 'BLOCKED');
  const a = happy();
  a.elicitations.push({kind: 'origin-access', ownOrigin: false, answered: 'accept (session)'});
  assert.equal(statusOf(judgeTabs(a), 'elicitations-own-origin-only'), 'FAIL');
  const c = happy();
  c.cellsSent.push('getTab');
  assert.equal(statusOf(judgeTabs(c), 'user-tabs-untouched'), 'FAIL');
});

test('judgeTabs: no target means nothing was created and every tab step is BLOCKED', () => {
  const o = happy();
  o.tabs = {target: {index: null, reason: 'ambiguous'}, created: false};
  const s = judgeTabs(o);
  assert.equal(statusOf(s, 'target-browser'), 'BLOCKED');
  for (const id of ['create-tab', 'owned-page', 'type-input', 'click-dom-change', 'screenshot', 'close-created-tab']) assert.equal(statusOf(s, id), 'BLOCKED', id);
});
