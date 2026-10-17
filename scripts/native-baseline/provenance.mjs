// Harness-only launch witness. A cached initialize cannot supply it: a real launched host must answer a tool call.
import {Writable} from 'node:stream';
import {assertManagedNode, observeLaunchNode, nodeVersion} from '../repl-parity/node-provenance.mjs';
export function nativeProvenance({home, host, mode, output, versionOf = nodeVersion}) {
  let answeringNode, pending = '';
  return {
    prepareLaunch(launch) {
      const observed = observeLaunchNode(launch, versionOf);
      if (host === 'cua' && mode !== 'diagnostic-override') assertManagedNode({home, ownNode: observed});
      answeringNode = observed;
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
          if (message.result?.content && answeringNode) message.result._meta = {...message.result._meta, 'cua/nativeExecution': answeringNode};
          output.write(JSON.stringify(message) + '\n');
        }
        done();
      } catch (error) { done(error); }
    }}),
  };
}
