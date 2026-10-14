// cua's own REPL kernel (src/repl-host/kernel.mjs, a port of the vendor node_repl kernel) driven as a real child over its
// JSONL wire: persistent and redeclarable top-level bindings across cells, top-level await, dynamic import, refusal of
// static imports and of `process`, code generation disabled, the partial bindings a thrown cell leaves, the banner and
// the process lifecycle. Expected sentences are the vendor's, as the M0 vendor run recorded them
// (docs/evidence/2026-10-14-own-repl-host-parity/m0/vendor-1/results.jsonl).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {kernelNode, startKernel} from './kernel-harness.mjs';

const {node, skip} = kernelNode();
const kernelTest = (name, fn) => test(name, {skip}, t => fn(t, startKernel(t, {node})));

const ok = (result, output) => {
  assert.equal(result.error, null, `cell failed: ${result.error}`);
  assert.equal(result.ok, true);
  if (output !== undefined) assert.equal(result.output, output);
};
const failed = (result, error) => {
  assert.equal(result.ok, false);
  assert.equal(result.error, error);
};

kernelTest('top-level bindings persist across cells and can be redeclared', async (t, kernel) => {
  ok((await kernel.exec('let parityValue=41;')).result, '');
  ok((await kernel.exec('nodeRepl.write(parityValue+1);')).result, '42');
  ok((await kernel.exec('let parityValue=2; nodeRepl.write(parityValue);')).result, '2');
  ok((await kernel.exec('var v = 1; function f() { return "fn"; } class C { static x = "cls"; }')).result, '');
  ok((await kernel.exec('nodeRepl.write([v, f(), C.x].join(","));')).result, '1,fn,cls');
  ok((await kernel.exec('const {a, b: [c]} = {a: "A", b: ["C"]}; let count = 0;')).result, '');
  ok((await kernel.exec('count += 1; nodeRepl.write(a + c + count);')).result, 'AC1');
});

kernelTest('a const redeclared or reassigned in a later cell warns as the vendor does', async (t, kernel) => {
  ok((await kernel.exec('const fixed = 1;')).result);
  ok((await kernel.exec('const fixed = 2; nodeRepl.write(fixed);')).result,
    'Warning: fixed was declared with const; use let for reassignable variables.\n2');
  // A reassigned carried const is re-declared with let so the assignment works, still with the warning.
  ok((await kernel.exec('fixed = 3; nodeRepl.write(fixed);')).result,
    'Warning: fixed was declared with const; use let for reassignable variables.\n3');
});

kernelTest('top-level await, and dynamic import of builtins and of a local module', async (t, kernel) => {
  ok((await kernel.exec('let answer=await Promise.resolve(42); nodeRepl.write(answer);')).result, '42');
  ok((await kernel.exec('let pathModule=await import("node:path"); nodeRepl.write(pathModule.basename("/fixture/leaf"));')).result, 'leaf');
  ok((await kernel.exec('let bufferModule=await import("node:buffer");nodeRepl.write([pathModule.basename("/fixture/leaf"),bufferModule.Buffer.from("ok").toString()]);')).result, "[ 'leaf', 'ok' ]");
  writeFileSync(join(kernel.cwd, 'local.mjs'), 'export const local = "from-file";\n');
  ok((await kernel.exec('const {local} = await import("./local.mjs"); nodeRepl.write(local);')).result, 'from-file');
  failed((await kernel.exec('await import("./absent.mjs");')).result, 'Module not found: ./absent.mjs');
  failed((await kernel.exec('await import("no-such-package");')).result, 'Module not found: no-such-package');
});

