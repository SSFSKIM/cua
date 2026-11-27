// The hosted sittings' plans (#117 M5, T10b′; the M4/M5 pre-flight §7 "Hosted sittings" A to F): the exact commands
// each sitting's one job runs on a GitHub-hosted runner, so both engines share one machine and their lanes alternate.
// Every harness drives the runner itself as the loopback device DEVICE and serves the run's own install, its runtime
// (--approved-runtime) and its approved engine (--approved-engine), which scripts/hosted-sittings.mjs setup prepares and
// attests (./runner.mjs). `pilot` is the pilot's smallest form of each sitting (one run a lane; the sittings that are
// already one pass run whole).
//
// A step: {id, label, kind, argv, check?, record?, pair?, engine?, report?, observe?, lane?, pilotNoVerdict?, env?, needs?,
// expect?, keep?, missing?, pending?, section?}. `check` names how the step is read once it ran (./checks.mjs; `exit` by default,
// `expect` for an expect step), with the files it reads: `record` (a run's, whose attestations must be `engine`'s, the side
// the run pins: ruling 1149), `pair` (the other side's record of the same run, which must have stood on the same frames:
// ruling 1169), `report` (removed before the step runs). Kinds, as ./run.mjs
// schedules them:
//   run       a measurement or a witness
//   verdict   a judge or its report (compare, summary, diff); `pilotNoVerdict`: in the pilot its NO VERDICT is expected
//             (one run a lane) and left out of the sitting's exit
//   expect    a step expected to exit as `expect` names (sitting E: 1 before the flip, 0 on it)
//   fixture   puts up what a later step needs; cleanup takes it down whatever happened between
//   cleanup   always runs once what it `needs` ran
//   pilot     the pilot's own reading, run only in the pilot form
//   pending   a step whose code is not built yet: named, never run
//   diagnostic  a reading for a ticket, run as `run` is: its check gives INFO, never the sitting's verdict, save a
//             cleanup failure (C's key-route diagnostic, ruling 1198); `section`: its Markdown, appended to sitting.md
// `needs`: the steps that must have passed first (else this one is skipped). `keep`: files a step writes elsewhere,
// copied into the sitting's output after it. `missing`: why a step cannot run here (a failure, not run).
import {SAVE_SHEET_CELL} from './split.mjs';
import {KEY_ROUTE_ENGINES} from './key-route-report.mjs';

export const DEVICE = 'hosted-macos';
export const SITTINGS = Object.freeze(['a', 'b', 'c', 'd', 'e', 'f']);
// accept-native's exact selection for sitting D: every item but 9, the release gates (PF §9: "accept-native item 9" is
// the release gates, never selected), each item's dependencies among them (item 2 reads item 1's suite).
export const ACCEPT_NATIVE_ITEMS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13]);
export const APPROVAL_CYCLES = 20;
// The sittings that run on the setup's install (./setup.mjs). E builds and approves its own engine in a disposable home;
// F has nothing to run until T12 builds it (T12 decides its setup).
const SETUP = new Set(['a', 'b', 'c', 'd']);

const TITLES = {
  a: ['native-baseline: three runs each of vendor on vendor, cua on vendor, cua on cua; comparisons A, B and C', 'Acceptance 5'],
  b: ['the native-mac pair and its diff', 'Acceptance 6'],
  c: ['the native matrix, three runs a side, with the Korean and Unicode rows, the concurrent-use and intervention cells, Acceptance 3\'s keystroke witness and the window-order oracle; #212\'s save-sheet cell', 'Acceptance 3, 4 and 7'],
  d: ['accept-native --engine cua with both live flags, verify --bind on each engine, #216\'s approval cycles, then T3b\'s staged onboarding', 'Acceptance 1 (hosted form), 2, 8 and 9; #216'],
  e: ['the default-selection mode: the fixture lane and the approved lane, on the flip commit and on the one before', 'the flip, and that an update breaks no session'],
  f: ['maws-selection and maws-features with both surfaces against a MAWS built on the runner', 'the in-app browser on the own engine and host'],
};

const approvedArgs = ctx => ['--approved-runtime', ctx.approvedRuntime, '--approved-engine', ctx.approvedEngine];
const LANES = {vv: ['vendor', 'vendor'], vc: ['vendor', 'cua'], cc: ['cua', 'cua']};

