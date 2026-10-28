// The harness's own reads of the accessibility bus (`busctl`), independent of any engine: an application's toolkit,
// the registry's applications of a process, and a harness window's text, caret, extents and names, which is how
// the family matrix reads an input's effect back where an engine's tree does not carry it (GTK4's `text box`, a
// Writer paragraph and Firefox's text carry no `value`; kate's frame does not associate). It is only ever pointed
// at windows the harness opened.

import { execFileSync } from 'node:child_process';

import { parseBusctl, splitNodeId } from './matrix-judge.mjs';
import { a11yBusAddress } from './scenes.mjs';

const REGISTRY = 'org.a11y.atspi.Registry';
const ROOT = '/org/a11y/atspi/accessible/root';
const STATE = { editable: 7, focused: 12, showing: 25 };

export class Oracle {
  constructor() {
    this.address = a11yBusAddress();
  }

  call(dest, path, iface, member, signature, ...args) {
    const argv = [`--address=${this.address}`, '--json=short', '--timeout=5', 'call', '--', dest, path, iface, member];
    if (signature) argv.push(signature, ...args.map(String));
    return parseBusctl(execFileSync('busctl', argv, { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }));
  }

  on(id, iface, member, signature, ...args) {
    const at = splitNodeId(id);
    if (!at) throw new Error(`${id} is not an AT-SPI node`);
    return this.call(at.bus, at.path, iface, member, signature, ...args);
  }

  prop(id, iface, name) {
    return this.on(id, 'org.freedesktop.DBus.Properties', 'Get', 'ss', iface, name)[0];
  }

  /** `{toolkit, toolkit_version}` of the application that owns a node. */
  toolkit(id) {
    const root = `${splitNodeId(id).bus}:${ROOT}`;
    const get = (name) => {
      try {
        return this.prop(root, 'org.a11y.atspi.Application', name);
      } catch {
        return null;
      }
    };
    return { toolkit: get('ToolkitName'), toolkit_version: get('Version') };
  }

  /** The registry's applications whose connection belongs to the process, as root node ids. */
  appsOf(pid) {
    const [apps] = this.call(REGISTRY, ROOT, 'org.a11y.atspi.Accessible', 'GetChildren');
    const out = [];
    for (const [bus] of apps) {
      try {
        const [p] = this.call('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'GetConnectionUnixProcessID', 's', bus);
        if (p === pid) out.push(`${bus}:${ROOT}`);
      } catch {
        // gone meanwhile
      }
    }
    return out;
  }

  children(id) {
    return this.on(id, 'org.a11y.atspi.Accessible', 'GetChildren')[0].map(([bus, path]) => `${bus}:${path}`);
  }

  role(id) {
    return this.on(id, 'org.a11y.atspi.Accessible', 'GetRoleName')[0];
  }

  name(id) {
    return this.prop(id, 'org.a11y.atspi.Accessible', 'Name');
  }

  states(id) {
    const [[low, high]] = this.on(id, 'org.a11y.atspi.Accessible', 'GetState');
    const has = (bit) => (bit < 32 ? (low >>> bit) & 1 : (high >>> (bit - 32)) & 1) === 1;
    return Object.fromEntries(Object.entries(STATE).map(([k, bit]) => [k, has(bit)]));
  }

  text(id) {
    return this.on(id, 'org.a11y.atspi.Text', 'GetText', 'ii', 0, -1)[0];
  }

  caret(id) {
    return this.prop(id, 'org.a11y.atspi.Text', 'CaretOffset');
  }

  /** Screen extents `{x, y, w, h}`. */
  extents(id) {
    const [[x, y, w, h]] = this.on(id, 'org.a11y.atspi.Component', 'GetExtents', 'u', 0);
    return { x, y, w, h };
  }

  /** Depth-first walk from a node: `{id, role}` of every node, skipping the subtrees of the pruned roles. */
  walk(id, { prune = [], limit = 3000 } = {}) {
    const out = [];
    const stack = [id];
    while (stack.length && out.length < limit) {
      const node = stack.pop();
      let role;
      try {
        role = this.role(node);
      } catch {
        continue;
      }
      out.push({ id: node, role });
      if (prune.includes(role)) continue;
      try {
        stack.push(...this.children(node).reverse());
      } catch {
        // no children readable
      }
    }
    return out;
  }
}
