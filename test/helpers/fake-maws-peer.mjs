#!/usr/bin/env node
// A fake MAWS peer: the in-app browser's side of the primitive protocol (docs/doperpowers/specs/2026-10-08-maws-in-app-
// browser-design.md, "The MAWS primitive server") over synthetic tabs, built on the fake cua extension
// (fake-cua-extension.mjs), which already models the extension's side. It listens on a Unix socket, as MAWS does, and
// each connection gets its own state (MAWS keeps per-connection state only) and, at once, a hello carrying
// `profileName: 'MAWS'`. On top of the extension's primitives it serves `cursor.move` (recorded) and can announce an
// adopted popup (`tabs.adopted`). CDP answers are a blank page's (scripts/probe/chrome/host-layer.mjs blankPageCdp), so
// the real vendor service can finish createBrowserTab against it; nothing renders. Target.closeTarget on a tab's debuggee
// closes that tab, as Chrome does and as MAWS emulates it (the vendor's tab.close() sends it).
//
// `chrome: true` makes it Chrome-shaped instead: the cua extension's hello (no profileName, a uuid-like instance id) and
// no cursor.move, which is how the default-selection probe stands in a "Chrome profile" without driving a real Chrome.
//
// As a script, for manual checks:
//   node test/helpers/fake-maws-peer.mjs --listen /tmp/maws-fake.sock [--instance-id maws:x] [--chrome]
// prints one JSON line {listening, instanceId} and serves until SIGINT or SIGTERM.
import {randomUUID} from 'node:crypto';
import {rmSync} from 'node:fs';
import {createServer} from 'node:net';
import {basename, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {createFakeCuaExtension} from './fake-cua-extension.mjs';
import {blankPageCdp} from '../../scripts/probe/chrome/host-layer.mjs';

export const MAWS_PROFILE_NAME = 'MAWS';
// MAWS names an app session's socket <appSessionId>.sock and its instance maws:<appSessionId>; the fake does the same.
export const instanceIdFor = path => `maws:${basename(path, '.sock')}`;

// One connection's side of the peer.
export function createFakeMawsExtension({instanceId = `maws:${randomUUID()}`, chrome = false, cdp, ...options} = {}) {
  const cursor = [];
  const refusals = [];
  let blank = null;
  const ext = createFakeCuaExtension({
    instanceId, ...options,
    cdp: cdp ?? (params => {
      if (params.method !== 'Target.closeTarget' || params.debuggee?.tabId === undefined) return blank(params);
      setImmediate(() => ext.userCloseTab(params.debuggee.tabId));
      return {success: true};
    }),
    extraPrimitives: {
      hostRefused: params => { refusals.push(params); },
      ...(chrome ? {} : {'cursor.move': ({tabId, x, y}) => { cursor.push({tabId, x, y}); return {}; }}),
    },
    helloFields: chrome ? {} : {extensionId: 'maws', profileName: MAWS_PROFILE_NAME},
  });
  blank = blankPageCdp(ext);
  return Object.assign(ext, {
    cursor, refusals,
    // A leased tab's window.open honoured: the child is already a tab, announced by id.
    adopt(openerTabId, url = 'about:blank') {
      const opener = ext.state.tabs.get(openerTabId);
      const tab = ext.addTab({windowId: opener?.windowId, url, title: ''});
      ext.emit('tabs.adopted', {openerTabId, tabId: tab.id, url});
      return tab;
    },
  });
}

// The listening peer: -> {path, instanceId, connections: [{ext, port, socket}], live(), stop()}.
export async function startFakeMawsPeer({path, instanceId = instanceIdFor(path), chrome = false, extension = {}} = {}) {
  rmSync(path, {force: true});
  const connections = [];
  const server = createServer(socket => {
    const ext = createFakeMawsExtension({instanceId, chrome, ...extension});
    const port = ext.connect({toHost: socket, fromHost: socket});
    const entry = {ext, port, socket, closed: false};
    connections.push(entry);
    socket.on('error', () => {});
    socket.once('close', () => { entry.closed = true; ext.disconnect(); });
  });
  await new Promise((done, fail) => { server.once('error', fail); server.listen(path, done); });
  return {
    path, instanceId, connections,
    live: () => connections.filter(c => !c.closed),
    // Stops listening and drops every connection, as MAWS quitting does; the socket file goes with it.
    stop: () => new Promise(done => {
      for (const c of connections) c.socket.destroy();
      server.close(() => done());
    }),
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const {values} = parseArgs({options: {listen: {type: 'string'}, 'instance-id': {type: 'string'}, chrome: {type: 'boolean'}}});
  if (!values.listen) { process.stderr.write('usage: fake-maws-peer.mjs --listen <socket path> [--instance-id <id>] [--chrome]\n'); process.exit(2); }
  const path = resolve(values.listen);
  const chrome = values.chrome === true;
  const peer = await startFakeMawsPeer({path, chrome, ...(values['instance-id'] ? {instanceId: values['instance-id']} : chrome ? {instanceId: randomUUID()} : {})});
  process.stdout.write(`${JSON.stringify({listening: path, instanceId: peer.instanceId, chrome})}\n`);
  const stop = async () => { await peer.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
