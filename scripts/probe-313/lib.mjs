// #313's hosted A/B: what web.mjs and native.mjs share (the engine's wire and process, TextEdit in front, the AX tool).
import {spawn, spawnSync} from 'node:child_process';
import {createConnection} from 'node:net';
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const sh = (cmd, args, timeout = 20_000) => { const r = spawnSync(cmd, args, {encoding: 'utf8', timeout}); return {status: r.status, out: (r.stdout || '').trim(), err: (r.stderr || '').trim()}; };
export const osa = script => sh('osascript', ['-e', script]);
export const json = r => { try { return JSON.parse(r.out); } catch { return {status: r.status, out: r.out.slice(0, 1000), err: r.err.slice(0, 1000)}; } };
export const fileName = label => label.replace(/[^a-z0-9-]+/gi, '_');
export const frontmost = () => {
  const asn = sh('lsappinfo', ['front']).out;
  const info = sh('lsappinfo', ['info', '-only', 'bundleid', asn]).out;
  return (info.match(/"CFBundleIdentifier"="([^"]*)"/) || [])[1] || info || null;
};
export const lean = response => JSON.parse(JSON.stringify(response, (k, v) => (k === 'nodes' || k === 'menuBar' ? `[${Array.isArray(v) ? v.length : '?'} omitted]` : v)));
export const centre = f => ({x: f.x + f.width / 2, y: f.y + f.height / 2});

// The engine's wire: a 4-byte little-endian length, then JSON-RPC 2.0.
export class Wire {
  static connect(path) {
    return new Promise((resolve, reject) => {
      const s = createConnection(path);
      s.once('connect', () => { s.off('error', reject); resolve(new Wire(s)); });
      s.once('error', reject);
    });
  }
  constructor(s) {
    this.s = s; this.buf = Buffer.alloc(0); this.pending = new Map(); this.id = 1;
    s.on('data', d => {
      this.buf = Buffer.concat([this.buf, d]);
      while (this.buf.length >= 4) {
        const n = this.buf.readUInt32LE(0);
        if (this.buf.length < 4 + n) break;
        const msg = JSON.parse(this.buf.subarray(4, 4 + n).toString('utf8'));
        this.buf = this.buf.subarray(4 + n);
        this.pending.get(msg.id)?.(msg); this.pending.delete(msg.id);
      }
    });
    s.on('error', () => {});
  }
  call(method, params = {}, timeout = 90_000) {
    const id = this.id++;
    const bytes = Buffer.from(JSON.stringify({jsonrpc: '2.0', id, method, params}), 'utf8');
    const head = Buffer.alloc(4); head.writeUInt32LE(bytes.length, 0);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method}: no answer in ${timeout} ms`)); }, timeout);
      this.pending.set(id, m => { clearTimeout(t); resolve(m); });
      this.s.write(Buffer.concat([head, bytes]));
    });
  }
  execute(method, args, extra = {}) { return this.call('execute', {method, args, deadlineUnixMilliseconds: Date.now() + 80_000, ...extra}); }
  close() { this.s.destroy(); }
}

// One engine process per cell, on a socket of the run's own (0700; the path well under 103 bytes).
export async function startEngine(bin, sockDir, label) {
  mkdirSync(sockDir, {recursive: true, mode: 0o700});
  const socket = join(sockDir, `${fileName(label).slice(0, 24)}.sock`);
  const child = spawn(bin, [], {env: {...process.env, CUA_ENGINE_SOCKET: socket}, stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  child.stdout.on('data', () => {});
  for (let i = 0; i < 300; i++) {
    if (child.exitCode !== null) throw new Error(`engine exited ${child.exitCode}: ${stderr.slice(0, 2000)}`);
    try { return {child, wire: await Wire.connect(socket), stderr: () => stderr}; } catch { await sleep(50); }
  }
  throw new Error(`engine did not listen: ${stderr.slice(0, 2000)}`);
}
export async function stopEngine(engine) {
  if (!engine) return '';
  try { await engine.wire.call('shutdown', {}, 5000); } catch {}
  engine.wire.close();
  const tail = engine.stderr().slice(-3000);
  if (engine.child.exitCode === null) engine.child.kill('SIGKILL');
  return tail;
}

// TextEdit frontmost, its window at the screen's left (the runner's screen is 1024 x 768; the target sits at x 400 on).
export async function frontTextEdit(doc) {
  for (let i = 0; i < 4; i++) {
    sh('open', ['-a', 'TextEdit', doc]);
    await sleep(1500);
    if (frontmost() === 'com.apple.TextEdit') break;
  }
  const place = osa('tell application "System Events"\ntell process "TextEdit"\nset position of window 1 to {0, 40}\nset size of window 1 to {380, 300}\nend tell\nend tell');
  await sleep(500);
  return {front: frontmost(), placeStatus: place.status};
}

// The AX tool (ax.swift).
export const axTool = ax => ({
  at: (pid, p) => json(sh(ax, ['at', String(pid), String(p.x), String(p.y)])),
  focus: pid => json(sh(ax, ['focus', String(pid)])),
});

// The answer's short reading: its error name or success, with the meta's route and element-click record.
export function answer(response) {
  if (!response) return null;
  const meta = response.error ? response.error.meta : response.result?.meta;
  return {answer: response.error ? (response.error.errorName ?? `code ${response.error.code}`) : 'success',
    message: response.error?.message?.slice(0, 300) ?? null, route: meta?.inputRoute ?? null, elementClick: meta?.elementClick ?? null,
    activationClickKind: meta?.activationClickKind ?? null, note: response.result?.note ?? meta?.note ?? null};
}

export function config(extra) {
  return {imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null, macOS: sh('sw_vers', []).out.replace(/\s+/g, ' '),
    head: process.env.P313_HEAD ?? null, headCommit: process.env.P313_HEAD_COMMIT ?? null, rep: process.env.P313_REP ?? null, kit: process.env.GITHUB_SHA ?? null, ...extra};
}

export function writeResults(out, cfg, rows) { writeFileSync(join(out, 'results.json'), JSON.stringify({config: cfg, cells: rows}, null, 1)); }
