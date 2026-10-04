// What cua says about the Keychain helper without running it: build presence, broker protocol, code signature.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync, chmodSync, mkdirSync, readFileSync, readdirSync, statSync, realpathSync} from 'node:fs';
import {join} from 'node:path';
import {locateHelper, installHelper, inspectKeychainHelper, classifyKeychainHelper, installedHelperPath, BUILD_OUTPUT, PACKAGE_DIR} from '../src/secrets/helper.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';

const byName = checks => Object.fromEntries(checks.map(c => [c.name, c]));
const executable = (path, body = '#!/bin/sh\nexit 0\n') => { writeFileSync(path, body); chmodSync(path, 0o755); return path; };

test('an exact helper path is used as given: present and executable, or not built', () => {
  assert.equal(BUILD_OUTPUT, join(PACKAGE_DIR, '.build', 'release', 'cua-keychain'));
  assert.match(PACKAGE_DIR, /native\/keychain$/);
  const s = scratch();
  try {
    assert.deepEqual(locateHelper({path: join(s.dir, 'missing')}), {path: join(s.dir, 'missing'), built: false});
    const notExecutable = join(s.dir, 'plain');
    writeFileSync(notExecutable, 'x');
    assert.equal(locateHelper({path: notExecutable}).built, false);
    chmodSync(notExecutable, 0o755);
    assert.equal(locateHelper({path: notExecutable}).built, true);
  } finally { s.cleanup(); }
});

test('the helper is found in $CUA_HOME/bin first, then at the checkout\'s build output; nothing else is looked for', () => {
  const s = scratch();
  try {
    const home = join(s.dir, 'home');
    const build = join(s.dir, 'build', 'cua-keychain');
    const installed = installedHelperPath(home);
    assert.equal(installed, join(home, 'bin', 'cua-keychain'));
    assert.deepEqual(locateHelper({home, build}), {path: installed, built: false, searched: [installed, build]});
    mkdirSync(join(s.dir, 'build'));
    executable(build);
    assert.deepEqual(locateHelper({home, build}), {path: build, location: 'build', built: true});
    mkdirSync(join(home, 'bin'), {recursive: true});
    writeFileSync(installed, 'not executable');
    assert.equal(locateHelper({home, build}).location, 'build', 'a non-executable file in CUA_HOME/bin is skipped');
    chmodSync(installed, 0o755);
    assert.deepEqual(locateHelper({home, build}), {path: installed, location: 'home', built: true});
  } finally { s.cleanup(); }
});

test('installing the built helper puts an executable copy in $CUA_HOME/bin, replacing the previous one by rename', () => {
  const s = scratch();
  try {
    const home = join(s.dir, 'home');
    const first = executable(join(s.dir, 'first'), '#!/bin/sh\necho first\n');
    const target = installHelper({home, from: first});
    assert.equal(target, installedHelperPath(realpathSync(home)));
    assert.equal(statSync(target).mode & 0o777, 0o755);
    assert.equal(readFileSync(target, 'utf8'), '#!/bin/sh\necho first\n');
    const before = statSync(target).ino;
    const second = join(s.dir, 'second');
    writeFileSync(second, '#!/bin/sh\necho second\n', {mode: 0o600});
    installHelper({home, from: second});
    assert.equal(readFileSync(target, 'utf8'), '#!/bin/sh\necho second\n');
    assert.equal(statSync(target).mode & 0o777, 0o755);
    assert.notEqual(statSync(target).ino, before, 'replaced by rename, never rewritten in place');
    assert.throws(() => installHelper({home, from: join(s.dir, 'absent')}), {code: 'ENOENT'});
    assert.equal(readFileSync(target, 'utf8'), '#!/bin/sh\necho second\n', 'a failed install leaves the installed helper');
    assert.deepEqual(readdirSync(join(home, 'bin')), ['cua-keychain'], 'no temporary file is left');
  } finally { s.cleanup(); }
});

test('secrets.helper names where the helper was found, and every place it looked when it was not', () => {
  const ok = {built: true, protocols: [1], signature: {valid: true, adhoc: true}};
  const home = byName(classifyKeychainHelper({...ok, path: '/h/bin/cua-keychain', location: 'home'}))['secrets.helper'];
  assert.equal(home.status, 'pass');
  assert.match(home.detail, /\/h\/bin\/cua-keychain \(installed in CUA_HOME\/bin\)/);
  const build = byName(classifyKeychainHelper({...ok, path: '/c/.build/release/cua-keychain', location: 'build'}))['secrets.helper'];
  assert.equal(build.status, 'pass');
  assert.match(build.detail, /build output.*not installed in CUA_HOME\/bin.*npm run build:helper/);
  const none = byName(classifyKeychainHelper({path: '/h/bin/cua-keychain', built: false, searched: ['/h/bin/cua-keychain', '/c/.build/release/cua-keychain']}))['secrets.helper'];
  assert.equal(none.status, 'blocked');
  assert.match(none.detail, /\/h\/bin\/cua-keychain and \/c\/\.build\/release\/cua-keychain/);
});

