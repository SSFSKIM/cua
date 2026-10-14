// The scratch home a capability-host run serves from (`run --device local --backend capability-host`): a CUA_HOME of
// its own, so neither service can list or reach any Chrome host of the machine, holding only
//   - a copy of the installed runtime (an APFS clone on macOS, so no space and no time) and its release pointer;
//   - a cua route record, so a launch lists the sockets in chrome/b (src/chrome/discovery.mjs), where the capability
//     host (test/browser-parity/capability-host.mjs) listens;
//   - the vendor's raw CDP switch in its browser config ($CODEX_HOME/browser/config.toml `full_cdp_access_enabled`,
//     readable chatgpt-26.928.40906 BS:9509 and BS:62613 fullCdpAccessState): the vendor serves raw CDP only with it
//     on, where cua's service gates on the backend's announcement alone (Decision Log, M2 task 2). Without it the
//     vendor would refuse what cua serves and the run would compare nothing.
// The directory is short (/tmp) because a Unix socket path below it must fit 104 bytes.
import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {defaultHome, homeLayout, readPointer, writePointer} from '../../src/runtime/layout.mjs';
import {cuaRecordFile} from '../../src/chrome/route.mjs';
import {backendDir} from '../../src/chrome/extension.mjs';

// -> {dir, release, cleanup()}; throws when `source` has no installed runtime.
export function prepareCapabilityHome({source = defaultHome(), platform = process.platform} = {}) {
  const release = readPointer(source);
  const runtime = release && join(homeLayout(source).runtimes, release);
  if (!runtime || !existsSync(runtime)) throw new Error(`no installed runtime in ${source}; run \`cua install\` first`);
  const dir = realpathSync(mkdtempSync('/tmp/cua-cap-'));
  try {
    mkdirSync(homeLayout(dir).runtimes, {recursive: true, mode: 0o700});
    execFileSync('cp', [...(platform === 'darwin' ? ['-c'] : []), '-R', runtime, homeLayout(dir).runtimes]);
    writePointer(dir, release);
    mkdirSync(backendDir(dir), {recursive: true, mode: 0o700});
    writeFileSync(cuaRecordFile(dir), JSON.stringify({schema: 1, route: 'cua', launcher: null, backendsDir: backendDir(dir), browsers: {}}) + '\n', {mode: 0o600});
    const browserConfig = join(homeLayout(dir).codexHome, 'browser');
    mkdirSync(browserConfig, {recursive: true, mode: 0o700});
    writeFileSync(join(browserConfig, 'config.toml'), 'full_cdp_access_enabled = true\n', {mode: 0o600});
  } catch (error) {
    rmSync(dir, {recursive: true, force: true});
    throw error;
  }
  return {dir, release, cleanup() { rmSync(dir, {recursive: true, force: true}); }};
}
