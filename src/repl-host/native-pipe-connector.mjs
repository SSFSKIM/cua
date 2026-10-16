// The connector process behind ./native-pipe-directory.mjs: started by the supervisor with its working directory set
// to a long socket path's parent, it checks that directory is the one the supervisor opened (`dev` and `ino`), connects
// the bare file name, as the vendor does after pthread_fchdir_np, and then owns that connection until it closes,
// carrying its events and writes over the IPC channel. The parent leaving (the channel's disconnect) ends it.
// argv: <file name> <dev> <ino>.
import {statSync} from 'node:fs';
import {createConnection} from 'node:net';

const [name, dev, ino] = process.argv.slice(2);
const send = (message, then) => { if (process.connected) process.send(message, then); };
const systemError = error => ({message: error.message, code: error.code, errno: error.errno, syscall: error.syscall});

process.on('disconnect', () => process.exit(0));
const here = statSync('.', {bigint: true});
if (String(here.dev) !== dev || String(here.ino) !== ino) {
  send({type: 'moved'}, () => process.disconnect());
} else {
  const socket = createConnection({path: name});
  socket.on('connect', () => send({type: 'connect'}));
  socket.on('data', data => send({type: 'data', data}));
  socket.on('end', () => send({type: 'end'}));
  socket.on('error', error => send({type: 'error', error: systemError(error)}));
  socket.on('close', () => send({type: 'close'}, () => process.disconnect()));
  process.on('message', ({op, id, data}) => {
    if (op === 'write') socket.write(Buffer.from(data.buffer, data.byteOffset, data.byteLength), error => send({type: 'written', id, error: error ? systemError(error) : null}));
    else if (op === 'end') socket.end(() => send({type: 'ended', id}));
  });
}
