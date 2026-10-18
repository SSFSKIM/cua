// Linux: the original sandbox helper, invoked directly (docs/doperpowers/specs/2026-10-17-own-sandbox-design.md, Design
// "Linux: the original helper, invoked directly"). codex-linux-sandbox is openai/codex's own helper, built unmodified
// from an exact upstream release commit by this repository's workflow (.github/workflows/linux-sandbox-helper.yml),
// attested there and published as the release `linux-sandbox-<upstreamTag>`. The pin (runtime/sandbox/
// linux-sandbox.json) is the trust root: `cua install` places the asset for the machine's architecture at
// $CUA_HOME/sandbox/<upstreamTag>/codex-linux-sandbox after checking its SHA-256, and every launch checks the placed
// bytes against the pin again (verifyHelper: the connection's preflight, and the own host before each child it starts,
// with the path and pinned hash buildLaunch gives it); a missing or different helper refuses the launch
// (sandbox_unavailable).
//
// The argv is the one the original's own renderer produces for a permission profile (codex-rs/sandboxing/src/
// landlock.rs at the pinned commit): `--sandbox-policy-cwd <cwd> --command-cwd <cwd> --permission-profile <JSON> --
// <command>`. The helper enters bubblewrap (the system `bwrap` it finds on the caller's PATH, which cua fixes to
// /usr/bin:/bin:/usr/sbin:/sbin), re-executes itself from its own path inside the restricted filesystem, applies
// no_new_privs and seccomp (every socket `connect` refused unless the network is enabled) and runs the command; it fails
// closed on every setup error. cua never passes --use-legacy-landlock, --managed-network or the helper's internal flags.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fail} from '../runtime/errors.mjs';

export const HELPER_NAME = 'codex-linux-sandbox';
export const HELPER_PIN_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'runtime', 'sandbox', 'linux-sandbox.json');
const ARCHES = ['x64', 'arm64'];
const RELEASE_URL = 'https://github.com/SSFSKIM/cua/releases/download/';

const invalid = why => fail('invalid_pin', `the Linux sandbox helper pin: ${why}`);
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function exactKeys(value, keys, where) {
  if (!isObject(value)) invalid(`${where} must be an object`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) invalid(`${where} has an unknown field "${key}"`);
  for (const key of keys) if (!(key in value)) invalid(`${where} is missing "${key}"`);
}
const text = (value, where, pattern) => (typeof value === 'string' && pattern.test(value) ? value : invalid(`${where} is invalid: ${JSON.stringify(value)}`));

