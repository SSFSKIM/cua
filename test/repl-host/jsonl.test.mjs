// The JSONL framing every channel cua owns reads and writes (src/repl-host/jsonl.mjs, #565): lines end at LF only, never at
// U+2028/U+2029 as node:readline ends them on Node 24 and later, and what cua writes carries both escaped.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {jsonLine, lines, stringify} from '../../src/repl-host/jsonl.mjs';

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

// Feeds `chunks` to a reader and ends the input -> {lines, closed}, once it closed.
function read(chunks, {encoding} = {}) {
  const input = new PassThrough();
  if (encoding) input.setEncoding(encoding);
  const reader = lines(input);
  const seen = [];
  reader.on('line', line => seen.push(line));
  const closed = new Promise(resolve => reader.on('close', () => resolve({lines: seen})));
  for (const chunk of chunks) input.write(chunk);
  input.end();
  return closed;
}

test('a JSON string holding LS and PS stays one line, whole', async () => {
  const message = {title: `Inbox${LS}draft${PS}end`};
  const {lines: got} = await read([`${JSON.stringify(message)}\n`]);
  assert.equal(got.length, 1);
  assert.deepEqual(JSON.parse(got[0]), message);
});

test('CRLF ends a line with its CR trimmed; a lone CR inside a line stays', async () => {
  const {lines: got} = await read(['{"a":1}\r\n{"b":2}\n', 'x\ry\r\n']);
  assert.deepEqual(got, ['{"a":1}', '{"b":2}', 'x\ry']);
});

test('every chunk boundary, through multi-byte characters and CRLF, gives the same lines', async () => {
  const text = `{"t":"a${LS}b"}\r\n{"u":"é😀${PS}"}\n\n{"v":"${LS}"}\n`;
  const bytes = Buffer.from(text, 'utf8');
  const expected = [`{"t":"a${LS}b"}`, `{"u":"é😀${PS}"}`, '', `{"v":"${LS}"}`];
  for (let at = 0; at <= bytes.length; at++) {
    const {lines: got} = await read([bytes.subarray(0, at), bytes.subarray(at)]);
    assert.deepEqual(got, expected, `split at byte ${at}`);
  }
  const {lines: bytewise} = await read([...bytes].map(byte => Buffer.from([byte])));
  assert.deepEqual(bytewise, expected, 'one byte per chunk');
});

test('string chunks (an input with an encoding set) read the same', async () => {
  const {lines: got} = await read([`{"t":"a${LS}`, `b"}\r`, '\n{"u":1}\n'], {encoding: 'utf8'});
  assert.deepEqual(got, [`{"t":"a${LS}b"}`, '{"u":1}']);
});

test('a final line with no newline is read at the end, before close, as readline did', async () => {
  const {lines: got} = await read(['{"a":1}\n{"b":', '2}']);
  assert.deepEqual(got, ['{"a":1}', '{"b":2}']);
  const {lines: crOnly} = await read(['{"a":1}\r']);
  assert.deepEqual(crOnly, ['{"a":1}']);
  const {lines: none} = await read([]);
  assert.deepEqual(none, []);
});

test('an input error is re-emitted on the reader, as readline did', async () => {
  const input = new PassThrough();
  input.on('error', () => {});
  const reader = lines(input);
  const error = new Promise(resolve => reader.on('error', resolve));
  input.destroy(new Error('boom'));
  assert.equal((await error).message, 'boom');
});

test('an input its owner paused is still read, as readline resumed it', async () => {
  const input = new PassThrough();
  input.pause();
  const reader = lines(input);
  const seen = [];
  reader.on('line', line => seen.push(line));
  const closed = new Promise(resolve => reader.on('close', resolve));
  input.end('{}\n');
  const outcome = await Promise.race([closed.then(() => 'closed'), new Promise(resolve => setTimeout(resolve, 1000, 'still paused'))]);
  assert.deepEqual({outcome, seen}, {outcome: 'closed', seen: ['{}']});
});

test('after the input ends the reader lets go of it: a later stream error stays with the stream\'s own handler', async () => {
  const input = new PassThrough();
  const reader = lines(input);
  reader.on('line', () => {});
  const closed = new Promise(resolve => reader.on('close', resolve));
  input.end('{}\n');
  await closed;
  const seen = [];
  input.on('error', error => seen.push(error.message));
  assert.doesNotThrow(() => input.emit('error', new Error('late')));
  assert.deepEqual(seen, ['late']);
  assert.equal(input.listenerCount('data') + input.listenerCount('end'), 0);
});

test('stringify and jsonLine escape LS and PS as \\u2028 and \\u2029: the same JSON value, safe for any line reader', () => {
  const value = {t: `a${LS}b${PS}c`, nested: [`${LS}${PS}`]};
  const text = stringify(value);
  assert.equal(text.includes(LS) || text.includes(PS), false);
  assert.equal(text, JSON.stringify(value).replaceAll(LS, '\\u2028').replaceAll(PS, '\\u2029'));
  assert.deepEqual(JSON.parse(text), value);
  assert.equal(jsonLine(value), `${text}\n`);
  assert.equal(jsonLine({plain: 'x'}), '{"plain":"x"}\n');
});
