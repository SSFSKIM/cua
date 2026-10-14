#!/usr/bin/env node
// Extracts Meriyah's UMD bundle from the meriyah package package.json pins (an exact devDependency) into
// src/repl-host/vendor/meriyah/meriyah.mjs, with the version in the sibling VERSION file. cua's own REPL kernel
// (src/repl-host/kernel.mjs) parses every cell with it, as the vendor's node_repl kernel does with its embedded copy. The
// extractor refuses a pin that is not one exact version, an installed package of any other version, a pin other than the
// version the vendor embeds, and a bundle whose bytes differ from the vendor-embedded copy's, so the committed parser is
// always the vendor's: `npm ci && node scripts/extract-meriyah.mjs` after changing the pin.
//
// The vendor embeds Meriyah 7.0.0's dist/meriyah.umd.min.js (readable chatgpt-26.928.40906 NR:meriyah.umd.min.js:1-5,
// a header naming the npm package, then the bundle unchanged at line 6); the spec
// docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, Design "Ports, parser and distribution", pins it. The
// bundle is wrapped unchanged as an ES module whose default export is the parser's exports (parse, parseModule,
// parseScript, version); nothing is set on the global object. Meriyah is ISC; the file carries the package's licence.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pinnedVersion} from './extract-injected-script.mjs';

const PACKAGE = 'meriyah';
const BUNDLE = 'dist/meriyah.umd.min.js';
const LICENCE = 'LICENSE.md';
// The version and the SHA-256 of the bundle bytes the vendor's node_repl embeds (NR:meriyah.umd.min.js from line 6 to
// the end, its header removed); the npm package's bundle is byte-identical.
export const VENDOR_VERSION = '7.0.0';
export const VENDOR_BUNDLE_SHA256 = 'cf33b925eeb0e22fdb657fde76f8cbb074cba0cf23eb97581b004ba61bc70900';

const commented = text => text.trimEnd().split('\n').map(line => ` * ${line}`.trimEnd()).join('\n');
const sha256 = text => createHash('sha256').update(text).digest('hex');

export function renderMeriyah({version, source, licence}) {
  if (licence.includes('*/')) throw new Error('the licence text would close the header comment');
  return `/*
 * Meriyah ${version}'s bundle from the npm package ${PACKAGE} ${version} (${BUNDLE}), byte-identical to the copy the
 * vendor's node_repl embeds (readable chatgpt-26.928.40906 NR:meriyah.umd.min.js:6, under its identifying header at
 * :1-5), extracted unchanged by scripts/extract-meriyah.mjs; do not edit, re-run the extractor. It is wrapped as an ES
 * module whose default export is the parser's exports.
 *
 * ${PACKAGE}'s licence:
 *
${commented(licence)}
 */
const module = { exports: {} };
const exports = module.exports;
${source}
export default module.exports;
`;
}

// -> {version, content} of the module from the meriyah installed under `root`; throws when the installed package is
// missing, is not the pinned version, the pin is not the vendor's version or the bundle is not the vendor's bytes
// (`expectSha256`, the vendor's unless a test names other bytes).
export function extractMeriyah(root, {expectSha256 = VENDOR_BUNDLE_SHA256} = {}) {
  const pin = pinnedVersion(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')), PACKAGE);
  const dir = join(root, 'node_modules', PACKAGE);
  if (!existsSync(join(dir, 'package.json'))) throw new Error(`${PACKAGE} ${pin} is not installed under ${root} (run npm ci)`);
  const installed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  if (installed !== pin) throw new Error(`refusing to extract: the installed ${PACKAGE} ${installed} does not match the pinned ${pin}`);
  if (pin !== VENDOR_VERSION) throw new Error(`refusing to extract: package.json pins ${PACKAGE} ${pin}, but the vendor embeds ${VENDOR_VERSION}`);
  const bundle = join(dir, BUNDLE);
  if (!existsSync(bundle)) throw new Error(`${PACKAGE} ${pin} has no bundle at ${BUNDLE}`);
  const source = readFileSync(bundle, 'utf8');
  if (sha256(source) !== expectSha256) throw new Error(`refusing to extract: ${PACKAGE} ${pin}'s ${BUNDLE} is not byte-identical to the vendor-embedded Meriyah (sha256 ${sha256(source)}, expected ${expectSha256})`);
  const licence = join(dir, LICENCE);
  if (!existsSync(licence)) throw new Error(`no licence file for ${PACKAGE} at ${LICENCE} (run npm ci)`);
  return {version: pin, content: renderMeriyah({version: pin, source, licence: readFileSync(licence, 'utf8')})};
}

// Writes meriyah.mjs and VERSION into `outDir` -> {version, sha256} of the module.
export function writeMeriyah(root, outDir, options) {
  const {version, content} = extractMeriyah(root, options);
  mkdirSync(outDir, {recursive: true});
  writeFileSync(join(outDir, 'meriyah.mjs'), content);
  writeFileSync(join(outDir, 'VERSION'), `${version}\n`);
  return {version, sha256: sha256(content)};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const {version, sha256: digest} = writeMeriyah(root, join(root, 'src/repl-host/vendor/meriyah'));
    console.log(`meriyah.mjs ${digest} from ${PACKAGE} ${version}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
