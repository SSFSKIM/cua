// How the Linux acceptance fixtures show which engine a session selected (#171 M5; the pre-flight's §3, "How the default
// is shown live"): the explicit mode names cua's engine as M4 ran them; the default mode names none, refuses to start
// unless nothing does, and reads the selection from `cua doctor --json`; the fallback homes' probe reads the default's
// refusal (#171 M6a), from doctor and from a refused open, each naming why and this cua's installer with --engine.
// Pure: no doctor runs here.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FALLBACK_HOMES, defaultSelectionProblem, refusalSample, refusedOpenProblem, refusedSelectionProblem, selectionMode, unsetSelectionProblems} from '../scripts/accept/linux-selection.mjs';

test('the mode is --selection explicit or default, explicit when not given; anything else is refused', () => {
  assert.equal(selectionMode([]), 'explicit');
  assert.equal(selectionMode(['--screenshot', '/tmp/a.png']), 'explicit');
  assert.equal(selectionMode(['--selection', 'default']), 'default');
  assert.equal(selectionMode(['--selection', 'explicit']), 'explicit');
  assert.throws(() => selectionMode(['--selection', 'cua']), /--selection must be explicit or default/);
  assert.throws(() => selectionMode(['--selection']), /--selection must be explicit or default/);
});

test('the default mode starts only when nothing selects an engine: no CUA_NATIVE_ENGINE, no "engine" in engine.json; the device mode may stand', () => {
  const path = '/run/home/.config/cua/engine.json';
  assert.deepEqual(unsetSelectionProblems({env: {}, settings: () => ({}), path}), []);
  assert.deepEqual(unsetSelectionProblems({env: {CUA_DESKTOP_MODE: 'dedicated'}, settings: () => ({desktop: 'dedicated'}), path}), []);
  assert.deepEqual(unsetSelectionProblems({env: {CUA_NATIVE_ENGINE: 'cua'}, settings: () => ({}), path}), ['CUA_NATIVE_ENGINE is set ("cua"): the default mode runs with none']);
  assert.deepEqual(unsetSelectionProblems({env: {CUA_NATIVE_ENGINE: ''}, settings: () => ({}), path}), ['CUA_NATIVE_ENGINE is set (""): the default mode runs with none'], 'even empty: the runner sets none');
  assert.deepEqual(unsetSelectionProblems({env: {}, settings: () => ({engine: 'cua', desktop: 'shared'}), path}), [`"engine": "cua" is in ${path}: the default mode runs with no "engine" there`]);
  assert.deepEqual(unsetSelectionProblems({env: {CUA_NATIVE_ENGINE: 'vendor'}, settings: () => ({engine: 'vendor'}), path}).length, 2, 'each input that is set is named');
  assert.deepEqual(unsetSelectionProblems({env: {}, settings: () => { throw new Error('/x is not a JSON object'); }, path}), [`${path} cannot be read (/x is not a JSON object)`]);
});

// doctor --json's report, as `cua doctor --json` prints it on Linux: the engine row and the report's engine object
const doctor = (selected, reason, {status = 'pass', detail = 'cua\'s engine is selected (the default engine): …'} = {}) => ({ok: true, checks: [{name: 'repl.host', status: 'pass', detail: '…'}, {name: 'engine', status, detail}],
  engine: {selected, reason, preferred: {engine: selected === 'cua' ? 'cua' : 'cua', reason: 'default'}, service: selected}});

test('the default mode passes only when doctor says the default selected cua\'s engine; otherwise it names what was selected and why', () => {
  assert.equal(defaultSelectionProblem(doctor('cua', 'default')), null);
  // the negative control: the unflipped default
  assert.equal(defaultSelectionProblem({...doctor('vendor', 'default'), engine: {selected: 'vendor', reason: 'default', preferred: {engine: 'vendor', reason: 'default'}}}),
    'the session selects vendor (default), not cua\'s engine by default');
  assert.equal(defaultSelectionProblem(doctor('cua', 'explicit')), 'the session selects cua (explicit), not cua\'s engine by default');
  assert.equal(defaultSelectionProblem(doctor('vendor', 'engine_outdated', {status: 'warn'})), 'the session selects vendor (engine_outdated), not cua\'s engine by default');
  assert.equal(defaultSelectionProblem({ok: false, checks: []}), 'cua doctor --json reports no engine selection');
  assert.equal(defaultSelectionProblem(null), 'cua doctor --json printed no report');
});

