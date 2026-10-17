// The live MAWS client-mode probe (docs/evidence/2026-10-13-own-browser-service-parity/m4/maws-live/run.mjs, acceptance
// 8): its verdict over a report, and, with a fake Electron in a fake MAWS checkout, that it exits nonzero on a failed
// start and leaves no MAWS child or scratch directory behind, on a normal end and on SIGINT/SIGTERM.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verdict} from '../docs/evidence/2026-10-13-own-browser-service-parity/m4/maws-live/verdict.mjs';

const RUN = fileURLToPath(new URL('../docs/evidence/2026-10-13-own-browser-service-parity/m4/maws-live/run.mjs', import.meta.url));

const passing = service => ({
  service,
  maws: {sockets: {'m4-A': '/tmp/a.sock', 'm4-B': '/tmp/b.sock'}, trusted: true},
  features: {status: 'PASS', summary: {profiles: 'PASS', service: 'PASS', createTab: 'PASS', popup: 'PASS'},
    details: {service: {requested: service, served: service === 'cua' ? 'cua browser service 0.1.0' : 'vendor'}, popup: {added: [{id: '2', url: 'http://127.0.0.1:1/popup'}]}}},
  created: {id: '1', profileName: 'MAWS', instance: 'maws:m4-A'},
  cursor: {before: 0, click: {ok: true, ms: 200}, after: 4, ok: true},
  takeover: {
    defaultBudget: {click: {ok: false, ms: 3014, error: 'Error: Playwright selector deadline exceeded', sincePersonMs: 3033}, state: 'waiting'},
    timeoutMs15000: service === 'cua'
      ? {click: {ok: true, ms: 3244, sincePersonMs: 3262}, state: 'submitted:x'}
      : {click: {ok: false, ms: 3078, error: 'Error: Playwright selector deadline exceeded', sincePersonMs: 3114}, state: 'waiting'},
  },
});
const failuresOf = report => verdict(report).failures.map(f => f.check);

test('a complete run passes on each service with that service\'s takeover expectation', () => {
  for (const service of ['cua', 'vendor']) assert.deepEqual(verdict(passing(service)), {status: 'PASS', failures: []}, service);
});

test('each required check fails the verdict on its own', () => {
  const cases = [
    ['error', r => { r.error = 'Error: MAWS did not open the sockets'; }],
    ['maws', r => { r.maws.trusted = false; }],
    ['features', r => { r.features.status = 'FAIL'; }],
    ['service', r => { r.features.summary.service = 'FAIL'; }],
    ['popup', r => { r.features.summary.popup = 'FAIL'; }],
    ['profileName', r => { r.created.profileName = 'Default'; }],
    ['cursor', r => { r.cursor.after = 0; r.cursor.ok = false; }],
    ['takeover.defaultBudget', r => { r.takeover.defaultBudget = {click: {ok: true, ms: 200}, state: 'submitted:x'}; }],
  ];
  for (const service of ['cua', 'vendor']) {
    for (const [check, spoil] of cases) {
      const report = passing(service);
      spoil(report);
      assert.ok(failuresOf(report).includes(check), `${service} ${check}: ${JSON.stringify(failuresOf(report))}`);
    }
  }
});

test('the raised budget: cua must go through after the hand-back, the vendor must stop at its 3 s cap', () => {
  const cuaFailed = passing('cua');
  cuaFailed.takeover.timeoutMs15000 = passing('vendor').takeover.timeoutMs15000;
  assert.deepEqual(failuresOf(cuaFailed), ['takeover.timeoutMs15000']);
  const cuaTooEarly = passing('cua');
  cuaTooEarly.takeover.timeoutMs15000.click.sincePersonMs = 400; // went through while the person held the tab
  assert.deepEqual(failuresOf(cuaTooEarly), ['takeover.timeoutMs15000']);
  const vendorWent = passing('vendor');
  vendorWent.takeover.timeoutMs15000 = passing('cua').takeover.timeoutMs15000;
  assert.deepEqual(failuresOf(vendorWent), ['takeover.timeoutMs15000']);
});

