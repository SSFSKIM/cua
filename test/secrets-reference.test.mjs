import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseReference} from '../src/secrets/reference.mjs';

test('only an entire {{secret:<label>}} is a reference, and it names its label', () => {
  assert.deepEqual(parseReference('{{secret:work-password}}'), {label: 'work-password'});
  assert.deepEqual(parseReference('{{secret:A.b_c-9}}'), {label: 'A.b_c-9'});
  assert.deepEqual(parseReference(`{{secret:${'x'.repeat(128)}}}`), {label: 'x'.repeat(128)});
});

test('text that merely contains or resembles a reference is ordinary input', () => {
  for (const text of [
    '', 'hello', 'x{{secret:a}}', '{{secret:a}} ', ' {{secret:a}}', '{{secret:a}}\n', 'pre {{secret:a}} post',
    '{{ secret:a }}', '{{SECRET:a}}', '{secret:a}', '{{secret:a}', '{{secrets:a}}', 'secret:a',
  ]) assert.equal(parseReference(text), null, JSON.stringify(text));
});

test('non-strings are never references', () => {
  for (const value of [undefined, null, 42, {}, ['{{secret:a}}'], {toString: () => '{{secret:a}}'}]) assert.equal(parseReference(value), null);
});

test('a reference whose label breaks the label rule is recognized as invalid, never partially expanded', () => {
  for (const text of [
    '{{secret:}}', '{{secret:bad label}}', '{{secret:-leading}}', '{{secret:a/b}}', `{{secret:${'x'.repeat(129)}}}`,
    '{{secret:a}}{{secret:b}}', '{{secret:{{secret:a}}}}', '{{secret:a}}}', '{{secret:a\n}}',
  ]) assert.deepEqual(parseReference(text), {invalid: true}, JSON.stringify(text));
});