// Each A run needs the one before it to have passed: a run that stopped (the alert guard's refusal above all) may leave
// its TextEdit running, its cleanup's ⌘Q refused while the alert holds the key (../native-baseline/macos.mjs), and the
// next run refuses a running TextEdit at its preflight. The runs after it are SKIP, never failures of their own; the
// stopped run's own status is the sitting's.
function sittingA(ctx) {
  const runs = ctx.pilot ? 1 : 3, exp = `hosted-${ctx.runId}-a`, steps = [];
  // Each lane's run i is paired with the run i of the lane before it (vc with vv, cc with vc): every comparison's two
  // lanes are then held to one frame, C's vv and cc through vc.
  const lanes = Object.keys(LANES);
  for (let i = 1; i <= runs; i++) for (const [lane, [host, engine]] of Object.entries(LANES)) {
    const before = lanes[lanes.indexOf(lane) - 1];
    steps.push({id: `${lane}-${i}`, label: `native-baseline ${host} host, ${engine} engine, run ${i}`, kind: 'run', check: 'record', record: `${ctx.out}/${lane}/run-${i}/meta.json`, engine,
      ...(before ? {pair: `${ctx.out}/${before}/run-${i}/meta.json`} : {}),
      ...(steps.length ? {needs: [steps.at(-1).id]} : {}),
      argv: ['node', 'scripts/native-baseline.mjs', 'run', '--device', DEVICE, '--experiment', exp, '--host', host, '--engine', engine, ...approvedArgs(ctx), '--out', `${ctx.out}/${lane}/run-${i}`]});
  }
  // Each comparison needs every run of both its lanes: after a stop it is SKIP, the sitting staying the stop's NO VERDICT
  // (the compare itself also prints NO VERDICT for a lane with no complete run, ../native-baseline.mjs compareDirs).
  const lanesRuns = (...lanes) => steps.filter(s => lanes.some(lane => s.id.startsWith(`${lane}-`))).map(s => s.id)
    .sort((a, b) => lanes.indexOf(a.split('-')[0]) - lanes.indexOf(b.split('-')[0]) || a.localeCompare(b));
  const compare = (id, mode, left, right) => ({id, label: `comparison ${id.slice(-1)} (${mode})`, kind: 'verdict', check: 'verdict', pilotNoVerdict: true, needs: lanesRuns(left, right),
    argv: ['node', 'scripts/native-baseline.mjs', 'compare', mode, `${ctx.out}/${left}`, `${ctx.out}/${right}`, '--out', `${ctx.out}/comparison-${id.slice(-1)}.md`]});
  return [...steps, compare('compare-A', '--engines', 'vv', 'vc'), compare('compare-B', '--hosts', 'vc', 'cc'), compare('compare-C', '--end-to-end', 'vv', 'cc')];
}

function sittingB(ctx) {
  const parity = (...args) => ['node', 'scripts/repl-parity.mjs', ...args];
  // Each lane is read by its meta.json, its attestations included (its exit is 0 only when that record is complete).
  // The cua lane runs only once the vendor lane passed: a lane that could not bring a scene down (a window it left,
  // pilot B's Finder) fails, and the next lane is never started into what it left. The gate is PASS: a complete lane
  // that is NO VERDICT, one the alert guard stopped, or an engine failure thrown also skips the cua lane. That costs
  // evidence, never the verdict (the diff needs both lanes anyway), the trade sitting A makes.
  const lane = engine => ({id: engine, label: `native-mac, ${engine} host and engine`, kind: 'run', needs: engine === 'cua' ? ['prepare', 'vendor'] : ['prepare'], check: 'record', record: `${ctx.out}/${engine}/meta.json`, engine,
    ...(engine === 'cua' ? {pair: `${ctx.out}/vendor/meta.json`} : {}),
    argv: parity('run', '--device', DEVICE, ...approvedArgs(ctx), '--suite', 'native-mac', '--host', engine, '--engine', engine, '--out', `${ctx.out}/${engine}`)});
  return [
    {id: 'prepare', label: 'repl-parity prepare on the run\'s install', kind: 'run', argv: parity('prepare', '--device', DEVICE, '--commit', ctx.commit, ...approvedArgs(ctx))},
    lane('vendor'), lane('cua'),
    {id: 'diff', label: 'native-mac diff (Acceptance 6: 0 unexpected differences)', kind: 'verdict', needs: ['vendor', 'cua'],
      argv: parity('diff', `${ctx.out}/vendor`, `${ctx.out}/cua`, '--expected', 'scripts/repl-parity/expected/native-mac.json')},
    {id: 'cleanup', label: 'repl-parity cleanup-prepared', kind: 'cleanup', needs: ['prepare'], argv: parity('cleanup-prepared', '--device', DEVICE)},
  ];
}

