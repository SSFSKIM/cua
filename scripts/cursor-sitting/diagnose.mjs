// The timing diagnosis of Acceptance 12 and 13 (docs/doperpowers/specs/2026-10-30-macos-agent-cursor-design.md): arms
// that tell apart where the cursor-on time goes, on the harness's own scenes, recorded as the sitting's items are
// (./runner.mjs). Beside the cells, `cpu` tasks read the CPU time of WindowServer, the engine and the scene apps
// (ps), and `sample-start`/`sample-wait` take `sudo -n sample` of the engine and the target app over a block (the Mac's
// agent-privilege list allows both). Nothing here changes the engine, its settings or the owner's apps.
//   node scripts/cursor-sitting/diagnose.mjs shot|typing|clicks|clicksPair|sampled --run <dir> --out <dir> [--rounds n]
import {execFileSync, spawn} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {CLICK_CONTROL_TIMED, KEYS_AFTER, OBSERVE, PRIME, CLICK_AT, SHOT} from './cells.mjs';
import {liveIo, runSteps} from './runner.mjs';

const A = [0.1, 0.35], B = [0.9, 0.85], TITLE = [0.8, 0.012];
const GAP = 6000;  // the idle 5 s and the 0.44 s fade: every cursor hidden before the next arm

// The typing arms. Each is [session, cell] steps; `off` clicks for the `hid` arm, whose own cursor never shows in TextEdit.
const TYPING_ARMS = {
  off: [['off', KEYS_AFTER('textedit', {clicks: [B, A]})]],
  glide: [['on', KEYS_AFTER('textedit', {clicks: [B, A]})]],
  hidden: [['off', PRIME('textedit', B)], ['off', CLICK_AT('textedit', A)], ['hid', KEYS_AFTER('textedit')]],
  settledOver: [['on', KEYS_AFTER('textedit', {clicks: [B, A], waitMs: 2500})]],
  settledAway: [['on', KEYS_AFTER('textedit', {clicks: [B, A, TITLE], waitMs: 2500})]],
};

// The click arms: the timing item's sample (a prime, a coordinate click in TextEdit, the fixture's button by route 3),
// and the button alone after the gap (`cold`: the cursor-on session's cursor fades in at the button, no glide in flight).
const clickArm = (run, r) => [
  [run, PRIME('textedit', r % 2 ? B : A)], [run, CLICK_AT('textedit', r % 2 ? A : B)], [run, CLICK_CONTROL_TIMED('fixtureButton')]];
const CLICK_ARMS = {
  off: r => clickArm('off', r),
  on: r => clickArm('on', r),
  offCold: () => [['off', CLICK_CONTROL_TIMED('fixtureButton')]],
  onCold: () => [['on', CLICK_CONTROL_TIMED('fixtureButton')]],
};

// One arm's steps, its last cell the timed sample between two `cpu` readings.
function armSteps(arm, cells, r) {
  return cells.flatMap(([run, cell], k) => {
    const last = k === cells.length - 1;
    const step = {run, cell, label: `${arm} ${r}${last ? '' : ` setup ${k}`}`, ...(last ? {sample: {side: arm, i: r}} : {})};
    return last ? [{task: 'cpu', args: [`${arm} ${r} before`]}, step, {task: 'cpu', args: [`${arm} ${r} after`]}] : [step];
  });
}

