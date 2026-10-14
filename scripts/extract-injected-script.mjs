#!/usr/bin/env node
// Extracts Playwright's InjectedScript from the playwright-core package package.json pins (an exact devDependency) into
// src/browser-service/vendor/injected-script.js, with the version in the sibling VERSION file. The browser service
// installs that script in each frame it resolves selectors in (src/browser-service/injected.mjs). The extractor refuses
// a pin that is not one exact version and an installed package of any other version, so the committed script is always
// the pinned release's: `npm ci && node scripts/extract-injected-script.mjs` after changing the pin.
//
// The file defines one global, `PlaywrightInjected`, whose `InjectedScript` is the class (as the vendor's embedded copy
// exposes it); the generated source is wrapped unchanged. Playwright is Apache-2.0: the file carries the licence notice
// and the package's NOTICE.
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const PACKAGE = 'playwright-core';
const GENERATED = 'lib/generated/injectedScriptSource.js';
const EXACT = /^\d+\.\d+\.\d+$/;

// The exact version package.json pins `name` (playwright-core unless named) to as a devDependency.
export function pinnedVersion(packageJson, name = PACKAGE) {
  const pin = packageJson?.devDependencies?.[name];
  if (pin == null) throw new Error(`package.json has no ${name} devDependency`);
  if (!EXACT.test(pin)) throw new Error(`package.json must pin ${name} to one exact version (x.y.z), not "${pin}"`);
  return pin;
}

export function renderInjectedScript({version, source, notice}) {
  const noticeLines = notice.trimEnd().split('\n').map(line => ` * ${line}`.trimEnd()).join('\n');
  return `/*
 * Playwright's InjectedScript from the npm package ${PACKAGE} ${version} (${GENERATED}),
 * extracted unchanged by scripts/extract-injected-script.mjs; do not edit, re-run the extractor.
 *
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on
 * an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 *
 * The package's NOTICE:
 *
${noticeLines}
 */
var PlaywrightInjected = (() => {
const module = { exports: {} };
${source}
return { ...module.exports, InjectedScript: module.exports.InjectedScript() };
})();
`;
}

// -> {version, content} of the injected script from the playwright-core installed under `root`; throws when the
// installed package is missing or is not the pinned version.
export function extractInjectedScript(root) {
  const pin = pinnedVersion(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')));
  const dir = join(root, 'node_modules', PACKAGE);
  if (!existsSync(join(dir, 'package.json'))) throw new Error(`${PACKAGE} ${pin} is not installed under ${root} (run npm ci)`);
  const installed = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version;
  if (installed !== pin) throw new Error(`refusing to extract: the installed ${PACKAGE} ${installed} does not match the pinned ${pin}`);
  // The generated module is CommonJS; loaded by path, past the package's exports map.
  const {source} = createRequire(join(dir, 'package.json'))(join(dir, GENERATED));
  if (typeof source !== 'string' || !source.includes('InjectedScript')) throw new Error(`${PACKAGE} ${pin} has no injected script source at ${GENERATED}`);
  const notice = existsSync(join(dir, 'NOTICE')) ? readFileSync(join(dir, 'NOTICE'), 'utf8') : 'Playwright\nCopyright (c) Microsoft Corporation\n';
  return {version: pin, content: renderInjectedScript({version: pin, source, notice})};
}

// Writes injected-script.js and VERSION into `outDir` -> {version, sha256} of the script.
export function writeInjectedScript(root, outDir) {
  const {version, content} = extractInjectedScript(root);
  mkdirSync(outDir, {recursive: true});
  writeFileSync(join(outDir, 'injected-script.js'), content);
  writeFileSync(join(outDir, 'VERSION'), `${version}\n`);
  return {version, sha256: createHash('sha256').update(content).digest('hex')};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const {version, sha256} = writeInjectedScript(root, join(root, 'src/browser-service/vendor'));
    console.log(`injected-script.js ${sha256} from ${PACKAGE} ${version}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
