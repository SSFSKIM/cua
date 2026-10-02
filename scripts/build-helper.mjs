#!/usr/bin/env node
// `npm run build:helper`: builds the production Keychain helper (native/keychain, product `cua-keychain`, release)
// where cua looks for it, then reports what `cua doctor` will say about it. The linker signs it ad hoc; that is a
// development signature (see src/secrets/helper.mjs for what it means for Keychain access).
//
//   --sign <identity>   re-sign the built helper with a code-signing identity from your keychain (for example an
//                       "Apple Development: ..." identity) so Keychain trust survives rebuilds on this machine.
//                       codesign may need to use the identity's private key; if macOS asks for permission, or the
//                       step does not finish within 60 s, signing is reported as blocked and the ad-hoc build stays.
// Only macOS with Swift tooling (Xcode or its command-line tools) can build the helper.
import {spawnSync} from 'node:child_process';
import {parseArgs} from 'node:util';
import {PACKAGE_DIR, HELPER_PATH, inspectKeychainHelper, classifyKeychainHelper} from '../src/secrets/helper.mjs';

const {values} = parseArgs({options: {sign: {type: 'string'}}, strict: true});
if (process.platform !== 'darwin') {
  console.error('build:helper: the Keychain helper is macOS-only');
  process.exit(1);
}

const build = spawnSync('swift', ['build', '-c', 'release', '--package-path', PACKAGE_DIR, '--product', 'cua-keychain'], {stdio: 'inherit'});
if (build.error || build.status !== 0) {
  console.error(`build:helper: swift build failed${build.error ? ` (${build.error.code ?? build.error.message}; is Swift installed?)` : ''}`);
  process.exit(1);
}

let signing = 0;
if (values.sign) {
  const sign = spawnSync('/usr/bin/codesign', ['--force', '--sign', values.sign, '--identifier', 'cua-keychain', HELPER_PATH], {encoding: 'utf8', timeout: 60_000, killSignal: 'SIGKILL'});
  if (sign.error?.code === 'ETIMEDOUT' || sign.signal) {
    console.error('build:helper: signing BLOCKED: codesign did not finish within 60 s (it may be waiting for permission to use the identity\'s key); the helper keeps its ad-hoc signature');
    signing = 1;
  } else if (sign.status !== 0) {
    console.error(`build:helper: signing failed: ${(sign.stderr || sign.stdout).trim()}`);
    signing = 1;
  }
}

console.log(`built ${HELPER_PATH}`);
for (const check of classifyKeychainHelper(await inspectKeychainHelper())) console.log(`${check.status.toUpperCase().padEnd(8)} ${check.name.padEnd(16)} ${check.detail}`);
process.exit(signing);
