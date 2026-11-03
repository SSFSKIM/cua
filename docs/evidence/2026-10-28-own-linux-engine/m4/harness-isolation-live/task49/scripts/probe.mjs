// Task 49 (#171 M4): task 47's B2 and task 48's stand-in, on a private display instead of :0 (task 47's live list, items
// 1 and 2: "a private display whose run is given an activate-nothing bus, which tests Qt safely"). The run's own
// Desktop, its record hook off (part 1 runs no RECORD), with one injected `startSession` that builds on this private
// display what a person's display has: first a session of the run's standing for the person's (the harness's own
// `startPrivateSession`: a launcher on a bus of its own, which marks the display's root AT_SPI_BUS), then, on top, the
// session the harness gives its applications on a person's display (`startAppSession`: a bus that activates nothing,
// and the stand-in for org.a11y.Bus answering the root's bus). Every family then opens as the harness opens it and its
// window is read by cua-engine and the pinned build; then the stand-in is stopped (`stopStub`, qt-bridge's control)
// and the Qt families open again with the bridge check skipped, as qt-bridge's control does. Never :0.
// usage: PROBE_MODE=appbus|private PROBE_FAMILIES=a,b PROBE_CONTROL=c node probe.mjs <out> (task 49's follow-up probe of gnome-text-editor on the activate-nothing bus)

import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LIVE = '/Users/new/.local/share/cua-171/live-43/scripts/linux-engine-diff';
const { Desktop, a11yBusAddress, desktopEnding } = await import(join(LIVE, 'scenes.mjs'));
const { openFamily, wmClass, FAMILIES } = await import(join(LIVE, 'families.mjs'));
const { Oracle } = await import(join(LIVE, 'oracle.mjs'));
const { Engine } = await import(join(LIVE, 'engine.mjs'));
const { preorder } = await import(join(LIVE, 'normalize.mjs'));
const { startAppSession, startPrivateSession } = await import(join(LIVE, 'session-bus.mjs'));
const { declareLiveRun } = await import(join(LIVE, 'xspawn.mjs'));
declareLiveRun('task 49: the activate-nothing bus on a private display (appbus.mjs)');

const [out] = process.argv.slice(2);
const CUA = '/Users/new/.local/share/cua-171/task42/engine/cua-engine';
const VENDOR = '/Users/new/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64';
const ENGINES = [
  { label: 'cua', bin: CUA },
  { label: 'pinned', bin: VENDOR },
];
const WITH_STUB = (process.env.PROBE_FAMILIES ?? "gnome-text-editor,gtk4-input").split(",");
const CONTROL = (process.env.PROBE_CONTROL ?? 'gnome-text-editor').split(',').filter(Boolean);
const KEYS = ['DBUS_SESSION_BUS_ADDRESS', 'AT_SPI_BUS_ADDRESS', 'HOME', 'GSETTINGS_BACKEND', 'ACCESSIBILITY_ENABLED', 'GNOME_ACCESSIBILITY'];
const emit = (row) => appendFileSync(join(out, process.env.PROBE_MODE === 'private' ? 'probe-private.jsonl' : 'probe-appbus.jsonl'), `${JSON.stringify({ t: new Date().toISOString(), ...row })}\n`);

function groupOf(pgid) {
  const pids = [];
  for (const d of readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const s = readFileSync(`/proc/${d}/stat`, 'utf8');
      const f = s.slice(s.lastIndexOf(')') + 2).split(' ');
      if (Number(f[2]) === pgid) pids.push({ pid: Number(d), comm: s.slice(s.indexOf('(') + 1, s.lastIndexOf(')')) });
    } catch {
      // gone
    }
  }
  return pids;
}
function envOf(pid) {
  try {
    const env = {};
    for (const item of readFileSync(`/proc/${pid}/environ`, 'utf8').split('\0')) {
      const i = item.indexOf('=');
      if (KEYS.includes(item.slice(0, i))) env[item.slice(0, i)] = item.slice(i + 1);
    }
    return env;
  } catch {
    return null;
  }
}

