// The Keychain helper binary: where cua finds it, how a build installs it, and what `cua doctor` can say about it
// without running it.
//
// The helper is built from native/keychain by `npm run build:helper` (Swift, `swift build -c release --product
// cua-keychain`), which then installs the built binary as $CUA_HOME/bin/cua-keychain. cua runs that installed copy when
// there is one, else this checkout's build output, so a copy of cua with no build of its own (the Claude Code plugin's)
// finds the helper a checkout built for the same CUA_HOME. Nothing else is ever substituted for it, in particular not
// the generic `security` tool. Doctor reads the binary and its code signature only:
//   - the broker protocol marker compiled into it (a stale build speaking another protocol is a failure);
//   - how it is signed. The Keychain trusts the helper that created an item by its code identity: an ad-hoc signature
//     (the default for a local build) names one exact build, so a rebuilt helper may be asked for access to items
//     the previous build created; an Apple Development signature stays stable across rebuilds on this machine; only a
//     Developer ID signature is a distribution identity. Missing stable signing is reported, never worked around.
//     The installed copy is the build's bytes, so it carries the same signature and identity.
import {readFileSync, statSync, constants, accessSync, copyFileSync, chmodSync, mkdirSync, renameSync, rmSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {defaultHome, realHome} from '../runtime/layout.mjs';

export const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'native', 'keychain');
export const BUILD_OUTPUT = join(PACKAGE_DIR, '.build', 'release', 'cua-keychain');
export const installedHelperPath = home => join(home, 'bin', 'cua-keychain');
export const BUILD_HINT = `build it with \`npm run build:helper\` in ${join(PACKAGE_DIR, '..', '..')}, which also installs it as $CUA_HOME/bin/cua-keychain`;
export const EXPECTED_PROTOCOL = 1;
const MARKER = /cua-keychain broker protocol (\d+)/g;

const LOCATIONS = {home: 'installed in CUA_HOME/bin', build: 'this checkout\'s build output'};

function isExecutableFile(path) {
  try { return statSync(path).isFile() && (accessSync(path, constants.X_OK), true); } catch { return false; }
}

// The helper cua runs for `home`: <home>/bin/cua-keychain when it is an executable file, else the checkout's build
// output; `location` says which. `path` names one exact file instead, with no fallback; `build` stands in for the
// build output (tests).
export function locateHelper({home = defaultHome(), path, build = BUILD_OUTPUT} = {}) {
  if (path) return {path, built: isExecutableFile(path)};
  const candidates = [{path: installedHelperPath(home), location: 'home'}, {path: build, location: 'build'}];
  const found = candidates.find(c => isExecutableFile(c.path));
  return found ? {...found, built: true} : {path: candidates[0].path, built: false, searched: candidates.map(c => c.path)};
}

// Installs a built helper as <home>/bin/cua-keychain, mode 0755. The copy is written beside the target and renamed
// over it, so a reader never sees a partial file and a running helper keeps the file it started from. Returns the
// installed path.
export function installHelper({home = defaultHome(), from = BUILD_OUTPUT} = {}) {
  const target = installedHelperPath(realHome(home, {create: true}));
  mkdirSync(dirname(target), {recursive: true, mode: 0o755});
  const temp = `${target}.${randomUUID()}.tmp`;
  try {
    copyFileSync(from, temp);
    chmodSync(temp, 0o755);
    renameSync(temp, target);
  } catch (error) {
    rmSync(temp, {force: true});
    throw error;
  }
  return target;
}

const run = (command, args) => new Promise(resolve => execFile(command, args, {encoding: 'utf8', timeout: 10_000}, (error, stdout, stderr) => resolve({ok: !error, output: `${stdout ?? ''}${stderr ?? ''}`})));

// Passive facts about the helper cua would run for `home` (or the exact `path`): never executes it.
export async function inspectKeychainHelper({home, path, build, codesign = '/usr/bin/codesign'} = {}) {
  const located = locateHelper({home, path, build});
  if (!located.built) return located;
  path = located.path;
  const protocols = [...new Set([...readFileSync(path).toString('latin1').matchAll(MARKER)].map(m => Number(m[1])))];
  const verify = await run(codesign, ['--verify', '--strict', path]);
  const display = await run(codesign, ['-d', '--verbose=2', path]);
  const field = name => display.output.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1];
  const authorities = [...display.output.matchAll(/^Authority=(.*)$/gm)].map(m => m[1]);
  return {
    ...located, protocols,
    signature: {valid: verify.ok, adhoc: field('Signature') === 'adhoc', identifier: field('Identifier'), authority: authorities[0], teamIdentifier: field('TeamIdentifier')},
  };
}

// The two doctor checks for secrets. Neither is runtime health; `blocked` means secrets (or their stable Keychain
// trust) are not available yet and says what would make them so. secrets.helper names the file and its location.
export function classifyKeychainHelper(info) {
  if (!info.built) return [
    {name: 'secrets.helper', status: 'blocked', detail: `the Keychain helper is not built (looked for ${(info.searched ?? [info.path]).join(' and ')}), so secrets are unavailable; ${BUILD_HINT}`},
  ];
  const checks = [];
  const protocols = info.protocols ?? [];
  const found = `${info.path}${info.location ? ` (${LOCATIONS[info.location]})` : ''}`;
  const uninstalled = info.location === 'build' ? '; it is not installed in CUA_HOME/bin, where other copies of cua (the Claude Code plugin\'s) look for it: `npm run build:helper` installs it' : '';
  if (protocols.length === 1 && protocols[0] === EXPECTED_PROTOCOL)
    checks.push({name: 'secrets.helper', status: 'pass', detail: `Keychain helper ${found} speaks broker protocol ${EXPECTED_PROTOCOL}${uninstalled}`});
  else
    checks.push({name: 'secrets.helper', status: 'fail', detail: `the Keychain helper at ${found} speaks broker protocol ${protocols.join(', ') || 'unknown'}, cua expects ${EXPECTED_PROTOCOL}; rebuild it: ${BUILD_HINT}`});

  const sig = info.signature ?? {};
  if (!sig.valid)
    checks.push({name: 'secrets.signing', status: 'fail', detail: `the Keychain helper's code signature does not verify; ${BUILD_HINT}`});
  else if (sig.adhoc)
    checks.push({name: 'secrets.signing', status: 'blocked', detail: 'the Keychain helper is ad-hoc signed (a local development build): Keychain items it creates trust only this exact build, so a rebuilt helper may ask for access to them. No stable signing identity is configured; a release needs a Developer ID signature.'});
  else if (/^Developer ID Application:/.test(sig.authority ?? ''))
    checks.push({name: 'secrets.signing', status: 'pass', detail: `signed by ${sig.authority}`});
  else
    checks.push({name: 'secrets.signing', status: 'blocked', detail: `signed by ${sig.authority ?? 'an unrecognized identity'}: Keychain trust is stable across rebuilds signed by it on this machine, but it is not a distribution signature (a release needs Developer ID)`});
  return checks;
}
