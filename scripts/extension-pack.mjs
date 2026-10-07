#!/usr/bin/env node
// Pack the cua extension for self-hosting: dist/cua-extension-<version>.crx, a CRX3 signed with the owner's key (so
// its id is the manifest key's, CUA_EXTENSION_ID), and dist/update.xml, the Chrome update manifest naming that CRX. A
// Linux VM force-installs it through ExtensionInstallForcelist "<id>;<base>update.xml"; relay/deploy/update.sh --ext
// dist copies both to the relay's /ext/ route. Spec docs/doperpowers/specs/2026-10-07-own-chrome-extension-design.md,
// "Distribution".
//
//   CUA_EXTENSION_KEY=<pem path> node scripts/extension-pack.mjs [--out dist] [--base-url https://<host>/ext/]
//       [--extension <dir>]
//
// The key is read from the file and used only to sign; nothing here prints or copies it. The CRX's manifest gains
// `update_url` (<base>update.xml) so an installed copy finds later versions at the same place. Everything is
// deterministic (sorted entries, fixed timestamps, PKCS#1 v1.5 signatures): packing twice gives the same bytes.
import {createHash, createPrivateKey, createPublicKey, sign} from 'node:crypto';
import {mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {crc32, deflateRawSync} from 'node:zlib';
import {extensionIdFromKey} from '../src/chrome/extension.mjs';

export const DEFAULT_BASE_URL = 'https://178-104-102-73.sslip.io/ext/';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

// The files of an extension directory, sorted, without dotfiles (.DS_Store and the like).
function filesOf(dir) {
  const out = [];
  const walk = at => {
    for (const entry of readdirSync(at, {withFileTypes: true})) {
      if (entry.name.startsWith('.')) continue;
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) out.push(relative(dir, path).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

// A plain zip: deflated entries, no directory records, every timestamp 1980-01-01 00:00 (DOS date 0x21).
export function zipOf(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const {name, data} of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data, {level: 9});
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // version needed: 2.0 (deflate)
    local.writeUInt16LE(8, 8);            // method: deflate
    local.writeUInt16LE(0x21, 12);        // date; time (10) and flags (6) stay 0
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);         // version made by
    central.writeUInt16LE(20, 6);         // version needed
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(packed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, packed);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + packed.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

// Protocol buffers, as much as CRX3's header needs: varints and length-delimited fields.
const varint = n => { const out = []; while (n > 0x7f) { out.push((n & 0x7f) | 0x80); n = Math.floor(n / 128); } out.push(n); return Buffer.from(out); };
const field = (number, bytes) => Buffer.concat([varint(number * 8 + 2), varint(bytes.length), bytes]);

// CRX3 (Chromium components/crx_file/crx3.proto): "Cr24", version 3, the header's length, then the header
//   CrxFileHeader { repeated AsymmetricKeyProof sha256_with_rsa = 2; bytes signed_header_data = 10000; }
//   AsymmetricKeyProof { bytes public_key = 1; bytes signature = 2; }   SignedData { bytes crx_id = 1; }
// and the zip. The signature (RSA PKCS#1 v1.5, SHA-256) covers "CRX3 SignedData\0", the signed header data's length
// (u32 LE), that data and the zip; crx_id is the first 16 bytes of sha256(DER public key), the extension id's source.
export function crx3(zip, privateKey) {
  const publicDer = createPublicKey(privateKey).export({type: 'spki', format: 'der'});
  const signedHeaderData = field(1, createHash('sha256').update(publicDer).digest().subarray(0, 16));
  const length = Buffer.alloc(4);
  length.writeUInt32LE(signedHeaderData.length);
  const signature = sign('sha256', Buffer.concat([Buffer.from('CRX3 SignedData\0', 'latin1'), length, signedHeaderData, zip]), privateKey);
  const header = Buffer.concat([field(2, Buffer.concat([field(1, publicDer), field(2, signature)])), field(10000, signedHeaderData)]);
  const prefix = Buffer.alloc(12);
  prefix.write('Cr24', 0, 'latin1');
  prefix.writeUInt32LE(3, 4);
  prefix.writeUInt32LE(header.length, 8);
  return {crx: Buffer.concat([prefix, header, zip]), id: extensionIdFromKey(publicDer.toString('base64'))};
}

export const updateManifestXml = ({id, version, crxUrl}) => [
  "<?xml version='1.0' encoding='UTF-8'?>",
  "<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>",
  `  <app appid='${id}'>`,
  `    <updatecheck codebase='${crxUrl}' version='${version}' />`,
  '  </app>',
  '</gupdate>',
  '',
].join('\n');

// Writes <outDir>/cua-extension-<version>.crx and <outDir>/update.xml. Refuses a key whose id is not the manifest
// key's (a CRX under another id would never match the force-list entry), before writing anything.
export function packExtension({extensionDir, privateKeyPem, outDir, baseUrl}) {
  const manifest = JSON.parse(readFileSync(join(extensionDir, 'manifest.json'), 'utf8'));
  const privateKey = createPrivateKey(privateKeyPem);
  const expected = extensionIdFromKey(manifest.key);
  const updateUrl = `${baseUrl}update.xml`;
  const entries = filesOf(extensionDir).map(name => ({
    name,
    data: name === 'manifest.json' ? Buffer.from(JSON.stringify({...manifest, update_url: updateUrl}, null, 2) + '\n') : readFileSync(join(extensionDir, name)),
  }));
  const {crx, id} = crx3(zipOf(entries), privateKey);
  if (id !== expected) throw new Error(`key_mismatch: the signing key gives id ${id}, not the key of the manifest's id ${expected}`);
  const crxName = `cua-extension-${manifest.version}.crx`;
  mkdirSync(outDir, {recursive: true});
  const crxPath = join(outDir, crxName), updateXmlPath = join(outDir, 'update.xml');
  writeFileSync(crxPath, crx);
  writeFileSync(updateXmlPath, updateManifestXml({id, version: manifest.version, crxUrl: `${baseUrl}${crxName}`}));
  return {id, version: manifest.version, crxPath, updateXmlPath, updateUrl};
}

function main(argv) {
  const options = {out: join(ROOT, 'dist'), 'base-url': DEFAULT_BASE_URL, extension: join(ROOT, 'extension')};
  const usage = message => { console.error(`${message}\nusage: CUA_EXTENSION_KEY=<pem path> node scripts/extension-pack.mjs [--out <dir>] [--base-url https://<host>/<path>/] [--extension <dir>]`); return 2; };
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]?.replace(/^--/, '');
    if (!(name in options) || argv[i + 1] === undefined) return usage(`unknown or incomplete option: ${argv[i]}`);
    options[name] = argv[i + 1];
  }
  // The base URL lands in XML attributes and in Chrome's policy: plain characters only, a directory (trailing /).
  if (!/^https:\/\/[A-Za-z0-9.-]+(:\d+)?\/([A-Za-z0-9._~-]+\/)*$/.test(options['base-url']))
    return usage(`--base-url must be a plain https:// URL ending in /: ${options['base-url']}`);
  const keyPath = process.env.CUA_EXTENSION_KEY;
  if (!keyPath) return usage('CUA_EXTENSION_KEY is not set: the CRX is signed with the owner\'s key (a PEM file path)');
  try {
    const packed = packExtension({extensionDir: resolve(options.extension), privateKeyPem: readFileSync(keyPath, 'utf8'), outDir: resolve(options.out), baseUrl: options['base-url']});
    console.log(`cua extension ${packed.version}, id ${packed.id}\n  ${packed.crxPath}\n  ${packed.updateXmlPath} (force-list: ${packed.id};${packed.updateUrl})`);
    return 0;
  } catch (error) {
    // Messages from node:crypto name the failure, never the key's bytes.
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
