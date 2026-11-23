// Setup's display mode (ruling 1164; scripts/hosted-sittings/display-mode.mjs): after the warm-ups, the hosted runner's
// one display switched from 1024x768 to its widest mode, 1920x1080, for the session, read back, with the alerts read
// before and fresh after and any prompt watched for across the switch. Every reading and the switch are doubles here;
// nothing configures this Mac's display.
import assert from 'node:assert/strict';
import test from 'node:test';
import {modeOf, MODE_WATCH_MS, screenAtEnd, switchDisplayMode, TARGET_MODE} from '../../scripts/hosted-sittings/display-mode.mjs';

const HOSTED = {RUNNER_ENVIRONMENT: 'github-hosted'};
const UNC = 'com.apple.UserNotificationCenter';
const rect = (x, y, width, height) => ({x, y, width, height});
const mode = (width, height, modeId, scale = 1) => ({width, height, pixelWidth: width * scale, pixelHeight: height * scale, refreshRate: 60, usableForDesktopGUI: true, ioFlags: 3, modeId});
// The hosted images' one virtual display as the probe read it (run 45233464944): mode 3 now, 800x600 to 1920x1080 offered.
const MODES = [mode(800, 600, 1), mode(1024, 768, 3), mode(1280, 1024, 6), mode(1920, 1080, 10), mode(960, 540, 11, 2)];
const listing = (current, bounds = rect(0, 0, current.width, current.height)) => ({displays: [{id: 1, main: true, builtin: false, bounds, vendor: 1, model: 1, current, modes: MODES}]});
const alertWindow = (number, bounds) => ({ownerPid: 2596, ownerName: 'UserNotificationCenter', ownerBundleId: UNC, layer: 8, number, name: null, bounds});
const CUA_ALERT = alertWindow(90, rect(382, 118, 260, 348)), VENDOR_ALERT = alertWindow(91, rect(411, 147, 260, 364));

// The doubles: the display before and after, the switch, the window lists in turn (the last repeats), the front.
function deps({after = listing(mode(1920, 1080, 10)), set = null, lists = [[CUA_ALERT, VENDOR_ALERT]], front = {bundleId: UNC}} = {}) {
  const calls = [];
  let listed = 0, switched = false;
  return {calls, deps: {env: HOSTED, platform: 'darwin',
    display: {read: () => { calls.push('read'); return switched ? after : listing(mode(1024, 768, 3)); },
      set: target => { calls.push(['set', target]); switched = true; return set ?? {set: mode(1920, 1080, 10), readBack: {bounds: after.displays[0].bounds, current: after.displays[0].current}}; }},
    windows: () => { calls.push('windows'); const list = lists[Math.min(listed, lists.length - 1)]; listed++; return list; },
    frontmost: () => front, sleep: async () => {}, now: (() => { let t = 0; return () => (t += 250); })()}};
}

test('the mode is chosen by size, 1x and usable, never by id', () => {
  assert.deepEqual(TARGET_MODE, {width: 1920, height: 1080});
  assert.equal(modeOf(listing(mode(1024, 768, 3)), TARGET_MODE).modeId, 10);
  assert.equal(modeOf({displays: [{main: true, modes: [mode(1920, 1080, 42)]}]}, TARGET_MODE).modeId, 42, 'whatever id the image gives it');
  assert.equal(modeOf({displays: [{main: true, modes: [mode(1920, 1080, 10, 2)]}]}, TARGET_MODE), null, 'a 2x mode is not it');
  assert.equal(modeOf(null, TARGET_MODE), null);
});

test('off a GitHub-hosted runner the switch refuses before anything is read or set', async () => {
  for (const [env, platform] of [[{}, 'darwin'], [HOSTED, 'linux']]) {
    const {calls, deps: d} = deps();
    await assert.rejects(switchDisplayMode({...d, env, platform}), /refused/);
    assert.deepEqual(calls, []);
  }
});

