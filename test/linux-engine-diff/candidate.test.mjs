// #267: a verdict run's cua candidate. A gate takes only the release workflow's attested musl artifact of the checked-out
// commit, stored by the harness as `cua-engine` (mode 0700); `--dev` takes any build and labels its verdict. Display-free:
// the ELF files are built here, and git, gh and the candidate's `--version` are a fake `run`.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { after, test } from 'node:test';

import { CandidateRefused, elfTarget, prepareCandidate } from '../../scripts/linux-engine-diff/candidate.mjs';
import { parseArgs } from '../../scripts/linux-engine-diff/cli.mjs';
import { renderSummary } from '../../scripts/linux-engine-diff/report.mjs';

const PT_DYNAMIC = 2;
const PT_INTERP = 3;
const PT_NOTE = 4;

/** An ELF note: its name, type and descriptor, each padded to 4 bytes. */
function note(name, type, desc) {
  const pad = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) % 4)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(name.length + 1, 0);
  head.writeUInt32LE(desc.length, 4);
  head.writeUInt32LE(type, 8);
  return Buffer.concat([head, pad(Buffer.from(`${name}\0`, 'latin1')), pad(desc)]);
}

/** A 64-bit little-endian ELF file with these program segments (enough of one for the reader). */
function elf({ type = 3, machine = 62, segments = [] }) {
  const phoff = 64;
  const phentsize = 56;
  const header = Buffer.alloc(phoff + phentsize * segments.length);
  header.write('\x7fELF', 0, 'latin1');
  header[4] = 2; // 64-bit
  header[5] = 1; // little-endian
  header[6] = 1;
  header.writeUInt16LE(type, 16);
  header.writeUInt16LE(machine, 18);
  header.writeUInt32LE(1, 20);
  header.writeBigUInt64LE(BigInt(phoff), 32);
  header.writeUInt16LE(64, 52);
  header.writeUInt16LE(phentsize, 54);
  header.writeUInt16LE(segments.length, 56);
  let offset = header.length;
  segments.forEach((s, i) => {
    const at = phoff + i * phentsize;
    header.writeUInt32LE(s.type, at);
    header.writeBigUInt64LE(BigInt(offset), at + 8);
    header.writeBigUInt64LE(BigInt(s.data.length), at + 32);
    offset += s.data.length;
  });
  return Buffer.concat([header, ...segments.map((s) => s.data)]);
}

const BUILD_ID = { type: PT_NOTE, data: note('GNU', 3, Buffer.from('90faf1ec54b9383c7a60e490d747c5b3f2dce639', 'hex')) };
/** The release workflow's build: x86_64 musl, static-pie (a PIE with no interpreter, no GNU ABI tag). */
const MUSL = elf({ segments: [{ type: PT_DYNAMIC, data: Buffer.alloc(32) }, BUILD_ID] });
/** A VM build for the host's default target: x86_64 gnu, dynamic, glibc's interpreter and ABI tag. */
const GNU = elf({
  segments: [
    { type: PT_INTERP, data: Buffer.from('/lib64/ld-linux-x86-64.so.2\0', 'latin1') },
    { type: PT_NOTE, data: note('GNU', 1, Buffer.from([0, 0, 0, 0, 3, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0])) },
    { type: PT_DYNAMIC, data: Buffer.alloc(32) },
  ],
});
/** glibc linked statically: no interpreter, but glibc's ABI tag. */
const GNU_STATIC = elf({ type: 2, segments: [{ type: PT_NOTE, data: note('GNU', 1, Buffer.alloc(16)) }] });

const HEAD = 'cd4c929758caf90329fd5cfb0d5028f1ec1c92c2';
const OTHER = '9d3fdce6b10f31d5347b322bf4038c2ab63e781c';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

const scratch = mkdtempSync(join(tmpdir(), 'cua171-candidate-test-'));
after(() => rmSync(scratch, { recursive: true, force: true }));
let n = 0;
/** The candidate as a download leaves it, in a directory of its own: a file without its executable bit. */
function file(bytes) {
  const dir = join(scratch, `download-${n++}`);
  mkdirSync(dir);
  const path = join(dir, 'cua-engine-0.3.0-linux-x64');
  writeFileSync(path, bytes);
  chmodSync(path, 0o644);
  return path;
}

