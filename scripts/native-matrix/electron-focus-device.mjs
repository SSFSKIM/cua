// #188's read-only sidecar. No native build changes, extra grants or engine launch: on cua, take a screenshot-free
// Skyshot through a separate connection to the already-running, bundle-attested engine. It owns no activation lease
// and cannot release the driving connection's hold. This is observation with preparation, verified no-open (it may
// enable web AX), not a
// passive AX tap. Run the facade reading first after the click so this read cannot repair its measured first result.
// On vendor, the approved bundle's existing text-view probe reads the app-local focused element; it cannot expose
// AXFocused, so that column is explicitly null. Never start cua's engine alongside the vendor lane.
import {createConnection} from 'node:net';
import {isAbsolute} from 'node:path';
import {createEngineClient} from '../../src/services/engine/client.mjs';
import {FIXTURE_BUNDLE_ID} from './fixtures/electron-fixture.mjs';

// The engine's node flag derives from AXFocused (missing AXFocused is serialized false by Walk.swift). Unlike the
// facade trailer, the app-local focused token remains available even when selected text/rows hide that trailer.
export function focusSnapshot(shot, pid) {
  if (shot?.app?.pid !== pid || shot.app.bundleIdentifier !== FIXTURE_BUNDLE_ID) throw new Error('the focus snapshot did not match the owned fixture identity');
  if (!shot.timings || typeof shot.timings !== 'object') throw new Error('the snapshot lacks observation preparation telemetry');
  if (shot.timings.launched === true || shot.timings.reopened === true) throw new Error('the diagnostic observation opened the fixture');
  const fields = (shot.nodes ?? []).filter(n => n.role === 'AXTextArea' && [n.title, n.description].includes('Fixture text'));
  if (fields.length !== 1) throw new Error('the focus snapshot did not contain exactly one fixture text area');
  const field = fields[0];
  const focused = (shot.nodes ?? []).find(n => n.token === shot.focused);
  const diagnostic = shot.timings?.focusRead;
  return {source: 'cua-skyshot', preparation: {launched: false, reopened: false, noOpenVerified: true}, fieldFound: true, axFocused: typeof field.flags?.focused === 'boolean' ? field.flags.focused : null,
    focusable: typeof field.flags?.focusable === 'boolean' ? field.flags.focusable : null,
    actions: (field.actions ?? []).filter(a => /^AX[A-Za-z]+$/.test(a)),
    focusedIsField: shot.focused === field.token, focusedRead: shot.focused != null,
    focusedRole: /^AX[A-Za-z]+$/.test(focused?.role ?? '') ? focused.role : null,
    selectedTextPresent: typeof shot.selectedText === 'string' && shot.selectedText.length > 0,
    focusRead: /^(outsideTheWalk|notAnElement|AXError -?\d+)$/.test(diagnostic ?? '') ? diagnostic : null};
}

export async function readElectronFocus({engine, approvedEngine, statusOnly = false}, io) {
  const record = io.state()?.scenes?.electron;
  if (!Number.isSafeInteger(record?.pid) || record.bundleId !== FIXTURE_BUNDLE_ID || !isAbsolute(record.app ?? '')) throw new Error('no owned Electron fixture is available for the focus read');
  if (engine === 'vendor') {
    if (statusOnly) return {connections: null, unavailable: 'the vendor exposes no engine connection count'};
    const read = io.probe(['text-view', '--pid', String(record.pid)]);
    if (read?.exitStatus !== 0 || read.pid !== record.pid) throw new Error('the owned Electron text-view focus probe failed');
    return {source: 'text-view-probe', fieldFound: read.windows?.some(w => w.textArea != null) === true,
      axFocused: null, axFocusedUnavailable: 'the fixed text-view probe does not expose AXFocused', actions: null,
      focusedIsField: Number.isInteger(read.focused?.textAreaOfWindow), focusedRead: read.focused?.role != null,
      focusedRole: /^AX[A-Za-z]+$/.test(read.focused?.role ?? '') ? read.focused.role : null, focusRead: null};
  }
  if (engine !== 'cua' || !isAbsolute(approvedEngine ?? '')) throw new Error('the focus read needs --engine cua|vendor and an approved engine bundle');
  const client = (io.createClient ?? createEngineClient)({appPath: approvedEngine, nodeRepl: {
    withSuspendedTimeout: fn => fn(),
    nativePipe: {createConnection: path => new Promise((resolve, reject) => {
      const pipe = createConnection(path);
      pipe.once('error', reject);
      pipe.once('connect', () => {pipe.removeListener('error', reject); resolve(pipe);});
    })},
    launchServices: {openApplication: async () => {throw new Error('the diagnostic only reads an already running engine');}},
  }});
  try {
    await client.connect();
    // status.connections excludes this querying connection. Exactly the lane's driving connection must remain.
    const status = await client.status();
    if (statusOnly) return {connections: status.connections ?? null};
    if (status.connections !== 1) throw new Error('the focus snapshot expected exactly one driving connection');
    const {result} = await client.execute('get_app_state', {app: record.app, includeScreenshot: false}, {deadlineMs: 5000});
    return focusSnapshot(result, record.pid);
  } finally {client.close();}
}
