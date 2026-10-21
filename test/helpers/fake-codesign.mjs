// A fake of the engine bundle's code signature for the engine install tests (src/runtime/engine-sign.mjs, engine.mjs):
// a marker file inside the bundle stands for its signature, and `fakeCodesignRead` answers `codesign -d -vv
// --extract-certificates=<prefix> <bundle>` from it as codesign would (the leaf certificate written to <prefix>0, the
// subject as the first Authority line; `Signature=adhoc`; or unsigned). Nothing here runs codesign.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export const NAME = 'Apple Development: Test Owner (TEAM123456)';
const CERT = Buffer.from('a leaf certificate');
export const CERT_SHA1 = createHash('sha1').update(CERT).digest('hex').toUpperCase();

// A fake `codesign -d -vv --extract-certificates=<prefix> <bundle>`: the bundle's fake signature marker decides.
export function fakeCodesignRead(file, args) {
  assert.equal(file, '/usr/bin/codesign');
  const bundle = args.at(-1);
  const prefix = args.find(a => a.startsWith('--extract-certificates='))?.slice('--extract-certificates='.length);
  let marker;
  try { marker = JSON.parse(readFileSync(join(bundle, 'Contents', '_CodeSignature', 'fake.json'), 'utf8')); } catch {
    return {status: 1, stdout: '', stderr: `${bundle}: code object is not signed at all\n`};
  }
  if (marker.kind === 'adhoc') return {status: 0, stdout: '', stderr: 'Executable=x\nCodeDirectory v=20400 flags=0x10002(adhoc,runtime)\nSignature=adhoc\n'};
  writeFileSync(`${prefix}0`, Buffer.from(marker.cert, 'base64'));
  writeFileSync(`${prefix}1`, Buffer.from('an intermediate'));
  return {status: 0, stdout: '', stderr: `Executable=x\nCodeDirectory v=20400 flags=0x10000(runtime)\nAuthority=${marker.name}\nAuthority=Apple Worldwide Developer Relations Certification Authority\nAuthority=Apple Root CA\n`};
}

export function markSigned(bundle, kind) {
  mkdirSync(join(bundle, 'Contents', '_CodeSignature'), {recursive: true});
  writeFileSync(join(bundle, 'Contents', '_CodeSignature', 'fake.json'), JSON.stringify(kind === 'adhoc' ? {kind} : {kind, name: NAME, cert: CERT.toString('base64')}));
}
