// The matrix's run (scripts/native-matrix/run.mjs) against doubles of the device and the lane (./lane.mjs dryOps and
// dryConnect, steered per test): the hold's order, the result's shape, the refusals, the engine pinned, the key guard,
// and the oracle charging an activation to the row it fell in.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {validateCellResult} from '../../scripts/native-matrix/cell-result.mjs';
import {dryConnect, dryOps} from '../../scripts/native-matrix/lane.mjs';
import {planOf, runMatrix} from '../../scripts/native-matrix/run.mjs';

const BUNDLE = '/A/cua Engine.app';
// A run on doubles: `steps` records every device step by name; `ops` and `cell` override answers.
async function runWith({engine = 'cua', plan = planOf('background', {scene: 'textedit', user: 'finder'}), ops: over = {}, cell = null, checkout = {commit: 'c', dirty: false}, attest = engine} = {}) {
  const steps = [];
  const ops = dryOps({log: line => steps.push(line.replace(/^dry: /, '')), engine, approvedEngine: BUNDLE, commit: 'c'});
  for (const [k, f] of Object.entries(over)) { const base = ops[k]; ops[k] = (...args) => f(base, ...args); }
  const connect = dryConnect({log: () => {}, engine: attest, host: engine});
  const steered = spec => {
    const client = connect(spec);
    const request = client.request;
    client.request = async (method, params) => {
      const answer = await request(method, params);
      const value = method === 'tools/call' && cell ? cell(params.arguments.code) : null;
      return value ? {...answer, content: [{type: 'text', text: `CUA_NATIVE_BASELINE ${JSON.stringify({ok: true, value, inCellMs: 1})}`}], _meta: {...answer._meta, ...(value._meta ?? {})}} : answer;
    };
    return client;
  };
  const out = fs.mkdtempSync(join(tmpdir(), 'matrix-run-'));
  try {
    const code = await runMatrix({device: 'mini', host: engine, engine, approvedRuntime: '/H', approvedEngine: BUNDLE, out, runs: 1, samples: 2, plan, cell: 'non-interference'},
      {ops, connect: steered, controllerCheckout: () => checkout, log: () => {}});
    const file = join(out, 'run-1', 'result.json');
    return {code, steps, result: fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null};
  } finally { fs.rmSync(out, {recursive: true, force: true}); }
}
const names = steps => steps.map(s => s.replace(/ .*$/, '') + (/^(live|scenes|goldens|matrix) /.test(s) ? ` ${JSON.parse(s.slice(s.indexOf(' ') + 1))[0]}` : ''));

test('one pairing of the background regime: the hold in order, a conforming result, every row judged by the oracle', async () => {
  const {code, steps, result} = await runWith();
  assert.equal(code, 0);
  assert.deepEqual(validateCellResult(result), []);
  assert.equal(result.cell, 'non-interference');
  const order = names(steps).filter(s => !/^(matrix read|scenes activate|helpers)/.test(s));
  assert.deepEqual(order, ['home', 'live begin', 'prepare', 'preflight', 'scenes preflight', 'scenes up', 'goldens steps', 'scenes up', 'goldens steps', 'goldens engine-stop',
    'live watch', 'serve', 'live watch', 'live recover', 'scenes frontmost', 'cleanup']);
  const method = result.rows.filter(r => r.section === 'method');
  assert.ok(method.length > 10 && method.every(r => r.regime === 'background' && r.user === 'finder' && r.id.endsWith('@finder')));
  assert.ok(method.every(r => r.interference?.ok === true), 'no activation, the front unchanged, the focus kept');
  assert.deepEqual(result.lanes, [{host: 'cua', engine: 'cua', build: 'd'.repeat(64), version: '0.0.0'}]);
  // Every action's front is read before it and after it, the after with the focus probe on the user window.
  assert.ok(steps.some(s => /^matrix \["read","--run","[^"]+","--focus","\d+,100,100,800,600"\]/.test(s)));
});

test('a dirty checkout is refused before anything on the device; a begin refusal is refused with nothing prepared', async () => {
  const dirty = await runWith({checkout: {commit: 'c', dirty: true}});
  assert.equal(dirty.code, 2);
  assert.equal(dirty.result.verdict, 'refused');
  assert.ok(!names(dirty.steps).includes('live begin'));
  const refused = await runWith({ops: {live: (base, args) => (args[0] === 'begin' ? {refusals: ['a run that died left finder up']} : base(args))}});
  assert.equal(refused.code, 2);
  assert.deepEqual(refused.result.problems, ['a run that died left finder up']);
  assert.ok(!names(refused.steps).includes('prepare'));
});

test('a result attesting another engine stops the lane, and the put-back and cleanup still run', async () => {
  const {code, steps, result} = await runWith({attest: 'vendor'});
  assert.equal(code, 1);
  assert.equal(result.complete, false);
  assert.ok(result.problems.some(p => /attested the vendor engine, not the requested cua/.test(p)));
  assert.ok(names(steps).includes('live recover') && names(steps).includes('cleanup'));
});

test('an activation inside a row\'s action fails that row\'s oracle only', async () => {
  let target = null;
  const {result} = await runWith({
    cell: code => (/__app\.click\(__m\.index\);/.test(code) && /the case was not prepared; nothing was sent/.test(code) && target === null ? (target = {actMs: 1, at: [5_000, 5_100], threw: false}) : null),
    ops: {live: (base, args) => (args[0] === 'watch' && args[1] === 'stop' ? {activations: [{kind: 'activated', bundleId: 'com.apple.TextEdit', scene: true, at: 5_050}]} : base(args))},
  });
  const failed = result.rows.filter(r => r.interference && !r.interference.ok);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].interference.activations, 1);
  assert.equal(result.verdict, 'pass', 'the outcome verdict is the rows\' ok; the oracle is judged by summary');
});

test('a key skipped with one of the run\'s windows in front leaves the row invalid; with another app in front the run stops', async () => {
  // The user window (Finder) is in front; a frontmost-regime key cell for TextEdit sees Finder: skipped, the row invalid.
  const plan = {frontmost: ['finder', 'textedit'], speed: false, finding: false, background: [], launch: []};
  const own = await runWith({plan, ops: {scenes: (base, args) => (args[0] === 'activate' && args[1] === 'textedit' ? base(['activate', 'finder']) : base(args))}});
  const skipped = own.result.rows.filter(r => /key guard/.test(r.invalid ?? ''));
  assert.deepEqual(skipped.map(r => r.id).sort(), ['textedit/frontmost/click.element', 'textedit/frontmost/paste.insert', 'textedit/frontmost/pressKey.selectAll', 'textedit/frontmost/typeText.insert']);
  assert.ok(own.result.rows.filter(r => r.target === 'finder').every(r => !r.invalid), 'Finder\'s own keys went with Finder in front');
  assert.ok(own.result.meta.keySkipped.every(k => k.front.owned === true));
  const foreign = await runWith({plan, ops: {matrix: (base, args) => (args[0] === 'read' ? {reading: {at: 0, frontmost: {pid: null, bundleId: 'com.google.Chrome', owned: false}, topWindow: null}} : base(args))}});
  assert.equal(foreign.code, 1);
  assert.ok(foreign.result.problems.some(p => /not one of the run's windows/.test(p)));
  assert.ok(names(foreign.steps).includes('live recover'));
});
