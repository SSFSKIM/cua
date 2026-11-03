// Qt's AT-SPI bridge (M0.4; the design session's note): Qt turns its bridge on only when the session bus's
// `org.a11y.Status` says so when the application starts (`IsEnabled`, or `ScreenReaderEnabled`), or with
// `QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1`. For kate (Qt 5) and qtcreator (Qt 6), under each condition: whether the
// process registers with the accessibility registry, whether a frame of it is named for the harness's document,
// and which tree source cua-engine and the pinned build answer for its window.
//
// The switches are the session's settings (a11y-status.mjs; task 45). On a private display they are the run's own
// launcher's, on the run's session bus: each condition sets them there, and they are put back as they were found,
// whatever happens. On a display a person uses they are the person's, which the harness only reads: only the
// condition that sets nothing runs there, and each other is recorded as not run, with the reason.

import { a11yAddress, readStatus, setSwitch } from './a11y-status.mjs';
import { Engine } from './engine.mjs';
import { openFamily } from './families.mjs';
import { Oracle } from './oracle.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const CONDITIONS = [
  { name: 'as found', status: null, env: {} },
  { name: 'IsEnabled false', status: { IsEnabled: false, ScreenReaderEnabled: false }, env: {} },
  { name: 'IsEnabled false, QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1', status: { IsEnabled: false, ScreenReaderEnabled: false }, env: { QT_LINUX_ACCESSIBILITY_ALWAYS_ON: '1' } },
  { name: 'IsEnabled false, ScreenReaderEnabled true', status: { IsEnabled: false, ScreenReaderEnabled: true }, env: {} },
];

/** Why a condition is not run on a display a person uses: it would set the person's switches. */
export const NOT_ON_PERSONS_DISPLAY = "it sets org.a11y.Status, which on a display a person uses is the person's setting and is never written: run the experiment on a private display";

/**
 * The experiment. `open`, `oracle`, `pinned` (an engine for the pinned build), `read` and `set` (the switches) and
 * `wait` are the display-free tests' own.
 */
export async function qtBridge(desktop, emit, { vendor, open = openFamily, oracle = null, pinned = () => new Engine({ label: 'pinned', bin: vendor }).start(), read = readStatus, set = setSwitch, wait = sleep }) {
  const privateDisplay = desktop.isPrivate === true;
  // the run's own bus on a private display; the person's (the harness's own session bus) on any other, read only
  const address = a11yAddress(desktop);
  const statusOf = () => read({ address });
  const setTo = (status) => {
    for (const [prop, value] of Object.entries(status)) set(prop, value, { address, privateDisplay });
  };
  oracle ??= new Oracle();
  const found = statusOf();
  emit({ kind: 'qt-bridge', found, display: privateDisplay ? 'private' : "a person's" });
  const md = [
    `${privateDisplay ? "On the run's own session bus" : "On the person's session bus (read only)"}, as found: \`IsEnabled\` ${found.IsEnabled}, \`ScreenReaderEnabled\` ${found.ScreenReaderEnabled}.`,
    '',
    '| application | condition | registered with the registry | frame named for the document | cua-engine tree | pinned tree |',
    '|---|---|---|---|---|---|',
  ];
  await desktop.openFront('covered');
  let changed = false;
  try {
    for (const condition of CONDITIONS) {
      if (condition.status && !privateDisplay) {
        emit({ kind: 'qt-bridge', condition: condition.name, skipped: NOT_ON_PERSONS_DISPLAY });
        md.push(`| kate, qtcreator | ${condition.name} | not run: ${NOT_ON_PERSONS_DISPLAY} | | | |`);
        continue;
      }
      if (condition.status) {
        changed = true;
        setTo(condition.status);
      }
      await wait(500);
      for (const family of ['kate', 'qtcreator']) {
        // the conditions turn the switches off on purpose: no refusal for them here
        const scene = await open(desktop, oracle, family, `qt${CONDITIONS.indexOf(condition)}`, { env: condition.env, bridge: false });
        await wait(2000);
        const apps = oracle.appsOf(scene.pid);
        const frames = apps.flatMap((app) => oracle.children(app));
        const named = frames.filter((f) => String(oracle.name(f)).includes(scene.label));
        const { response } = await desktop.reader.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
        const engine = pinned();
        const { response: p } = await engine.request('get_window_state', { window: { id: scene.id }, include_screenshot: false });
        await engine.close();
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
    // put back only what was set, and so only ever on the run's own bus
    if (changed) {
      setTo(found);
      emit({ kind: 'qt-bridge', restored: statusOf() });
    }
  }
  return md;
}
