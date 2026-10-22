// The live hold's device side (scripts/native-matrix/live-device.mjs): the minimized-window check, cua's lane of the
// menu check, the enablement release, the input-source switch and its restore, the refusals and the put-back. Driven
// through a fake engine client whose observations are the committed TextEdit capture edited per step, and fake device
// reads; nothing is launched, no socket is opened, no input source is switched.
import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {SkyComputerUseError} from '../../src/services/engine/protocol.mjs';
import {reactivateApp} from '../../scripts/repl-parity/scenes-mac.mjs';
import {ABC, FIRST_LINE, JOURNAL_FILE, KOREAN_2SET, PASTE_TARGETS, RECOVERY_BOUNDS, parseJournal} from '../../scripts/native-matrix/live-checks.mjs';
import {
  COMPOSITION_QUIET_MS, COMPOSITION_VARIANTS, INTERVENTION_DEBOUNCE_MS, PASTE, PASTE_DEADLINE_MS, begin, childHandle, inputSourceCheck, menuCheck, minimizedCheck, pasteCheck, putBack, probeBarrier, recover, restoreInputSource, runProbe, launchProbe, awaitProbe,
  probeStatus, saveFrontmost, saveInputSource,
} from '../../scripts/native-matrix/live-device.mjs';

const GOLDEN = JSON.parse(fs.readFileSync(new URL('../native-goldens/textedit/skyshot.json', import.meta.url), 'utf8'));
const WHOLE = ['cua scene document', 'Bold scene line', ...Array.from({length: 60}, (_, i) => `Line ${String(i + 1).padStart(2, '0')}`)].join('\n');
const scratches = [];
const scratch = () => { const dir = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), 'cua-live-device-'))); scratches.push(dir); return dir; };
after(() => { for (const dir of scratches) fs.rmSync(dir, {recursive: true, force: true}); });

const TEXTEDIT = {scene: 'textedit', app: '/System/Applications/TextEdit.app', pid: 600, window: {number: 41, bounds: {x: 0, y: 0, width: 610, height: 860}}};
const FINDER = {scene: 'finder', app: '/System/Library/CoreServices/Finder.app', pid: 700, window: {number: 42, bounds: {x: 0, y: 0, width: 900, height: 600}}};
const engineError = (errorName, reason, meta = {inputRoute: null, startedAt: null, endedAt: null}) => new SkyComputerUseError({code: -10005, reason, errorName, meta});
const route = (inputRoute, posted = true) => ({meta: {inputRoute, startedAt: posted ? 1 : null, endedAt: posted ? 2 : null, receivedAt: 1, hidIdleMs: null}});

// A fake engine: a document whose value, selection and Markdown the methods change as TextEdit would, observed through
// the real capture's tree. `script(method, args, state)` answers a method its own way (an error, a result).
function fakeEngine({minimized = false, script = () => undefined, menus = {}, menuNeedsActivation = false, source = () => ABC} = {}) {
  const state = {value: WHOLE, markdown: GOLDEN.nodes[2].valueMarkdown, selected: null, minimized, rooted: null, revision: 0};
  // A paste or a paste-routed type_text replaces the selection, as TextEdit does.
  const replaceSelection = (text, markdown = text) => {
    if (!state.selected || !state.value.includes(state.selected)) return;
    state.markdown = state.markdown.replace(state.selected, markdown);
    state.value = state.value.replace(state.selected, text);
    state.selected = null;
  };
  const calls = [];
  const area = () => GOLDEN.nodes.find(n => n.role === 'AXTextArea');
  const observation = () => {
    state.revision++;
    const shot = structuredClone(GOLDEN);
    shot.revision = state.revision;
    shot.app = {...shot.app, pid: TEXTEDIT.pid};
    shot.window = {...shot.window, pid: TEXTEDIT.pid, frame: {...TEXTEDIT.window.bounds}};
    const node = shot.nodes.find(n => n.role === 'AXTextArea');
    Object.assign(node, {value: state.value, valueMarkdown: state.markdown});
    shot.selectedText = state.selected;
    shot.timings = {nodes: shot.nodes.length, ...(state.minimized ? {minimized: true} : {})};
    if (state.minimized) { shot.screenshot = null; shot.screenshotOmitted = 'windowMinimized'; }
    if (state.rooted) { shot.nodes = structuredClone(menus[state.rooted]); shot.menuBar = []; shot.screenshot = null; }
    return shot;
  };
  const client = {
    calls, state, identity: {build: 'b'.repeat(64), engineVersion: '0.1.0'}, closed: false,
    async execute(method, args, options = {}) {
      calls.push({method, args, options});
      const scripted = script(method, args, state);
      if (scripted instanceof Error) throw scripted;
      if (scripted !== undefined) return {result: scripted, engineMs: 1};
      if (method === 'get_app_state') return {result: observation(), engineMs: 1};
      if (method === 'click') {
        const bar = GOLDEN.menuBar.find(n => n.token === args.element);
        if (bar) { state.rooted = bar.title; return {result: route(1, false), engineMs: 1}; }
        if (args.element === 't49') { state.minimized = true; return {result: route(1), engineMs: 1}; }
        const item = Object.values(menus).flat().find(n => n.token === args.element);
        if (item) {
          state.rooted = null;
          // A background app's responder chain that does not answer (the M2a.5 hold's per-action activation) when the fake says so.
          if (!menuNeedsActivation) {
            if (item.title === 'Select All') state.selected = state.value;
            if (item.title === 'Bold') state.markdown = state.markdown.replace(FIRST_LINE, `**${FIRST_LINE}**`);
          }
          return {result: route(1), engineMs: 1};
        }
        if (args.element === area().token && state.minimized) throw engineError('windowMinimized', 'The TextEdit window is minimized, so nothing can be clicked, dragged or scrolled at a point in it.');
        return {result: route(3), engineMs: 1};
      }
      if (method === 'set_value') { state.value = args.value; state.markdown = args.value; return {result: route(1, false), engineMs: 1}; }
      if (method === 'select_text') { state.selected = state.value.includes(args.text) ? args.text : null; return {result: route(1, false), engineMs: 1}; }
      if (method === 'scroll') {
        if (state.minimized) throw engineError('windowMinimized', 'The TextEdit window is minimized, so nothing can be clicked, dragged or scrolled at a point in it.');
        return {result: route(3), engineMs: 1};
      }
      if (method === 'paste') {
        const plain = args.format === 'md' ? args.text.replace(/\*\*/g, '') : args.text;
        replaceSelection(plain, args.text);
        return {result: route('paste'), engineMs: 1};
      }
      if (method === 'type_text') {
        if (source() !== KOREAN_2SET) return {result: route("2'"), engineMs: 1};
        replaceSelection(args.text);
        const result = route('paste');
        result.meta.entered = args.text.length;
        return {result, engineMs: 1};
      }
      if (method === 'press_key') return {result: route("2'"), engineMs: 1};
      throw new Error(`unexpected ${method}`);
    },
    close() { this.closed = true; },
  };
  return client;
}
const MENUS = {
  Edit: [{token: 't80', depth: 0, role: 'AXMenuBarItem', title: 'Edit', flags: {enabled: true}, actions: []}, {token: 't81', depth: 1, role: 'AXMenu', title: null, flags: {enabled: true}, actions: []},
    {token: 't82', depth: 2, role: 'AXMenuItem', title: 'Undo', flags: {enabled: false}, actions: ['AXPress']}, {token: 't83', depth: 2, role: 'AXMenuItem', title: 'Select All', flags: {enabled: true}, actions: ['AXPress']}],
  Format: [{token: 't90', depth: 0, role: 'AXMenuBarItem', title: 'Format', flags: {enabled: true}, actions: []}, {token: 't91', depth: 1, role: 'AXMenu', title: null, flags: {enabled: true}, actions: []},
    {token: 't92', depth: 2, role: 'AXMenuItem', title: 'Font', flags: {enabled: true}, actions: ['AXPress']}, {token: 't93', depth: 3, role: 'AXMenu', title: null, flags: {enabled: true}, actions: []},
    {token: 't94', depth: 4, role: 'AXMenuItem', title: 'Bold', flags: {enabled: true}, actions: ['AXPress']}],
};
const deviceIo = (extra = {}) => ({sleep: async () => {}, now: (() => { let t = 0; return () => (t += 100); })(), frontmost: () => ({pid: FINDER.pid, bundleId: 'com.apple.finder'}),
  windowOnScreen: () => true, activate: async () => ({ok: true}), ...extra});

test('minimizedCheck: minimized through its own button, observed with its tree and no screenshot, the click refused, the Accessibility routes acting, keys recorded, restored', async () => {
  const run = scratch(), client = fakeEngine();
  let onScreen = true;
  const activated = [];
  const io = deviceIo({windowOnScreen: () => (client.state.minimized ? false : onScreen), activate: async id => { activated.push(id); client.state.minimized = false; return {ok: true}; }});
  const out = await minimizedCheck({record: TEXTEDIT, client, io, screenshots: join(run, 'shots')});
  assert.equal(out.verdict.pass, true, JSON.stringify(out.verdict));
  assert.deepEqual(out.verdict.recorded, {typeTextValueChanged: false, superAEffect: false});
  assert.equal(out.steps.minimize.route, 1);
  assert.deepEqual(out.steps.observe, {ok: true, treePresent: true, textArea: true, screenshotNull: true, screenshotOmitted: 'windowMinimized', engineSaysMinimized: true,
    minimizedBefore: true, minimizedAfter: true});
  assert.equal(out.verdict.status, 'valid');
  assert.ok(['click', 'scroll', 'setValue', 'selectText', 'typeText', 'selectAll'].every(name => out.steps[name].minimizedBefore && out.steps[name].minimizedAfter),
    'every measurement bracketed by a minimized reading');
  assert.equal(out.steps.click.errorName, 'windowMinimized');
  assert.equal(out.steps.click.posted, false);
  assert.deepEqual(activated, ['textedit']);
  assert.equal(out.steps.restore.onScreen, true);
  // The click went to the minimize button, by token in the observation's lineage; set_value and select_text to the text area.
  const sent = client.calls.filter(c => c.method !== 'get_app_state');
  assert.deepEqual(sent.map(c => c.method), ['click', 'click', 'scroll', 'set_value', 'select_text', 'type_text', 'press_key']);
  assert.equal(sent[0].args.element, 't49');
  assert.ok(sent.every(c => c.options.lineage === GOLDEN.lineage));
  assert.equal(sent[6].args.key, 'super+a');
  // The element scroll in the minimized window: refused, nothing scrolled; set_value and select_text posted no click.
  assert.deepEqual({refused: out.steps.scroll.refused, errorName: out.steps.scroll.errorName, posted: out.steps.scroll.posted}, {refused: true, errorName: 'windowMinimized', posted: false});
  assert.equal(sent[2].args.element, sent[1].args.element, 'the scroll aims at the text area');
  assert.ok(!out.verdict.failed.includes('scrollRefused'));
  assert.equal(out.steps.setValue.posted, false);
  assert.equal(out.steps.selectText.posted, false);
  // Every observation asked for the screenshot, as cua's service does.
  assert.ok(client.calls.filter(c => c.method === 'get_app_state').every(c => c.args.includeScreenshot === true));
  // Nothing of the document leaves: no value, no selection, only booleans and lengths.
  assert.doesNotMatch(JSON.stringify(out), /Line 0|cua minimized set value/);
});

