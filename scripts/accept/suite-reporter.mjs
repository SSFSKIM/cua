// Acceptance-only node:test reporter. The runner's structured events are the sole source of facts: no raw child
// output or t.diagnostic text is forwarded. Nested runners' output arrives as stdout events and is ignored too.
import {realpathSync} from 'node:fs';
import {diagnosticName, failureDiagnostic, FAILURE_PREFIX, COMPLETE_PREFIX} from './tap-diagnostics.mjs';

export default async function* reporter(source) {
  const root = realpathSync(process.cwd());
  let failures = 0, skips = 0, truncated = false;
  for await (const {type, data} of source) {
    if (type === 'test:fail') {
      if (failures++ < 100) yield FAILURE_PREFIX + JSON.stringify(failureDiagnostic(data, {root})) + '\n';
      else truncated = true;
    }
    if ((type === 'test:pass' || type === 'test:fail') && data.skip)
      yield `ok ${++skips} - skipped test # SKIP${typeof data.skip === 'string' ? ' ' + diagnosticName(data.skip) : ''}\n`;
    // Per-file summaries also arrive; only the root summary describes the whole invocation.
    if (type === 'test:summary' && data.file === undefined) {
      yield COMPLETE_PREFIX + truncated + '\n';
      for (const [name, key] of Object.entries({tests: 'tests', suites: 'suites', pass: 'passed', fail: 'failed', cancelled: 'cancelled', skipped: 'skipped', todo: 'todo'}))
        yield `# ${name} ${data.counts[key]}\n`;
    }
  }
}
