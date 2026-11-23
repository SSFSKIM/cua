// The negative control's driver (task 35): one Desktop of the harness build in `argv[2]` (its scripts directory),
// begun with whatever window is active, a front window opened and the run closed; prints the run's end as the harness
// records it. `argv[3]`: the cua engine its reader runs; `argv[4]`: the run name.
const [dir, cua, run] = process.argv.slice(2);
const { Desktop, desktopEnding } = await import(`${dir}/scenes.mjs`);
const desktop = new Desktop({ cua, run });
let opened = null;
try {
  await desktop.begin();
  opened = await desktop.openFront('visible');
} finally {
  await desktop.closeAll();
}
const ending = desktopEnding(desktop.ending);
console.log(JSON.stringify({ run, front: opened?.id ?? null, holder: desktop.holder?.id ?? null, record: ending.record, foreign: ending.foreign, audit: { ...desktop.ending.audit, foreign: desktop.ending.audit.foreign.map(({ text, ...f }) => f) } }, null, 2));
process.exit(ending.foreign.length ? 1 : 0);