/** The JSON `gh attestation verify --format json` prints: one verified attestation of these subjects, from `commit`. */
function attestationJson(subjects, commit, run = 41350086196) {
  return JSON.stringify([
    {
      attestation: { bundle: {} },
      verificationResult: {
        statement: {
          predicateType: 'https://slsa.dev/provenance/v1',
          subject: subjects.map(([name, digest]) => ({ name, digest: { sha256: digest } })),
        },
        signature: {
          certificate: {
            buildSignerURI: 'https://github.com/SSFSKIM/cua/.github/workflows/linux-engine.yml@refs/heads/feat/171-m3',
            sourceRepositoryDigest: commit,
            sourceRepositoryRef: 'refs/heads/feat/171-m3',
            runInvocationURI: `https://github.com/SSFSKIM/cua/actions/runs/${run}/attempts/1`,
            runnerEnvironment: 'github-hosted',
          },
        },
      },
    },
  ]);
}

/**
 * A fake `run(command, args)`: git answers `head` and `status`, gh answers `gh`, the stored candidate answers `version`.
 * Every call is recorded in `calls`.
 */
function fake({ head = HEAD, status = '', gh = null, version = `cua-engine 0.3.0 (${HEAD.slice(0, 12)})` } = {}) {
  const calls = [];
  const run = (command, args) => {
    calls.push([command, ...args]);
    if (command === 'git' && args.includes('rev-parse')) return { status: 0, stdout: `${head}\n`, stderr: '' };
    if (command === 'git' && args.includes('status')) return { status: 0, stdout: status, stderr: '' };
    if (command === 'gh') return typeof gh === 'function' ? gh(args) : (gh ?? { status: 1, stdout: '', stderr: 'no attestations found' });
    if (basename(command) === 'cua-engine' && args[0] === '--version') return { status: 0, stdout: `${version}\n`, stderr: '' };
    return { status: 127, stdout: '', stderr: `unexpected ${command}` };
  };
  return { run, calls };
}

/** gh verifying `bytes`'s own digest, built from `commit`. */
const attested = (bytes, commit = HEAD) => ({ status: 0, stdout: attestationJson([['cua-engine-0.3.0-linux-x64', sha(bytes)], ['cua-engine-0.3.0-linux-arm64', '57e699b4'.padEnd(64, '0')]], commit), stderr: '' });

const refusal = (fn, pattern) => {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof CandidateRefused, `a refusal, not ${error}`);
    assert.match(error.message, pattern);
    return true;
  });
};

// ---------------------------------------------------------------------------------------------------------------
// the ELF reader

test('the ELF reader names the target and linkage: musl static-pie, gnu dynamic, gnu static', () => {
  assert.deepEqual(elfTarget(MUSL), { arch: 'x86_64', libc: 'musl', linkage: 'static-pie', interpreter: null, target: 'x86_64-unknown-linux-musl' });
  assert.deepEqual(elfTarget(GNU), { arch: 'x86_64', libc: 'gnu', linkage: 'dynamic', interpreter: '/lib64/ld-linux-x86-64.so.2', target: 'x86_64-unknown-linux-gnu' });
  assert.equal(elfTarget(GNU_STATIC).target, 'x86_64-unknown-linux-gnu');
  assert.equal(elfTarget(GNU_STATIC).linkage, 'static');
  assert.equal(elfTarget(elf({ machine: 183, segments: [{ type: PT_DYNAMIC, data: Buffer.alloc(8) }] })).target, 'aarch64-unknown-linux-musl');
  assert.equal(elfTarget(Buffer.from('#!/bin/sh\n')), null);
});

// ---------------------------------------------------------------------------------------------------------------
// a gate's candidate

