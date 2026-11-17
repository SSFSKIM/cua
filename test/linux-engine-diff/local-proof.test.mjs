// #171 M5, task 91, the design session's ruling 774: the local proof (scripts/linux-engine-gate/local-proof.sh), which
// stands in for ci-gate while GitHub Actions is out, records each part's true exit in its summary. T5's driver wrote
// `exit 0` for every part, because a `$(date)` ran before its `$?` was read; the part logs and the lock lines had the
// true exits. Here the parts run in a stand-in checkout whose npm scripts exit as each test says, so nothing heavy runs.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const ROOT = new URL('../../', import.meta.url).pathname;
const PROOF = join(ROOT, 'scripts/linux-engine-gate/local-proof.sh');
// GNU timeout bounds each part; macOS has none
const usable = process.platform === 'linux';

/** local-proof.sh over a stand-in checkout whose `npm test` and harness suite run `test` and `harness`: its exit and records. */
function proof({ test: testScript, harness, parts = 'npm-test,harness', hold = false }) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-proof-'));
  try {
    const checkout = join(dir, 'checkout');
    mkdirSync(checkout);
    writeFileSync(join(checkout, 'package.json'), JSON.stringify({ name: 'stand-in', private: true, scripts: { test: testScript, 'test:linux-engine-diff': harness } }));
    if (hold) writeFileSync(join(dir, 'hold'), 'held by the test\n');
    const out = join(dir, 'out');
    const env = { ...process.env, PROOF_PARTS: parts, PROOF_HOLD: join(dir, 'hold') };
    delete env.PROOF_LOCK;
    const run = spawnSync('bash', [PROOF, out, checkout], { encoding: 'utf8', env, timeout: 120000 });
    const read = (name) => readFileSync(join(out, name), 'utf8');
    const logs = Object.fromEntries(parts.split(',').map((name) => [name, existsSync(join(out, `${name}.log`)) ? read(`${name}.log`) : null]));
    return { status: run.status, said: run.stdout + run.stderr, summary: read('proof.log'), part: (name) => logs[name] };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("a failing part's own exit lands in the summary, and the summary and the proof fail", { skip: !usable && 'GNU timeout, Linux only' }, () => {
  const r = proof({ test: 'echo the-failing-part-ran; exit 3', harness: 'echo the-passing-part-ran' });
  assert.match(r.summary, /^\S+ npm-test exit 3 /m, r.summary);
  assert.match(r.summary, /^\S+ harness exit 0 /m, r.summary);
  assert.match(r.summary.trim().split('\n').at(-1), /^proof: FAIL: npm-test exit 3$/);
  assert.notEqual(r.status, 0, r.said);
  assert.match(r.part('npm-test'), /the-failing-part-ran/);
  assert.match(r.part('npm-test'), /== npm-test exit 3 /);
});

test('every part exiting 0 is the only pass', { skip: !usable && 'GNU timeout, Linux only' }, () => {
  const r = proof({ test: 'true', harness: 'true' });
  assert.match(r.summary, /^\S+ npm-test exit 0 /m);
  assert.match(r.summary, /^\S+ harness exit 0 /m);
  assert.equal(r.summary.trim().split('\n').at(-1), 'proof: PASS: every part exited 0 (npm-test harness)');
  assert.equal(r.status, 0, r.said);
});

test('a part the hold kept from running fails the proof, never passes it', { skip: !usable && 'GNU timeout, Linux only' }, () => {
  const r = proof({ test: 'true', harness: 'true', hold: true });
  assert.match(r.summary, /npm-test not run: the hold \S+ is present/);
  assert.match(r.summary.trim().split('\n').at(-1), /^proof: FAIL: npm-test not run, harness not run$/);
  assert.notEqual(r.status, 0);
});

test('an unknown part is refused before anything runs', { skip: !usable && 'GNU timeout, Linux only' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-proof-'));
  try {
    const run = spawnSync('bash', [PROOF, join(dir, 'out'), dir], { encoding: 'utf8', env: { ...process.env, PROOF_PARTS: 'npm-test,no-such-part' } });
    assert.equal(run.status, 2);
    assert.match(run.stderr, /unknown part no-such-part/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the harness-dbus part runs the harness-dbus gate's own line", () => {
  const line = (text) => text.split('\n').map((l) => l.trim()).find((l) => l.startsWith('CUA171_DBUS_TESTS=required node test/linux-engine-diff/suite-check.mjs'));
  const gate = line(readFileSync(join(ROOT, '.github/ci-kit.yml'), 'utf8'));
  assert.ok(gate, "ci-kit.yml's harness-dbus line");
  assert.equal(line(readFileSync(PROOF, 'utf8')), gate);
});
