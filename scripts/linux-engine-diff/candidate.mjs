// A verdict run's cua candidate (#267; Decision Log 2026-11-01, "the gate judges the bytes that ship"). A gate judges
// only the bytes a release ships: the release workflow's (.github/workflows/linux-engine.yml) attested static musl
// artifact of the commit the checkout is at, the checkout clean. A musl build made the way the workflow makes it is the
// same bytes (its build is reproducible), so the same attestation verifies it. Anything else is refused, with the
// reason; `--dev` takes any build, and its verdict says it is not a release gate.
//
// The harness stores the candidate itself, as `cua-engine` with mode 0700 in a directory its caller owns (a downloaded
// artifact has lost its executable bit), and every check reads that copy: the bytes checked are the bytes the run
// starts. A gate runs the candidate (its `--version`) only once it is attested; a dev run runs it unchecked. The record (the run's `meta.candidate`): the copy's sha256, its target and linkage read from the ELF file,
// its `--version`, the checkout's commit and whether it is clean, and what `gh attestation verify --format json`
// verified (gh's plain output prints nothing when it is not on a terminal). An experiment that joins the gate (`--gate`,
// M4's T18) takes its candidate through the same preparation (experiments.mjs `runExperiment`).

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { chmodSync, copyFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = 'SSFSKIM/cua';
export const WORKFLOW = '.github/workflows/linux-engine.yml';
export const SIGNER_WORKFLOW = `${REPO}/${WORKFLOW}`;
/** The checkout the harness runs from: the commit a gate's candidate must be built from. */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** The checks stopped by the run's stop (stop.mjs): the command in flight was killed and has ended. */
export class PreparationStopped extends Error {
  constructor(message = 'the candidate\'s checks were stopped') {
    super(message);
    this.name = 'PreparationStopped';
  }
}

/** A candidate a gate does not take. */
export class CandidateRefused extends Error {
  constructor(message) {
    super(message);
    this.name = 'CandidateRefused';
  }
}

const ARCHES = { 62: 'x86_64', 183: 'aarch64' };
const HOST_ARCHES = { x64: 'x86_64', arm64: 'aarch64' };
const PT_INTERP = 3;
const PT_NOTE = 4;
const NT_GNU_ABI_TAG = 1;

/** Whether a note segment carries glibc's ABI tag (a `GNU` note of type 1), which musl's startup files never add. */
function hasGnuAbiTag(bytes, offset, size) {
  let at = offset;
  const end = offset + size;
  while (at + 12 <= end) {
    const namesz = bytes.readUInt32LE(at);
    const descsz = bytes.readUInt32LE(at + 4);
    const type = bytes.readUInt32LE(at + 8);
    const name = bytes.toString('latin1', at + 12, at + 12 + namesz).replace(/\0+$/, '');
    if (name === 'GNU' && type === NT_GNU_ABI_TAG) return true;
    at += 12 + Math.ceil(namesz / 4) * 4 + Math.ceil(descsz / 4) * 4;
  }
  return false;
}

/**
 * The target a 64-bit little-endian ELF file was built for, from its program headers: `{arch, libc, linkage,
 * interpreter, target}`, or null for any other file. The libc is gnu when the interpreter is glibc's or a note carries
 * glibc's ABI tag, else musl; the linkage is `dynamic` with an interpreter, else `static-pie` (a position-independent
 * executable) or `static`.
 */
export function elfTarget(bytes) {
  if (bytes.length < 64 || bytes.toString('latin1', 0, 4) !== '\x7fELF' || bytes[4] !== 2 || bytes[5] !== 1) return null;
  const type = bytes.readUInt16LE(16);
  const machine = bytes.readUInt16LE(18);
  const phoff = Number(bytes.readBigUInt64LE(32));
  const phentsize = bytes.readUInt16LE(54);
  const phnum = bytes.readUInt16LE(56);
  let interpreter = null;
  let gnuTag = false;
  for (let i = 0; i < phnum; i++) {
    const at = phoff + i * phentsize;
    if (at + 40 > bytes.length) return null;
    const segment = bytes.readUInt32LE(at);
    const offset = Number(bytes.readBigUInt64LE(at + 8));
    const size = Number(bytes.readBigUInt64LE(at + 32));
    if (offset + size > bytes.length) return null;
    if (segment === PT_INTERP) interpreter = bytes.toString('latin1', offset, offset + size).replace(/\0+$/, '');
    if (segment === PT_NOTE) gnuTag ||= hasGnuAbiTag(bytes, offset, size);
  }
  const arch = ARCHES[machine] ?? `machine-${machine}`;
  const libc = interpreter ? (interpreter.includes('ld-musl') ? 'musl' : 'gnu') : gnuTag ? 'gnu' : 'musl';
  const linkage = interpreter ? 'dynamic' : type === 3 ? 'static-pie' : 'static';
  return { arch, libc, linkage, interpreter, target: `${arch}-unknown-linux-${libc}` };
}

/** What one verified attestation says: its subjects, and the workflow run and commit that built them. */
function attestationRecord(entry) {
  const { statement, signature } = entry.verificationResult;
  const cert = signature?.certificate ?? {};
  return {
    subjects: (statement?.subject ?? []).map((s) => ({ name: s.name, sha256: s.digest?.sha256 })),
    predicate: statement?.predicateType,
    source_commit: cert.sourceRepositoryDigest,
    source_ref: cert.sourceRepositoryRef,
    signer: cert.buildSignerURI,
    run: cert.runInvocationURI,
    runner: cert.runnerEnvironment,
  };
}

/** The release workflow's attestations of `path` that gh verified, read from its JSON; a refusal reason when none. */
async function verifyAttestation(path, run) {
  const verified = await run('gh', ['attestation', 'verify', path, '--repo', REPO, '--signer-workflow', SIGNER_WORKFLOW, '--deny-self-hosted-runners', '--format', 'json']);
  if (verified.status !== 0) {
    const why = (verified.stderr || verified.stdout || '').trim().split('\n').filter(Boolean).slice(-2).join(' ');
    return { refused: `unattested: gh found no attestation of ${WORKFLOW} (on a GitHub-hosted runner) that verifies it (${why || `exit ${verified.status}`})` };
  }
  try {
    const entries = JSON.parse(verified.stdout);
    if (!Array.isArray(entries) || entries.length === 0) throw new Error('no attestation listed');
    return { attestations: entries.map(attestationRecord) };
  } catch (error) {
    return { refused: `unattested: gh's verification answer is unreadable (${error.message})` };
  }
}

const first = (result) => (result.status === 0 ? result.stdout.trim() : null);

/**
 * Stores `source` as `<dir>/cua-engine`, mode 0700, and checks it: `{path, record}`. `dir` is the caller's, made empty
 * before and removed by it whatever happens, so a stop during the checks (which run git, gh and the candidate) leaves
 * nothing behind. A gate (`gate` true) refuses, with a `CandidateRefused` naming the reason, in this order: a file that
 * is not a static musl ELF for this host; a checkout at no commit or not clean; a file no attestation of the release
 * workflow verifies; one whose sha256 the verified attestations do not name; one built from another commit than the
 * checkout's; and only then, the candidate run for the first time, one whose `--version` does not name that commit. A
 * dev run refuses nothing, asks gh nothing, and runs the candidate's `--version` unchecked. `run(command, args)`
 * answers `{status, stdout, stderr}` (or a promise of it); the tests pass a fake git, gh and engine. `signal`, an
 * AbortSignal, stops the checks: the command in flight is killed (SIGKILL) and reaped, and the promise rejects with a
 * `PreparationStopped`, never an ordinary command result.
 */
export async function prepareCandidate({ source, gate, dir, signal, root = REPO_ROOT, hostArch = process.arch, run: runWith = runCommand }) {
  // the run's stop ends the checks: a command in flight is killed and waited for, and none starts after it
  const run = (command, args) => {
    if (signal?.aborted) throw new PreparationStopped();
    return runWith(command, args, { signal });
  };
  const refuse = (why) => {
    throw new CandidateRefused(`${why}${gate ? '. A gate takes the release workflow\'s attested artifact of the checked-out commit (scripts/linux-engine-diff/README.md, "The candidate"); --dev runs any build, not as a release gate' : ''}`);
  };
  const path = join(dir, 'cua-engine');
  try {
    copyFileSync(source, path);
    chmodSync(path, 0o700);
  } catch (error) {
    refuse(`the candidate ${source} could not be stored: ${error.message}`);
  }
  const bytes = readFileSync(path);
  const elf = elfTarget(bytes);
  const commit = first(await run('git', ['-C', root, 'rev-parse', 'HEAD']));
  const status = await run('git', ['-C', root, 'status', '--porcelain']);
  const changes = status.status === 0 ? status.stdout.split('\n').filter(Boolean) : null;
  const record = {
    gate,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    target: elf?.target ?? null,
    linkage: elf?.linkage ?? null,
    version: null,
    commit,
    clean: changes ? changes.length === 0 : null,
    attestation: null,
  };
  if (!gate) {
    record.version = first(await run(path, ['--version']));
    return { path, record };
  }

  const host = HOST_ARCHES[hostArch] ?? hostArch;
  if (!elf) refuse('the candidate is not an ELF file');
  if (elf.libc !== 'musl' || elf.linkage === 'dynamic') {
    refuse(`the candidate is built for ${elf.target} (${elf.linkage}${elf.interpreter ? `, interpreter ${elf.interpreter}` : ''}): the release ships the workflow's ${host}-unknown-linux-musl static-pie`);
  }
  if (elf.arch !== host) refuse(`the candidate is built for ${elf.target}, and this host runs ${host}`);
  if (!commit) refuse(`the checkout's commit could not be read (git -C ${root} rev-parse HEAD)`);
  if (!changes) refuse(`the checkout's state could not be read (git -C ${root} status): ${status.stderr.trim()}`);
  if (changes.length) {
    const named = changes.slice(0, 5).map((l) => l.slice(3)).join(', ');
    refuse(`the checkout is not clean (${changes.length} changes: ${named}${changes.length > 5 ? ', …' : ''}): a gate judges a committed checkout`);
  }
  const verified = await verifyAttestation(path, run);
  if (verified.refused) refuse(verified.refused);
  const mine = verified.attestations.filter((a) => a.subjects.some((s) => s.sha256 === record.sha256));
  if (mine.length === 0) {
    const named = verified.attestations.flatMap((a) => a.subjects.map((s) => `${s.name} ${s.sha256}`)).join(', ');
    refuse(`digest mismatch: the candidate's sha256 is ${record.sha256}, and the verified attestations name ${named}`);
  }
  if (!mine.some((a) => a.source_commit === commit)) {
    refuse(`commit mismatch: the candidate was built from ${[...new Set(mine.map((a) => a.source_commit))].join(', ')}, and the checkout is at ${commit}`);
  }
  // attested: the release workflow built these bytes from this commit, so the candidate may now be run
  record.version = first(await run(path, ['--version']));
  const named = /^cua-engine \S+ \(([0-9a-f]{12})\)$/.exec(record.version ?? '')?.[1];
  if (!named || !commit.startsWith(named)) refuse(`the candidate's --version answers ${JSON.stringify(record.version)}, which does not name the checkout's commit ${commit.slice(0, 12)}`);
  record.attestation = { verified: true, signer_workflow: SIGNER_WORKFLOW, attestations: mine };
  return { path, record };
}

/**
 * How a run's artifacts are labelled: a gate's "release gate", a dev run's that it is not one (the design session's
 * condition for T18: every artifact a gate step writes carries one or the other, and the M4 pull request cites only those
 * labelled a release gate); a run from before #267, which recorded neither, nothing.
 */
export const RELEASE_GATE = 'release gate';
export const DEVELOPMENT_RUN = 'development run, not a release gate';
export const gateLabel = (gate) => (gate === true ? RELEASE_GATE : gate === false ? DEVELOPMENT_RUN : null);

/** The candidate in one line of the summary: its sha256, target, version, and its attestation or why there is none. */
export function candidateLine(c) {
  const built = `sha256 ${c.sha256}, ${c.target ?? 'not an ELF file'}${c.linkage ? ` ${c.linkage}` : ''}, ${c.version ?? 'no --version answer'}`;
  if (!c.attestation) return `candidate: ${built}; attestation not checked (a development run)${c.clean === false ? '; checkout not clean' : ''}`;
  const proofs = c.attestation.attestations.map((a) => `${WORKFLOW} run ${a.run}, built from ${a.source_commit} (${a.source_ref}) on a ${a.runner} runner`);
  return `candidate: ${built}; attestation verified: ${proofs.join('; ')}`;
}

/**
 * A command's `{status, stdout, stderr}`, without blocking the event loop, so a stop (stop.mjs) is handled while it
 * runs. `signal` aborted kills it with SIGKILL (a command may ignore SIGTERM) and rejects with `PreparationStopped` once
 * it has ended; so does the 60 s timeout's kill, as an ordinary failed result.
 */
function runCommand(command, args, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, killSignal: 'SIGKILL', signal });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d) => (stderr += d));
    // an abort's error comes before the killed command has ended: its close settles the promise
    child.once('error', (error) => {
      if (error.name !== 'AbortError') resolve({ status: -1, stdout: '', stderr: error.message });
    });
    child.once('close', (code, killed) => {
      if (signal?.aborted) reject(new PreparationStopped());
      else resolve({ status: code ?? -1, stdout, stderr: killed ? `${stderr}killed by ${killed}` : stderr });
    });
  });
}
