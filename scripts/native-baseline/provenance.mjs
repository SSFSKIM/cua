// Harness-only launch witness. A cached initialize cannot supply it: a real launched host must answer a tool call.
// Two observations of the actual launch ride on every real answer after it: the Node that answers
// (`cua/nativeExecution`) and what confines its children (`cua/sandboxLaunch`, sandboxLaunchOf).
import {Writable} from 'node:stream';
import {basename, join} from 'node:path';
import {realpathSync} from 'node:fs';
import {assertManagedNode, observeLaunchNode, nodeVersion} from '../repl-parity/node-provenance.mjs';

// What confines a launch's children, in the terms the same-host comparison (#115 acceptance 11) permits to change:
// `launcher`, the sandbox launcher CODEX_CLI_PATH names ('codex-cli', the Codex CLI; 'cua-compat', cua's compat
// executable for the vendor host; 'cua' when the launch names none, so cua's own launcher confines the children), and
// `tmpdir`, whether TMPDIR is the session's own directory under the home ($CUA_HOME/run/<id>/tmp or $CUA_HOME/tmp/<id>:
// 'session'), the caller's ('inherited') or absent ('unset').
export function sandboxLaunchOf(launch, home) {
  const cli = launch.env?.CODEX_CLI_PATH, tmp = launch.env?.TMPDIR;
  const launcher = cli === undefined ? 'cua' : basename(cli) === 'cua-codex-compat' ? 'cua-compat' : 'codex-cli';
  let real = home;
  try { real = realpathSync(home); } catch {}
  const roots = [...new Set([home, real])].flatMap(root => [join(root, 'run') + '/', join(root, 'tmp') + '/']);
  const tmpdir = tmp === undefined ? 'unset' : roots.some(root => tmp.startsWith(root)) ? 'session' : 'inherited';
  return {launcher, tmpdir};
}

export function nativeProvenance({home, host, mode, output, versionOf = nodeVersion}) {
  let answeringNode, sandboxLaunch, pending = '';
  return {
    prepareLaunch(launch) {
      const observed = observeLaunchNode(launch, versionOf);
      if (host === 'cua' && mode !== 'diagnostic-override') assertManagedNode({home, ownNode: observed});
      answeringNode = observed;
      sandboxLaunch = sandboxLaunchOf(launch, home);
      return launch;
    },
    output: new Writable({write(chunk, _encoding, done) {
      try {
        pending += chunk.toString();
        let end;
        while ((end = pending.indexOf('\n')) >= 0) {
          const line = pending.slice(0, end); pending = pending.slice(end + 1);
          if (!line.trim()) continue;
          const message = JSON.parse(line);
          if (message.result?.content && answeringNode) message.result._meta = {...message.result._meta, 'cua/nativeExecution': answeringNode, 'cua/sandboxLaunch': sandboxLaunch};
          output.write(JSON.stringify(message) + '\n');
        }
        done();
      } catch (error) { done(error); }
    }}),
  };
}
