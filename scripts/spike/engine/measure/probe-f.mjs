// Probe (f), grants across copies (the own native engine spec, M0 "Spike"): an operator-guided procedure, since only
// the owner at the console sees and answers the capture confirmation. Each step prints what the operator does, reads
// what the engine reports, and asks the operator what the console showed; the answers are written to <out>/probe-f.json.
//   f1  the running approved engine: does it report both grants (after the approve loop's relaunch)?
//   f2  a staged rebuild at the same path (a new build, the same identity; the operator stages it with the Concrete
//       Steps' stop/stage/move lines): is Accessibility kept, does approve's capture raise the confirmation again?
//   f3  a copy at a new path: is Accessibility kept, does its capture raise the confirmation?
// approved.json is never written here; after f2 the operator runs `measure.mjs approve` for the build to be measured.
import * as fs from 'node:fs';
import {dirname, join} from 'node:path';
import {launchEngine, stopEngine} from './engine-control.mjs';

const grants = s => (s ? {accessibility: s.accessibility, screenRecording: s.screenRecording, pid: s.pid, build: s.build} : null);

export async function probeF({ops, copyOps, out, confirm, log = console.log, ...timing}) {
  const steps = [];
  const status = () => { const a = ops.rpc('status'); return a.ok ? a.result : null; };

  const f1 = status() ?? await launchEngine(ops, timing);
  steps.push({step: 'f1', running: grants(f1)});
  log(`f1: the approved engine reports accessibility ${f1.accessibility}, screenRecording ${f1.screenRecording}`);

  const before = ops.bundle();
  if (await confirm('f2: stage a REBUILD (new build, same identity) into the approved location with the Concrete Steps\' stop/stage/move lines; press Enter when it is in place (n to skip): ')) {
    await stopEngine(ops, timing);
    const after = ops.bundle();
    const launched = await launchEngine(ops, timing);
    const answer = ops.rpc('approve');
    steps.push({step: 'f2', buildBefore: before.build, buildAfter: after.build, rebuilt: before.build !== after.build, identityKept: before.identity === after.identity,
      running: grants(launched), approve: answer.ok ? answer.result : {error: answer.error?.message},
      confirmationRaised: await confirm('f2: did the screen-capture confirmation appear on the console for the rebuild? [Enter = yes, n = no] ')});
  } else steps.push({step: 'f2', skipped: true});

  const copyDir = join(dirname(dirname(ops.bundle().bundle)), 'engine-probe-f');
  if (await confirm('f3: a copy of the approved bundle at a new path will be launched and asked to approve; press Enter to start (n to skip): ')) {
    try {
      ops.removeCopy(copyDir);
      ops.copy(copyDir);
      const launched = await launchEngine(copyOps, timing);
      const answer = copyOps.rpc('approve');
      steps.push({step: 'f3', copy: launched.bundlePath, running: grants(launched), approve: answer.ok ? answer.result : {error: answer.error?.message},
        confirmationRaised: await confirm('f3: did the screen-capture confirmation appear on the console for the copy? [Enter = yes, n = no] ')});
    } finally {
      try { await stopEngine(copyOps, timing); } catch (error) { log(`f3: ${error.message}`); }
      ops.removeCopy(copyDir);
    }
  } else steps.push({step: 'f3', skipped: true});

  fs.mkdirSync(out, {recursive: true});
  fs.writeFileSync(join(out, 'probe-f.json'), JSON.stringify({at: new Date().toISOString(), steps}, null, 2) + '\n');
  return steps;
}
