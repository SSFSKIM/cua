// The item 6 witness's judges (#171 M6a, T6; the M6a pre-flight §5.2, "The item 6 witness", F10): the typeText call must
// answer success and the field, read through the fixture's own accessibility reads and never through the engine, must
// hold acceptance 6's string exactly, once. Each judge has its negative control here: a doubled text, a text with one
// character changed, a call that failed, a field that was not empty before.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TEXT} from '../scripts/linux-engine-diff/text.mjs';
import {findEditableText, textProblems} from '../scripts/accept/linux-text.mjs';

const ok = {ok: true};

test('the witness types acceptance 6\'s own string: Hangul, a combining acute after e, an emoji beyond the BMP, a newline', () => {
  assert.equal(TEXT, 'cua171 안녕 é \u{1F642}\nline2');
});

test('the text arrived once and exactly: no problems', () => {
  assert.deepEqual(textProblems({typed: ok, before: '', after: TEXT}), []);
});

test('negative control: a doubled text fails', () => {
  const problems = textProblems({typed: ok, before: '', after: TEXT + TEXT});
  assert.match(problems.join('; '), /holds the text 2 times/);
});

test('negative control: the text with one character changed fails, naming where it differs', () => {
  const altered = TEXT.replace('́', '̀');
  assert.match(textProblems({typed: ok, before: '', after: altered}).join('; '), /does not hold the text: it differs at character 12/);
  // The precomposed é in place of e and the combining acute is a changed text too.
  assert.match(textProblems({typed: ok, before: '', after: TEXT.replace('é', 'é')}).join('; '), /does not hold the text/);
  assert.match(textProblems({typed: ok, before: '', after: TEXT.slice(0, -1)}).join('; '), /does not hold the text/);
});

test('negative control: the text once with anything else beside it fails', () => {
  assert.match(textProblems({typed: ok, before: '', after: `x${TEXT}`}).join('; '), /holds more than the text/);
  assert.match(textProblems({typed: ok, before: '', after: `${TEXT}\n`}).join('; '), /holds more than the text/);
});

test('negative control: a call that did not answer success fails, whatever the field holds', () => {
  assert.match(textProblems({typed: {ok: false, error: 'The paste could not be confirmed.'}, before: '', after: TEXT}).join('; '), /typeText did not answer success: The paste could not be confirmed\./);
  assert.match(textProblems({typed: null, before: '', after: TEXT}).join('; '), /typeText did not answer success/);
});

test('negative control: a field that was not empty before, or was not read, proves nothing', () => {
  assert.match(textProblems({typed: ok, before: 'left over', after: TEXT}).join('; '), /was not empty before/);
  assert.match(textProblems({typed: ok, before: '', after: null}).join('; '), /field was not read after/);
  assert.match(textProblems({typed: ok, before: null, after: TEXT}).join('; '), /field was not read before/);
});

// A fake of the oracle's reads (scripts/linux-engine-diff/oracle.mjs): a tree of nodes by id.
const fakeOracle = (nodes, roots) => ({
  appsOf: () => roots,
  children: id => nodes[id].children ?? [],
  role: id => nodes[id].role,
  states: id => ({editable: !!nodes[id].editable, multiLine: !!nodes[id].multiLine}),
});

test('the field is the first editable multi-line text node under the application of the gedit process, breadth first', () => {
  const nodes = {
    app: {role: 'application', children: ['frame']},
    frame: {role: 'frame', children: ['label', 'search', 'panel']},
    label: {role: 'text'},
    // The header bar's search entry: editable, one line, shallower than the document.
    search: {role: 'text', editable: true},
    panel: {role: 'panel', children: ['view']},
    view: {role: 'text', editable: true, multiLine: true},
  };
  assert.equal(findEditableText(fakeOracle(nodes, ['app']), 4242), 'view');
});

test('negative control: no editable text, no application for the process, or a tree past the bound finds no field', () => {
  assert.equal(findEditableText(fakeOracle({app: {role: 'application', children: ['t']}, t: {role: 'text'}}, ['app']), 1), null);
  assert.equal(findEditableText(fakeOracle({}, []), 1), null);
  const wide = {app: {role: 'application', children: Array.from({length: 50}, (_, i) => `n${i}`)}, ...Object.fromEntries(Array.from({length: 50}, (_, i) => [`n${i}`, {role: 'panel'}]))};
  wide.n49 = {role: 'text', editable: true, multiLine: true};
  assert.equal(findEditableText(fakeOracle(wide, ['app']), 1, {limit: 10}), null);
  assert.equal(findEditableText(fakeOracle(wide, ['app']), 1), 'n49');
});
