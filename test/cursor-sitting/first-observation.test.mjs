// #244's live check (scripts/cursor-sitting/first-observation.mjs): the fixture's accessibility record sliced by launch
// and by the session's marks, the judge, the first cell's inspection of an observation's text, the relaunch's command-line
// check, the record's polls, the steps and the CLI, on recorded shapes; nothing is driven.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {main} from '../../scripts/cursor-sitting.mjs';
import {APP_KEY, awaitRecord, firstMarkdown, firstSteps, firstTasks, judgeFirst, LABELS, launchArgsProblem, launchSlice, OBSERVATION, recordFacts, RELEASE_MS,
  SONOMA_SWITCH, WARM} from '../../scripts/cursor-sitting/first-observation.mjs';
import {MARKER} from '../../scripts/native-baseline/cells.mjs';
import {FIXTURE_ACCESSIBILITY_FILE} from '../../scripts/native-matrix/fixtures/electron-fixture.mjs';
import {scenesOf} from '../../scripts/cursor-sitting/target-guard.mjs';

const scratch = t => { const dir = mkdtempSync(join(tmpdir(), 'cua-244-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; };
const quietly = async run => { const write = process.stdout.write; process.stdout.write = () => true; try { return await run(); } finally { process.stdout.write = write; } };
const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n';
const line = (at, source, enabled = false) => ({at, enabled, source});

// One launch's record as the fixture writes it, after an earlier launch's: off at start, one write at the first
// observation, complete mode about 2 s later, the release's write at the close and complete mode off about 2 s after it.
const T = 1_790_000_000_000;
const EARLIER = [line(T - 90_000, 'start'), line(T - 89_000, 'event'), line(T - 88_000, 'event'), line(T - 86_000, 'poll', true), line(T - 80_000, 'poll', false)];
const RECORD = [line(T, 'start'), line(T + 3150, 'event'), line(T + 5160, 'poll', true), line(T + 5900, 'event'), line(T + 7950, 'poll', false)];
const MARKS = {open: T + 1000, close: T + 5300, closed: T + 6000};

// A variant's rows as the runner records them; `record` is what the release task kept (this launch's lines).
function runRows({engine = 'cua', variant = 'plain', record = RECORD, found = true, observation = {appRoleReadMs: 0.4, enablementPrior: 'false', enabled: 'AXManualAccessibility', webAreaFound: true, webAreaWaitMs: 312, chromium: true},
  warmPrior = 'owned', relaunch = {ok: true, pid: 4242, launchArgs: []}, stop = false} = {}) {
  const rows = [{kind: 'start', at: T - 10}, {kind: 'series', series: [`244-${variant}-${engine}`], counts: {warm: 2}, at: T - 5},
    {kind: 'task', task: 'first-relaunch', args: [variant], result: relaunch, at: T + 500},
    {kind: 'task', task: 'first-mark', args: ['open'], result: {ok: true, name: 'open', at: MARKS.open}, at: MARKS.open}, {kind: 'open', at: T + 3000},
    {kind: 'cell', label: LABELS.first, ok: true, value: {found, index: found ? 13 : null, lines: found ? 27 : 14, chars: found ? 805 : 326, page: found, startedAt: T + 3100, endedAt: T + 3400, ms: 300},
      meta: {engineMs: 290, ...(observation ? {observation} : {})}, at: T + 3400}];
  if (stop) return [...rows, {kind: 'stopped', error: 'required cell failed'}];
  for (const i of [0, 1]) rows.push({kind: 'cell', label: LABELS.warm(i), ok: true, value: {found: true, index: 13}, meta: {observation: {appRoleReadMs: [0.2, 0.3][i], enablementPrior: warmPrior}}, at: T + 3600 + i * 100});
  rows.push({kind: 'task', task: 'first-complete', result: {ok: true, waitedMs: 1400}, at: T + 5200},
    {kind: 'task', task: 'first-mark', args: ['close'], result: {ok: true, name: 'close', at: MARKS.close}, at: MARKS.close}, {kind: 'close', at: T + 6000},
    {kind: 'task', task: 'first-mark', args: ['closed'], result: {ok: true, name: 'closed', at: MARKS.closed}, at: MARKS.closed},
    {kind: 'task', task: 'first-release', result: {ok: true, record}, at: T + 8600});
  return rows;
}

test('the record is sliced to its last launch, then by the session\'s marks', () => {
  assert.deepEqual(launchSlice([...EARLIER, ...RECORD]), RECORD);
  assert.deepEqual(launchSlice([line(1, 'event')]), [], 'no start line, no launch');
  const f = recordFacts({record: [...EARLIER, ...RECORD], openedAt: MARKS.open, closingAt: MARKS.close, closedAt: MARKS.closed});
  assert.deepEqual([f.writes.beforeOpen.length, f.writes.inSession.length, f.writes.afterClose.length], [0, 1, 1], 'the earlier launch\'s writes are not this session\'s');
  assert.equal(f.completeOn.at, T + 5160);
  assert.equal(f.onAfterWriteMs, 2010, 'from the last write before it');
  assert.deepEqual([f.offAfterCloseMs, f.offAfterReleaseWriteMs], [1950, 2050]);
  assert.equal(f.onBeforeOpen, null);
  // Every write restarts Electron's countdown: complete mode is timed from the last one before it.
  const burst = recordFacts({record: [line(T, 'start'), line(T + 3150, 'event'), line(T + 4400, 'event'), line(T + 6420, 'poll', true)], openedAt: MARKS.open, closingAt: T + 9000, closedAt: T + 9500});
  assert.deepEqual([burst.writes.inSession.length, burst.onAfterWriteMs, burst.completeOff], [2, 2020, null]);
  const early = recordFacts({record: [line(T, 'start'), line(T + 600, 'event'), line(T + 800, 'poll', true)], openedAt: MARKS.open, closingAt: MARKS.close, closedAt: MARKS.closed});
  assert.deepEqual([early.writes.beforeOpen.length, early.onBeforeOpen?.source], [1, 'poll']);
});

test('cua\'s plain variant passes on the button in its first observation, one write, complete mode on before the close and off within the bound', () => {
  const j = judgeFirst({variant: 'plain', engine: 'cua', rows: runRows()});
  assert.equal(j.verdict, 'PASS', j.why);
  assert.deepEqual(j.writes, {beforeOpen: 0, inSession: 1, afterClose: 1});
  assert.deepEqual([j.first.found, j.first.index, j.first.observation.webAreaWaitMs, j.firstWriteAfterStartMs], [true, 13, 312, 50]);
  assert.deepEqual([j.warm.n, j.warm.found, j.warm.priors, j.warm.appRoleReadMs.max], [2, 2, {owned: 2}, 0.3]);
  assert.deepEqual([j.completeOn.afterWriteMs, j.completeOff.afterCloseMs, j.closeMs], [2010, 1950, 700]);
});

test('the judge fails a missing button, a second write, no complete mode before the close, or off past the bound', () => {
  const fail = (overrides, why) => {
    const j = judgeFirst({variant: 'plain', engine: 'cua', rows: runRows(overrides)});
    assert.equal(j.verdict, 'FAIL', JSON.stringify(overrides));
    assert.match(j.why, why);
  };
  fail({found: false}, /button is not in the first observation \(14 lines, 326 characters, no page\)/);
  fail({record: [line(T, 'start'), line(T + 3150, 'event'), line(T + 3200, 'event'), line(T + 5210, 'poll', true), line(T + 5900, 'event'), line(T + 7950, 'poll', false)]}, /^2 write events in the session, not 1$/);
  fail({record: [line(T, 'start'), line(T + 3150, 'event'), line(T + 5900, 'event')]}, /did not come on before the close.*did not go off/);
  fail({record: [...RECORD.slice(0, 4), line(MARKS.closed + RELEASE_MS + 1, 'poll', false)]}, new RegExp(`went off ${RELEASE_MS + 1} ms after the close`));
});

test('evidence the verdict needs, missing, makes it incomplete: never a pass', () => {
  const incomplete = (overrides, why) => {
    const j = judgeFirst({variant: 'plain', engine: 'cua', rows: runRows(overrides)});
    assert.equal(j.verdict, 'INCOMPLETE', JSON.stringify(overrides));
    assert.match(j.why, why);
  };
  incomplete({stop: true}, /stopped: required cell failed/);
  incomplete({relaunch: {ok: false, problem: 'the fixture kept its process 4242'}}, /not relaunched fresh: the fixture kept its process 4242/);
  incomplete({observation: null}, /no role read.*not a build with #244's fix/);
  incomplete({record: [line(T, 'start'), line(T + 600, 'event'), ...RECORD.slice(1)]}, /1 write event\(s\) before the session opened/);
  incomplete({record: []}, /no start line/);
});

test('the sonoma variant and the vendor\'s engine are recorded with what they would be; the vendor needs no cua meta', () => {
  const sonoma = judgeFirst({variant: 'sonoma', engine: 'cua', rows: runRows({found: false, relaunch: {ok: true, pid: 9, launchArgs: [SONOMA_SWITCH]}})});
  assert.deepEqual([sonoma.verdict, sonoma.wouldBe, sonoma.launchArgs], ['recorded', 'FAIL', [SONOMA_SWITCH]]);
  const vendor = judgeFirst({variant: 'plain', engine: 'vendor', rows: runRows({observation: null, warmPrior: null})});
  assert.deepEqual([vendor.verdict, vendor.wouldBe], ['recorded', 'PASS']);
  const md = firstMarkdown([judgeFirst({variant: 'plain', engine: 'cua', rows: runRows()}), sonoma, vendor]);
  assert.match(md, /\| plain \| cua \| yes \(13\) \| 27 \/ 805, page \| 0 \/ 1 \/ 1 \| 2010 \| 1950; 2050 \| \*\*PASS\*\* \|/);
  assert.match(md, /\| sonoma \| cua \| no \| 14 \/ 326, no page \| .* recorded \(would be FAIL\) \|/);
  assert.match(md, /\| plain \| cua \| false \| AXManualAccessibility \| 0\.4 \| true \| 312 \| true \| 0\.2 \/ 0\.3 \/ 0\.3 \(2\) \| owned × 2 \| 2 of 2 \|/);
  assert.match(md, /launched with --enable-features=SonomaAccessibilityActivationRefinements/);
});

// The Electron golden's text (test/native-goldens/electron/cua.txt), and the same tree without the page's subtree, as
// #244's first observation held it.
const GOLDEN = readFileSync(new URL('../native-goldens/electron/cua.txt', import.meta.url), 'utf8');
const NO_PAGE = GOLDEN.split('\n').filter((l, k) => k < 4 || k > 16).join('\n');
async function runCell(code, text) {
  const calls = [], written = [];
  const cua = {computer: {get_app_state: async request => { calls.push(request); return {app: request.app, text, screenshot: null}; }}};
  await new (Object.getPrototypeOf(async () => {}).constructor)('cua', 'nodeRepl', code)(cua, {write: s => written.push(s)});
  return {calls, answer: JSON.parse(written.at(-1).slice(MARKER.length))};
}

test('the first cell makes one get_app_state of the fixture and inspects its text: the button by its index, the counts, the page', async () => {
  const app = '/cache/44.9.0-abc/cua Electron Fixture.app', code = OBSERVATION(app);
  assert.deepEqual(scenesOf(code), ['electron'], 'the target guard checks the fixture before it goes');
  const full = await runCell(code, GOLDEN);
  assert.deepEqual(full.calls, [{app, disableDiff: true}]);
  assert.deepEqual([full.answer.ok, full.answer.value.found, full.answer.value.index, full.answer.value.page], [true, true, 13, true]);
  assert.equal(full.answer.value.lines, GOLDEN.split('\n').length);
  assert.ok(full.answer.value.endedAt >= full.answer.value.startedAt);
  const bare = await runCell(code, NO_PAGE);
  assert.deepEqual([bare.answer.value.found, bare.answer.value.index, bare.answer.value.page, bare.answer.value.chars], [false, null, false, NO_PAGE.length]);
  assert.doesNotMatch(JSON.stringify(full.answer), /Fixture text|Alpha/, 'no text of the tree leaves the cell');
});

test('the steps: a fresh fixture, a session that binds nothing, its first cell the first observation, the warm ones, the hold, the close, the release', () => {
  for (const [variant, engine] of [['plain', 'cua'], ['sonoma', 'cua'], ['plain', 'vendor']]) {
    const steps = firstSteps(variant, {engine});
    const at = pred => steps.findIndex(pred);
    const relaunch = at(s => s.task === 'first-relaunch'), open = at(s => s.open), first = at(s => s.label === LABELS.first);
    const order = [relaunch, at(s => s.task === 'first-mark' && s.args[0] === 'open'), open, first, at(s => s.label === LABELS.warm(WARM - 1)), at(s => s.task === 'first-complete'),
      at(s => s.task === 'first-mark' && s.args[0] === 'close'), at(s => s.close), at(s => s.task === 'first-mark' && s.args[0] === 'closed'), at(s => s.task === 'first-release')];
    assert.ok(order.every(k => k >= 0), `${variant} ${engine}: every step is there (${order})`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, `${variant} ${engine}: in order`);
    assert.deepEqual(steps[relaunch].args, [variant]);
    assert.equal(steps[relaunch].required, true);
    assert.deepEqual([steps[open].scenes, steps[open].bind, steps[open].engine], [['electron'], false, engine]);
    assert.equal(steps.slice(0, first).some(s => s.run), false, 'no cell before the first observation');
    assert.equal(steps[first].required, true);
    const cells = steps.filter(s => s.run);
    assert.equal(cells.length, 1 + WARM);
    for (const s of cells) {
      const code = s.cell({[APP_KEY]: '/a.app'});
      assert.equal(code.match(/get_app_state/g).length, 1, 'one observation a cell, so each reply\'s meta is its own');
      assert.match(code, /cursor-sitting:scene electron/);
    }
  }
});

test('the relaunched process carries its variant\'s switch and no other', () => {
  const app = '/c/cua Electron Fixture.app/Contents/MacOS/cua Electron Fixture --cua-fixture-user-data=/r/electron-user-data --cua-fixture-bounds=1,2,3,4';
  assert.equal(launchArgsProblem(app, []), null);
  assert.equal(launchArgsProblem(`${app} ${SONOMA_SWITCH}`, [SONOMA_SWITCH]), null);
  assert.match(launchArgsProblem(app, [SONOMA_SWITCH]), /is missing from its command line/);
  assert.match(launchArgsProblem(`${app} ${SONOMA_SWITCH}`, []), /carries --enable-features/);
  assert.match(launchArgsProblem(null, []), /could not be read/);
});

test('the tasks: the relaunch with the variant\'s switch, the hold for complete mode, the release read past its bound', async t => {
  const run = scratch(t), userDataDir = join(run, 'electron-user-data'), file = join(userDataDir, FIXTURE_ACCESSIBILITY_FILE);
  mkdirSync(userDataDir);
  writeFileSync(join(run, 'scenes.json'), JSON.stringify({scenes: {electron: {app: '/c/F.app', pid: 77, userDataDir, window: {number: 5}}}}));
  let clock = T + 400;
  const asked = [];
  const ctx = {results: {}, io: {scene: () => ({app: '/c/F.app'}), tasks: {'fixture-relaunch': async args => { asked.push(args); return {ok: true, pid: 77}; }}}};
  const sleep = async ms => { clock += ms; };
  const tasks = firstTasks({run, processArgs: () => `/c/F.app/Contents/MacOS/F ${SONOMA_SWITCH}`, now: () => clock, sleep});
  const relaunched = await tasks['first-relaunch'](['sonoma'], ctx);
  assert.deepEqual([relaunched.ok, asked, ctx.results[APP_KEY]], [true, [[SONOMA_SWITCH]], '/c/F.app']);
  assert.match((await tasks['first-relaunch'](['plain'], ctx)).problem, /process 77: its command line carries/);
  writeFileSync(file, jsonl([...EARLIER, ...RECORD.slice(0, 2)]));
  await tasks['first-mark'](['open'], ctx);
  const never = await tasks['first-complete']([], ctx);
  assert.deepEqual([never.ok, never.waitedMs >= 4000], [false, true], 'the earlier launch\'s complete mode is not this one\'s');
  writeFileSync(file, jsonl([...EARLIER, ...RECORD]));
  clock = MARKS.close; await tasks['first-mark'](['close'], ctx);
  clock = MARKS.closed; await tasks['first-mark'](['closed'], ctx);
  const released = await tasks['first-release']([], ctx);
  assert.equal(released.ok, true);
  assert.equal(released.offAfterCloseMs, 1950);
  assert.ok(clock >= MARKS.closed + RELEASE_MS, 'the record is read for the bound after the close, so a later write is still counted');
  assert.deepEqual(released.record, RECORD);
});

test('awaitRecord returns the line once the minimum has passed, or what it read at the bound', async () => {
  let clock = 0, text = jsonl([line(1, 'start')]);
  const sleep = async ms => { clock += ms; if (clock >= 300) text = jsonl([line(1, 'start'), line(2, 'poll', true)]); };
  const read = () => text, done = lines => lines.find(l => l.enabled === true);
  const hit = await awaitRecord({read, done, minMs: 1000, boundMs: 5000, now: () => clock, sleep});
  assert.deepEqual([hit.hit?.at, hit.waitedMs], [2, 1000]);
  clock = 0; text = jsonl([line(1, 'start')]);
  const miss = await awaitRecord({read, done: () => null, boundMs: 450, now: () => clock, sleep});
  assert.deepEqual([miss.hit, miss.waitedMs >= 450], [null, true]);
});

test('first-observation drive --dry-run writes nothing; judge writes item-244.md and passes on cua\'s plain variant', async t => {
  const out = join(scratch(t), 'evidence');
  assert.equal(await quietly(() => main(['first-observation', 'drive', '--engine', 'cua', '--out', out, '--dry-run', '--quiet'])), 0);
  assert.equal(existsSync(out), false);
  await assert.rejects(main(['first-observation', 'drive', '--engine', 'other', '--out', out, '--dry-run']), /--engine cua or --engine vendor/);
  await assert.rejects(main(['first-observation', 'drive', '--engine', 'cua', '--variant', 'plain,z', '--out', out, '--dry-run']), /--variant takes/);
  const dir = scratch(t);
  writeFileSync(join(dir, 'item-244-sonoma-cua.jsonl'), jsonl(runRows({variant: 'sonoma', found: false})));
  assert.equal(await quietly(() => main(['first-observation', 'judge', '--out', dir])), 1, 'no plain run on cua: no pass');
  writeFileSync(join(dir, 'item-244-plain-cua.jsonl'), jsonl(runRows()));
  writeFileSync(join(dir, 'item-244-plain-vendor.jsonl'), jsonl(runRows({engine: 'vendor', observation: null})));
  assert.equal(await quietly(() => main(['first-observation', 'judge', '--out', dir])), 0);
  const md = readFileSync(join(dir, 'item-244.md'), 'utf8');
  assert.match(md, /\| plain \| cua \| .*\*\*PASS\*\*/);
  assert.match(md, /\| plain \| vendor \| .*recorded \(would be PASS\)/);
  assert.match(md, /\| sonoma \| cua \| no .*recorded \(would be FAIL\)/);
});
