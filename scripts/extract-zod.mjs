#!/usr/bin/env node
// Extracts the Zod validator cua's browser client (src/cua-api/browser-client.mjs) validates with from the zod package
// package.json pins (an exact devDependency) into src/cua-api/vendor/zod/, with the version in the sibling VERSION file
// and the package's MIT licence beside it. The extractor refuses a pin that is not one exact version, an installed
// package of any other version, a pin other than the version the vendor's client bundles, and any file whose bytes are
// not the pinned release's, so the committed validator is always that release: `npm ci && node scripts/extract-zod.mjs`
// after changing the pin.
//
// The vendor's browser client bundles Zod's v3 API inline (readable chatgpt-26.928.40906
// R/cua_node/@oai/cua/dist/lib/js/oai_js_browser/dist/skill/scripts/browser-client.js:518-4677). Its code is the `v3`
// directory of the npm package zod 3.25.68 to 3.25.76, which is the same in all of them: every string, template and
// regular-expression literal of the bundled copy and of those files is the same set, apart from the files' import
// paths, while 3.25.67 and earlier lack the bundle's JWT header check and 3.24 carries private-field helpers the bundle
// does not (M3 task 2 report). The latest of them is pinned. The spec,
// docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (Design "Owned facade and first-call documentation",
// Constraints), allows a vendored validator under the exact-pin rule with no runtime dependency; the files are copied
// unchanged, only the module graph the browser client imports (v3/external.js and what it reaches).
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {pinnedVersion} from './extract-injected-script.mjs';

const PACKAGE = 'zod';
export const VENDOR_VERSION = '3.25.76';
// Package path -> SHA-256 of zod 3.25.76's bytes. The vendored directory holds each under its path below v3/ (LICENSE
// at the top).
export const FILES = {
  'v3/external.js': '5d26d2e47e2352def36f89a3e8bf8581da22b7f857e07ef3114cd52cf4813445',
  'v3/errors.js': 'd40831f478288d76e82bbbcc3b7e95c8513b6e76471f2d49a37c979bc57d492d',
  'v3/locales/en.js': '51a6dcc5d4bd52a64da127c012c6c963395c1d9a343ad75d4a8eca662fc8b205',
  'v3/helpers/parseUtil.js': 'b57484013bb360bac2e334d58fcd5f6cbfa63ffcc7d8ff3dbbb3380ca659b956',
  'v3/helpers/typeAliases.js': '8e609bb71c20b858c77f0e9f90bb1319db8477b13f9f965f1a1e18524bf50881',
  'v3/helpers/util.js': '906ef685e5853d496e293ee8f8a2bb8b1ed2d078a1bcdfedb2dfd61d75b6330c',
  'v3/helpers/errorUtil.js': '68589c0cf44c8b4ad19b77418f53caad2cd1dbc8d714f526e1876ebdee4828c5',
  'v3/types.js': '9763a2938f0e7f983363ef4bf6530e7583e3f2d54f8a4a6684efad58febc6e8e',
  'v3/ZodError.js': 'f5ac9e86b92e201d41e294d7aa35986a2aa28829e1bcc8ac25f7c8dce0674b99',
  LICENSE: '3f1189b28e3866e0d979968d466b78f813f76827cfdca1fbb124cc0a5c8841f8',
};

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// Where a package file lands in the vendored directory.
export const vendoredPath = file => file.replace(/^v3\//, '');

// -> {version, files: [[vendored path, bytes]]} from the zod installed under `root`; throws when the installed package
// is missing, is not the pinned version, the pin is not the vendor's version or a file is not the release's bytes
// (`expect`, the release's unless a test names other bytes).
export function extractZod(root, {expect = FILES} = {}) {
  const pin = pinnedVersion(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')), PACKAGE);
  const dir = join(root, 'node_modules', PACKAGE);
  if (!existsSync(join(dir, 'package.json'))) throw new Error(`${PACKAGE} ${pin} is not installed under ${root} (run npm ci)`);
  const installed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  if (installed !== pin) throw new Error(`refusing to extract: the installed ${PACKAGE} ${installed} does not match the pinned ${pin}`);
  if (pin !== VENDOR_VERSION) throw new Error(`refusing to extract: package.json pins ${PACKAGE} ${pin}, but the vendor's browser client bundles ${VENDOR_VERSION}'s v3 code`);
  const files = Object.entries(expect).map(([file, digest]) => {
    const path = join(dir, file);
    if (!existsSync(path)) throw new Error(`${PACKAGE} ${pin} has no ${file}`);
    const bytes = readFileSync(path);
    if (sha256(bytes) !== digest) throw new Error(`refusing to extract: ${PACKAGE} ${pin}'s ${file} is not the pinned release's bytes (sha256 ${sha256(bytes)}, expected ${digest})`);
    return [vendoredPath(file), bytes];
  });
  return {version: pin, files};
}

// Replaces `outDir` with the extracted files and VERSION -> {version, count}.
export function writeZod(root, outDir, options) {
  const {version, files} = extractZod(root, options);
  rmSync(outDir, {recursive: true, force: true});
  for (const [file, bytes] of files) {
    mkdirSync(dirname(join(outDir, file)), {recursive: true});
    writeFileSync(join(outDir, file), bytes);
  }
  writeFileSync(join(outDir, 'VERSION'), `${version}\n`);
  return {version, count: files.length};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const {version, count} = writeZod(root, join(root, 'src/cua-api/vendor/zod'));
    console.log(`${count} files from ${PACKAGE} ${version}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
