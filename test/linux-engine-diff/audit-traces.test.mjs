// The route audits' traces kept beside the results, and the re-judge that reads them (#171 M5, task 106; rulings 858
// and 863): never the raw text, only an allowlisted projection of what the foreign-window judge reads (no title, no
// property or string payload ever reaches the disk), judged to the same findings as the raw trace; kept per execution,
// all or none, capped, above a floor of free space, with the row saying why where it was not kept. Display-free.

import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { parseXtrace } from '../../scripts/linux-engine-diff/audit.mjs';
import { AUDIT_TRACES_DIR, PROJECTION, parseAuditTraceCap, projectTrace, readKeptTraces, traceKeeper } from '../../scripts/linux-engine-diff/audit-traces.mjs';
import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { auditForeign, judgeForeign } from '../../scripts/linux-engine-diff/foreign.mjs';
import { rejudgeAudits } from '../../scripts/linux-engine-diff/rejudge-audit.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const scratch = mkdtempSync(join(tmpdir(), 'cua171-kept-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const outDir = () => join(scratch, `out-${n++}`);
const plenty = () => 1e15;

const ROOT = 0x1ff;
const MINE = 0x01800064;
const PERSON = 0x00600002;
const hex = (id) => `0x${id.toString(16).padStart(8, '0')}`;
const TITLE = 'Quarterly Plan - secret.odt';
// a vendor lifecycle on the run's gedit: the watcher sees it end, then the vendor's teardown, refused as BadWindow; the
// trace also carries what must never reach the disk: a window's title in a GetProperty reply and in a ChangeProperty,
// and a clipboard text
const TEARDOWN = [
  `004:<:0001: 12: Request(2): ChangeWindowAttributes window=${hex(MINE)} value-list={event-mask=StructureNotify}`,
  `005:<:0002: 24: Request(20): GetProperty delete=false(0x00) window=${hex(PERSON)} property=0x27("WM_NAME") type=0x0(AnyPropertyType) long-offset=0x00000000 long-length=0x00000400`,
  `005:>:0002:44: Reply to GetProperty: type=0x1f(\"STRING\") format=0x08 bytes-after=0x00000000 length=27 value='${TITLE}'`,
  `005:<:0003: 24: Request(18): ChangeProperty mode=Replace(0x00) window=${hex(PERSON)} property=0x27("WM_NAME") type=0x1f("STRING") data='${TITLE}'`,
  `004:>:0004: Event DestroyNotify(17) event=${hex(MINE)} window=${hex(MINE)}`,
  `005:<:0010: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(MINE)} event-mask=0 FocusOut(10) detail=Nonlinear(0x03) event=${hex(MINE)} mode=Normal(0x00)`,
  `005:>:0010:Error 3=Window: major=25, minor=0, bad=${hex(MINE)}, seq=0010`,
].join('\n');
const ACCEPTED = TEARDOWN.split('\n').slice(0, 6).join('\n');
const parsed = (text) => parseXtrace(text);

/** A finding as compared across a raw judgment and a projected one: everything but the raw request text. */
const comparable = (r) => ({ requests: r.requests, mutating: r.mutating, unplaced: r.unplaced, foreign: r.foreign.map(({ text, ...f }) => f) });
function assertEquivalent(name, text, registries) {
  const trace = parsed(text);
  const projected = JSON.parse(JSON.stringify(projectTrace(trace, ROOT)));
  for (const registered of registries)
    for (const routeAudit of [true, false]) {
      const raw = auditForeign(trace, { registered, root: ROOT, routeAudit });
      const kept = judgeForeign(projected, { registered, root: ROOT, routeAudit });
      assert.deepEqual(comparable(kept), comparable(raw), `${name}: registry of ${registered.size}, ${routeAudit ? 'route audit' : 'own trace'}`);
    }
}

