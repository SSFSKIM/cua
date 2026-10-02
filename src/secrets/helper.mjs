// The Keychain helper binary: where cua finds it, and what `cua doctor` can say about it without running it.
//
// The helper is built from native/keychain by `npm run build:helper` (Swift, `swift build -c release --product
// cua-keychain`) and used from that build directory; nothing else is ever substituted for it, in particular not the
// generic `security` tool. Doctor reads the binary and its code signature only:
//   - the broker protocol marker compiled into it (a stale build speaking another protocol is a failure);
//   - how it is signed. The Keychain trusts the helper that created an item by its code identity: an ad-hoc signature
//     (the default for a local build) names one exact build, so a rebuilt helper may be asked for access to items
//     the previous build created; an Apple Development signature stays stable across rebuilds on this machine; only a
//     Developer ID signature is a distribution identity. Missing stable signing is reported, never worked around.
import {existsSync, readFileSync, statSync, constants, accessSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

export const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'native', 'keychain');
export const HELPER_PATH = join(PACKAGE_DIR, '.build', 'release', 'cua-keychain');
export const BUILD_HINT = `build it with \`npm run build:helper\` in ${join(PACKAGE_DIR, '..', '..')}`;
export const EXPECTED_PROTOCOL = 1;
const MARKER = /cua-keychain broker protocol (\d+)/g;

export function locateHelper({path = HELPER_PATH} = {}) {
  let built = false;
  try { built = statSync(path).isFile(); accessSync(path, constants.X_OK); } catch { built = false; }
  return {path, built};
}

const run = (command, args) => new Promise(resolve => execFile(command, args, {encoding: 'utf8', timeout: 10_000}, (error, stdout, stderr) => resolve({ok: !error, output: `${stdout ?? ''}${stderr ?? ''}`})));

// Passive facts about the helper: never executes it.
export async function inspectKeychainHelper({path = HELPER_PATH, codesign = '/usr/bin/codesign'} = {}) {
  const {built} = locateHelper({path});
  if (!built) return {path, built: false};
  const protocols = [...new Set([...readFileSync(path).toString('latin1').matchAll(MARKER)].map(m => Number(m[1])))];
  const verify = await run(codesign, ['--verify', '--strict', path]);
  const display = await run(codesign, ['-d', '--verbose=2', path]);
  const field = name => display.output.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1];
  const authorities = [...display.output.matchAll(/^Authority=(.*)$/gm)].map(m => m[1]);
  return {
    path, built: true, protocols,
    signature: {valid: verify.ok, adhoc: field('Signature') === 'adhoc', identifier: field('Identifier'), authority: authorities[0], teamIdentifier: field('TeamIdentifier')},
  };
}

// The two doctor checks for secrets. Neither is runtime health; `blocked` means secrets (or their stable Keychain
// trust) are not available yet and says what would make them so.
export function classifyKeychainHelper(info) {
  if (!info.built) return [
    {name: 'secrets.helper', status: 'blocked', detail: `the Keychain helper is not built at ${info.path}, so secrets are unavailable; ${BUILD_HINT}`},
  ];
  const checks = [];
  const protocols = info.protocols ?? [];
  if (protocols.length === 1 && protocols[0] === EXPECTED_PROTOCOL)
    checks.push({name: 'secrets.helper', status: 'pass', detail: `Keychain helper ${info.path} speaks broker protocol ${EXPECTED_PROTOCOL}`});
  else
    checks.push({name: 'secrets.helper', status: 'fail', detail: `the Keychain helper at ${info.path} speaks broker protocol ${protocols.join(', ') || 'unknown'}, cua expects ${EXPECTED_PROTOCOL}; rebuild it: ${BUILD_HINT}`});

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
