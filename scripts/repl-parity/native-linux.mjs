// The Linux native suite's engine lanes (#171, Plan of Work M2): the expected file declares the vendor's exact
// text defects against cua's positive results. checkEnginePair binds one sitting; ./compare.mjs projects only the
// declared exercise result and assertion when both sides hold exactly the outcomes named.
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {laneEngineProblem} from './engine-answered.mjs';

export const NATIVE_LINUX_EXPECTED_FILE = new URL('./expected/native-linux.json', import.meta.url);
export const TEXT_CASES = Object.freeze(['native/app/typetext', 'native/app/paste']);
// Read as JSON, not through ./vendor-defects.mjs, which is consumed with this module by the comparison.
const vendorDefects = () => JSON.parse(readFileSync(new URL('../../test/repl-parity/vendor-defects.json', import.meta.url), 'utf8'));
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const DECLARATION_KEYS = ['id', 'case', 'cells', 'vendorDefect', 'cua', 'reason'];
// The expected file ({about, declarations}) -> the file, each declaration checked; throws naming the first invalid one.
export function validateNativeLinuxExpected(file) {
  if (!plain(file) || Object.keys(file).some(k => !['about', 'declarations'].includes(k)) || !Array.isArray(file.declarations)) throw new Error('the Linux native expected file holds {about, declarations: [...]}');
  const ids = new Set(), cases = new Set(), defects = vendorDefects();
  for (const d of file.declarations) {
    const defect = defects.find(v => v.id === d?.vendorDefect && v.host === 'cua' && v.engine === 'vendor' && v.platform === 'linux' && v.case === d?.case);
    const ok = plain(d) && Object.keys(d).every(k => DECLARATION_KEYS.includes(k)) && typeof d.id === 'string' && d.id && !ids.has(d.id)
      && TEXT_CASES.includes(d.case) && !cases.has(d.case) && typeof d.reason === 'string' && d.reason.trim() && isDeepStrictEqual(d.cells, ['exercise'])
      && defect && plain(d.cua) && isDeepStrictEqual(Object.keys(d.cua).sort(), ['assertion', 'result']) && isDeepStrictEqual(d.cua.assertion, {ok: true})
      && plain(d.cua.result) && isDeepStrictEqual(Object.keys(d.cua.result).sort(), ['cell', 'content', 'isError'])
      && d.cua.result.cell === 'exercise' && d.cua.result.isError === false && Array.isArray(d.cua.result.content);
    if (!ok) throw new Error(`invalid engine declaration ${JSON.stringify(d)}: it names a unique id and text case, its reason, the exercise cell, a vendor-engine defect on the same case and the exact passing cua assertion and exercise result`);
    ids.add(d.id); cases.add(d.case);
  }
  return file;
}
export const NATIVE_LINUX_EXPECTED = validateNativeLinuxExpected(JSON.parse(readFileSync(NATIVE_LINUX_EXPECTED_FILE, 'utf8')));

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
