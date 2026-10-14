// The virtual clipboard's store (src/browser-service/clipboard.mjs, the port of Jf's items and exclusive queue): what a
// copy or cut writes and a paste reads, validated as the vendor validates it, read as copies, one operation at a time.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Clipboard} from '../../src/browser-service/clipboard.mjs';

const text = value => ({entries: [{mime_type: 'text/plain', text: value}], presentation_style: 'unspecified'});

test('written items are read back as copies; the store starts empty', () => {
  const clipboard = new Clipboard();
  assert.deepEqual(clipboard.read(), []);
  clipboard.write([text('one'), {entries: [{mime_type: 'image/png', base64: 'AAAA'}]}], 'copy');
  const read = clipboard.read();
  assert.deepEqual(read, [text('one'), {entries: [{mime_type: 'image/png', base64: 'AAAA'}]}]);
  read[0].entries[0].text = 'changed';
  assert.equal(clipboard.read()[0].entries[0].text, 'one');
});

test('malformed items are refused with the vendor\'s sentences, naming the operation', () => {
  const clipboard = new Clipboard();
  const refused = (items, message) => assert.throws(() => clipboard.write(items, 'cua_keypress'), {message});
  refused([], 'cua_keypress requires items');
  refused([{entries: []}], 'cua_keypress requires clipboard item entries');
  refused([{entries: [{mime_type: 'text/plain', text: 'x'}], presentation_style: 'floating'}], 'cua_keypress requires a valid presentation_style');
  refused([{entries: [{text: 'x'}]}], 'cua_keypress requires entry mime_type');
  refused([{entries: [{mime_type: 'text/plain'}]}], 'cua_keypress requires exactly one of entry text or base64');
  refused([{entries: [{mime_type: 'image/png', base64: '%%%'}]}], 'cua_keypress requires valid base64 entry data');
  assert.deepEqual(clipboard.read(), [], 'nothing was written');
});

test('operations run one at a time, in order, a failed one not stopping the next', async () => {
  const clipboard = new Clipboard();
  const order = [];
  const first = clipboard.runExclusive(async () => { await new Promise(r => setTimeout(r, 30)); order.push('first'); throw new Error('boom'); });
  const second = clipboard.runExclusive(async () => { order.push('second'); return 2; });
  await assert.rejects(first, {message: 'boom'});
  assert.equal(await second, 2);
  assert.deepEqual(order, ['first', 'second']);
});
