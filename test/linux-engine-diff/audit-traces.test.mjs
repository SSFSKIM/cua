// The route audits' raw traces kept beside the results, and the re-judge that reads them (#171 M5, task 106; ruling
// 858): kept compressed with what the judge read them against, capped or switched off with the row saying why, and
// re-judged by this checkout's foreign-window judge. Display-free.

import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { AUDIT_TRACES_DIR, parseAuditTraceCap, readKeptTraces, traceKeeper } from '../../scripts/linux-engine-diff/audit-traces.mjs';
import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { rejudgeAudits } from '../../scripts/linux-engine-diff/rejudge-audit.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'cua171-kept-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const outDir = () => join(scratch, `out-${n++}`);

const ROOT = 0x1ff;
const MINE = 0x01800064;
const hex = (id) => `0x${id.toString(16).padStart(8, '0')}`;
// a vendor lifecycle on the run's gedit: the watcher sees it end, then the vendor's teardown, refused as BadWindow
const TEARDOWN = [
  `004:<:0001: 12: Request(2): ChangeWindowAttributes window=${hex(MINE)} value-list={event-mask=StructureNotify}`,
  `004:>:0002: Event DestroyNotify(17) event=${hex(MINE)} window=${hex(MINE)}`,
  `005:<:0010: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(MINE)} event-mask=0 FocusOut(10) detail=Nonlinear(0x03) event=${hex(MINE)} mode=Normal(0x00)`,
  `005:>:0010:Error 3=Window: major=25, minor=0, bad=${hex(MINE)}, seq=0010`,
].join('\n');
const ACCEPTED = TEARDOWN.split('\n').slice(0, 3).join('\n');

test('a kept audit writes each lifecycle trace compressed, and reads back to the same text', () => {
  const out = outDir();
  const kept = traceKeeper({ out }).keep({ name: 'pinned-gedit-type_text', traces: [TEARDOWN, ACCEPTED], registered: new Set([MINE, 7]), root: ROOT });
  assert.deepEqual(kept.registered, [7, MINE]);
  assert.equal(kept.root, ROOT);
  assert.equal(kept.files.length, 2);
  assert.ok(kept.files.every((f) => f.startsWith(`${AUDIT_TRACES_DIR}/`) && f.endsWith('.xtrace.gz')));
  assert.deepEqual(readKeptTraces(out, kept), [TEARDOWN, ACCEPTED]);
  // one missing file: the audit cannot be re-judged
  rmSync(join(out, kept.files[1]));
  assert.equal(readKeptTraces(out, kept), null);
});

test('the cap and `off`: an audit not kept writes nothing and says why', () => {
  const out = outDir();
  const off = traceKeeper({ out, limitMb: 0 }).keep({ name: 'x', traces: [TEARDOWN], registered: [], root: ROOT });
  assert.deepEqual(off, { kept: false, reason: 'not kept: --audit-traces off' });
  assert.equal(existsSync(join(out, AUDIT_TRACES_DIR)), false);
  // a cap of 1 MB: incompressible text past it is refused whole, and what fits is still kept after
  const keeper = traceKeeper({ out, limitMb: 1 });
  const noise = Array.from({ length: 300000 }, (_, i) => ((i * 2654435761) >>> 0).toString(36)).join(' ');
  const big = keeper.keep({ name: 'big', traces: [noise, noise], registered: [], root: ROOT });
  assert.equal(big.kept, false);
  assert.match(big.reason, /1 MB cap/);
  assert.equal(keeper.keep({ name: 'small', traces: [TEARDOWN], registered: [], root: ROOT }).files.length, 1);
  assert.equal(readdirSync(join(out, AUDIT_TRACES_DIR)).length, 1);
  // a write that fails (the directory is a file) leaves the run going, and the row says so
  const blocked = join(scratch, 'blocked');
  appendFileSync(blocked, '');
  assert.match(traceKeeper({ out: blocked }).keep({ name: 'x', traces: [TEARDOWN], registered: [], root: ROOT }).reason, /^not kept: /);
});

