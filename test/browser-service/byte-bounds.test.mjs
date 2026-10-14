// The exports' and page assets' byte bounds (src/browser-service/byte-bounds.mjs; cua's own, Decision Log 2026-10-14
// "M3 task 1 review, controller"): 50 MiB per file, 200 MiB per bundle; the page's bounded body read stops at the bound
// and refuses a declared larger length without reading; the trusted side sizes base64 without decoding it.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ASSET_TOO_LARGE, BUNDLE_TOO_LARGE, EXPORT_TOO_LARGE, MAX_BUNDLE_BYTES, MAX_FILE_BYTES, decodedLength, readBoundedBodyInPage}
  from '../../src/browser-service/byte-bounds.mjs';

const MiB = 1024 * 1024;

// A Response whose body streams `chunks` (Uint8Arrays) and declares `length` when given.
function streamed(chunks, {length} = {}) {
  const state = {read: 0, cancelled: false, readerTaken: false};
  let i = 0;
  const response = {
    headers: {get: name => (name === 'content-length' && length != null ? String(length) : null)},
    body: {
      getReader() {
        state.readerTaken = true;
        return {
          async read() { if (i >= chunks.length) return {done: true}; state.read += chunks[i].byteLength; return {done: false, value: chunks[i++]}; },
          async cancel() { state.cancelled = true; },
        };
      },
      async cancel() { state.cancelled = true; },
    },
  };
  return {response, state};
}

test('the bounds are 50 MiB per file and 200 MiB per bundle, each with its fixed sentence', () => {
  assert.equal(MAX_FILE_BYTES, 50 * MiB);
  assert.equal(MAX_BUNDLE_BYTES, 200 * MiB);
  assert.deepEqual([EXPORT_TOO_LARGE, ASSET_TOO_LARGE, BUNDLE_TOO_LARGE],
    ['Exported content exceeds the 50 MiB limit', 'Asset exceeds the 50 MiB limit', 'Asset bundle exceeds the 200 MiB limit']);
});

test('a base64 string is sized without decoding, padding counted', () => {
  for (const bytes of [0, 1, 2, 3, 4, 5, 1000]) {
    assert.equal(decodedLength(Buffer.alloc(bytes, 7).toString('base64')), bytes, String(bytes));
  }
});

test('the page reads a body of exactly the bound, and stops one byte past it', async () => {
  const MiBChunk = new Uint8Array(MiB).fill(1);
  const exact = streamed(Array(50).fill(MiBChunk));
  assert.equal((await readBoundedBodyInPage(exact.response, MAX_FILE_BYTES, ASSET_TOO_LARGE)).byteLength, MAX_FILE_BYTES);
  const over = streamed([...Array(50).fill(MiBChunk), new Uint8Array(1), MiBChunk]);
  await assert.rejects(readBoundedBodyInPage(over.response, MAX_FILE_BYTES, ASSET_TOO_LARGE), {message: ASSET_TOO_LARGE});
  assert.equal(over.state.read, MAX_FILE_BYTES + 1, 'nothing read past the first byte over');
  assert.equal(over.state.cancelled, true);
});

test('a declared length over the bound is refused before the body is read; one at the bound is read', async () => {
  const declared = streamed([new Uint8Array(3)], {length: MAX_FILE_BYTES + 1});
  await assert.rejects(readBoundedBodyInPage(declared.response, MAX_FILE_BYTES, EXPORT_TOO_LARGE), {message: EXPORT_TOO_LARGE});
  assert.deepEqual({taken: declared.state.readerTaken, cancelled: declared.state.cancelled}, {taken: false, cancelled: true});
  const atBound = streamed([new Uint8Array([1, 2, 3])], {length: MAX_FILE_BYTES});
  assert.deepEqual([...await readBoundedBodyInPage(atBound.response, MAX_FILE_BYTES, EXPORT_TOO_LARGE)], [1, 2, 3]);
});

test('a body without a stream is bounded after it is read', async () => {
  const of = size => ({headers: {get: () => null}, body: null, arrayBuffer: async () => new ArrayBuffer(size)});
  assert.equal((await readBoundedBodyInPage(of(16), 16, ASSET_TOO_LARGE)).byteLength, 16);
  await assert.rejects(readBoundedBodyInPage(of(17), 16, ASSET_TOO_LARGE), {message: ASSET_TOO_LARGE});
});
