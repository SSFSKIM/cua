// M4's T18: an experiment that joins the gate (`--gate`) takes its candidate through candidate.mjs's preparation, as a
// verdict run does, and every experiment run is labelled in its artifacts: "release gate" with `--gate`, "development
// run, not a release gate" without (the design session's condition: every artifact a gate step writes carries one or the
// other). Display-free: the harness's entry runs with a fake git and gh first on PATH, and the labels are read from an
// experiment whose body is the test's.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { runExperiment } from '../../scripts/linux-engine-diff/experiments.mjs';
import { writeSummary } from '../../scripts/linux-engine-diff/report.mjs';

const ENTRY = fileURLToPath(new URL('../../scripts/linux-engine-diff.mjs', import.meta.url));
const HEAD = 'cd4c929758caf90329fd5cfb0d5028f1ec1c92c2';
const OTHER = '9d3fdce6b10f31d5347b322bf4038c2ab63e781c';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

const scratch = mkdtempSync(join(tmpdir(), 'cua171-expgate-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
const fresh = (name) => {
  const dir = join(scratch, `${name}-${n++}`);
  mkdirSync(dir);
  return dir;
};

/** A 64-bit ELF header for this host's machine with these program segments: enough of one for candidate.mjs's reader. */
function elf(segments = []) {
  const header = Buffer.alloc(64 + 56 * segments.length);
  header.write('\x7fELF', 0, 'latin1');
  header[4] = 2;
  header[5] = 1;
  header[6] = 1;
  header.writeUInt16LE(3, 16); // a position-independent executable
  header.writeUInt16LE(process.arch === 'arm64' ? 183 : 62, 18); // the host's machine (x86_64 or aarch64): the arch check passes
  header.writeBigUInt64LE(64n, 32);
  header.writeUInt16LE(56, 54);
  header.writeUInt16LE(segments.length, 56);
  let offset = header.length;
  segments.forEach((s, i) => {
    header.writeUInt32LE(s.type, 64 + i * 56);
    header.writeBigUInt64LE(BigInt(offset), 64 + i * 56 + 8);
    header.writeBigUInt64LE(BigInt(s.data.length), 64 + i * 56 + 32);
    offset += s.data.length;
  });
  return Buffer.concat([header, ...segments.map((s) => s.data)]);
}
/** The release workflow's build: static-pie musl (no interpreter, no glibc ABI tag). */
const MUSL = elf();
/** A VM build: dynamic, glibc's interpreter. */
const GNU = elf([{ type: 3, data: Buffer.from('/lib64/ld-linux-x86-64.so.2\0', 'latin1') }]);

/** The candidate as a download leaves it: a file of these bytes, not executable. */
function candidate(bytes) {
  const path = join(fresh('download'), 'cua-engine-0.4.0-linux-x64');
  writeFileSync(path, bytes);
  return path;
}

/**
 * A directory to put first on PATH: a `git` answering a clean checkout at HEAD, and a `gh` that answers `gh.json` (when
 * present, exit 0), or fails as gh does with no attestation; with `slowGh` it records its pid and blocks instead.
 */
function fakeTools({ attestationCommit = null, bytes = MUSL, slowGh = null } = {}) {
  const bin = fresh('bin');
  writeFileSync(join(bin, 'git'), `#!/bin/sh\ncase "$*" in\n  *rev-parse*) echo ${HEAD} ;;\n  *status*) ;;\n  *) exit 1 ;;\nesac\n`);
  const json = join(bin, 'gh.json');
  if (attestationCommit) {
    writeFileSync(json, JSON.stringify([{ verificationResult: { statement: { predicateType: 'https://slsa.dev/provenance/v1', subject: [{ name: 'cua-engine-0.4.0-linux-x64', digest: { sha256: sha(bytes) } }] }, signature: { certificate: { sourceRepositoryDigest: attestationCommit, sourceRepositoryRef: 'refs/heads/feat/171-m4', buildSignerURI: 'x', runInvocationURI: 'https://github.com/SSFSKIM/cua/actions/runs/1/attempts/1', runnerEnvironment: 'github-hosted' } } } }]));
  }
  const gh = slowGh
    ? `#!/bin/sh\ntrap '' TERM\necho $$ > '${slowGh}'\nexec sleep 30\n`
    : `#!/bin/sh\nif [ -f '${json}' ]; then cat '${json}'; exit 0; fi\necho 'no attestations found' >&2\nexit 1\n`;
  writeFileSync(join(bin, 'gh'), gh);
  chmodSync(join(bin, 'git'), 0o755);
  chmodSync(join(bin, 'gh'), 0o755);
  return bin;
}

/** The harness's entry with a private TMPDIR and the fake tools first on PATH: `{child, exited}`, exited `{code, signal, stderr}`. */
function entry(argv, { bin, tmp }) {
  const child = spawn(process.execPath, [ENTRY, ...argv], { env: { ...process.env, TMPDIR: tmp, PATH: `${bin}:${process.env.PATH}`, DISPLAY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
  child.stdout.resume();
  const killer = setTimeout(() => child.kill('SIGKILL'), 15000);
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal, stderr }))).finally(() => clearTimeout(killer));
  return { child, exited };
}

/** A gate drop-signals experiment, the plan the gate runs for T17's Electron cells. */
const gateArgs = (cua, out) => ['--experiment', 'drop-signals', '--family', 'electron', '--plan', 't17-fix3', '--cua', cua, '--out', out, '--run', 'gate-step', '--gate'];

const leftovers = (tmp) => readdirSync(tmp).filter((d) => d.startsWith('cua171-'));

test('--gate is the experiments\' flag; a verdict run is a gate unless --dev, and takes the gate\'s Chrome ballast', () => {
  const experiment = ['--experiment', 'drag', '--vendor', '/v', '--cua', '/c', '--out', 'o'];
  assert.equal(parseArgs(experiment).gate, undefined);
  assert.equal(parseArgs([...experiment, '--gate']).gate, true);
  const verdict = ['--vendor', '/v', '--newest', '/n', '--cua', '/c', '--scene', 'gedit', '--ops', 'all', '--out', 'o'];
  assert.throws(() => parseArgs([...verdict, '--gate']), /--gate is the experiments'/);
  assert.equal(parseArgs([...verdict, '--ballast', 'gate']).ballast, 'gate');
});

for (const [name, bytes, tools, reason] of [
  ['a gnu build', GNU, {}, /built for \w+-unknown-linux-gnu/],
  ['an unattested file', MUSL, {}, /unattested: gh found no attestation/],
  ['a candidate built from another commit', MUSL, { attestationCommit: OTHER }, /commit mismatch: the candidate was built from 9d3fdce6/],
]) {
  test(`a gate experiment refuses ${name}: exit 2, the reason named, no Desktop, no rows, the copy removed`, async () => {
    const tmp = fresh('tmp');
    const out = join(fresh('out'), 'run');
    const { exited } = entry(gateArgs(candidate(bytes), out), { bin: fakeTools({ ...tools, bytes }), tmp });
    const { code, signal, stderr } = await exited;
    assert.deepEqual({ code, signal }, { code: 2, signal: null }, stderr);
    assert.match(stderr, /^candidate refused: /m);
    assert.match(stderr, reason);
    assert.deepEqual(leftovers(tmp), [], 'no stored copy and no run scratch (no Desktop began)');
    assert.equal(existsSync(join(out, 'results.jsonl')), false, 'nothing was recorded: nothing ran');
  });
}

test('a gate experiment stopped during its candidate\'s checks kills the check in flight, removes the copy, and exits as the signal', async () => {
  const tmp = fresh('tmp');
  const marker = join(scratch, `gh-pid-${n++}`);
  const { child, exited } = entry(gateArgs(candidate(MUSL), join(fresh('out'), 'run')), { bin: fakeTools({ slowGh: marker }), tmp });
  const started = Date.now();
  while (!(existsSync(marker) && /\d/.test(readFileSync(marker, 'utf8'))) && Date.now() - started < 10000) await new Promise((r) => setTimeout(r, 20));
  const pid = Number(readFileSync(marker, 'utf8').trim());
  assert.equal(leftovers(tmp).filter((d) => d.startsWith('cua171-candidate-')).length, 1, 'the copy is stored while gh checks it');
  child.kill('SIGTERM');
  const { code, signal } = await exited;
  assert.deepEqual({ code, signal }, { code: 143, signal: null });
  let alive = true;
  try {
    process.kill(pid, 0);
  } catch {
    alive = false;
  }
  if (alive) process.kill(pid, 'SIGKILL');
  assert.equal(alive, false, 'gh, which ignores SIGTERM, did not outlive the harness');
  assert.deepEqual(leftovers(tmp), []);
});

/** runExperiment on a body of the test's (meta, then a summary, then summary.md as every experiment writes them); its stdout kept. */
async function labelled(args, options = {}) {
  let stdout = '';
  const write = process.stdout.write;
  process.stdout.write = (chunk) => {
    stdout += chunk;
    return true;
  };
  let complete;
  try {
    complete = await runExperiment(args, {
      ...options,
      start: async (runArgs, { emit }) => {
        emit({ kind: 'meta', experiment: runArgs.experiment, cua: runArgs.cua });
        emit({ kind: 'experiment-row', n: 1 });
        emit({ kind: 'experiment-summary', markdown: ['the body ran'], complete: true, failed: [] });
        writeSummary(runArgs.out);
        return true;
      },
    });
  } finally {
    process.stdout.write = write;
  }
  const rows = readFileSync(join(args.out, 'results.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { complete, stdout, rows, summary: readFileSync(join(args.out, 'summary.md'), 'utf8') };
}

test('an experiment run without --gate is labelled a development run: its meta and summary rows, summary.md, and what it prints', async () => {
  const out = join(fresh('out'), 'run');
  const { complete, stdout, rows, summary } = await labelled({ experiment: 'drag', cua: '/the/dev/build', out, run: 'dev-step', families: [] });
  assert.equal(complete, true);
  const meta = rows.find((r) => r.kind === 'meta');
  assert.equal(meta.gate, false);
  assert.equal(meta.label, 'development run, not a release gate');
  assert.equal(meta.cua, '/the/dev/build', 'a dev run takes --cua as given');
  assert.equal(meta.candidate, undefined);
  assert.equal(rows.find((r) => r.kind === 'experiment-summary').label, 'development run, not a release gate');
  assert.equal(rows.find((r) => r.kind === 'experiment-row').label, undefined, 'only the meta and summary rows carry it');
  assert.match(summary, /^## dev-step \(experiment drag; development run, not a release gate\)$/m);
  const lines = stdout.trim().split('\n');
  assert.equal(lines[0], 'development run, not a release gate');
  assert.equal(lines.at(-1), 'development run, not a release gate: dev-step complete');
});

test('a gate experiment is labelled a release gate, runs the stored copy, and records its candidate', async () => {
  const out = join(fresh('out'), 'run');
  const record = { gate: true, sha256: 'ab'.repeat(32), target: 'x86_64-unknown-linux-musl', linkage: 'static-pie', version: 'cua-engine 0.4.0 (cd4c929758ca)', commit: HEAD, clean: true, attestation: { verified: true, attestations: [{ run: 'https://github.com/SSFSKIM/cua/actions/runs/1/attempts/1', source_commit: HEAD, source_ref: 'refs/heads/feat/171-m4', runner: 'github-hosted' }] } };
  let stored = null;
  const prepare = async ({ source, gate, dir }) => {
    assert.equal(source, '/the/artifact');
    assert.equal(gate, true);
    stored = join(dir, 'cua-engine');
    writeFileSync(stored, MUSL);
    return { path: stored, record };
  };
  const { stdout, rows, summary } = await labelled({ experiment: 'drag', cua: '/the/artifact', out, run: 'gate-step', gate: true, families: [] }, { prepare });
  const meta = rows.find((r) => r.kind === 'meta');
  assert.equal(meta.label, 'release gate');
  assert.equal(meta.gate, true);
  assert.equal(meta.cua, stored, 'the run proper starts the stored copy');
  assert.deepEqual(meta.candidate, record);
  assert.equal(rows.find((r) => r.kind === 'experiment-summary').label, 'release gate');
  assert.match(summary, /^## gate-step \(experiment drag; release gate\)$/m);
  assert.match(summary, /candidate: sha256 (ab){32}, x86_64-unknown-linux-musl static-pie, cua-engine 0\.4\.0 \(cd4c929758ca\); attestation verified/);
  assert.match(stdout.split('\n')[0], /^release gate; candidate: sha256 /);
  assert.equal(existsSync(stored), false, 'the stored copy is removed when the run ends');
});

// the harness-fix wave (the whole-branch review's harness slices, 2026-11-12)

test('an experiment run name the out directory already has rows of is refused before anything runs, as a verdict run\'s is', async () => {
  const out = join(fresh('out'), 'run');
  await labelled({ experiment: 'drag', cua: '/the/dev/build', out, run: 'reused', families: [] });
  const before = readFileSync(join(out, 'results.jsonl'), 'utf8');
  let started = false;
  await assert.rejects(
    runExperiment({ experiment: 'drag', cua: '/the/artifact', out, run: 'reused', gate: true, families: [] }, { prepare: async () => assert.fail('no candidate is checked for a refused run'), start: async () => (started = true) }),
    /the run name reused already has rows in .*results\.jsonl: give each execution a --run name of its own/,
  );
  assert.equal(started, false);
  assert.equal(readFileSync(join(out, 'results.jsonl'), 'utf8'), before, 'nothing was appended');
});

test("a summary renders no experiment run whose rows mix labels or candidates: each row's provenance stands for its own execution", async () => {
  const { renderSummary } = await import('../../scripts/linux-engine-diff/report.mjs');
  const candidate = (sha) => ({ gate: true, sha256: sha, target: 'x86_64-unknown-linux-musl', linkage: 'static-pie', version: 'cua-engine 0.4.0', attestation: null });
  const meta = (gate, sha) => ({ run: 'mixed', kind: 'meta', experiment: 'drop-signals', gate, label: gate ? 'release gate' : 'development run, not a release gate', ...(sha ? { candidate: candidate(sha) } : {}) });
  const summary = (gate) => ({ run: 'mixed', kind: 'experiment-summary', markdown: [`a summary, gate ${gate}`], gate, label: gate ? 'release gate' : 'development run, not a release gate', complete: true, failed: [] });
  const labels = renderSummary([meta(false), summary(false), meta(true, 'aa'.repeat(32)), summary(true)]);
  assert.match(labels, /^## mixed \(not judged: its rows mix a release gate and a development run\)$/m);
  assert.doesNotMatch(labels, /a summary, gate/);
  const candidates = renderSummary([meta(true, 'aa'.repeat(32)), summary(true), meta(true, 'bb'.repeat(32)), summary(true)]);
  assert.match(candidates, /^## mixed \(not judged: its rows mix two or more candidates\)$/m);
  assert.doesNotMatch(candidates, /a summary, gate/);
  // one execution renders as before
  assert.match(renderSummary([meta(true, 'aa'.repeat(32)), summary(true)]), /^## mixed \(experiment drop-signals; release gate\)$/m);
});

test('a gate drop-signals run on a plan no gate judge holds is refused before anything runs: no step passes unjudged', async () => {
  const out = join(fresh('out'), 'run');
  const prepare = async ({ dir }) => {
    const path = join(dir, 'cua-engine');
    writeFileSync(path, MUSL);
    return { path, record: { gate: true, sha256: 'ab'.repeat(32) } };
  };
  await assert.rejects(runExperiment({ experiment: 'drop-signals', families: ['chrome'], plan: 'main', cua: '/the/artifact', out, run: 'unjudged', gate: true }, { prepare: async () => assert.fail('no candidate is checked for a refused run') }), /no gate judge holds the drop-signals plan main \(chrome\)/);
  assert.equal(existsSync(join(out, 'results.jsonl')), false, 'nothing ran');
  // a gate step runs its plan whole: a capped sitting may make no late take, which only the whole plan must
  await assert.rejects(runExperiment({ experiment: 'drop-signals', families: ['chrome'], plan: 't14-late', samplesTrials: 2, cua: '/the/artifact', out, run: 'capped', gate: true }, { prepare }), /runs its plan whole: --trials caps it/);
  // a development run of the same plan measures, as T13's survey always has; the gate's Chrome plans are judged
  for (const plan of ['t14', 't14-late']) {
    const judged = join(fresh('out'), 'run');
    await runExperiment({ experiment: 'drop-signals', families: ['chrome'], plan, cua: '/the/artifact', out: judged, run: `judged-${plan}`, gate: true }, { prepare, start: async () => true });
  }
});
