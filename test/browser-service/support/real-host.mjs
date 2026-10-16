// The real cua host program (src/chrome/host.mjs runHost) with the fake cua extension at its native-messaging end, in
// a short scratch home: the backend the browser service talks to, speaking the host protocol over a real Unix socket.
// The service side connects through test/fixtures/native-pipe.mjs, the trusted worker's nativePipe surface. No Chrome:
// tabs, debuggees and CDP answers are the fake extension's (`cdp` scripts the answers, `ext.cdpEvent` sends events).
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {PassThrough} from 'node:stream';
import {runHost} from '../../../src/chrome/host.mjs';
import {backendDir, socketNameFor} from '../../../src/chrome/extension.mjs';
import {createFakeCuaExtension} from '../../helpers/fake-cua-extension.mjs';
import {nativePipeConnect} from '../../fixtures/native-pipe.mjs';
import {shortScratch} from '../../fixtures/runtime-fixture.mjs';

export const nativePipe = {createConnection: nativePipeConnect};

// A liveness bound, not a speed claim: only a wait that never ends fails.
export async function waitFor(predicate, what, ms = 20_000) {
  const deadline = Date.now() + ms;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

// Starts a host for the test `t` (stopped and cleaned up after it) -> {ext, socketPath, home}.
export async function startRealHost(t, fake = {}) {
  const scratch = shortScratch('cua-bs-');
  const ext = createFakeCuaExtension(fake);
  const toHost = new PassThrough(), fromHost = new PassThrough();
  const port = ext.connect({toHost, fromHost});
  const done = runHost({stdin: toHost, stdout: fromHost, home: scratch.dir, pid: process.pid});
  const socketPath = join(backendDir(scratch.dir), `${socketNameFor(ext.instanceId)}.sock`);
  t.after(async () => { port.disconnect(); await done; scratch.cleanup(); });
  await waitFor(() => existsSync(socketPath), 'the host socket');
  return {ext, socketPath, home: scratch.dir};
}
