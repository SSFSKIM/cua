// Item 2's reinstall: `cua install --json` again on the installed home. The runtime tree is compared entry by entry and
// must not change. On macOS the engine step runs as the run's pinned engine selects it:
//   - vendor's engine, or none driven: acquisition only, with CUA_NATIVE_ENGINE=vendor, and the step must be skipped;
//   - cua's engine: the step runs, and must keep T1's build-beside contract (design ruling 1118): the approved bundle and
//     approved.json are untouched whatever the build answers, and the answer is borne out by the engine directory:
//     either the approved bundle already is this checkout's build (nothing changed, no pending build added) or the new
//     build waits at the bundlePath the answer names, the pending slot beside the approved bundle. The reinstall signs
//     as the approved engine was signed (ad hoc, or the configured identity), so an identical build is recognised.
// -> the checks, in order: 'reinstall mutates nothing' (the runtime), then on cua's engine 'reinstall keeps the
// approved engine …'.
import {existsSync, readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {diffSnapshots, snapshotTree} from './lib.mjs';
import {engineDirectory, enginePaths, shortBuild} from '../../src/runtime/engine.mjs';
import {bundleIdentity} from '../../src/services/engine/client.mjs';

const RUNTIME = 'reinstall mutates nothing';
const ENGINE = 'reinstall keeps the approved engine: a build only ever goes beside it';

export async function reinstallCheck({runtimeRoot, cli, archivePath, env, run, platform = process.platform, engine = null, engineDir}) {
  const cua = platform === 'darwin' && engine === 'cua';
  const paths = cua ? enginePaths(engineDir ?? engineDirectory(env.HOME || homedir())) : null;
  const engineBefore = cua ? engineState(paths) : null;
  const args = [cli, 'install', '--json', '--archive', archivePath, ...(engineBefore?.approvedRecord?.identity === 'adhoc' ? ['--engine-sign', 'adhoc'] : [])];
  const before = snapshotTree(runtimeRoot);
  const reinstall = await run(process.execPath, args, {env: {...env, CUA_NATIVE_ENGINE: cua ? 'cua' : 'vendor'}});
  let result;
  try { result = JSON.parse(reinstall.stdout); } catch { result = null; }
  const diff = diffSnapshots(before, snapshotTree(runtimeRoot));
  const installed = reinstall.code === 0 && result?.ok === true;
  const outcome = result ? `ok ${result.ok}, changed ${result.changed}` : `exit ${reinstall.code}: ${reinstall.stderr.trim().split('\n').at(-1) ?? ''}`;
  const treeDetail = `${before.size} entries compared (type, mode, size, mtime, inode): ${diff.same ? 'identical' : `${diff.added.length} added, ${diff.removed.length} removed, ${diff.changed.length} changed`}`;
  if (cua) {
    return [
      {name: RUNTIME, status: installed && result.changed === false && diff.same ? 'PASS' : 'FAIL', detail: `install --json → ${outcome}; runtime ${treeDetail}`},
      engineCheck({installed, answer: result?.engine, before: engineBefore, after: engineState(paths), paths}),
    ];
  }
  const engineSkipped = platform !== 'darwin' || result?.engine?.skipped === 'not_selected';
  const engineDetail = platform === 'darwin' ? `; engine ${result?.engine?.skipped ?? 'skip not confirmed'}` : '';
  return [{name: RUNTIME, status: installed && result.changed === false && diff.same && engineSkipped ? 'PASS' : 'FAIL',
    detail: `install --json → ${outcome}${engineDetail}; ${treeDetail}`}];
}

// What the build-beside contract is judged by: the approved bundle's tree and approved.json's bytes, and the pending
// slot's tree and build. Files only; nothing is launched or signed.
function engineState(paths) {
  const tree = path => (existsSync(path) ? snapshotTree(path) : null);
  const text = path => { try { return readFileSync(path, 'utf8'); } catch { return null; } };
  const build = path => { try { return bundleIdentity(path).build; } catch { return null; } };
  const approvedText = text(paths.approved);
  let approvedRecord = null;
  try { approvedRecord = JSON.parse(approvedText); } catch { /* absent or unreadable: judged below */ }
  return {bundle: tree(paths.bundle), approvedText, approvedRecord, slot: tree(paths.pendingBundle), slotBuild: build(paths.pendingBundle)};
}

const sameTree = (a, b) => (a === null || b === null ? a === b : diffSnapshots(a, b).same);

function engineCheck({installed, answer, before, after, paths}) {
  const fail = detail => ({name: ENGINE, status: 'FAIL', detail});
  if (!before.bundle || !before.approvedRecord?.build) return fail(`no approved engine at ${paths.bundle} before the reinstall (approved.json ${before.approvedText === null ? 'absent' : 'unreadable'}); approve this checkout's build first`);
  if (!installed) return fail('the reinstall failed, so its engine step was not judged');
  if (answer?.status !== 'pass') return fail(`install's engine step answered ${answer?.skipped ? `skipped (${answer.skipped}) although cua's engine is selected` : answer ? `${answer.status} (${answer.code ?? 'no code'})` : 'nothing'}`);
  const kept = [!sameTree(before.bundle, after.bundle) && 'the approved bundle changed', before.approvedText !== after.approvedText && 'approved.json changed'].filter(Boolean);
  if (kept.length) return fail(`${kept.join(' and ')}: a build must leave the approved engine untouched`);
  const approved = shortBuild(before.approvedRecord.build);
  if (answer.pending === false) {
    const ok = answer.changed === false && answer.approved === true && answer.build === before.approvedRecord.build && answer.bundlePath === paths.bundle
      && sameTree(before.slot, after.slot);
    return ok ? {name: ENGINE, status: 'PASS', detail: `this checkout's engine is already the approved build ${approved}; nothing changed (bundle, approved.json and pending slot as they were)`}
      : fail(`the answer says nothing is pending (build ${shortBuild(answer.build)}, changed ${answer.changed}, approved ${answer.approved}, at ${answer.bundlePath === paths.bundle ? 'the approved path' : 'another path'}), `
        + `but ${sameTree(before.slot, after.slot) ? 'that is not the approved build left as it was' : 'the pending slot changed'}`);
  }
  if (answer.pending === true) {
    const ok = answer.bundlePath === paths.pendingBundle && after.slotBuild !== null && after.slotBuild === answer.build;
    return ok ? {name: ENGINE, status: 'PASS', detail: `the approved build ${approved} and approved.json are untouched; pending build ${shortBuild(answer.build)} added beside it at the bundlePath the answer names, for cua engine approve`}
      : fail(`the answer says build ${shortBuild(answer.build)} is pending at ${answer.bundlePath === paths.pendingBundle ? 'the pending slot' : 'a path other than the pending slot'}; the slot holds ${after.slotBuild === null ? 'no bundle' : `build ${shortBuild(after.slotBuild)}`}`);
  }
  return fail(`install's engine answer has no pending flag (${JSON.stringify(Object.keys(answer))})`);
}
