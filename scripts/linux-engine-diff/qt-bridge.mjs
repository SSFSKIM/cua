// Qt's AT-SPI bridge (M0.4; the design session's note): Qt turns its bridge on only when the session bus's
// `org.a11y.Status` says so when the application starts (`IsEnabled`, or `ScreenReaderEnabled`), or with
// `QT_LINUX_ACCESSIBILITY_ALWAYS_ON=1`. For kate (Qt 5) and qtcreator (Qt 6), under each condition: whether the
// process registers with the accessibility registry, whether a frame of it is named for the harness's document,
// and which tree source cua-engine and the pinned build answer for its window.
//
// The switches are the session's settings (a11y-status.mjs; task 45). On a private display they are the run's own
// launcher's, on the run's session bus: each condition sets them there, and they are put back as they were found,
// whatever happens. On a display a person uses none of them runs: the run's Qt applications are on a session bus of the
// run's there (B2, task 47), whose org.a11y.Status is the run's stand-in (a11y-stub.mjs, task 48), both switches on and
// read-only, and the person's switches are never written, so no condition can be set; each is recorded as not run, with
// the reason. What runs there is the stand-in's own pair (`PERSONS_CONDITIONS`): Qt with it, then without it.

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

/** Why the private display's conditions are not run on a display a person uses. */
export const NOT_ON_PERSONS_DISPLAY = "on a display a person uses the run's Qt applications are on a session bus of the run's, whose org.a11y.Status is the run's stand-in with both switches on and read-only, and the person's switches are never written, so no condition can be set: run the experiment on a private display";

/**
 * What runs on a display a person uses instead (task 48, the live check's pair): Qt with the run's stand-in for
 * org.a11y.Bus, the scenes' own condition, then the control, the same with the stand-in stopped (no org.a11y.Bus on
 * the applications' bus), where a Qt 5.15 or 6.4 built as upstream registers no tree. A Qt that registers in the control
 * too shows a distribution's patch, which would make the stand-in unneeded.
 */
export const PERSONS_CONDITIONS = [
  { name: "the run's stand-in for org.a11y.Bus", role: 'qtstub', stub: true },
  { name: 'no stand-in (the control)', role: 'qtcontrol', stub: false },
];

/** The nodes of a wire tree. */
const nodesOf = (node) => (node ? 1 + (node.children ?? []).reduce((n, child) => n + nodesOf(child), 0) : 0);

/**
 * The experiment. `open`, `oracle`, `pinned` (an engine for the pinned build), `read` and `set` (the switches) and
 * `wait` are the display-free tests' own.
 */
export async function qtBridge(desktop, emit, { vendor, open = openFamily, oracle = null, pinned = () => new Engine({ label: 'pinned', bin: vendor }).start(), read = readStatus, set = setSwitch, wait = sleep }) {
  const privateDisplay = desktop.isPrivate === true;
  const header = ['| application | condition | registered with the registry | frame named for the document | cua-engine tree | its nodes | pinned tree |', '|---|---|---|---|---|---|---|'];
  oracle ??= new Oracle();
  // one family under one condition: opened, read by the registry, cua-engine and the pinned build, and closed
  const measure = async (family, condition, role, options, md) => {
    const scene = await open(desktop, oracle, family, role, options);
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
      condition,
      registered: apps.length > 0,
      frame_named: named.length > 0,
      cua_source: response.ok ? response.output.ax_tree_source : `error: ${response.error}`,
      cua_nodes: response.ok ? nodesOf(response.output.ax_tree) : null,
      pinned_source: p.ok ? p.output.ax_tree_source : `error: ${p.error}`,
    };
    emit(row);
    md.push(`| ${family} | ${condition} | ${row.registered} | ${row.frame_named} | ${row.cua_source} | ${row.cua_nodes ?? '-'} | ${row.pinned_source} |`);
    await desktop.close([scene]);
  };
  if (!privateDisplay) {
    emit({ kind: 'qt-bridge', display: "a person's" });
    for (const condition of CONDITIONS) emit({ kind: 'qt-bridge', condition: condition.name, skipped: NOT_ON_PERSONS_DISPLAY });
    const md = [`On a display a person uses, the private display's conditions were not run: ${NOT_ON_PERSONS_DISPLAY}. Run instead: Qt with the run's stand-in, then the control with it stopped.`, '', ...header];
    await desktop.openFront('covered');
    for (const condition of PERSONS_CONDITIONS) {
      if (condition.stub && !desktop.session?.stub) {
        const why = desktop.session?.stubRefusal ?? 'no stand-in runs';
        emit({ kind: 'qt-bridge', condition: condition.name, skipped: why });
        md.push(`| kate, qtcreator | ${condition.name} | not run: ${why} | | | | |`);
        continue;
      }
      // the control: the stand-in ended, so Qt meets the applications' bus as task 47 left it; it is the last condition
      if (!condition.stub && desktop.session?.stub) emit({ kind: 'qt-bridge', condition: condition.name, stub_stopped: await desktop.session.stopStub('stopped by qt-bridge for its control (no stand-in)') });
      await wait(500);
      // the control opens Qt with no stand-in on purpose: no refusal for it
      for (const family of ['kate', 'qtcreator']) await measure(family, condition.name, condition.role, { bridge: condition.stub }, md);
    }
    return md;
  }
  // the run's own bus on a private display
  const address = a11yAddress(desktop);
  const statusOf = () => read({ address });
  const setTo = (status) => {
    for (const [prop, value] of Object.entries(status)) set(prop, value, { address, privateDisplay });
  };
  const found = statusOf();
  emit({ kind: 'qt-bridge', found, display: 'private' });
  const md = [`On the run's own session bus, as found: \`IsEnabled\` ${found.IsEnabled}, \`ScreenReaderEnabled\` ${found.ScreenReaderEnabled}.`, '', ...header];
  await desktop.openFront('covered');
  let changed = false;
  try {
    for (const condition of CONDITIONS) {
      if (condition.status) {
        changed = true;
        setTo(condition.status);
      }
      await wait(500);
      // the conditions turn the switches off on purpose: no refusal for them here
      for (const family of ['kate', 'qtcreator']) await measure(family, condition.name, `qt${CONDITIONS.indexOf(condition)}`, { env: condition.env, bridge: false }, md);
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