// #171 M6a (F3): M5's fallback to the vendor's engine is a refusal. A fallback home passes only when doctor says the
// default prefers cua's engine and refuses every computer session for that home's own reason, its engine row a failure
// naming the reason and this cua's own installer with --engine (the absolute command the refusal names, ruling 1110).
const REMEDY = 'node /checkout/bin/cua.mjs install --engine';
const refusedDoctor = (reason, {status = 'fail', detail = `cua's engine is preferred (the default engine), but sessions here are refused (${reason}): … install this cua's engine with \`${REMEDY}\` …`,
  selected = null, preferred = {engine: 'cua', reason: 'default'}, refused = reason} = {}) => ({ok: false, checks: [{name: 'repl.host', status: 'pass', detail: '…'}, {name: 'engine', status, detail}],
  engine: {selected, reason: selected === null ? refused : 'default', refused: refused && {code: refused, message: '…'}, preferred, service: selected}});

test('a fallback home passes only when the default prefers cua\'s engine and refuses it for the home\'s own reason, naming this cua\'s installer', () => {
  assert.deepEqual(FALLBACK_HOMES, {none: 'engine_not_installed', previous: 'engine_outdated', released: 'engine_outdated', older: 'engine_outdated', unrecorded: 'engine_unrecorded'});
  const judge = (report, kind) => refusedSelectionProblem(report, kind, {remedy: REMEDY});
  for (const [kind, reason] of Object.entries(FALLBACK_HOMES)) assert.equal(judge(refusedDoctor(reason), kind), null, kind);
  // M5's fallback, the vendor's engine kept with a warning, is a failure now
  const kept = {...refusedDoctor('engine_outdated', {status: 'warn'}), engine: {selected: 'vendor', reason: 'engine_outdated', refused: null, preferred: {engine: 'cua', reason: 'default'}, service: 'vendor'}};
  assert.equal(judge(kept, 'older'), 'the session selects vendor (engine_outdated), where the default must refuse it for engine_outdated');
  assert.equal(judge(refusedDoctor('x', {selected: 'cua', refused: null}), 'older'), 'the session selects cua (default), where the default must refuse it for engine_outdated');
  assert.equal(judge(refusedDoctor('engine_not_installed'), 'older'), 'the session is refused for engine_not_installed, not engine_outdated');
  assert.equal(judge(refusedDoctor('engine_outdated', {preferred: {engine: 'cua', reason: 'explicit'}}), 'older'), 'doctor\'s preferred engine is cua (explicit), not cua\'s by default');
  assert.equal(judge(refusedDoctor('engine_outdated', {status: 'warn'}), 'older'), 'doctor\'s engine row is warn, not a failure');
  assert.equal(judge(refusedDoctor('engine_outdated', {detail: `… install this cua's engine with \`${REMEDY}\``}), 'older'), 'doctor\'s engine row does not name its reason, engine_outdated');
  assert.equal(judge(refusedDoctor('engine_outdated', {detail: '… refused (engine_outdated): run `cua install --engine`'}), 'older'), `doctor's engine row does not name ${REMEDY}`);
  assert.equal(judge(refusedDoctor('engine_outdated'), 'other'), 'no fallback home other: none, previous, released, older or unrecorded');
  assert.equal(judge(null, 'older'), 'cua doctor --json printed no report');
  // the default remedy is this checkout's own installer
  assert.match(refusedSelectionProblem(refusedDoctor('engine_outdated'), 'older'), /does not name node .*\/bin\/cua\.mjs install --engine$/);
});

