// The run home on the pinned release (#171 M5, T1's fix wave; the design session's ruling 708). Acceptance on the pinned
// release takes the engine a run home's `cua install` placed, `<CUA_HOME>/engine/linux/cua-engine` (candidate.mjs), and
// runs that file itself, never a copy. What cua's service runs is then decided the way a session decides it:
// - the engine is the one cua's own selection picks in that home with `CUA_NATIVE_ENGINE=cua` and no override
//   (launch.mjs `nativeEngineFor`), which must be the checked file (`pinnedEngine`);
// - a `cua serve` the harness starts runs in a home of the run's: HOME and the XDG directories under the run's scratch,
//   an empty secret store, CUA_HOME the run home, `CUA_NATIVE_ENGINE=cua`, and no `CUA_LINUX_ENGINE_BIN`
//   (`pinnedServeEnvironment`). Never the person's HOME, secret store or default cua home.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { nativeEngineFor } from '../../src/runtime/launch.mjs';
import { runHome } from './app-env.mjs';
import { CandidateRefused } from './candidate.mjs';

/** The cua home whose `cua install` placed `engine` (`<CUA_HOME>/engine/linux/cua-engine`). */
export const cuaHomeOf = (engine) => resolve(dirname(engine), '..', '..');

/** The engine cua's own selection runs in the cua home `cuaHome` with cua's engine asked for and no override. */
export function selectedEngine(cuaHome) {
  let selected;
  try {
    selected = nativeEngineFor({ platform: 'linux', env: { CUA_NATIVE_ENGINE: 'cua' }, home: cuaHome, config: () => null });
  } catch (error) {
    throw new CandidateRefused(`cua's selection in ${cuaHome} runs no installed engine: ${error.message}`);
  }
  if (selected.engine !== 'cua' || selected.bin?.source !== 'installed') throw new CandidateRefused(`cua's selection in ${cuaHome} does not run its installed engine (${JSON.stringify(selected)})`);
  return selected.bin.path;
}

/**
 * The checked engine `engine` (candidate.mjs's pinned record `record`) as a pinned run runs it: `{cua, cuaHome}`, `cua`
 * the path cua's selection picks in its home, refused unless it is that file and still holds the checked bytes.
 */
export function pinnedEngine(engine, record, { select = selectedEngine } = {}) {
  const cuaHome = cuaHomeOf(engine);
  const cua = select(cuaHome);
  if (realpathSync(cua) !== realpathSync(engine)) throw new CandidateRefused(`cua's selection in ${cuaHome} runs ${cua}, not the checked engine ${engine}`);
  const sha256 = createHash('sha256').update(readFileSync(cua)).digest('hex');
  if (sha256 !== record.sha256) throw new CandidateRefused(`the installed engine ${cua} changed after its check: sha256 ${sha256}, checked ${record.sha256}`);
  return { cua, cuaHome };
}

/**
 * The environment of a `cua serve` on the pinned release: `base` with HOME and the XDG directories under `scratch` (made
 * here, with an empty secret store), CUA_HOME `cuaHome`, cua's engine asked for, and no engine override, so the serve
 * selects the run home's installed engine itself.
 */
export function pinnedServeEnvironment({ base = process.env, cuaHome, scratch }) {
  const home = runHome(scratch);
  for (const dir of Object.values(home)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  mkdirSync(join(home.XDG_CONFIG_HOME, 'claude-secrets'), { recursive: true, mode: 0o700 });
  const { CUA_LINUX_ENGINE_BIN: _override, ...rest } = base;
  return { ...rest, ...home, CUA_HOME: cuaHome, CUA_NATIVE_ENGINE: 'cua' };
}
