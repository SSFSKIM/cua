// Task 46's harness driver (#171 M4), run by session.mjs on a private display: the harness's own Desktop (its
// watchdog, its private session bus, its trace and its stop), with no whole-run record (task 46 part 1 runs none) and
// no Chrome: no stub, no Chrome family, no Electron (Chromium's NSS opens the person's ~/.pki; the design session's
// ruling defers every Chromium launch to task 45's own HOME).
// Phases:
//   families: every non-Chromium family opened as the harness opens it (families.mjs openFamily), its window's tree
//     read by the pinned and newest vendor builds and by cua-engine, each a fresh process under a dbus-monitor pass
//     on the run's accessibility bus, the oracle's read under one too; each family's processes' bus variables, and
//     the run's registry's applications of each family.
//   sigterm: begin only; session.mjs sends SIGTERM while the run's session bus starts.
// usage: node driver.mjs <phase> <out> <display>

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const LIVE = '/Users/new/.local/share/cua-171/live-43/scripts/linux-engine-diff';
const { Desktop, a11yBusAddress, desktopEnding } = await import(join(LIVE, 'scenes.mjs'));
const { openFamily, wmClass, FAMILIES } = await import(join(LIVE, 'families.mjs'));
const { Oracle } = await import(join(LIVE, 'oracle.mjs'));
const { Engine } = await import(join(LIVE, 'engine.mjs'));
const { startMonitor } = await import(join(LIVE, 'busmon.mjs'));
const { preorder } = await import(join(LIVE, 'normalize.mjs'));

const [phase, out] = process.argv.slice(2);
const CUA = '/Users/new/.local/share/cua-171/task42/engine/cua-engine';
const VENDOR = '/Users/new/.local/share/cua/runtimes/26.928.40906-linux-x64/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64';
const NEWEST = '/Users/new/.local/share/cua-171/vendor/deb-26.1023/extracted/usr/lib/chatgpt/resources/cua_node/lib/node_modules/@oai/sky/bin/linux/sky_linux_x64';
const ENGINES = [
  { label: 'pinned', bin: VENDOR },
  { label: 'newest', bin: NEWEST },
  { label: 'cua', bin: CUA },
];
const FAMILY_LIST = ['gedit', 'gnome-text-editor', 'gtk4-button', 'gtk4-input', 'gtk-scale', 'gtk-table', 'qt5-input', 'qt6-input', 'qt5-breeze', 'qt5-fusion', 'kate', 'qtcreator', 'firefox', 'writer', 'writer-gen', 'calc', 'xterm', 'xterm-allow', 'gnome-terminal'];
const KEYS = ['DBUS_SESSION_BUS_ADDRESS', 'AT_SPI_BUS_ADDRESS'];
const emit = (row) => appendFileSync(join(out, `driver-${phase}.jsonl`), `${JSON.stringify({ t: new Date().toISOString(), kind: row.kind, ...row })}\n`);
const pick = (env) => Object.fromEntries(KEYS.map((k) => [k, k in env ? env[k] : null]));

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
function treeSummary(tree) {
  const nodes = preorder(tree);
  const roles = {};
  for (const n of nodes) roles[n.role] = (roles[n.role] ?? 0) + 1;
  return { nodes: nodes.length, roles: Object.fromEntries(Object.entries(roles).sort((a, b) => b[1] - a[1]).slice(0, 8)) };
}