// Sitting C's lane order (ruling 1226): which lane runs first alternates by run, vendor in odd runs, cua in even ones, so
// state one lane leaves for the next (C-7: Go To reopened on the vendor's path) cannot systematically favour one engine.
// Each run is told its order (--first-lane), which it records (meta.laneOrder); the key-route diagnostic runs its two
// engines once, in its own fixed order, recorded beside the schedule. -> {runs: [{run, first}], keyRoute}.
export const laneOrderOf = runs => ({runs: Array.from({length: runs}, (_, i) => ({run: i + 1, first: i % 2 === 0 ? 'vendor' : 'cua'})), keyRoute: [...KEY_ROUTE_ENGINES]});
// The speed-extra cell's samples a lane (ruling 1228, F: ten or more of each op).
export const SPEED_EXTRA_SAMPLES = 10;
// Sitting C's schedule: one run a lane in the pilot, three in the full form, run job n's run alone when split; its steps
// and its plan's record read the same.
const sittingCOrder = ctx => {
  const order = laneOrderOf(ctx.pilot ? 1 : 3);
  if (!ctx.split || ctx.split.judge) return order;
  if (!order.runs.some(r => r.run === ctx.split.run)) throw new Error(`a run job is one of ${order.runs.map(r => r.run).join(', ')}`);
  return {...order, runs: order.runs.filter(r => r.run === ctx.split.run)};
};
const sittingCSchedule = ctx => sittingCOrder(ctx).runs;
// The judging job (ruling 1228, ./split.mjs): the run jobs' records checked, combined (with a full run beneath filtered
// reruns) per lane, judged, and key-route last. Each job dir is a run job's sitting output (vendor, cua, save-sheet).
// `base` (H1): the base run's committed evidence directory (its records under sitting/, digests.sha256, README.md naming
// `baseRunId`), checked by jobs-check before anything reads it, then re-judged (R1, ruling 1230) before the judging.
// `only`: the filter the run jobs ran; the save-sheet verdict is asked only when they ran that cell.
function splitJudge(ctx) {
  const {jobs, runs, base = null, baseRunId = null, only = null} = ctx.split, sitting = `hosted-${ctx.runId}-c`, combined = `${ctx.out}/combined`;
  const matrix = (...args) => ['node', 'scripts/native-matrix.mjs', ...args], keyRoute = `${ctx.out}/key-route`;
  const gate = base ? ['jobs-check', 'rejudge-base'] : ['jobs-check'];
  return [
    {id: 'jobs-check', label: 'the run jobs are one harness commit and one pair of engine versions, each job\'s runner recorded (ruling 1228); the base matches its digests (H1)', kind: 'verdict', check: 'exit',
      argv: ['node', 'scripts/hosted-sittings.mjs', 'jobs-check', '--jobs', jobs.join(','), ...(base ? ['--base', base, '--base-run-id', baseRunId] : []), '--out', `${ctx.out}/jobs.json`]},
    ...(base ? [{id: 'rejudge-base', label: 'the base re-judged by this judge against its own commit\'s: only the declared drag cell may differ (ruling 1230)', kind: 'verdict', check: 'exit', needs: ['jobs-check'],
      argv: ['node', 'scripts/hosted-sittings.mjs', 'rejudge-base', '--base', base, '--out', `${ctx.out}/base-rejudge.json`]}] : []),
    // Each job's whole sitting dir: combine takes its matrix records and its speed-extra cell's, when it ran (F). Its
    // verdict is NO VERDICT when a rerun could not be combined; the judges still run, each such problem their missing proof.
    {id: 'combine', label: 'the run jobs\' records per lane, filtered reruns over the full run beneath them', kind: 'verdict', check: 'verdict', needs: gate,
      argv: matrix('combine', ...(base ? [`${base}/sitting`] : []), ...jobs, '--out', combined)},
    {id: 'summary', label: 'the matrix summary (the three-point report)', kind: 'verdict', check: 'report', report: `${ctx.out}/summary.md`, needs: gate,
      argv: matrix('summary', combined, '--out', `${ctx.out}/summary.md`)},
    {id: 'compare', label: 'the matrix judge (Acceptance 7)', kind: 'verdict', check: 'verdict', needs: gate, argv: matrix('compare', combined, '--out', `${ctx.out}/comparison.md`)},
    // I3: the run jobs' save-sheet verdicts, carried into this job's verdict.
    ...(!only || only.includes(SAVE_SHEET_CELL) ? [{id: 'save-sheet', label: '#212\'s save-sheet cell as each run job recorded it (I3 of the split review)', kind: 'verdict', check: 'verdict', needs: ['jobs-check'],
      argv: ['node', 'scripts/hosted-sittings.mjs', 'save-sheet-verdicts', '--jobs-file', `${ctx.out}/jobs.json`, '--runs', runs.join(',')]}] : []),
    {id: 'key-route', label: 'the key-route diagnostic (ruling 1198): where each engine\'s Escape lands while TextEdit\'s Open panel is focused', kind: 'diagnostic',
      check: 'diagnostic', report: `${keyRoute}/key-route.json`, section: `${keyRoute}/key-route.md`,
      argv: ['node', 'scripts/hosted-sittings.mjs', 'key-route', ...approvedArgs(ctx), '--sitting', sitting, '--out', keyRoute]},
  ];
}
const ordered = first => (first === 'vendor' ? ['vendor', 'cua'] : ['cua', 'vendor']);

