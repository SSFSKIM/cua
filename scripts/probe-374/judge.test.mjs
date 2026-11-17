import test from 'node:test';
import assert from 'node:assert/strict';
import {classify, gate, summarize, truth} from './judge.mjs';

const none = {windows: 0, axMenus: 0};
const open = {windows: 1, axMenus: 1};
const page = (counts, extra = {}) => ({counts: {native: 0, aria: 0, own: 0, ...counts}, ariaOpen: false, ownOpen: false, ...extra});
const row = over => ({family: 'cft', cell: 'native', placement: 'foreground', rep: 0, offered: true, answer: 'ok',
  menu: {seen: 'application', ms: 21}, before: none, after: open, pageBefore: page({}), page: page({native: 1}), ...over});

test('the truth is the oracle\'s and the page\'s, never the answer', () => {
  assert.deepEqual(truth(row({})), {menuOpen: true, native: true, aria: false, reached: true, ownOpen: false});
  assert.equal(truth(row({cell: 'aria', after: none, page: page({aria: 1}, {ariaOpen: true})})).menuOpen, true, 'the page\'s ARIA menu');
  assert.equal(truth(row({cell: 'own', after: none, page: page({own: 1}, {ownOpen: true})})).menuOpen, false, 'the page\'s own menu is no AXMenu');
  assert.equal(truth(row({before: open, after: open})).menuOpen, false, 'a menu open before is not the action\'s');
  assert.equal(truth(row({page: undefined, pageBefore: undefined, appkitShows: 1})).reached, true, 'AppKit: the view counted the action');
});

test('each answer is classed against the truth', () => {
  assert.equal(classify(row({})), 'confirmed');
  assert.equal(classify(row({after: none})), 'falseOk');
  assert.equal(classify(row({answer: 'menuUnconfirmed', after: none})), 'honestUnconfirmed');
  assert.equal(classify(row({answer: 'menuUnconfirmed'})), 'falseUnconfirmed');
  assert.equal(classify(row({cell: 'own', answer: 'menuUnconfirmed', after: none, page: page({own: 1}, {ownOpen: true})})), 'ownUnconfirmed');
  assert.equal(classify(row({cell: 'own', answer: 'menuUnconfirmed'})), 'falseUnconfirmed', 'the browser\'s menu came up despite preventDefault');
  assert.equal(classify(row({offered: false, answer: null})), 'notOffered');
  assert.equal(classify(row({answer: 'actionFailed'})), 'error');
});

test('a cell passes only when every row is its expected class; one false ok fails the run', () => {
  const native = [row({rep: 0}), row({rep: 1})];
  const own = [0, 1].map(rep => row({cell: 'own', rep, answer: 'menuUnconfirmed', after: none, page: page({own: 1}, {ownOpen: true})}));
  let summary = summarize([...native, ...own]);
  assert.deepEqual(summary.map(c => c.verdict), ['pass', 'pass']);
  assert.equal(gate(summary).green, true);
  summary = summarize([...native, row({rep: 2, after: none})]);
  assert.equal(summary[0].verdict, 'fail');
  assert.deepEqual(gate(summary), {falseOk: 1, open: ['cft/native/foreground: fail'], green: false});
});

test('the own cell needs its counter risen in every row: a request that never reached the page is not the control', () => {
  const unreached = row({cell: 'own', answer: 'menuUnconfirmed', after: none, page: page({})});
  assert.equal(summarize([unreached])[0].verdict, 'review');
});

test('a family that offers no Show Menu, or never shows the ARIA menu as one, is a stated limit; a mixed cell is for review', () => {
  assert.equal(summarize([row({offered: false, answer: null})])[0].verdict, 'limit');
  const aria = row({cell: 'aria', answer: 'menuUnconfirmed', menu: {seen: null, ms: 1000}, after: none, page: page({aria: 1}, {ariaOpen: false})});
  assert.equal(summarize([aria])[0].verdict, 'limit');
  assert.equal(summarize([row({}), row({answer: 'menuUnconfirmed', after: none})])[0].verdict, 'review');
});

test('the blocking cell\'s timed-out action is counted from the record', () => {
  const blocking = row({family: 'appkit', cell: 'blocking', page: undefined, pageBefore: undefined, appkitShows: 1, menu: {seen: 'application', ms: 3, actionError: -25204}});
  const [cell] = summarize([blocking]);
  assert.deepEqual(cell.actionErrors, {'-25204': 1});
  assert.equal(cell.verdict, 'pass');
});

test('a negative control holds when the other menu came up and the answer stayed menuUnconfirmed; a confirm fails the run', () => {
  const nc = over => row({cell: 'nc-timer-select', answer: 'menuUnconfirmed', menu: {seen: null, ms: 1000}, ...over});
  assert.equal(classify(nc({})), 'ncHeld', 'the select popup is a new window');
  assert.equal(classify(nc({after: none, page: page({}, {timerOpen: true})})), 'ncHeld', 'the page\'s timer menu');
  assert.equal(classify(nc({after: none})), 'ncNotFired', 'nothing came up: the control did not run');
  assert.equal(classify(nc({answer: 'ok'})), 'ncConfirmed');
  const summary = summarize([nc({}), nc({rep: 1, answer: 'ok'})]);
  assert.equal(summary[0].verdict, 'fail');
  assert.equal(gate(summary).falseOk, 1, 'a confirmed control counts against the gate');
  assert.equal(summarize([nc({}), nc({rep: 1})])[0].verdict, 'pass');
});