const desktop = new Desktop({ cua: CUA, run: `task46-${phase}`, logs: out });
emit({ kind: 'start', pid: process.pid, env_before: pick(process.env) });
let code = 0;
try {
  // no whole-run record in part 1: begin's record hook answers none, as on a person's display
  const active = await desktop.begin({ startRecord: async () => null });
  const session = desktop.session;
  emit({ kind: 'begun', active, session: session ? { address: session.address, a11y: session.a11y, pid: session.pid } : null, env_during: pick(process.env), root_at_spi_bus: a11yBusAddress(), record: desktop.record });
  if (phase === 'qt6') {
    // Qt 6 on the run's bus: the launcher's org.a11y.Status read, then each Qt 6 family opened with the run's
    // AT_SPI_BUS_ADDRESS emptied (Qt takes an empty value as none and asks org.a11y.Bus on the run's session bus)
    const status = {};
    for (const name of ['IsEnabled', 'ScreenReaderEnabled']) {
      try {
        status[name] = execFileSync('busctl', [`--address=${session.address}`, 'get-property', 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Status', name], { encoding: 'utf8', timeout: 10000 }).trim();
      } catch (e) {
        status[name] = `error: ${String(e.stderr || e.message).slice(0, 200)}`;
      }
    }
    emit({ kind: 'a11y-status', bus: 'run', status });
  }
  if (phase === 'families' || phase === 'qt6') {
    if (!session?.a11y) throw new Error('no private session: the display is not marked private');
    const oracle = new Oracle();
    desktop.oracle = oracle;
    emit({ kind: 'oracle', address: oracle.address });
    const list = phase === 'qt6' ? ['qt6-input', 'qtcreator', 'qt6-input'] : FAMILY_LIST;
    for (const [index, family] of list.entries()) {
      // in the qt6 phase the first two with AT_SPI_BUS_ADDRESS emptied, the last as the harness launches it (control)
      const appEnv = phase === 'qt6' && index < 2 ? { AT_SPI_BUS_ADDRESS: '' } : {};
      if (FAMILIES[family].chrome || /electron/.test(family)) throw new Error(`refused: ${family} is Chromium`);
      let scene = null;
      const row = { kind: 'family', family, app_env: appEnv };
      try {
        const opened = Date.now();
        scene = await openFamily(desktop, oracle, family, `read${index}`, { env: appEnv });
        row.open_ms = Date.now() - opened;
        row.window = scene.id;
        row.wm_class = wmClass(scene.id);
        row.settled_source = scene.source;
        row.unsettled = Boolean(scene.unsettled);
        row.oracle_walk = scene.oracleWalk ?? null;
        const group = groupOf(scene.pid);
        row.processes = group.map((p) => ({ ...p, env: envOf(p.pid) }));
        // the run's registry: the applications of the family's processes on the run's accessibility bus
        row.registry_apps = group.map((p) => ({ pid: p.pid, apps: (() => { try { return oracle.appsOf(p.pid).length; } catch (e) { return `error: ${e.message.slice(0, 100)}`; } })() })).filter((a) => a.apps);
        if (scene.frame) {
          const mon = await startMonitor(session.a11y);
          row.toolkit = oracle.toolkit(scene.frame);
          const calls = await mon.stop();
          row.oracle_bus = { calls: calls.calls, connections: calls.connections, by_member: calls.by_member };
        }
        row.engines = {};
        for (const spec of ENGINES) {
          const mon = await startMonitor(session.a11y);
          const engine = new Engine(spec).start();
          const engineEnv = envOf(engine.pid);
          const { response, ms } = await engine.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
          await engine.close();
          const calls = await mon.stop();
          row.engines[spec.label] = {
            ok: response.ok,
            error: response.ok ? undefined : String(response.error).slice(0, 200),
            source: response.ok ? response.output.ax_tree_source : null,
            ...(response.ok && response.output.ax_tree ? treeSummary(response.output.ax_tree) : {}),
            ms: Math.round(ms),
            env: engineEnv,
            bus: { calls: calls.calls, connections: calls.connections, by_member: calls.by_member },
          };
        }
      } catch (error) {
        row.error = String(error.stack ?? error).slice(0, 800);
        code = 1;
      } finally {
        if (scene) {
          const pgid = scene.pid;
          await desktop.close([scene]);
          await new Promise((r) => setTimeout(r, 500));
          row.group_after_close = groupOf(pgid);
        }
        emit(row);
        process.stdout.write(`family ${family}: ${row.error ? `ERROR ${row.error.split('\n')[0]}` : Object.entries(row.engines).map(([l, e]) => `${l} ${e.source}/${e.nodes ?? '-'}/${e.bus.calls}calls`).join(', ')}\n`);
      }
    }
  }
} catch (error) {
  emit({ kind: 'error', error: String(error.stack ?? error).slice(0, 1500) });
  code = 1;
} finally {
  await desktop.closeAll();
  const ending = desktopEnding(desktop.ending);
  emit({ kind: 'end', env_after: pick(process.env), session_ending: desktop.sessionEnding, chrome_ending: desktop.chromeEnding, foreign: ending.foreign, record: ending.record });
}
process.exit(code);