test('minimizedCheck: typing and ⌘A that act on the minimized window are recorded as acting', async () => {
  const client = fakeEngine({script: (method, args, state) => {
    if (method === 'type_text') { state.value += args.text; return route("2'"); }
    if (method === 'press_key') { state.selected = state.value; return route("2'"); }
    return undefined;
  }});
  const io = deviceIo({windowOnScreen: () => !client.state.minimized, activate: async () => { client.state.minimized = false; return {ok: true}; }});
  const out = await minimizedCheck({record: TEXTEDIT, client, io, screenshots: join(scratch(), 'shots')});
  assert.deepEqual(out.verdict.recorded, {typeTextValueChanged: true, superAEffect: true});
  assert.deepEqual(out.verdict.decision, {plainKeys: 'type_text and press_key without ⌘ stay allowed: typed text reached the minimized window',
    commandChordsAndPaste: '⌘ chords and paste go through: ⌘A acted with the window minimized'});
});

test('minimizedCheck: a window that never minimizes stops the check before any input, and is still restored', async () => {
  const client = fakeEngine({script: (method, args) => (method === 'click' && args.element === 't49' ? route(1) : undefined)});
  const activated = [];
  const io = deviceIo({windowOnScreen: () => true, activate: async id => { activated.push(id); return {ok: true}; }});
  const out = await minimizedCheck({record: TEXTEDIT, client, io, screenshots: join(scratch(), 'shots')});
  assert.equal(out.verdict.pass, false);
  assert.deepEqual(out.verdict.failed.slice(0, 1), ['minimized']);
  assert.deepEqual(client.calls.filter(c => c.method !== 'get_app_state').map(c => c.method), ['click']);
  assert.deepEqual(activated, ['textedit']);
});

test('minimizedCheck: an engine error mid-check keeps the steps so far and still restores the window', async () => {
  const client = fakeEngine();
  const activated = [];
  const io = deviceIo({windowOnScreen: () => !client.state.minimized, activate: async id => { activated.push(id); client.state.minimized = false; return {ok: true}; }});
  client.execute = (execute => async (method, args, options) => { if (method === 'set_value') throw new Error('engine socket closed'); return execute.call(client, method, args, options); })(client.execute);
  const out = await minimizedCheck({record: TEXTEDIT, client, io, screenshots: join(scratch(), 'shots')});
  assert.equal(out.steps.setValue.ok, false);
  const failing = fakeEngine();
  const observed = [];
  failing.execute = (execute => async (method, args, options) => {
    if (method === 'get_app_state') { observed.push(1); if (observed.length === 3) throw new Error('engine socket closed'); }
    return execute.call(failing, method, args, options);
  })(failing.execute);
  const io2 = deviceIo({windowOnScreen: () => !failing.state.minimized, activate: async id => { activated.push(id); failing.state.minimized = false; return {ok: true}; }});
  const stopped = await minimizedCheck({record: TEXTEDIT, client: failing, io: io2, screenshots: join(scratch(), 'shots')});
  assert.match(stopped.problem, /the minimized check stopped: engine socket closed/);
  assert.equal(stopped.steps.click.refused, true);
  assert.equal(stopped.verdict.pass, false);
  assert.deepEqual(activated, ['textedit', 'textedit']);
});

test('minimizedCheck: a window that comes back on screen during a measurement makes the section invalid; nothing more is sent, nothing re-minimized', async () => {
  const client = fakeEngine();
  let unminimizeAfterSelect = true;
  const inner = client.execute;
  client.execute = async (method, args, options) => {
    const out = await inner.call(client, method, args, options);
    if (method === 'select_text' && unminimizeAfterSelect) { client.state.minimized = false; unminimizeAfterSelect = false; }
    return out;
  };
  const activated = [];
  const io = deviceIo({windowOnScreen: () => !client.state.minimized, activate: async id => { activated.push(id); client.state.minimized = false; return {ok: true}; }});
  const out = await minimizedCheck({record: TEXTEDIT, client, io, screenshots: join(scratch(), 'shots')});
  assert.equal(out.verdict.status, 'invalid');
  assert.equal(out.verdict.decision, null);
  assert.deepEqual(out.steps.invalid, {at: 'selectText'});
  assert.equal(out.steps.selectText.minimizedAfter, false);
  assert.match(out.problem, /not minimized around selectText/);
  const sent = client.calls.filter(c => c.method !== 'get_app_state').map(c => c.method);
  assert.deepEqual(sent, ['click', 'click', 'scroll', 'set_value', 'select_text'], 'no key probe after the window came back');
  assert.ok(!client.calls.some(c => c.method === 'click' && c.args.element === 't49' && c !== client.calls.find(x => x.method === 'click')), 'the minimize button is pressed once only');
  assert.deepEqual(activated, ['textedit']);
});

test('minimizedCheck: a key probe that answers an error is inconclusive, not policy evidence', async () => {
  const client = fakeEngine({script: method => (method === 'type_text' ? engineError('userIntervened', 'The user is typing.') : undefined)});
  const io = deviceIo({windowOnScreen: () => !client.state.minimized, activate: async () => { client.state.minimized = false; return {ok: true}; }});
  const out = await minimizedCheck({record: TEXTEDIT, client, io, screenshots: join(scratch(), 'shots')});
  assert.equal(out.verdict.status, 'inconclusive');
  assert.equal(out.verdict.decision.plainKeys, 'inconclusive: type_text answered userIntervened');
  assert.equal(out.verdict.pass, false);
});

test('minimizedCheck: an observation of another process sends nothing at all', async () => {
  const client = fakeEngine({script: method => (method === 'get_app_state' ? {...structuredClone(GOLDEN), app: {...GOLDEN.app, pid: 1}} : undefined)});
  assert.notEqual(GOLDEN.app.pid, TEXTEDIT.pid);
  const out = await minimizedCheck({record: TEXTEDIT, client, io: deviceIo(), screenshots: join(scratch(), 'shots')});
  assert.match(out.problem, /not of the run's process/);
  assert.deepEqual(client.calls.map(c => c.method), ['get_app_state']);
});

const quietWatch = (lines = []) => ({start: () => ({pid: 9}), stop: () => lines});

test('menuCheck: each item through the menu-bar record and a rooted observation, its enabled state, its effect read back, valid under the background condition', async () => {
  const client = fakeEngine({menus: MENUS});
  const watched = [];
  const io = deviceIo({watch: {start: () => { watched.push('start'); return {pid: 9}; }, stop: () => { watched.push('stop'); return [{kind: 'deactivated', bundleId: 'com.apple.mail', pid: 50, at: 1}]; }}});
  const out = await menuCheck({record: TEXTEDIT, user: FINDER, client, io, screenshots: join(scratch(), 'shots')});
  assert.deepEqual(watched, ['start', 'stop']);
  assert.deepEqual(out.items.selectAll, {found: true, rooted: true, enabled: true, record: {ok: true, route: 1, posted: false}, clicked: true, click: {ok: true, route: 1, posted: true},
    effect: true, userInFront: [true, true], valid: true});
  assert.equal(out.items.bold.prepared, true, 'the first line was selected before Format');
  assert.equal(out.items.bold.effect, true);
  assert.equal(out.items.bold.valid, true);
  assert.ok(client.calls.filter(c => c.method === 'click').every(c => !('spikeMenuActivation' in c.args)), 'no engine switch is sent: the held activation is the engine\'s own');
  assert.equal(client.calls.find(c => c.method === 'select_text').args.text, FIRST_LINE);
  assert.doesNotMatch(JSON.stringify(out), /Line 0/);
});

test('menuCheck: an item read disabled is not pressed; a submenu not exposed is recorded as not found', async () => {
  const menus = structuredClone(MENUS);
  menus.Edit[3].flags.enabled = false;
  menus.Format = menus.Format.slice(0, 3);
  const client = fakeEngine({menus});
  const out = await menuCheck({record: TEXTEDIT, user: FINDER, client, io: deviceIo({watch: quietWatch()}), screenshots: join(scratch(), 'shots')});
  assert.equal(out.items.selectAll.enabled, false);
  assert.equal(out.items.selectAll.clicked, false);
  assert.equal(out.items.bold.found, false);
  assert.ok(!client.calls.some(c => c.method === 'click' && c.args.element === 't83'));
});

test('menuCheck: the user window leaving the front invalidates that item and stops the lane; the rest are unattempted', async () => {
  const client = fakeEngine({menus: MENUS});
  let lost = false;
  const inner = client.execute;
  client.execute = async (method, args, options) => { const out = await inner.call(client, method, args, options); if (args?.element === 't83') lost = true; return out; };
  const io = deviceIo({watch: quietWatch(), frontmost: () => (lost ? {pid: TEXTEDIT.pid, bundleId: 'com.apple.TextEdit'} : {pid: FINDER.pid, bundleId: 'com.apple.finder'})});
  const out = await menuCheck({record: TEXTEDIT, user: FINDER, client, io, screenshots: join(scratch(), 'shots')});
  assert.equal(out.lostAt, 'selectAll');
  assert.equal(out.items.selectAll.valid, false);
  assert.deepEqual(out.items.bold, {found: true, attempted: false, valid: false, reason: 'the lane lost the background condition before it'});
  assert.ok(!client.calls.some(c => c.args?.element === 't94'), 'nothing sent after the front was lost');
});

test('menuCheck: an activation the watcher records during an item invalidates it and every item after', async () => {
  const client = fakeEngine({menus: MENUS});
  let t = 0;
  const io = deviceIo({now: () => (t += 100), watch: quietWatch([{pid: 9, watch: 'activations'}, {kind: 'activated', bundleId: 'com.apple.TextEdit', pid: 600, at: 150}])});
  const out = await menuCheck({record: TEXTEDIT, user: FINDER, client, io, screenshots: join(scratch(), 'shots')});
  assert.equal(out.invalidFrom, 'selectAll');
  assert.deepEqual([out.items.selectAll.valid, out.items.bold.valid], [false, false]);
  const later = await menuCheck({record: TEXTEDIT, user: FINDER, client: fakeEngine({menus: MENUS}), screenshots: join(scratch(), 'shots'),
    io: deviceIo({now: (() => { let u = 0; return () => (u += 100); })(), watch: quietWatch([{kind: 'activated', bundleId: 'com.apple.TextEdit', pid: 600, at: 350}])})});
  assert.deepEqual([later.items.selectAll.valid, later.items.bold.valid], [true, false]);
});

test('menuCheck: refuses to send anything unless the user window is in front', async () => {
  const client = fakeEngine({menus: MENUS});
  const out = await menuCheck({record: TEXTEDIT, user: FINDER, client, io: deviceIo({frontmost: () => ({pid: 1, bundleId: 'com.apple.Terminal'}), watch: quietWatch()}),
    screenshots: join(scratch(), 'shots')});
  assert.match(out.problem, /user window/);
  assert.deepEqual(client.calls, []);
});

// A fake probe and HIToolbox: the source the probe selects is the current one until another is selected.
function fakeInput({current = ABC, perContext = false, select = id => id, saved} = {}) {
  const state = {current, perContext, probes: [], writes: []};
  return {state, io: {
    savedInputSource: saved,
    probe: args => {
      state.probes.push(args.join(' '));
      if (args[1] === 'current') return {id: state.current, perContextInput: state.perContext};
      const previous = state.current;
      state.current = select(args[1]);
      return {previous: {id: previous}, current: {id: state.current}, selected: state.current === args[1]};
    },
    readPerContext: () => state.perContext,
    writePerContext: value => { state.writes.push(value); state.perContext = value; },
  }};
}

test('inputSourceCheck: the owner\'s source and preference saved first, Korean 2-Set selected and read back, ABC restored, the record kept for the put-back to verify', async () => {
  const file = join(scratch(), 'input-source.json');
  const {state, io} = fakeInput();
  io.savedInputSource = file;
  const out = await inputSourceCheck({io});
  assert.equal(out.verdict.pass, true, JSON.stringify(out));
  assert.deepEqual(state.probes, ['input-source current', `input-source ${KOREAN_2SET}`, 'input-source current', 'input-source current', `input-source ${ABC}`, 'input-source current']);
  assert.equal(state.current, ABC);
  assert.equal(fs.existsSync(file), true, 'the put-back verifies the restore and removes the record');
  assert.deepEqual(state.writes, [], 'an unchanged preference is never written');
});

test('inputSourceCheck: a selection that fails is restored all the same; a record a dead run left is kept, not overwritten', async () => {
  const file = join(scratch(), 'input-source.json');
  fs.writeFileSync(file, JSON.stringify({savedAt: 't0', source: {id: 'com.apple.keylayout.US'}, perContext: true}));
  const {state, io} = fakeInput({current: KOREAN_2SET, perContext: false, select: id => (id === KOREAN_2SET ? ABC : id)});
  io.savedInputSource = file;
  const out = await inputSourceCheck({io});
  assert.equal(out.saved.kept, true);
  assert.equal(out.verdict.pass, false);
  assert.ok(out.verdict.failed.includes('selected'));
  assert.equal(state.current, 'com.apple.keylayout.US', 'the dead run\'s saved source is the one restored');
  assert.deepEqual(state.writes, [true]);
  assert.equal(fs.existsSync(file), true);
});

test('restoreInputSource: nothing saved is nothing to restore; a restore that does not hold keeps the record', async () => {
  const file = join(scratch(), 'input-source.json');
  const {io} = fakeInput();
  io.savedInputSource = file;
  assert.deepEqual(await restoreInputSource({io}), {saved: false});
  fs.writeFileSync(file, JSON.stringify({savedAt: 't0', source: {id: ABC}, perContext: false}));
  const stuck = fakeInput({current: KOREAN_2SET, select: () => KOREAN_2SET});
  stuck.io.savedInputSource = file;
  const out = await restoreInputSource({io: stuck.io});
  assert.equal(out.sourceRestored, false);
  assert.equal(fs.existsSync(file), true);
});

test('saveInputSource: the record is written owner-only and first wins', async () => {
  const file = join(scratch(), 'input-source.json');
  const {io} = fakeInput({current: 'com.apple.keylayout.US', perContext: true});
  io.savedInputSource = file;
  const first = saveInputSource({io});
  assert.equal(first.kept, false);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const again = saveInputSource({io: {...io, probe: () => ({id: KOREAN_2SET})}});
  assert.equal(again.kept, true);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).source.id, 'com.apple.keylayout.US');
});

