// A fake `launchctl` modelling one gui/<uid> domain with cua's agent job, for tests that must never touch the real
// launchd domain.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AGENT_LABEL} from '../../src/remote/launchd.mjs';

export const UID = 501;
const SERVICE = `gui/${UID}/${AGENT_LABEL}`;

// What `launchctl print` shows for a loaded agent (abridged from macOS 26): nested sections are indented further.
export const printed = ({state = 'running', pid, lastExit = '(never exited)'} = {}) => `${SERVICE} = {
\tactive count = 1
\tpath = /Users/me/Library/LaunchAgents/${AGENT_LABEL}.plist
\ttype = LaunchAgent
\tstate = ${state}

\tprogram = /usr/local/bin/node
\targuments = {
\t\t/usr/local/bin/node
\t\tpid = 1
\t}

\tenvironment = {
\t\tXPC_SERVICE_NAME => ${AGENT_LABEL}
\t}

\tdomain = gui/${UID} [100024]
\truns = 1
${pid ? `\tpid = ${pid}\n` : ''}\tlast exit code = ${lastExit}
\tspawn type = daemon (3)
}
`;

// One gui domain. `plists` records what each bootstrap loaded; `bootoutLag` keeps a booted-out job visible to that
// many more prints (launchd finishes stopping a job after bootout returns).
export function fakeLaunchctl({bootstrapFails = false, pid = 4242, bootoutLag = 0} = {}) {
  const domain = {loaded: false, lag: 0, calls: [], plists: [], running: true, lastExit: '(never exited)'};
  domain.run = async args => {
    domain.calls.push(args);
    const [verb, target, path] = args;
    if (verb === 'print') {
      assert.equal(target, SERVICE);
      if (domain.lag > 0) { domain.lag--; return {code: 0, stdout: printed({pid}), stderr: ''}; }
      return domain.loaded
        ? {code: 0, stdout: printed(domain.running ? {pid} : {state: 'not running', lastExit: domain.lastExit}), stderr: ''}
        : {code: 113, stdout: '', stderr: `Bad request.\nCould not find service "${AGENT_LABEL}" in domain for user gui: ${UID}\n`};
    }
    if (verb === 'bootstrap') {
      assert.equal(target, `gui/${UID}`);
      if (bootstrapFails) return {code: 5, stdout: '', stderr: 'Bootstrap failed: 5: Input/output error\n'};
      if (domain.loaded || domain.lag) return {code: 37, stdout: '', stderr: 'Bootstrap failed: 37: Operation already in progress\n'};
      domain.plists.push(readFileSync(path, 'utf8'));
      domain.loaded = true;
      return {code: 0, stdout: '', stderr: ''};
    }
    if (verb === 'bootout') {
      assert.equal(target, SERVICE);
      if (!domain.loaded) return {code: 3, stdout: '', stderr: 'Boot-out failed: 3: No such process\n'};
      domain.loaded = false;
      domain.lag = bootoutLag;
      return {code: 0, stdout: '', stderr: ''};
    }
    throw new Error(`unexpected launchctl ${args.join(' ')}`);
  };
  return domain;
}
