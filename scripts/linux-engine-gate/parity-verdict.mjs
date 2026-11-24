#!/usr/bin/env node
// R1's own verdict (#171 M6b, its pre-flight §1.3 and finding 11): repl-parity's native suite on the cua lane alone. Until
// M6b the part's verdict was the diff of a vendor lane and a cua lane; with the vendor's Linux engine gone, nothing of
// the cua lane would decide it. So the lane passes only when
//   - the run exited 0, and its record is complete, with no error;
//   - it ran the native suite's cases on Linux, all of them (34 today, nativeLinuxCaseIds), each covered by a passing
//     assertion and none failing;
//   - both text cases (native-linux.mjs TEXT_CASES) are positive: asserted ok, with no vendor defect recorded;
//   - the engine that answered every native case is the lane's (engine-answered.mjs laneEngineProblem: cua's engine at
//     the executable the lane names, the trusted worker's child, behind cua's service, nothing else), and that
//     executable is the installed engine of the case's own home: each case's observation names the connection it ran
//     on, and its engine must be `<home>/engine/linux/cua-engine` for the home that connection's recorded provenance
//     attests answered it (hostAttestations[].executionFacts.answeringHost.home), one connection a case (fix wave 1:
//     a path suffix alone let one case's observation name another case's engine). On a candidate, the one ENGINE_BIN
//     names, by its real path, for every case.
// The suites runner (suites.sh) runs the cleanup whatever this says, and a cleanup that fails fails the part too.
//
//   node scripts/linux-engine-gate/parity-verdict.mjs <run dir> --exit <the run's exit status> [--engine-bin <path>]
//     prints the verdict as JSON; exit 0 only when it passes.
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { laneEngineProblem } from '../repl-parity/engine-answered.mjs';
import { TEXT_CASES } from '../repl-parity/native-linux.mjs';
import { inventory, selectScenarios } from '../repl-parity/registry.mjs';
import scenarios from '../../test/repl-parity/scenarios/index.mjs';

/** How many cases the native suite runs on Linux; a test holds nativeLinuxCaseIds() to it. */
export const NATIVE_LINUX_CASES = 34;
/** The native suite's case ids on Linux, as repl-parity's own selection picks them. */
export const nativeLinuxCaseIds = () => selectScenarios(scenarios, inventory, { suite: 'native', platform: 'linux' }).scenarios.map((s) => s.id);
/** Where a cua home holds its installed engine (src/runtime/linux-engine.mjs linuxEnginePath). */
const INSTALLED = 'engine/linux/cua-engine';

/**
 * The verdict on a cua lane: `meta` and `rows` its meta.json and results.jsonl, `exit` the run's exit status, `engineBin`
 * the candidate a candidate run named (--engine-bin, null on the installed engine) and `engineReal` its real path, which
 * the lane's observations name -> {pass, problems, cases, covered, text, engines}.
 */
