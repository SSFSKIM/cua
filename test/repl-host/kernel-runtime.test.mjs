// The cell-facing runtime of cua's own REPL kernel (the spec's CellRuntime: src/repl-host/worker-runtime.mjs and the
// kernel's cell globals), driven as a real kernel child over its JSONL wire: immutable `nodeRepl` and `tmpDir`, the
// frozen allowlisted environment, per-execution request metadata, `write` and console capture, the `emit_image` inner
// request and its acknowledgement, and `rpc` only when configured. Expected sentences and output are the vendor's, as
// the M0 vendor run recorded them (docs/evidence/2026-10-14-own-repl-host-parity/m0/vendor-1/results.jsonl).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {kernelNode, startKernel} from './kernel-harness.mjs';

const {node, skip} = kernelNode();
const FIXTURES = new URL('../repl-parity/fixtures/', import.meta.url);
const image = format => readFileSync(new URL(`pattern.${format}`, FIXTURES));

const ok = (result, output) => {
  assert.equal(result.error, null, `cell failed: ${result.error}`);
  assert.equal(result.ok, true);
  if (output !== undefined) assert.equal(result.output, output);
};
const failed = (result, error) => {
  assert.equal(result.ok, false);
  assert.equal(result.error, error);
};
const types = messages => messages.map(m => m.type);

test('nodeRepl and tmpDir are immutable cell globals exposing only the base context', {skip}, async t => {
  const kernel = startKernel(t, {node});
  ok((await kernel.exec('nodeRepl.write(Object.isFrozen(nodeRepl)&&Object.getOwnPropertyDescriptor(globalThis,"nodeRepl").writable===false);')).result, 'true');
  ok((await kernel.exec('nodeRepl.write(Object.getOwnPropertyDescriptor(globalThis,"tmpDir").writable===false);')).result, 'true');
  ok((await kernel.exec('nodeRepl.write(Object.keys(nodeRepl).sort().join(","));')).result, 'cwd,emitImage,env,homeDir,requestMeta,tmpDir,write');
  ok((await kernel.exec('nodeRepl.write([nodeRepl.cwd, nodeRepl.homeDir, nodeRepl.tmpDir, tmpDir].join("|"));')).result,
    [kernel.cwd, kernel.cwd, kernel.cwd, kernel.cwd].join('|'));
  const refusals = ['nodeRepl = {}', 'globalThis.nodeRepl = {}', 'tmpDir = "/elsewhere"', 'delete globalThis.tmpDir', 'nodeRepl.write = () => {}',
    'nodeRepl.extra = 1', 'nodeRepl.env.EXTRA = "x"'];
  ok((await kernel.exec('const original = nodeRepl;')).result);
  for (const attempt of refusals) {
    ok((await kernel.exec(`let refusedAs; try { ${attempt}; } catch (error) { refusedAs = error.name; } nodeRepl.write(refusedAs);`)).result, 'TypeError');
  }
  ok((await kernel.exec('nodeRepl.write(nodeRepl === original && tmpDir === nodeRepl.tmpDir && typeof nodeRepl.write === "function");')).result, 'true');
  ok((await kernel.exec('nodeRepl.write(typeof nodeRepl.rpc);')).result, 'undefined');
});

test('nodeRepl.env is a frozen snapshot of the allowlisted names only', {skip}, async t => {
  const empty = startKernel(t, {node, env: {FIXTURE_A: 'a'}});
  ok((await empty.exec('nodeRepl.write(Object.isFrozen(nodeRepl.env)&&Object.keys(nodeRepl.env).length===0);')).result, 'true');
  const allowed = startKernel(t, {node, env: {CUA_REPL_UNTRUSTED_ENV_ALLOWLIST: ' FIXTURE_A , MISSING,,', FIXTURE_A: 'a', FIXTURE_B: 'b'}});
  ok((await allowed.exec('nodeRepl.write(JSON.stringify(nodeRepl.env) + Object.isFrozen(nodeRepl.env));')).result, '{"FIXTURE_A":"a"}true');
});

test('requestMeta is the executing cell\'s own deep-frozen copy, null when the request carries none', {skip}, async t => {
  const kernel = startKernel(t, {node});
  const meta = {'cua/taskId': 'task-1', nested: {list: [1]}};
  ok((await kernel.exec('nodeRepl.write(JSON.stringify(nodeRepl.requestMeta) + Object.isFrozen(nodeRepl.requestMeta.nested.list));', {requestMeta: meta})).result,
    `${JSON.stringify(meta)}true`);
  ok((await kernel.exec('nodeRepl.write(String(nodeRepl.requestMeta));')).result, 'null');
  ok((await kernel.exec('nodeRepl.write(String(nodeRepl.requestMeta));', {requestMeta: ['not', 'an', 'object']})).result, 'null');
});

