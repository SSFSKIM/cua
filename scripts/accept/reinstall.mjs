// Item 2's acquisition-only reinstall: compare the runtime tree and require the installer to leave the engine alone.
import {diffSnapshots, snapshotTree} from './lib.mjs';

export async function reinstallCheck({runtimeRoot, cli, archivePath, env, run, platform = process.platform}) {
  const before = snapshotTree(runtimeRoot);
  const reinstall = await run(process.execPath, [cli, 'install', '--json', '--archive', archivePath], {env: {...env, CUA_NATIVE_ENGINE: 'vendor'}});
  let result;
  try { result = JSON.parse(reinstall.stdout); } catch { result = null; }
  const diff = diffSnapshots(before, snapshotTree(runtimeRoot));
  const engineSkipped = platform !== 'darwin' || result?.engine?.skipped === 'not_selected';
  const engineDetail = platform === 'darwin' ? `; engine ${result?.engine?.skipped ?? 'skip not confirmed'}` : '';
  return {name: 'reinstall mutates nothing', status: reinstall.code === 0 && result?.ok === true && result.changed === false && diff.same && engineSkipped ? 'PASS' : 'FAIL',
    detail: `install --json → ${result ? `ok ${result.ok}, changed ${result.changed}` : `exit ${reinstall.code}: ${reinstall.stderr.trim().split('\n').at(-1) ?? ''}`}${engineDetail}; ${before.size} entries compared (type, mode, size, mtime, inode): ${diff.same ? 'identical' : `${diff.added.length} added, ${diff.removed.length} removed, ${diff.changed.length} changed`}`};
}
