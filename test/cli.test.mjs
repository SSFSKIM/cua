import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {writeFileSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {installedHomeSupported} from './fixtures/installed-home.mjs';
import {REPO, scratch} from './fixtures/runtime-fixture.mjs';

const CLI = join(REPO, 'bin', 'cua.mjs');
// The CLI always runs against a scratch CUA_HOME here; nothing reaches the owner's real home or the network.
function cua(args, home, extra = {}) {
  const env = {...process.env, CUA_HOME: home, ...extra};
  return spawnSync(process.execPath, [CLI, ...args], {env, encoding: 'utf8', timeout: 60_000});
}

test('doctor --json on an empty home exits nonzero with structured checks and install guidance', {skip: !installedHomeSupported}, () => {
  const s = scratch();
  try {
    // HOME is the scratch too, so the agent rows find no LaunchAgents plist (launchd is never asked), and the console
    // check is off: the real console is not read.
    const r = cua(['doctor', '--json'], s.dir, {HOME: s.dir, CUA_AGENT_CONSOLE_CHECK: 'off'});
    assert.equal(r.status, 1, r.stderr);
    const report = JSON.parse(r.stdout);
    assert.equal(report.ok, false);
    const installed = report.checks.find(c => c.name === 'runtime.installed');
    assert.equal(installed.status, 'fail');
    assert.match(installed.detail, /cua install/);
    for (const c of report.checks) assert.ok(['pass', 'fail', 'blocked', 'skip'].includes(c.status), c.name);
    for (const name of ['agent.installed', 'agent.running', 'agent.enrolled', 'agent.console'])
      assert.equal(report.checks.find(c => c.name === name)?.status, 'skip', name);
  } finally { s.cleanup(); }
});

test('install --archive with a file that is not the pinned archive fails classified and activates nothing', {skip: !installedHomeSupported}, () => {
  const s = scratch();
  try {
    const archive = join(s.dir, 'not-the-pin.zip');
    writeFileSync(archive, 'definitely not 687457051 bytes');
    const home = join(s.dir, 'home');
    const r = cua(['install', '--archive', archive, '--json'], home);
    assert.equal(r.status, 1);
    const out = JSON.parse(r.stdout);
    assert.equal(out.ok, false);
    assert.equal(out.error.code, 'archive_length_mismatch');
    assert.equal(existsSync(join(home, 'current.json')), false);
  } finally { s.cleanup(); }
});

test('runtime use of a release with no pin fails classified', () => {
  const s = scratch();
  try {
    const r = cua(['runtime', 'use', '0.0.0-darwin-arm64'], s.dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unknown_release/);
  } finally { s.cleanup(); }
});

test('unknown commands and missing arguments print usage and exit 2', () => {
  const s = scratch();
  try {
    for (const args of [[], ['frobnicate'], ['runtime'], ['runtime', 'use'], ['install', '--bogus']]) {
      const r = cua(args, s.dir);
      assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
      assert.match(r.stderr, /usage: cua/i);
    }
  } finally { s.cleanup(); }
});

test('there is no public way to swap the release pins or skip verification', () => {
  const s = scratch();
  try {
    for (const flag of ['--pins', '--releases', '--skip-verify', '--no-verify', '--insecure'])
      assert.equal(cua(['install', flag, 'x'], s.dir).status, 2, flag);
  } finally { s.cleanup(); }
});

test('the usage names the default home per platform: Application Support on macOS, XDG on Linux', async () => {
  const {usageFor} = await import('../src/cli.mjs');
  assert.match(usageFor('darwin'), /^environment: CUA_HOME \(default ~\/Library\/Application Support\/cua\); for agent run \(agent install/m);
  assert.match(usageFor('darwin'), /install \[--archive <ChatGPT zip>\]/);
  assert.match(usageFor('linux'), /^environment: CUA_HOME \(default \$XDG_DATA_HOME\/cua, else ~\/\.local\/share\/cua\); for agent run \(agent install carries those set into\n  the unit\):/m);
  assert.match(usageFor('linux'), /install \[--archive <ChatGPT deb>\]/);
});

test('devices add, import, list and remove are listed on both platforms', async () => {
  const {usageFor} = await import('../src/cli.mjs');
  for (const platform of ['darwin', 'linux']) for (const line of [
    /^  devices add <name> --relay <url> --device <id> \[--replace\] \[--json\] /m, /^  devices import <file> \[--name <name>\] \[--replace\] \[--json\] /m,
    /^  devices list \[--json\] /m, /^  devices remove <name> \[--json\] /m,
  ]) assert.match(usageFor(platform), line, platform);
});

test('agent install, uninstall and status are listed on both platforms (launchd on macOS, the systemd user unit on Linux); the console check is macOS-only', async () => {
  const {usageFor} = await import('../src/cli.mjs');
  for (const platform of ['darwin', 'linux']) for (const text of [/^  agent install /m, /^  agent uninstall /m, /^  agent status /m])
    assert.match(usageFor(platform), text, platform);
  assert.match(usageFor('darwin'), /run the agent as a launchd job in this login session/);
  assert.match(usageFor('linux'), /agent install \[--http <host:port>\] \[--surfaces <list>\] \[--display <:N>\] \[--xauthority <file>\][^]*systemd user unit \(cua-agent\.service\)/);
  assert.doesNotMatch(usageFor('linux'), /launchd/);
  assert.match(usageFor('darwin'), /CUA_AGENT_CONSOLE_CHECK/);
  assert.doesNotMatch(usageFor('linux'), /CUA_AGENT_CONSOLE_CHECK/);
  for (const platform of ['darwin', 'linux']) assert.match(usageFor(platform), /agent run \[--http <host:port>\] \[--relay\][^]*dials the relay/);
});

test('on Linux, agent status reads the systemd user unit under the user\'s home without asking the manager when there is none', {skip: process.platform !== 'linux'}, () => {
  const s = scratch();
  try {
    const r = cua(['agent', 'status', '--json'], s.dir, {HOME: s.dir});
    assert.equal(r.status, 0, r.stderr);
    const status = JSON.parse(r.stdout);
    assert.deepEqual([status.installed, status.unit, status.path], [false, 'cua-agent.service', join(s.dir, '.config', 'systemd', 'user', 'cua-agent.service')]);
  } finally { s.cleanup(); }
});

test('a detached opener resolves once the program has started, and reports one that cannot start', async () => {
  const {runOpen} = await import('../src/cli.mjs');
  assert.deepEqual(await runOpen('true', [], {detached: true}), {code: 0, stderr: ''});
  const missing = await runOpen('cua-test-no-such-program', ['--profile-directory=Default'], {detached: true});
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /ENOENT/);
});
