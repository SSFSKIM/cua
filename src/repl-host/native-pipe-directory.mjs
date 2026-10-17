// A Unix socket connected in its own directory, for a macOS socket path too long for sun_path (./native-pipe.mjs).
// The vendor connects one of those after pthread_fchdir_np into the parent it opened; Node has no per-thread working
// directory, so a connector process (./native-pipe-connector.mjs) is started with that working directory, checks it
// is the directory the vendor's open saw (its dev and ino), connects the bare file name and keeps the connection for
// its whole life. Handing the socket back instead would change the process the server sees operating it
// (LOCAL_PEERPID names the last operator), which a server that authorizes its peer by ancestry at accept, such as
// MAWS, can catch mid-check; the connector stays the one live peer, a child of the supervisor, until the close.
//
// connectInDirectory({directory, name, identity}, {own}) -> a socket for the relay: it emits connect, data, end, error and
// close as a net.Socket does, and takes write(bytes, callback), end(callback) and destroy(). Nothing is made in the
// filesystem. The connector runs unsandboxed, as the supervisor and its own connects do: it opens only this socket,
// and the scoped sandbox would deny that. It ends with its connection, on destroy (killed) and when the supervisor's
// IPC channel closes, whatever ended the supervisor. It is the supervisor's child, not the trusted worker's, so
// `own(pid)` registers it with the owned-group reaper from its spawn until it has actually exited: a kernel's end, which
// reaps the group, must not take a connection the worker still holds.
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
import {fileURLToPath} from 'node:url';

const CONNECTOR = fileURLToPath(new URL('./native-pipe-connector.mjs', import.meta.url));
export const CONNECTOR_EXITED_SENTENCE = 'native pipe connector exited';
export const DIRECTORY_CHANGED_SENTENCE = 'native pipe directory changed while connecting';

const asError = ({message, code, errno, syscall}) => Object.assign(new Error(message), {code, errno, syscall});
const asBuffer = bytes => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);

class ConnectorSocket extends EventEmitter {
  destroyed = false;
  writable = false;
  #child;
  #pending = new Map();   // request id -> the write or end callback the connector has not answered yet
  #next = 0;
  #closed = false;

  constructor(child) {
    super();
    this.#child = child;
    child.on('message', message => this.#receive(message));
    child.on('error', error => this.#fail(error));
    // The channel closes after the connector's last message, so a close it did not announce is its death.
    child.on('disconnect', () => this.#fail(new Error(CONNECTOR_EXITED_SENTENCE)));
  }

  get pid() { return this.#child.pid; }

  write(data, callback) {
    this.#request({op: 'write', data}, callback);
    return true;
  }

  end(callback) {
    this.writable = false;
    this.#request({op: 'end'}, callback && (() => callback()));
  }

  destroy() {
    if (this.#closed) return;
    this.#child.kill('SIGKILL');
    this.#close(new Error(CONNECTOR_EXITED_SENTENCE));
  }

  #request(message, callback) {
    const id = this.#next++;
    if (callback) this.#pending.set(id, callback);
    try {
      this.#child.send({...message, id});
    } catch (error) {
      this.#pending.delete(id);
      if (callback) queueMicrotask(() => callback(error));
    }
  }

  #receive(message) {
    if (this.#closed) return;
    switch (message.type) {
      case 'connect': this.writable = true; return this.emit('connect');
      case 'data': return this.emit('data', asBuffer(message.data));
      case 'end': return this.emit('end');
      case 'error': return this.emit('error', asError(message.error));
      case 'written':
      case 'ended': {
        const callback = this.#pending.get(message.id);
        this.#pending.delete(message.id);
        return callback?.(message.error ? asError(message.error) : null);
      }
      case 'moved': return this.#fail(new Error(DIRECTORY_CHANGED_SENTENCE));
      case 'close': return this.#close(new Error(CONNECTOR_EXITED_SENTENCE));
    }
  }

  // The connector failed or died before its connection closed: the error, then the close.
  #fail(error) {
    if (this.#closed) return;
    this.#child.kill('SIGKILL');
    this.emit('error', error);
    this.#close(error);
  }

  // Once: what the connector never answered fails with `error`, and close follows on a later tick, as for a net.Socket.
  #close(error) {
    if (this.#closed) return;
    this.#closed = true;
    this.destroyed = true;
    this.writable = false;
    const pending = [...this.#pending.values()];
    this.#pending.clear();
    queueMicrotask(() => {
      for (const callback of pending) callback(error);
      this.emit('close');
    });
  }
}

export function connectInDirectory({directory, name, identity}, {own = () => () => {}} = {}) {
  const child = spawn(process.execPath, ['--disable-sigusr1', CONNECTOR, name, String(identity?.dev), String(identity?.ino)],
    {cwd: directory, env: {}, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], serialization: 'advanced'});
  if (child.pid) child.once('exit', own(child.pid));
  return new ConnectorSocket(child);
}
