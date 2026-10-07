// A fake `systemctl --user` modelling one user manager with cua's agent unit, and a fake `loginctl`, for tests that must
// never touch a real systemd manager or ~/.config/systemd.
import {readFileSync} from 'node:fs';
import {AGENT_UNIT, agentUnitPath} from '../../src/remote/systemd.mjs';

// `texts` records the unit text each start ran; `unreachable` fails every call as a missing user bus does.
export function fakeSystemctl({userHome, unreachable = false, startFails = false, pid = 4343} = {}) {
  const manager = {loadedText: null, enabled: false, active: false, pid, exit: '0', calls: [], texts: [], needsReload: false};
  const fileText = () => { try { return readFileSync(agentUnitPath(userHome), 'utf8'); } catch { return null; } };
  const ok = (stdout = '') => ({code: 0, stdout, stderr: ''});
  manager.run = async args => {
    manager.calls.push(args);
    if (unreachable) return {code: 1, stdout: '', stderr: 'Failed to connect to bus: No medium found\n'};
    const [verb, ...rest] = args;
    const unit = rest.find(a => !a.startsWith('--'));
    if (unit !== undefined && unit !== AGENT_UNIT) throw new Error(`unexpected unit ${unit}`);
    if (verb === 'show') {
      const text = fileText();
      const loaded = manager.loadedText !== null;
      return ok([
        `LoadState=${loaded ? 'loaded' : 'not-found'}`,
        `ActiveState=${manager.active ? 'active' : loaded && manager.exit !== '0' ? 'failed' : 'inactive'}`,
        `SubState=${manager.active ? 'running' : 'dead'}`,
        `MainPID=${manager.active ? manager.pid : 0}`,
        `ExecMainStatus=${manager.exit}`,
        `Result=${manager.exit === '0' ? 'success' : 'exit-code'}`,
        `UnitFileState=${loaded ? (manager.enabled ? 'enabled' : 'disabled') : ''}`,
        `NeedDaemonReload=${loaded && text !== manager.loadedText ? 'yes' : 'no'}`,
        'NRestarts=0',
      ].join('\n') + '\n');
    }
    if (verb === 'daemon-reload') { manager.loadedText = fileText(); return ok(); }
    if (verb === 'enable') {
      if (manager.loadedText === null) return {code: 1, stdout: '', stderr: `Failed to enable unit: Unit file ${AGENT_UNIT} does not exist.\n`};
      manager.enabled = true;
      return ok();
    }
    if (verb === 'restart') {
      if (manager.loadedText === null) return {code: 5, stdout: '', stderr: `Failed to restart ${AGENT_UNIT}: Unit ${AGENT_UNIT} not found.\n`};
      if (startFails) { manager.active = false; manager.exit = '1'; return {code: 1, stdout: '', stderr: `Job for ${AGENT_UNIT} failed because the control process exited with error code.\n`}; }
      manager.texts.push(manager.loadedText);
      manager.active = true;
      manager.pid += manager.texts.length > 1 ? 1 : 0;
      return ok();
    }
    if (verb === 'disable') {
      if (!rest.includes('--now')) throw new Error('disable without --now');
      manager.enabled = false;
      manager.active = false;
      return ok();
    }
    throw new Error(`unexpected systemctl --user ${args.join(' ')}`);
  };
  return manager;
}

export function fakeLoginctl({linger = 'no'} = {}) {
  const calls = [];
  const run = async args => {
    calls.push(args);
    if (linger === null) return {code: 1, stdout: '', stderr: 'Failed to get user: User ID 777 is not logged in or lingering\n'};
    return {code: 0, stdout: `${linger}\n`, stderr: ''};
  };
  return {run, calls};
}