test('bare package imports resolve in the working directory and the configured module directories', {skip}, async t => {
  const modules = mkdtempSync(join(tmpdir(), 'cua-kernel-modules-'));
  t.after(() => rmSync(modules, {recursive: true, force: true}));
  const pkg = (root, name, manifest, files) => {
    mkdirSync(join(root, 'node_modules', name), {recursive: true});
    writeFileSync(join(root, 'node_modules', name, 'package.json'), JSON.stringify({name, ...manifest}));
    for (const [file, text] of Object.entries(files)) writeFileSync(join(root, 'node_modules', name, file), text);
  };
  pkg(modules, 'fixture-esm', {type: 'module', exports: './index.js'}, {'index.js': 'import {part} from "./part.js"; export const kind = `esm-${part}`;\n', 'part.js': 'export const part = "linked";\n'});
  pkg(modules, 'fixture-cjs', {main: 'index.js'}, {'index.js': 'module.exports = {kind: "cjs"};\n'});
  const kernel = startKernel(t, {node, env: {CUA_REPL_NODE_MODULE_DIRS: join(modules, 'node_modules')}});
  pkg(kernel.cwd, 'fixture-local', {type: 'module', exports: './index.js'}, {'index.js': 'export const kind = "local";\n'});
  ok((await kernel.exec('const esm = await import("fixture-esm"); const cjs = await import("fixture-cjs"); const local = await import("fixture-local"); nodeRepl.write([esm.kind, cjs.default.kind, local.kind].join(","));')).result, 'esm-linked,cjs,local');
  failed((await kernel.exec('await import("./node_modules");')).result, 'Unsupported import specifier "./node_modules" in node_repl. Directory imports are not supported.');
});

kernelTest('static imports and process are refused with the vendor sentences', async (t, kernel) => {
  failed((await kernel.exec('import fs from "node:fs";')).result,
    'Top-level static import "node:fs" is not supported in node_repl. Use await import("node:fs") instead.');
  failed((await kernel.exec('nodeRepl.write(process.version);')).result, 'process is not defined');
  failed((await kernel.exec('await import("node:process");')).result, 'Importing module "node:process" is not allowed in node_repl');
  failed((await kernel.exec('await import("process");')).result, 'Importing module "process" is not allowed in node_repl');
  ok((await kernel.exec('nodeRepl.write(typeof globalThis.process);')).result, 'undefined');
});

kernelTest('string and WebAssembly code generation are disabled', async (t, kernel) => {
  failed((await kernel.exec('eval("1+1");')).result, 'Code generation from strings disallowed for this context');
  failed((await kernel.exec('new Function("return 1")();')).result, 'Code generation from strings disallowed for this context');
  failed((await kernel.exec('await WebAssembly.compile(new Uint8Array([0,97,115,109,1,0,0,0]));')).result,
    'WebAssembly.compile(): Wasm code generation disallowed by embedder');
});

kernelTest('a thrown cell reports its message, keeps the bindings it completed and leaves the kernel usable', async (t, kernel) => {
  failed((await kernel.exec('let completedBinding=7; throw new Error("fixture-error"); let unreached=1;')).result, 'fixture-error');
  ok((await kernel.exec('nodeRepl.write(completedBinding);')).result, '7');
  ok((await kernel.exec('nodeRepl.write(typeof unreached);')).result, 'undefined');
  // Hoisted var and function bindings carry forward only once their declaration site ran.
  failed((await kernel.exec('var early = 1; throw "plain"; var late = 2; function hoisted() {}')).result, 'plain');
  ok((await kernel.exec('nodeRepl.write([typeof early, typeof late, typeof hoisted].join(","));')).result, 'number,undefined,undefined');
  // A cell that fails to link keeps every earlier binding.
  failed((await kernel.exec('import x from "y"; let shadow = 1;')).result,
    'Top-level static import "y" is not supported in node_repl. Use await import("y") instead.');
  ok((await kernel.exec('nodeRepl.write(completedBinding + early);')).result, '8');
  // A redeclared binding whose new initialiser never ran keeps its earlier value.
  failed((await kernel.exec('throw new Error("before"); let completedBinding = 0;')).result, 'before');
  ok((await kernel.exec('nodeRepl.write(completedBinding);')).result, '7');
});

kernelTest('a cell\'s messages are its submitted-code completion, then its result', async (t, kernel) => {
  const {result, messages} = await kernel.exec('nodeRepl.write("x");', {id: 'cell-a'});
  assert.deepEqual(messages.map(m => m.type), ['submitted_code_complete', 'exec_result']);
  assert.equal(messages[0].exec_id, 'cell-a');
  assert.equal(typeof messages[0].execution_duration_ms, 'number');
  assert.deepEqual(result, {type: 'exec_result', content_items: [], id: 'cell-a', ok: true, output: 'x', named_outputs: [], error: null});
  const failure = await kernel.exec('throw new Error("e");', {id: 'cell-b'});
  assert.deepEqual(failure.messages.map(m => m.type), ['submitted_code_complete', 'exec_result']);
  assert.deepEqual(failure.result, {type: 'exec_result', content_items: [], id: 'cell-b', ok: false, output: '', named_outputs: [], error: 'e'});
});