// Ruling 1227, refined by 1228 (E): sitting C split into jobs. `ctx.split` {run: n, only?} is run job n (its pair in the
// lane order v/c/v by job, its run's save-sheet steps; `only` the cells a filtered rerun needs, the save-sheet's id
// SAVE_SHEET_CELL among them for its steps); {judge: true, jobs, base} the judging job (./split.mjs). None: one job.
function sittingC(ctx) {
  if (ctx.split?.judge) return splitJudge(ctx);
  const sitting = `hosted-${ctx.runId}-c`, steps = [], schedule = sittingCSchedule(ctx);
  const only = ctx.split?.only ?? null, matrixCells = only?.filter(c => c !== SAVE_SHEET_CELL) ?? null;
  const runsMatrix = !only || matrixCells.length > 0, runsSheet = !only || only.includes(SAVE_SHEET_CELL);
  const matrix = (...args) => ['node', 'scripts/native-matrix.mjs', ...args];
  const lane = engine => ['--device', DEVICE, '--host', engine, '--engine', engine, ...approvedArgs(ctx), '--sitting', sitting];
  if (ctx.pilot) steps.push({id: 'focus-timing', label: 'the focus probe\'s cost on this runner', kind: 'pilot',
    argv: ['node', 'scripts/hosted-sittings.mjs', 'focus-timing', '--approved-engine', ctx.approvedEngine, '--out', `${ctx.out}/focus-timing.json`]});
  // Each matrix run needs the one before it to have put the device back (ruling 1214; pilot C-4, where the vendor run
  // stopped on a held fixture's reset and the cua run was skipped though the put-back held): the next run, of either
  // engine, starts when the previous run's record exists and its put-back held (`gate.putBack`, ./run.mjs
  // putBackHeld: every scene down and every scene app at 0 running, Finder's run window gone and its windows as at
  // begin, the input source restored and read back), whether that run was complete, NO VERDICT or stopped. Nothing of a
  // stopped run carries over: its fixtures, sheets and panels went with the apps it quit, and the next run puts its
  // scenes up afresh. A run whose put-back did not hold, or that wrote no record, skips the rest, naming why. The next
  // run's own preflight still refuses a screen a run left. A's runs and B's cua lane still chain on PASS. The save-sheet
  // cells stay unchained: their own preflight refuses a screen a run left. The chain follows the lane order whatever the
  // engine (ruling 1226); the second run of each number names the first's record as its pair (ruling 1169: the record
  // check holds both sides to one frame once both are written).
  // R3's witness (ruling 1225): its tap app built and granted Input Monitoring before the first run, so each run's
  // judged cells can be tapped (../native-matrix/witness.mjs). Not ready, the runs still go, their R3 cells NO VERDICT.
  steps.push({id: 'witness-tap', label: 'R3\'s witness tap built and granted Input Monitoring (ruling 1225)', kind: 'diagnostic', check: 'witnessTap',
    report: `${ctx.out}/witness-tap.json`, argv: ['node', 'scripts/hosted-sittings.mjs', 'witness-tap', '--out', `${ctx.out}/witness-tap.json`]});
  const runSteps = [];
  if (runsMatrix) for (const {run: i, first} of schedule) for (const engine of ordered(first)) {
    const before = runSteps.at(-1);
    runSteps.push(`matrix-${engine}-${i}`);
    steps.push({id: `matrix-${engine}-${i}`, label: `the matrix on ${engine}'s host and engine, run ${i} (${first} first)`, kind: 'run', check: 'record', record: `${ctx.out}/${engine}/run-${i}/result.json`, engine,
      ...(before ? {needs: [before], gate: {putBack: `${ctx.out}/${before.replace(/^matrix-(\w+)-(\d+)$/, '$1/run-$2')}/result.json`}} : {}),
      ...(engine !== first ? {pair: `${ctx.out}/${first}/run-${i}/result.json`} : {}),
      argv: matrix('run', ...lane(engine), '--out', `${ctx.out}/${engine}`, '--run-number', String(i), '--first-lane', first, ...(matrixCells ? ['--only', matrixCells.join(',')] : []))});
  }
  // Ruling 1228 (F), behind the run job's flag, off by default: the three speed ops full sitting C missed re-timed,
  // SPEED_EXTRA_SAMPLES each on both lanes in the job's lane order, as its run's extra speed samples (the judge pools them
  // for those ops alone, ../native-matrix/summary.mjs). Unchained, as the save-sheet cells: their preflight refuses a
  // screen a run left.
  if (ctx.split?.speedExtra) for (const {run: i, first} of schedule) for (const engine of ordered(first)) steps.push({id: `speed-extra-${engine}-${i}`,
    label: `the missed speed ops re-timed on ${engine}, run ${i} (${first} first; ruling 1228)`, kind: 'run', check: 'record', record: `${ctx.out}/speed-extra/${engine}/run-${i}/result.json`, engine,
    argv: matrix('cell', 'speed-extra', ...lane(engine), '--out', `${ctx.out}/speed-extra/${engine}`, '--run-number', String(i), '--first-lane', first, '--samples', String(SPEED_EXTRA_SAMPLES))});
  // #212's cell one step a run, by the same lane order, each reading its run's record (one run in the pilot).
  if (runsSheet) for (const {run: i, first} of schedule) for (const engine of ordered(first)) steps.push({id: `save-sheet-${engine}-${i}`, label: `#212's save-sheet cell on ${engine}, run ${i} (${first} first)`,
    kind: 'run', check: 'saveSheet', records: [`${ctx.out}/save-sheet/${engine}/run-${i}/result.json`], row: 'textedit/intervention.saveSheet', engine,
    argv: matrix('cell', 'intervention-save-sheet', ...lane(engine), '--out', `${ctx.out}/save-sheet/${engine}`, '--run-number', String(i), '--first-lane', first)});
  if (ctx.split) return steps;
  steps.push({id: 'summary', label: 'the matrix summary (the three-point report)', kind: 'verdict', check: 'report', report: `${ctx.out}/summary.md`, argv: matrix('summary', `${ctx.out}/vendor`, `${ctx.out}/cua`, '--out', `${ctx.out}/summary.md`)});
  steps.push({id: 'compare', label: 'the matrix judge (Acceptance 7)', kind: 'verdict', check: 'verdict', pilotNoVerdict: true, argv: matrix('compare', `${ctx.out}/vendor`, `${ctx.out}/cua`, '--out', `${ctx.out}/comparison.md`)});
  // Ruling 1198's diagnostic, last: after the counted lanes and their judges, never among judged cells. It needs none of
  // them to have passed: each of its lanes refuses at its own preflight what a run before left.
  const keyRoute = `${ctx.out}/key-route`;
  steps.push({id: 'key-route', label: 'the key-route diagnostic (ruling 1198): where each engine\'s Escape lands while TextEdit\'s Open panel is focused', kind: 'diagnostic',
    check: 'diagnostic', report: `${keyRoute}/key-route.json`, section: `${keyRoute}/key-route.md`,
    argv: ['node', 'scripts/hosted-sittings.mjs', 'key-route', ...approvedArgs(ctx), '--sitting', sitting, '--out', keyRoute]});
  return steps;
}

