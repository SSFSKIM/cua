// The engine socket's clients are found by peer address, not by path (#117 M3.3 review): checked against what this
// Mac's lsof really prints for a listener in this process and a client connected from a child.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {unixSocketEnds, unixSockets} from '../scripts/probe/lib.mjs';

test('lsof shows a connected client only by its peer address, and the ends find it', {skip: process.platform !== 'darwin' && 'macOS lsof format'}, async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua-peers-'));
  const path = join(dir, 's.sock');
  const accepted = [];
  const server = createServer(socket => accepted.push(socket)).listen(path);
  await once(server, 'listening');
  const child = spawn(process.execPath, ['-e', `const s = require('net').connect(${JSON.stringify(path)}, () => process.stdout.write('up\\n')); s.on('error', () => {}); setTimeout(() => {}, 30000)`], {stdio: ['ignore', 'pipe', 'inherit']});
  try {
    await once(child.stdout, 'data');
    while (accepted.length === 0) await new Promise(resolve => setTimeout(resolve, 20));
    const listing = execFileSync('/usr/sbin/lsof', ['-a', '-U', '-p', `${process.pid},${child.pid}`, '-F', 'pcfdn'], {encoding: 'utf8'});
    const sockets = unixSockets(listing);
    const byPath = execFileSync('/usr/sbin/lsof', ['-F', 'pcfdn', path], {encoding: 'utf8'});
    assert.deepEqual([...new Set(unixSockets(byPath).map(s => s.pid))], [process.pid], 'the path names the server\'s ends only');
    const ends = unixSocketEnds(sockets, path);
    assert.deepEqual([...new Set(ends.bound.map(s => s.pid))], [process.pid]);
    assert.deepEqual(ends.clients.map(s => s.pid), [child.pid]);
    assert.equal(ends.unseen, 0);
    assert.equal(unixSocketEnds(unixSockets(byPath), path).unseen, 1, 'from the path alone the client is unseen, never absent');
  } finally {
    child.kill();
    for (const socket of accepted) socket.destroy();
    server.close();
    rmSync(dir, {recursive: true, force: true});
  }
});