// The refused open: `cua serve` exits 1 before it answers anything, saying the reason and the installer, and no engine
// runs below it. Anything less is not a refusal, and nothing that ran stands in for one.
test('a refused open: the serve exits 1 unanswered, naming the reason and the installer, with no engine below it', () => {
  const stderr = `cua: auto … selects cua's own engine, and the engine installed in this cua home (/h/engine/linux/cua-engine) is 0.4.3, older than 0.4.4, which this cua needs: install this cua's engine with \`${REMEDY}\` … [engine_outdated]\n  run \`node /checkout/bin/cua.mjs install\`; …\n`;
  const refused = {exit: {code: 1, signal: null}, stderr, answered: false, samples: 3, observed: [], uninspectable: []};
  const judge = (open, kind = 'older') => refusedOpenProblem(open, kind, {remedy: REMEDY});
  assert.equal(judge(refused), null);
  assert.equal(judge({...refused, exit: null}), 'cua serve did not refuse the open: it was still running when the probe stopped waiting');
  assert.equal(judge({...refused, exit: {code: 0, signal: null}}), 'cua serve exited with code 0, not 1');
  assert.equal(judge({...refused, exit: {code: null, signal: 'SIGKILL', forced: true}}), 'cua serve exited with code null, not 1');
  assert.equal(judge({...refused, answered: true}), 'cua serve answered the client: a session opened');
  assert.equal(judge(refused, 'none'), 'cua serve\'s refusal does not name engine_not_installed');
  assert.equal(judge({...refused, stderr: 'cua: … [engine_outdated]\n'}), `cua serve's refusal does not name ${REMEDY}`);
  assert.equal(judge({...refused, observed: [{exe: '/h/engine/linux/cua-engine', kind: 'cua'}]}), 'an engine ran below the refused serve: /h/engine/linux/cua-engine (cua)');
  assert.equal(judge({...refused, sampleError: 'proc unreadable'}), 'an engine observation failed (proc unreadable), so what ran below the serve is unknown');
  assert.equal(judge(refused, 'other'), 'no fallback home other: none, previous, released, older or unrecorded');
  // Missing evidence is never read as a negative one (task 151, fix wave 1): an answer not read, no sample taken, a
  // process below the serve that could not be inspected.
  const {answered, ...unread} = refused;
  assert.equal(answered, false);
  assert.equal(judge(unread), 'whether cua serve answered the client was not read');
  assert.equal(judge({...refused, answered: null}), 'whether cua serve answered the client was not read');
  assert.equal(judge({...refused, samples: 0}), 'no sample of the processes below the serve was taken, so what ran there is unknown');
  const {samples, ...unsampled} = refused;
  assert.equal(samples, 3);
  assert.equal(judge(unsampled), 'no sample of the processes below the serve was taken, so what ran there is unknown');
  assert.equal(judge({...refused, uninspectable: [{pid: 7, path: '/proc/7/exe', code: 'EACCES'}]}), 'a process below the refused serve could not be inspected (pid 7: /proc/7/exe EACCES), so what ran there is unknown');
  const {uninspectable, ...unreported} = refused;
  assert.deepEqual(uninspectable, []);
  assert.equal(judge(unreported), 'the sample does not say whether every process below the serve was inspected');
});

// The refusal's own sampler, beside the facade suites' shared witness (engine-answered.mjs engineProcesses, whose contract
// is unchanged): it tells a process that ended while it was read (skipped) from a live one below the serve it could not
// inspect (reported, which fails the refusal).
test('refusalSample: engines below the serve, a vanished process skipped, an uninspectable descendant reported', () => {
  const procs = {
    100: {ppid: 1, exe: '/usr/bin/node'},
    101: {ppid: 100, exe: '/h/engine/linux/cua-engine'},
    102: {ppid: 100, exe: {code: 'EACCES'}},       // a live descendant whose executable cannot be read
    103: {ppid: 102, exe: {code: 'ENOENT'}},       // ended while it was read
    104: {ppid: 1, exe: {code: 'EACCES'}},         // not below the serve: none of the sample's business
    105: {stat: {code: 'EACCES'}},                  // its parent unknown: it may be below the serve
    106: {stat: {code: 'ENOENT'}},                  // ended before its parent was read
  };
  const error = code => Object.assign(new Error(code), {code});
  const fs = {
    readdirSync: () => [...Object.keys(procs), 'self', 'stat'],
    readFileSync: path => { const [, pid, file] = path.split('/').slice(-3); const p = procs[pid]; if (file !== 'stat') throw error('ENOENT'); if (p.stat) throw error(p.stat.code); return `${pid} (c d) S ${p.ppid} 1 1`; },
    readlinkSync: path => { const pid = path.split('/').at(-2); const exe = procs[pid].exe; if (typeof exe !== 'string') throw error(exe.code); return exe; },
  };
  assert.deepEqual(refusalSample(100, {proc: '/proc', fs}), {
    engines: [{pid: 101, exe: '/h/engine/linux/cua-engine', kind: 'cua'}],
    uninspectable: [{pid: 102, path: '/proc/102/exe', code: 'EACCES'}, {pid: 105, path: '/proc/105/stat', code: 'EACCES'}],
  });
});
