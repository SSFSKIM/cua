// Run: node --test scripts/probe/chrome/original/test/  (prototype helpers; deliberately outside `npm test`)
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parsePs, parseLsofSockets, selectBackends, desktopRunning, CHROME_EXECUTABLE} from '../hosts.mjs';

const HOST = '/Users/u/.codex/plugins/cache/openai-bundled/chrome/latest/extension-host/macos/arm64/ChatGPT for Chrome';
const PS = [
  `  100     1 ${CHROME_EXECUTABLE}`,
  `  200   100 ${HOST}`,
  `  300   999 ${HOST}`,
  `  400   100 /Applications/Google Chrome.app/Contents/Frameworks/Helper`,
  `  999     1 /Applications/Other.app/Contents/MacOS/Other`,
  `  500     1 /Applications/ChatGPT.app/Contents/MacOS/ChatGPT`,
].join('\n');

test('parsePs keeps executables with spaces whole', () => {
  const rows = parsePs(PS);
  assert.equal(rows.length, 6);
  assert.deepEqual(rows[1], {pid: 200, ppid: 100, executable: HOST});
});

test('parseLsofSockets keeps only live codex-browser-use sockets, deduplicated', () => {
  const text = ['p200', 'f5', 'n/tmp/codex-browser-use/0a1b2c3d-0000-4000-8000-00000000abcd.sock', 'f6',
    'n/private/tmp/codex-browser-use/0a1b2c3d-0000-4000-8000-00000000abcd.sock', 'f7', 'n->0x1234', 'f8',
    'n/tmp/codex-browser-use/../evil.sock', 'f9', 'n/tmp/elsewhere/0a1b.sock'].join('\n');
  assert.deepEqual(parseLsofSockets(text), [
    '/tmp/codex-browser-use/0a1b2c3d-0000-4000-8000-00000000abcd.sock',
    '/private/tmp/codex-browser-use/0a1b2c3d-0000-4000-8000-00000000abcd.sock',
  ]);
});

test('selectBackends takes sockets only from hosts whose parent is the user Chrome', () => {
  const asked = [];
  const lsof = pid => { asked.push(pid); return pid === 200 ? 'p200\nf5\nn/tmp/codex-browser-use/aaaa-bbbb.sock\n' : 'p300\nf5\nn/tmp/codex-browser-use/cccc.sock\n'; };
  const r = selectBackends({processes: parsePs(PS), lsof});
  assert.deepEqual(asked, [200]);
  assert.equal(r.hosts.length, 1);
  assert.equal(r.rejectedHosts, 1);
  assert.deepEqual(r.sockets, ['/tmp/codex-browser-use/aaaa-bbbb.sock']);
  assert.deepEqual(r.hostExecutables, [HOST]);
});

test('selectBackends tolerates an lsof failure for one host', () => {
  const r = selectBackends({processes: parsePs(PS), lsof: () => null});
  assert.equal(r.hosts.length, 1);
  assert.equal(r.hosts[0].lsofFailed, true);
  assert.deepEqual(r.sockets, []);
});

test('desktopRunning recognises the desktop app main executable only', () => {
  assert.equal(desktopRunning(parsePs(PS)), true);
  assert.equal(desktopRunning(parsePs(`  1 0 /Applications/ChatGPT.app/Contents/Frameworks/Helper`)), false);
});
