#!/usr/bin/env node
// #117 M4: ci-kit's gate `engine-swift` (.github/ci-kit.yml) checks the real bundle `cua engine build --sign adhoc
// --json` built under the gate's scratch HOME, the same buildEngine a Mac's install runs:
//
//   HOME=<scratch> node bin/cua.mjs engine build --sign adhoc --json > build.json
//   HOME=<scratch> node scripts/engine-gate/verify-bundle.mjs build.json
//
// The build lands in the pending slot beside the approved path (design ruling 1118) and stays there: nothing here
// approves, launches or opens the bundle, so no permission or capture prompt is raised. Checked: the answer names a
// fresh build in the slot; its build and version metadata match this checkout's source (src/runtime/engine-bundle.mjs;
// metadata only: that the binary is this source's rests on the gate compiling and assembling it fresh); the
// Info.plist (read by plutil) carries the engine's bundle id, LSUIElement true and that build and version; the
// executable is Mach-O code; `codesign --verify --strict` passes; the signature is ad hoc with hardened runtime, the
// engine's identifier and no entitlements; pending.json names the build, ad hoc; and no bundle or approved.json is at
// the approved path. One `PASS <label>` or `FAIL <label>: <detail>` line per check on stdout; exit 1 when any fails.
import {spawnSync} from 'node:child_process';
import {existsSync, openSync, readFileSync, readSync, closeSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {BUILD_KEY, BUNDLE_ID, EXECUTABLE, engineBuild, engineVersion} from '../../src/runtime/engine-bundle.mjs';
import {engineDirectory, enginePaths} from '../../src/runtime/engine.mjs';

const CODESIGN = '/usr/bin/codesign';
const PLUTIL = '/usr/bin/plutil';
// Thin (64-bit, either byte order) and universal Mach-O.
const MACHO_MAGICS = new Set(['feedfacf', 'cffaedfe', 'cafebabe', 'bebafeca']);

const readJson = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
function infoPlist(bundle, runSync) {
  const read = runSync(PLUTIL, ['-convert', 'json', '-o', '-', join(bundle, 'Contents', 'Info.plist')], {encoding: 'utf8'});
  if (read.status !== 0) return null;
  try { return JSON.parse(read.stdout); } catch { return null; }
}
function magic(path) {
  let fd;
  try {
    if (!(statSync(path).mode & 0o111)) return null;
    fd = openSync(path, 'r');
    const bytes = Buffer.alloc(4);
    return readSync(fd, bytes, 0, 4, 0) === 4 ? bytes.toString('hex') : null;
  } catch { return null; } finally { if (fd !== undefined) closeSync(fd); }
}

// -> [{label, ok, detail}], in the order above. `answer`: engine build's JSON; `dir`: the engine directory it built
// under; `expected`: {build, engineVersion} of the checkout's source.
export function verifyEngineBundle({answer, dir, expected, runSync = spawnSync}) {
  const paths = enginePaths(dir);
  const bundle = paths.pendingBundle;
  const checks = [];
  const check = (label, ok, detail) => checks.push({label, ok: Boolean(ok), detail});

  const inSlot = answer?.ok === true && answer.pending === true && answer.changed === true && answer.bundlePath === bundle;
  check('the build answered pending in the slot beside the approved path', inSlot,
    answer ? `ok ${answer.ok}, pending ${answer.pending}, changed ${answer.changed}, ${answer.bundlePath === bundle ? 'in the slot' : 'not in the slot'}` : 'no answer');
  check('the answer\'s build and version metadata match this checkout\'s source', answer?.build === expected.build && answer?.engineVersion === expected.engineVersion,
    `answered build ${answer?.build ?? 'none'} version ${answer?.engineVersion ?? 'none'}; source build ${expected.build} version ${expected.engineVersion}`);

  const plist = infoPlist(bundle, runSync);
  check(`Info.plist: bundle id ${BUNDLE_ID}`, plist?.CFBundleIdentifier === BUNDLE_ID, plist ? `CFBundleIdentifier ${plist.CFBundleIdentifier}` : 'no readable Info.plist');
  check('Info.plist: LSUIElement true', plist?.LSUIElement === true, plist ? `LSUIElement ${plist.LSUIElement}` : 'no readable Info.plist');
  check('Info.plist: build and version equal the source\'s', plist?.[BUILD_KEY] === expected.build && plist?.CFBundleShortVersionString === expected.engineVersion
    && plist?.CFBundleExecutable === EXECUTABLE,
  plist ? `${BUILD_KEY} ${plist[BUILD_KEY]}, version ${plist.CFBundleShortVersionString}, executable ${plist.CFBundleExecutable}` : 'no readable Info.plist');

  const head = magic(join(bundle, 'Contents', 'MacOS', EXECUTABLE));
  check('the executable is Mach-O code', MACHO_MAGICS.has(head), head ? `magic ${head}` : 'missing, not executable or unreadable');

  const verified = runSync(CODESIGN, ['--verify', '--strict', bundle], {encoding: 'utf8'});
  check('codesign --verify --strict', verified.status === 0, verified.status === 0 ? 'valid' : String(verified.stderr ?? '').trim().split('\n').at(-1));
  const details = runSync(CODESIGN, ['-d', '-vv', bundle], {encoding: 'utf8'});
  const text = `${details.stdout ?? ''}${details.stderr ?? ''}`;
  const flags = /flags=0x[0-9a-f]+\(([^)]*)\)/.exec(text)?.[1]?.split(',') ?? [];
  const identifier = /^Identifier=(.*)$/m.exec(text)?.[1];
  const entitlements = runSync(CODESIGN, ['-d', '--entitlements', '-', '--xml', bundle], {encoding: 'utf8'});
  const noEntitlements = entitlements.status === 0 && String(entitlements.stdout ?? '').trim() === '';
  check(`signed ad hoc with hardened runtime, identifier ${BUNDLE_ID}, no entitlements`,
    details.status === 0 && /^Signature=adhoc$/m.test(text) && flags.includes('runtime') && identifier === BUNDLE_ID && noEntitlements,
    details.status === 0 ? `flags (${flags.join(',')}), identifier ${identifier}, ${/^Signature=adhoc$/m.test(text) ? 'ad hoc' : 'not ad hoc'}, ${noEntitlements ? 'no entitlements' : 'entitlements present or unreadable'}`
      : `codesign -d exited ${details.status}`);

  const pending = readJson(paths.pending);
  check('pending.json names this build, ad hoc', pending?.build === expected.build && pending?.identity === 'adhoc',
    pending ? `build ${pending.build}, identity ${pending.identity}` : 'missing or unreadable');
  check('nothing approved: no bundle at the approved path, no approved.json', !existsSync(paths.bundle) && !existsSync(paths.approved),
    `bundle at the approved path ${existsSync(paths.bundle)}, approved.json ${existsSync(paths.approved)}`);
  return checks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const expected = {build: engineBuild(), engineVersion: engineVersion()};
  const checks = verifyEngineBundle({answer: readJson(process.argv[2]), dir: engineDirectory(), expected});
  console.log(`engine-gate: source build ${expected.build}, version ${expected.engineVersion}`);
  for (const c of checks) console.log(c.ok ? `PASS ${c.label}` : `FAIL ${c.label}: ${c.detail}`);
  const failures = checks.filter(c => !c.ok).length;
  console.log(failures ? `engine-gate: ${failures} of ${checks.length} checks failed` : `engine-gate: every check passed (${checks.length})`);
  process.exitCode = failures ? 1 : 0;
}
