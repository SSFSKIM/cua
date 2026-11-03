// Task 51 probe: on a private Xvfb this process starts (startPrivateServer), xprobe's record-run names the server's
// resource-id mask in its ready line, and every client line's id is a base of that mask. Nothing else is reached.
// Every X client here (the watchdog, the record, xprop) names an authority path of the probe's own that does not
// exist: the server keeps none, and with XAUTHORITY unset a client would look in the person's ~/.Xauthority (task 51's
// review). The harness's spawner gives a display its process created that path in any case (xspawn.mjs).
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const harness = process.argv[2];
const { startPrivateServer, startRunRecord } = await import(join(harness, 'scripts/linux-engine-diff/xtools.mjs'));
const { xExecFileSync } = await import(join(harness, 'scripts/linux-engine-diff/xspawn.mjs'));

const out = mkdtempSync(join(tmpdir(), 'cua171-task51-probe-'));
const server = await startPrivateServer({ out });
const env = { ...process.env, DISPLAY: server.display, XAUTHORITY: join(out, 'no-authority') };
let text = '';
try {
  const record = await startRunRecord({ env });
  // one client of the probe's own on the server, so a client line comes while recording
  xExecFileSync('xprop', ['-root', '_NET_SUPPORTING_WM_CHECK'], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise((r) => setTimeout(r, 300));
  text = await record.stop();
} finally {
  await server.stop();
  rmSync(out, { recursive: true, force: true });
}
const lines = text.trim().split('\n').map((l) => JSON.parse(l));
const ready = lines.find((l) => l.kind === 'ready');
const clients = lines.filter((l) => l.kind === 'client');
console.log(JSON.stringify({ display: server.display, ready, clients: clients.map((c) => ({ client: c.client, exe: c.exe, at: c.at, base_ok: (c.client & ready.mask) === 0 })) }));
