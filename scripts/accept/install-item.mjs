// accept-native item 2, the pinned install: the installed release against the runtime's release pin, its verification
// (item 3's doctor rows), the reinstall (./reinstall.mjs), the suites behind the refusals (item 1's), and the download
// proof (./download-proof.mjs). Two pins, kept apart by name: `releasePin`, the runtime release this checkout pins (the
// release and download checks read it), and `enginePin`, the native engine the run pinned ({engine, pinnedBy}, or null
// where none is driven), which selects the reinstall's engine step.
import {loadPins, readInstalledRecord, resolveRuntime, selectPin} from '../../src/runtime/manifest.mjs';
import {reinstallCheck} from './reinstall.mjs';
import {downloadProofCheck} from './download-proof.mjs';

const VERIFIED = ['runtime.files', 'runtime.vendor-manifest', 'runtime.ipc', 'runtime.signatures'];

export async function installChecks({home, enginePin, archivePath, cli, env, run, doctorChecks, fromSuite, sanitize, repo, evidence, engineDir, platform,
  releasePin = selectPin(loadPins()), runtimeOf = () => resolveRuntime({home}), recordOf = readInstalledRecord, downloadProof = downloadProofCheck}) {
  const check = (name, status, detail) => ({name, status, detail});
  const checks = [];
  let runtime;
  try {
    runtime = runtimeOf();
    const record = recordOf(runtime.root, runtime.manifest);
    checks.push(check('installed release', runtime.release === releasePin.release ? 'PASS' : 'FAIL',
      `active ${runtime.release} (pin ${releasePin.release}), installed from ${record.source}, archive sha256 ${record.archive.sha256.slice(0, 12)}…, ${record.archive.length} bytes`));
  } catch (error) {
    checks.push(check('installed release', 'FAIL', `${error.code}: ${sanitize(error.message)}`));
  }
  const verified = VERIFIED.map(name => doctorChecks.find(c => c.name === name));
  checks.push(check('verified private runtime tree', verified.every(c => c?.status === 'pass') ? 'PASS' : 'FAIL',
    verified.map(c => c ? `${c.name} ${c.status}` : 'missing').join('; ') + ` (${sanitize(doctorChecks.find(c => c.name === 'runtime.signatures')?.detail ?? '')})`));
  if (runtime && verified.every(c => c?.status === 'pass')) {
    const reinstall = await reinstallCheck({runtimeRoot: runtime.root, cli, archivePath, env, run, engine: enginePin?.engine ?? null,
      ...(engineDir ? {engineDir} : {}), ...(platform ? {platform} : {})});
    checks.push(...reinstall.map(c => ({...c, detail: sanitize(c.detail)})));
  } else checks.push(check('reinstall mutates nothing', 'FAIL', 'not attempted: the installed release does not verify'));
  checks.push(fromSuite('bad hash, length, manifest or signature never activates', ['test/runtime-install.test.mjs', 'test/runtime-manifest.test.mjs', 'test/cli.test.mjs']));
  checks.push(downloadProof({repo, evidence, pin: releasePin}));
  return checks;
}
