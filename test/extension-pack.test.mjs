// scripts/extension-pack.mjs: the self-hosted CRX3 (signed with the owner's key, so its id is the manifest key's id)
// and the Chrome update manifest naming it. A Linux VM force-installs that CRX from the relay's /ext/ route (spec
// docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md, "Distribution", H4). These tests sign with a key
// generated here; the owner's key never enters a test.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash, createPublicKey, generateKeyPairSync, verify} from 'node:crypto';
import {cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {CUA_EXTENSION_ID, extensionIdFromKey} from '../src/chrome/extension.mjs';
import {DEFAULT_BASE_URL, packExtension, updateManifestXml} from '../scripts/extension-pack.mjs';

const EXTENSION = fileURLToPath(new URL('../extension/', import.meta.url));
const SCRIPT = fileURLToPath(new URL('../scripts/extension-pack.mjs', import.meta.url));

function scratch(t) {
  const dir = mkdtempSync(join(tmpdir(), 'cua-pack-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
}
// A copy of extension/ whose manifest key is a freshly generated key's, plus that key as a PEM file.
function fixture(t) {
  const dir = scratch(t);
  const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
  const der = publicKey.export({type: 'spki', format: 'der'});
  const extensionDir = join(dir, 'extension');
  cpSync(EXTENSION, extensionDir, {recursive: true});
  const manifest = JSON.parse(readFileSync(join(extensionDir, 'manifest.json'), 'utf8'));
  writeFileSync(join(extensionDir, 'manifest.json'), JSON.stringify({...manifest, key: der.toString('base64')}, null, 2) + '\n');
  writeFileSync(join(extensionDir, '.DS_Store'), 'finder litter');
  const keyPath = join(dir, 'key.pem');
  writeFileSync(keyPath, privateKey.export({type: 'pkcs8', format: 'pem'}), {mode: 0o600});
  return {dir, extensionDir, keyPath, der, id: extensionIdFromKey(der.toString('base64')), version: manifest.version};
}

// The CRX3 container: "Cr24", version 3, the header length, a CrxFileHeader protobuf, then the zip.
function varint(buf, at) {
  let value = 0, shift = 0, byte;
  do { byte = buf[at++]; value += (byte & 0x7f) * 2 ** shift; shift += 7; } while (byte & 0x80);
  return [value, at];
}
function fields(buf) {
  const out = [];
  for (let at = 0; at < buf.length;) {
    let tag, length;
    [tag, at] = varint(buf, at);
    assert.equal(tag & 7, 2, 'every CRX3 header field is length-delimited');
    [length, at] = varint(buf, at);
    out.push({field: Math.floor(tag / 8), bytes: buf.subarray(at, at + length)});
    at += length;
  }
  return out;
}
function parseCrx(crx) {
  assert.equal(crx.subarray(0, 4).toString('latin1'), 'Cr24');
  assert.equal(crx.readUInt32LE(4), 3);
  const headerSize = crx.readUInt32LE(8);
  const header = fields(crx.subarray(12, 12 + headerSize));
  const proofs = header.filter(f => f.field === 2).map(f => Object.fromEntries(fields(f.bytes).map(p => [p.field, p.bytes])));
  const signedHeaderData = header.find(f => f.field === 10000).bytes;
  const crxId = fields(signedHeaderData).find(f => f.field === 1).bytes;
  return {proofs, signedHeaderData, crxId, zip: crx.subarray(12 + headerSize), header};
}
const unzip = (zipPath, ...args) => spawnSync('unzip', [...args, zipPath], {encoding: 'buffer'});

test('the CRX is a CRX3 signed by the given key over the CRX3 signed data and the zip, its crx_id the key\'s id', t => {
  const f = fixture(t);
  const out = join(f.dir, 'dist');
  const result = packExtension({extensionDir: f.extensionDir, privateKeyPem: readFileSync(f.keyPath, 'utf8'), outDir: out, baseUrl: 'https://relay.example/ext/'});
  assert.equal(result.id, f.id);
  assert.equal(result.crxPath, join(out, `cua-extension-${f.version}.crx`));
  const crx = parseCrx(readFileSync(result.crxPath));
  assert.deepEqual(crx.header.map(h => h.field).sort((a, b) => a - b), [2, 10000], 'one RSA proof and the signed header data');
  assert.equal(crx.proofs.length, 1);
  assert.deepEqual(crx.proofs[0][1], f.der, 'the proof carries the DER public key');
  assert.deepEqual(crx.crxId, createHash('sha256').update(f.der).digest().subarray(0, 16));
  const idFromCrx = [...crx.crxId.toString('hex')].map(c => String.fromCharCode(97 + parseInt(c, 16))).join('');
  assert.equal(idFromCrx, f.id);
  const length = Buffer.alloc(4);
  length.writeUInt32LE(crx.signedHeaderData.length);
  const signed = Buffer.concat([Buffer.from('CRX3 SignedData\0', 'latin1'), length, crx.signedHeaderData, crx.zip]);
  assert.ok(verify('sha256', signed, createPublicKey({key: f.der, format: 'der', type: 'spki'}), crx.proofs[0][2]), 'the signature verifies');
});

test('the CRX\'s zip holds extension/ byte for byte (no dotfiles) with update_url added to its manifest', t => {
  const f = fixture(t);
  const result = packExtension({extensionDir: f.extensionDir, privateKeyPem: readFileSync(f.keyPath, 'utf8'), outDir: join(f.dir, 'dist'), baseUrl: 'https://relay.example/ext/'});
  const zipPath = join(f.dir, 'payload.zip');
  writeFileSync(zipPath, parseCrx(readFileSync(result.crxPath)).zip);
  const tested = unzip(zipPath, '-t');
  assert.equal(tested.status, 0, tested.stdout.toString() + tested.stderr.toString());
  const listed = unzip(zipPath, '-Z1').stdout.toString().trim().split('\n').sort();
  const expected = ['background.js', 'manifest.json', 'popup.html', 'popup.js', ...readdirSync(join(f.extensionDir, 'icons')).map(n => `icons/${n}`)].sort();
  assert.deepEqual(listed, expected);
  for (const name of expected.filter(n => n !== 'manifest.json'))
    assert.deepEqual(spawnSync('unzip', ['-p', zipPath, name]).stdout, readFileSync(join(f.extensionDir, name)), name);
  const packed = JSON.parse(spawnSync('unzip', ['-p', zipPath, 'manifest.json']).stdout.toString());
  const source = JSON.parse(readFileSync(join(f.extensionDir, 'manifest.json'), 'utf8'));
  assert.deepEqual(packed, {...source, update_url: 'https://relay.example/ext/update.xml'});
});

test('update.xml names the id, the version and the CRX URL; packing twice gives the same bytes', t => {
  const f = fixture(t);
  const pack = outDir => packExtension({extensionDir: f.extensionDir, privateKeyPem: readFileSync(f.keyPath, 'utf8'), outDir, baseUrl: 'https://relay.example/ext/'});
  const a = pack(join(f.dir, 'a')), b = pack(join(f.dir, 'b'));
  assert.equal(readFileSync(a.updateXmlPath, 'utf8'), updateManifestXml({id: f.id, version: f.version, crxUrl: `https://relay.example/ext/cua-extension-${f.version}.crx`}));
  assert.equal(readFileSync(a.updateXmlPath, 'utf8'), [
    "<?xml version='1.0' encoding='UTF-8'?>",
    "<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>",
    `  <app appid='${f.id}'>`,
    `    <updatecheck codebase='https://relay.example/ext/cua-extension-${f.version}.crx' version='${f.version}' />`,
    '  </app>',
    '</gupdate>',
    '',
  ].join('\n'));
  assert.deepEqual(readFileSync(a.crxPath), readFileSync(b.crxPath));
});

test('a key that is not the manifest key\'s is refused before anything is written', t => {
  const f = fixture(t);
  const other = generateKeyPairSync('rsa', {modulusLength: 2048}).privateKey.export({type: 'pkcs8', format: 'pem'});
  assert.throws(() => packExtension({extensionDir: f.extensionDir, privateKeyPem: other, outDir: join(f.dir, 'dist'), baseUrl: DEFAULT_BASE_URL}),
    /key_mismatch: .*not the key of the manifest's id/);
  assert.deepEqual(readdirSync(f.dir).sort(), ['extension', 'key.pem']);
});

test('the CLI: the relay\'s /ext/ by default, --out and --base-url, and refusals that never echo the key', t => {
  const f = fixture(t);
  const run = (env, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], {encoding: 'utf8', env: {...process.env, CUA_EXTENSION_KEY: '', ...env}});
  assert.equal(DEFAULT_BASE_URL, 'https://178-104-102-73.sslip.io/ext/');

  const missing = run({}, '--out', join(f.dir, 'x'));
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /CUA_EXTENSION_KEY/);

  // The real extension/ with a key that is not the owner's: refused, and the PEM is not echoed.
  const wrong = run({CUA_EXTENSION_KEY: f.keyPath}, '--out', join(f.dir, 'x'));
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, new RegExp(`key_mismatch: .*${CUA_EXTENSION_ID}`));
  assert.doesNotMatch(wrong.stderr + wrong.stdout, /PRIVATE KEY/);

  const out = join(f.dir, 'dist');
  const ok = run({CUA_EXTENSION_KEY: f.keyPath}, '--extension', f.extensionDir, '--out', out);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(readFileSync(join(out, 'update.xml'), 'utf8'), /codebase='https:\/\/178-104-102-73\.sslip\.io\/ext\/cua-extension-/);
  assert.match(ok.stdout, new RegExp(`id ${f.id}`));
  assert.doesNotMatch(ok.stdout, /PRIVATE KEY/);

  const custom = run({CUA_EXTENSION_KEY: f.keyPath}, '--extension', f.extensionDir, '--out', join(f.dir, 'c'), '--base-url', 'https://other.example/x/');
  assert.equal(custom.status, 0, custom.stderr);
  assert.match(readFileSync(join(f.dir, 'c', 'update.xml'), 'utf8'), /codebase='https:\/\/other\.example\/x\/cua-extension-/);
  for (const bad of ['http://plain.example/ext/', 'https://no-slash.example/ext', "https://q.example/'/"]) {
    const refused = run({CUA_EXTENSION_KEY: f.keyPath}, '--extension', f.extensionDir, '--out', join(f.dir, 'r'), '--base-url', bad);
    assert.equal(refused.status, 2, bad);
  }
});
