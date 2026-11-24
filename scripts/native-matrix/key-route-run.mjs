// The key-route diagnostic's lane (ruling 1198; the `key-route` cell, ./run.mjs planOf): one engine's matrix run whose
// only section is this, driven by ../hosted-sittings/key-route.mjs once per engine after sitting C's counted lanes. It
// writes no row: everything it reads is kept in the run's meta (`keyRoute`), which the sitting's diagnostic reports.
//
// With the run's TextEdit document up and bound:
//   1. TextEdit activated, its Open panel opened by ⌘O under the key guard (the matrix's own OPEN_PANEL cell)
//   2. the AX half read on the device, once, before the press (./key-route-device.mjs read, ./key-route.swift)
//   3. the taps started (./key-route-device.mjs tap start): TextEdit's pid, each panel service instance's, and the
//      focused element's ActualPid when it is neither
//   4. one pressKey("Escape") through the lane (KEY_ROUTE_ESCAPE), under the key guard as every key cell; the taps
//      stopped after it, whatever happened, and their Escape keyDowns kept with fields 40 and 41
//   5. the panel read by the device (Accessibility, never the engine's view) and, when it is still up, cancelled by
//      Accessibility (no pointer event, never the engine), then confirmed closed
// A tap that did not exit, or a panel still up after the AX cancel, is a cleanup failure, named in `cleanup`; the panel
// left up stops the run (its put-back quits TextEdit), as nothing after it may act on a screen it holds.
// meta.keyRoute: {engine, opened: {ok, reason?}, ax, tap: {start, stop?}, press: {sent, at?, threw?, closedByEngineView?,
// route?, reason?}, after, cancel, closed, cleanup: [string]}.
import {cell} from '../native-baseline/cells.mjs';
import {PANEL_SERVICE} from '../hosted-sittings/alert-guard.mjs';
import {OPEN_PANEL, prelude} from './matrix-cells.mjs';
import {activate, AlertHeld, mark, notActivated, read, sendKeys, Stop, TEXTEDIT} from './steps.mjs';

// The press: the panel observed first (as every key cell of the panel does, so the vendor's helper holds the app's state),
// then exactly one pressKey("Escape"), its own device-clock window kept (the taps' events are read against it), then the
// panel awaited gone up to 5 s in the engine's own view (the device's reading after it is the one reported).
// -> {pressed: true, at, threw, closed} | {pressed: false, reason}.
export const KEY_ROUTE_ESCAPE = cell(`${prelude('textedit')}
// cua-matrix-cell: key-route.escape
let ax = await observe();
if (!panel(ax)) return {pressed: false, reason: "the Open panel is not TextEdit's front window"};
const from = Date.now();
let threw = null;
try { await __app.pressKey("Escape"); } catch (e) { threw = String(e?.message ?? e).slice(0, 300); }
const at = [from, Date.now()];
for (const end = Date.now() + 5000; panel(ax) && Date.now() < end;) ax = await observe();
return {pressed: true, at, threw, closed: !panel(ax)};`);

// The taps' targets: TextEdit, every panel service instance the AX half found, and the focused element's ActualPid when
// it is neither. -> ['<label>:<pid>'].
export function tapTargets(pid, ax) {
  const services = ax?.routes?.find(r => r.route === 'runningApplicationsPanelService')?.pids
    ?? Object.entries(ax?.processes ?? {}).filter(([, p]) => p.bundleId === PANEL_SERVICE).map(([id]) => Number(id));
  const actual = Number.isInteger(ax?.actualPid) && ax.actualPid !== pid && !services.includes(ax.actualPid) ? [`actual:${ax.actualPid}`] : [];
  return [`textedit:${pid}`, ...services.map(p => `panelService:${p}`), ...actual];
}

// One device command, its window the harness's (it intends no app). -> its answer.
function device(ctx, argv) {
  const {answer, at} = ctx.ops.keyRoute([...argv, '--run', ctx.run]) ?? {};
  mark(ctx, 'harness', `key-route:${argv[0] === 'tap' ? `tap-${argv[1]}` : argv[0]}`, at, []);
  return answer ?? null;
}

async function press(ctx) {
  let r;
  try { r = await sendKeys(ctx, KEY_ROUTE_ESCAPE, ['Escape'], {scene: 'textedit', front: read(ctx, null, {frontKey: true}), key: 'key-route:escape'}); } catch (error) {
    if (!(error instanceof AlertHeld)) throw error;
    return {sent: false, reason: error.message};
  }
  if (r === null) return {sent: false, reason: 'the key guard did not send Escape'};
  if (!r.ok) return {sent: null, reason: `the cell failed: ${r.error}`};
  if (r.value?.pressed !== true) return {sent: false, reason: r.value?.reason ?? 'not pressed'};
  return {sent: true, at: r.value.at, threw: r.value.threw, closedByEngineView: r.value.closed, route: r.route};
}

export async function keyRouteSection(ctx) {
  const record = ctx.meta.keyRoute = {engine: ctx.engine, opened: null, ax: null, tap: null, press: null, after: null, cancel: null, closed: null, cleanup: []};
  const pid = ctx.records.textedit?.pid;
  const front = activate(ctx, 'textedit');
  if (notActivated(ctx, 'textedit', TEXTEDIT) || !front?.ok) {
    record.opened = {ok: false, reason: `TextEdit did not come to the front and key (${front?.reason ?? 'its activation check'})`};
    return;
  }
  let opened = null;
  try { opened = await sendKeys(ctx, OPEN_PANEL, ['super+o'], {scene: 'textedit', front: read(ctx), key: 'key-route:open'}); } catch (error) {
    if (!(error instanceof AlertHeld)) throw error;
    record.opened = {ok: false, reason: error.message};
  }
  record.opened ??= opened?.ok && opened.value?.opened ? {ok: true}
    : {ok: false, reason: opened === null ? 'the key guard did not send ⌘O' : `the Open panel did not open (${opened.error ?? opened.value?.reason ?? 'not seen'})`};
  // TextEdit's focused window is the panel from here: no key-window check on the Escape (./steps.mjs keyWindowScene).
  ctx.panelOpen = true;
  try {
    if (record.opened.ok) {
      record.ax = device(ctx, ['read', '--pid', String(pid)]);
      record.tap = {start: device(ctx, ['tap', 'start', ...tapTargets(pid, record.ax).flatMap(t => ['--pid', t])])};
      try { record.press = await press(ctx); } finally {
        if (record.tap.start?.launched) {
          record.tap.stop = device(ctx, ['tap', 'stop']);
          if (record.tap.stop?.exited === false) record.cleanup.push(`the tap app (pid ${record.tap.start.pid ?? 'unknown'}) did not exit when stopped`);
        }
      }
    }
  } finally {
    // Whatever happened (a panel ⌘O opened late included), the device reads the panel and cancels it when it is up; the
    // panel's frame as the AX half found it lets the window list confirm what Accessibility says.
    const f = record.ax?.panel?.frame, frame = f && ['x', 'y', 'width', 'height'].every(k => Number.isFinite(f[k])) ? ['--frame', [f.x, f.y, f.width, f.height].join(',')] : [];
    record.after = device(ctx, ['panel', '--pid', String(pid), ...frame]);
    if (record.after?.up !== false) record.cancel = device(ctx, ['cancel', '--pid', String(pid), ...frame]);
    record.closed = record.after?.up === false || record.cancel?.closed === true;
    if (record.closed) ctx.panelOpen = false;
    else record.cleanup.push('TextEdit\'s Open panel stayed up after the AX cancel');
  }
  if (!record.closed) throw new Stop('TextEdit\'s Open panel stayed up after the AX cancel');
}
