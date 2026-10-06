// The parsing behind scripts/probe/host-exit-capture.mjs (issue #41): which processes count as hosts, what a sample
// records of each, and which hosts a pair of samples shows gone. A wrong delta either misses the exit the recorder
// exists for or reports one that never happened.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hostDelta, parseHosts, parsePs, parseUnixSockets, redactHome, renderTimeline} from '../scripts/probe/host-exit-capture.mjs';

const DESKTOP = '/Users/someone/.codex/plugins/cache/openai-bundled/chrome/latest/extension-host/macos/arm64/ChatGPT for Chrome';
const CUA = '/Users/someone/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64/chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome';
const ORIGIN = 'chrome-extension://hehggadaopoacecdllhhajmbjkdcmajg/';

test('only processes whose executable is the host count, whatever else mentions the name', () => {
  const pgrep = [
    `33239 ${DESKTOP} ${ORIGIN}`,
    `79354 ${CUA} ${ORIGIN}`,
    `81000 /usr/bin/log show --predicate process == "ChatGPT for Chrome" OR senderImagePath CONTAINS "extension-host"`,
    `81001 /bin/zsh -c pgrep -fl "ChatGPT for Chrome Helper"`,
    '',
  ].join('\n');
  assert.deepEqual(parseHosts(pgrep), [{pid: 33239, command: `${DESKTOP} ${ORIGIN}`}, {pid: 79354, command: `${CUA} ${ORIGIN}`}]);
  assert.deepEqual(parseHosts(''), []);
});

test('ps gives the parent and the start time; an exited process gives nothing', () => {
  assert.deepEqual(parsePs(' 4012 Sat Oct  3 17:30:58 2026    \n'), {ppid: 4012, start: 'Sat Oct 3 17:30:58 2026'});
  assert.equal(parsePs(''), null);
});

test('unix sockets keep their fd, their device and only the basename of a path', () => {
  const path = '/tmp/codex-browser-use/99b32433-3048-4660-a4ae-6560ae099d84.sock';
  const lsof = `p33239\nf3\nd0xb711\nn${path}\nf4\nd0xce85\nn${path}\nf5\nd0xce85\nn${path}\nf6\nd0xaa01\nn->0x6719\nf7\nd0xaa02\nn\n`;
  const sock = '99b32433-3048-4660-a4ae-6560ae099d84.sock';
  assert.deepEqual(parseUnixSockets(lsof), [
    {fd: '3', device: '0xb711', name: sock},                       // the listener
    {fd: '4', device: '0xce85', name: sock},                       // one accepted client, two fds
    {fd: '5', device: '0xce85', name: sock},
    {fd: '6', device: '0xaa01', name: '->0x6719'},
    {fd: '7', device: '0xaa02', name: ''},
  ]);
  assert.deepEqual(parseUnixSockets(''), []);
});

const host = (pid, start, ppid = 4012) => ({pid, ppid, start, command: 'x', sockets: []});
const at = (time, ...hosts) => ({at: time, hosts});

test('a host missing from the next sample is gone; a new one is started; an unchanged pair has no delta', () => {
  const a = host(33239, 'Sat Oct 3 17:30:58 2026');
  const b = host(79354, 'Sat Oct 3 17:03:13 2026');
  const c = host(90001, 'Mon Oct 5 20:00:05 2026');
  assert.deepEqual(hostDelta(at('t0', a, b), at('t1', b, a)), {gone: [], started: []});
  assert.deepEqual(hostDelta(at('t0', a, b), at('t1', b)), {gone: [a], started: []});
  assert.deepEqual(hostDelta(at('t0', a), at('t1', a, c)), {gone: [], started: [c]});
  assert.deepEqual(hostDelta(at('t0', a, b), at('t1')), {gone: [a, b], started: []});
});

test('a reused pid with a new start time is an exit and a start, not the same host', () => {
  const old = host(33239, 'Sat Oct 3 17:30:58 2026');
  const reused = host(33239, 'Mon Oct 5 20:00:05 2026');
  assert.deepEqual(hostDelta(at('t0', old), at('t1', reused)), {gone: [old], started: [reused]});
});

test('the home directory is redacted and the timeline flags sampling gaps and leaves the owner sections empty', () => {
  assert.equal(redactHome(`${CUA} ${ORIGIN}`, '/Users/someone'), `~/Library/Application Support/cua/runtimes/26.928.40906-darwin-arm64/chrome-plugin/extension-host/macos/arm64/ChatGPT for Chrome ${ORIGIN}`);
  const a = host(33239, 'Sat Oct 3 17:30:58 2026');
  const text = renderTimeline({
    lastSeenAt: '2026-10-05T20:10:00.000Z', exitedAt: '2026-10-05T20:10:05.000Z', gone: [a], parentsAlive: {4012: true},
    samples: [at('2026-10-05T20:00:00.000Z', a), at('2026-10-05T20:10:00.000Z', a), at('2026-10-05T20:10:05.000Z')],
    after: [at('2026-10-05T20:10:10.000Z', host(90001, 'Mon Oct 5 20:10:08 2026'))], intervalSeconds: 5, logWindow: '10m', logText: '',
  });
  assert.match(text, /Last seen alive 2026-10-05T20:10:00\.000Z; first sample without it\n2026-10-05T20:10:05\.000Z/);
  assert.match(text, /"parentAliveAfterExit": true/);
  assert.match(text, /- 2026-10-05T20:00:00\.000Z -> 2026-10-05T20:10:00\.000Z \(600 s\)/);
  assert.doesNotMatch(text, /20:10:00\.000Z -> 2026-10-05T20:10:05/);
  assert.match(text, /## Owner: extension service-worker console/);
  assert.match(text, /\(no lines\)/);
});