test('the switch: alerts and mode before, 1920x1080 for the session, read back, the alerts fresh after; the record\'s shape', async () => {
  const {calls, deps: d} = deps();
  const out = await switchDisplayMode(d);
  assert.equal(out.ok, true, out.detail);
  assert.deepEqual(calls.filter(c => Array.isArray(c)), [['set', TARGET_MODE]]);
  assert.ok(calls.indexOf('windows') < calls.findIndex(Array.isArray), 'the alerts are read before the switch');
  const r = out.record;
  assert.deepEqual(r.before.mode, {width: 1024, height: 768, modeId: 3, pixelWidth: 1024, pixelHeight: 768});
  assert.deepEqual(r.before.alerts, [{number: 90, layer: 8, bounds: CUA_ALERT.bounds}, {number: 91, layer: 8, bounds: VENDOR_ALERT.bounds}]);
  assert.deepEqual(r.set, {width: 1920, height: 1080, modeId: 10, pixelWidth: 1920, pixelHeight: 1080});
  assert.deepEqual(r.readBack, {bounds: rect(0, 0, 1920, 1080), mode: {width: 1920, height: 1080, modeId: 10, pixelWidth: 1920, pixelHeight: 1080}});
  assert.deepEqual(r.after.alerts, r.before.alerts);
  assert.deepEqual(r.promptSeen, []);
  assert.deepEqual(r.recentred, []);
  assert.equal(r.watchedMs >= MODE_WATCH_MS, true, 'the screen watched across the switch');
  assert.match(out.detail, /^1024x768 \(mode 3\) -> 1920x1080 \(mode 10\), read back 1920x1080; 2 alert windows, none moved; no prompt$/);
});

test('alerts re-centred with the display: recorded, not a failure; placement then uses only the fresh bounds', async () => {
  const moved = [alertWindow(90, rect(830, 274, 260, 348)), alertWindow(91, rect(859, 303, 260, 364))];
  const {deps: d} = deps({lists: [[CUA_ALERT, VENDOR_ALERT], moved]});
  const out = await switchDisplayMode(d);
  assert.equal(out.ok, true);
  assert.deepEqual(out.record.recentred, [{number: 90, from: CUA_ALERT.bounds, to: rect(830, 274, 260, 348)}, {number: 91, from: VENDOR_ALERT.bounds, to: rect(859, 303, 260, 364)}]);
  assert.deepEqual(out.record.after.alerts.map(a => a.bounds), moved.map(w => w.bounds));
  assert.match(out.detail, /2 alert windows, 2 re-centred/);
});

test('a new UNC or System Settings window across the switch is a prompt: recorded, the setup fails, nothing answers it', async () => {
  const prompt = alertWindow(95, rect(800, 400, 300, 200));
  const settings = {ownerPid: 3000, ownerName: 'System Settings', ownerBundleId: 'com.apple.systempreferences', layer: 0, number: 120, name: 'Displays', bounds: rect(200, 100, 700, 600)};
  for (const appeared of [prompt, settings]) {
    const {deps: d} = deps({lists: [[CUA_ALERT, VENDOR_ALERT], [CUA_ALERT, VENDOR_ALERT, appeared]]});
    const out = await switchDisplayMode(d);
    assert.equal(out.ok, false);
    assert.deepEqual(out.record.promptSeen.map(p => p.number), [appeared.number]);
    assert.ok(!JSON.stringify(out.record).includes('Displays'), 'never a title');
    assert.match(out.detail, /a prompt appeared across the switch/);
  }
  // System Settings taking the front is a prompt too.
  const {deps: d} = deps({front: {bundleId: 'com.apple.systempreferences'}});
  const out = await switchDisplayMode(d);
  assert.equal(out.ok, false);
  assert.match(out.detail, /com\.apple\.systempreferences in front/);
});

