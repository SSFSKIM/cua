// M5 scratch: serve-plain.cjs plus (1) a SIGUSR2 dump of the seam's inspect() and each named session's activity buffer,
// (2) a file trigger: when cmd.json appears, the person's click (the seam's sendInput) on the first tab m5-A leases.
const { writeFileSync, readFileSync, rmSync, existsSync } = require('node:fs');
require(`${process.env.MAWS_CHECKOUT ?? '/Users/new/Developer/GitHub/MAWS-wt-13'}/spikes/cua-backend/serve-plain.cjs`);
const sessions = process.argv.slice(process.defaultApp ? 3 : 2).filter((a) => !a.startsWith('-'));
const DIR = process.env.MAWS_PROBE_DIR ?? '/tmp/maws-probe';
require('node:fs').mkdirSync(DIR, { recursive: true });
process.on('SIGUSR2', () => {
  const cua = globalThis.__maws_browser?.cua;
  const out = { inspect: cua?.inspect() ?? null, activities: Object.fromEntries(sessions.map((id) => [id, cua?.activities(id) ?? null])) };
  writeFileSync(`${DIR}/dump.json`, JSON.stringify(out, null, 1));
});
setInterval(() => {
  if (!existsSync(`${DIR}/cmd.json`)) return;
  const cmd = JSON.parse(readFileSync(`${DIR}/cmd.json`, 'utf8'));
  rmSync(`${DIR}/cmd.json`);
  const b = globalThis.__maws_browser;
  const tab = b.cua.inspect()['m5-A']?.leased?.[0] ?? null;
  const res = { at: Date.now(), tab };
  if (tab && cmd.op === 'click') {
    res.down = b.agent.sendInput(tab, { type: 'mouseDown', x: 600, y: 600, button: 'left', clickCount: 1 });
    res.up = b.agent.sendInput(tab, { type: 'mouseUp', x: 600, y: 600, button: 'left', clickCount: 1 });
  }
  if (tab) res.control = b.agent.control(tab)?.control ?? null;
  writeFileSync(`${DIR}/ack-${cmd.n}.json`, JSON.stringify(res));
}, 50);
