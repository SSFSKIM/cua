// #168: input/coordinates' type cell clicks only once the page has had its first contentful paint (until then Chrome
// drops the click and still answers ok), types only once the click has focused the input, and when either step or the
// typed text's acknowledgment fails, its error says what the page showed. On success its value is unchanged
// ('pointer'). The real cell runs here against a stand-in tab and document.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import coordinates from './scenarios/input/coordinates.mjs';

const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const cell = coordinates.cells.find(c => c.label === 'type');
const run = tab => new AsyncFunction('tab', cell.code)(tab);

// `painted` whether the page has had its first contentful paint; `clickFocuses` whether the click focuses the input;
// `acknowledged` whether the fixture acknowledges the typed text; `typed` the input's value once typed.
function tab({painted = true, clickFocuses = true, acknowledged = true, typed = 'pointer'}) {
  const body = {tagName: 'BODY', id: ''};
  const input = {tagName: 'INPUT', id: 'input', value: ''};
  const pointer = {textContent: ''};
  const calls = [];
  const document = {
    activeElement: body,
    querySelector: s => (s === '#input' ? input : s === '#pointer' ? pointer : null),
    elementFromPoint: (x, y) => (x === 80 && y === 40 ? input : body),
  };
  const window = {scrollY: 0, scrollTo(x, y) { calls.push('scrollTo'); window.scrollY = y; }};
  const performance = {getEntriesByName: name => (painted && name === 'first-contentful-paint' ? [{}] : [])};
  const page = vm.createContext({document, window, performance});
  const attached = selector => (selector === 'html[data-first-contentful-paint="yes"]' ? painted
    : selector === 'html[data-recorded-text="pointer"]' ? acknowledged : false);
  return {
    calls,
    cua: {
      click: async () => { calls.push('click'); pointer.textContent = '80,40'; if (clickFocuses) document.activeElement = input; },
      type: async () => { calls.push('type'); if (document.activeElement === input) input.value = typed; },
    },
    playwright: {
      evaluate: async fn => vm.runInContext(typeof fn === 'string' ? fn : `(${fn.toString()})()`, page),
      locator: selector => ({
        waitFor: async () => { if (!attached(selector)) throw new Error('Error: Playwright selector deadline exceeded\nlocator.waitFor(attached) timed out for selector ' + selector); },
        evaluate: async fn => fn(input),
      }),
    },
  };
}

const seenOf = error => {
  const line = /; seen (\{.*\})$/.exec(error.message);
  assert.ok(line, error.message);
  return JSON.parse(line[1]);
};

test('the type cell answers the typed value once the page has painted and the click has focused the input', async () => {
  const t = tab({});
  assert.equal(await run(t), 'pointer');
  assert.deepEqual(t.calls, ['scrollTo', 'click', 'type']);
});

test('before the page\'s first contentful paint the cell neither clicks nor types, and says so', async () => {
  const t = tab({painted: false});
  const error = await run(t).then(() => null, e => e);
  assert.match(error.message, /^the page reported no first contentful paint within 5000ms; seen /);
  assert.equal(seenOf(error).painted, false);
  assert.deepEqual(t.calls, []);
});

test('a click that does not focus the input fails the cell before it types, naming what had the focus', async () => {
  const t = tab({clickFocuses: false});
  const error = await run(t).then(() => null, e => e);
  assert.match(error.message, /^the click did not focus the input; seen /);
  assert.deepEqual(seenOf(error), {painted: true, focused: false, active: {tag: 'body', id: ''}, value: '', pointer: [80, 40], hit: {tag: 'input', id: 'input'}, scrollY: 0});
  assert.deepEqual(t.calls, ['scrollTo', 'click']);
});

test('an unacknowledged type names whether the input had the focus, what had it, and the input\'s value', async () => {
  const error = await run(tab({acknowledged: false, typed: 'pointe'})).then(() => null, e => e);
  assert.match(error.message, /^the typed text was not acknowledged within 3000ms; seen /);
  assert.deepEqual(seenOf(error), {painted: true, focused: true, active: {tag: 'input', id: 'input'}, value: 'pointe', pointer: [80, 40], hit: {tag: 'input', id: 'input'}, scrollY: 0});
});
