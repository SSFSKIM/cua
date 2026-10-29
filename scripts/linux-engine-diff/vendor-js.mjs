// `--via vendor-js` (Design, Verification system; Plan of Work, M1a: the facade-level proof): each engine driven
// through OpenAI's own JavaScript client (`@oai/sky`'s Linux target, `create_client`) instead of over the wire, with
// OAI_SKY_LINUX_BIN set in the harness's own process to the engine under measurement. The same requests, the same
// JavaScript, two engines.
//
// The client keeps one engine process per binary path for the life of the process (its transport cache) and never
// ends it. A block's engine must start fresh and end with the block, so each block reaches its engine through a path
// of its own (a symlink in a directory of its own) and ends it by that path. The client's numbering is exercised as
// the facade's is: element requests carry the client's decimal ids, which it resolves to native ids itself.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadVendorClient } from './wire-check.mjs';

const now = () => Number(process.hrtime.bigint()) / 1e6;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The wire-shaped value of a hydrated tree: native ids back in `id`, the client's decimal id dropped. */
export function dehydrateTree(node) {
  if (!node) return node;
  const { native_id: native, children = [], ...rest } = node;
  return { ...rest, id: native ?? rest.id, children: children.map(dehydrateTree) };
}

/** The decimal id the client gave each native id of a hydrated tree. */
export function decimalIds(node, out = new Map()) {
  if (!node) return out;
  if (node.native_id !== undefined) out.set(node.native_id, node.id);
  for (const child of node.children ?? []) decimalIds(child, out);
  return out;
}

/** A wrapper's result as the engine's wire output, with the client's own renderings beside it. */
export function asOutput(command, result, dir) {
  if (result === undefined) return null;
  if (command === 'get_window_state') {
    const screenshots = (result.screenshots ?? []).map((shot, i) => {
      const filepath = join(dir, `shot-${Date.now()}-${i}.jpg`);
      writeFileSync(filepath, Buffer.from(shot.bytes));
      return { filepath, data_url_ok: shot.data_url === `data:image/jpeg;base64,${Buffer.from(shot.bytes).toString('base64')}` };
    });
    return {
      ax_tree: dehydrateTree(result.ax_tree),
      ax_tree_source: result.ax_tree_source,
      screenshots,
      window: result.window,
      rendered: typeof result.ax_tree?.to_string === 'function' ? result.ax_tree.to_string() : null,
    };
  }
  if (command === 'get_screenshot') return result.map((shot) => ({ filepath: shot.filepath }));
  return result;
}

export class VendorJsEngine {
  constructor({ label, bin, skyDir, env }) {
    this.label = label;
    this.bin = bin;
    this.skyDir = skyDir;
    this.env = env;
    this.started = false;
    this.requests = 0;
  }

  /** Prepares the block's own path to the engine; the client spawns it on its first request. */
  start() {
    this.dir = mkdtempSync(join(tmpdir(), `cua171-vjs-${this.label.replace(/[^a-z0-9]+/gi, '_')}-`));
    this.link = join(this.dir, `sky_linux_${process.arch}`);
    symlinkSync(this.bin, this.link);
    this.spawnedAt = now();
    this.started = true;
    return this;
  }

  async client() {
    if (!this.instance) {
      const createClient = await loadVendorClient(this.skyDir);
      this.instance = createClient({});
    }
    return this.instance;
  }

  /** Runs fn with the engine's environment in the process (the client spawns the engine with process.env). */
  async withEnv(fn) {
    const saved = {};
    const overrides = { ...(this.env ?? {}), OAI_SKY_LINUX_BIN: this.link };
    for (const [k, v] of Object.entries(overrides)) {
      saved[k] = process.env[k];
      process.env[k] = v;
    }
    try {
      return await fn();
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  }

  /**
   * `drag_handle` is a handle in the client (`drag_handle()` returns `{start, move_to, end}`, which keep its state):
   * a start takes a new one, the moves and the end go to it. A move or an end with no handle started goes to a new
   * one, which refuses it as the client does.
   */
  dragHandle(client, { action, ...point }) {
    if (action === 'start' || !this.handle) this.handle = client.drag_handle();
    const handle = this.handle;
    if (action === 'end') this.handle = null;
    if (typeof handle[action] !== 'function') throw new Error(`the vendor client's drag handle has no ${action}`);
    return action === 'end' ? handle.end() : handle[action](point);
  }

  async request(command, input = {}) {
    const client = await this.client();
    const first = this.requests++ === 0;
    const fn = command === 'drag_handle' && typeof client.drag_handle === 'function' ? (i) => this.dragHandle(client, i) : client[command];
    const sentAt = now();
    let response;
    if (typeof fn !== 'function') {
      response = { id: null, ok: false, error: `the vendor client has no ${command}` };
    } else {
      try {
        const result = await this.withEnv(() => fn(input));
        response = { id: null, ok: true, output: asOutput(command, result, this.dir) };
      } catch (error) {
        response = { id: null, ok: false, error: String(error?.message ?? error) };
      }
    }
    const at = now();
    return { response, ms: at - sentAt, sinceSpawnMs: first ? at - this.spawnedAt : null, stats: null };
  }

  /** The client's decimal ids for named native ids of a window, from its own read of the window (untimed). */
  async resolveElements(scene, natives) {
    const client = await this.client();
    const state = await this.withEnv(() => client.get_window_state({ window: { id: scene.id }, include_screenshot: false }));
    const ids = decimalIds(state.ax_tree);
    return Object.fromEntries(Object.entries(natives).map(([name, native]) => [name, ids.get(native) ?? native]));
  }

  /** Ends the block's engine by its own path and removes the path. */
  async close() {
    if (!this.started) return;
    this.started = false;
    const running = () => {
      try {
        return execFileSync('pgrep', ['-f', '--', this.link], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      } catch {
        return [];
      }
    };
    for (const pid of running()) {
      try {
        process.kill(Number(pid), 'SIGTERM');
      } catch {
        // already gone
      }
    }
    for (let i = 0; i < 200 && running().length; i++) await sleep(25);
    for (const pid of running()) {
      try {
        process.kill(Number(pid), 'SIGKILL');
      } catch {
        // already gone
      }
    }
    rmSync(this.dir, { recursive: true, force: true });
  }
}