test('begin: refusals stop it before the front app is saved or the engine stopped; otherwise both, the front app\'s pid kept on the device only', async () => {
  const run = scratch();
  const calls = [];
  const io = {preflight: () => ({refusals: [{code: 'textedit_running', message: 'TextEdit is running and is not the run\'s'}]}), gitState: () => ({commit: 'c1', dirty: false}),
    engineCheck: () => ({ok: true, engine: {build: 'b'}, problems: []}), frontmost: () => ({pid: 77, bundleId: 'com.apple.Terminal'}), stop: async () => { calls.push('stop'); return {wasRunning: false}; },
    finderWindows: () => [], finderPreferences: () => ({ShowSidebar: true}), finderSavedPreferences: () => null};
  const refused = await begin({run, commit: 'c1', io});
  assert.deepEqual(refused.refusals, ['TextEdit is running and is not the run\'s']);
  assert.deepEqual(calls, []);
  assert.equal(fs.existsSync(join(run, 'live-frontmost.json')), false);
  const ok = await begin({run, commit: 'c1', io: {...io, preflight: () => ({refusals: []})}});
  assert.deepEqual(ok.refusals, []);
  assert.deepEqual(calls, ['stop']);
  assert.deepEqual(ok.frontmost, {bundleId: 'com.apple.Terminal'});
  assert.equal(JSON.parse(fs.readFileSync(join(run, 'live-frontmost.json'), 'utf8')).pid, 77);
  assert.doesNotMatch(JSON.stringify(ok), /77/);
  assert.deepEqual(JSON.parse(fs.readFileSync(join(run, 'live-finder.json'), 'utf8')).keys, {ShowSidebar: true}, 'Finder at begin, for the put-back');
});

test('saveFrontmost: a front app a dead run saved is kept (the current one may be a scene app)', () => {
  const run = scratch();
  saveFrontmost(run, {pid: 1, bundleId: 'com.apple.Terminal'});
  saveFrontmost(run, {pid: 600, bundleId: 'com.apple.TextEdit'});
  assert.equal(JSON.parse(fs.readFileSync(join(run, 'live-frontmost.json'), 'utf8')).bundleId, 'com.apple.Terminal');
});

// Begin's device reads only; calls after the preflight mark anything a refused begin must not do.
function beginIo(extra = {}) {
  const calls = [];
  return {calls, preflight: () => ({refusals: []}), gitState: () => ({commit: 'c1', dirty: false}),
    engineCheck: () => ({ok: true, engine: {build: 'b'}, problems: []}),
    frontmost: () => { calls.push('frontmost'); return {pid: 77, bundleId: 'com.apple.Terminal'}; },
    finderWindows: () => { calls.push('finder'); return []; }, finderPreferences: () => ({ShowSidebar: true}), finderSavedPreferences: () => null,
    stop: async () => { calls.push('stop'); return {wasRunning: false}; }, ...extra};
}

function assertRecoveryRefusal(out, file) {
  assert.ok(out.refusals.some(r => r.includes(file) && /recover --run/.test(r)), JSON.stringify(out));
  assert.equal(Object.hasOwn(out, 'frontmost'), false, 'a refused begin claims no new front record');
  assert.equal(Object.hasOwn(out, 'engineStop'), false);
}

test('begin: failed put-back retaining an old scene app refuses a new run without replacing its recovery record', async () => {
  const run = scratch(), file = join(run, 'live-frontmost.json');
  saveFrontmost(run, {pid: 600, bundleId: 'com.apple.TextEdit'});
  const before = fs.readFileSync(file, 'utf8');
  const cleanupIo = putBackIo(run);
  const cleanup = await putBack({run, io: cleanupIo});
  assert.equal(cleanup.ok, false);
  assert.match(cleanup.steps['front-app'].reason, /scene app/);
  assert.ok(!cleanupIo.order.some(c => c.startsWith('reactivate')));
  const io = beginIo();
  const out = await begin({run, commit: 'c1', io});
  assertRecoveryRefusal(out, 'live-frontmost.json');
  assert.ok(out.refusals.some(r => r.includes(run)), 'the recovery command identifies the retained run directory');
  assert.deepEqual(io.calls, [], 'no new front/Finder reading or engine stop');
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'the only recovery record survives byte for byte');
  assert.deepEqual(fs.readdirSync(run), ['live-frontmost.json']);
});

for (const [file, contents] of [
  ['live-frontmost.json', JSON.stringify({pid: 88, bundleId: 'com.apple.Notes', savedAt: 'old'})],
  ['live-frontmost.json', '{unreadable JSON'], ['live-frontmost.json', 'null'],
  ['live-finder.json', JSON.stringify({windows: [42], keys: {ShowSidebar: false}, savedAt: 'old'})],
  ['live-finder.json', '{unreadable JSON'],
]) {
  test(`begin: stale ${file} (${contents}) refuses without parsing or adopting it`, async () => {
    const run = scratch(), path = join(run, file), io = beginIo();
    fs.writeFileSync(path, contents);
    const out = await begin({run, commit: 'c1', io});
    assertRecoveryRefusal(out, file);
    assert.deepEqual(io.calls, []);
    assert.equal(fs.readFileSync(path, 'utf8'), contents);
    assert.deepEqual(fs.readdirSync(run), [file]);
  });
}

test('begin: an unreadable front record path is unresolved recovery, not permission to replace it', async () => {
  const run = scratch(), file = join(run, 'live-frontmost.json'), io = beginIo();
  // A directory cannot be read as a JSON file, even when the tests run with elevated file access.
  fs.mkdirSync(file);
  const out = await begin({run, commit: 'c1', io});
  assertRecoveryRefusal(out, 'live-frontmost.json');
  assert.deepEqual(io.calls, []);
  assert.equal(fs.statSync(file).isDirectory(), true);
  assert.deepEqual(fs.readdirSync(run), ['live-frontmost.json']);
});

for (const front of [null, {}, {bundleId: 'com.apple.Terminal'}, {pid: 0, bundleId: 'com.apple.Terminal'},
  {pid: 77, bundleId: ''}, {pid: 600, bundleId: 'com.apple.TextEdit'}, {pid: 700, bundleId: 'com.apple.finder'}]) {
  test(`begin: an unrestorable current front (${JSON.stringify(front)}) refuses before creating start state`, async () => {
    const run = scratch(), io = beginIo({frontmost: () => front});
    const out = await begin({run, commit: 'c1', io});
    assert.ok(out.refusals.some(r => /front app/.test(r)), JSON.stringify(out));
    assert.equal(Object.hasOwn(out, 'frontmost'), false);
    assert.deepEqual(io.calls, []);
    assert.deepEqual(fs.readdirSync(run), []);
  });
}

test('begin: an unreadable current front refuses without saving state or stopping the engine', async () => {
  const run = scratch(), io = beginIo({frontmost: () => { throw new Error('front read failed'); }});
  const out = await begin({run, commit: 'c1', io});
  assert.ok(out.refusals.some(r => /front app/.test(r)), JSON.stringify(out));
  assert.equal(Object.hasOwn(out, 'frontmost'), false);
  assert.deepEqual(io.calls, []);
  assert.deepEqual(fs.readdirSync(run), []);
});

test('begin: clean metadata and put-back use the saved front record, and successful cleanup permits a new begin', async () => {
  const run = scratch();
  const begun = await begin({run, commit: 'c1', io: beginIo()});
  const front = JSON.parse(fs.readFileSync(join(run, 'live-frontmost.json'), 'utf8'));
  assert.deepEqual(begun.refusals, []);
  assert.deepEqual(begun.frontmost, {bundleId: front.bundleId});
  assert.equal(front.pid, 77);
  assert.equal(fs.statSync(join(run, 'live-frontmost.json')).mode & 0o777, 0o600);
  const reactivated = [];
  const cleanup = await putBack({run, io: putBackIo(run, {reactivate: async saved => {
    reactivated.push(saved); return {reactivated: true, inFront: true};
  }})});
  assert.equal(cleanup.ok, true);
  assert.deepEqual(reactivated, [front]);
  assert.equal(fs.existsSync(join(run, 'live-frontmost.json')), false);
  assert.equal(fs.existsSync(join(run, 'live-finder.json')), false);
  const next = await begin({run, commit: 'c1', io: beginIo({frontmost: () => ({pid: 88, bundleId: 'com.apple.Notes'})})});
  assert.deepEqual(next.refusals, []);
  assert.deepEqual(next.frontmost, {bundleId: 'com.apple.Notes'});
  assert.equal(JSON.parse(fs.readFileSync(join(run, 'live-frontmost.json'), 'utf8')).pid, 88);
});

