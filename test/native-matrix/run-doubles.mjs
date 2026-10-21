// The matrix run's doubles (scripts/native-matrix/run.mjs against ./lane.mjs dryOps and dryConnect, steered per test, on
// one made-up device clock), shared by the run's tests and its sections' (the probe cells, the Unicode matrix).
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AT_MARKER, dryConnect, dryOps} from '../../scripts/native-matrix/lane.mjs';
import {caseCells} from '../../scripts/native-matrix/matrix-cells.mjs';
import {CASES} from '../../scripts/native-matrix/plan.mjs';
import {planOf, runMatrix} from '../../scripts/native-matrix/run.mjs';

export const BUNDLE = '/A/cua Engine.app';
// A run on doubles: `steps` records every device step by name; `ops` and `cell` override answers, `lane` sees (and may
// fail) every js call first; `calls` (given, so a test's doubles can read it during the run) keeps every js call's code
// and device-clock window. The clock moves 2 s a reading,
// more than the activation margin, so each step's window is its own.
export async function runWith({engine = 'cua', plan = planOf('background', {scene: 'textedit', user: 'finder'}), ops: over = {}, cell = null, lane = null,
  checkout = {commit: 'c', dirty: false}, attest = engine, sitting = 's1', calls = [], slept = [], cellName = 'non-interference'} = {}) {
  let t = 1_000_000;
  const clock = () => (t += 2_000);
  const steps = [];
  const ops = dryOps({log: line => steps.push(line.replace(/^dry: /, '')), engine, approvedEngine: BUNDLE, commit: 'c', clock});
  for (const [k, f] of Object.entries(over)) { const base = ops[k]; ops[k] = (...a) => f(base, ...a); }
  const connect = dryConnect({log: () => {}, engine: attest, host: engine, clock});
  const steered = spec => {
    const client = connect(spec);
    const request = client.request;
    client.request = async (method, params) => {
      if (method === 'tools/call' && lane) lane(params.arguments.code);
      const answer = await request(method, params);
      if (method !== 'tools/call') return answer;
      const value = cell ? cell(params.arguments.code) : null;
      const text = value ? `CUA_NATIVE_BASELINE ${JSON.stringify({ok: true, value, inCellMs: 1})}\n${AT_MARKER}${JSON.stringify([clock(), clock()])}` : answer.content[0].text;
      calls.push({code: params.arguments.code, at: JSON.parse(text.split('\n').find(l => l.startsWith(AT_MARKER)).slice(AT_MARKER.length))});
      return {...answer, content: [{type: 'text', text}], _meta: {...answer._meta, ...(value?._meta ?? {})}};
    };
    return client;
  };
  const out = fs.mkdtempSync(join(tmpdir(), 'matrix-run-'));
  try {
    const code = await runMatrix({device: 'mini', host: engine, engine, approvedRuntime: '/H', approvedEngine: BUNDLE, out, runs: 1, samples: 2, plan, cell: cellName, sitting},
      {ops, connect: steered, controllerCheckout: () => checkout, log: () => {}, sleep: async ms => { slept.push(ms); }});
    const file = join(out, 'run-1', 'result.json');
    return {code, steps, calls, slept, result: fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null};
  } finally { fs.rmSync(out, {recursive: true, force: true}); }
}
export const args = s => JSON.parse(s.slice(s.indexOf(' ') + 1));
export const names = steps => steps.map(s => s.replace(/ .*$/, '') + (/^(live|scenes|goldens|matrix) /.test(s) ? ` ${args(s)[0]}` : ''));
export const matrixSteps = (steps, first) => steps.filter(s => s.startsWith('matrix ') && args(s)[0] === first).map(args);
export const cellsOf = (target, method, kase) => caseCells(target, CASES[target].find(c => c.method === method && c.case === kase));
// The watcher's stop answered by `answer()`, called when the run stops it (after every row, so the windows are known).
export const stopWith = answer => ({live: (base, a) => (a[0] === 'watch' && a[1] === 'stop' ? answer() : base(a))});

