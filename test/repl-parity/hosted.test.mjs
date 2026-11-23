// #159: the hosted gates sandbox-denials and parity-browser (scripts/repl-parity/hosted/). The judge holds the denials
// to the declared set with no preferences denial; the public readers print only labels, booleans and counts; the
// script refuses to run anywhere but a GitHub-hosted macOS runner.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {judgeDenials, publicKind} from '../../scripts/repl-parity/hosted/denials-within.mjs';
import {bindLine, diffLines, label, onlyBackend, readyLines, runLines} from '../../scripts/repl-parity/hosted/public.mjs';
import {declaredDevice} from '../../scripts/repl-parity/devices.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HOSTED = join(ROOT, 'scripts/repl-parity/hosted');
const DECLARED = JSON.parse(readFileSync(join(HOSTED, 'denials-declared.json'), 'utf8')).declared;
const PLANTED = 'planted-7f3a91c2';
const event = message => JSON.stringify({eventMessage: message});
const node = (operation, target) => event(`Sandbox: node(501) deny(1) ${operation} ${target}`);
// One denial of each declared kind, as the stream records them (filesystem targets as paths, ports as numbers).
const declaredStream = [
  node('file-write-create', '/private/tmp/x'), node('file-write-create', '/Users/runner/Library/Application Support/cua/run/0526d32c/tmp/y'),
  node('file-write-data', '/dev/ttys001'), node('mach-lookup', 'com.apple.diagnosticd'), node('mach-lookup', 'com.apple.logd'),
  node('mach-lookup', 'com.apple.system.notification_center'), node('network-outbound', 'remote:*:52341'), node('network-outbound', 'remote:*:52342'),
  node('sysctl-read', 'kern.bootargs'), node('sysctl-read', 'kern.iossupportversion'), node('sysctl-read', 'security.mac.lockdown_mode_state'),
  event('Sandbox: Safari(77) deny(1) mach-lookup com.apple.cfprefsd.daemon'),
];

test('declared denial kinds pass, two ports of one loopback kind are one kind, and another process\'s denials do not count', () => {
  const verdict = judgeDenials(declaredStream.join('\n'), DECLARED);
  assert.equal(verdict.ok, true);
  assert.equal(verdict.kinds.length, 10);
  assert.equal(verdict.kinds.find(k => k.kind === 'network-outbound remote:*:<port>').count, 2);
  assert.deepEqual([verdict.events, verdict.preferences, verdict.undeclared], [12, 0, 0]);
});

test('an undeclared kind fails the judgement', () => {
  const verdict = judgeDenials([...declaredStream, node('mach-lookup', 'com.apple.windowserver.active')].join('\n'), DECLARED);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.undeclared, 1);
  assert.equal(verdict.kinds.find(k => !k.declared).line, 'mach-lookup com.apple.windowserver.active');
});

test('any preferences denial fails, whether a cfprefsd lookup, a preference operation or a preferences file, even one the reduction classes as a declared kind', () => {
  for (const denial of [node('mach-lookup', 'com.apple.cfprefsd.daemon'), node('user-preference-read', 'kCFPreferencesAnyApplication'),
    node('file-read-data', '/Users/runner/Library/Preferences/com.apple.x.plist'), node('file-read-data', '/Library/Preferences/com.apple.y.plist'),
    node('file-write-create', '/private/tmp/fixture/Library/Preferences/com.apple.x.plist'),
    node('file-write-create', '/Users/runner/Library/Application Support/cua/run/0526d32c/Library/Preferences/x.plist')]) {
    const verdict = judgeDenials([...declaredStream, denial].join('\n'), DECLARED);
    assert.equal(verdict.ok, false, denial);
    assert.equal(verdict.preferences, 1, denial);
  }
  // Even a declared set that named it would not admit it.
  const cfprefs = {operation: 'mach-lookup', target: 'com.apple.cfprefsd.daemon'};
  assert.equal(judgeDenials([...declaredStream, node(cfprefs.operation, cfprefs.target)].join('\n'), [...DECLARED, cfprefs]).ok, false);
});