// The pin's JSON -> the pin, exactly: {upstreamTag, upstreamCommit, assets: {"linux-x64" | "linux-arm64": {url, length,
// sha256}}, attestation: {workflow, runId}}. Each asset is a release asset of this repository's
// `linux-sandbox-<upstreamTag>` release. Anything else is refused (invalid_pin).
export function parseHelperPin(json) {
  exactKeys(json, ['upstreamTag', 'upstreamCommit', 'assets', 'attestation'], 'the pin');
  const upstreamTag = text(json.upstreamTag, 'upstreamTag', /^rust-v\d+\.\d+\.\d+$/);
  const upstreamCommit = text(json.upstreamCommit, 'upstreamCommit', /^[0-9a-f]{40}$/);
  exactKeys(json.assets, ARCHES.map(arch => `linux-${arch}`), 'assets');
  const assets = {};
  for (const key of ARCHES.map(arch => `linux-${arch}`)) {
    const asset = json.assets[key];
    exactKeys(asset, ['url', 'length', 'sha256'], `assets.${key}`);
    const url = text(asset.url, `assets.${key}.url`, /^https:\/\//);
    if (!url.startsWith(`${RELEASE_URL}linux-sandbox-${upstreamTag}/`)) invalid(`assets.${key}.url must be an asset of this repository's linux-sandbox-${upstreamTag} release`);
    if (!Number.isSafeInteger(asset.length) || asset.length <= 0) invalid(`assets.${key}.length must be a positive integer`);
    assets[key] = {url, length: asset.length, sha256: text(asset.sha256, `assets.${key}.sha256`, /^[0-9a-f]{64}$/)};
  }
  exactKeys(json.attestation, ['workflow', 'runId'], 'attestation');
  const workflow = text(json.attestation.workflow, 'attestation.workflow', /^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/);
  if (!Number.isSafeInteger(json.attestation.runId) || json.attestation.runId <= 0) invalid('attestation.runId must be a positive integer');
  return {upstreamTag, upstreamCommit, assets, attestation: {workflow, runId: json.attestation.runId}};
}

export function loadHelperPin(file = HELPER_PIN_FILE) {
  let json;
  try { json = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { invalid(`${file}: ${error.message}`); }
  return parseHelperPin(json);
}

// The pinned asset for a machine of `arch` (process.arch).
export function helperAsset(pin, arch) {
  if (!ARCHES.includes(arch)) fail('unsupported_platform', `cua's Linux sandbox helper is built for ${ARCHES.join(' and ')}; this machine is ${arch}`);
  return pin.assets[`linux-${arch}`];
}

// Where `cua install` places the helper of `pin` in the cua home `home`.
export const helperDir = (home, pin) => join(home, 'sandbox', pin.upstreamTag);
export const helperPath = (home, pin) => join(helperDir(home, pin), HELPER_NAME);
export const sha256Of = bytes => createHash('sha256').update(bytes).digest('hex');

// The helper a launch on a machine of `arch` (process.arch) runs -> {path, sha256}: where `cua install` places the
// pinned asset in the cua home `home`, and the asset's pinned SHA-256. Nothing is read but the pin.
export function helperFor({home, arch, pin = loadHelperPin()}) {
  return {path: helperPath(home, pin), sha256: helperAsset(pin, arch).sha256};
}

// `helper` ({path, sha256}) when the file at `path` is exactly the pinned bytes; a missing, unreadable or different file
// refuses (sandbox_unavailable): nothing is ever launched under a helper the pin does not name, and nothing runs
// unconfined in its place. Read whole on every call (the helper is a few MB), so a file replaced after an earlier
// check is caught at the next launch.
export function verifyHelper(helper) {
  const {path, sha256} = helper ?? {};
  if (typeof path !== 'string' || typeof sha256 !== 'string')
    fail('sandbox_unavailable', 'this launch names no Linux sandbox helper, so no JavaScript cell or trusted service can be confined; nothing was started', {hint: 'run cua from a checkout whose runtime/sandbox/linux-sandbox.json pins the helper, then `cua install`'});
  let bytes;
  try { bytes = readFileSync(path); } catch (error) {
    fail('sandbox_unavailable', `cua's Linux sandbox helper ${path} is not installed (${error.code ?? 'unreadable'}), so no JavaScript cell or trusted service can be confined; nothing was started`,
      {hint: 'run `cua install` to fetch and verify it, or set CUA_SHIM_SANDBOX=disabled to run without a sandbox openly'});
  }
  const actual = sha256Of(bytes);
  if (actual !== sha256) fail('sandbox_unavailable', `cua's Linux sandbox helper ${path} has SHA-256 ${actual}, not the pinned ${sha256}; it is not run, and nothing was started`,
    {hint: `remove ${dirname(path)} and run \`cua install\` to place the pinned helper again`});
  return helper;
}

// The placed helper of the pin for `arch`, verified (helperFor, then verifyHelper) -> {path, sha256}.
export const linuxHelper = ({home, arch, pin = loadHelperPin()}) => verifyHelper(helperFor({home, arch, pin}));

// The helper's argv for `command` ([file, ...args]) under `profile` (the original's permission-profile JSON) in `cwd`.
export function linuxCommand({profile, cwd, command, helper}) {
  return {file: helper.path, args: ['--sandbox-policy-cwd', cwd, '--command-cwd', cwd, '--permission-profile', JSON.stringify(profile), '--', ...command]};
}
