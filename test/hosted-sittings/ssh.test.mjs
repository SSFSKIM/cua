// The loopback device's ssh (scripts/repl-parity/loopback-ssh.mjs, scripts/hosted-sittings/loopback.sh): every call to
// `hosted-macos`, preparation included, reads only its own config, pinned to 127.0.0.1:2222 and the sshd's host key,
// never the account's ssh_config or a default known_hosts. Nothing here runs ssh.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {miniPrepareCommand, remoteCommand} from '../../scripts/browser-parity/topology.mjs';
import {nativePrepareCommand, prepareCommand} from '../../scripts/repl-parity/topology.mjs';
import {loopbackSshArgs, loopbackSshConfig} from '../../scripts/repl-parity/loopback-ssh.mjs';

const CONFIG = `${homedir()}/.local/share/cua-hosted/ssh/config`;
const COMMIT = 'c'.repeat(40);

test('every command to the loopback device names its own config first; other devices are untouched', () => {
  assert.equal(loopbackSshConfig(), CONFIG);
  assert.deepEqual(loopbackSshArgs('hosted-macos'), ['-F', CONFIG]);
  assert.deepEqual(loopbackSshArgs('mini'), []);
  for (const command of [remoteCommand('hosted-macos', 'true'), miniPrepareCommand({device: 'hosted-macos', commit: COMMIT, profile: 'p'}),
    nativePrepareCommand({device: 'hosted-macos', commit: COMMIT}), prepareCommand({device: 'hosted-macos', commit: COMMIT, profile: 'p'})]) {
    assert.equal(command.command, 'ssh');
    assert.deepEqual(command.args.slice(0, 2), ['-F', CONFIG]);
    assert.ok(command.args.includes('hosted-macos'));
  }
  assert.deepEqual(remoteCommand('mini', 'true').args.slice(0, 3), ['-o', 'BatchMode=yes', 'mini']);
});

test('loopback.sh writes that config pinned to the endpoint and the sshd\'s own host key, and leaves ~/.ssh/config alone', () => {
  const script = readFileSync(new URL('../../scripts/hosted-sittings/loopback.sh', import.meta.url), 'utf8');
  const config = /cat > "\$D\/config" <<EOF\n([\s\S]*?)\nEOF/.exec(script)?.[1];
  assert.ok(config, 'the client config is written to the isolated directory');
  for (const line of ['Host hosted-macos', 'HostName 127.0.0.1', 'Port 2222', 'HostKeyAlias hosted-macos', 'StrictHostKeyChecking yes',
    'UserKnownHostsFile $D/known_hosts', 'GlobalKnownHostsFile /dev/null', 'IdentityFile $D/id_ed25519', 'IdentitiesOnly yes'])
    assert.ok(config.split('\n').some(l => l.trim() === line), line);
  assert.match(script, /^D=\$HOME\/\.local\/share\/cua-hosted\/ssh$/m);
  assert.match(script, /printf 'hosted-macos %s\\n' "\$\(cat "\$SSHD\/hostkey\.pub"\)" > "\$D\/known_hosts"/, 'the known host is the sshd\'s own key');
  assert.doesNotMatch(script, /\.ssh\/config/);
  assert.doesNotMatch(script, /StrictHostKeyChecking no|UserKnownHostsFile \/dev\/null/);
});

// The device's hosted-only uses (the venue, the frame probe's moves) check RUNNER_ENVIRONMENT themselves, so the loopback
// sessions must carry it: sshd hands a session only ~/.ssh/environment, which loopback.sh writes after its own guard
// on that same variable. The mini's sshd has no such file of ours, so its sessions never carry it.
test('loopback.sh hands the device sessions RUNNER_ENVIRONMENT=github-hosted, after refusing anywhere else', () => {
  const script = readFileSync(new URL('../../scripts/hosted-sittings/loopback.sh', import.meta.url), 'utf8');
  const guard = script.indexOf('[ "${RUNNER_ENVIRONMENT:-}" = github-hosted ]'), env = script.indexOf('RUNNER_ENVIRONMENT=github-hosted" >> "$HOME/.ssh/environment"');
  assert.ok(guard >= 0 && env > guard, 'the variable is written to the sessions\' environment, after the guard');
  assert.match(script, /^echo "PATH=\$PATH" > "\$HOME\/\.ssh\/environment"$/m);
  assert.match(script, /^PermitUserEnvironment yes$/m);
  // The bring-up ends by asking its own session for the variable, and fails when it is missing.
  const probe = script.indexOf(`ssh -F "$D/config" "$DEVICE" 'test "$RUNNER_ENVIRONMENT" = github-hosted' || {`);
  assert.ok(probe > script.indexOf('/usr/sbin/sshd -f'), 'the session is probed for the variable after the sshd starts');
  assert.match(script.slice(probe), /\|\| \{\n[^\n]*>&2; exit 1; \}/);
});