kernelTest('cells sent back to back run one at a time, in order', async (t, kernel) => {
  kernel.send({type: 'exec', id: 'q1', code: 'let order = []; await new Promise(r => setTimeout(r, 50)); order.push(1);'});
  kernel.send({type: 'exec', id: 'q2', code: 'order.push(2); nodeRepl.write(order.join(","));'});
  const first = await kernel.next(m => m.type === 'exec_result');
  const second = await kernel.next(m => m.type === 'exec_result', first.index + 1);
  assert.equal(first.message.id, 'q1');
  assert.equal(second.message.id, 'q2');
  assert.equal(second.message.output, '1,2');
});

test('the banner runs once, before the first cell that runs it to completion, and is gone from the environment', {skip}, async t => {
  const kernel = startKernel(t, {node, env: {CUA_REPL_JS_BANNER: 'globalThis.bannerRuns = (globalThis.bannerRuns ?? 0) + 1;'}});
  ok((await kernel.exec('nodeRepl.write(bannerRuns);')).result, '1');
  ok((await kernel.exec('nodeRepl.write(bannerRuns);')).result, '1');
  // Read through the main realm's require, which the kernel (like the vendor's) does not deny.
  ok((await kernel.exec('const {createRequire} = await import("node:module"); nodeRepl.write(typeof createRequire(import.meta.url)("process").env.CUA_REPL_JS_BANNER);')).result, 'undefined');
  const failing = startKernel(t, {node, env: {CUA_REPL_JS_BANNER: 'globalThis.bannerRuns = (globalThis.bannerRuns ?? 0) + 1; if (bannerRuns === 1) throw new Error("banner-failed");'}});
  failed((await failing.exec('nodeRepl.write("unreached");')).result, 'banner-failed');
  ok((await failing.exec('nodeRepl.write(bannerRuns);')).result, '2');
  ok((await failing.exec('nodeRepl.write(bannerRuns);')).result, '2');
});

test('the vendor\'s NODE_REPL_ settings configure nothing in the own kernel', {skip}, async t => {
  const kernel = startKernel(t, {node, env: {NODE_REPL_JS_BANNER: 'globalThis.vendorBanner = true;', NODE_REPL_TRUSTED_RPC_ENABLED: '1',
    NODE_REPL_UNTRUSTED_ENV_ALLOWLIST: 'FIXTURE', FIXTURE: 'value'}});
  ok((await kernel.exec('nodeRepl.write([typeof vendorBanner, typeof nodeRepl.rpc, Object.keys(nodeRepl.env).length].join(","));')).result, 'undefined,undefined,0');
});

test('an unhandled rejection settles the running cell with the vendor sentence and ends the kernel', {skip}, async t => {
  const kernel = startKernel(t, {node});
  const {result} = await kernel.exec('Promise.reject(new Error("boom")); await new Promise(() => {});');
  failed(result, 'node_repl kernel unhandled rejection: boom; kernel reset. Catch or handle async errors (including Promise rejections and EventEmitter \'error\' events) to avoid kernel termination.');
  assert.deepEqual(await kernel.exited, {code: 1, signal: null});
  assert.match(kernel.stderr(), /node_repl kernel unhandled rejection: boom/);
});

test('the kernel exits when its input closes', {skip}, async t => {
  const kernel = startKernel(t, {node});
  ok((await kernel.exec('setInterval(() => {}, 1000); nodeRepl.write("handle kept");')).result, 'handle kept');
  kernel.child.stdin.end();
  assert.deepEqual(await kernel.exited, {code: 0, signal: null});
});

test('the kernel refuses to start without its bootstrap arguments', {skip}, async t => {
  const kernel = startKernel(t, {node, args: ['--working-dir', '/']});
  assert.deepEqual(await kernel.exited, {code: 1, signal: null});
  assert.match(kernel.stderr(), /node_repl invalid kernel bootstrap args: missing --session-id/);
  const missing = startKernel(t, {node, args: ['--session-id', 's', '--working-dir', '/nonexistent-cua-kernel-dir']});
  assert.deepEqual(await missing.exited, {code: 1, signal: null});
  assert.match(missing.stderr(), /node_repl failed to switch to working directory "\/nonexistent-cua-kernel-dir"/);
});
