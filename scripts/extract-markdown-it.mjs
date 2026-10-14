#!/usr/bin/env node
// Extracts markdown-it's self-contained browser bundle from the markdown-it package package.json pins (an exact
// devDependency) into src/browser-service/vendor/markdown-it/markdown-it.mjs, with the version in the sibling VERSION
// file. The browser service renders cua_type's rich text with it as the vendor's embedded copy does
// (src/browser-service/paste.mjs). The extractor refuses a pin that is not one exact version and an installed package of
// any other version, so the committed bundle is always the pinned release's: `npm ci && node scripts/extract-markdown-it.mjs`
// after changing the pin.
//
// The pin is the version the vendor embeds (readable chatgpt-26.928.40906 BS:20582-27399; the spec's Decision Log,
// M1c task 2). The bundle (dist/markdown-it.js, a UMD build that carries its dependencies) is wrapped unchanged as an ES
// module whose default export is the markdownit factory; nothing is set on the global object. markdown-it is MIT; the
// bundle includes entities (BSD-2-Clause), linkify-it, mdurl, punycode.js and uc.micro (MIT), whose licences the file
// carries from the installed packages.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pinnedVersion} from './extract-injected-script.mjs';

const PACKAGE = 'markdown-it';
const BUNDLE = 'dist/markdown-it.js';
const BUNDLED = ['entities', 'linkify-it', 'mdurl', 'punycode.js', 'uc.micro'];

// The licence text of the package installed at `dir` (its LICENSE, LICENSE.txt, LICENSE-MIT.txt, ...).
function licenceOf(dir, name) {
  const file = existsSync(dir) ? readdirSync(dir).find(f => /^licen[cs]e/i.test(f)) : undefined;
  if (file == null) throw new Error(`no licence file for ${name} under ${dir} (run npm ci)`);
  return readFileSync(join(dir, file), 'utf8');
}

const commented = text => text.trimEnd().split('\n').map(line => ` * ${line}`.trimEnd()).join('\n');

// `licences` [{name, text}]: markdown-it's first, then each bundled package's.
export function renderMarkdownIt({version, source, licences}) {
  if (licences.some(({text}) => text.includes('*/'))) throw new Error('a licence text would close the header comment');
  const [own, ...bundled] = licences;
  return `/*
 * markdown-it ${version}'s self-contained bundle from the npm package ${PACKAGE} ${version} (${BUNDLE}),
 * extracted unchanged by scripts/extract-markdown-it.mjs; do not edit, re-run the extractor. It is wrapped as an ES
 * module whose default export is the markdownit factory.
 *
 * ${own.name}'s licence:
 *
${commented(own.text)}
 *
 * The bundle includes ${bundled.map(l => l.name).join(', ')}; their licences:
${bundled.map(l => ` *\n * ${l.name}:\n *\n${commented(l.text)}`).join('\n')}
 */
const module = { exports: {} };
const exports = module.exports;
${source}
export default module.exports;
`;
}

// -> {version, content} of the module from the markdown-it installed under `root`; throws when the installed package is
// missing or is not the pinned version.
export function extractMarkdownIt(root) {
  const pin = pinnedVersion(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')), PACKAGE);
  const dir = join(root, 'node_modules', PACKAGE);
  if (!existsSync(join(dir, 'package.json'))) throw new Error(`${PACKAGE} ${pin} is not installed under ${root} (run npm ci)`);
  const installed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  if (installed !== pin) throw new Error(`refusing to extract: the installed ${PACKAGE} ${installed} does not match the pinned ${pin}`);
  const bundle = join(dir, BUNDLE);
  if (!existsSync(bundle)) throw new Error(`${PACKAGE} ${pin} has no bundle at ${BUNDLE}`);
  const source = readFileSync(bundle, 'utf8');
  if (!source.includes(`markdown-it ${pin}`)) throw new Error(`${BUNDLE} does not name ${PACKAGE} ${pin}`);
  const licences = [{name: PACKAGE, text: licenceOf(dir, PACKAGE)},
    ...BUNDLED.map(name => ({name, text: licenceOf(join(root, 'node_modules', name), name)}))];
  return {version: pin, content: renderMarkdownIt({version: pin, source, licences})};
}

// Writes markdown-it.mjs and VERSION into `outDir` -> {version, sha256} of the module.
export function writeMarkdownIt(root, outDir) {
  const {version, content} = extractMarkdownIt(root);
  mkdirSync(outDir, {recursive: true});
  writeFileSync(join(outDir, 'markdown-it.mjs'), content);
  writeFileSync(join(outDir, 'VERSION'), `${version}\n`);
  return {version, sha256: createHash('sha256').update(content).digest('hex')};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const {version, sha256} = writeMarkdownIt(root, join(root, 'src/browser-service/vendor/markdown-it'));
    console.log(`markdown-it.mjs ${sha256} from ${PACKAGE} ${version}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