test('write and console output render as the vendor groups them', {skip}, async t => {
  const kernel = startKernel(t, {node});
  ok((await kernel.exec('nodeRepl.write("text");nodeRepl.write(42);nodeRepl.write({fixture:true});')).result, 'text42{ fixture: true }');
  ok((await kernel.exec('console.log("line-one");nodeRepl.write("write");console.log("line-two");')).result, 'line-one\nwriteline-two');
  ok((await kernel.exec('nodeRepl.write("first");console.log("second");nodeRepl.write("third");')).result, 'firstsecond\nthird');
  ok((await kernel.exec('console.info("i"); console.warn("w", 1); console.error({e: [1]}); console.debug("d");')).result, 'i\nw 1\n{ e: [ 1 ] }\nd');
  const named = (await kernel.exec('nodeRepl.write("A","same");nodeRepl.write("B","other");nodeRepl.write("C","same");')).result;
  ok(named, '');
  assert.deepEqual(named.named_outputs, ['AC', 'B']);
  failed((await kernel.exec('nodeRepl.write("x", "");')).result, 'nodeRepl.write expected a nonempty string content item ID');
});

test('output from a cell that has ended is refused, not attached to a later cell', {skip}, async t => {
  const kernel = startKernel(t, {node});
  // A carried binding is a snapshot taken when the next cell links, so the late callback reports through the global.
  ok((await kernel.exec('setTimeout(() => { try { nodeRepl.write("late"); } catch (e) { globalThis.lateError = e.message; } }, 20);')).result, '');
  ok((await kernel.exec('await new Promise(r => setTimeout(r, 100)); nodeRepl.write(globalThis.lateError);')).result, 'node_repl exec context not found');
});

test('emitImage sends an emit_image request for each input form and waits for its acknowledgement', {skip}, async t => {
  const kernel = startKernel(t, {node});
  const forms = {
    png: ['image', 'new Uint8Array(image)', 'new Uint8Array(image).buffer', 'new DataView(new Uint8Array(image).buffer)', 'Promise.resolve(image)'],
    jpeg: ['image', '{bytes: image, mimeType: "image/jpeg"}', '{bytes: new Uint8Array(image).buffer, mimeType: "image/jpeg"}'],
    webp: ['image', '{bytes: new DataView(new Uint8Array(image).buffer), mimeType: "image/webp"}', 'Promise.resolve({bytes: image, mimeType: "image/webp"})'],
  };
  let emitted = 0;
  for (const [format, values] of Object.entries(forms)) {
    const expected = `data:image/${format};base64,${image(format).toString('base64')}`;
    for (const value of values) {
      const {result, messages} = await kernel.exec(`let image = (await import("node:buffer")).Buffer.from(${JSON.stringify(image(format).toString('base64'))}, "base64"); await nodeRepl.emitImage(${value});`, {id: 'img'});
      ok(result, '');
      assert.deepEqual(types(messages), ['emit_image', 'submitted_code_complete', 'exec_result'], value);
      // Request ids run on one counter for the kernel's life, as the vendor's bridge numbers them.
      assert.deepEqual(messages[0], {type: 'emit_image', id: `img-emit-image-${emitted++}`, exec_id: 'img', image_url: expected}, `${format} ${value}`);
    }
  }
  const dataUrl = `data:image/png;base64,${image('png').toString('base64')}`;
  const passed = await kernel.exec(`await nodeRepl.emitImage(${JSON.stringify(dataUrl)}); await nodeRepl.emitImage(Promise.resolve(${JSON.stringify(dataUrl)}));`, {id: 'url'});
  assert.deepEqual(passed.messages.filter(m => m.type === 'emit_image').map(m => [m.id, m.image_url]), [[`url-emit-image-${emitted}`, dataUrl], [`url-emit-image-${emitted + 1}`, dataUrl]]);
  writeFileSync(join(kernel.cwd, 'fixture.webp'), image('webp'));
  const file = await kernel.exec(`await nodeRepl.emitImage(${JSON.stringify(pathToFileURL(join(kernel.cwd, 'fixture.webp')).href)});`, {id: 'file'});
  assert.equal(file.messages[0].image_url, `data:image/webp;base64,${image('webp').toString('base64')}`);
});

test('an unawaited image still settles before the cell completes, and a refused acknowledgement fails the cell', {skip}, async t => {
  const kernel = startKernel(t, {node});
  const dataUrl = `data:image/png;base64,${image('png').toString('base64')}`;
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const pending = kernel.exec(`nodeRepl.write("before"); nodeRepl.emitImage(${JSON.stringify(dataUrl)}); nodeRepl.write("after");`, {id: 'bg', reply: message => {
    if (message.type !== 'emit_image') return undefined;
    held.then(() => kernel.send({type: 'emit_image_result', id: message.id, ok: true}));
    return null;
  }});
  await kernel.next(m => m.type === 'emit_image');
  await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(kernel.received.some(m => m.type === 'submitted_code_complete' || m.type === 'exec_result'), false, 'the cell waits for the acknowledgement');
  release();
  const {result, messages} = await pending;
  ok(result, 'beforeafter');
  assert.deepEqual(types(messages), ['emit_image', 'submitted_code_complete', 'exec_result']);
  const refused = await kernel.exec(`await nodeRepl.emitImage(${JSON.stringify(dataUrl)});`, {reply: m => m.type === 'emit_image' ? {type: 'emit_image_result', id: m.id, ok: false, error: 'nodeRepl.emitImage only accepts image/* data URLs'} : undefined});
  failed(refused.result, 'nodeRepl.emitImage only accepts image/* data URLs');
  const unobserved = await kernel.exec(`nodeRepl.emitImage(${JSON.stringify(dataUrl)}); nodeRepl.write("ran");`, {reply: m => m.type === 'emit_image' ? {type: 'emit_image_result', id: m.id, ok: false} : undefined});
  failed(unobserved.result, 'emitImage failed');
  assert.equal(unobserved.result.output, 'ran');
});