test('begin: an exited or replaced saved process is never reactivated and its failed put-back blocks the next run', async () => {
  for (const running of [[], [{pid: 88, bundleId: 'com.apple.Terminal'}], [{pid: 77, bundleId: 'com.apple.Notes'}]]) {
    const run = scratch(), file = join(run, 'live-frontmost.json');
    await begin({run, commit: 'c1', io: beginIo()});
    const before = fs.readFileSync(file, 'utf8'), activated = [];
    const io = putBackIo(run, {frontmost: () => running[0] ?? null,
      reactivate: front => reactivateApp(front, {io: {
        runningApps: bundleId => running.filter(p => p.bundleId === bundleId),
        activateProcess: app => { activated.push(app); return {activated: true}; },
      }}),
    });
    const cleanup = await putBack({run, io});
    assert.equal(cleanup.ok, false);
    assert.match(cleanup.steps['front-app'].reason, /no longer running/);
    assert.deepEqual(activated, []);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
    const nextIo = beginIo();
    assertRecoveryRefusal(await begin({run, commit: 'c1', io: nextIo}), 'live-frontmost.json');
    assert.deepEqual(nextIo.calls, []);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  }
});

// A put-back device: the scenes, the engine, the apps, Finder and the front app, every call in `order`.
function putBackIo(run, extra = {}) {
  const order = [];
  const io = {savedInputSource: join(run, 'none.json'), order,
    goldensSteps: async args => { order.push(args.join(' ')); return {steps: []}; },
    scenes: async args => { order.push(args.join(' ')); return {down: true}; },
    stop: async () => { order.push('engine-stop'); return {wasRunning: true}; },
    runningApps: () => [],
    finderWindows: () => [], finderPreferences: () => ({ShowSidebar: true, ShowStatusBar: false, ShowPathbar: false}),
    reactivate: async front => { order.push(`reactivate ${front.bundleId}`); return {reactivated: true, inFront: true}; },
    frontmost: () => ({pid: 77, bundleId: 'com.apple.Terminal'}),
    watch: {stop: watch => { order.push(`watch-stop ${watch?.pid}`); return []; }}, processRuns: () => false,
    journal: () => [], processes: () => [], identity: () => ({self: 200, ancestors: [], uid: 501, checkout: '/c', bundle: BUNDLE}), signal: () => {},
    client: () => { throw new Error('the put-back observes nothing through the engine'); },
    sleep: async () => {}, now: (() => { let t = 0; return () => (t += 100); })(), ...extra};
  return io;
}
const FINDER_BASELINE = {windows: [], keys: {ShowSidebar: true, ShowStatusBar: false, ShowPathbar: false}};
const BUNDLE = '/Users/u/Applications/Cua Engine.app';
const T = 'Tue Oct 21 10:00:00 2026';
// Scaled bounds: each put-back step 30 ms, each stop's wait 40 ms (the fake clock's sleeps advance it 100 ms a call).
const SCALED = {...RECOVERY_BOUNDS, killMs: 1_000, sceneUpWaitMs: 2_000, probeWaitMs: 2_000, stepMs: 30, stepKillMs: 40};

test('putBack: the watcher stopped first, every planned step run whatever the one before answered, Finder observed, the front app last', async () => {
  const run = scratch();
  fs.writeFileSync(join(run, 'scenes.json'), JSON.stringify({scenes: {textedit: TEXTEDIT, finder: FINDER}}));
  fs.writeFileSync(join(run, 'live-watch.json'), JSON.stringify({pid: 4242, dir: join(run, 'watch-x')}));
  fs.writeFileSync(join(run, 'live-finder.json'), JSON.stringify(FINDER_BASELINE));
  saveFrontmost(run, {pid: 77, bundleId: 'com.apple.Terminal'});
  const savedInput = join(run, 'input-source.json');
  fs.writeFileSync(savedInput, JSON.stringify({savedAt: 't0', source: {id: ABC}, perContext: false}));
  const {io: input} = fakeInput({current: KOREAN_2SET});
  const io = putBackIo(run, {...input, savedInputSource: savedInput,
    goldensSteps: async args => { io.order.push(args.join(' ')); throw new Error('the run\'s Finder window could not be observed'); }});
  const out = await putBack({run, io});
  assert.deepEqual(out.plan, ['watch-stop', 'finder-teardown', 'scenes-down', 'input-source', 'engine-stop', 'apps-check', 'finder-check', 'front-app']);
  assert.deepEqual(io.order, ['watch-stop 4242', `steps finder --run ${run} --phase teardown`, `down all --run ${run}`, 'engine-stop', 'reactivate com.apple.Terminal']);
  assert.match(out.steps['finder-teardown'].error, /could not be observed/);
  assert.equal(out.steps['input-source'].sourceRestored, true);
  assert.equal(fs.existsSync(savedInput), false, 'the put-back verified the restore and removed the record');
  assert.deepEqual(out.steps['watch-stop'], {ok: true, stopped: true});
  assert.deepEqual(out.steps['finder-check'], {ok: true, runWindowGone: true, windowsAsAtBegin: true, keysAsSaved: true});
  assert.deepEqual(out.steps['front-app'], {ok: true, bundleId: 'com.apple.Terminal', reactivated: true, inFront: true});
  assert.equal(out.ok, false, 'a failed step leaves the put-back incomplete');
  assert.equal(fs.existsSync(join(run, 'live-frontmost.json')), false, 'the front app once back, its record goes');
});

test('putBack: a watcher that will not stop, Finder\'s window still open or a key not back fail it', async () => {
  const run = scratch();
  fs.writeFileSync(join(run, 'scenes.json'), JSON.stringify({scenes: {finder: FINDER}}));
  fs.writeFileSync(join(run, 'live-watch.json'), JSON.stringify({pid: 4242, dir: join(run, 'watch-x')}));
  fs.writeFileSync(join(run, 'live-finder.json'), JSON.stringify(FINDER_BASELINE));
  const io = putBackIo(run, {processRuns: pid => pid === 4242, finderWindows: () => [FINDER.window.number], finderPreferences: () => ({...FINDER_BASELINE.keys, ShowPathbar: true})});
  const out = await putBack({run, io});
  assert.deepEqual(out.steps['watch-stop'], {ok: false, stopped: false});
  assert.deepEqual(out.steps['finder-check'], {ok: false, runWindowGone: false, windowsAsAtBegin: false, keysAsSaved: false});
  assert.equal(out.ok, false);
  assert.equal(fs.existsSync(join(run, 'live-watch.json')), true, 'kept for the next put-back');
});

for (const bundleId of ['com.google.Chrome', 'com.anthropic.claudefordesktop']) {
  test(`putBack: ${bundleId} in front at begin is given the front back by activation alone, never observed`, async () => {
    const run = scratch();
    saveFrontmost(run, {pid: 5, bundleId});
    const reactivated = [];
    const io = putBackIo(run, {reactivate: async front => { reactivated.push(front); return {reactivated: true, inFront: true}; }, frontmost: () => ({pid: 5, bundleId}),
      goldensSteps: async () => { throw new Error('no engine step may run against the owner\'s app'); }});
    const out = await putBack({run, io});
    assert.deepEqual(reactivated, [{pid: 5, bundleId, savedAt: reactivated[0].savedAt}]);
    assert.deepEqual(out.steps['front-app'], {ok: true, bundleId, reactivated: true, inFront: true});
    assert.ok(!out.plan.includes('finder-teardown'));
  });
}

