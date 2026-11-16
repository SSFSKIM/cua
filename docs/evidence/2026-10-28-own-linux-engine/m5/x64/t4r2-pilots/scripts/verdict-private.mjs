// task 88: a verdict step's pilot on a PRIVATE display, never :0. gate.mjs never runs a :0 step, so this driver runs the
// step's own arguments (steps.mjs stepArgs, as `gate.mjs print` gives them, a development run on the pinned release:
// --pinned --pilot, one block) through gate.mjs's private display (display.mjs runOnPrivateDisplay: Xvfb, Openbox, the
// "person" xterm), so the verdict run's own pinned preparation (run.mjs runDiff -> candidate.mjs's pinned rule) and its
// pilot without top-ups are seen live. Development run, never counted.
// usage: node verdict-private.mjs <step> <run home> <out root>
import { mkdirSync, openSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const G = '/Users/new/Developer/GitHub/cua/.claude/worktrees/agent-a458977939f1feb0d';
const { parseGateArgs, stepEndCheck } = await import(`${G}/scripts/linux-engine-gate/gate.mjs`);
const { stepArgs, stepLabel, stepNamed } = await import(`${G}/scripts/linux-engine-gate/steps.mjs`);
const { runOnPrivateDisplay } = await import(`${G}/scripts/linux-engine-gate/display.mjs`);
const { scratchDirs } = await import(`${G}/scripts/linux-engine-diff/leftovers.mjs`);

const [stepName, home, outRoot] = process.argv.slice(2);
const a = parseGateArgs(['print', stepName, '--pinned', home, '--out', outRoot, '--pilot', '1']);
const step = stepNamed(stepName);
const { label } = stepLabel(a);
const dir = join(outRoot, `${step.name}.private-display.development-run.pinned.pilot`);
if (existsSync(dir)) throw new Error(`${dir} exists`);
mkdirSync(join(dir, 'run'), { recursive: true });
const args = [...stepArgs(step, { paths: a, gate: a.gate, pilot: a.pilot }), '--out', join(dir, 'run')];
const env = { ...process.env, PATH: existsSync(a.firefoxDir) ? `${a.firefoxDir}:${process.env.PATH}` : process.env.PATH, CUA_HOME: home };
const record = { label, note: 'a verdict step on a private display (never :0), by task 88\'s driver, not the gate\'s sitting: its pinned preparation and pilot form seen live', step: step.name, gate: a.gate, argv: args, started: new Date().toISOString() };
writeFileSync(join(dir, 'step.json'), `${JSON.stringify(record, null, 2)}\n`);
const out = openSync(join(dir, 'stdout.log'), 'a');
const err = openSync(join(dir, 'stderr.log'), 'a');
writeFileSync(join(dir, 'LABEL'), `${label}\n`);
const before = new Set(scratchDirs().map((d) => d.dir));
const result = await runOnPrivateDisplay({ dir, label, script: join(G, 'scripts/linux-engine-diff.mjs'), args, cwd: G, env, out, err });
Object.assign(record, { finished: new Date().toISOString(), child_exit: result.code ?? result.signal, display_watchdog: result.clean ? 'clean' : result.reason, end_check: stepEndCheck(before) });
writeFileSync(join(dir, 'step.json'), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`${label}: ${step.name} on a private display: exit ${result.code}, watchdog ${record.display_watchdog}\n`);
process.exit(result.code === 0 && result.clean ? 0 : 1);
