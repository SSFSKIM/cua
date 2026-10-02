// What cua says about the Keychain helper without running it: build presence, broker protocol, code signature.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync, chmodSync} from 'node:fs';
import {join} from 'node:path';
import {locateHelper, inspectKeychainHelper, classifyKeychainHelper, HELPER_PATH, PACKAGE_DIR} from '../src/secrets/helper.mjs';
import {scratch} from './fixtures/runtime-fixture.mjs';

const byName = checks => Object.fromEntries(checks.map(c => [c.name, c]));

test('the helper is located only at the checkout\'s release build of native/keychain', () => {
  assert.equal(HELPER_PATH, join(PACKAGE_DIR, '.build', 'release', 'cua-keychain'));
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
