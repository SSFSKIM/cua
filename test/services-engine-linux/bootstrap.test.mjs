// The facade's whole bootstrap (src/cua-api/create-tinysky-alt.mjs, its Sky proxy src/cua-api/sky.mjs) over cua's Linux
// service when the engine cannot be driven: it completes, and a computer call answers with the sentence saying why.
// The proxy answers every member of a rejected setup, `then` included, with a rejecting function, so a service whose
// setup rejected would leave the async bootstrap pending for ever (M3.2's task review). Each case runs in its own Node
// process, since the facade asks for setup once, when sky.mjs is first imported.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {fakeLinuxEngine} from '../helpers/fake-linux-engine.mjs';

const SERVICE = new URL('../../src/services/engine/linux/service.mjs', import.meta.url).href;
const FACADE = new URL('../../src/cua-api/create-tinysky-alt.mjs', import.meta.url).href;
const SCRIPT = `
const unhandled = [];
process.on('unhandledRejection', error => unhandled.push(String(error?.message ?? error)));
const {createService} = await import(${JSON.stringify(SERVICE)});
const service = createService({env: process.env});
globalThis.nodeRepl = {
  rpc: async (_name, message) => { const answer = await service.handleRpc(message); return answer === undefined ? null : JSON.parse(JSON.stringify(answer)); },
  write: () => {}, emitImage: async () => {},
};
const timer = setTimeout(() => { console.log(JSON.stringify({bootstrap: 'pending', unhandled})); process.exit(3); }, 5000);
const {create_tinysky_alt} = await import(${JSON.stringify(FACADE)});
const cua = await create_tinysky_alt({browser: false});
const refusals = [];
for (const call of [() => cua.listWindows({emit: false}), () => cua.getApp({windowId: 7}), () => cua.computer.click({x: 1, y: 1})])
  try { await call(); refusals.push(null); } catch (error) { refusals.push(error.message); }
clearTimeout(timer);
service.close();
console.log(JSON.stringify({bootstrap: 'done', target: cua.computer.target, getApp: typeof cua.getApp, refusals, unhandled}));
`;

const bootstrap = env => new Promise(resolve => {
  execFile(process.execPath, ['--input-type=module', '-e', SCRIPT], {env: {...process.env, ...env}, timeout: 20_000}, (error, stdout, stderr) => {
    const line = stdout.trim().split('\n').at(-1);
    resolve({code: error?.code ?? 0, result: line ? JSON.parse(line) : null, stderr});
  });
});

test('with an engine older than MIN_ENGINE_VERSION the facade\'s bootstrap completes and every computer call answers with the version sentence', async t => {
  const engine = fakeLinuxEngine(t, {version: 'cua-engine 0.2.0 (8b49b6825ae5)'});
  const {code, result, stderr} = await bootstrap({CUA_ENGINE_BIN: engine.path});
  assert.equal(code, 0, stderr);
  const sentence = 'cua-engine 0.2.0 is older than 0.3.0, which this cua needs; run cua install --engine';
  assert.deepEqual(result, {bootstrap: 'done', target: 'linux', getApp: 'function', refusals: [sentence, sentence, sentence], unhandled: []});
  assert.deepEqual(engine.spawns(), [], 'nothing was started, so nothing was sent');
});

test('with an engine that cannot be started the facade\'s bootstrap completes and every computer call answers with the spawn sentence', async t => {
  const engine = fakeLinuxEngine(t);
  const missing = `${engine.dir}/absent`;
  const {code, result, stderr} = await bootstrap({CUA_ENGINE_BIN: missing});
  assert.equal(code, 0, stderr);
  const sentence = `cua-engine at ${missing} could not be run (ENOENT); run cua install --engine`;
  assert.deepEqual(result, {bootstrap: 'done', target: 'linux', getApp: 'function', refusals: [sentence, sentence, sentence], unhandled: []});
});
