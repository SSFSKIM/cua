// A `busctl` stand-in for the accessibility-switch tests (a11y-status.test.mjs, qt-bridge.test.mjs), with stand-ins for
// the Qt applications, so nothing real starts.

import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';

/**
 * `busctl` on a PATH of the test's own: `get-property` answers the switch from `state` (a JSON file), `set-property`
 * writes it, each call logged with its arguments; and `kate` and `qtcreator` stand-ins that only log that they started.
 */
export function fakeBus(state) {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-a11y-path-'));
  const file = join(dir, 'state.json');
  const log = join(dir, 'calls.log');
  writeFileSync(file, JSON.stringify(state));
  writeFileSync(log, '');
  writeFileSync(
    join(dir, 'busctl'),
    `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify(['busctl', ...args]) + '\\n');
const state = JSON.parse(fs.readFileSync(${JSON.stringify(file)}, 'utf8'));
const i = args.indexOf('org.a11y.Status');
if (args.includes('set-property')) { state[args[i + 1]] = args[i + 3] === 'true'; fs.writeFileSync(${JSON.stringify(file)}, JSON.stringify(state)); }
else process.stdout.write(JSON.stringify({ type: 'b', data: state[args[i + 1]] }));
`,
  );
  // the Qt scenes' interpreter too, so nothing real starts even where a refusal fails to come
  for (const app of ['kate', 'qtcreator', 'python3']) {
    writeFileSync(join(dir, app), `#!/bin/sh\necho started >> ${JSON.stringify(join(dir, `${app}.started`))}\n`);
    chmodSync(join(dir, app), 0o755);
  }
  chmodSync(join(dir, 'busctl'), 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${saved}`;
  return {
    calls: () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)),
    state: () => JSON.parse(readFileSync(file, 'utf8')),
    started: (app) => existsSync(join(dir, `${app}.started`)),
    done() {
      process.env.PATH = saved;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

