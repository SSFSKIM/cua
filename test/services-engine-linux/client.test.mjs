// cua's Linux service's engine client (src/services/engine/linux/client.mjs) against a fake cua-engine speaking the
// wire (../helpers/fake-linux-engine.mjs): the version check before the first request, the spawn with the device mode,
// the capability report read on every start, requests by id, the restart rule, an engine that exits or writes garbage.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MIN_ENGINE_VERSION, createEngineClient, engineVersionOf, isOlder} from '../../src/services/engine/linux/client.mjs';
import {fakeLinuxEngine} from '../helpers/fake-linux-engine.mjs';

const client = (t, engine, options = {}) => {
  const made = createEngineClient({path: engine.path, ...options});
  t.after(() => made.close());
  return made;
};

test('MIN_ENGINE_VERSION is M3\'s release; versions read from the --version line and compare numerically', () => {
  assert.equal(MIN_ENGINE_VERSION, '0.3.0');
  assert.equal(engineVersionOf('cua-engine 0.3.0 (9381f166e106)'), '0.3.0');
  assert.equal(engineVersionOf('cua-engine 1.12.4 (local)\n'), '1.12.4');
  for (const line of ['', 'sky_linux 0.3.0', 'cua-engine 0.3 (x)', 'cua-engine v0.3.0 (x)']) assert.equal(engineVersionOf(line), null, line);
  assert.equal(isOlder('0.2.9', '0.3.0'), true);
  assert.equal(isOlder('0.3.0', '0.3.0'), false);
  assert.equal(isOlder('0.10.0', '0.3.0'), false, 'numerically, not as text');
  assert.equal(isOlder('1.0.0', '0.3.0'), false);
});

test('an engine older than MIN_ENGINE_VERSION is refused before it is started, with the sentence naming the remedy', async t => {
  const engine = fakeLinuxEngine(t, {version: 'cua-engine 0.2.0 (8b49b6825ae5)'});
  const made = client(t, engine);
  await assert.rejects(made.request('list_windows', {}), {message: 'cua-engine 0.2.0 is older than 0.3.0, which this cua needs; run cua install --engine'});
  await assert.rejects(made.capabilities(), {message: /^cua-engine 0\.2\.0 is older than 0\.3\.0/});
  assert.deepEqual(engine.spawns(), [], 'no server was started');
});

test('an engine whose version cannot be read, or that cannot run, is refused before anything is sent', async t => {
  const garbled = fakeLinuxEngine(t, {version: 'hello'});
  await assert.rejects(client(t, garbled).request('list_windows', {}), {message: `cua-engine at ${garbled.path} printed no version this cua recognizes ("hello"); run cua install --engine`});
  assert.deepEqual(garbled.spawns(), []);
  const missing = `${garbled.dir}/absent`;
  await assert.rejects(client(t, {path: missing}).request('list_windows', {}), {message: `cua-engine at ${missing} could not be run (ENOENT); run cua install --engine`});
});

test('the engine starts as `server --desktop <mode>`, answers its capabilities first, then requests by increasing id; output is the JSON value', async t => {
  const engine = fakeLinuxEngine(t);
  const made = client(t, engine, {desktop: 'dedicated'});
  const caps = await made.capabilities();
  assert.equal(caps.desktop, 'dedicated');
  assert.deepEqual(caps.input, {background: true, desktop: true});
  const [windows, handle, none] = await Promise.all([made.request('list_windows', {}), made.request('clipboard_read', {window: {id: 7}}), made.request('press_key', {key: 'a'})]);
  assert.equal(windows.length, 2);
  assert.equal(handle, 'handle-1');
  assert.equal(none, null);
  assert.deepEqual(engine.spawns().map(spawn => spawn.args), [['server', '--desktop', 'dedicated']]);
  assert.deepEqual(engine.requests().map(({id, command, input}) => [id, command, input]),
    [[1, 'capabilities', {}], [2, 'list_windows', {}], [3, 'clipboard_read', {window: {id: 7}}], [4, 'press_key', {key: 'a'}]]);
});

test('an error answer rejects with its sentence; an answer with no sentence names the command', async t => {
  const engine = fakeLinuxEngine(t, {behaviour: `export function answer(command) {
    if (command === 'click') return {error: 'Window 7 is unavailable.'};
    if (command === 'scroll') return {error: 42};
  }`});
  const made = client(t, engine);
  await assert.rejects(made.request('click', {}), {message: 'Window 7 is unavailable.'});
  await assert.rejects(made.request('scroll', {}), {message: 'cua-engine request failed: scroll'});
  assert.deepEqual(await made.request('list_windows', {}).then(windows => windows.length), 2, 'the engine is still the same process');
  assert.equal(engine.spawns().length, 1);
});

test('restart: true ends that engine and fails what else was pending; the next request starts a fresh engine, its version checked again', async t => {
  const engine = fakeLinuxEngine(t, {behaviour: `export async function answer(command, input, ctx) {
    if (command === 'move') return {error: 'the X connection broke', restart: true};
    if (command === 'press_key') { await new Promise(resolve => setTimeout(resolve, 2000)); return undefined; }
  }`});
  const made = client(t, engine);
  await made.capabilities();
  const slow = made.request('press_key', {key: 'a'});
  const broken = made.request('move', {x: 1, y: 2});
  await assert.rejects(broken, {message: 'the X connection broke'});
  await assert.rejects(slow, {message: 'the X connection broke'});
  assert.equal((await made.request('list_windows', {})).length, 2);
  const spawns = engine.spawns();
  assert.equal(spawns.length, 2);
  assert.notEqual(spawns[0].pid, spawns[1].pid);
  assert.deepEqual(engine.requests().filter(r => r.pid === spawns[1].pid).map(r => r.command), ['capabilities', 'list_windows'], 'the fresh engine reports its capabilities first');
});

test('an engine that exits fails what was pending with its exit status and the tail of its stderr; the next request restarts it', async t => {
  const engine = fakeLinuxEngine(t, {behaviour: `export function answer(command) {
    if (command === 'drag') return {exit: 3, stderr: 'panicked at src/x11.rs\\n'};
  }`});
  const made = client(t, engine);
  await assert.rejects(made.request('drag', {}), {message: 'cua-engine stopped (exit=3): panicked at src/x11.rs'});
  assert.equal((await made.request('list_windows', {})).length, 2);
  assert.equal(engine.spawns().length, 2);
});

test('an answer that is not JSON, or carries no numeric id, ends the engine and fails what was pending', async t => {
  const engine = fakeLinuxEngine(t, {behaviour: `export function answer(command) {
    if (command === 'move') return {raw: 'not json'};
    if (command === 'scroll') return {raw: '{"ok":true}'};
  }`});
  const made = client(t, engine);
  await assert.rejects(made.request('move', {}), {message: 'cua-engine server emitted invalid JSON: not json'});
  await assert.rejects(made.request('scroll', {}), {message: 'cua-engine server response missing numeric id'});
  assert.equal((await made.request('list_windows', {})).length, 2);
  assert.equal(engine.spawns().length, 3);
});

test('answers are matched by id, whatever order they come in', async t => {
  const engine = fakeLinuxEngine(t, {behaviour: `export async function answer(command) {
    if (command === 'press_key') { await new Promise(resolve => setTimeout(resolve, 200)); return {output: 'slow'}; }
    if (command === 'move') return {output: 'fast'};
  }`});
  const made = client(t, engine);
  const order = [];
  await Promise.all([made.request('press_key', {}).then(v => order.push(v)), made.request('move', {}).then(v => order.push(v))]);
  assert.deepEqual(order, ['fast', 'slow']);
});