test('the projection keeps only the allowlisted fields, never a title, a property or any string payload', () => {
  const elements = projectTrace(parsed(TEARDOWN), ROOT);
  for (const el of elements) for (const k of Object.keys(el)) assert.ok(PROJECTION[el.k]?.includes(k) || k === 'k', `${el.k}.${k} is not allowlisted`);
  assert.ok(!JSON.stringify(elements).includes('secret'));
  assert.ok(!JSON.stringify(elements).includes('Quarterly'));
  // a field nobody listed is dropped, whatever it holds
  const forged = projectTrace({ elements: [{ k: 'req', r: { conn: 5, seq: 1, major: 12, minor: null, name: 'ConfigureWindow', text: `005:<:0001: 16: Request(12): ConfigureWindow window=${hex(MINE)} values={x=1 y=1}` } }], extensions: {} }, ROOT);
  assert.deepEqual(Object.keys(forged[0]).sort(), ['c', 'k', 'major', 'op', 'ours', 'seq', 'window']);
  // a value of a listed field that is not of its kind is dropped too
  const odd = projectTrace({ elements: [{ k: 'req', r: { conn: 5, seq: 1, major: 25, minor: null, text: `005:<:0001: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(MINE)} event-mask=0 ClientMessage(33) format=0x20 window=${hex(MINE)} type=0x1f0("${TITLE}") data=0x00` } }], extensions: {} }, ROOT);
  assert.equal(odd[0].cmType, undefined);
  assert.ok(!JSON.stringify(odd).includes('secret'));
});

test('a kept trace holds no title on disk, and its re-judge gives the live findings', () => {
  const out = outDir();
  const keeper = traceKeeper({ out, run: 'pinned-V1', free: plenty });
  const kept = keeper.keep({ name: 'pinned-gedit-type_text', traces: [parsed(TEARDOWN), parsed(ACCEPTED)], registered: new Set([MINE, 7]), root: ROOT });
  assert.deepEqual(kept.registered, [7, MINE]);
  for (const f of kept.files) {
    const text = gunzipSync(readFileSync(join(out, f))).toString('utf8');
    assert.ok(!text.includes('secret') && !text.includes('Quarterly'), `${f} keeps a title`);
  }
  const [first, second] = readKeptTraces(out, kept, 'pinned-V1');
  const reg = new Set(kept.registered);
  const live = (t) => comparable(auditForeign(parsed(t), { registered: reg, root: ROOT, routeAudit: true }));
  assert.deepEqual(comparable(judgeForeign(first, { registered: reg, root: ROOT, routeAudit: true })), live(TEARDOWN));
  assert.deepEqual(comparable(judgeForeign(second, { registered: reg, root: ROOT, routeAudit: true })), live(ACCEPTED));
  assert.equal(live(TEARDOWN).foreign.filter((f) => f.window === MINE).length, 0, 'the refused teardown is the run\'s');
  assert.equal(live(ACCEPTED).foreign.filter((f) => f.window === MINE).length, 1, 'the accepted one is not');
});

// ---------------------------------------------------------------------------------------------------------------------
// Equivalence (ruling 863 (b)): the raw trace and its projection judged to the same findings

/** Every window id a trace's requests name, for registries drawn from the trace itself. */
function idsOf(text) {
  return [...new Set([...text.matchAll(/\b(?:window|destination|parent|focus|requestor)=0x([0-9a-f]{8})/g)].map((m) => Number.parseInt(m[1], 16)))].filter((id) => id !== ROOT && id !== 0);
}
const registriesOf = (text) => {
  const ids = idsOf(text);
  return [new Set(), new Set(ids), new Set(ids.filter((_, i) => i % 2 === 0)), new Set(ids.filter((_, i) => i % 3 === 1))];
};

