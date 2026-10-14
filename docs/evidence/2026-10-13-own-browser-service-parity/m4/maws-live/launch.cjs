// M4's MAWS (own browser service spec, M4): MAWS's own serve-plain.cjs (the worktree's built main run by the bare
// Electron binary, no Playwright client on its pages, the e2e seam on, a transparent click-through window, a scratch
// profile) plus what the 2026-10-08 probes' launch.cjs added, adapted to socket peer authentication:
// - the process named by MAWS_PROBE_TRUST_PID becomes a trusted root (the seam's trustRoot), so the `cua serve` it
//   starts, and that serve's own host in client mode, are let in as an engine's tree would be;
// - a file trigger in MAWS_PROBE_DIR: cmd.json {n, op, session, x?, y?} is answered in ack-<n>.json. `click`: the
//   person's mouse down and up on the session's first leased tab (the seam's sendInput); `read`: that tab's control and
//   the agent cursor's message count; both also return the session's inspect() row.
//   MAWS_CHECKOUT=<MAWS worktree> <worktree>/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron launch.cjs <userData> <session>...
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
require(`${process.env.MAWS_CHECKOUT}/spikes/cua-backend/serve-plain.cjs`);
const { app } = require('electron');

const DIR = process.env.MAWS_PROBE_DIR;
mkdirSync(DIR, { recursive: true });
app.whenReady().then(async () => {
  while (!globalThis.__maws_browser?.cua) await new Promise((resolve) => setTimeout(resolve, 100));
  const trusted = globalThis.__maws_browser.cua.trustRoot(Number(process.env.MAWS_PROBE_TRUST_PID));
  process.stdout.write(`${JSON.stringify({ trusted })}\n`);
});
setInterval(() => {
  const path = `${DIR}/cmd.json`;
  if (!existsSync(path)) return;
  const cmd = JSON.parse(readFileSync(path, 'utf8'));
  rmSync(path);
  const b = globalThis.__maws_browser;
  const row = b.cua.inspect().sessions?.[cmd.session] ?? null;
  const tab = row?.leased?.[0] ?? null;
  const res = { at: Date.now(), tab, row };
  if (tab && cmd.op === 'click') {
    const at = { x: cmd.x ?? 600, y: cmd.y ?? 600, button: 'left', clickCount: 1 };
    res.down = b.agent.sendInput(tab, { type: 'mouseDown', ...at });
    res.up = b.agent.sendInput(tab, { type: 'mouseUp', ...at });
  }
  if (tab) {
    res.control = b.agent.control(tab)?.control ?? null;
    res.cursorMessages = b.agent.cursorMessages(tab);
  }
  writeFileSync(`${DIR}/ack-${cmd.n}.json`, JSON.stringify(res));
}, 50);