// Item 13's XDG_CONFIG_HOME (accept-native.mjs item13: the compat route needs a scratch one): the run's own, made before
// the steps run (the plan's `scratchDirs`), never the account's ~/.config.
const acceptConfig = ctx => `${ctx.scratch}/accept-config`;
function sittingD(ctx) {
  const home = `${ctx.scratch}/cua-accept`, verify = engine => ['node', 'verify.mjs', '--engine', engine, '--bind', 'com.apple.TextEdit'];
  return [
    {id: 'scratch-install', label: 'the pinned runtime in accept-native\'s scratch home', kind: 'run', argv: ['node', 'bin/cua.mjs', 'install', '--json'], env: {CUA_HOME: home, CUA_NATIVE_ENGINE: 'vendor'}},
    // Its report read by the `acceptance` check: an alert guard's refusal in the TextEdit fixture is NO VERDICT (ruling 1154).
    {id: 'accept-native', label: `accept-native --engine cua, items ${ACCEPT_NATIVE_ITEMS.join(', ')}`, kind: 'run', needs: ['scratch-install'], env: {CUA_HOME: home, XDG_CONFIG_HOME: acceptConfig(ctx)},
      check: 'acceptance', record: `${ctx.out}/acceptance.json`, report: `${ctx.out}/acceptance.json`,
      argv: ['node', 'scripts/accept-native.mjs', '--engine', 'cua', '--live-textedit', '--live-secrets', '--items', ACCEPT_NATIVE_ITEMS.join(','), '--report', `${ctx.out}/acceptance.json`]},
    // The document's windows placed clear of the alerts once it is up (rulings 1160, 1164), recorded beside the sitting.
    {id: 'textedit-up', label: 'a scratch TextEdit document, the window verify --bind and the approval cycles bind', kind: 'fixture',
      argv: ['node', 'scripts/hosted-sittings.mjs', 'textedit', 'up', '--file', `${ctx.scratch}/verify-bind.txt`, '--record', `${ctx.out}/textedit-placement.json`]},
    {id: 'verify-cua', label: 'verify --engine cua --bind TextEdit (Acceptance 2)', kind: 'run', needs: ['textedit-up'], argv: verify('cua')},
    {id: 'verify-vendor', label: 'verify --engine vendor --bind TextEdit (Acceptance 9, attested)', kind: 'run', needs: ['textedit-up'], argv: verify('vendor')},
    {id: 'approval-cycles', label: `#216's approval cycles (${APPROVAL_CYCLES}) on cua's engine and host`, kind: 'run', needs: ['textedit-up'], env: {CUA_SHIM_SURFACES: 'computer,browser'},
      check: 'verdict', argv: ['node', 'scripts/approval-cycles.mjs', '--engine', 'cua', '--approve', 'com.apple.TextEdit', '--decline', 'com.apple.calculator', '--cycles', String(APPROVAL_CYCLES)]},
    // T3b, the last step that measures: it removes cua's engine's rows and adds them back stage by stage (./onboarding.mjs),
    // binding the same scratch document; one pass of the stages in either form.
    {id: 'onboarding', label: 'T3b\'s staged onboarding: cua\'s engine\'s rows none, Accessibility, Screen Recording added, then Input Monitoring and post events, a relaunch at every stage',
      kind: 'run', needs: ['textedit-up'], check: 'onboarding', engine: 'cua', record: `${ctx.out}/onboarding.json`, report: `${ctx.out}/onboarding.json`,
      argv: ['node', 'scripts/hosted-sittings.mjs', 'onboarding', '--out', `${ctx.out}/onboarding.json`]},
    {id: 'textedit-down', label: 'the scratch TextEdit quit', kind: 'cleanup', needs: ['textedit-up'], argv: ['node', 'scripts/hosted-sittings.mjs', 'textedit', 'down']},
  ];
}