test('putBack: a refused activation keeps the recovery record even when the front reading still matches', async () => {
  const run = scratch(), file = join(run, 'live-frontmost.json');
  saveFrontmost(run, {pid: 77, bundleId: 'com.apple.Terminal'});
  const before = fs.readFileSync(file, 'utf8'), activated = [];
  const io = putBackIo(run, {reactivate: front => reactivateApp(front, {io: {
    runningApps: () => [], activateProcess: app => { activated.push(app); return {activated: true}; },
  }})});
  const out = await putBack({run, io});
  assert.equal(out.ok, false);
  assert.equal(out.steps['front-app'].ok, false);
  assert.match(out.steps['front-app'].reason, /no longer running/);
  assert.deepEqual(activated, []);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('putBack: a scene app still running fails the apps check', async () => {
  const run = scratch();
  const io = putBackIo(run, {runningApps: bundleId => (bundleId === 'com.apple.TextEdit' ? [{pid: 600, bundleId}] : [])});
  const out = await putBack({run, io});
  assert.equal(out.steps['apps-check'].ok, false);
  assert.equal(out.steps['apps-check'].running.textedit, 1);
});

test('putBack: a step past its bound is stopped (SIGTERM, then SIGKILL) and its exit awaited before the next step starts', async () => {
  const run = scratch();
  fs.writeFileSync(join(run, 'scenes.json'), JSON.stringify({scenes: {textedit: TEXTEDIT}}));
  saveFrontmost(run, {pid: 77, bundleId: 'com.apple.Terminal'});
  const timeline = [];
  const stepIo = dies => putBackIo(run, {startStep: step => {
    timeline.push(`start ${step}`);
    if (step !== 'scenes-down') return {result: Promise.resolve({ok: true}), running: () => false, kill: () => {}};
    let gone = false;
    return {result: new Promise(() => {}), running: () => !gone, kill: signal => { timeline.push(signal); if (signal === dies) setTimeout(() => { timeline.push('exited'); gone = true; }, 5); }};
  }});
  const out = await putBack({run, io: stepIo('SIGKILL'), bounds: SCALED});
  assert.deepEqual(timeline, ['start scenes-down', 'SIGTERM', 'SIGKILL', 'exited', 'start engine-stop', 'start apps-check', 'start front-app']);
  assert.match(out.steps['scenes-down'].error, /did not finish within 0\.03 s; its process group was stopped/);
  assert.equal(out.ok, false);
  // One that cannot be stopped ends the put-back there: no later step, the front app above all, runs after it.
  timeline.length = 0;
  const stuck = await putBack({run, io: stepIo('never'), bounds: SCALED});
  assert.deepEqual(timeline, ['start scenes-down', 'SIGTERM', 'SIGKILL']);
  assert.match(stuck.steps['scenes-down'].error, /could not be stopped/);
  assert.match(stuck.steps['front-app'].skipped, /not run/);
  assert.match(stuck.manual, /scenes-down .*by hand/);
  assert.equal(stuck.ok, false);
});

test('putBack: in this process (no step process to stop) a step past its bound ends the put-back too', async () => {
  const run = scratch();
  fs.writeFileSync(join(run, 'scenes.json'), JSON.stringify({scenes: {textedit: TEXTEDIT}}));
  saveFrontmost(run, {pid: 77, bundleId: 'com.apple.Terminal'});
  const io = putBackIo(run, {scenes: () => new Promise(() => {})});
  const out = await putBack({run, io, bounds: SCALED});
  assert.match(out.steps['scenes-down'].error, /could not be stopped/);
  assert.ok(!io.order.includes('reactivate com.apple.Terminal'), 'the front app is not given back after an action that may still land');
});

test('putBack: a step that failed with a probe of the run still running stops the probe before the next step; one that will not stop ends the put-back', async () => {
  const run = scratch();
  saveFrontmost(run, {pid: 77, bundleId: 'com.apple.Terminal'});
  fs.writeFileSync(join(run, 'input.json'), JSON.stringify({savedAt: 't0', source: {id: ABC}, perContext: false}));
  const probe = {pid: 910, ppid: 1, uid: 501, start: T, command: `${BUNDLE}/Contents/MacOS/cua-engine --probe input-source ${ABC}`};
  const make = killable => {
    const alive = new Set([910]), signals = [];
    const io = putBackIo(run, {savedInputSource: join(run, 'input.json'), probe: () => { throw new Error('the input-source probe did not finish within 60 s'); },
      journal: () => [{kind: 'probe', pid: 910, start: T, label: 'input-source'}], processes: () => (alive.has(910) ? [probe] : []),
      processRuns: pid => alive.has(pid), signal: (pid, signal) => { signals.push(signal); if (killable) alive.delete(pid); }});
    return {io, signals};
  };
  const stops = make(true);
  const out = await putBack({run, io: stops.io, bounds: SCALED});
  assert.deepEqual(stops.signals, ['SIGTERM']);
  assert.ok(stops.io.order.includes('reactivate com.apple.Terminal'));
  assert.equal(out.manual, undefined);
  const stays = make(false);
  const stuck = await putBack({run, io: stays.io, bounds: SCALED});
  assert.deepEqual(stays.signals, ['SIGTERM', 'SIGKILL']);
  assert.match(stuck.manual, /did not exit/);
  assert.ok(!stays.io.order.includes('reactivate com.apple.Terminal'), 'the front app waits on the probe');
});

test('childHandle: a step process\'s answer is its last JSON line', async () => {
  const done = childHandle(process.execPath, ['-e', 'console.log("noise"); console.log(JSON.stringify({ok: true, n: 1}))']);
  assert.deepEqual(await done.result, {ok: true, n: 1});
  await done.exited;
});

test('putBack, real processes: a leader that exits on SIGTERM while a descendant ignores it is stopped only once its group is empty', async () => {
  const run = scratch();
  fs.writeFileSync(join(run, 'scenes.json'), JSON.stringify({scenes: {textedit: TEXTEDIT}}));
  saveFrontmost(run, {pid: 77, bundleId: 'com.apple.Terminal'});
  const descendant = 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000)';
  const leader = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio: 'ignore'}); setInterval(() => {}, 1000)`;
  const signals = [];
  let handle;
  const io = putBackIo(run, {startStep: step => {
    if (step !== 'scenes-down') return {result: Promise.resolve({ok: true}), running: () => false, kill: () => {}};
    handle = childHandle(process.execPath, ['-e', leader]);
    return {...handle, kill: signal => { signals.push(signal); handle.kill(signal); }};
  }});
  const out = await putBack({run, io, bounds: {...SCALED, stepMs: 1_000, stepKillMs: 1_500}});
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'], 'the leader exited on SIGTERM, the descendant kept the group alive');
  assert.equal(await Promise.race([handle.exited.then(() => 'exited'), new Promise(resolve => setTimeout(resolve, 1_000, 'running'))]), 'exited');
  assert.equal(handle.running(), false, 'no process left in the group');
  assert.match(out.steps['scenes-down'].error, /its process group was stopped/);
  assert.equal(out.steps['front-app'].ok, true, 'the next steps ran only after the group was empty');
});

test('putBack: after a failed step, a probe launch never resolved is waited for (bounded); one still running blocks every later step', async () => {
  const probe = {pid: 920, ppid: 1, uid: 501, start: T, command: `${BUNDLE}/Contents/MacOS/cua-engine --probe input-source ${ABC}`};
  const make = exitsAfter => {
    const run = scratch();
    saveFrontmost(run, {pid: 77, bundleId: 'com.apple.Terminal'});
    fs.writeFileSync(join(run, 'input.json'), JSON.stringify({savedAt: 't0', source: {id: ABC}, perContext: false}));
    let polls = 0;
    const signals = [];
    const io = putBackIo(run, {savedInputSource: join(run, 'input.json'), probe: () => { throw new Error('the input-source probe did not finish within 60 s'); },
      journal: () => [{kind: 'probe', pid: null, start: null, label: 'input-source#1'}], processes: () => (++polls > exitsAfter ? [] : [probe]),
      signal: (pid, signal) => signals.push(signal)});
    return {io, signals, run};
  };
  const exits = make(3);
  const out = await putBack({run: exits.run, io: exits.io, bounds: SCALED});
  assert.deepEqual(exits.signals, [], 'a probe never identified is not signaled');
  assert.deepEqual(out.steps['input-source'].probeWait, {unresolved: 1, waited: true, remaining: 0});
  assert.ok(exits.io.order.includes('reactivate com.apple.Terminal'));
  const stays = make(Infinity);
  const blocked = await putBack({run: stays.run, io: stays.io, bounds: SCALED});
  assert.equal(blocked.steps['input-source'].probeWait.remaining, 1);
  assert.match(blocked.manual, /probe/);
  assert.match(blocked.steps['front-app'].skipped, /not run/);
  assert.ok(!stays.io.order.includes('reactivate com.apple.Terminal'));
});

// A recovery device: processes by pid with their start times, the journal as the run left it, signals recorded.
function recoveryIo(run, {rows, journal, onSignal = () => {}, runs = (pid, alive) => alive.has(pid), extra = {}}) {
  const alive = new Set(rows.map(r => r.pid)), signals = [];
  const io = putBackIo(run, {journal: () => journal, processes: () => rows.filter(r => alive.has(r.pid)),
    signal: (pid, signal) => { signals.push(`${signal} ${pid}`); onSignal(pid, signal, alive, journal); },
    processRuns: pid => runs(pid, alive), ...extra});
  return {io, alive, signals};
}
const row = (pid, command, start = T) => ({pid, ppid: 1, uid: 501, start, command});

test('recover: only journaled processes with their start time are stopped, a scene startup awaited, a probe journaled meanwhile stopped, the rest listed; then the put-back', async () => {
  const run = scratch();
  const rows = [row(300, 'node scripts/native-matrix/live-device.mjs paste --run /r'), row(301, 'node scripts/repl-parity/scenes-mac.mjs up textedit --run /r'),
    row(302, 'node /c/bin/cua.mjs serve'), row(303, 'node scripts/native-matrix/live-device.mjs menu --run /another'),
    row(304, 'node scripts/native-matrix/live-device.mjs paste --run /r', 'Tue Oct 21 11:00:00 2026'),
    row(310, `${BUNDLE}/Contents/MacOS/cua-engine --probe keystroke --user-pid 600 rk`)];
  const journal = [{kind: 'cli', pid: 300, start: T, label: 'live-device.mjs paste'}, {kind: 'cli', pid: 301, start: T, label: 'scenes-mac.mjs up'},
    {kind: 'cli', pid: 302, start: T, label: 'vendor serve'}, {kind: 'cli', pid: 304, start: T, label: 'live-device.mjs paste'}];
  let upPolls = 0;
  const {io, signals} = recoveryIo(run, {rows, journal,
    onSignal: (pid, signal, alive, j) => {
      // The paste CLI had journaled a probe as it was stopped.
      if (pid === 300) { alive.delete(300); j.push({kind: 'probe', pid: 310, start: T, label: 'keystroke'}); }
      if (pid === 310 || signal === 'SIGKILL') alive.delete(pid);
    },
    runs: (pid, alive) => { if (pid === 301 && ++upPolls > 3) alive.delete(301); return alive.has(pid); }});
  const out = await recover({run, io, bounds: SCALED});
  assert.deepEqual(signals, ['SIGTERM 300', 'SIGTERM 302', 'SIGKILL 302', 'SIGTERM 310'], 'never the scene startup, another run\'s CLI or a reused pid');
  assert.deepEqual(out.killed, ['live-device.mjs paste', 'vendor serve', 'keystroke']);
  assert.deepEqual(out.awaited, [{label: 'scenes-mac.mjs up', exited: true}]);
  assert.deepEqual(out.untouched.map(p => p.pid), [303, 304]);
  assert.deepEqual(out.survivors, []);
  assert.ok(out.putBack, 'the put-back ran once everything stopped had exited');
  assert.equal(out.ok, true);
});

test('recover: a scene startup still running after its wait, or a process that outlives SIGKILL, leaves everything unrestored with a line for the owner', async () => {
  const run = scratch();
  saveFrontmost(run, {pid: 77, bundleId: 'com.apple.Terminal'});
  const up = recoveryIo(run, {rows: [row(301, 'node scripts/repl-parity/scenes-mac.mjs up chrome --run /r')], journal: [{kind: 'cli', pid: 301, start: T, label: 'scenes-mac.mjs up'}]});
  const stuck = await recover({run, io: up.io, bounds: SCALED});
  assert.deepEqual(up.signals, [], 'a scene startup is never killed');
  assert.deepEqual(stuck.awaited, [{label: 'scenes-mac.mjs up', exited: false}]);
  assert.equal(stuck.putBack, null);
  assert.deepEqual(up.io.order, [], 'nothing restored while it may still launch');
  assert.match(stuck.manual, /scenes-mac\.mjs up .*still running/);
  assert.equal(stuck.ok, false);
  const kill = recoveryIo(run, {rows: [row(300, 'node scripts/native-matrix/live-device.mjs menu --run /r')], journal: [{kind: 'cli', pid: 300, start: T, label: 'live-device.mjs menu'}]});
  const survived = await recover({run, io: kill.io, bounds: SCALED});
  assert.deepEqual(kill.signals, ['SIGTERM 300', 'SIGKILL 300']);
  assert.deepEqual(survived.survivors, ['live-device.mjs menu']);
  assert.equal(survived.putBack, null);
  assert.equal(survived.ok, false);
});

test('recover: a probe whose pid was never resolved is waited for (any probe of the bundle, bounded) before the restore, and the wait recorded', async () => {
  const run = scratch();
  const probe = row(320, `${BUNDLE}/Contents/MacOS/cua-engine --probe input-source com.apple.keylayout.ABC`);
  let polls = 0;
  const {io, signals} = recoveryIo(run, {rows: [probe], journal: [{kind: 'probe', pid: null, start: null, label: 'input-source'}],
    extra: {processes: () => (++polls > 5 ? [] : [probe])}});
  const out = await recover({run, io, bounds: SCALED});
  assert.deepEqual(signals, [], 'a probe never identified is not signaled');
  assert.equal(out.probeWait.waited, true);
  assert.equal(out.probeWait.remaining, 0);
  assert.ok(out.putBack);
  const stays = recoveryIo(run, {rows: [probe], journal: [{kind: 'probe', pid: null, start: null, label: 'input-source'}]});
  const blocked = await recover({run, io: stays.io, bounds: SCALED});
  assert.equal(blocked.probeWait.remaining, 1);
  assert.equal(blocked.putBack, null);
  assert.match(blocked.manual, /probe/);
});

// A probe device: the process table the probe appears in once launched, its output file written at the launch.
function probeDevice({identified = true, exits = true, killable = true, alongside = [], journalAtLaunch = null} = {}) {
  const launched = [], killed = [], atLaunch = [];
  let running = false, polls = 0;
  const probeRow = {pid: 900, ppid: 1, uid: process.getuid(), start: T, command: `${BUNDLE}/Contents/MacOS/cua-engine --probe input-source current`};
  const older = {...probeRow, pid: 800};
  return {launched, killed, atLaunch, options: {
    exec: (command, args) => {
      if (journalAtLaunch) atLaunch.push(fs.readFileSync(join(journalAtLaunch, JOURNAL_FILE), 'utf8'));
      launched.push(args); running = true; fs.writeFileSync(args[args.indexOf('--stdout') + 1], '{"id":"com.apple.keylayout.ABC"}\n'); return '';
    },
    table: () => [older, ...(running && identified ? [probeRow] : []), ...(running ? alongside : [])],
    alive: pid => pid === 900 && running && !(exits && ++polls > 2),
    kill: (pid, signal) => { killed.push(`${signal} ${pid}`); if (killable) running = false; },
    sleep: () => {}, now: (() => { let t = 0; return () => (t += 1_000); })()}};
}

const journalOf = run => parseJournal(fs.readFileSync(join(run, JOURNAL_FILE), 'utf8'));
test('runProbe: journaled pending before its open, launched without -W, resolved to the one new probe of the bundle and awaited to its exit', () => {
  const run = scratch(), device = probeDevice({journalAtLaunch: run});
  assert.deepEqual(runProbe(BUNDLE, ['input-source', 'current'], {...device.options, run}), {id: 'com.apple.keylayout.ABC'});
  assert.ok(!device.launched[0].includes('-W'));
  assert.deepEqual(device.launched[0].slice(0, 2), ['-n', '-g']);
  assert.match(device.atLaunch[0], /^probe\tpending\t-\tinput-source#[0-9a-f]+\n$/, 'the launch is in the journal before open runs');
  const [pending, resolved] = journalOf(run);
  assert.equal(resolved.label, pending.label, 'one launch, one label');
  assert.deepEqual({pid: resolved.pid, start: resolved.start}, {pid: 900, start: T}, 'the older probe is not this one');
  // No new probe, or more than one new probe of the bundle (whatever their names): unresolved, nothing to signal.
  for (const options of [{identified: false}, {alongside: [{pid: 901, ppid: 1, uid: process.getuid(), start: T, command: `${BUNDLE}/Contents/MacOS/cua-engine --probe keystroke rk`}]}]) {
    const unresolved = scratch();
    runProbe(BUNDLE, ['input-source', 'current'], {...probeDevice(options).options, run: unresolved});
    assert.deepEqual(journalOf(unresolved).map(e => e.pid), [null, null], JSON.stringify(options));
  }
});

test('launchProbe and awaitProbe: the launch returns a handle another process can await (a JSON round trip), the answer read and the scratch removed', () => {
  const run = scratch(), device = probeDevice();
  const handle = JSON.parse(JSON.stringify(launchProbe(BUNDLE, ['input-source', 'com.apple.keylayout.ABC', '--at', '1700000000000'], {...device.options, run})));
  assert.equal(handle.pid, 900);
  assert.equal(handle.command, 'input-source');
  assert.ok(fs.existsSync(handle.scratch), 'the output stays until the probe is awaited');
  assert.deepEqual(device.launched[0].slice(-5), ['--probe', 'input-source', 'com.apple.keylayout.ABC', '--at', '1700000000000']);
  assert.deepEqual(awaitProbe(handle, device.options), {id: 'com.apple.keylayout.ABC'});
  assert.ok(!fs.existsSync(handle.scratch));
  assert.deepEqual(journalOf(run).map(e => e.pid), [null, 900]);
  // A probe past its bound when awaited is killed as runProbe kills it.
  const hung = probeDevice({exits: false});
  const late = launchProbe(BUNDLE, ['input-source', 'current'], hung.options);
  assert.throws(() => awaitProbe(late, hung.options), /did not finish within 60 s; its process was stopped/);
  assert.deepEqual(hung.killed, ['SIGKILL 900']);
});

test('launchProbe: an argument is a name, a key spec (press_key\'s + chord), a number list, an input-source id or a Return; nothing else is launched', () => {
  const device = probeDevice();
  const keys = ['keystroke', '--user-pid', '600', '--user-bounds', '400,20,600,800', '--keys', 'r', 'k', 'BackSpace', 'k', 'alt+Return'];
  launchProbe(BUNDLE, keys, device.options);
  assert.deepEqual(device.launched[0].slice(-keys.length), keys);
  for (const bad of ['r k', 'a;b', '$(x)', '', 'a/b']) {
    assert.throws(() => launchProbe(BUNDLE, ['keystroke', '--keys', bad], device.options), /a probe argument is/, JSON.stringify(bad));
  }
  assert.equal(device.launched.length, 1);
});

test('probeStatus: the probe\'s own exitStatus when it is an integer; otherwise inferred from the line, as older builds need', () => {
  // Preferred: the status the probe printed, even where the inference would read the line otherwise.
  assert.equal(probeStatus({error: 'no input source with that id', exitStatus: 2}), 2);
  assert.equal(probeStatus({units: 3, exitStatus: 4, aborted: true}), 4);
  assert.equal(probeStatus({units: 3, presses: [], exitStatus: 0}), 0);
  assert.equal(probeStatus({error: 'Unknown key name \'Bogus\' in the key combination; nothing was sent', exitStatus: 5}), 5);
  // Fallback: no integer exitStatus.
  assert.equal(probeStatus({units: 2, aborted: true}), 4);
  assert.equal(probeStatus({error: 'the front window is not the named one; nothing was sent'}), 4);
  assert.equal(probeStatus({error: 'Unable to get the current keyboard layout.'}), 5);
  assert.equal(probeStatus({error: 'keystroke needs --user-pid, --user-bounds and a text'}), 64);
  assert.equal(probeStatus({units: 2, exitStatus: '0'}), 0, 'a non-integer exitStatus is ignored');
  assert.equal(probeStatus({units: 2, exitStatus: 1.5}), 0);
  assert.equal(probeStatus(undefined), null);
});

test('runProbe: a probe past its bound is killed and its exit confirmed before the error; one that will not exit is reported stuck', () => {
  const hung = probeDevice({exits: false});
  assert.throws(() => runProbe(BUNDLE, ['input-source', 'current'], hung.options), error => /did not finish within 60 s; its process was stopped/.test(error.message) && !error.stuck);
  assert.deepEqual(hung.killed, ['SIGKILL 900']);
  const stuck = probeDevice({exits: false, killable: false});
  assert.throws(() => runProbe(BUNDLE, ['input-source', 'current'], stuck.options), error => /did not exit after SIGKILL/.test(error.message) && error.stuck === true);
});

test('restoreInputSource: nothing is restored while a probe that would not exit may still switch the source', async () => {
  const dir = scratch();
  const {io} = fakeInput({current: KOREAN_2SET, saved: join(dir, 'input-source.json')});
  fs.writeFileSync(io.savedInputSource, JSON.stringify({savedAt: 't0', source: {id: ABC}, perContext: false}));
  const out = await restoreInputSource({io: {...io, probeStuck: () => 'the input-source probe (pid 900) did not exit after SIGKILL'}});
  assert.equal(out.sourceRestored, false);
  assert.match(out.skipped, /did not exit/);
  assert.equal(fs.existsSync(io.savedInputSource), true, 'the record stays for a later put-back');
});

// The paste check's device: a fake probe switching the source the fake engine's type_text reads (and posting the
// composition row's keys into the fake TextEdit when it is in front), a fake clipboard, the screen.
// The owner's windows (titles included, as a Mac with Screen Recording reads them), plus whatever a test adds.
const OWNER_WINDOWS = [{ownerPid: 50, ownerName: 'Mail', ownerBundleId: 'com.apple.mail', layer: 0, number: 900, name: 'Inbox — private subject', bounds: {}},
  {ownerPid: 51, ownerName: 'Dock', ownerBundleId: 'com.apple.dock', layer: 20, number: 901, name: null, bounds: {}}];
const PRIVACY_ALERT = {ownerPid: 77, ownerName: 'UserNotificationCenter', ownerBundleId: 'com.apple.UserNotificationCenter', layer: 8, number: 950, name: 'secret title', bounds: {}};
function pasteDevice({clipboardAfter = null, selectKorean = true, perContext = false, alertAfter = null, compose = keys => (keys === 'rk' ? '가' : keys), frontStaysFinder = false, pressFlags = 0} = {}) {
  const file = join(scratch(), 'input-source.json');
  const {state: input, io: inputIo} = fakeInput({perContext, select: id => (id === KOREAN_2SET && !selectKorean ? ABC : id)});
  let clipboard = 'owner digest';
  const screen = {windows: [...OWNER_WINDOWS], front: FINDER};
  // Under the per-context preference the probe's selection stays in the probe's own context: the engine still reads ABC.
  const client = fakeEngine({source: () => (input.perContext ? ABC : input.current)});
  const probes = [];
  const probe = args => {
    if (args[0] !== 'keystroke') return inputIo.probe(args);
    probes.push(args);
    if (screen.front !== TEXTEDIT) return {error: 'the front window is not the named one; nothing was sent'};
    const text = args.at(-1), mode = args.includes('--key-codes-only') ? 'keyCodesOnly' : args.includes('--ansi-keys') ? 'ansiKeys' : 'typed';
    client.state.value += text === '\n' ? '\n' : compose(text, {mode});
    return {pid: 31, layout: 'com.apple.keylayout.2SetHangul', mode, presses: [...text].map(c => ({keyCode: c.charCodeAt(0), flags: mode === 'ansiKeys' ? 0 : pressFlags, unicode: mode === 'typed' ? c : null})),
      postedAt: 1, units: [...text].length, chars: text.length};
  };
  const io = deviceIo({...inputIo, probe, savedInputSource: file, clipboard: () => clipboard, windows: () => structuredClone(screen.windows),
    activate: async id => { if (id === 'textedit' && !frontStaysFinder) screen.front = TEXTEDIT; return {ok: true}; },
    frontmost: () => ({pid: screen.front.pid, bundleId: screen.front === TEXTEDIT ? 'com.apple.TextEdit' : 'com.apple.finder'}),
    frontWindow: () => ({topWindow: {ownerPid: screen.front.pid, number: screen.front.window.number, bounds: screen.front.window.bounds}}),
    keyboardLayout: () => ({inputSourceId: input.current, keyboardLayoutId: 'com.apple.keylayout.2SetHangul'})});
  const execute = client.execute.bind(client);
  client.execute = async (method, args, options) => {
    if (method === 'get_app_state' && args.app === PRIVACY_ALERT.ownerBundleId) {
      client.calls.push({method, args, options});
      return {result: {app: {pid: 77}, nodes: [{role: 'AXStaticText', value: '“cua Engine” would like to paste from “Finder”.'}, {role: 'AXButton', title: 'Allow Paste'},
        {role: 'AXButton', title: 'Don’t Allow Paste'}], screenshot: null}, engineMs: 1};
    }
    const out = await execute(method, args, options);
    if (method === alertAfter) screen.windows.push(PRIVACY_ALERT);
    return out;
  };
  if (clipboardAfter) {
    const inner = client.execute;
    client.execute = async (method, args, options) => { const out = await inner(method, args, options); if (method === 'paste') clipboard = clipboardAfter; return out; };
  }
  return {io, client, input, file, screen, probes};
}
const pasteRun = device => pasteCheck({record: TEXTEDIT, user: FINDER, client: device.client, io: device.io, screenshots: join(scratch(), 'shots')});

test('pasteCheck: plain and Markdown pastes behind the user window, type_text pasting under a met Korean precondition, the source back, the clipboard\'s types unchanged', async () => {
  const device = pasteDevice();
  const out = await pasteRun(device);
  assert.equal(out.verdict.pass, true, JSON.stringify(out));
  assert.equal(out.verdict.typeText, 'measured');
  assert.deepEqual(out.steps.precondition, {selected: true, readBack: KOREAN_2SET, perContextOff: true, met: true});
  assert.equal(out.steps.pasteAlert, false);
  const sent = device.client.calls.filter(c => !['get_app_state'].includes(c.method)).map(c => c.method);
  assert.deepEqual(sent.slice(0, 6), ['select_text', 'paste', 'select_text', 'paste', 'select_text', 'type_text']);
  assert.deepEqual(device.client.calls.filter(c => c.method === 'select_text').map(c => c.args.text), PASTE_TARGETS);
  assert.ok(device.client.calls.filter(c => c.method === 'paste' || c.method === 'type_text').every(c => c.options.deadlineMs === PASTE_DEADLINE_MS));
  assert.deepEqual(out.steps.userInFront, [true, true, true]);
  assert.equal(device.input.current, ABC, 'the owner\'s source is back');
  assert.equal(fs.existsSync(device.file), true, 'kept for the put-back to verify');
  assert.deepEqual(out.steps.clipboard, {typesUnchanged: true});
  assert.doesNotMatch(JSON.stringify(out), /Line 0|owner digest|private subject|Mail|com\.apple\.mail/, 'no document text, no clipboard content, nothing of the owner\'s windows');
});

// Unicode strings first (today's keys), then the layout's key codes alone, then the fixed ANSI keys; each variant's
// reading its own.
const KEYED = (keys, {mode}) => (keys !== 'rk' ? keys : {typed: '가', keyCodesOnly: 'rk', ansiKeys: 'ㄱㅏ'}[mode]);

test('hidComposition: inside the Korean window, three variants, each from an emptied document with TextEdit in front, r and k posted under the guard, read back before and after the commit', async () => {
  const device = pasteDevice({compose: KEYED});
  const {hidComposition: row} = (await pasteRun(device)).steps;
  assert.deepEqual(Object.keys(row.variants), [...COMPOSITION_VARIANTS]);
  assert.deepEqual(COMPOSITION_VARIANTS, ['unicode', 'keyCodesOnly', 'ansiKeys']);
  const b = TEXTEDIT.window.bounds, named = ['--user-pid', String(TEXTEDIT.pid), '--user-bounds', `${b.x},${b.y},${b.width},${b.height}`];
  assert.deepEqual(device.probes, [['keystroke', ...named, 'rk'], ['keystroke', ...named, '\n'],
    ['keystroke', '--key-codes-only', ...named, 'rk'], ['keystroke', '--key-codes-only', ...named, '\n'],
    ['keystroke', '--ansi-keys', ...named, 'rk'], ['keystroke', '--ansi-keys', ...named, '\n']]);
  const empties = device.client.calls.filter(c => c.method === 'set_value');
  assert.deepEqual(empties.map(c => c.args.value), ['', '', ''], 'the document emptied before each variant');
  for (const [variant, flag, mode, composed] of [['unicode', '', 'typed', '가'], ['keyCodesOnly', '--key-codes-only ', 'keyCodesOnly', 'rk'], ['ansiKeys', '--ansi-keys ', 'ansiKeys', 'ㄱㅏ']]) {
    const one = row.variants[variant];
    assert.equal(one.emptied, true, variant);
    assert.equal(one.activated, true, variant);
    assert.equal(one.source, KOREAN_2SET, variant);
    assert.deepEqual(one.layout, {inputSourceId: KOREAN_2SET, keyboardLayoutId: 'com.apple.keylayout.2SetHangul'}, variant);
    assert.equal(one.keys.invocation, `cua-engine --probe keystroke ${flag}--user-pid ${TEXTEDIT.pid} --user-bounds ${b.x},${b.y},${b.width},${b.height} rk`);
    assert.equal(one.keys.output.mode, mode, 'the probe\'s JSON as it printed it');
    assert.equal(one.keys.output.layout, 'com.apple.keylayout.2SetHangul');
    assert.equal(one.keys.exitStatus, 0);
    assert.equal(one.keys.frontChangedAfter, false);
    assert.equal(one.keysUnmodified, true);
    assert.equal(one.valueBeforeCommit, composed, `${variant}: nothing of the other variant's keys`);
    assert.equal(one.valueAfterCommit, `${composed}\n`);
    assert.deepEqual(one.reading, {reading: composed});
  }
  assert.equal(device.input.current, ABC);
  // Each reading as it comes: rk, ㄱㅏ, anything else verbatim.
  for (const [composed, reading] of [['rk', {reading: 'rk'}], ['ㄱㅏ', {reading: 'ㄱㅏ'}], ['ㄱ', {reading: 'other', verbatim: 'ㄱ\n'}]]) {
    const {variants} = (await pasteRun(pasteDevice({compose: () => composed}))).steps.hidComposition;
    for (const variant of COMPOSITION_VARIANTS) assert.deepEqual(variants[variant].reading, reading, variant);
  }
});

