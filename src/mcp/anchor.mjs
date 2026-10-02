// Group-lifetime anchor for one connection's runtime. The server spawns this (with its own Node) as the leader of a
// new process group; it starts the vendor launcher inside that group and then stays alive, ignoring SIGTERM, until the
// server lets it go (IPC disconnect) or the group's final SIGKILL. While it lives, the group's number cannot be
// reused, so a signal the server sends to that number reaches only processes the server started.
//
// Wiring: the launch record arrives as one IPC message (never argv, which other users' `ps` can read). The launcher
// inherits this process's stdin/stdout (the MCP stream) and stderr only, not the IPC channel; the anchor then closes
// its own stdin/stdout copies so the stream ends when the runtime does. The launcher's exit is reported over IPC.
import {spawn} from 'node:child_process';
import {closeSync} from 'node:fs';

for (const signal of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(signal, () => {});
process.on('disconnect', () => process.exit(0));

// The server may already have let go (an immediate close); a report it cannot receive is dropped.
const report = msg => { if (process.connected) process.send(msg, () => {}); };

process.once('message', ({command, args, env, cwd}) => {
  let launcher;
  try {
    launcher = spawn(command, args, {env, cwd, stdio: 'inherit'});
  } catch (error) {
    report({exit: {code: null, signal: null, error: `${error.code ?? 'error'}: ${error.message}`}});
    return;
  }
  closeSync(0);
  closeSync(1);
  launcher.once('spawn', () => report({started: launcher.pid}));
  launcher.once('error', error => report({exit: {code: null, signal: null, error: `${error.code ?? 'error'}: ${error.message}`}}));
  launcher.once('exit', (code, signal) => report({exit: {code, signal}}));
});