function sittingE(ctx) {
  const expect = ctx.flipped ? 0 : 1;
  return [
    {id: 'fixture', label: `the fixture lane: a selection check (expected ${expect ? 'FAIL before the flip' : 'PASS on the flip'})`, kind: 'expect', expect, check: 'selection', lane: 'fixture',
      argv: ['node', 'scripts/accept/macos-default-selection.mjs', '--older-node', ctx.olderNode ?? '', '--out', `${ctx.out}/fixture.json`], report: `${ctx.out}/fixture.json`,
      ...(ctx.olderNode ? {} : {missing: 'no Node 22 in the runner\'s tool cache ($RUNNER_TOOL_CACHE/node/22.*)'})},
    {id: 'approved', label: `the approved lane: the run's own engine approved in a disposable home (expected ${expect ? 'FAIL before the flip' : 'PASS on the flip'})`, kind: 'expect', expect, check: 'selection', lane: 'approved',
      argv: ['sh', 'scripts/accept/macos-default-selection-hosted.sh'], env: {CUA_HOSTED_APPROVE: 'node scripts/hosted-sittings.mjs approve'},
      report: 'default-selection-approved-out/report.json', keep: ['default-selection-approved-out/report.json']},
  ];
}

const sittingF = () => [{id: 'maws', label: 'the MAWS build on the runner, then maws-selection and maws-features with both surfaces', kind: 'pending',
  pending: 'T12: the MAWS mode in both scripts and the runner\'s MAWS build (as probe/389-maws did), on the flip commit, after #493'}];