// The engine's intervention rule as it meets the row: the probe's keys are a user's, so each post starts a 5 s debounce
// on TextEdit; set_value inside it is refused (still interacting), and after it only once an observation taken past it
// has cleared the re-query flag (user changed).
test('hidComposition: each reset after a variant\'s keys waits out the engine\'s debounce, observes, then empties; every variant reads', async () => {
  const device = pasteDevice({compose: KEYED});
  let t = 0, lastPost = null, flag = false;
  const resets = [];
  device.io.now = () => t;
  device.io.sleep = async ms => { t += ms; };
  const probe = device.io.probe;
  device.io.probe = args => { const out = probe(args); if (args[0] === 'keystroke') { lastPost = t; flag = true; } t += 50; return out; };
  device.client.execute = (inner => async (method, args, options) => {
    t += 10;
    if (method === 'get_app_state' && lastPost !== null && t >= lastPost + INTERVENTION_DEBOUNCE_MS) flag = false;
    if (method === 'set_value' && lastPost !== null) {
      resets.push({sinceLastPost: t - lastPost});
      if (t < lastPost + INTERVENTION_DEBOUNCE_MS) throw engineError('userIntervened', "The user is still interacting with 'TextEdit'. Wait 5 seconds and retry.");
      if (flag) throw engineError('userIntervened', "The user changed 'TextEdit'. Get the app's state again.");
    }
    return inner(method, args, options);
  })(device.client.execute);
  const {variants} = (await pasteRun(device)).steps.hidComposition;
  for (const [variant, composed] of [['unicode', '가'], ['keyCodesOnly', 'rk'], ['ansiKeys', 'ㄱㅏ']]) {
    assert.equal(variants[variant].emptied, true, variant);
    assert.deepEqual(variants[variant].reading, {reading: composed}, variant);
    assert.equal(variants[variant].complete, true, variant);
  }
  assert.equal(variants.unicode.debounceWaitMs, undefined, 'nothing to wait for before the first post');
  assert.ok(variants.keyCodesOnly.debounceWaitMs > 0 && variants.ansiKeys.debounceWaitMs > 0);
  assert.equal(resets.length, 2);
  assert.ok(resets.every(r => r.sinceLastPost >= INTERVENTION_DEBOUNCE_MS), JSON.stringify(resets));
  assert.ok(COMPOSITION_QUIET_MS > INTERVENTION_DEBOUNCE_MS);
});

