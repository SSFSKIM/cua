// Checks an `npm pack --dry-run --json` output for the M5 package contents: the owned first-call documents, the
// vendored parser and validator with their pins, the managed Node pins, and the package Node floor.
import {readFileSync} from 'node:fs';
const [packFile, packageFile] = process.argv.slice(2);
const raw = JSON.parse(readFileSync(packFile, 'utf8'));
const pack = Array.isArray(raw) ? raw[0] : Object.values(raw)[0];
const files = new Set(pack.files.map(f => f.path));
const pkg = JSON.parse(readFileSync(packageFile, 'utf8'));
const required = {
  documents: ['docs/cua-api/core.md', 'docs/cua-api/confirmations.md', 'docs/cua-api/other-browser-apis.md', 'docs/cua-api/PROVENANCE.md'],
  parser: ['src/repl-host/vendor/meriyah/meriyah.mjs', 'src/repl-host/vendor/meriyah/VERSION'],
  validator: ['src/cua-api/vendor/zod/LICENSE', 'src/cua-api/vendor/zod/VERSION', 'src/cua-api/vendor/zod/external.js'],
  nodePins: ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64'].map(p => `runtime/releases/node/24.22.0-${p}.json`),
  host: ['src/repl-host/supervisor.mjs', 'src/repl-host/kernel.mjs', 'src/repl-host/trusted-worker.mjs', 'src/cua-api/bootstrap.mjs'],
};
const checks = Object.fromEntries(Object.entries(required).map(([k, list]) => [k, {missing: list.filter(f => !files.has(f)), present: list.filter(f => files.has(f)).length}]));
const summary = {name: pack.name, version: pack.version, entryCount: pack.entryCount ?? pack.files.length, engines: pkg.engines,
  enginesFloorUnchanged: pkg.engines?.node === '^22.14 || >=23.7', checks,
  ok: Object.values(checks).every(c => c.missing.length === 0) && pkg.engines?.node === '^22.14 || >=23.7'};
console.log(JSON.stringify(summary, null, 2));
process.exitCode = summary.ok ? 0 : 1;
