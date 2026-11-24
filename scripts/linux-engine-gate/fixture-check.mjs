#!/usr/bin/env node
// The comparator fixture's check in a `:0` step's own launch path (#171 M6b, T3 fix wave 1, finding 1). A `:0` step is
// launched from the command `gate.mjs print` (or `--list`) gives, through the sitting launcher and run71.sh straight to
// the harness, none of which reads the fixture; a check made only when the command was printed would leave every byte
// between that moment and the launch unchecked. So the command starts here, under the host lock and before the sitting
// launcher starts any guard or display: the fixture is checked as `gate.mjs run` checks it (vendor-fixture.mjs), the
// harness's `--vendor` and `--vendor-js` must be the checked fixture's own paths, and only then is the rest of the
// command run, its exit status this one's. A fixture that does not check stops the launch with nothing started.
//
//   node scripts/linux-engine-gate/fixture-check.mjs --vendor-fixture <dir> --arch <arch> -- <command> [args...]
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyVendorFixture } from '../linux-engine-diff/vendor-fixture.mjs';

const USAGE = 'usage: fixture-check.mjs --vendor-fixture <dir> --arch <arch> -- <command> [args...]';

/** `argv` -> {dir, arch, command: [program, ...args]}; throws on anything else. */
export function parseFixtureCheck(argv) {
  const at = argv.indexOf('--');
  const own = at < 0 ? argv : argv.slice(0, at);
  const command = at < 0 ? [] : argv.slice(at + 1);
  const flag = (name) => (own.includes(name) ? own[own.indexOf(name) + 1] : undefined);
  const dir = flag('--vendor-fixture');
  const arch = flag('--arch');
  if (!dir || !arch || !command.length || own.length !== 4) throw new Error(USAGE);
  return { dir: resolve(dir), arch, command };
}

/** The value after `name` in `argv`, or undefined. */
const valueOf = (argv, name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);

/**
 * The check, then the command -> the exit status: 2 when the fixture does not check or the command names another
 * vendor build or client than the checked fixture's (nothing is started), else the command's own. `verify` and
 * `spawnChild` are seams; `say` writes one line to stderr.
 */
export async function checkThenRun({ dir, arch, command }, { verify = verifyVendorFixture, spawnChild = spawn, say = (line) => process.stderr.write(`${line}\n`) } = {}) {
  let fixture;
  try {
    fixture = verify({ dir, arch });
  } catch (error) {
    say(`fixture-check: the comparator fixture at ${dir} does not check, so the step does not start: ${error.message}`);
    return 2;
  }
  for (const [flag, path] of [['--vendor', fixture.vendor], ['--vendor-js', fixture.vendorJs]]) {
    const named = valueOf(command, flag);
    if (named !== undefined && named !== path) {
      say(`fixture-check: the command's ${flag} is ${named}, not the checked fixture's ${path}; the step does not start`);
      return 2;
    }
  }
  say(`fixture-check: the comparator fixture at ${dir} checks (tar ${fixture.entry?.tar?.sha256 ?? '?'}; the pinned build ${fixture.vendor}, ${fixture.binarySha256 ?? '?'})`);
  const [program, ...args] = command;
  const child = spawnChild(program, args, { stdio: 'inherit' });
  const forward = (signal) => child.kill(signal);
  process.on('SIGTERM', forward);
  process.on('SIGINT', forward);
  try {
    return await new Promise((done) => {
      child.once('error', (error) => {
        say(`fixture-check: ${program} could not start: ${error.message}`);
        done(127);
      });
      child.once('exit', (code, signal) => done(code ?? (signal ? 128 + 15 : 1)));
    });
  } finally {
    process.off('SIGTERM', forward);
    process.off('SIGINT', forward);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let parsed;
  try {
    parsed = parseFixtureCheck(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(2);
  }
  process.exitCode = await checkThenRun(parsed);
}