test('hidComposition: a reset the engine still refuses is kept as the variant\'s error, and nothing is posted on that document', async () => {
  const device = pasteDevice({compose: KEYED});
  let posted = false;
  const probe = device.io.probe;
  device.io.probe = args => { if (args[0] === 'keystroke') posted = true; return probe(args); };
  device.client.execute = (inner => async (method, args, options) => {
    if (method === 'set_value' && posted) throw engineError('userIntervened', "The user is still interacting with 'TextEdit'. Wait 5 seconds and retry.");
    return inner(method, args, options);
  })(device.client.execute);
  const {variants} = (await pasteRun(device)).steps.hidComposition;
  assert.equal(variants.unicode.complete, true);
  for (const variant of ['keyCodesOnly', 'ansiKeys']) {
    assert.equal(variants[variant].skipped, 'the scene document could not be emptied', variant);
    assert.equal(variants[variant].emptyError.errorName, 'userIntervened', variant);
  }
  assert.equal(device.probes.length, 2, 'only the first variant\'s keys and commit');
});

test('hidComposition: a commit that was not posted leaves the variant incomplete, its reading the value before the commit', async () => {
  const device = pasteDevice({compose: KEYED});
  device.io.probe = (inner => args => (args[0] === 'keystroke' && args.at(-1) === '\n' ? {error: 'the front window is not the named one; nothing was sent'} : inner(args)))(device.io.probe);
  const {variants} = (await pasteRun(device)).steps.hidComposition;
  for (const variant of COMPOSITION_VARIANTS) {
    assert.equal(variants[variant].complete, false, variant);
    assert.equal(variants[variant].commit.exitStatus, 4, variant);
  }
  assert.deepEqual(variants.unicode.reading, {reading: '가'});
});

test('hidComposition: keys the layout put under a modifier read as not unmodified; the fixed ANSI keys never are', async () => {
  const {variants} = (await pasteRun(pasteDevice({pressFlags: 524288}))).steps.hidComposition;
  assert.deepEqual(COMPOSITION_VARIANTS.map(variant => variants[variant].keysUnmodified), [false, false, true]);
});

test('hidComposition: a variant whose document could not be emptied posts nothing and says so; the other still reads', async () => {
  const device = pasteDevice({compose: KEYED});
  let empties = 0;
  device.client.execute = (inner => async (method, args, options) => {
    if (method === 'set_value' && ++empties === 2) { device.client.calls.push({method, args, options}); return {result: route(1), engineMs: 1}; }
    return inner(method, args, options);
  })(device.client.execute);
  const {variants} = (await pasteRun(device)).steps.hidComposition;
  assert.deepEqual(variants.unicode.reading, {reading: '가'});
  assert.equal(variants.keyCodesOnly.emptied, false);
  assert.equal(variants.keyCodesOnly.skipped, 'the scene document could not be emptied');
  assert.deepEqual(device.probes.map(args => args[1]), ['--user-pid', '--user-pid', '--ansi-keys', '--ansi-keys'], 'no key-codes-only key on a document that was not empty');
  assert.deepEqual(variants.ansiKeys.reading, {reading: 'ㄱㅏ'}, 'the next variant empties its own document and reads');
});

test('hidComposition: with TextEdit not in front nothing is posted, each variant says why', async () => {
  const device = pasteDevice({frontStaysFinder: true});
  const {hidComposition: row} = (await pasteRun(device)).steps;
  for (const variant of COMPOSITION_VARIANTS) assert.equal(row.variants[variant].skipped, 'front app not the scene', variant);
  assert.deepEqual(device.probes, [], 'no HID key while another app is in front');
});