const BUILDERS = {a: sittingA, b: sittingB, c: sittingC, d: sittingD, e: sittingE, f: sittingF};

// ctx: {commit, out (the sitting's output directory), approvedRuntime, approvedEngine (the run's install), runId (the
// job's run id and attempt), olderNode (sitting E's Node 22), scratch (a directory outside the checkout), flipped
// (whether macOS's default engine is cua's on this commit), pilot}. -> {sitting, title, proves, form, setup, counts,
// pilotReads, scratchDirs (directories of the run's own the CLI makes first), steps}.
export function sittingPlan(sitting, ctx) {
  const build = BUILDERS[sitting];
  if (!build) throw new Error(`no sitting ${sitting}: the sittings are ${SITTINGS.join(', ')}`);
  const [title, proves] = TITLES[sitting];
  return {sitting, title, proves, form: ctx.pilot ? 'pilot' : 'full', setup: SETUP.has(sitting), steps: build(ctx), ...(sitting === 'c' && ctx.split ? {split: ctx.split} : {}),
    counts: sitting !== 'c' || (ctx.split && !ctx.split.judge) ? [] : ctx.split?.judge ? [`${ctx.out}/combined/vendor`, `${ctx.out}/combined/cua`, ...ctx.split.jobs.map(d => `${d}/save-sheet`)]
      : ['vendor', 'cua', 'save-sheet'].map(d => `${ctx.out}/${d}`), pilotReads: sitting === 'c' && Boolean(ctx.pilot),
    ...(sitting === 'c' ? {laneOrder: sittingCOrder(ctx)} : {}),
    scratchDirs: sitting === 'd' ? [acceptConfig(ctx)] : []};
}

// A sitting's context on the runner: the job's run and attempt, and the approved paths the runner's record names
// (./runner.mjs; the setup wrote it), so every harness is handed the run's own install. `record`: the device's record
// or null. -> sittingPlan's ctx; throws for a sitting that needs the setup when it has not run.
export function sittingContext(sitting, {env = process.env, record, commit, out, scratch = null, olderNode = null, pilot = false, flipped = false}) {
  if (SETUP.has(sitting) && !record) throw new Error(`sitting ${sitting}: no runner record on this runner: run \`node scripts/hosted-sittings.mjs setup\` first`);
  return {commit, out, approvedRuntime: record?.install?.home ?? null, approvedEngine: record?.engine?.bundle ?? null,
    runId: `${env.GITHUB_RUN_ID ?? 'local'}-${env.GITHUB_RUN_ATTEMPT ?? '1'}`, olderNode, scratch, flipped: Boolean(flipped), pilot: Boolean(pilot)};
}
