// The kernel child's plumbing: real pipes for its stdio (the Linux sandbox blocks Unix socket pairs), the stderr tail
// and exit status as the vendor's diagnostic words them (observed on the pinned node_repl, 2026-10-14).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exitDiagnostic, exitStatus, startKernelChild, stderrTail} from '../../src/repl-host/kernel-child.mjs';

test('the stderr tail keeps the last 20 non-empty lines, each cut to 512 characters, a trailing CR dropped', () => {
  const tail = stderrTail();
  for (let i = 0; i < 60; i++) tail.write(`line-${i}\n`);
  tail.write('\n\n  \n');
  tail.write(`${'z'.repeat(600)}\r\n  padded\tline  \r\npart`);
  const lines = tail.text().split(' | ');
  assert.equal(lines.length, 20);
  assert.deepEqual(lines.slice(-4), ['  ', 'z'.repeat(512), '  padded\tline  ', 'part']);
  assert.equal(lines[0], 'line-44');
  assert.equal(stderrTail().text(), '');
});

test('exit status and diagnostic in the vendor\'s words and key order', () => {
  assert.equal(exitStatus({code: 137, signal: null}), 'exited(code=137)');
  assert.equal(exitStatus({code: null, signal: 'SIGKILL'}), 'exited(signal=9)');
  assert.equal(exitStatus({code: null, signal: 'SIGTERM'}), 'exited(signal=15)');
  assert.equal(exitDiagnostic({pid: 5841, status: 'exited(code=73)', tail: 'fixture sandbox launcher refused'}),
    'node_repl kernel exited unexpectedly\n\nnode_repl diagnostics: {"kernel_pid":5841,"kernel_status":"exited(code=73)","kernel_stderr_tail":"fixture sandbox launcher refused","reason":"stdout_eof","stream_error":null}');
});

test('the child\'s stdin, stdout and stderr are pipes, not sockets, and carry its JSON lines both ways', async () => {
  const messages = [];
  let ended;
  const done = new Promise(resolve => { ended = resolve; });
  const script = 'const fs=require("fs");const kinds=[0,1,2].map(fd=>fs.fstatSync(fd).isFIFO()&&!fs.fstatSync(fd).isSocket());'
    + 'process.stdin.once("data",d=>{process.stdout.write(JSON.stringify({kinds,echo:JSON.parse(String(d))})+"\\n");process.stderr.write("bye\\n");process.exit(3);});';
  const child = startKernelChild({command: process.execPath, args: ['-e', script], env: {PATH: '/usr/bin:/bin'}, cwd: process.cwd()},
    {onMessage: m => messages.push(m), onEnd: ended});
  assert.equal(child.send({ping: 1}), true);
  const {expected, diagnostic} = await done;
  assert.deepEqual(messages, [{kinds: [true, true, true], echo: {ping: 1}}]);
  assert.equal(expected, false);
  assert.match(diagnostic, /"kernel_status":"exited\(code=3\)","kernel_stderr_tail":"bye"/);
});

test('a launcher that cannot start is reported as the vendor reports a Node runtime that cannot start', async () => {
  let ended;
  const done = new Promise(resolve => { ended = resolve; });
  startKernelChild({command: '/nonexistent/launcher', args: [], env: {}, cwd: process.cwd()}, {onMessage: () => {}, onEnd: ended});
  assert.match((await done).diagnostic, /^failed to start Node runtime: spawn \/nonexistent\/launcher ENOENT/);
});
