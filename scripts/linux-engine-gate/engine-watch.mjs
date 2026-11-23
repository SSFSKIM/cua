#!/usr/bin/env node
// The facade fixtures' sampler judged (#171 M5, T1; Acceptance 1 and the M5 pre-flight's item 1). M4's 50 ms sampler
// (`m4/facade/scripts/watch.mjs`) records the most sky_linux processes seen at once and every cua-engine process with
// its executable and its parent's command line; M4 read that record by hand. On the pinned release the record is
// judged: no sky_linux at any sample, every cua-engine the run home's installed engine, and one of them a child of
// cua's trusted worker (the engine that answers; the launcher shim under the supervisor is the same binary).
//
//   node scripts/linux-engine-gate/engine-watch.mjs <watch.json> <the home's installed cua-engine>   exit 0 when it holds

import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TRUSTED_WORKER = /\/src\/repl-host\/trusted-worker\.mjs(\s|$)/;

/** The sampler's record against the installed `engine` (its real path): `{pass, problems}`. */
export function watchVerdict(watch, { engine }) {
  const problems = [];
  if (!(watch.samples > 0)) problems.push('the sampler took no samples');
  if (watch.maxSkyLinux !== 0) problems.push(`sky_linux was seen (${watch.maxSkyLinux} at once at most)`);
  for (const e of watch.engines ?? []) {
    if (e.exe !== engine) problems.push(`cua-engine ${e.pid} ran ${e.exe}, not the run home's installed engine ${engine}`);
  }
  if (!(watch.engines ?? []).some((e) => e.exe === engine && TRUSTED_WORKER.test(e.parent ?? ''))) problems.push("no cua-engine under the trusted worker: the engine that answered is not shown to be the home's");
  return { pass: problems.length === 0, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, engine] = process.argv.slice(2);
  if (!file || !engine) {
    process.stderr.write('usage: engine-watch.mjs <watch.json> <installed cua-engine>\n');
    process.exit(2);
  }
  const verdict = watchVerdict(JSON.parse(readFileSync(file, 'utf8')), { engine: realpathSync(engine) });
  process.stdout.write(verdict.pass ? `engine watch: PASS (only ${engine}, under the trusted worker; no sky_linux)\n` : `engine watch: FAIL: ${verdict.problems.join('; ')}\n`);
  process.exit(verdict.pass ? 0 : 1);
}
