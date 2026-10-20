// A fixture approved engine for probes and lanes that need #117's selection to find "an approved engine on this Mac"
// without the real one (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, "Engine selection, host switch and
// retirement"): at the fixed engine location under a scratch user HOME (src/runtime/engine.mjs engineDirectory), an ad
// hoc signed bundle of /usr/bin/true with its own bundle id (never the engine's, so LaunchServices never takes it for the
// real one), whose Info.plist names a version and build, and the approved.json that makes installedEngine accept it.
// Nothing launches it: whoever needs an engine to answer listens at the socket beside it (a fake engine). The real
// approved engine under the account's home is never read or touched. macOS only (codesign).
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmodSync, copyFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {engineDirectory, enginePaths, installedEngine} from '../../src/runtime/engine.mjs';

export const FIXTURE_ENGINE = Object.freeze({version: '0.0.0-fixture', build: createHash('sha256').update('cua fixture approved engine').digest('hex')});

// Places the fixture under `userHome` and approves it -> installedEngine's answer for it (throws when it does not read
// as installed).
export function placeFixtureEngine(userHome, {run = execFileSync} = {}) {
  const paths = enginePaths(engineDirectory(userHome));
  const contents = join(paths.bundle, 'Contents');
  mkdirSync(join(contents, 'MacOS'), {recursive: true, mode: 0o700});
  const keys = {CFBundleIdentifier: 'io.github.ssfskim.cua.fixture-engine', CFBundleExecutable: 'cua-engine', CFBundlePackageType: 'APPL',
    CFBundleShortVersionString: FIXTURE_ENGINE.version, CUAEngineBuild: FIXTURE_ENGINE.build};
  writeFileSync(join(contents, 'Info.plist'), '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n'
    + `<plist version="1.0">\n<dict>\n${Object.entries(keys).map(([key, value]) => `\t<key>${key}</key>\n\t<string>${value}</string>\n`).join('')}</dict>\n</plist>\n`);
  copyFileSync('/usr/bin/true', join(contents, 'MacOS', 'cua-engine'));
  chmodSync(join(contents, 'MacOS', 'cua-engine'), 0o755);
  run('/usr/bin/codesign', ['--force', '--sign', '-', paths.bundle], {stdio: ['ignore', 'ignore', 'pipe']});
  writeFileSync(paths.approved, JSON.stringify({build: FIXTURE_ENGINE.build, identity: 'adhoc', approvedAt: new Date().toISOString()}) + '\n', {mode: 0o600});
  const installed = installedEngine({dir: paths.dir});
  if (installed?.build !== FIXTURE_ENGINE.build) throw new Error(`the fixture approved engine at ${paths.bundle} does not read as installed`);
  return installed;
}
