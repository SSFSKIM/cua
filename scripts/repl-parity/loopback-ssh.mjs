// The loopback device's own ssh config (#117 M5, T10b′): a GitHub-hosted runner reaching itself as `hosted-macos`
// (./devices.mjs `loopback`) does so only through the config scripts/hosted-sittings/loopback.sh writes, pinned to
// 127.0.0.1:2222 and the sshd's own host key, with its own known_hosts and identity. `ssh -F` reads no other config,
// neither the account's ~/.ssh/config nor /etc/ssh/ssh_config, so nothing the image or anyone else put there routes a run.
import {homedir} from 'node:os';
import {join} from 'node:path';
import {DEVICES} from './devices.mjs';

export const LOOPBACK_SSH_IN_HOME = '.local/share/cua-hosted/ssh';
export const loopbackSshConfig = (home = homedir()) => join(home, LOOPBACK_SSH_IN_HOME, 'config');
// The arguments every ssh to `device` starts with: the loopback config for a loopback device, else none.
export const loopbackSshArgs = (device, home = homedir()) => (DEVICES[device]?.loopback ? ['-F', loopbackSshConfig(home)] : []);
