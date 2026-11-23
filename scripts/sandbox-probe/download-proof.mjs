// Allowlisted public evidence of the hosted gate's real download. The successful install and its matching install
// record prove hash/length verification; no raw report fields or local paths are printed. Run metadata is attached
// by the controller only after the hosted run finishes, in M4's checked-in download-proof.json.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {findPin, loadPins, readInstalledRecord} from '../../src/runtime/manifest.mjs';

export function downloadProof(result) {
  if (result?.ok !== true || result.changed !== true || result.source !== 'download')
    throw new Error('not a successful fresh download');
  const pin = findPin(loadPins(), result.release);
  if (pin.platform !== 'darwin') throw new Error('not a macOS pin');
  const record = readInstalledRecord(result.root, pin);
  if (record.source !== 'download') throw new Error('the install record is not a download');
  return {outcome: 'PASS', source: 'download', release: pin.release, urlHost: new URL(pin.archive.url).host,
    sha256: record.archive.sha256, hashVerified: true, archiveSize: record.archive.length};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const proof = downloadProof(JSON.parse(readFileSync(process.argv[2], 'utf8')));
    console.error(`hosted-gate: download proof ${JSON.stringify(proof)}`);
  } catch {
    console.error('hosted-gate: download proof not established');
    process.exitCode = 1;
  }
}