test('an unbuilt helper blocks secrets with build guidance and says nothing about signing', () => {
  const checks = byName(classifyKeychainHelper({path: '/x/cua-keychain', built: false}));
  assert.equal(checks['secrets.helper'].status, 'blocked');
  assert.match(checks['secrets.helper'].detail, /npm run build:helper/);
  assert.equal(checks['secrets.signing'], undefined);
});

test('protocol and signature classify independently', () => {
  const base = {path: '/x/cua-keychain', built: true, protocols: [1]};
  const cases = [
    [{signature: {valid: true, adhoc: true}}, 'pass', 'blocked', /ad-hoc.*rebuilt helper may ask.*Developer ID/s],
    [{signature: {valid: true, adhoc: false, authority: 'Apple Development: someone (ABC)'}}, 'pass', 'blocked', /Apple Development.*not a distribution signature/],
    [{signature: {valid: true, adhoc: false, authority: 'Developer ID Application: Someone (ABC)'}}, 'pass', 'pass', /Developer ID Application/],
    [{signature: {valid: false}}, 'pass', 'fail', /does not verify/],
    [{protocols: [2], signature: {valid: true, adhoc: true}}, 'fail', 'blocked', /ad-hoc/],
    [{protocols: [], signature: {valid: true, adhoc: true}}, 'fail', 'blocked', /ad-hoc/],
  ];
  for (const [info, helper, signing, detail] of cases) {
    const checks = byName(classifyKeychainHelper({...base, ...info}));
    assert.equal(checks['secrets.helper'].status, helper, JSON.stringify(info));
    assert.equal(checks['secrets.signing'].status, signing, JSON.stringify(info));
    assert.match(checks['secrets.signing'].detail, detail);
  }
  assert.match(byName(classifyKeychainHelper({...base, protocols: [2], signature: {valid: true, adhoc: true}}))['secrets.helper'].detail, /protocol 2, cua expects 1.*npm run build:helper/);
});

test('inspection reads the protocol marker and the signature without executing the helper', async () => {
  const s = scratch();
  try {
    const helper = join(s.dir, 'cua-keychain');
    const ran = join(s.dir, 'ran');
    // If inspection ever executed the helper, this file would appear.
    writeFileSync(helper, `#!/bin/sh\ntouch ${ran}\n# usage ... cua-keychain broker protocol 1\n`);
    chmodSync(helper, 0o755);
    const codesign = join(s.dir, 'codesign');
    writeFileSync(codesign, '#!/bin/sh\nif [ "$1" = "--verify" ]; then exit 0; fi\nprintf "Executable=%s\\nIdentifier=cua-keychain\\nSignature=adhoc\\nTeamIdentifier=not set\\n" "$3" >&2\n');
    chmodSync(codesign, 0o755);
    const info = await inspectKeychainHelper({path: helper, codesign});
    assert.deepEqual(info, {path: helper, built: true, protocols: [1], signature: {valid: true, adhoc: true, identifier: 'cua-keychain', authority: undefined, teamIdentifier: 'not set'}});
    const {existsSync} = await import('node:fs');
    assert.equal(existsSync(ran), false);
    assert.deepEqual(await inspectKeychainHelper({path: join(s.dir, 'absent')}), {path: join(s.dir, 'absent'), built: false});
  } finally { s.cleanup(); }
});

test('inspection of a home\'s helper reads the installed copy, says so, and still never executes it', async () => {
  const s = scratch();
  try {
    const home = join(s.dir, 'home');
    mkdirSync(join(home, 'bin'), {recursive: true});
    const ran = join(s.dir, 'ran');
    const helper = executable(installedHelperPath(home), `#!/bin/sh\ntouch ${ran}\n# cua-keychain broker protocol 1\n`);
    const codesign = executable(join(s.dir, 'codesign'), '#!/bin/sh\nif [ "$1" = "--verify" ]; then exit 0; fi\nprintf "Signature=adhoc\\n" >&2\n');
    const info = await inspectKeychainHelper({home, build: join(s.dir, 'no-build'), codesign});
    assert.equal(info.path, helper);
    assert.equal(info.location, 'home');
    assert.equal(info.signature.adhoc, true);
    assert.match(byName(classifyKeychainHelper(info))['secrets.helper'].detail, /installed in CUA_HOME\/bin/);
    const {existsSync} = await import('node:fs');
    assert.equal(existsSync(ran), false);
  } finally { s.cleanup(); }
});
