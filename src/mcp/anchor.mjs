// Group-lifetime anchor for one connection's runtime. The server spawns this (with its own Node) as the leader of a
// new process group; it starts the vendor launcher inside that group and then stays alive, ignoring SIGTERM, until the
// server lets it go (IPC disconnect) or the group's final SIGKILL. While it lives, the group's number cannot be
// reused, so a signal the server sends to that number reaches only processes the server started.
//
// Protocol (IPC, in order; never argv, which other users' `ps` can read):
//   server -> {launch: {command, args, env, cwd}}   start the launcher, once, unless already stopped
//   server -> {stop: true}                          launch no more; answered {stopped: true} only after any launch
//                                                   has been handed to the kernel, so after that answer no runtime
//                                                   process can appear that a group listing would miss
//   anchor -> {started: pid}, {exit: {code, signal, error?}}
// The launcher inherits this process's stdin/stdout (the MCP stream) and stderr only, not the IPC channel; the anchor
// then closes its own stdin/stdout copies so the stream ends when the runtime does.
import {spawn} from 'node:child_process';
import {closeSync} from 'node:fs';

for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => {});
process.on('disconnect', () => process.exit(0));

const report = msg => { if (process.connected) process.send(msg, () => {}); };
const failure = error => ({code: null, signal: null, error: `${error.code ?? 'error'}: ${error.message}`});
let stopped = false;
let launched = false;

function launch({command, args, env, cwd}) {
  launched = true;
  let launcher;
  try {
    launcher = spawn(command, args, {env, cwd, stdio: 'inherit'});
  } catch (error) {
    report({exit: failure(error)});
    return;
  }
  closeSync(0);
  closeSync(1);
  launcher.once('spawn', () => report({started: launcher.pid}));
  launcher.once('error', error => report({exit: failure(error)}));
  launcher.once('exit', (code, signal) => report({exit: {code, signal}}));
}

process.on('message', msg => {
  if (msg?.launch && !launched && !stopped) launch(msg.launch);
  if (msg?.stop) { stopped = true; report({stopped: true}); }
});
