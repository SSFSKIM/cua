// The assembly of `cua Engine.app` (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, Design "The engine";
// "Install, signing and permissions"): the bundle's layout and Info.plist around the release executable `swift build`
// leaves, and `build`, the hash of the native/engine/ source tree plus this file, so two bundles with the same `build`
// are the same program. This file is the "assembling script" the hash covers: it holds only what decides the bundle's
// bytes before signing. Signing is ./engine-sign.mjs's, and the install steps around it ./engine.mjs's, so an edit to
// either does not move `build`. M0's scripts/spike/engine/assemble.mjs is the record this was promoted from.
import {createHash} from 'node:crypto';
import {chmodSync, copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname, join, relative, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const ASSEMBLER = fileURLToPath(import.meta.url);
export const ENGINE_SOURCE = join(dirname(ASSEMBLER), '..', '..', 'native', 'engine');
export const BUNDLE_ID = 'io.github.ssfskim.cua.engine';
export const BUNDLE_NAME = 'cua Engine.app';
export const EXECUTABLE = 'cua-engine';
export const BUILD_KEY = 'CUAEngineBuild';

// Build products, SwiftPM state and Finder litter are not the program; nor is the package's unit-test directory, which
// the release executable does not contain.
const IGNORED = new Set(['.build', '.swiftpm', '.DS_Store']);
const IGNORED_AT_ROOT = new Set(['Tests']);

function sourceFiles(root, dir = root) {
  const files = [];
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (IGNORED.has(entry.name) || (dir === root && IGNORED_AT_ROOT.has(entry.name))) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(root, path));
    else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'));
  }
  return files;
}

// `build`: SHA-256 over every source file (its relative path and its bytes' SHA-256, in path order) and then this
// file's bytes.
export function engineBuild({sourceRoot = ENGINE_SOURCE, assembler = ASSEMBLER} = {}) {
  const hash = createHash('sha256');
  for (const file of sourceFiles(sourceRoot).sort()) {
    hash.update(`${file}\0`);
    hash.update(createHash('sha256').update(readFileSync(join(sourceRoot, file))).digest('hex'));
    hash.update('\0');
  }
  hash.update('assemble\0');
  hash.update(readFileSync(assembler));
  return hash.digest('hex');
}

// The package's version, from the one line of Version.swift that declares it.
export function engineVersion(sourceRoot = ENGINE_SOURCE) {
  const match = readFileSync(join(sourceRoot, 'Sources', 'Engine', 'Version.swift'), 'utf8').match(/\bengineVersion = "([^"]+)"/);
  if (!match) throw new Error('no engineVersion in Version.swift');
  return match[1];
}

const xml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function infoPlist({version, build}) {
  const strings = {
    CFBundleDevelopmentRegion: 'en', CFBundleDisplayName: 'cua Engine', CFBundleExecutable: EXECUTABLE,
    CFBundleIdentifier: BUNDLE_ID, CFBundleInfoDictionaryVersion: '6.0', CFBundleName: 'cua Engine',
    CFBundlePackageType: 'APPL', CFBundleShortVersionString: version, CFBundleVersion: version,
    [BUILD_KEY]: build, LSMinimumSystemVersion: '14.0',
  };
  const body = Object.entries(strings).map(([key, value]) => `\t<key>${key}</key>\n\t<string>${xml(value)}</string>`)
    .concat('\t<key>LSUIElement</key>\n\t<true/>').join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${body}
</dict>
</plist>
`;
}

// Writes an unsigned `cua Engine.app` into `out` (replacing one there) around `executable`. -> the bundle's path.
export function assembleBundle({executable, out, version, build}) {
  const bundle = join(out, BUNDLE_NAME);
  rmSync(bundle, {recursive: true, force: true});
  mkdirSync(join(bundle, 'Contents', 'MacOS'), {recursive: true});
  writeFileSync(join(bundle, 'Contents', 'Info.plist'), infoPlist({version, build}));
  writeFileSync(join(bundle, 'Contents', 'PkgInfo'), 'APPL????');
  copyFileSync(executable, join(bundle, 'Contents', 'MacOS', EXECUTABLE));
  chmodSync(join(bundle, 'Contents', 'MacOS', EXECUTABLE), 0o755);
  return bundle;
}