test('pasteCheck: a per-context preference read on is turned off for the Korean window and restored with the source', async () => {
  const device = pasteDevice({perContext: true});
  const out = await pasteRun(device);
  assert.deepEqual(device.input.writes, [false, true], 'off before Korean is selected, back on after');
  assert.deepEqual(out.steps.inputSource.perContext, {read: true, setOff: true, restored: true});
  assert.equal(out.steps.typeText.route, 'paste', 'with the preference off the engine sees Korean');
  assert.equal(device.input.current, ABC);
});

test('pasteCheck: an unmet Korean precondition leaves type_text and the composition row unmeasured; a met one that keys is the engine finding', async () => {
  const unmet = await pasteRun(pasteDevice({selectKorean: false}));
  assert.equal(unmet.steps.precondition.met, false);
  assert.match(unmet.verdict.typeText, /^precondition unmet: Korean 2-Set was not selected; the source reads back com\.apple\.keylayout\.ABC$/);
  assert.match(unmet.steps.hidComposition.skipped, /^precondition unmet/);
  assert.equal(unmet.verdict.finding, null);
  const keyed = pasteDevice();
  keyed.client.execute = (inner => async (method, args, options) => (method === 'type_text' ? {result: route("2'"), engineMs: 1} : inner(method, args, options)))(keyed.client.execute);
  const out = await pasteRun(keyed);
  assert.equal(out.steps.typeText.route, "2'");
  assert.equal(out.steps.typeText.sourceAfter, KOREAN_2SET);
  assert.match(out.verdict.finding, /^engine finding: type_text keyed \(route 2'\)/);
});

test('pasteCheck: a privacy alert after the first paste aborts the section unclicked; only the alert process is read; the export is sanitized', async () => {
  const device = pasteDevice({alertAfter: 'paste', perContext: true});
  const out = await pasteRun(device);
  assert.equal(out.steps.pasteAlert, true);
  assert.deepEqual(out.steps.alert, {at: 'after text', alerts: [{bundleId: 'com.apple.UserNotificationCenter', layer: 8, isAlertProcess: true}], keywords: [],
    unknown: {count: 0, windows: []}, text: '“cua Engine” would like to paste from “Finder”. | Allow Paste | Don’t Allow Paste'});
  assert.match(out.problem, /alert/);
  assert.ok(out.verdict.failed.includes('noPasteAlert'));
  assert.deepEqual(device.client.calls.filter(c => c.method !== 'get_app_state').map(c => c.method), ['select_text', 'paste'], 'nothing after the alert, and never a click');
  const reads = device.client.calls.filter(c => c.method === 'get_app_state' && c.args.app !== TEXTEDIT.app);
  assert.deepEqual(reads.map(c => [c.args.app, c.args.includeScreenshot]), [['com.apple.UserNotificationCenter', false]]);
  assert.equal(device.input.perContext, true, 'the section stopped before the preference was touched');
  assert.doesNotMatch(JSON.stringify(out), /secret title|ownerPid|"number"/);
});

test('pasteCheck: an unknown new window aborts the section but leaves only its layer; its owner is never observed', async () => {
  const device = pasteDevice();
  const inner = device.client.execute;
  device.client.execute = async (method, args, options) => {
    const out = await inner(method, args, options);
    if (method === 'paste') device.screen.windows.push({ownerPid: 88, ownerName: 'Slack', ownerBundleId: 'com.tinyspeck.slackmacgap', layer: 3, number: 960, name: 'DM from someone', bounds: {}});
    return out;
  };
  const out = await pasteRun(device);
  assert.deepEqual(out.steps.alert, {at: 'after text', alerts: [], keywords: [], unknown: {count: 1, windows: [{layer: 3, isAlertProcess: false}]}, text: null});
  assert.deepEqual(device.client.calls.filter(c => c.method !== 'get_app_state').map(c => c.method), ['select_text', 'paste']);
  assert.ok(!device.client.calls.some(c => c.args?.app === 'com.tinyspeck.slackmacgap'));
  assert.doesNotMatch(JSON.stringify(out), /Slack|DM from|tinyspeck/);
  // A window that was already there before the section is the baseline, not an alert.
  const quiet = pasteDevice();
  quiet.screen.windows.push({ownerPid: 88, ownerName: 'Slack', ownerBundleId: 'com.tinyspeck.slackmacgap', layer: 3, number: 960, name: 'DM', bounds: {}});
  assert.equal((await pasteRun(quiet)).steps.pasteAlert, false);
});

test('pasteCheck: a paste step that outlives its bound aborts the section; the source is restored', async () => {
  const device = pasteDevice({perContext: true});
  const inner = device.client.execute;
  device.client.execute = async (method, args, options) => {
    if (method === 'type_text') throw Object.assign(new Error('The engine did not answer execute within 25000 ms'), {name: 'SkyComputerUseTransportError'});
    return inner(method, args, options);
  };
  const out = await pasteRun(device);
  assert.match(out.problem, /did not answer/);
  assert.equal(out.steps.typeText.ok, false);
  assert.equal(device.input.current, ABC);
  assert.equal(device.input.perContext, true);
});

test('pasteCheck: a clipboard whose types changed fails its topology check', async () => {
  const out = await pasteRun(pasteDevice({clipboardAfter: 'engine digest'}));
  assert.deepEqual(out.verdict.failed, ['clipboardTypesUnchanged']);
});

test('pasteCheck: sends nothing unless the user window is in front, and an engine without paste is recorded, the source restored', async () => {
  const device = pasteDevice();
  const refused = await pasteCheck({record: TEXTEDIT, user: FINDER, client: device.client, io: {...device.io, frontmost: () => ({pid: 1})}, screenshots: join(scratch(), 'shots')});
  assert.match(refused.problem, /user window/);
  assert.deepEqual(device.client.calls, []);
  const old = pasteDevice();
  const inner = old.client.execute;
  old.client.execute = async (method, args, options) => {
    if (method === 'paste') throw engineError('unknownMethod', 'Unknown method paste');
    return inner(method, args, options);
  };
  const out = await pasteRun(old);
  assert.equal(out.steps.text.errorName, 'unknownMethod');
  assert.equal(out.verdict.pass, false);
  assert.equal(old.input.current, ABC);
});

test('probeBarrier: a probe the run journaled that still runs, or a launch never identified while a probe of the bundle runs, holds every restore; the watcher never does', () => {
  const run = scratch();
  fs.writeFileSync(join(run, 'live-watch.json'), JSON.stringify({pid: 950, dir: run}));
  const watcher = {pid: 950, ppid: 1, uid: 501, start: T, command: `${BUNDLE}/Contents/MacOS/cua-engine --probe watch-activations`};
  const probe = {pid: 910, ppid: 1, uid: 501, start: T, command: `${BUNDLE}/Contents/MacOS/cua-engine --probe input-source ${KOREAN_2SET} --at 1`};
  const io = ({journal, rows}) => ({journal: () => journal, processes: () => rows, identity: () => ({self: 200, ancestors: [], uid: 501, checkout: '/c', bundle: BUNDLE})});
  const resolved = [{kind: 'probe', pid: 910, start: T, label: 'input-source#a'}];
  assert.match(probeBarrier(run, io({journal: resolved, rows: [watcher, probe]})), /input-source#a is still running/);
  assert.equal(probeBarrier(run, io({journal: resolved, rows: [watcher]})), null, 'exited: nothing holds');
  assert.equal(probeBarrier(run, io({journal: resolved, rows: [watcher, {...probe, start: 'Wed Oct 22 10:00:00 2026'}]})), null, 'a reused pid is not the probe');
  const unresolved = [{kind: 'probe', pid: null, start: null, label: 'input-source#b'}];
  assert.match(probeBarrier(run, io({journal: unresolved, rows: [watcher, {...probe, pid: 911}]})), /never identified/);
  assert.equal(probeBarrier(run, io({journal: unresolved, rows: [watcher]})), null, 'the watcher alone holds nothing');
});

test('probe-only settlement after controller death stops only owned identities, without matrix put-back', async () => {
  const {settleProbes} = await import('../../scripts/native-matrix/live-device.mjs');
  const run = scratch(), command = `${BUNDLE}/Contents/MacOS/cua-engine --probe window-frame`;
  const rows = [row(900, command), row(901, command, 'later start'), row(902, command), row(903, 'node another-controller')];
  const journal = [900, 901].map(pid => ({kind: 'probe', pid, start: T, label: `window-frame#${pid}`}));
  journal.push({kind: 'cli', pid: 903, start: T, label: 'controller'});
  const device = recoveryIo(run, {rows, journal, onSignal: (pid, signal, alive) => { if (signal === 'SIGKILL') alive.delete(pid); }});
  const out = await settleProbes({run, io: device.io, bounds: SCALED});
  assert.equal(out.ok, true);
  assert.deepEqual(device.signals, ['SIGTERM 900', 'SIGKILL 900']);
  assert.deepEqual(device.io.order, [], 'no matrix restoration: recording has different front/state records');
  assert.deepEqual([...device.alive], [901, 902, 903]);
});

test('probe-only settlement never escalates to a reused PID, and preserves a stuck launch for later recovery', async () => {
  const {settleProbes} = await import('../../scripts/native-matrix/live-device.mjs');
  const run = scratch(), probe = row(900, `${BUNDLE}/Contents/MacOS/cua-engine --probe window-frame`);
  const journal = [{kind: 'probe', pid: 900, start: T, label: 'window-frame#1'}];
  const reused = recoveryIo(run, {rows: [probe], journal, onSignal: () => { probe.start = 'new process'; }});
  assert.equal((await settleProbes({run, io: reused.io, bounds: SCALED})).ok, true);
  assert.deepEqual(reused.signals, ['SIGTERM 900']);
  probe.start = T;
  const stuck = recoveryIo(run, {rows: [probe], journal});
  assert.equal((await settleProbes({run, io: stuck.io, bounds: SCALED})).ok, false);
  assert.deepEqual(stuck.signals, ['SIGTERM 900', 'SIGKILL 900']);
  assert.equal(journal.length, 1, 'the recovery record survives failure');
  stuck.alive.clear();
  assert.equal((await settleProbes({run, io: stuck.io, bounds: SCALED})).ok, true);
});

test('an unidentified frame probe is waited for, never signaled; failure can recover on a later cleanup', async () => {
  const {settleProbes} = await import('../../scripts/native-matrix/live-device.mjs');
  const run = scratch(), probe = row(900, `${BUNDLE}/Contents/MacOS/cua-engine --probe window-frame`);
  const journal = [{kind: 'probe', pid: null, start: null, label: 'window-frame#pending'}];
  const device = recoveryIo(run, {rows: [probe], journal});
  const blocked = await settleProbes({run, io: device.io, bounds: SCALED});
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.probeWait, {unresolved: 1, waited: true, remaining: 1});
  assert.deepEqual(device.signals, []);
  let polls = 0;
  device.io.processes = () => ++polls < 8 ? [probe] : [];
  const recovered = await settleProbes({run, io: device.io, bounds: SCALED});
  assert.equal(recovered.ok, true);
  assert.equal(recovered.probeWait.waited, true);
  assert.deepEqual(device.signals, []);
});
