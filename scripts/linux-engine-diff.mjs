#!/usr/bin/env node
// The differential harness (#171, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Verification
// system): a contract test that sends the same well-formed requests to OpenAI's two Linux engine builds and to
// cua-engine, each over the engine wire, and compares their answers — the output, the speed, the
// accessibility-bus calls, the effect read back, and the desktop state a witness watches for the whole of each
// input operation. M0's first cut; the library lives in scripts/linux-engine-diff/.

import { parseArgs } from './linux-engine-diff/cli.mjs';
import { declareLiveRun } from './linux-engine-diff/xspawn.mjs';

// the harness reaches the session's display by design: its X tools, engines and applications may (xspawn.mjs)
declareLiveRun('the differential harness (scripts/linux-engine-diff.mjs)');

const args = (() => {
  try {
    return parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(2);
  }
})();

if (args.mode === 'check-wire') {
  const { checkWire, formatWireReport } = await import('./linux-engine-diff/wire-check.mjs');
  const results = await checkWire({ skyDir: args.vendorJs });
  const lines = formatWireReport(results);
  for (const line of lines) process.stdout.write(`${line}\n`);
  process.exit(lines.some((l) => l.startsWith('FAIL')) ? 1 : 0);
} else if (args.mode === 'summarize') {
  const { writeSummary } = await import('./linux-engine-diff/report.mjs');
  process.stdout.write(`${writeSummary(args.out)}\n`);
} else if (args.mode === 'record-wire') {
  const { recordWire } = await import('./linux-engine-diff/record-wire.mjs');
  await recordWire(args);
} else if (args.mode === 'experiment') {
  const { runExperiment } = await import('./linux-engine-diff/experiments.mjs');
  const { RunRefused } = await import('./linux-engine-diff/run.mjs');
  const { CandidateRefused } = await import('./linux-engine-diff/candidate.mjs');
  try {
    process.exit((await runExperiment(args)) ? 0 : 1);
  } catch (error) {
    // nothing ran: the run's name is taken, a gate step has no judge, or a gate experiment's candidate is not one a gate
    // takes (candidate.mjs)
    if (error instanceof RunRefused) process.stderr.write(`run refused: ${error.message}\n`);
    else if (error instanceof CandidateRefused) process.stderr.write(`candidate refused: ${error.message}\n`);
    else throw error;
    process.exit(2);
  }
} else {
  const { RunRefused, runDiff } = await import('./linux-engine-diff/run.mjs');
  const { CandidateRefused } = await import('./linux-engine-diff/candidate.mjs');
  try {
    process.exit((await runDiff(args)) ? 0 : 1);
  } catch (error) {
    // nothing ran: the run's name is taken, or the candidate is not one a gate takes (candidate.mjs)
    if (error instanceof RunRefused) process.stderr.write(`run refused: ${error.message}\n`);
    else if (error instanceof CandidateRefused) process.stderr.write(`candidate refused: ${error.message}\n`);
    else throw error;
    process.exit(2);
  }
}