export function parityVerdict({ meta, rows, exit, engineBin = null, engineReal = engineBin, expected = nativeLinuxCaseIds() }) {
  const problems = [];
  if (!Number.isInteger(exit)) problems.push("the run's exit status was not given");
  else if (exit !== 0) problems.push(`the run exited ${exit}`);
  if (meta?.complete !== true) problems.push(`the run is not complete${meta?.error ? ` (${meta.error})` : ''}`);
  else if (meta.error) problems.push(`the run recorded an error: ${meta.error}`);
  if (meta?.platform !== 'linux' || meta?.suite !== 'native' || meta?.host !== 'cua') problems.push(`the run is ${meta?.suite} on ${meta?.platform} (host ${meta?.host}), not the native suite on Linux on cua's host`);
  if (meta?.engine !== 'cua') problems.push(`the lane ran the ${meta?.engine ?? 'unnamed'} engine, not cua's`);

  const caseIds = Array.isArray(meta?.caseIds) ? meta.caseIds : [];
  if (caseIds.length !== expected.length) problems.push(`the run selected ${caseIds.length} cases, not the native suite's ${expected.length}`);
  const missing = expected.filter((id) => !caseIds.includes(id));
  const extra = caseIds.filter((id) => !expected.includes(id));
  if (missing.length) problems.push(`the run did not select ${missing.join(', ')}`);
  if (extra.length) problems.push(`the run selected cases outside the native suite: ${extra.join(', ')}`);
  const assertions = (Array.isArray(rows) ? rows : []).filter((r) => r && 'assertion' in r);
  const covered = caseIds.filter((id) => assertions.some((r) => r.case === id && r.assertion?.ok === true));
  const failing = [...new Set(assertions.filter((r) => r.assertion?.ok !== true).map((r) => r.case))];
  const uncovered = caseIds.filter((id) => !covered.includes(id));
  if (uncovered.length) problems.push(`no passing assertion for ${uncovered.join(', ')}`);
  for (const id of failing) problems.push(`${id}: an assertion failed`);
  if (meta?.coveredCases !== expected.length) problems.push(`the run counted ${meta?.coveredCases} cases covered, not ${expected.length}`);

  const text = Object.fromEntries(TEXT_CASES.map((id) => {
    const own = assertions.filter((r) => r.case === id);
    const positive = own.length > 0 && own.every((r) => r.assertion?.ok === true && !r.vendorDefect);
    return [id, positive];
  }));
  for (const [id, positive] of Object.entries(text)) if (!positive) problems.push(`${id}: not positive`);
  if (Array.isArray(meta?.vendorDefects) && meta.vendorDefects.length) problems.push(`the run recorded vendor defects: ${meta.vendorDefects.map((d) => d.id ?? JSON.stringify(d)).join(', ')}`);

  const lane = laneEngineProblem(meta);
  if (lane) problems.push(lane);
  const native = caseIds.filter((id) => id.startsWith('native/'));
  if (!native.length) problems.push('the run selected no native case, so no engine answered it');
  const entries = meta?.engineAnswered ?? [];
  const engines = [...new Set(entries.map((e) => e.expected))];
  if (engineBin !== null) {
    for (const at of engines) if (at !== engineReal) problems.push(`${at} answered, not the candidate ${engineReal}`);
  } else {
    // each case's engine is its own connection's home's installed engine, by that connection's attested answering home
    const attested = new Map((Array.isArray(meta?.hostAttestations) ? meta.hostAttestations : []).map((a) => [a?.connection, a?.executionFacts?.answeringHost?.home]));
    const seen = new Map();
    for (const e of entries) {
      if (typeof e.connection !== 'string' || !e.connection) {
        problems.push(`${e.case}: its engine observation names no connection, so which home answered it is unproven`);
        continue;
      }
      if (seen.has(e.connection)) problems.push(`${e.case}: its connection ${e.connection} also answered ${seen.get(e.connection)}`);
      seen.set(e.connection, e.case);
      const home = attested.get(e.connection);
      if (typeof home !== 'string' || !home.startsWith('/')) problems.push(`${e.case}: its connection ${e.connection} attests no answering home`);
      else if (e.expected !== `${home.replace(/\/+$/, '')}/${INSTALLED}`) problems.push(`${e.case}: ${e.expected} answered, not the installed engine of its own connection's home (${home}/${INSTALLED})`);
    }
  }
  if (engineBin !== null && meta?.engineBin !== engineBin) problems.push(`the run names engine ${meta?.engineBin ?? 'none'}, not the candidate ${engineBin}`);
  if (engineBin === null && meta?.engineBin) problems.push(`the run named the engine ${meta.engineBin}, where the installed engine runs`);

  return { pass: problems.length === 0, problems, cases: caseIds.length, covered: covered.length, text, engines };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const dir = argv[0];
  const flag = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const exitText = flag('--exit');
  const read = (file) => readFileSync(join(dir, file), 'utf8');
  let verdict;
  try {
    const meta = JSON.parse(read('meta.json'));
    const rows = read('results.jsonl').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const engineBin = flag('--engine-bin') ?? null;
    const engineReal = engineBin === null ? null : (() => {
      try {
        return realpathSync(engineBin);
      } catch {
        return engineBin;
      }
    })();
    verdict = parityVerdict({ meta, rows, exit: exitText === undefined || !/^\d+$/.test(exitText) ? undefined : Number(exitText), engineBin, engineReal });
  } catch (error) {
    verdict = { pass: false, problems: [`the run at ${dir} could not be read: ${error.message}`] };
  }
  console.log(JSON.stringify(verdict, null, 2));
  process.exitCode = verdict.pass ? 0 : 1;
}