test('emitImage refuses invalid inputs with the vendor sentences, before any request', {skip}, async t => {
  const kernel = startKernel(t, {node});
  for (const [value, error] of [
    ['"https://example.invalid/image.png"', 'nodeRepl.emitImage only accepts data or file URLs'],
    ['""', 'nodeRepl.emitImage expected a non-empty image_url'],
    ['new Uint8Array([1,2,3])', 'nodeRepl.emitImage could not infer image MIME type from bytes; expected PNG, JPEG, or WebP data'],
    ['new Uint8Array()', 'nodeRepl.emitImage could not infer image MIME type from bytes; expected PNG, JPEG, or WebP data'],
    ['({other:true})', 'nodeRepl.emitImage received an unsupported value'],
    ['({bytes:new Uint8Array([1]),mimeType:"image/png",extra:1})', 'nodeRepl.emitImage received an unsupported value'],
    ['({bytes:"text",mimeType:"image/png"})', 'nodeRepl.emitImage expected bytes to be Buffer, Uint8Array, ArrayBuffer, or ArrayBufferView'],
    ['({bytes:new Uint8Array(),mimeType:"image/png"})', 'nodeRepl.emitImage expected non-empty bytes'],
    ['({bytes:new Uint8Array([1]),mimeType:""})', 'nodeRepl.emitImage expected a non-empty mimeType'],
    ['Promise.reject(new Error("fixture-image-rejection"))', 'fixture-image-rejection'],
  ]) {
    const {result, messages} = await kernel.exec(`await nodeRepl.emitImage(${value});`);
    failed(result, error);
    assert.equal(messages.some(m => m.type === 'emit_image'), false, value);
  }
  // The {bytes, mimeType} form passes its MIME type through; the host, not the kernel, refuses a non-image one.
  const {messages} = await kernel.exec('await nodeRepl.emitImage({bytes:new Uint8Array([1,2]),mimeType:"text/plain"});', {id: 'mime'});
  assert.equal(messages[0].image_url, 'data:text/plain;base64,AQI=');
});

test('rpc exists only when configured, and correlates trusted service requests and the after-code hooks', {skip}, async t => {
  const kernel = startKernel(t, {node, env: {CUA_REPL_TRUSTED_RPC_ENABLED: '1'}});
  ok((await kernel.exec('nodeRepl.write(typeof nodeRepl.rpc + Object.isFrozen(nodeRepl));')).result, 'functiontrue');
  const {result, messages} = await kernel.exec('const value = await nodeRepl.rpc("fixture", {method: "setup", params: [1]}); nodeRepl.write(JSON.stringify(value));', {id: 'rpc', reply: m => {
    if (m.type === 'trusted_service_request') return {type: 'trusted_service_response', id: m.id, ok: true, value: {answered: m.service}, output: [{kind: 'write', text: 'service-output;'}], content_items: [{type: 'input_text', text: 'item'}]};
    return undefined;
  }});
  ok(result, 'service-output;{"answered":"fixture"}');
  assert.deepEqual(result.content_items, [{type: 'input_text', text: 'item'}]);
  assert.deepEqual(types(messages), ['trusted_service_request', 'submitted_code_complete', 'trusted_service_hooks', 'exec_result']);
  assert.deepEqual(messages[0], {type: 'trusted_service_request', id: 'rpc-trusted-rpc-1', exec_id: 'rpc', service: 'fixture', request: {method: 'setup', params: [1]}});
  assert.deepEqual(messages[2], {type: 'trusted_service_hooks', id: 'rpc-trusted-rpc-2', exec_id: 'rpc'});
  const refused = await kernel.exec('await nodeRepl.rpc("fixture", {});', {reply: m => m.type === 'trusted_service_request' ? {type: 'trusted_service_response', id: m.id, ok: false, error: 'service refused'} : undefined});
  failed(refused.result, 'service refused');
  failed((await kernel.exec('await nodeRepl.rpc("", {});')).result, 'nodeRepl.rpc expected a nonempty service identifier');
  failed((await kernel.exec('await nodeRepl.rpc("fixture");')).result, 'nodeRepl.rpc expected a JSON-serializable request');
  // A thrown cell still runs the after-code hooks, then reports its own error.
  const thrown = await kernel.exec('throw new Error("cell-error");');
  failed(thrown.result, 'cell-error');
  assert.deepEqual(types(thrown.messages), ['submitted_code_complete', 'trusted_service_hooks', 'exec_result']);
});