test('--audit-traces: on by default at the default cap, a cap in MB, or off', () => {
  const base = ['--vendor', '/v', '--newest', '/n', '--cua', '/c', '--scene', 'gedit', '--ops', 'type_text', '--out', '/o'];
  assert.equal(parseArgs(base).auditTraces, 256);
  assert.equal(parseArgs([...base, '--audit-traces', '64']).auditTraces, 64);
  assert.equal(parseArgs([...base, '--audit-traces', 'off']).auditTraces, 0);
  assert.throws(() => parseAuditTraceCap('0'), /a cap in MB/);
  assert.throws(() => parseAuditTraceCap('lots'), /a cap in MB/);
});

test("the re-judge reads a run's kept traces with this checkout's judge, beside what the run stored", () => {
  const out = outDir();
  const keeper = traceKeeper({ out });
  const reg = new Set([MINE]);
  const line = (w) => `SendEvent FocusOut on ${hex(w)}`;
  const audit = (engine, op, traces, stored) => ({ run: 'r', kind: 'audit', engine, scene: 'gedit', op, foreign: stored, kept_traces: traces ? keeper.keep({ name: `${engine}-gedit-${op}`, traces, registered: reg, root: ROOT }) : { kept: false, reason: 'not kept: --audit-traces off' } });
  const rows = [
    // stored by H'''''s judge as foreign; refused as BadWindow, so the run's own now
    audit('pinned', 'type_text', [TEARDOWN], [line(MINE)]),
    // accepted after the end: foreign before and now
    audit('newest', 'type_text', [ACCEPTED], [line(MINE)]),
    audit('pinned', 'clipboard_write', null, [line(MINE)]),
    {
      run: 'r',
      kind: 'end',
      failed: [
        `a window the harness did not open was changed: pinned on gedit type_text: ${line(MINE)}`,
        `a window the harness did not open was changed: newest on gedit type_text: ${line(MINE)}`,
        `a window the harness did not open was changed: pinned on gedit clipboard_write: ${line(MINE)}`,
        'a speed loss that stands',
      ],
    },
  ];
  const [run] = rejudgeAudits(rows, out);
  assert.equal(run.moved, 1);
  assert.equal(run.unkept, 1);
  assert.deepEqual(run.rows.map((j) => j.now), [[], [line(MINE)], null]);
  assert.equal(run.rows[2].reason, 'not kept: --audit-traces off');
  assert.equal(run.foreign.stored.length, 3);
  assert.deepEqual(run.foreign.now, [`a window the harness did not open was changed: pinned on gedit clipboard_write: ${line(MINE)}`, `a window the harness did not open was changed: newest on gedit type_text: ${line(MINE)}`]);
});

test("the audit pass keeps every lifecycle's trace with the windows it judged them against, and its row says what was kept", () => {
  const run = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'linux-engine-diff', 'run.mjs'), 'utf8');
  const pass = run.slice(run.indexOf('// The X request audit, in its own untimed pass'), run.indexOf("// The text commands' accessibility-bus calls"));
  assert.match(pass, /const keeper = traceKeeper\(\{ out: args\.out, limitMb: args\.auditTraces \?\? DEFAULT_AUDIT_TRACE_MB \}\);/);
  // one registry for the judgment and the kept record, so a re-judge reads the traces against what the run judged
  assert.equal(pass.match(/desktop\.registry\(\)/g).length, 1);
  assert.match(pass, /const registered = desktop\.registry\(\);/);
  assert.match(pass, /auditForeign\(trace, \{ registered, root: desktop\.root, routeAudit: true \}\)/);
  assert.match(pass, /keeper\.keep\(\{ name: `\$\{spec\.label\}-\$\{sceneName\}-\$\{op\}`, traces: segments\.map\(\(seg\) => seg\.trace\), registered: registered\.keys\(\), root: desktop\.root \}\)/);
  assert.match(pass, /kept_traces: keptTraces \}\);/);
});