test('a read-back that is not 1920x1080, a switch that failed, or no such mode fails the setup; the record keeps what was read', async () => {
  {
    const {deps: d} = deps({after: listing(mode(1024, 768, 3))});
    const out = await switchDisplayMode({...d, display: {...d.display, set: () => ({set: mode(1920, 1080, 10), readBack: {bounds: rect(0, 0, 1024, 768), current: mode(1024, 768, 3)}})}});
    assert.equal(out.ok, false);
    assert.match(out.detail, /read back 1024x768/);
    assert.deepEqual(out.record.readBack.bounds, rect(0, 0, 1024, 768));
  }
  {
    const {deps: d} = deps({set: {error: 'CGCompleteDisplayConfiguration: 1001'}});
    const out = await switchDisplayMode(d);
    assert.equal(out.ok, false);
    assert.match(out.detail, /CGCompleteDisplayConfiguration: 1001/);
  }
  {
    const {calls, deps: d} = deps();
    const out = await switchDisplayMode({...d, display: {...d.display, read: () => ({displays: [{main: true, current: mode(1024, 768, 3), modes: [mode(1024, 768, 3)]}]})}});
    assert.equal(out.ok, false);
    assert.match(out.detail, /no 1920x1080 mode/);
    assert.ok(!calls.some(Array.isArray), 'nothing set');
  }
  {
    // A screen not read before the switch: no proof a prompt did not appear across it.
    const {deps: d} = deps({lists: [null]});
    const out = await switchDisplayMode(d);
    assert.equal(out.ok, false);
    assert.match(out.detail, /not read/);
  }
  {
    // Nor after it: the switch made and read back, but the window list unread at the watch's end.
    const {calls, deps: d} = deps({lists: [[CUA_ALERT, VENDOR_ALERT], null]});
    const out = await switchDisplayMode(d);
    assert.equal(out.ok, false);
    assert.match(out.detail, /the window list was not read after the switch/);
    assert.ok(calls.some(Array.isArray), 'the switch was made');
    assert.equal(out.record.after.alerts, null);
  }
});

test('the read-back must be the very mode set: 1920x1080 at 1x, by the id the listing gave it', async () => {
  const readBackOf = current => ({set: mode(1920, 1080, 10), readBack: {bounds: rect(0, 0, 1920, 1080), current}});
  for (const [current, why] of [[mode(1920, 1080, 12, 2), /3840x2160 pixels/], [mode(1920, 1080, 14), /mode 14, not the mode set \(10\)/]]) {
    const {deps: d} = deps({set: readBackOf(current)});
    const out = await switchDisplayMode(d);
    assert.equal(out.ok, false, JSON.stringify(current));
    assert.match(out.detail, why);
  }
  // The switch answering another mode than the one chosen from the listing.
  const {deps: d} = deps({set: {set: mode(1920, 1080, 14), readBack: {bounds: rect(0, 0, 1920, 1080), current: mode(1920, 1080, 14)}}});
  const out = await switchDisplayMode(d);
  assert.equal(out.ok, false);
  assert.match(out.detail, /mode 14, not the mode set \(10\)/);
});

test('the screen at a sitting\'s end: the alert windows (number, bounds, layer) and the display\'s mode', () => {
  const end = screenAtEnd({display: listing(mode(1920, 1080, 10)), windows: [CUA_ALERT, VENDOR_ALERT, {ownerPid: 5, ownerBundleId: 'com.apple.TextEdit', number: 3, layer: 0, name: 'x', bounds: rect(0, 0, 9, 9)}]});
  assert.deepEqual(end, {alerts: [{number: 90, layer: 8, bounds: CUA_ALERT.bounds}, {number: 91, layer: 8, bounds: VENDOR_ALERT.bounds}],
    mode: {width: 1920, height: 1080, modeId: 10, pixelWidth: 1920, pixelHeight: 1080}, bounds: rect(0, 0, 1920, 1080), modeHeld: true});
  assert.deepEqual(screenAtEnd({display: null, windows: null}), {alerts: null, mode: null, bounds: null, modeHeld: null});
});
