// The own host's result assembly and image decoding, against what the pinned vendor host returned for the same
// kernel output (M0's vendor control and the M1 probes of 2026-10-14).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assembleResult, imageFromDataUrl, sentenceResult} from '../../src/repl-host/results.mjs';

const text = t => ({type: 'text', text: t});
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const image = (data = PNG, mimeType = 'image/png') => ({type: 'image', data, mimeType, _meta: {'codex/imageDetail': 'original'}});

test('success: named outputs by first appearance, then the unnamed output, then images, then content items', () => {
  assert.deepEqual(assembleResult({ok: true, output: 'u1u2', namedOutputs: ['n'], durationMs: 0}).content, [text('n'), text('u1u2')]);
  assert.deepEqual(assembleResult({ok: true, output: '', namedOutputs: ['AC', 'B']}).content, [text('AC'), text('B')], 'an empty unnamed output is dropped beside anything else');
  assert.deepEqual(assembleResult({ok: true, output: 'beforeafter', images: [image()]}).content, [text('beforeafter'), image()]);
  assert.deepEqual(assembleResult({ok: true, output: 'd', namedOutputs: ['w'], images: [image()]}).content, [text('w'), text('d'), image()]);
  assert.deepEqual(assembleResult({ok: true, output: '', images: [image()]}).content, [image()]);
  assert.deepEqual(assembleResult({ok: true, output: '', namedOutputs: [''], }).content, [text('')], 'an empty named output is still an item');
  assert.deepEqual(assembleResult({ok: true, output: ''}).content, [text('')], 'nothing at all is one empty text item');
  const item = {type: 'text', text: 'from a service'};
  assert.deepEqual(assembleResult({ok: true, output: 'x', images: [image()], contentItems: [item]}).content, [text('x'), image(), item]);
});

test('error: the error sentence first, then named and non-empty unnamed output; images are dropped', () => {
  assert.deepEqual(assembleResult({ok: false, error: 'boom', output: 'out'}), {content: [text('boom'), text('out')], isError: true});
  assert.deepEqual(assembleResult({ok: false, error: 'boom', output: '', namedOutputs: ['a']}).content, [text('boom'), text('a')]);
  assert.deepEqual(assembleResult({ok: false, error: 'img-boom', output: '', images: [image()]}).content, [text('img-boom')]);
});

test('the submitted code\'s duration is the result\'s meta only when the kernel reported one', () => {
  assert.deepEqual(assembleResult({ok: true, output: '42', durationMs: 3})._meta, {'codex/nodeReplExecutionDurationMs': 3});
  assert.equal(Object.hasOwn(assembleResult({ok: false, error: 'Top-level static import', durationMs: null}), '_meta'), false);
  assert.deepEqual(sentenceResult('js kernel reset', {isError: false}), {content: [text('js kernel reset')], isError: false});
});

test('emitted images: image/* data URLs only, canonical base64 or percent-encoded bytes, the media type kept as written', () => {
  assert.deepEqual(imageFromDataUrl(`data:image/png;base64,${PNG}`), {image: image()});
  assert.deepEqual(imageFromDataUrl(`data:image/jpeg;base64,${PNG}`), {image: image(PNG, 'image/jpeg')}, 'a mislabelled image is passed on (cua\'s proxy corrects the type)');
  assert.deepEqual(imageFromDataUrl(`DATA:IMAGE/PNG;base64,${PNG}`), {image: image(PNG, 'IMAGE/PNG')});
  assert.deepEqual(imageFromDataUrl(`data:image/png;charset=x;base64,${PNG}`), {image: image()});
  assert.deepEqual(imageFromDataUrl('data:image/png,abc'), {image: image('YWJj')});
  assert.deepEqual(imageFromDataUrl('data:image/png,%41%42'), {image: image('QUI=')});
  assert.deepEqual(imageFromDataUrl('data:image/png;base64,'), {image: image('')});
  assert.deepEqual(imageFromDataUrl('data:image/svg+xml;base64,PHN2Zy8+'), {image: image('PHN2Zy8+', 'image/svg+xml')});
  for (const url of ['data:image/png;base64,@@@', 'data:image/png;base64,aGk', 'data:image/png;base64,aG k=', 'data:image/png;base64,_-8=', 'data:image/png;base64,aGl='])
    assert.deepEqual(imageFromDataUrl(url), {error: 'nodeRepl.emitImage received an invalid base64 data URL'}, url);
  assert.deepEqual(imageFromDataUrl('data:text/plain;base64,aGk='), {error: 'nodeRepl.emitImage only accepts image/* data URLs'});
  assert.deepEqual(imageFromDataUrl('data:image/png;base64'), {error: 'nodeRepl.emitImage received a malformed data URL'});
  assert.deepEqual(imageFromDataUrl('https://example.invalid/x.png'), {error: 'nodeRepl.emitImage only accepts data URLs'});
});

test('content items trusted code adds are text items after the images; response meta joins the duration in _meta, on success and error', () => {
  assert.deepEqual(assembleResult({ok: true, output: 'x', images: [image()], contentItems: ['Browser notifications: one']}).content, [text('x'), image(), text('Browser notifications: one')]);
  assert.deepEqual(assembleResult({ok: true, output: 'x', durationMs: 4, responseMeta: {a: 1}})._meta, {a: 1, 'codex/nodeReplExecutionDurationMs': 4});
  assert.deepEqual(assembleResult({ok: true, output: 'x', responseMeta: {'codex/nodeReplExecutionDurationMs': 'forged'}, durationMs: 4})._meta, {'codex/nodeReplExecutionDurationMs': 4}, 'the host\'s key wins');
  assert.deepEqual(assembleResult({ok: false, error: 'boom', responseMeta: {a: 1}})._meta, {a: 1});
  assert.equal(Object.hasOwn(assembleResult({ok: true, output: 'x', responseMeta: {}}), '_meta'), false);
});
