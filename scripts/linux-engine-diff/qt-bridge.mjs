// Qt's AT-SPI bridge (M0.4; the design session's note): Qt turns its bridge on only when the session bus's
// `org.a11y.Status` says so when the application starts (`IsEnabled`, or `ScreenReaderEnabled`), or with
// `QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1`. For kate (Qt 5) and qtcreator (Qt 6), under each condition: whether the
// process registers with the accessibility registry, whether a frame of it is named for the harness's document,
// and which tree source cua-engine and the pinned build answer for its window. The status properties are put back
// as they were found, whatever happens.

import { execFileSync } from 'node:child_process';

import { Engine } from './engine.mjs';
import { openFamily } from './families.mjs';
import { Oracle } from './oracle.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function status(name) {
  const text = execFileSync('busctl', ['--user', '--json=short', 'get-property', 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Status', name], { encoding: 'utf8' });
  return JSON.parse(text).data;
}

function setStatus(name, value) {
  execFileSync('busctl', ['--user', 'set-property', 'org.a11y.Bus', '/org/a11y/bus', 'org.a11y.Status', name, 'b', String(value)]);
}

export const CONDITIONS = [
  { name: 'as found', status: null, env: {} },
  { name: 'IsEnabled false', status: { IsEnabled: false, ScreenReaderEnabled: false }, env: {} },
  { name: 'IsEnabled false, QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1', status: { IsEnabled: false, ScreenReaderEnabled: false }, env: { QT_LINUX_ACCESSIBILITY_ALWAYS_ON: '1' } },
  { name: 'IsEnabled false, ScreenReaderEnabled true', status: { IsEnabled: false, ScreenReaderEnabled: true }, env: {} },
];

export async function qtBridge(desktop, emit, { vendor }) {
  const oracle = new Oracle();
  const found = { IsEnabled: status('IsEnabled'), ScreenReaderEnabled: status('ScreenReaderEnabled') };
  emit({ kind: 'qt-bridge', found });
  const md = [
    `On the VM, as found: \`IsEnabled\` ${found.IsEnabled}, \`ScreenReaderEnabled\` ${found.ScreenReaderEnabled}.`,
    '',
    '| application | condition | registered with the registry | frame named for the document | cua-engine tree | pinned tree |',
    '|---|---|---|---|---|---|',
  ];
  await desktop.openFront('covered');
  try {
    for (const condition of CONDITIONS) {
      for (const [prop, value] of Object.entries(condition.status ?? found)) setStatus(prop, value);
      await sleep(500);
      for (const family of ['kate', 'qtcreator']) {
        const scene = await openFamily(desktop, oracle, family, `qt${CONDITIONS.indexOf(condition)}`, { env: condition.env });
        await sleep(2000);
        const apps = oracle.appsOf(scene.pid);
        const frames = apps.flatMap((app) => oracle.children(app));
        const named = frames.filter((f) => String(oracle.name(f)).includes(scene.label));
        const { response } = await desktop.reader.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
        const pinned = new Engine({ label: 'pinned', bin: vendor }).start();
        const { response: p } = await pinned.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
        await pinned.close();
        const row = {
          kind: 'qt-bridge',
          family,
          condition: condition.name,
          registered: apps.length > 0,
          frame_named: named.length > 0,
          cua_source: response.ok ? response.output.ax_tree_source : `error: ${response.error}`,
          pinned_source: p.ok ? p.output.ax_tree_source : `error: ${p.error}`,
        };
        emit(row);
        md.push(`| ${family} | ${condition.name} | ${row.registered} | ${row.frame_named} | ${row.cua_source} | ${row.pinned_source} |`);
        await desktop.close([scene]);
      }
    }
  } finally {
    for (const [prop, value] of Object.entries(found)) setStatus(prop, value);
    emit({ kind: 'qt-bridge', restored: { IsEnabled: status('IsEnabled'), ScreenReaderEnabled: status('ScreenReaderEnabled') } });
  }
  return md;
}
