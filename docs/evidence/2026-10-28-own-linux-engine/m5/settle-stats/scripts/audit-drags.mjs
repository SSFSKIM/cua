// Task 103 fix wave 1: the V steps' X-request audit lanes that send a drag with --stats off (run.mjs auditPlan; each
// audit engine is makeEngine({ ...spec, stats: false })), so their engines keep no counter.
import { resolve, join } from 'node:path';
const h = resolve(process.env.HEAD_HARNESS);
const { STEPS, verdictOps } = await import(join(h, '../linux-engine-gate/steps.mjs'));
const { auditPlan, planOps } = await import(join(h, 'run.mjs'));
const { OPS } = await import(join(h, 'ops.mjs'));
for (const step of STEPS.filter((s) => s.kind === 'verdict')) {
  const audited = auditPlan(planOps(step.scenes, verdictOps(step)));
  // the command each operation sends: its request called on a stand-in context (any field reads as a number or a list)
  const any = new Proxy(() => any, { get: (_, k) => (k === Symbol.toPrimitive ? () => 1 : k === Symbol.iterator ? function* () {} : k === 'length' ? 0 : any), apply: () => any });
  const command = (op) => { try { return OPS[op].request({ scene: any, ctx: any, desktop: any }, any)?.[0] ?? null; } catch { return null; } };
  const unread = audited.filter(({ op }) => command(op) === null).map((d) => d.op);
  const drags = audited.filter(({ op }) => ['drag', 'drag_handle', 'drag_start'].includes(command(op)) || (command(op) === null && /drag/.test(op)));
  if (unread.length) console.log(`  (${step.name}: request not read for ${unread.join(', ')}; counted by name where it says drag)`);
  console.log(`${step.name}: ${audited.length} audited operations; with a drag: ${drags.map((d) => `${d.scene}/${d.op}`).join(', ') || 'none'}`);
}