export const PLANS = {
  clicksPair: ({rounds}) => PLANS.clicks({rounds, arms: ['off', 'on']}),
  clicks: ({rounds, arms = Object.keys(CLICK_ARMS)}) => {
    const steps = [
      {open: 'on', scenes: ['textedit', 'electron']},
      {open: 'off', scenes: ['textedit', 'electron'], env: {CUA_CURSOR: '0'}},
      // A first observation of the fixture in a new session may miss its web content: one untimed look each first.
      {run: 'on', cell: OBSERVE('electron'), label: 'warm on'}, {run: 'off', cell: OBSERVE('electron'), label: 'warm off'},
      {task: 'activate', args: ['textedit']},
      {wait: GAP},
    ];
    for (let r = 0; r < rounds; r++) {
      for (const arm of arms.map((_, k) => arms[(k + r) % arms.length])) steps.push(...armSteps(arm, CLICK_ARMS[arm](r), r), {wait: GAP});
    }
    return [...steps, {close: 'off'}, {close: 'on'}];
  },
  // Blocks of back-to-back samples with the engine and TextEdit sampled across each: the cursor-on session's keys (its
  // cursor gliding and rocking throughout), then the cursor-off session's once that cursor has faded; then the same for
  // the click sample.
  sampled: ({rounds}) => {
    const steps = [
      {open: 'on', scenes: ['textedit', 'electron']},
      {open: 'off', scenes: ['textedit', 'electron'], env: {CUA_CURSOR: '0'}},
      // A first observation of the fixture in a new session may miss its web content: one untimed look each first.
      {run: 'on', cell: OBSERVE('electron'), label: 'warm on'}, {run: 'off', cell: OBSERVE('electron'), label: 'warm off'},
      {task: 'activate', args: ['textedit']},
      {wait: GAP},
    ];
    const block = (label, seconds, cells) => [
      {task: 'cpu', args: [`${label} before`]}, {task: 'sample-start', args: [label, seconds]},
      ...cells, {task: 'sample-wait'}, {task: 'cpu', args: [`${label} after`]}, {wait: GAP}];
    for (const side of ['on', 'off']) {
      steps.push(...block(`keys-${side}`, Math.ceil(1.6 * rounds + 1), Array.from({length: rounds}, (_, r) =>
        ({run: side, cell: KEYS_AFTER('textedit', {clicks: [B, A]}), label: `keys-${side} ${r}`, keys: 'textedit', sample: {side, i: r}}))));
    }
    for (const side of ['on', 'off']) {
      steps.push(...block(`clicks-${side}`, Math.ceil(2 * rounds + 1), Array.from({length: rounds}, (_, r) => clickArm(side, r).map(([run, cell], k) =>
        ({run, cell, label: `clicks-${side} ${r} ${k}`, ...(k === 2 ? {sample: {side, i: r, series: 'element click'}} : {})}))).flat()));
    }
    return [...steps, {close: 'off'}, {close: 'on'}];
  },
  shot: () => [{open: 'off', scenes: ['textedit', 'electron'], env: {CUA_CURSOR: '0'}}, {run: 'off', cell: SHOT('textedit'), label: 'shot textedit'},
    {run: 'off', cell: SHOT('electron'), label: 'shot electron'}, {close: 'off'}],
  typing: ({rounds}) => {
    const arms = Object.keys(TYPING_ARMS);
    const steps = [
      {open: 'on', scenes: ['textedit']},
      {open: 'off', scenes: ['textedit'], env: {CUA_CURSOR: '0'}},
      {open: 'hid', scenes: ['textedit', 'electron']},
      // The hid session's cursor shows once, on the fixture, and fades: its panel stays ordered in, nothing shows in TextEdit.
      {run: 'hid', cell: OBSERVE('electron'), label: 'warm hid'},
      {run: 'hid', cell: CLICK_CONTROL_TIMED('fixtureButton'), label: 'hid shows once on the fixture'},
      {task: 'activate', args: ['textedit']},
      {wait: GAP},
    ];
    for (let r = 0; r < rounds; r++) {
      // Rotated per round, so no arm always follows the same one.
      const order = arms.map((_, k) => arms[(k + r) % arms.length]);
      for (const arm of order) {
        const armed = armSteps(arm, TYPING_ARMS[arm], r);
        armed.filter(step => step.sample).forEach(step => { step.keys = 'textedit'; });
        steps.push(...armed, {wait: GAP});
      }
    }
    return [...steps, {close: 'hid'}, {close: 'off'}, {close: 'on'}];
  },
};

const pidOf = name => Number(execFileSync('/usr/bin/pgrep', ['-x', name], {encoding: 'utf8'}).trim().split('\n')[0]);
// CPU seconds of `pids` from ps's TIME column ([[h:]m:]s.cc).
function cpuSeconds(pids) {
  const text = execFileSync('/bin/ps', ['-o', 'pid=,time=', '-p', pids.join(',')], {encoding: 'utf8'});
  return Object.fromEntries(text.trim().split('\n').map(line => {
    const [pid, time] = line.trim().split(/\s+/);
    return [pid, time.split(':').reduce((acc, part) => acc * 60 + Number(part), 0)];
  }));
}

async function main(argv) {
  const [plan, ...rest] = argv;
  const {values} = parseArgs({args: rest, options: {run: {type: 'string'}, out: {type: 'string'}, rounds: {type: 'string'}, quiet: {type: 'boolean', default: true}}});
  if (!PLANS[plan]) throw new Error(`plans: ${Object.keys(PLANS).join(', ')}`);
  const io = liveIo({run: values.run, out: values.out, quiet: values.quiet});
  const processes = {windowServer: pidOf('WindowServer'), engine: pidOf('cua-engine'), textedit: io.scene('textedit').pid};
  io.tasks.cpu = async ([label]) => ({ok: true, label, at: performance.now(), cpu: cpuSeconds(Object.values(processes)), processes});
  const samples = [];
  io.tasks['sample-start'] = async ([label, seconds]) => {
    for (const [name, pid] of Object.entries(processes).filter(([name]) => name !== 'windowServer')) {
      const file = join(values.out, `sample-${label}-${name}.txt`);
      const child = spawn('/usr/bin/sudo', ['-n', '/usr/bin/sample', String(pid), String(seconds), '1', '-mayDie', '-file', file], {stdio: 'ignore'});
      samples.push(new Promise(resolve => child.once('exit', code => resolve({name, code, file}))));
    }
    await new Promise(resolve => setTimeout(resolve, 300));  // sample attaches before the block starts
    return {ok: true, label, seconds};
  };
  io.tasks['sample-wait'] = async () => ({ok: true, done: await Promise.all(samples.splice(0))});
  const {failed} = await runSteps(PLANS[plan]({rounds: Number(values.rounds ?? 6)}), {item: `diag-${plan}`, out: values.out, io});
  process.stdout.write(`${failed} failed\n`);
  return failed ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
