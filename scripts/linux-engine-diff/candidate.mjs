// A verdict run's cua candidate (#267; Decision Log 2026-11-01, "the gate judges the bytes that ship"). A gate judges
// only the bytes a release ships: the release workflow's (.github/workflows/linux-engine.yml) attested static musl
// artifact of the commit the checkout is at, the checkout clean. A musl build made the way the workflow makes it is the
// same bytes (its build is reproducible), so the same attestation verifies it. Anything else is refused, with the
// reason; `--dev` takes any build, and its verdict says it is not a release gate.
//
// The harness stores the candidate itself, as `cua-engine` with mode 0700 in a directory of its own (a downloaded
// artifact has lost its executable bit), and every check reads that copy: the bytes checked are the bytes the run
// starts. The record (the run's `meta.candidate`): the copy's sha256, its target and linkage read from the ELF file,
// its `--version`, the checkout's commit and whether it is clean, and what `gh attestation verify --format json`
// verified (gh's plain output prints nothing when it is not on a terminal).

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = 'SSFSKIM/cua';
export const WORKFLOW = '.github/workflows/linux-engine.yml';
export const SIGNER_WORKFLOW = `${REPO}/${WORKFLOW}`;
/** The checkout the harness runs from: the commit a gate's candidate must be built from. */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** A candidate a gate does not take; `dir` is the stored copy's directory, already removed. */
export class CandidateRefused extends Error {
  constructor(message, dir) {
    super(message);
    this.name = 'CandidateRefused';
    this.dir = dir;
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
function verifyAttestation(path, run) {
  const verified = run('gh', ['attestation', 'verify', path, '--repo', REPO, '--signer-workflow', SIGNER_WORKFLOW, '--deny-self-hosted-runners', '--format', 'json']);
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
 * Stores `source` as `<a fresh directory>/cua-engine`, mode 0700, and checks it: `{path, dir, record}`. A gate (`gate`
 * true) refuses, with a `CandidateRefused` naming the reason, a checkout at no commit or not clean, a file that is not
 * a static musl ELF for this host, one that no attestation of the release workflow verifies, one whose sha256 the
 * verified attestations do not name, one built from another commit than the checkout's, and one whose `--version` does
 * not name that commit. A dev run refuses nothing and asks gh nothing. `run(command, args)` returns `{status, stdout,
 * stderr}`; the tests pass a fake git, gh and engine.
 */
export function prepareCandidate({ source, gate, root = REPO_ROOT, hostArch = process.arch, run = runCommand }) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-candidate-'));
  const refuse = (why) => {
    rmSync(dir, { recursive: true, force: true });
    throw new CandidateRefused(`${why}${gate ? '. A gate takes the release workflow\'s attested artifact of the checked-out commit (scripts/linux-engine-diff/README.md, "The candidate"); --dev runs any build, not as a release gate' : ''}`, dir);
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
  const commit = first(run('git', ['-C', root, 'rev-parse', 'HEAD']));
  const status = run('git', ['-C', root, 'status', '--porcelain']);
  const changes = status.status === 0 ? status.stdout.split('\n').filter(Boolean) : null;
  const record = {
    gate,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    target: elf?.target ?? null,
    linkage: elf?.linkage ?? null,
    version: first(run(path, ['--version'])),
    commit,
    clean: changes ? changes.length === 0 : null,
    attestation: null,
  };
  if (!gate) return { path, dir, record };

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
  const verified = verifyAttestation(path, run);
  if (verified.refused) refuse(verified.refused);
  const mine = verified.attestations.filter((a) => a.subjects.some((s) => s.sha256 === record.sha256));
  if (mine.length === 0) {
    const named = verified.attestations.flatMap((a) => a.subjects.map((s) => `${s.name} ${s.sha256}`)).join(', ');
    refuse(`digest mismatch: the candidate's sha256 is ${record.sha256}, and the verified attestations name ${named}`);
  }
  if (!mine.some((a) => a.source_commit === commit)) {
    refuse(`commit mismatch: the candidate was built from ${[...new Set(mine.map((a) => a.source_commit))].join(', ')}, and the checkout is at ${commit}`);
  }
  const named = /^cua-engine \S+ \(([0-9a-f]{12})\)$/.exec(record.version ?? '')?.[1];
  if (!named || !commit.startsWith(named)) refuse(`the candidate's --version answers ${JSON.stringify(record.version)}, which does not name the checkout's commit ${commit.slice(0, 12)}`);
  record.attestation = { verified: true, signer_workflow: SIGNER_WORKFLOW, attestations: mine };
  return { path, dir, record };
}

/** How a run's verdict is labelled: a dev run's says it is not a release gate; a gate's, and a run from before #267's, nothing. */
export const gateLabel = (gate) => (gate === false ? 'development run, not a release gate' : null);

/** The candidate in one line of the summary: its sha256, target, version, and its attestation or why there is none. */
export function candidateLine(c) {
  const built = `sha256 ${c.sha256}, ${c.target ?? 'not an ELF file'}${c.linkage ? ` ${c.linkage}` : ''}, ${c.version ?? 'no --version answer'}`;
  if (!c.attestation) return `candidate: ${built}; attestation not checked (a development run)${c.clean === false ? '; checkout not clean' : ''}`;
  const proofs = c.attestation.attestations.map((a) => `${WORKFLOW} run ${a.run}, built from ${a.source_commit} (${a.source_ref}) on a ${a.runner} runner`);
  return `candidate: ${built}; attestation verified: ${proofs.join('; ')}`;
}

function runCommand(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60000 });
  if (result.error) return { status: -1, stdout: '', stderr: result.error.message };
  return result;
}
