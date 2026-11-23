// #171 M5, T4's arm64 round, item (d): M5's `:0` guard (wrap71.py) fails closed when a decoy bus cannot bind. The
// arm64 pilot's `:0` steps under out-zero-r1 put the session decoy at a 109-byte path; its bind failed with "AF_UNIX
// path too long" in a thread of its own, and the guard ran the step on without it. Every decoy path's length is now
// checked first (at most 107 bytes: sun_path's 108 less a client's NUL), and each decoy is bound before the step starts;
// a decoy that cannot be had refuses the step before anything runs, recorded in flags.jsonl and wrap-summary.json.
//
// Display-free: the guard runs in private mode around a command that only writes a marker file.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

const WRAP71 = new URL('../../docs/evidence/2026-10-28-own-linux-engine/m5/guards/wrap71.py', import.meta.url).pathname;
const linux = process.platform === 'linux';
const scratch = mkdtempSync(join(tmpdir(), 'cua171-decoys-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;

/** wrap71.py in private mode around a command that writes `ran`, its out directory padded so the session decoy's path is `bytes` long. */
function guard({ bytes = null, prepare = () => {} } = {}) {
  const base = join(scratch, `g${n++}`);
  mkdirSync(join(base, 'tmp'), { recursive: true });
  const tail = '/decoy/session.sock';
  const out = bytes ? `${base}/${'o'.repeat(bytes - base.length - 1 - tail.length)}` : join(base, 'out');
  prepare(out);
  const marker = join(base, 'ran');
  const run = spawnSync('python3', ['-I', WRAP71, out, join(base, 'tmp'), 'private', 'touch', marker], { encoding: 'utf8', timeout: 60000 });
  const read = (name) => (existsSync(join(out, name)) ? readFileSync(join(out, name), 'utf8') : null);
  return { run, out, ran: existsSync(marker), flags: (read('flags.jsonl') ?? '').split('\n').filter(Boolean).map((l) => JSON.parse(l)), summary: JSON.parse(read('wrap-summary.json') ?? 'null') };
}

describe("wrap71's decoys fail closed (M5's T4, arm64 round, item (d))", { skip: !linux && 'Linux only (/proc, the subreaper)' }, () => {
  it('runs the step with both decoys bound when their paths fit', () => {
    const g = guard({ bytes: 107 });
    assert.equal(g.run.status, 0, g.run.stderr);
    assert.equal(g.ran, true);
    assert.deepEqual(g.summary.flags, []);
  });

  it('refuses the step before it starts when a decoy path is too long, recorded', () => {
    const g = guard({ bytes: 108 });
    assert.notEqual(g.run.status, 0);
    assert.equal(g.ran, false, 'the guarded command never ran');
    assert.match(g.run.stderr, /decoy .*session\.sock is 108 bytes/);
    assert.deepEqual(g.flags.map((f) => [f.kind, f.decoy]), [['decoy-refused', 'session']]);
    assert.equal(g.summary.refused, g.flags[0].why);
    assert.equal(g.summary.exit, null);
  });

  it('refuses the step before it starts when a decoy cannot bind, recorded', () => {
    // something at the decoy's path that is not a socket the guard may replace
    const g = guard({ prepare: (out) => mkdirSync(join(out, 'decoy', 'a11y.sock'), { recursive: true }) });
    assert.notEqual(g.run.status, 0);
    assert.equal(g.ran, false, 'the guarded command never ran');
    assert.deepEqual(g.flags.map((f) => [f.kind, f.decoy]), [['decoy-refused', 'a11y']]);
    assert.match(g.flags[0].why, /could not be bound/);
  });

  // fix wave 1: the decoy directory itself is part of the recorded refusal, never a traceback
  it('refuses the step before it starts when the decoy directory cannot be made, recorded', () => {
    const g = guard({ prepare: (out) => { mkdirSync(out, { recursive: true }); writeFileSync(join(out, 'decoy'), 'not a directory'); } });
    assert.notEqual(g.run.status, 0);
    assert.equal(g.ran, false, 'the guarded command never ran');
    assert.doesNotMatch(g.run.stderr, /Traceback/);
    assert.deepEqual(g.flags.map((f) => [f.kind, f.decoy]), [['decoy-refused', 'session']]);
    assert.match(g.flags[0].why, /decoy directory .* could not be made/);
    assert.equal(g.summary.refused, g.flags[0].why);
  });
});
