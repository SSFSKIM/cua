// The X request audit (Design, Verification system): in its own untimed pass, an engine's X connections go through
// `xtrace` on a proxy display (as R/F §0 traced the vendor), and a background-route operation fails on any forbidden
// request: SetInputFocus, ConfigureWindow with a stack mode, WarpPointer, a _NET_ACTIVE_WINDOW ClientMessage, or
// XTEST FakeInput. The VM's xtrace prints FakeInput as UNKNOWN opcode 132/2 (R/F §4.1), so FakeInput is matched by
// XTEST's major opcode as the server reported it to the traced client, with minor 2.

import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

const REQUEST = /^(\d+):<:([0-9a-f]+):\s*\d+:\s*(?:([A-Za-z0-9-]+)-)?Request\((\d+)(?:,(\d+))?\):\s*(\S+)?(.*)$/;
const QUERY = /^(\d+):<:([0-9a-f]+):.*Request\(98\): QueryExtension name='([^']+)'/;
const QUERY_REPLY = /^(\d+):>:([0-9a-f]+):.*Reply to QueryExtension: present=true\S* major-opcode=(\d+)/;

/** A trace's requests `{conn, seq, major, minor, name, text}` and the extensions' major opcodes the server reported. */
export function parseXtrace(text) {
  const requests = [];
  const extensions = {};
  const asked = new Map();
  for (const line of text.split('\n')) {
    const q = line.match(QUERY);
    if (q) asked.set(`${q[1]}|${q[2]}`, q[3]);
    const r = line.match(QUERY_REPLY);
    if (r && asked.has(`${r[1]}|${r[2]}`)) extensions[asked.get(`${r[1]}|${r[2]}`)] = Number(r[3]);
    const m = line.match(REQUEST);
    if (!m) continue;
    requests.push({
      conn: Number(m[1]),
      seq: Number.parseInt(m[2], 16),
      major: Number(m[4]),
      minor: m[5] === undefined ? null : Number(m[5]),
      name: m[6]?.replace(/:$/, '') ?? null,
      text: line.slice(0, 400),
    });
  }
  return { requests, extensions };
}

/** What makes a request forbidden on the background route, or null. */
function forbidden(request, extensions) {
  const xtest = extensions.XTEST;
  if (request.major === 42) return 'SetInputFocus';
  if (request.major === 41) return 'WarpPointer';
  if (request.major === 12 && /stack-mode=/.test(request.text)) return 'ConfigureWindow stack-mode';
  if (request.major === 25 && /ClientMessage/.test(request.text) && /"_NET_ACTIVE_WINDOW"/.test(request.text)) return '_NET_ACTIVE_WINDOW ClientMessage';
  if (xtest !== undefined && request.major === xtest && request.minor === 2) return 'XTEST FakeInput';
  return null;
}

/**
 * The audit of one traced pass. A trace with no requests at all is not clean: it means the engine's connection did
 * not go through the proxy, which would make any audit pass.
 */
export function auditRequests({ requests, extensions }) {
  const found = [];
  for (const r of requests) {
    const what = forbidden(r, extensions);
    if (what) found.push({ conn: r.conn, seq: r.seq, what, text: r.text });
  }
  const traced = requests.length > 0;
  return { clean: traced && found.length === 0, traced, requests: requests.length, forbidden: found };
}

function freeDisplay() {
  for (let n = 40; n < 100; n++) {
    if (!existsSync(`/tmp/.X11-unix/X${n}`) && !existsSync(`/tmp/.X${n}-lock`)) return n;
  }
  throw new Error('no free X display number for the audit proxy');
}

/**
 * An xtrace proxy display forwarding to `display`: `{display, env, log, stop()}`. `env` is what a client needs to
 * reach it (DISPLAY and an XAUTHORITY holding the proxy's copy of the credentials); `stop()` ends the proxy and returns
 * the trace's text.
 */
export async function startProxy({ display = process.env.DISPLAY ?? ':0' } = {}) {
  const n = freeDisplay();
  const dir = mkdtempSync(join(tmpdir(), 'cua171-audit-'));
  const log = join(dir, 'x11.log');
  // xtrace copies the display's credentials for the proxy into a copy of the authority file of the pass's own, so
  // the person's ~/.Xauthority is never written
  const auth = join(dir, 'Xauthority');
  copyFileSync(process.env.XAUTHORITY ?? join(homedir(), '.Xauthority'), auth);
  const child = spawn('xtrace', ['-k', '-d', display, '-D', `:${n}`, '-c', '-f', auth, '-F', auth, '-o', log], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => {
    stderr += d;
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  const deadline = Date.now() + 5000;
  while (!existsSync(`/tmp/.X11-unix/X${n}`)) {
    if (Date.now() > deadline || child.exitCode !== null) throw new Error(`xtrace did not start: ${stderr.trim()}`);
    await new Promise((r) => setTimeout(r, 20));
  }
  return {
    display: `:${n}`,
    env: { ...process.env, DISPLAY: `:${n}`, XAUTHORITY: auth },
    log,
    async stop() {
      child.kill('SIGTERM');
      await exited;
      const text = existsSync(log) ? readFileSync(log, 'utf8') : '';
      rmSync(dir, { recursive: true, force: true });
      // xtrace leaves its display's socket behind when it is ended; the next pass would find the number taken
      rmSync(`/tmp/.X11-unix/X${n}`, { force: true });
      return text;
    },
  };
}