test('a report that stopped early fails on everything it never observed', () => {
  assert.deepEqual(failuresOf({service: 'cua', error: 'interrupted by SIGINT'}),
    ['error', 'maws', 'features', 'service', 'popup', 'profileName', 'cursor', 'takeover.defaultBudget', 'takeover.timeoutMs15000']);
});

// A fake MAWS checkout whose Electron prints the launcher's lines (trusted as given), records its pid, and lives until
// SIGTERM, so the probe's start-up failure and shutdown paths run without MAWS, Chrome or a network.
function fakeCheckout({trusted}) {
  const root = mkdtempSync(join(tmpdir(), 'maws-live-fake-'));
  const bin = join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS');
  mkdirSync(bin, {recursive: true});
  const electron = join(bin, 'Electron');
  writeFileSync(electron, `#!${process.execPath}
const {writeFileSync} = require('node:fs');
writeFileSync(${JSON.stringify(join(root, 'electron.pid'))}, String(process.pid));
process.stdout.write(JSON.stringify({sockets: {'m4-A': '/tmp/fake-a.sock', 'm4-B': '/tmp/fake-b.sock'}}) + '\\n');
process.stdout.write(JSON.stringify({trusted: ${trusted}}) + '\\n');
process.on('SIGTERM', () => process.exit(0));
setInterval(() => {}, 1000);
`);
  chmodSync(electron, 0o755);
  return root;
}
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const scratchDirs = () => new Set(readdirSync('/tmp').filter(name => /^mcua-m4-/.test(name)));
const probeEnv = (checkout, extra = {}) => ({...process.env, MAWS_CHECKOUT: checkout, CUA_HOME: join(checkout, 'home'), ...extra});

test('a start-up failure (MAWS does not trust the probe) exits nonzero, stops MAWS and removes the scratch directories', () => {
  const checkout = fakeCheckout({trusted: false});
  const out = join(checkout, 'report.json');
  const before = scratchDirs();
  try {
    const result = spawnSync(process.execPath, [RUN, '--out', out], {env: probeEnv(checkout), encoding: 'utf8', timeout: 60_000});
    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(readFileSync(out, 'utf8'));
    assert.match(report.error, /did not open the sockets or trust/);
    assert.equal(report.verdict.status, 'FAIL');
    assert.equal(alive(Number(readFileSync(join(checkout, 'electron.pid'), 'utf8'))), false);
    assert.deepEqual([...scratchDirs()].filter(d => !before.has(d)), []);
  } finally { rmSync(checkout, {recursive: true, force: true}); }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  test(`${signal} goes through the one shutdown path: MAWS stopped, scratch removed, report written, nonzero exit`, async () => {
    const checkout = fakeCheckout({trusted: true});
    const out = join(checkout, 'report.json');
    const before = scratchDirs();
    try {
      // trusted: the probe proceeds to the features harness, whose serve finds no runtime and no socket; the signal
      // arrives while it runs (or just after MAWS started, whichever is first)
      const child = spawn(process.execPath, [RUN, '--out', out], {env: probeEnv(checkout), stdio: ['ignore', 'ignore', 'pipe']});
      let stderr = '';
      child.stderr.on('data', chunk => { stderr += chunk; });
      const pidFile = join(checkout, 'electron.pid');
      for (const until = Date.now() + 20_000; !existsSync(pidFile) && Date.now() < until;) await new Promise(r => setTimeout(r, 50));
      assert.ok(existsSync(pidFile), 'the fake Electron started');
      await new Promise(r => setTimeout(r, 300));
      child.kill(signal);
      const code = await new Promise(resolve => child.on('exit', (c, s) => resolve(c ?? s)));
      assert.notEqual(code, 0, stderr);
      const report = JSON.parse(readFileSync(out, 'utf8'));
      assert.equal(report.error, `interrupted by ${signal}`);
      assert.equal(report.verdict.status, 'FAIL');
      assert.equal(alive(Number(readFileSync(pidFile, 'utf8'))), false);
      assert.deepEqual([...scratchDirs()].filter(d => !before.has(d)), []);
    } finally { rmSync(checkout, {recursive: true, force: true}); }
  });
}
