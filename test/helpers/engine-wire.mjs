// Test-side helpers for cua's native engine (docs/doperpowers/specs/2026-10-18-own-native-engine-design.md, M0 spike;
// Interfaces, EngineProtocol): the debug build the engine tests make for themselves, an engine run directly under
// CUA_ENGINE_SOCKET, and a raw client of its wire (a 4-byte little-endian length, then UTF-8 JSON-RPC 2.0) that can also
// write malformed and oversized frames. Not the service's client, which is M1a's src/services/engine/client.mjs.
import {spawn, spawnSync} from 'node:child_process';
import {existsSync, readFileSync} from 'node:fs';
import {createConnection} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {REPO} from '../fixtures/runtime-fixture.mjs';

export const PACKAGE = join(REPO, 'native', 'engine');
export const MAX_FRAME = 8 * 1024 * 1024;
export const API_VERSION = 'cua-engine-1';

// A fixed scratch path outside the package, so a second run (and the second test file) builds incrementally;
// CUA_ENGINE_SCRATCH names another (one build directory for every engine test, where disk is short).
export const SCRATCH = process.env.CUA_ENGINE_SCRATCH || join(tmpdir(), 'cua-engine-test-build');
export const UNIT_SCRATCH = process.env.CUA_ENGINE_SCRATCH || join(tmpdir(), 'cua-engine-unit-build');

const hasSwift = () => process.platform === 'darwin' && spawnSync('swift', ['--version'], {stdio: 'ignore'}).status === 0;
export const engineSkip = process.platform !== 'darwin' ? 'cua-engine is macOS only'
  : !hasSwift() ? 'no Swift toolchain' : false;

export function engineVersionFromSource() {
  const source = readFileSync(join(PACKAGE, 'Sources', 'Engine', 'Version.swift'), 'utf8');
  return source.match(/\bengineVersion = "([^"]+)"/)[1];
}

// Builds the debug executable once per process; returns its path.
let built;
export function debugEngine() {
  if (built) return built;
  const result = spawnSync('swift', ['build', '--package-path', PACKAGE, '--scratch-path', SCRATCH], {encoding: 'utf8', timeout: 900_000});
  if (result.status !== 0) throw new Error(`swift build failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
  const bin = join(SCRATCH, 'debug', 'cua-engine');
  if (!existsSync(bin)) throw new Error(`no executable at ${bin}`);
  return (built = bin);
}

// The environment an engine runs under in a test: the caller's, without an inherited override.
export function engineEnv(extra = {}) {
  const env = {...process.env, ...extra};
  if (!('CUA_ENGINE_SOCKET' in extra)) delete env.CUA_ENGINE_SOCKET;
  return env;
}

// Starts `bin` (the debug executable or a bundle's) and resolves once its socket answers a connect; registers a kill on
// the test's end. `socket` null runs it without CUA_ENGINE_SOCKET, `expect` the path it should bind then.
export async function startEngine(t, bin, {socket, expect = socket, env: extra = {}} = {}) {
  const env = socket === null ? engineEnv(extra) : engineEnv({...extra, CUA_ENGINE_SOCKET: socket});
  const child = spawn(bin, [], {env, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', chunk => { stderr += chunk; });
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({code, signal})));
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); });
  const deadline = Date.now() + 15_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`engine exited ${child.exitCode} before listening: ${stderr}`);
    try {
      const wire = await Wire.connect(expect);
      wire.close();
      return {child, exited, stderr: () => stderr};
    } catch {
      if (Date.now() > deadline) throw new Error(`engine did not listen on ${expect}: ${stderr}`);
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }
}

export function frame(body) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(bytes.length, 0);
  return Buffer.concat([header, bytes]);
}

// One connection: frames read in order, each awaited with next(); `closed` resolves when the engine closes it.
export class Wire {
  static connect(path) {
    return new Promise((resolve, reject) => {
      const socket = createConnection(path);
      socket.once('connect', () => { socket.off('error', reject); resolve(new Wire(socket)); });
      socket.once('error', reject);
    });
  }

  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.frames = [];
    this.waiters = [];
    this.ended = false;
    this.nextId = 1;
    this.closed = new Promise(resolve => socket.once('close', resolve));
    socket.on('data', chunk => { this.buffer = Buffer.concat([this.buffer, chunk]); this.drain(); });
    socket.on('close', () => { this.ended = true; this.flush(); });
    socket.on('error', () => {});
  }

  drain() {
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (this.buffer.length < 4 + length) break;
      this.frames.push(JSON.parse(this.buffer.subarray(4, 4 + length).toString('utf8')));
      this.buffer = this.buffer.subarray(4 + length);
    }
    this.flush();
  }

  flush() {
    while (this.waiters.length && (this.frames.length || this.ended)) {
      const {resolve} = this.waiters.shift();
      resolve(this.frames.length ? this.frames.shift() : null);
    }
  }

  // The next frame, or null once the engine closed the connection.
  next(timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no frame within ${timeoutMs} ms`)), timeoutMs);
      this.waiters.push({resolve: value => { clearTimeout(timer); resolve(value); }});
      this.flush();
    });
  }

  write(bytes) { this.socket.write(bytes); }

  send(method, params = {}) {
    const id = this.nextId++;
    this.write(frame({jsonrpc: '2.0', id, method, params}));
    return id;
  }

  async call(method, params = {}) {
    const id = this.send(method, params);
    const response = await this.next();
    if (response?.id !== id) throw new Error(`expected the response to ${id}, got ${JSON.stringify(response)}`);
    return response;
  }

  async result(method, params = {}) {
    const response = await this.call(method, params);
    if (response.error) throw new Error(`${method} failed: ${JSON.stringify(response.error)}`);
    return response.result;
  }

  execute(method, args = {}) {
    return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 120_000});
  }

  close() { this.socket.destroy(); }
}
