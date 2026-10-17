#!/usr/bin/env node
// Writes the seatbelt golden fixtures (#115 M0) from the original's generator (src/main.rs, built by generate.sh):
//
//   node scripts/sandbox-golden/generate.mjs --generator <cua-sandbox-golden binary> --out test/fixtures/sandbox/seatbelt
//     [--check <file>]    also compile every generated profile with /usr/bin/sandbox-exec (both TIOCSTI forms, the
//                         command replaced by /usr/bin/true) and write each case's exit status there as JSON
//     [--case <name>]     only the named case (repeatable)
//
// Each case (cases.mjs) gets a fresh scratch root under the real temporary directory: its setup is created there, the
// placeholders in its input are filled (fixtures.mjs), the generator runs with HOME in the root and the case's TMPDIR,
// and its output is mapped back to placeholders. macOS only: the original's seatbelt code is compiled for macOS alone.
import {spawnSync} from 'node:child_process';
import {mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {parseArgs} from 'node:util';
import {CASES} from './cases.mjs';
import {assertFixtureRoot, materialize, placehold, substitute} from './fixtures.mjs';

export const UPSTREAM = {repository: 'openai/codex', tag: 'rust-v0.159.2', commit: 'ff6aec96948b70d94983af2641a6b67c94faeff5'};

// The sandbox-exec argv of `args` (the generator's) with the command after `--` replaced by /usr/bin/true.
const compileOnly = args => [...args.slice(0, args.indexOf('--') + 1), '/usr/bin/true'];

function runCase(spec, {generator, check}) {
  const root = realpathSync(mkdtempSync(join(realpathSync(tmpdir()), 'sg')));
  try {
    assertFixtureRoot(root);
    materialize(spec.setup, {root});
    const input = substitute(spec.input, {root});
    const env = {HOME: `${root}/home`, PATH: '/usr/bin:/bin:/usr/sbin:/sbin', ...(spec.tmpdir === null ? {} : {TMPDIR: substitute(spec.tmpdir, {root})})};
    const run = spawnSync(generator, [], {input: JSON.stringify(input), env, encoding: 'utf8'});
    if (run.status !== 0) throw new Error(`generator failed for ${spec.name} (${run.status ?? run.signal}): ${run.stderr.trim()}`);
    const output = JSON.parse(run.stdout);
    let checked = null;
    if (check && !output.error) {
      const compile = args => {
        const r = spawnSync('/usr/bin/sandbox-exec', compileOnly(args), {cwd: input.cwd, encoding: 'utf8', env: {PATH: '/usr/bin:/bin'}});
        return {status: r.status, stderr: placehold(r.stderr.trim(), {root, euid: process.geteuid()})};
      };
      checked = {name: spec.name, symbolic: compile(output.argsSymbolic), numeric: compile(output.argsNumeric)};
    }
    const fixture = {name: spec.name, description: spec.description, upstream: UPSTREAM, setup: spec.setup, tmpdir: spec.tmpdir,
      input: spec.input, output: placehold(output, {root, euid: process.geteuid()})};
    return {fixture, checked};
  } finally { rmSync(root, {recursive: true, force: true}); }
}

function main() {
  const {values} = parseArgs({options: {generator: {type: 'string'}, out: {type: 'string'}, check: {type: 'string'}, case: {type: 'string', multiple: true}}});
  if (process.platform !== 'darwin') throw new Error('the seatbelt golden fixtures are generated on macOS');
  if (!values.generator || !values.out) throw new Error('usage: generate.mjs --generator <binary> --out <dir> [--check <file>] [--case <name>]...');
  const cases = values.case ? CASES.filter(c => values.case.includes(c.name)) : CASES;
  if (values.case && cases.length !== values.case.length) throw new Error(`unknown case among ${values.case.join(', ')}`);
  mkdirSync(values.out, {recursive: true});
  const checks = [];
  for (const spec of cases) {
    const {fixture, checked} = runCase(spec, {generator: values.generator, check: Boolean(values.check)});
    writeFileSync(join(values.out, `${spec.name}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
    if (checked) checks.push(checked);
    process.stderr.write(`${spec.name}: ${fixture.output.error ? `error: ${fixture.output.error}` : `${fixture.output.argsNumeric.length} args`}\n`);
  }
  if (values.check) writeFileSync(values.check, `${JSON.stringify({upstream: UPSTREAM, macos: spawnSync('/usr/bin/sw_vers', ['-productVersion'], {encoding: 'utf8'}).stdout.trim(), checks}, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