test('a gate refuses a gnu build, saying it is not the shipped musl static-pie, before asking gh', () => {
  const { run, calls } = fake({ gh: attested(GNU) });
  refusal(() => prepareCandidate({ source: file(GNU), gate: true, root: '/repo', run, hostArch: 'x64' }), /x86_64-unknown-linux-gnu.*dynamic.*the release ships the workflow's x86_64-unknown-linux-musl static-pie/s);
  assert.equal(calls.filter(([c]) => c === 'gh').length, 0);
  const statics = fake({ gh: attested(GNU_STATIC) });
  refusal(() => prepareCandidate({ source: file(GNU_STATIC), gate: true, root: '/repo', run: statics.run, hostArch: 'x64' }), /x86_64-unknown-linux-gnu/);
});

test('a gate refuses a file that is not an ELF, and a build for another architecture', () => {
  refusal(() => prepareCandidate({ source: file(Buffer.from('#!/bin/sh\necho hi\n')), gate: true, root: '/repo', run: fake().run, hostArch: 'x64' }), /not an ELF/);
  const arm = elf({ machine: 183, segments: [{ type: PT_DYNAMIC, data: Buffer.alloc(8) }] });
  refusal(() => prepareCandidate({ source: file(arm), gate: true, root: '/repo', run: fake({ gh: attested(arm) }).run, hostArch: 'x64' }), /aarch64-unknown-linux-musl.*this host runs x86_64/);
});

test('a gate refuses an unattested file, with gh\'s reason', () => {
  const { run, calls } = fake({ gh: { status: 1, stdout: '', stderr: 'Error: failed to fetch attestations: HTTP 404: Not Found\n' } });
  refusal(() => prepareCandidate({ source: file(MUSL), gate: true, root: '/repo', run, hostArch: 'x64' }), /unattested.*no attestation of \.github\/workflows\/linux-engine\.yml.*HTTP 404/s);
  const verify = calls.find(([c]) => c === 'gh');
  assert.deepEqual(verify.slice(1, 3), ['attestation', 'verify']);
  for (const flag of ['--repo', '--signer-workflow', '--deny-self-hosted-runners', '--format']) assert.ok(verify.includes(flag), `gh is asked with ${flag}`);
  assert.equal(verify[verify.indexOf('--format') + 1], 'json');
  assert.equal(verify[verify.indexOf('--signer-workflow') + 1], 'SSFSKIM/cua/.github/workflows/linux-engine.yml');
  assert.equal(basename(verify[3]), 'cua-engine', 'gh verifies the stored copy, the bytes the run starts');
});

test('a gate refuses a candidate whose digest no verified attestation names', () => {
  const other = elf({ segments: [{ type: PT_DYNAMIC, data: Buffer.alloc(40) }] });
  const { run } = fake({ gh: attested(other) });
  refusal(() => prepareCandidate({ source: file(MUSL), gate: true, root: '/repo', run, hostArch: 'x64' }), new RegExp(`digest mismatch.*${sha(MUSL)}.*${sha(other)}`, 's'));
  // gh's answer unreadable is no verification either
  refusal(() => prepareCandidate({ source: file(MUSL), gate: true, root: '/repo', run: fake({ gh: { status: 0, stdout: 'not json', stderr: '' } }).run, hostArch: 'x64' }), /unreadable/);
});

test('a gate refuses a candidate built from another commit than the checkout\'s', () => {
  const { run } = fake({ head: OTHER, gh: attested(MUSL, HEAD), version: `cua-engine 0.3.0 (${HEAD.slice(0, 12)})` });
  refusal(() => prepareCandidate({ source: file(MUSL), gate: true, root: '/repo', run, hostArch: 'x64' }), new RegExp(`commit mismatch.*built from ${HEAD}.*checkout is at ${OTHER}`, 's'));
});

test('a gate refuses a candidate whose --version names another commit', () => {
  const { run } = fake({ gh: attested(MUSL), version: `cua-engine 0.3.0 (${OTHER.slice(0, 12)})` });
  refusal(() => prepareCandidate({ source: file(MUSL), gate: true, root: '/repo', run, hostArch: 'x64' }), /--version.*9d3fdce6b10f/s);
});

test('a gate refuses a checkout that is not clean, naming what changed', () => {
  const { run, calls } = fake({ status: ' M scripts/linux-engine-diff/run.mjs\n?? notes.txt\n', gh: attested(MUSL) });
  refusal(() => prepareCandidate({ source: file(MUSL), gate: true, root: '/repo', run, hostArch: 'x64' }), /not clean.*2 changes.*run\.mjs.*notes\.txt/s);
  assert.equal(calls.filter(([c]) => c === 'gh').length, 0);
});

test('a refused candidate leaves no stored copy behind', () => {
  const { run } = fake();
  let dir;
  try {
    prepareCandidate({ source: file(MUSL), gate: true, root: '/repo', run, hostArch: 'x64' });
  } catch (error) {
    dir = error.dir;
  }
  assert.ok(dir, 'the refusal names the directory it made');
  assert.equal(existsSync(dir), false);
});

test('a gate accepts the attested artifact of the checkout\'s commit: stored as cua-engine, mode 0700, every fact recorded', () => {
  const source = file(MUSL);
  assert.equal(statSync(source).mode & 0o111, 0, 'a download has lost its executable bit');
  const { run } = fake({ gh: attested(MUSL) });
  const candidate = prepareCandidate({ source, gate: true, root: '/repo', run, hostArch: 'x64' });
  try {
    assert.equal(basename(candidate.path), 'cua-engine');
    assert.equal(statSync(candidate.path).mode & 0o777, 0o700);
    assert.notEqual(candidate.path, source);
    const r = candidate.record;
    assert.equal(r.gate, true);
    assert.equal(r.sha256, sha(MUSL));
    assert.equal(r.target, 'x86_64-unknown-linux-musl');
    assert.equal(r.linkage, 'static-pie');
    assert.equal(r.version, 'cua-engine 0.3.0 (cd4c929758ca)');
    assert.equal(r.commit, HEAD);
    assert.equal(r.clean, true);
    assert.deepEqual(r.attestation, {
      verified: true,
      signer_workflow: 'SSFSKIM/cua/.github/workflows/linux-engine.yml',
      attestations: [
        {
          subjects: [
            { name: 'cua-engine-0.3.0-linux-x64', sha256: sha(MUSL) },
            { name: 'cua-engine-0.3.0-linux-arm64', sha256: '57e699b4'.padEnd(64, '0') },
          ],
          predicate: 'https://slsa.dev/provenance/v1',
          source_commit: HEAD,
          source_ref: 'refs/heads/feat/171-m3',
          signer: 'https://github.com/SSFSKIM/cua/.github/workflows/linux-engine.yml@refs/heads/feat/171-m3',
          run: 'https://github.com/SSFSKIM/cua/actions/runs/41350086196/attempts/1',
          runner: 'github-hosted',
        },
      ],
    });
  } finally {
    rmSync(candidate.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------------------------
// a development run

test('a dev run takes a gnu build from a dirty checkout, records it, and asks gh nothing', () => {
  const { run, calls } = fake({ status: ' M x\n', version: 'cua-engine 0.3.0 (9d3fdce6b10f)', head: OTHER });
  const candidate = prepareCandidate({ source: file(GNU), gate: false, root: '/repo', run, hostArch: 'x64' });
  try {
    assert.equal(statSync(candidate.path).mode & 0o777, 0o700);
    const r = candidate.record;
    assert.equal(r.gate, false);
    assert.equal(r.target, 'x86_64-unknown-linux-gnu');
    assert.equal(r.linkage, 'dynamic');
    assert.equal(r.commit, OTHER);
    assert.equal(r.clean, false);
    assert.equal(r.attestation, null);
    assert.equal(calls.filter(([c]) => c === 'gh').length, 0);
  } finally {
    rmSync(candidate.dir, { recursive: true, force: true });
  }
});

test('--dev is the verdict run\'s flag; experiments take no gate', () => {
  const run = ['--vendor', '/v', '--newest', '/n', '--cua', '/c', '--scene', 'gedit', '--ops', 'all', '--out', 'o'];
  assert.equal(parseArgs(run).dev, undefined);
  assert.equal(parseArgs([...run, '--dev']).dev, true);
  assert.throws(() => parseArgs(['--experiment', 'drag', '--vendor', '/v', '--cua', '/c', '--out', 'o', '--dev']), /--dev/);
});

test('a dev run\'s summary and verdict say it is not a release gate; a gate run\'s name its verified candidate', () => {
  const candidate = { gate: false, sha256: sha(GNU), target: 'x86_64-unknown-linux-gnu', linkage: 'dynamic', version: 'cua-engine 0.3.0 (9d3fdce6b10f)', commit: OTHER, clean: false, attestation: null };
  const meta = { kind: 'meta', commit: OTHER, cua_version: candidate.version, occlusion: 'covered', blocks: 1, samples_tree: 1, samples_input: 1, engines: [] };
  const end = { kind: 'end', valid: true, pass: true, failed: [], parity: [], refused: [], finished: 'now' };
  const dev = renderSummary([{ run: 'd', ...meta, gate: false, candidate }, { run: 'd', ...end, gate: false }]);
  assert.match(dev, /^## d \(development run, not a release gate\)$/m);
  assert.match(dev, /run valid; development run, not a release gate: every verdict PASS/);
  assert.match(dev, new RegExp(`candidate: sha256 ${sha(GNU)}, x86_64-unknown-linux-gnu dynamic, cua-engine 0\\.3\\.0 \\(9d3fdce6b10f\\); attestation not checked \\(a development run\\); checkout not clean`));

  const attestation = { verified: true, signer_workflow: 'SSFSKIM/cua/.github/workflows/linux-engine.yml', attestations: [{ source_commit: HEAD, source_ref: 'refs/heads/feat/171-m3', run: 'https://github.com/SSFSKIM/cua/actions/runs/41350086196/attempts/1', subjects: [], runner: 'github-hosted' }] };
  const gated = { ...candidate, gate: true, target: 'x86_64-unknown-linux-musl', linkage: 'static-pie', sha256: sha(MUSL), commit: HEAD, clean: true, attestation };
  const gate = renderSummary([{ run: 'g', ...meta, gate: true, candidate: gated }, { run: 'g', ...end, gate: true }]);
  assert.match(gate, /^## g$/m);
  assert.doesNotMatch(gate, /not a release gate/);
  assert.match(gate, /attestation verified: \.github\/workflows\/linux-engine\.yml run https:\/\/github\.com\/SSFSKIM\/cua\/actions\/runs\/41350086196\/attempts\/1, built from cd4c929758caf90329fd5cfb0d5028f1ec1c92c2 \(refs\/heads\/feat\/171-m3\) on a github-hosted runner/);
  assert.match(gate, /run valid; every verdict PASS/);
});