test('equivalence on the committed private-display traces: the raw trace and its projection, under several registries and both forms', () => {
  // the M4 evidence's traces, each recorded on a private Xvfb the harness started (their READMEs): BadWindow refusals
  // and ended lives among them; a stamped log's time prefix is not xtrace's
  const files = [
    'docs/evidence/2026-10-28-own-linux-engine/m4/focus-timer/fix2/never-taken/proxied-1/xtrace.stamped.log.gz',
    'docs/evidence/2026-10-28-own-linux-engine/m4/focus-timer/fix2/never-taken/proxied-2/xtrace.stamped.log.gz',
    'docs/evidence/2026-10-28-own-linux-engine/m4/focus-timer/zero/traced-idle/traces/electron-control-0ms-paste-9.xtrace.gz',
    'docs/evidence/2026-10-28-own-linux-engine/m4/qt-activation/mechanism/activating-run-0.xtrace.txt',
    'docs/evidence/2026-10-28-own-linux-engine/m4/qt-activation/mechanism/kate-x2.xtrace.gz',
    'docs/evidence/2026-10-28-own-linux-engine/m4/qt-activation/mechanism/plain-run-3.xtrace.txt',
  ];
  let badWindow = 0;
  let destroyed = 0;
  for (const f of files) {
    const bytes = readFileSync(join(REPO, f));
    const text = (f.endsWith('.gz') ? gunzipSync(bytes) : bytes).toString('utf8').replace(/^\d+\.\d+ /gm, '');
    badWindow += (text.match(/:Error 3=Window:/g) ?? []).length;
    destroyed += (text.match(/Event (?:\(generated\) )?DestroyNotify\(/g) ?? []).length;
    assertEquivalent(f, text, registriesOf(text));
  }
  assert.ok(badWindow > 0 && destroyed > 0, 'the fixtures hold BadWindow refusals and ended lives');
});

test('equivalence on a seeded sweep of selection and INCR sequences, BadWindow refusals and ended lives', () => {
  const OWN = 0x00400040;
  const OWNER = 0x00400050;
  const ids = [MINE, PERSON, OWN];
  let a = 7;
  const r = () => {
    a = (a * 1103515245 + 12345) % 2147483648;
    return a / 2147483648;
  };
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  const requests = [
    (s, w) => `005:<:${s}: 24: Request(18): ChangeProperty mode=Replace(0x00) window=${hex(w)} property=0x1f0("CUA_SEL") type=0x1f1("UTF8_STRING") data='${TITLE}'`,
    (s, w) => `005:<:${s}: 24: Request(18): ChangeProperty mode=Replace(0x00) window=${hex(w)} property=0x1f0("CUA_SEL") type=0xed("INCR") data=0x00,0x10,0x00,0x00`,
    (s, w) => `005:<:${s}: 24: Request(18): ChangeProperty mode=Replace(0x00) window=${hex(w)} property=0x1f0("CUA_SEL") type=0x1f1("UTF8_STRING") data=''`,
    (s, w) => `005:<:${s}: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(w)} event-mask=0 SelectionNotify(31) time=CurrentTime(0x00000000) requestor=${hex(w)} selection=0xe6("CLIPBOARD") target=0x1f1("UTF8_STRING") property=0x1f0("CUA_SEL")`,
    (s, w) => `005:<:${s}: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(w)} event-mask=0 FocusOut(10) detail=Nonlinear(0x03) event=${hex(w)} mode=Normal(0x00)`,
    (s, w) => `005:<:${s}: 12: Composite-Request(142,3): UnredirectWindow window=${hex(w)} update=Manual(0x01)`,
    (s, w) => `005:<:${s}: 16: Request(12): ConfigureWindow window=${hex(w)} values={x=1 y=1}`,
  ];
  for (let seed = 0; seed < 300; seed++) {
    const lines = ["005:>: Success, version is 11:0 vendor='The X.Org Foundation' release=12101011 resource-id=0x00400000 resource-mask=0x001fffff motion-buffer-size=256", `004:<:0001: 12: Request(2): ChangeWindowAttributes window=${hex(MINE)} value-list={event-mask=StructureNotify}`];
    for (let i = 0, seq = 0x10; i < 16; i++, seq++) {
      const s = seq.toString(16).padStart(4, '0');
      const roll = r();
      if (roll < 0.15) lines.push(`004:>:${s}: Event DestroyNotify(17) event=${hex(pick(ids))} window=${hex(pick(ids))}`);
      else if (roll < 0.3) lines.push(`005:>:${s}: Event SelectionRequest(30) time=CurrentTime(0x00000000) owner=${hex(OWNER)} requestor=${hex(pick(ids))} selection=0xe6("CLIPBOARD") target=0x1f1("UTF8_STRING") property=0x1f0("CUA_SEL")`);
      else {
        const w = pick(ids);
        const line = pick(requests)(s, w);
        lines.push(line);
        const [, major, minor] = line.match(/Request\((\d+)(?:,(\d+))?\)/);
        if (r() < 0.45) lines.push(`005:>:${s}:Error 3=Window: major=${major}, minor=${minor ?? 0}, bad=${hex(pick([w, w, PERSON]))}, seq=${s}`);
      }
    }
    const text = lines.join('\n');
    assertEquivalent(`sweep ${seed}`, text, [new Set([MINE]), new Set([MINE, OWNER]), new Set()]);
    assert.ok(!JSON.stringify(projectTrace(parsed(text), ROOT)).includes('secret'));
  }
});

// ---------------------------------------------------------------------------------------------------------------------
// The keeper: per execution, all or none, capped, above a floor of free space

test('two runs sharing an out directory keep their traces apart, and neither reads the other\'s', () => {
  const out = outDir();
  const a = traceKeeper({ out, run: 'pinned-V1', free: plenty }).keep({ name: 'x', traces: [parsed(TEARDOWN)], registered: [MINE], root: ROOT });
  const b = traceKeeper({ out, run: 'pinned-V2', free: plenty }).keep({ name: 'x', traces: [parsed(ACCEPTED)], registered: [MINE], root: ROOT });
  // the same run name executed twice: an execution id of its own each time
  const c = traceKeeper({ out, run: 'pinned-V1', free: plenty }).keep({ name: 'x', traces: [parsed(ACCEPTED)], registered: [MINE], root: ROOT });
  assert.equal(new Set([a.files[0], b.files[0], c.files[0]]).size, 3);
  assert.notEqual(a.execution, c.execution);
  for (const k of [a, b, c]) assert.ok(k.files.every((f) => f.startsWith(`${AUDIT_TRACES_DIR}/${k.run}-${k.execution}/`)));
  assert.ok(readKeptTraces(out, a, 'pinned-V1'));
  assert.equal(readKeptTraces(out, a, 'pinned-V2'), null, "a row of another run");
  assert.equal(readKeptTraces(out, { ...a, files: b.files }, 'pinned-V1'), null, "files outside the row's own execution");
  assert.equal(readKeptTraces(out, { ...a, execution: c.execution }, 'pinned-V1'), null, "another execution's id on this one's files");
  assert.equal(readKeptTraces(out, { ...a, files: [`${AUDIT_TRACES_DIR}/${a.run}-${a.execution}/../${b.files[0].split('/').slice(1).join('/')}`] }, 'pinned-V1'), null, 'a path that leaves the execution');
});

test('the cap and off: an audit not kept writes nothing and says why; every byte written is charged', () => {
  const out = outDir();
  const off = traceKeeper({ out, run: 'r', limitMb: 0, free: plenty }).keep({ name: 'x', traces: [parsed(TEARDOWN)], registered: [], root: ROOT });
  assert.deepEqual(off, { kept: false, reason: 'not kept: --audit-traces off' });
  assert.equal(existsSync(join(out, AUDIT_TRACES_DIR)), false);
  // a cap of 1 MB: past it, an audit is refused whole; what fits is still kept after
  const keeper = traceKeeper({ out, run: 'r', limitMb: 1, free: plenty });
  const many = parsed(Array.from({ length: 60000 }, (_, i) => `005:<:${(i % 65536).toString(16).padStart(4, '0')}: 16: Request(12): ConfigureWindow window=${hex((0x00400000 + ((i * 2654435761) >>> 0) % 0x1fffff) >>> 0)} values={x=${i} y=${(i * 7919) % 1000}}`).join('\n'));
  const big = keeper.keep({ name: 'big', traces: Array(8).fill(many), registered: [], root: ROOT });
  assert.equal(big.kept, false);
  assert.match(big.reason, /1 MB cap/);
  const small = keeper.keep({ name: 'small', traces: [parsed(TEARDOWN)], registered: [], root: ROOT });
  assert.equal(small.files.length, 1);
  assert.equal(readdirSync(join(out, AUDIT_TRACES_DIR, `r-${small.execution}`)).length, 1);
});

test('the floor: an audit is not kept when the out directory\'s filesystem would fall below it, so the results keep room', () => {
  const out = outDir();
  const keeper = traceKeeper({ out, run: 'r', floorBytes: 2 * 1024 ** 3, free: () => 2 * 1024 ** 3 + 10 });
  const low = keeper.keep({ name: 'x', traces: [parsed(TEARDOWN)], registered: [], root: ROOT });
  assert.equal(low.kept, false);
  assert.match(low.reason, /free space/);
  assert.equal(existsSync(join(out, AUDIT_TRACES_DIR)), false);
  const unreadable = traceKeeper({ out, run: 'r', free: () => { throw new Error('statfs failed'); } }).keep({ name: 'x', traces: [parsed(TEARDOWN)], registered: [], root: ROOT });
  assert.match(unreadable.reason, /free space .*statfs failed/);
});

test('a write that fails on the second file removes every file of that audit, and the run goes on', () => {
  const out = outDir();
  let writes = 0;
  const fs = {
    writeFileSync: (path, data) => {
      writes += 1;
      if (writes === 2) {
        writeFileSync(path, data.subarray(0, 3));
        throw new Error('ENOSPC: no space left on device');
      }
      writeFileSync(path, data);
    },
    renameSync,
  };
  const keeper = traceKeeper({ out, run: 'r', free: plenty, fs, limitMb: 1 });
  const failed = keeper.keep({ name: 'x', traces: [parsed(TEARDOWN), parsed(ACCEPTED), parsed(TEARDOWN)], registered: [], root: ROOT });
  assert.equal(failed.kept, false);
  assert.match(failed.reason, /^not kept: ENOSPC/);
  const dir = join(out, AUDIT_TRACES_DIR, `r-${keeper.execution}`);
  assert.deepEqual(existsSync(dir) ? readdirSync(dir) : [], [], 'neither the renamed first file nor the partial second is left');
  // the bytes it wrote were charged: the cap counts them
  assert.ok(keeper.charged() > 0);
  // a blocked directory (a file where the directory goes) is the same
  const blocked = join(scratch, `blocked-${n++}`);
  appendFileSync(blocked, '');
  assert.match(traceKeeper({ out: blocked, run: 'r', free: plenty }).keep({ name: 'x', traces: [parsed(TEARDOWN)], registered: [], root: ROOT }).reason, /^not kept: /);
});

test('--audit-traces: on by default at the default cap, a cap in MB, or off', () => {
  const base = ['--vendor', '/v', '--newest', '/n', '--cua', '/c', '--scene', 'gedit', '--ops', 'type_text', '--out', '/o'];
  assert.equal(parseArgs(base).auditTraces, 256);
  assert.equal(parseArgs([...base, '--audit-traces', '64']).auditTraces, 64);
  assert.equal(parseArgs([...base, '--audit-traces', 'off']).auditTraces, 0);
  assert.throws(() => parseAuditTraceCap('0'), /a cap in MB/);
  assert.throws(() => parseAuditTraceCap('lots'), /a cap in MB/);
});

// ---------------------------------------------------------------------------------------------------------------------
// The re-judge

const line = (w) => `SendEvent FocusOut on ${hex(w)}`;
const FOREIGN = 'a window the harness did not open was changed: ';

test("the re-judge reads a run's kept projections with this checkout's judge, beside what the run stored", () => {
  const out = outDir();
  const keeper = traceKeeper({ out, run: 'r', free: plenty });
  const reg = new Set([MINE]);
  const audit = (engine, op, traces, stored) => ({ run: 'r', kind: 'audit', engine, scene: 'gedit', op, foreign: stored, kept_traces: traces ? keeper.keep({ name: `${engine}-gedit-${op}`, traces: traces.map(parsed), registered: reg, root: ROOT }) : { kept: false, reason: 'not kept: --audit-traces off' } });
  const rows = [
    // stored by H'''''s judge as foreign; refused as BadWindow, so the run's own now (the person's window the trace's
    // ChangeProperty wrote stays foreign in both)
    audit('pinned', 'type_text', [TEARDOWN], [`ChangeProperty on ${hex(PERSON)}`, line(MINE)]),
    // accepted after the end: foreign before and now
    audit('newest', 'type_text', [ACCEPTED], [`ChangeProperty on ${hex(PERSON)}`, line(MINE)]),
    audit('pinned', 'clipboard_write', null, [line(MINE)]),
    { run: 'r', kind: 'end', failed: [`${FOREIGN}pinned on gedit type_text: ${line(MINE)}`, `${FOREIGN}newest on gedit type_text: ${line(MINE)}`, `${FOREIGN}pinned on gedit clipboard_write: ${line(MINE)}`, 'a speed loss that stands'] },
  ];
  const [run] = rejudgeAudits(rows, out);
  assert.equal(run.incomplete, null);
  assert.equal(run.moved, 1);
  assert.equal(run.unkept, 1);
  // the person's window the trace's own requests touched is foreign in both
  assert.deepEqual(run.rows.map((j) => j.now && j.now.filter((l) => l.includes(hex(MINE)))), [[], [line(MINE)], null]);
  assert.equal(run.rows[2].reason, 'not kept: --audit-traces off');
  assert.deepEqual(run.foreign.now.filter((l) => l.includes(hex(MINE))), [`${FOREIGN}pinned on gedit clipboard_write: ${line(MINE)}`, `${FOREIGN}newest on gedit type_text: ${line(MINE)}`]);
});

test('the re-judge reads a run with no end row, or no audit row, as incomplete, never as a clear', () => {
  const out = outDir();
  const keeper = traceKeeper({ out, run: 'r', free: plenty });
  const row = { run: 'r', kind: 'audit', engine: 'cua', scene: 'gedit', op: 'type_text', foreign: [], kept_traces: keeper.keep({ name: 'x', traces: [parsed(TEARDOWN)], registered: [MINE], root: ROOT }) };
  assert.match(rejudgeAudits([row], out)[0].incomplete, /no end row/);
  assert.match(rejudgeAudits([{ run: 'r', kind: 'end', failed: [] }], out)[0].incomplete, /no audit row/);
  // rows of two executions under one run name cannot be bound to one end row
  const other = { ...row, kept_traces: traceKeeper({ out, run: 'r', free: plenty }).keep({ name: 'x', traces: [parsed(TEARDOWN)], registered: [MINE], root: ROOT }) };
  assert.match(rejudgeAudits([row, other, { run: 'r', kind: 'end', failed: [] }], out)[0].incomplete, /more than one execution/);
});

test("the audit pass keeps every lifecycle's projection with the windows it judged them against, and its row says what was kept", () => {
  const run = readFileSync(join(REPO, 'scripts', 'linux-engine-diff', 'run.mjs'), 'utf8');
  const pass = run.slice(run.indexOf('// The X request audit, in its own untimed pass'), run.indexOf("// The text commands' accessibility-bus calls"));
  assert.match(pass, /const keeper = traceKeeper\(\{ out: args\.out, run, limitMb: args\.auditTraces \?\? DEFAULT_AUDIT_TRACE_MB \}\);/);
  // one registry and one parse for the judgment and the kept record, so a re-judge reads what the run judged
  assert.equal(pass.match(/desktop\.registry\(\)/g).length, 1);
  assert.match(pass, /const registered = desktop\.registry\(\);/);
  assert.match(pass, /const traces = segments\.map\(\(seg\) => parseXtrace\(seg\.trace\)\);/);
  assert.match(pass, /auditForeign\(trace, \{ registered, root: desktop\.root, routeAudit: true \}\)/);
  assert.match(pass, /keeper\.keep\(\{ name: `\$\{spec\.label\}-\$\{sceneName\}-\$\{op\}`, traces, registered: registered\.keys\(\), root: desktop\.root \}\)/);
  assert.match(pass, /kept_traces: keptTraces \}\);/);
});