// What `log stream --style ndjson --predicate …` writes before its records (on stdout), and the blank line it writes when
// stopped by SIGINT.
const BANNER = 'Filtering the log data using "sender == "Sandbox""';

test('the stream\'s banner and blank lines are not records', () => {
  const verdict = judgeDenials([BANNER, ...declaredStream.slice(0, 6), '', ...declaredStream.slice(6), ''].join('\n'), DECLARED);
  assert.deepEqual([verdict.ok, verdict.events, verdict.malformed], [true, 12, 0]);
});

test('a record that does not parse fails the judgement, counted as malformed, whether mid-stream or the last', () => {
  const cfprefs = node('mach-lookup', 'com.apple.cfprefsd.daemon');
  const truncated = cfprefs.slice(0, Math.floor(cfprefs.length / 2));
  for (const lines of [
    [declaredStream[0], truncated, ...declaredStream.slice(1)],
    [...declaredStream, truncated],
    [...declaredStream, `${truncated}\n`],
    [declaredStream[0], truncated],
    [...declaredStream, BANNER],
    [...declaredStream, '42'],
  ]) {
    const verdict = judgeDenials(lines.join('\n'), DECLARED);
    assert.equal(verdict.ok, false, lines.at(-1));
    assert.equal(verdict.malformed, 1, lines.at(-1));
  }
});

test('a stream that recorded nothing fails: the check would be vacuous', () => {
  const verdict = judgeDenials('', DECLARED);
  assert.deepEqual([verdict.ok, verdict.events, verdict.kinds.length], [false, 0, 0]);
});

test('an undeclared kind\'s public line withholds a target that is not a class or a plain name', () => {
  const declared = new Set();
  assert.equal(publicKind({operation: 'network-outbound', target: `remote:${PLANTED}.example:443`}, declared), 'network-outbound <withheld>');
  assert.equal(publicKind({operation: 'network-outbound', target: '/private/var/run/mDNSResponder'}, declared), 'network-outbound <withheld>');
  assert.equal(publicKind({operation: 'file-read-data', target: '<home>'}, declared), 'file-read-data <home>');
  const verdict = judgeDenials([...declaredStream, node('network-outbound', `remote:10.1.2.3:${PLANTED}`), node('file-read-data', `/Users/runner/${PLANTED}`)].join('\n'), DECLARED);
  assert.equal(JSON.stringify(verdict.kinds.map(k => k.line)).includes(PLANTED), false);
  assert.equal(verdict.ok, false);
});