// a person's display's two buses, built on this private one
let built = null;
async function startSession(opts) {
  const person = await startPrivateSession({ ...opts, dir: `${opts.dir}-person` });
  let app;
  try {
    app = await startAppSession(opts);
  } catch (error) {
    await person.stop();
    throw error;
  }
  const appStop = app.stop;
  app.stop = async (options) => ({ ...(await appStop(options)), person: await person.stop(options) });
  built = { person: { address: person.address, a11y: person.a11y, pid: person.pid }, app: { address: app.address, a11y: app.a11y, stub: app.stub, stubRefusal: app.stubRefusal } };
  return app;
}

const desktop = new Desktop({ cua: CUA, run: 'task49-appbus', logs: out });
let code = 0;
async function readFamily(oracle, family, phase, options = {}) {
  const row = { kind: 'family', phase, family };
  let scene = null;
  try {
    const opened = Date.now();
    scene = await openFamily(desktop, oracle, family, `${phase}${family.replace(/[^a-z0-9]/g, '')}`, options);
    row.open_ms = Date.now() - opened;
    row.window = scene.id;
    row.wm_class = wmClass(scene.id);
    row.settled_source = scene.source;
    const group = groupOf(scene.pid);
    row.processes = group.slice(0, 8).map((p) => ({ ...p, env: envOf(p.pid) }));
    row.registry_apps = group.map((p) => ({ pid: p.pid, apps: (() => { try { return oracle.appsOf(p.pid).length; } catch (e) { return `error: ${e.message.slice(0, 100)}`; } })() })).filter((a) => a.apps);
    row.engines = {};
    for (const spec of ENGINES) {
      const engine = new Engine(spec).start();
      const { response, ms } = await engine.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
      await engine.close();
      row.engines[spec.label] = { ok: response.ok, error: response.ok ? undefined : String(response.error).slice(0, 200), source: response.ok ? response.output.ax_tree_source : null, nodes: response.ok && response.output.ax_tree ? preorder(response.output.ax_tree).length : null, ms: Math.round(ms) };
    }
    // the probe's addition: the same window read again by cua-engine 15 s later, and the registry asked again
    await new Promise((r) => setTimeout(r, 15000));
    const late = new Engine(ENGINES[0]).start();
    const { response } = await late.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
    await late.close();
    row.late = { source: response.ok ? response.output.ax_tree_source : null, nodes: response.ok && response.output.ax_tree ? preorder(response.output.ax_tree).length : null, registry_apps: group.map((p) => ({ pid: p.pid, apps: (() => { try { return oracle.appsOf(p.pid).length; } catch (e) { return `error: ${e.message.slice(0, 100)}`; } })() })).filter((a) => a.apps) };
  } catch (error) {
    row.error = String(error.stack ?? error).slice(0, 600);
  } finally {
    if (scene) await desktop.close([scene]);
    emit(row);
    process.stdout.write(`${phase} ${family}: ${row.error ? `ERROR ${row.error.split('\n')[0]}` : Object.entries(row.engines).map(([l, e]) => `${l} ${e.source}/${e.nodes ?? '-'}`).join(', ')}\n`);
  }
  return row;
}

try {
  const active = await desktop.begin({ startRecord: async () => null, ...(process.env.PROBE_MODE === 'private' ? {} : { startSession }) });
  emit({ kind: 'begun', active, built, env_during: Object.fromEntries(KEYS.slice(0, 2).map((k) => [k, process.env[k] ?? null])), root_at_spi_bus: a11yBusAddress() });
  const oracle = new Oracle();
  desktop.oracle = oracle;
  emit({ kind: 'oracle', address: oracle.address });
  for (const family of WITH_STUB) await readFamily(oracle, family, 'stub');
  const stopped = process.env.PROBE_MODE === 'private' ? null : await desktop.session.stopStub('task 49: the control, Qt without the stand-in');
  emit({ kind: 'stub-stopped', stopped });
  for (const family of CONTROL) await readFamily(oracle, family, 'control', { bridge: false });
} catch (error) {
  emit({ kind: 'error', error: String(error.stack ?? error).slice(0, 1500) });
  code = 1;
} finally {
  await desktop.closeAll();
  const ending = desktopEnding(desktop.ending);
  emit({ kind: 'end', env_after: Object.fromEntries(KEYS.slice(0, 2).map((k) => [k, process.env[k] ?? null])), session_ending: desktop.sessionEnding, chrome_ending: desktop.chromeEnding, foreign: ending.foreign, record: ending.record });
}
process.exit(code);
