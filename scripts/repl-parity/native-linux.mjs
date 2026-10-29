// The Linux native suite's engine lanes, judged (#171, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, The
// facade suites; M1b): the expected file (./expected/native-linux.json, its `about` says what each part is), the cua
// engine's temporary candidate expectations the run's assessment accepts (./vendor-defects.mjs assessAssertions), and
// the pair a diff of the two lanes takes (checkEnginePair; the declarations are applied by ./compare.mjs
// compareParityRuns' `engineDeclarations`).
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {laneEngineProblem} from './engine-answered.mjs';

export const NATIVE_LINUX_EXPECTED_FILE = new URL('./expected/native-linux.json', import.meta.url);
// The only cases a candidate expectation may name: the native suite's two text cases (M1b's temporary expectations).
export const TEXT_CASES = Object.freeze(['native/app/typetext', 'native/app/paste']);
// Read as JSON, not through ./vendor-defects.mjs, which imports this module.
const vendorDefectIds = () => JSON.parse(readFileSync(new URL('../../test/repl-parity/vendor-defects.json', import.meta.url), 'utf8')).filter(d => d.engine === 'vendor').map(d => d.id);

const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const CANDIDATE_KEYS = ['id', 'engine', 'platform', 'case', 'until', 'reason', 'assertion', 'result'];
const DECLARATION_KEYS = ['id', 'case', 'cells', 'vendorDefect', 'candidateExpectation', 'reason'];
// The expected file ({about, candidateExpectations, declarations}) -> the file, each entry checked; throws naming the first
// that is not one.
export function validateNativeLinuxExpected(file) {
  if (!plain(file) || !Array.isArray(file.candidateExpectations) || !Array.isArray(file.declarations)) throw new Error('the Linux native expected file holds {about, candidateExpectations: [...], declarations: [...]}');
  const ids = new Set();
  for (const c of file.candidateExpectations) {
    const ok = plain(c) && Object.keys(c).every(k => CANDIDATE_KEYS.includes(k)) && typeof c.id === 'string' && c.id && !ids.has(c.id)
      && c.engine === 'cua' && c.platform === 'linux' && TEXT_CASES.includes(c.case) && c.until === 'M2' && typeof c.reason === 'string' && c.reason.trim()
      && c.assertion?.ok === false && typeof c.assertion.reason === 'string' && Object.keys(c.assertion).length === 2
      && c.result?.cell === 'exercise' && c.result.isError === false && Array.isArray(c.result.content) && Object.keys(c.result).length === 3;
    if (!ok) throw new Error(`invalid candidate expectation ${JSON.stringify(c)}: it names a unique id, the cua engine on linux, one of ${TEXT_CASES.join(' and ')}, until M2, its reason, the exact failed assertion and the exact exercise result`);
    ids.add(c.id);
  }
  const defects = vendorDefectIds();
  for (const d of file.declarations) {
    const candidate = file.candidateExpectations.find(c => c.id === d?.candidateExpectation);
    const ok = plain(d) && Object.keys(d).every(k => DECLARATION_KEYS.includes(k)) && typeof d.id === 'string' && d.id && !ids.has(d.id)
      && typeof d.reason === 'string' && d.reason.trim() && isDeepStrictEqual(d.cells, ['exercise'])
      && defects.includes(d.vendorDefect) && candidate?.case === d.case;
    if (!ok) throw new Error(`invalid engine declaration ${JSON.stringify(d)}: it names a unique id, its reason, the exercise cell, a vendor-engine defect of test/repl-parity/vendor-defects.json and a candidate expectation of this file on the same case`);
    ids.add(d.id);
  }
  return file;
}
export const NATIVE_LINUX_EXPECTED = validateNativeLinuxExpected(JSON.parse(readFileSync(NATIVE_LINUX_EXPECTED_FILE, 'utf8')));
export const candidateExpectations = NATIVE_LINUX_EXPECTED.candidateExpectations;

// The candidate expectation an assertion row of a run is, or null: the run's engine, platform and case, the exact failed
// assertion, and the case's exercise result exactly the declared one.
export function declaredCandidateExpectation(meta, row, rows) {
  if (Object.hasOwn(row, 'cell') || row.assertion?.ok !== false) return null;
  return candidateExpectations.find(c => {
    if (meta.host !== 'cua' || meta.engine !== c.engine || meta.platform !== c.platform || row.case !== c.case || !isDeepStrictEqual(row.assertion, c.assertion)) return false;
    if (row.candidateExpectation && row.candidateExpectation !== c.id) return false;
    const result = rows.find(r => r.case === c.case && r.cell === c.result.cell);
    return result?.ok === true && result.isError === c.result.isError && isDeepStrictEqual(result.content, c.result.content);
  }) ?? null;
}

// Whether two runs form one engine-lane pair a diff may take -> nothing, or throws why not: both complete Linux runs on
// cua's host that name their engine, of one sitting (one device, one prepared commit, the same controller cells, one
// vendor runtime), each answered by its own engine; the vendor-engine run first and the cua-engine run second, or two
// runs of one engine (a determinism check, which takes no declarations).
export function checkEnginePair(a, b, {declarations = []} = {}) {
  for (const [meta, side] of [[a, 'first'], [b, 'second']]) {
    if (meta.engine === undefined) throw new Error(`the ${side} run names no engine: an engine-lane diff takes two runs of repl-parity.mjs run --engine`);
    if (meta.platform !== 'linux' || meta.host !== 'cua') throw new Error(`the ${side} run is not a Linux run on cua's host`);
    const problem = laneEngineProblem(meta);
    if (problem) throw new Error(`in the ${side} run the requested engine did not answer: ${problem}`);
  }
  if (a.engine === b.engine) { if (declarations.length) throw new Error('two runs of the same engine are a determinism check: same-engine runs take no expected declarations'); }
  else if (a.engine !== 'vendor' || b.engine !== 'cua') throw new Error('diff takes the vendor-engine run first and the cua-engine run second');
  if (a.device !== b.device) throw new Error(`the runs are on two devices (${a.device}, ${b.device})`);
  if (a.commit !== b.commit) throw new Error(`the runs were prepared at two commits (${a.commit}, ${b.commit}): one sitting is one preparation`);
  if (a.harnessCommit !== b.harnessCommit) throw new Error('the runs\' cells came from two controller commits: the same cells run on both engines');
  if (a.runtimeRelease !== b.runtimeRelease) throw new Error(`the runs served two vendor runtimes (${a.runtimeRelease}, ${b.runtimeRelease})`);
}