test('the judge\'s command prints kinds and counts and exits 1 on an undeclared kind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hosted-judge-'));
  try {
    const log = join(dir, 'denials.ndjson');
    writeFileSync(log, `${declaredStream.join('\n')}\n`);
    const pass = spawnSync(process.execPath, [join(HOSTED, 'denials-within.mjs'), log, join(HOSTED, 'denials-declared.json')], {encoding: 'utf8'});
    assert.equal(pass.status, 0, pass.stderr);
    assert.match(pass.stdout, /Sandbox events 12, node denial kinds 10, preferences 0, undeclared 0, malformed records 0/);
    writeFileSync(log, `${[...declaredStream, node('iokit-open', 'IOSurfaceRootUserClient')].join('\n')}\n`);
    const fail = spawnSync(process.execPath, [join(HOSTED, 'denials-within.mjs'), log, join(HOSTED, 'denials-declared.json')], {encoding: 'utf8'});
    assert.equal(fail.status, 1);
    assert.match(fail.stdout, /denial: iokit-open IOSurfaceRootUserClient x1 {2}\(undeclared\)/);
    // A truncated record's text is never printed, only counted.
    writeFileSync(log, `${[...declaredStream, `{"eventMessage":"Sandbox: node(501) deny(1) file-read-data /Users/runner/${PLANTED}`].join('\n')}`);
    const malformed = spawnSync(process.execPath, [join(HOSTED, 'denials-within.mjs'), log, join(HOSTED, 'denials-declared.json')], {encoding: 'utf8'});
    assert.equal(malformed.status, 1);
    assert.match(malformed.stdout, /undeclared 0, malformed records 1\n$/);
    assert.equal(`${malformed.stdout}${malformed.stderr}`.includes(PLANTED), false);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('the public readers print labels, booleans and counts; free text is withheld', () => {
  assert.equal(label(`free text ${PLANTED}`), '<withheld>');
  assert.equal(label('/Users/runner/x'), '<withheld>');
  assert.equal(label('cells/confinement/no-unsandboxed-fallback'), 'cells/confinement/no-unsandboxed-fallback');
  const pick = {ok: false, outcome: 'pick_required', reason: 'unlabelled', key: 'harness', backends: [{instanceId: 'b-1', profileName: PLANTED}]};
  assert.equal(bindLine(pick), 'hosted-parity: bind: ok false outcome pick_required how - by unlabelled backends 1');
  assert.equal(onlyBackend(pick), 'b-1');
  assert.equal(onlyBackend({...pick, backends: [{instanceId: 'b-1'}, {instanceId: 'b-2'}]}), null);
  const list = readyLines({profiles: [{key: 'harness', ready: false, reason: `${PLANTED} broke`, extensionInstanceId: null}], listingError: `at /Users/runner ${PLANTED}`}, 'harness');
  assert.equal(list.ok, false);
  assert.equal(list.lines.join('\n').includes(PLANTED), false);
  assert.equal(readyLines({profiles: [{key: 'harness', ready: true, extensionInstanceId: 'b-1'}]}, 'harness').ok, true);

  const diff = diffLines({ok: false, differences: [{kind: 'assertion', side: 'b', case: 'api/tabs/list', cell: 2, message: `undeclared ${PLANTED}`}], expected: [1, 2]}, 'api');
  assert.equal(diff.ok, false);
  assert.deepEqual(diff.lines, ['hosted-parity: diff api: ok false undeclared 1 expected 2', '  undeclared: assertion side b case api/tabs/list cell 2 field -']);

  const dir = mkdtempSync(join(tmpdir(), 'hosted-run-'));
  try {
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({complete: false, error: `boom at /Users/runner/${PLANTED}`}));
    writeFileSync(join(dir, 'results.jsonl'), [{case: 'cells/a', cell: 1, assertion: {ok: true}}, {case: 'cells/b', cell: 3, assertion: {ok: false, message: PLANTED}}].map(r => JSON.stringify(r)).join('\n'));
    const {lines, ok} = runLines(`progress ${PLANTED}\n${JSON.stringify({cases: 2, complete: false, assertions: 'FAIL', coveredCases: ['cells/a'], recordedVendorDefects: 0, out: `/x/${PLANTED}`})}\n`, dir, 'cua/cells');
    assert.equal(lines.join('\n').includes(PLANTED), false);
    assert.deepEqual(lines, ['hosted-parity: run cua/cells: cases 2 complete false assertions FAIL covered 1 pending 0 vendorDefects 0',
      '  meta: complete false error present (withheld)', '  failed assertion: cells/b 3', '    reason other', '  rows 2, failed assertions 1']);
    assert.equal(ok, false);
    const passed = runLines(JSON.stringify({cases: 2, complete: true, assertions: 'PASS', coveredCases: ['a', 'b']}), dir, 'cua/cells');
    assert.deepEqual([passed.ok, passed.lines.length], [true, 1]);
    // No usable report fails closed: no summary, an empty run, an incomplete one.
    for (const stdout of ['', JSON.stringify({cases: 0, complete: true, assertions: 'PASS'}), JSON.stringify({cases: 2, complete: false, assertions: 'PASS'})])
      assert.equal(runLines(stdout, join(dir, 'absent'), 'cua/cells').ok, false, stdout);
    const reader = spawnSync(process.execPath, [join(HOSTED, 'public.mjs'), 'run', join(dir, 'absent.out'), join(dir, 'absent'), 'cua/cells'], {encoding: 'utf8'});
    assert.equal(reader.status, 1);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('a failed case\'s lines say why in fixture data only: the reason\'s kind, each cell\'s outcome, timing and labelled value', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hosted-run-'));
  const cell = (name, row, ms) => ({case: 'api/browser-cuaapi/drag', cell: name, ok: true, isError: false, ms,
    content: [{type: 'text', text: `progress ${PLANTED}\nCUA_PARITY_RESULT ${JSON.stringify({...row, $imageCount: 0})}`}], meta: {'cua/taskId': PLANTED}});
  const timedOut = {ok: false, error: {code: 'Error', message: `Timed out after 1500ms waiting for selector text=ended at /Users/runner/${PLANTED}`}};
  const sideEffects = {events: [{text: 'pointer'}, {pointer: {x: 60, y: 180}}, {dragStart: true, x: 60, y: 180}, {note: `/Users/runner/${PLANTED}`}, {host: `runner@${PLANTED}.local`, dir: `Users/runner/${PLANTED}`}]};
  const reasons = [
    [`drag: ${timedOut.error.message}`, '    reason cell-error cell drag timeout true'],
    [`scroll: unexpected fixture result ${JSON.stringify({before: 0, moved: false})}`, '    reason unexpected-result cell scroll: {"before":0,"moved":false}'],
    [`fixture side effects differ: ${JSON.stringify(sideEffects)}`, '    reason side-effects: {"events":[{"text":"pointer"},{"pointer":{"x":60,"y":180}},{"dragStart":true,"x":60,"y":180},{"note":"<withheld>"},{"host":"<withheld>","dir":"<withheld>"}]}'],
    [`api/browser-cuaapi/drag: ${PLANTED} at /Users/runner`, '    reason other'],
  ];
  try {
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({complete: true}));
    for (const [reason, line] of reasons) {
      const rows = [cell('type', {ok: true, value: 'pointer'}, 486.4), cell('drag', timedOut, 1712.9), cell('scroll', {ok: true, value: {before: 0, moved: false}}, 228),
        {case: 'api/browser-cuaapi/drag', cell: 'odd', ok: true, content: [{type: 'text', text: PLANTED}], ms: 3},
        {case: 'api/other', cell: 'a', ok: true, content: [], ms: 1}, {case: 'api/other', assertion: {ok: true}},
        {case: 'api/browser-cuaapi/drag', assertion: {ok: false, reason}}];
      writeFileSync(join(dir, 'results.jsonl'), rows.map(r => JSON.stringify(r)).join('\n'));
      const {lines} = runLines(JSON.stringify({cases: 2, complete: true, assertions: 'FAIL', coveredCases: ['api/other']}), dir, 'cua/api');
      assert.equal(lines.join('\n').includes(PLANTED), false, reason);
      assert.equal(lines.join('\n').includes('/Users/runner'), false, reason);
      assert.deepEqual(lines.slice(2), ['  failed assertion: api/browser-cuaapi/drag -', line,
        '    cell type: ok true ms 486 value "pointer"',
        '    cell drag: ok false ms 1713 error Error timeout true',
        '    cell scroll: ok true ms 228 value {"before":0,"moved":false}',
        '    cell odd: no result marker ms 3',
        '  rows 7, failed assertions 1'], reason);
    }
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('a failed cell\'s error is told by its kind without its text: the CDP command that timed out, a detached debugger, the selector deadline; an other reason names the cells it mentions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hosted-run-'));
  const id = 'api/browser-playwrightlocator/waitfor';
  const failing = (name, message) => ({case: id, cell: name, ok: true, isError: false, ms: 10,
    content: [{type: 'text', text: `CUA_PARITY_RESULT ${JSON.stringify({ok: false, error: {code: 'Error', message}, $imageCount: 0})}`}]});
  try {
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({complete: true}));
    const rows = [
      failing('cdp', `Error: Timed out after 1500ms waiting for selector text=ended: Timed out after 1ms waiting for CDP command Runtime.evaluate.\nat /Users/runner/${PLANTED}`),
      failing('deadline', 'Error: Playwright selector deadline exceeded\nlocator.waitFor(visible) timed out for selector #x'),
      failing('detached', `Debugger is not attached to the tab with id: 5. ${PLANTED}`),
      failing('odd-command', `Timed out after 9ms waiting for CDP command ${PLANTED}/x.`),
      failing('plain', `Error: boom at /Users/runner/${PLANTED}`),
      {case: id, cell: 'locator-contract-diagnostics-no-matches', ok: true, isError: false, ms: 318,
        content: [{type: 'text', text: `CUA_PARITY_RESULT ${JSON.stringify({ok: true, value: {rejected: true, after: ['a sentence', `at /Users/runner/${PLANTED}`]}, $imageCount: 0})}`}]},
      {case: id, assertion: {ok: false, reason: `${id}: locator-contract-diagnostics-no-matches did not satisfy the vendor locator contract ${PLANTED}`}},
    ];
    writeFileSync(join(dir, 'results.jsonl'), rows.map(r => JSON.stringify(r)).join('\n'));
    const {lines} = runLines(JSON.stringify({cases: 1, complete: true, assertions: 'FAIL'}), dir, 'cua/api');
    assert.equal(lines.join('\n').includes(PLANTED), false);
    assert.deepEqual(lines.slice(2), [`  failed assertion: ${id} -`,
      '    reason other names locator-contract-diagnostics-no-matches',
      '    cell cdp: ok false ms 10 error Error timeout true cdp Runtime.evaluate',
      '    cell deadline: ok false ms 10 error Error timeout true selector-deadline true',
      '    cell detached: ok false ms 10 error Error timeout false detached true',
      '    cell odd-command: ok false ms 10 error Error timeout true',
      '    cell plain: ok false ms 10 error Error timeout false',
      '    cell locator-contract-diagnostics-no-matches: ok true ms 318 value {"rejected":true,"after":["<withheld>","<withheld>"]}',
      '  rows 7, failed assertions 1']);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('a public reader given an unreadable report prints a fixed line, never the parser\'s message', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hosted-public-'));
  try {
    writeFileSync(join(dir, 'bind.json'), `{"ok": ${PLANTED}`);
    const run = spawnSync(process.execPath, [join(HOSTED, 'public.mjs'), 'bind', join(dir, 'bind.json')], {encoding: 'utf8'});
    assert.equal(run.status, 1);
    assert.equal(run.stdout, 'hosted-parity: bind: report unreadable\n');
    assert.equal(run.stderr, '');
  } finally { rmSync(dir, {recursive: true, force: true}); }
});

test('the script refuses to run off a GitHub-hosted macOS runner and touches nothing', () => {
  const home = mkdtempSync(join(tmpdir(), 'hosted-guard-'));
  try {
    mkdirSync(join(home, 'tmp'));
    for (const env of [{}, {RUNNER_ENVIRONMENT: 'self-hosted'}]) {
      const run = spawnSync('sh', [join(HOSTED, 'hosted.sh'), 'denials'], {encoding: 'utf8', env: {PATH: process.env.PATH, HOME: home, RUNNER_TEMP: join(home, 'tmp'), ...env}});
      assert.equal(run.status, 2);
      assert.match(run.stderr, /^hosted-parity: refused: /);
      assert.deepEqual(readdirSync(home), ['tmp']);
      assert.deepEqual(readdirSync(join(home, 'tmp')), []);
    }
    const usage = spawnSync('sh', [join(HOSTED, 'hosted.sh'), 'cfprefs'], {encoding: 'utf8', env: {PATH: process.env.PATH, HOME: home}});
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /^usage: /);
    // The diagnosis-only load (#168) takes only cpu:<1-9> and only for the browser item; a valid one still meets the guard.
    const stressed = (item, value) => spawnSync('sh', [join(HOSTED, 'hosted.sh'), item], {encoding: 'utf8', env: {PATH: process.env.PATH, HOME: home, PARITY_STRESS: value}});
    for (const [item, value, refusal] of [['browser', 'cpu', /^hosted-parity: PARITY_STRESS must be cpu:<1-9>/], ['browser', 'cpu:0', /must be cpu:<1-9>/],
      ['denials', 'cpu:1', /^hosted-parity: PARITY_STRESS is for the browser item/], ['browser', 'cpu:1', /^hosted-parity: refused: /]]) {
      const run = stressed(item, value);
      assert.equal(run.status, 2, `${item} ${value}`);
      assert.match(run.stderr, refusal, `${item} ${value}`);
    }
    // The diagnosis-only Chrome flags take only their named sets; anything else would reach Chrome's command line. The
    // renderer-backgrounding set (#384) is for a stress run only.
    const flagged = (value, stress) => spawnSync('sh', [join(HOSTED, 'hosted.sh'), 'browser'], {encoding: 'utf8',
      env: {PATH: process.env.PATH, HOME: home, PARITY_CHROME_FLAGS: value, ...(stress ? {PARITY_STRESS: stress} : {})}});
    for (const [value, stress, refusal] of [
      ['--remote-debugging-port=9222', undefined, /^hosted-parity: PARITY_CHROME_FLAGS must be anti-throttling or renderer-backgrounding/],
      ['anti-throttling', undefined, /^hosted-parity: refused: /],
      ['renderer-backgrounding', undefined, /^hosted-parity: PARITY_CHROME_FLAGS=renderer-backgrounding is for a stress diagnosis/],
      ['renderer-backgrounding', 'cpu:2', /^hosted-parity: refused: /]]) {
      const run = flagged(value, stress);
      assert.equal(run.status, 2, value);
      assert.match(run.stderr, refusal, `${value} ${stress ?? ''}`);
    }
    assert.deepEqual(readdirSync(home), ['tmp']);
  } finally { rmSync(home, {recursive: true, force: true}); }
});

test('the runner is a declared darwin device', () => {
  assert.deepEqual(declaredDevice('hosted-macos'), {platform: 'darwin'});
});

test('a failed cell that says what it saw (`; seen {...}`, #168) prints that in fixture data, its paths and text withheld', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hosted-run-'));
  const id = 'api/browser-cuaapi/type';
  const seen = {focused: false, active: {tag: 'body', id: ''}, value: '', where: `/Users/runner/${PLANTED}`};
  const message = `the typed text was not acknowledged within 3000ms; seen ${JSON.stringify(seen)}`;
  try {
    writeFileSync(join(dir, 'meta.json'), JSON.stringify({complete: true}));
    writeFileSync(join(dir, 'results.jsonl'), [
      {case: id, cell: 'type', ok: true, isError: false, ms: 3319, content: [{type: 'text', text: `CUA_PARITY_RESULT ${JSON.stringify({ok: false, error: {code: 'Error', message}, $imageCount: 0})}`}]},
      {case: id, assertion: {ok: false, reason: `type: ${message}`}},
    ].map(r => JSON.stringify(r)).join('\n'));
    const {lines} = runLines(JSON.stringify({cases: 1, complete: true, assertions: 'FAIL'}), dir, 'vendor/api');
    assert.equal(lines.join('\n').includes(PLANTED), false);
    const view = '{"focused":false,"active":{"tag":"body","id":""},"value":"","where":"<withheld>"}';
    assert.deepEqual(lines.slice(3, 5), [`    reason cell-error cell type timeout false seen ${view}`, `    cell type: ok false ms 3319 error Error timeout false seen ${view}`]);
  } finally { rmSync(dir, {recursive: true, force: true}); }
});
