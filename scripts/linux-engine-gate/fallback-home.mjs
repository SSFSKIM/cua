#!/usr/bin/env node
// The fallback homes of #171 M5 (the pre-flight's §3, F5 and F5a): a run home `cua install` made, shaped into one where
// the default must keep the vendor's engine. Each is how a person's home can stand when cua is updated:
//   none        no cua engine: a home that never installed one (its engine and install.json removed)
//   previous    linux-engine-v0.4.2, the pin just before this cua's: the newest engine below MIN_ENGINE_VERSION, a home
//               that installed the last pin and was then updated; placed as `older` is
//   released    linux-engine-v0.4.0, the engine the released plugin pins (main): the upgrade every home installed from
//               a released cua meets; placed as `older` is
//   older       linux-engine-v0.3.0, older than this cua needs, placed by cua's own install step from that release's
//               pin, so its bytes are checked against the pin and its install.json is the one 0.3.0's install wrote
//   unrecorded  the current install.json beside 0.3.0's executable: an interrupted downgrade (placeLinuxEngine renames
//               the file before it writes the record), whose record must not be trusted
// The run home is CUA_HOME; the shaped home is checked against what the selection reads (verifiedLinuxEngineVersion).
//   CUA_HOME=<run home> node scripts/linux-engine-gate/fallback-home.mjs <kind>   one JSON line; exit 0 when shaped
import {mkdirSync, mkdtempSync, renameSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {installLinuxEngine} from '../../src/runtime/install.mjs';
import {homeLayout, realHome} from '../../src/runtime/layout.mjs';
import {inspectLinuxEngine, linuxEngineDir, linuxEnginePath, loadEnginePin, parseEnginePin, readEngineRecord, verifiedLinuxEngineVersion} from '../../src/runtime/linux-engine.mjs';

// linux-engine-v0.4.2's pin, as runtime/engine/linux-engine.json held it from fdacae86 until 0.4.3's (0710ebc1).
export const PREVIOUS_PIN = parseEnginePin({
  version: '0.4.2',
  release: 'linux-engine-v0.4.2',
  assets: {
    x64: {url: 'https://github.com/SSFSKIM/cua/releases/download/linux-engine-v0.4.2/cua-engine-0.4.2-linux-x64', sha256: 'a1314106a388167191670d38c0b67292617fe0f7e929f133ff7343b4a8a85a78'},
    arm64: {url: 'https://github.com/SSFSKIM/cua/releases/download/linux-engine-v0.4.2/cua-engine-0.4.2-linux-arm64', sha256: '25035ca1b4c8f2c4dd42568e570f54f5994da0f894a84c036d59eedc58f1092f'},
  },
});
// linux-engine-v0.4.0's pin, as runtime/engine/linux-engine.json held it from M4's release (78b4959c) until 0.4.1's
// (df720b0d), and as the released plugin (main) still pins it.
export const RELEASED_PIN = parseEnginePin({
  version: '0.4.0',
  release: 'linux-engine-v0.4.0',
  assets: {
    x64: {url: 'https://github.com/SSFSKIM/cua/releases/download/linux-engine-v0.4.0/cua-engine-0.4.0-linux-x64', sha256: '751ec9be45e1f5b8e10fc3aa0a4695f785ecb12a44acd5b069374926ba383cca'},
    arm64: {url: 'https://github.com/SSFSKIM/cua/releases/download/linux-engine-v0.4.0/cua-engine-0.4.0-linux-arm64', sha256: '0cbde8f06ca2f70a1ea962fd49452591a2ca16961c746f5d90bfccf53e890d42'},
  },
});
// linux-engine-v0.3.0's pin, as runtime/engine/linux-engine.json held it from M3's release (9d3fdce6) until M4's.
export const OLDER_PIN = parseEnginePin({
  version: '0.3.0',
  release: 'linux-engine-v0.3.0',
  assets: {
    x64: {url: 'https://github.com/SSFSKIM/cua/releases/download/linux-engine-v0.3.0/cua-engine-0.3.0-linux-x64', sha256: '5f4a1600e66b7f7b458948462fc4701942583af9674ad41798188d1312687b60'},
    arm64: {url: 'https://github.com/SSFSKIM/cua/releases/download/linux-engine-v0.3.0/cua-engine-0.3.0-linux-arm64', sha256: '57e699b4eaf8a817b54b3cbdbb473ac038cdf5d7e2ca60c66f7c476a793d9e5f'},
  },
});
export const FALLBACK_KINDS = ['none', 'previous', 'released', 'older', 'unrecorded'];
// the kinds placed from an older release's pin, by the pin each is installed from
const PINNED_KINDS = ['previous', 'released', 'older'];

/**
 * Shapes the cua home `home` (which holds this cua's install) into the fallback home `kind`; `olderPin`, `releasedPin`
 * and `previousPin` the older releases' pins and `fetch`, `host` the install step's seams (tests). -> {kind, engine: {sha256, build, version} | null,
 * record: {version, sha256} | null, verifiedVersion}.
 */
export async function shapeFallbackHome({home, kind, olderPin = OLDER_PIN, releasedPin = RELEASED_PIN, previousPin = PREVIOUS_PIN, fetch = globalThis.fetch, host = {platform: process.platform, arch: process.arch}, pin = loadEnginePin()}) {
  if (!FALLBACK_KINDS.includes(kind)) throw new Error(`a fallback home is ${FALLBACK_KINDS.join(', ')}, not ${kind}`);
  const real = realHome(home);
  if (kind === 'none') rmSync(linuxEngineDir(real), {recursive: true, force: true});
  if (PINNED_KINDS.includes(kind)) await installLinuxEngine({home: real, pin: {older: olderPin, released: releasedPin, previous: previousPin}[kind], fetch, host});
  if (kind === 'unrecorded') {
    // the older engine installed in a scratch home beside this one (the same volume), then renamed over this home's
    // engine, leaving this home's record as it is
    const staging = homeLayout(real).staging;
    mkdirSync(staging, {recursive: true, mode: 0o700});
    const scratch = mkdtempSync(join(staging, 'fallback-older-'));
    try {
      const {path} = await installLinuxEngine({home: scratch, pin: olderPin, fetch, host});
      renameSync(path, linuxEnginePath(real));
    } finally {
      rmSync(scratch, {recursive: true, force: true});
    }
  }
  const facts = inspectLinuxEngine({home: real, arch: host.arch, pin});
  const record = readEngineRecord(real);
  return {kind, engine: facts.exists ? {sha256: facts.sha256, build: facts.build, version: facts.version} : null,
    record: record && {version: record.version, sha256: record.sha256}, verifiedVersion: verifiedLinuxEngineVersion({home: real, arch: host.arch, pin})};
}

// What each kind must read as, for the selection to keep the vendor's engine for that kind's reason.
export function shapeProblem(shaped) {
  const {kind, engine, record, verifiedVersion} = shaped;
  if (kind === 'none') return engine === null ? null : 'an engine is still placed';
  if (PINNED_KINDS.includes(kind)) {
    const {version} = {older: OLDER_PIN, released: RELEASED_PIN, previous: PREVIOUS_PIN}[kind];
    return engine?.version === version && verifiedVersion === version ? null : `the engine reads as ${verifiedVersion}, not ${version}`;
  }
  return engine && record && record.sha256 !== engine.sha256 && record.version !== OLDER_PIN.version && verifiedVersion === null ? null : 'the record is not a newer one beside another file';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const kind = process.argv[2];
  if (!process.env.CUA_HOME || !FALLBACK_KINDS.includes(kind)) {
    process.stderr.write(`usage: CUA_HOME=<run home> fallback-home.mjs ${FALLBACK_KINDS.join('|')}\n`);
    process.exit(2);
  }
  const shaped = await shapeFallbackHome({home: process.env.CUA_HOME, kind});
  const problem = shapeProblem(shaped);
  process.stdout.write(`${JSON.stringify({...shaped, ...(problem ? {problem} : {})})}\n`);
  process.exit(problem ? 1 : 0);
}
