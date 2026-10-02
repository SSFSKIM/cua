// Verification of an extracted release tree against its pin, shared by install (in staging, before activation),
// `runtime use` and doctor. Each check returns a result; `verifyRuntimeTree` turns the first failure into a classified
// error. Signature checks run the system `codesign` against a requirement naming Apple's anchor and the pinned team,
// so a validly signed binary from anyone else is rejected too. Nothing here launches or modifies vendor code.
import {existsSync, readFileSync} from 'node:fs';
import {execFile} from 'node:child_process';
import {join} from 'node:path';
import {fail} from './errors.mjs';

export function checkLayout(root, pin) {
  const missing = Object.entries(pin.layout).filter(([, rel]) => !existsSync(join(root, rel))).map(([key, rel]) => `${key} (${rel})`);
  return {ok: missing.length === 0, missing};
}

export function checkVendorManifest(root, pin) {
  const file = join(root, pin.layout.vendorManifest);
  let vendor;
  try { vendor = JSON.parse(readFileSync(file, 'utf8')); } catch (error) { return {ok: false, detail: `cannot read ${pin.layout.vendorManifest}: ${error.message}`}; }
  const expected = {
    platform: pin.platform, arch: pin.arch, target: `${pin.platform}-${pin.arch}`,
    node_version: pin.runtime.node, runtime_archive_version: pin.runtime.version,
  };
  const mismatched = Object.entries(expected).filter(([key, value]) => vendor[key] !== value)
    .map(([key, value]) => `${key} is ${JSON.stringify(vendor[key])}, pin expects ${JSON.stringify(value)}`);
  return mismatched.length
    ? {ok: false, detail: `${pin.layout.vendorManifest}: ${mismatched.join('; ')}`}
    : {ok: true, detail: `runtime ${vendor.runtime_archive_version}, node ${vendor.node_version}, ${vendor.target}`};
}

// The native IPC version the vendor client speaks, read from its source. A mismatch with the pin means the pinned
// compatibility data no longer describes this tree.
export function ipcVersionsIn(text, expected) {
  const family = expected.replace(/-\d+$/, '');
  return [...new Set(text.match(new RegExp(`${family}-\\d+`, 'g')) ?? [])];
}

export function checkIpc(root, pin) {
  let source;
  try { source = readFileSync(join(root, pin.layout.ipcClient), 'latin1'); } catch (error) { return {ok: false, found: [], detail: `cannot read ${pin.layout.ipcClient}: ${error.message}`}; }
  const found = ipcVersionsIn(source, pin.runtime.ipc);
  const ok = found.length === 1 && found[0] === pin.runtime.ipc;
  return {ok, found, detail: ok ? `client speaks ${pin.runtime.ipc}` : `client speaks ${found.join(', ') || 'no recognizable IPC version'}, pin expects ${pin.runtime.ipc}`};
}

export const signingRequirement = team => `anchor apple generic and certificate leaf[subject.OU] = "${team}"`;

export async function verifyCodeSignatures(root, pin, {codesign = '/usr/bin/codesign'} = {}) {
  const requirement = `=${signingRequirement(pin.signing.team)}`;
  return Promise.all(pin.signing.components.map(component => new Promise(resolve => {
    execFile(codesign, ['--verify', '--deep', '--strict', '-R', requirement, join(root, component)], {encoding: 'utf8'}, (error, stdout, stderr) => {
      const detail = (stderr || stdout || '').trim().split('\n').slice(-2).join(' ');
      resolve({component, valid: !error, detail: error ? detail || error.message : `signed by team ${pin.signing.team}`});
    });
  })));
}

export async function verifyRuntimeTree(root, pin, {verifySignatures = verifyCodeSignatures} = {}) {
  const layout = checkLayout(root, pin);
  if (!layout.ok) fail('layout_invalid', `release ${pin.release} is missing ${layout.missing.join(', ')}`);
  const vendor = checkVendorManifest(root, pin);
  if (!vendor.ok) fail('vendor_manifest_mismatch', `release ${pin.release}: ${vendor.detail}`);
  const ipc = checkIpc(root, pin);
  if (!ipc.ok) fail('ipc_mismatch', `release ${pin.release}: ${ipc.detail}`);
  const signatures = await verifySignatures(root, pin);
  const bad = signatures.filter(s => !s.valid);
  if (bad.length || signatures.length !== pin.signing.components.length)
    fail('signature_invalid', `release ${pin.release}: invalid vendor signature on ${bad.map(s => `${s.component} (${s.detail})`).join(', ') || 'unchecked components'}`);
  return {vendor, ipc, signatures};
}
