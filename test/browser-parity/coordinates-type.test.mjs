// #168: input/coordinates' type cell observes the page (a screenshot) and clicks only once the page says it has
// rendered a frame of its content (until its first contentful paint Chrome drops the click and still answers ok),
// types only once the click has focused the input, and passes only when the input still has the focus once the text
// is acknowledged. end-key takes the input's focus and text itself. Every page read goes through the fixture's
// attributes and plain DOM reads, so the cells run on an evaluator without `performance` and with read-only elements
// (the vendor's). The real cells run here against a stand-in tab and document.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import coordinates from './scenarios/input/coordinates.mjs';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const run = (label, tab) => new AsyncFunction('tab', coordinates.cells.find(c => c.label === label).code)(tab);

// `rendered` whether the page renders once observed; `clickFocuses` whether the click focuses the input;
// `acknowledged` whether the fixture acknowledges the typed text; `typed` the input's value once typed;
// `blursOnType` whether typing takes the focus off the input; `fillFocuses` whether fill leaves the input focused.
function tab({rendered = true, clickFocuses = true, acknowledged = true, typed = 'pointer', blursOnType = false, fillFocuses = true} = {}) {
  const attributes = new Map();
  const html = {getAttribute: name => attributes.get(name) ?? null};
  const body = {tagName: 'BODY', id: ''};
  const input = {tagName: 'INPUT', id: 'input', value: '', selectionStart: 0};
  const pointer = {textContent: ''};
  const calls = [];
  const document = {
    documentElement: html,
    activeElement: body,
    querySelector: s => (s === '#input' ? input : s === '#pointer' ? pointer : null),
  };
  const focus = element => { document.activeElement = element; attributes.set('data-input-focus', element === input ? 'yes' : 'no'); };
  // The vendor's evaluator has no `performance`: a read of it fails the evaluation.
  const page = vm.createContext({document, window: {scrollY: 0}});
  Object.defineProperty(page, 'performance', {get() { throw new Error('performance is not defined'); }});
  const attached = selector => {
    const m = /^html\[([^=]+)="([^"]*)"\]$/.exec(selector);
    return m ? attributes.get(m[1]) === m[2] : false;
  };
  const readOnly = element => Object.freeze({...element});
  return {
    calls,
    screenshot: async () => { calls.push('screenshot'); if (rendered) attributes.set('data-rendered', 'yes'); return {type: 'image'}; },
    cua: {
      click: async () => { calls.push('click'); pointer.textContent = '80,40'; if (clickFocuses) focus(input); },
      type: async () => {
        calls.push('type');
        if (document.activeElement !== input) return;
        input.value = typed;
        if (acknowledged) attributes.set('data-recorded-text', typed);
        if (blursOnType) focus(body);
      },
      keypress: async ({keys}) => { calls.push(keys[0]); if (document.activeElement === input) input.selectionStart = keys[0] === 'HOME' ? 0 : input.value.length; },
    },
    playwright: {
      evaluate: async fn => vm.runInContext(typeof fn === 'string' ? fn : `(${fn.toString()})()`, page),
      locator: selector => ({
        waitFor: async () => { if (!attached(selector)) throw new Error('Error: Playwright selector deadline exceeded\nlocator.waitFor(attached) timed out for selector ' + selector); },
        getAttribute: async name => (selector === 'html' ? html.getAttribute(name) : null),
        fill: async text => { calls.push('fill'); input.value = text; input.selectionStart = text.length; if (fillFocuses) focus(input); },
        evaluate: async fn => fn(readOnly(input)),
      }),
    },
  };
}

const failure = async (label, t) => {
  const error = await run(label, t).then(() => null, e => e);
  assert.ok(error, `${label} passed`);
  const line = /; seen (\{.*\})$/.exec(error.message);
  assert.ok(line, error.message);
  return {message: error.message, seen: JSON.parse(line[1])};
};

test('the type cell answers the typed value once the page has rendered, the click focused the input and it kept the focus', async () => {
  const t = tab();
  assert.equal(await run('type', t), 'pointer');
  assert.deepEqual(t.calls, ['screenshot', 'click', 'type']);
});

test('a page that has not rendered is neither clicked nor typed into, and the cell says so', async () => {
  const t = tab({rendered: false});
  const {message, seen} = await failure('type', t);
  assert.match(message, /^the page had not rendered a frame within 5000ms of a screenshot; seen /);
  assert.equal(seen.rendered, null);
  assert.deepEqual(t.calls, ['screenshot']);
});

test('a click that does not focus the input fails the cell before it types, naming what had the focus', async () => {
  const t = tab({clickFocuses: false});
  const {message, seen} = await failure('type', t);
  assert.match(message, /^the click did not focus the input; seen /);
  assert.deepEqual(seen, {rendered: 'yes', inputFocus: null, active: {tag: 'body', id: ''}, value: '', pointer: [80, 40], scrollY: 0});
  assert.deepEqual(t.calls, ['screenshot', 'click']);
});

test('an unacknowledged type names whether the input had the focus, what had it, and the input\'s value', async () => {
  const {message, seen} = await failure('type', tab({acknowledged: false, typed: 'pointe'}));
  assert.match(message, /^the typed text was not acknowledged within 3000ms; seen /);
  assert.deepEqual(seen, {rendered: 'yes', inputFocus: 'yes', active: {tag: 'input', id: 'input'}, value: 'pointe', pointer: [80, 40], scrollY: 0});
});

test('typing that takes the focus off the input fails the cell even when the text is acknowledged', async () => {
  const {message, seen} = await failure('type', tab({blursOnType: true}));
  assert.match(message, /^the input lost the focus after typing; seen /);
  assert.deepEqual(seen, {rendered: 'yes', inputFocus: 'no', active: {tag: 'body', id: ''}, value: 'pointer', pointer: [80, 40], scrollY: 0});
});

test('end-key takes the input\'s focus and text itself, whatever the type cell left', async () => {
  const t = tab();
  assert.deepEqual(await run('end-key', t), {before: 0, after: 7});
  assert.deepEqual(t.calls, ['screenshot', 'fill', 'HOME', 'END']);
});

test('end-key fails before its keys when the input does not take the focus', async () => {
  const t = tab({fillFocuses: false});
  const {message} = await failure('end-key', t);
  assert.match(message, /^the input did not take the focus for the keys; seen /);
  assert.deepEqual(t.calls, ['screenshot', 'fill']);
});
