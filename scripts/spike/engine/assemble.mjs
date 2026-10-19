#!/usr/bin/env node
// Assembles and signs `cua Engine.app` from a `swift build -c release` scratch path (docs/doperpowers/specs/
// 2026-10-18-own-native-engine-design.md, Concrete Steps "M0 spike build and sign"; the seed of M1b's buildEngine):
//
//   node scripts/spike/engine/assemble.mjs --build /tmp/cua-engine-build --identity "$CUA_SIGNING_IDENTITY" --out /tmp/cua-engine-spike
//
// The bundle is an LSUIElement app with the engine's bundle id and minimum macOS 14; its Info.plist carries the
// package's version (read from Version.swift) and `build`, the hash of the native/engine/ source tree plus this script,
// which the engine's ping reports. Signed with hardened runtime and no entitlements, with the identity given (a common
// name or SHA-1 from `security find-identity -v -p codesigning`, or `adhoc`). Prints the bundle's path.
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join, relative, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const ASSEMBLE_SCRIPT = fileURLToPath(import.meta.url);
export const ENGINE_SOURCE = join(dirname(ASSEMBLE_SCRIPT), '..', '..', '..', 'native', 'engine');
export const BUNDLE_ID = 'io.github.ssfskim.cua.engine';
export const BUNDLE_NAME = 'cua Engine.app';
const EXECUTABLE = 'cua-engine';

// Build products, SwiftPM state and Finder litter are not the program.
const IGNORED = new Set(['.build', '.swiftpm', '.DS_Store']);

function sourceFiles(root, dir = root) {
  const files = [];
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    if (IGNORED.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...sourceFiles(root, path));
    else if (entry.isFile()) files.push(relative(root, path).split(sep).join('/'));
  }
  return files;
}

// `build`: SHA-256 over every source file (its relative path and its bytes' SHA-256, in path order) and then this
// script's bytes, so two bundles with the same build are the same program.
export function engineBuild({sourceRoot = ENGINE_SOURCE, script = ASSEMBLE_SCRIPT} = {}) {
  const hash = createHash('sha256');
  for (const file of sourceFiles(sourceRoot).sort()) {
    hash.update(`${file}\0`);
    hash.update(createHash('sha256').update(readFileSync(join(sourceRoot, file))).digest('hex'));
    hash.update('\0');
  }
  hash.update('assemble\0');
  hash.update(readFileSync(script));
  return hash.digest('hex');
}

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
    CUAEngineBuild: build, LSMinimumSystemVersion: '14.0',
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

class Refusal extends Error {}

function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    if (!['--build', '--identity', '--out'].includes(flag) || i + 1 >= argv.length) throw new Refusal(`usage: assemble.mjs --build <scratch> --identity <identity|adhoc> --out <dir> (at ${flag ?? 'end'})`);
    options[flag.slice(2)] = argv[i + 1];
  }
  if (!options.identity) throw new Refusal('no signing identity: pass --identity "$CUA_SIGNING_IDENTITY" (an Apple Development identity from `security find-identity -v -p codesigning`) or --identity adhoc');
  if (!options.build || !options.out) throw new Refusal('usage: assemble.mjs --build <scratch> --identity <identity|adhoc> --out <dir>');
  return options;
}

export function assemble({build: scratch, identity, out}) {
  const binary = join(scratch, 'release', EXECUTABLE);
  if (!existsSync(binary)) throw new Refusal(`no release executable at ${binary}: run swift build -c release --package-path native/engine --scratch-path ${scratch}`);
  const builtAt = statSync(binary).mtimeMs;
  const newer = sourceFiles(ENGINE_SOURCE).find(file => statSync(join(ENGINE_SOURCE, file)).mtimeMs > builtAt);
  if (newer) throw new Refusal(`the executable at ${binary} is older than native/engine/${newer}: run swift build -c release again`);

  const build = engineBuild();
  const bundle = join(out, BUNDLE_NAME);
  rmSync(bundle, {recursive: true, force: true});
  mkdirSync(join(bundle, 'Contents', 'MacOS'), {recursive: true});
  writeFileSync(join(bundle, 'Contents', 'Info.plist'), infoPlist({version: engineVersion(), build}));
  writeFileSync(join(bundle, 'Contents', 'PkgInfo'), 'APPL????');
  copyFileSync(binary, join(bundle, 'Contents', 'MacOS', EXECUTABLE));
  chmodSync(join(bundle, 'Contents', 'MacOS', EXECUTABLE), 0o755);

  const sign = spawnSync('codesign', ['--force', '--sign', identity === 'adhoc' ? '-' : identity, '--options', 'runtime', '--timestamp=none', bundle], {encoding: 'utf8'});
  if (sign.status !== 0) throw new Refusal(`codesign failed: ${sign.stderr.trim()}`);
  const verify = spawnSync('codesign', ['--verify', '--strict', bundle], {encoding: 'utf8'});
  if (verify.status !== 0) throw new Refusal(`the signed bundle does not verify: ${verify.stderr.trim()}`);
  return {bundle, build};
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const {bundle, build} = assemble(parseArgs(process.argv.slice(2)));
    process.stderr.write(`build ${build}\n`);
    process.stdout.write(`${bundle}\n`);
  } catch (error) {
    process.stderr.write(`assemble: ${error instanceof Refusal ? error.message : error.stack}\n`);
    process.exit(1);
  }
}
