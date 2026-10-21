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
import {ABC, FIRST_LINE, KOREAN_2SET, PASTE_TARGETS} from '../../scripts/native-matrix/live-checks.mjs';
import {
  PASTE, begin, enablementCheck, inputSourceCheck, menuCheck, minimizedCheck, pasteCheck, putBack, restoreInputSource, saveFrontmost, saveInputSource,
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
          const activated = args.spikeMenuActivation === true;
          // A background app's responder chain answers only under route 3's activation when the fake says so.
          if (!menuNeedsActivation || activated) {
            if (item.title === 'Select All') state.selected = state.value;
            if (item.title === 'Bold') state.markdown = state.markdown.replace(FIRST_LINE, `**${FIRST_LINE}**`);
          }
          const result = route(1);
          if (activated) result.meta.activationGuardMs = 18.5;
          return {result, engineMs: 1};
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
  assert.deepEqual(out.verdict.recorded, {typeTextValueChanged: false, superAEffect: false, scrollRefused: true});
  assert.equal(out.steps.minimize.route, 1);
  assert.deepEqual(out.steps.observe, {ok: true, treePresent: true, textArea: true, screenshotNull: true, screenshotOmitted: 'windowMinimized', engineSaysMinimized: true});
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
  assert.equal(out.verdict.recorded.scrollRefused, true);
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
  assert.deepEqual(out.verdict.recorded, {typeTextValueChanged: true, superAEffect: true, scrollRefused: true});
  assert.deepEqual(out.verdict.decision, {plainKeys: 'type_text and press_key without ⌘ stay allowed: typed text reached the minimized window',
    commandChords: '⌘ chords stay allowed: ⌘A acted with the window minimized'});
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

test('minimizedCheck: an observation of another process sends nothing at all', async () => {
  const client = fakeEngine({script: method => (method === 'get_app_state' ? {...structuredClone(GOLDEN), app: {...GOLDEN.app, pid: 1}} : undefined)});
  assert.notEqual(GOLDEN.app.pid, TEXTEDIT.pid);
  const out = await minimizedCheck({record: TEXTEDIT, client, io: deviceIo(), screenshots: join(scratch(), 'shots')});
  assert.match(out.problem, /not of the run's process/);
  assert.deepEqual(client.calls.map(c => c.method), ['get_app_state']);
});

test('menuCheck: each item through the menu-bar record and a rooted observation, its enabled state, its effect read back, the user window in front throughout', async () => {
  const client = fakeEngine({menus: MENUS});
  const watched = [];
  const io = deviceIo({watch: {start: () => { watched.push('start'); return {pid: 9}; }, stop: () => { watched.push('stop'); return [{kind: 'activated', bundleId: 'com.apple.TextEdit', pid: 600}]; }}});
  const out = await menuCheck({record: TEXTEDIT, user: FINDER, client, io, screenshots: join(scratch(), 'shots')});
  assert.deepEqual(watched, ['start', 'stop']);
  assert.equal(out.menuActivation, false);
  assert.deepEqual(out.items.selectAll, {found: true, rooted: true, enabled: true, record: {ok: true, route: 1, posted: false}, clicked: true, click: {ok: true, route: 1, posted: true},
    effect: true, userInFront: [true, true]});
  assert.ok(client.calls.filter(c => c.method === 'click').every(c => !('spikeMenuActivation' in c.args)), 'off sends no switch at all');
  assert.equal(out.items.bold.prepared, true, 'the first line was selected before Format');
  assert.equal(out.items.bold.effect, true);
  assert.equal(out.items.bold.enabled, true);
  assert.deepEqual(out.activations, [{kind: 'activated', bundleId: 'com.apple.TextEdit', scene: true}]);
  const select = client.calls.find(c => c.method === 'select_text');
  assert.equal(select.args.text, FIRST_LINE);
  assert.doesNotMatch(JSON.stringify(out), /Line 0/);
});

test('menuCheck with the switch on: only the menu item\'s press carries spikeMenuActivation; its route and guard time are recorded', async () => {
  const off = await menuCheck({record: TEXTEDIT, user: FINDER, client: fakeEngine({menus: MENUS, menuNeedsActivation: true}), io: deviceIo({watch: {start: () => ({pid: 9}), stop: () => []}}),
    screenshots: join(scratch(), 'shots')});
  assert.deepEqual([off.items.selectAll.effect, off.items.bold.effect], [false, false], 'the fake\'s background responder chain needs the activation');
  const client = fakeEngine({menus: MENUS, menuNeedsActivation: true});
  const on = await menuCheck({record: TEXTEDIT, user: FINDER, client, io: deviceIo({watch: {start: () => ({pid: 9}), stop: () => []}}), screenshots: join(scratch(), 'shots'), menuActivation: true});
  assert.equal(on.menuActivation, true);
  assert.deepEqual([on.items.selectAll.effect, on.items.bold.effect], [true, true]);
  assert.deepEqual(on.items.selectAll.click, {ok: true, route: 1, posted: true, activationGuardMs: 18.5});
  const clicks = client.calls.filter(c => c.method === 'click');
  assert.deepEqual(clicks.map(c => c.args.spikeMenuActivation === true), [false, true, false, true], 'the menu-bar record clicks carry no switch, the item presses do');
});

test('menuCheck: an item read disabled is not clicked; a submenu not exposed is recorded as not found', async () => {
  const menus = structuredClone(MENUS);
  menus.Edit[3].flags.enabled = false;
  menus.Format = menus.Format.slice(0, 3);
  const client = fakeEngine({menus});
  const out = await menuCheck({record: TEXTEDIT, user: FINDER, client, io: deviceIo({watch: {start: () => ({pid: 9}), stop: () => []}}), screenshots: join(scratch(), 'shots')});
  assert.equal(out.items.selectAll.enabled, false);
  assert.equal(out.items.selectAll.clicked, false);
  assert.equal(out.items.selectAll.effect, false);
  assert.equal(out.items.bold.found, false);
  assert.ok(!client.calls.some(c => c.method === 'click' && c.args.element === 't83'));
});

test('menuCheck: refuses to send anything unless the user window is in front', async () => {
  const client = fakeEngine({menus: MENUS});
  const out = await menuCheck({record: TEXTEDIT, user: FINDER, client, io: deviceIo({frontmost: () => ({pid: 1, bundleId: 'com.apple.Terminal'}), watch: {start: () => ({pid: 9}), stop: () => []}}),
    screenshots: join(scratch(), 'shots')});
  assert.match(out.problem, /user window/);
  assert.deepEqual(client.calls, []);
});

test('enablementCheck: two connections one after the other, each observing once, the first closed before the second opens', async () => {
  const order = [];
  const answers = [{enable: 0.3, enablementPrior: 'false', enabled: 'AXManualAccessibility', webShaped: true, chromium: true, webAreaWait: 150, webAreaFound: true},
    {enable: 0.2, enablementPrior: 'false', enabled: 'AXManualAccessibility', webShaped: true, chromium: true, webAreaWait: 140, webAreaFound: true}];
  const record = {scene: 'chrome', app: '/c/Chrome for Testing.app', pid: 800, window: {number: 3}};
  const io = deviceIo({client: () => {
    const n = order.filter(e => e.startsWith('open')).length + 1;
    order.push(`open ${n}`);
    return {async execute(method, args) {
      order.push(`${method} ${n}`);
      return {result: {app: {pid: 800}, window: {title: 'cua scene page'}, nodes: [{role: 'AXWebArea'}], screenshot: null, timings: answers[n - 1]}};
    }, close() { order.push(`close ${n}`); }};
  }});
  const out = await enablementCheck({record, io, screenshots: join(scratch(), 'shots')});
  assert.deepEqual(order, ['open 1', 'get_app_state 1', 'close 1', 'open 2', 'get_app_state 2', 'close 2']);
  assert.equal(out.verdict.released, true);
  assert.equal(out.verdict.first.set, 'AXManualAccessibility');
  assert.deepEqual(out.verdict.priors, {first: 'false', second: 'false'});
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

test('inputSourceCheck: the owner\'s source and preference saved first, Korean 2-Set selected and read back, ABC restored, the record cleared', async () => {
  const file = join(scratch(), 'input-source.json');
  const {state, io} = fakeInput();
  io.savedInputSource = file;
  const out = await inputSourceCheck({io});
  assert.equal(out.verdict.pass, true, JSON.stringify(out));
  assert.deepEqual(state.probes, ['input-source current', `input-source ${KOREAN_2SET}`, 'input-source current', 'input-source current', `input-source ${ABC}`, 'input-source current']);
  assert.equal(state.current, ABC);
  assert.equal(fs.existsSync(file), false, 'a restored record is removed');
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
  assert.equal(fs.existsSync(file), false);
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
    engineCheck: () => ({ok: true, engine: {build: 'b'}, problems: []}), frontmost: () => ({pid: 77, bundleId: 'com.apple.Terminal'}), stop: async () => { calls.push('stop'); return {wasRunning: false}; }};
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
});

test('saveFrontmost: a front app a dead run saved is kept (the current one may be a scene app)', () => {
  const run = scratch();
  saveFrontmost(run, {pid: 1, bundleId: 'com.apple.Terminal'});
  saveFrontmost(run, {pid: 600, bundleId: 'com.apple.TextEdit'});
  assert.equal(JSON.parse(fs.readFileSync(join(run, 'live-frontmost.json'), 'utf8')).bundleId, 'com.apple.Terminal');
});

test('putBack: every planned step runs whatever the one before answered, in order, and the front app comes back last', async () => {
  const run = scratch(), order = [];
  fs.writeFileSync(join(run, 'scenes.json'), JSON.stringify({scenes: {textedit: TEXTEDIT, finder: FINDER}}));
  saveFrontmost(run, {pid: 77, bundleId: 'com.apple.Terminal'});
  const savedInput = join(run, 'input-source.json');
  fs.writeFileSync(savedInput, JSON.stringify({savedAt: 't0', source: {id: ABC}, perContext: false}));
  const {io: input} = fakeInput({current: KOREAN_2SET});
  const io = {...input, savedInputSource: savedInput,
    goldensSteps: async args => { order.push(args.join(' ')); throw new Error('the run\'s Finder window could not be observed'); },
    scenes: async args => { order.push(args.join(' ')); return {down: true}; },
    stop: async () => { order.push('engine-stop'); return {wasRunning: true}; },
    runningApps: bundleId => { order.push(`running ${bundleId}`); return []; },
    reactivate: async front => { order.push(`reactivate ${front.bundleId}`); return {reactivated: true, inFront: true}; },
    frontmost: () => ({pid: 77, bundleId: 'com.apple.Terminal'})};
  const out = await putBack({run, io});
  assert.deepEqual(out.plan, ['finder-teardown', 'scenes-down', 'input-source', 'engine-stop', 'apps-check', 'front-app']);
  assert.deepEqual(order.filter(o => !o.startsWith('running')), [`steps finder --run ${run} --phase teardown`, `down all --run ${run}`, 'engine-stop', 'reactivate com.apple.Terminal']);
  assert.match(out.steps['finder-teardown'].error, /could not be observed/);
  assert.equal(out.steps['input-source'].sourceRestored, true);
  assert.deepEqual(out.steps['apps-check'], {ok: true, running: {textedit: 0, chromeForTesting: 0, electronFixture: 0}});
  assert.deepEqual(out.steps['front-app'], {ok: true, bundleId: 'com.apple.Terminal', reactivated: true, inFront: true});
  assert.equal(out.ok, false, 'a failed step leaves the put-back incomplete');
  assert.equal(fs.existsSync(join(run, 'live-frontmost.json')), false, 'the front app once back, its record goes');
});

test('putBack: the owner\'s Chrome in front is never activated; a scene app still running fails the apps check', async () => {
  const run = scratch();
  saveFrontmost(run, {pid: 5, bundleId: 'com.google.Chrome'});
  const io = {savedInputSource: join(run, 'none.json'), scenes: async () => ({down: true}), stop: async () => ({wasRunning: false}),
    runningApps: bundleId => (bundleId === 'com.apple.TextEdit' ? [{pid: 600, bundleId}] : []),
    reactivate: async () => { throw new Error('never called'); }, frontmost: () => ({pid: 6, bundleId: 'com.apple.finder'})};
  const out = await putBack({run, io});
  assert.equal(out.steps['front-app'].reactivated, false);
  assert.match(out.steps['front-app'].reason, /never touched/);
  assert.equal(out.steps['apps-check'].ok, false);
  assert.equal(out.steps['apps-check'].running.textedit, 1);
});

// The paste check's device: a fake probe switching the source the fake engine's type_text reads, a fake clipboard.
function pasteDevice({clipboardAfter = null, selectKorean = true} = {}) {
  const file = join(scratch(), 'input-source.json');
  const {state: input, io: inputIo} = fakeInput({select: id => (id === KOREAN_2SET && !selectKorean ? ABC : id)});
  let clipboard = 'owner digest';
  const io = deviceIo({...inputIo, savedInputSource: file, clipboard: () => clipboard});
  const client = fakeEngine({source: () => input.current});
  if (clipboardAfter) {
    const execute = client.execute.bind(client);
    client.execute = async (method, args, options) => { const out = await execute(method, args, options); if (method === 'paste') clipboard = clipboardAfter; return out; };
  }
  return {io, client, input, file};
}

test('pasteCheck: plain and Markdown pastes replace a selected line behind the user window, type_text pastes under Korean 2-Set, the source and the clipboard are back', async () => {
  const {io, client, input, file} = pasteDevice();
  const out = await pasteCheck({record: TEXTEDIT, user: FINDER, client, io, screenshots: join(scratch(), 'shots')});
  assert.equal(out.verdict.pass, true, JSON.stringify(out));
  assert.deepEqual(out.verdict.recorded, {markdownBold: true, entered: PASTE.typed.length});
  const sent = client.calls.filter(c => c.method !== 'get_app_state');
  assert.deepEqual(sent.map(c => c.method), ['select_text', 'paste', 'select_text', 'paste', 'select_text', 'type_text']);
  assert.deepEqual(sent.filter(c => c.method === 'select_text').map(c => c.args.text), PASTE_TARGETS);
  assert.deepEqual(sent.filter(c => c.method === 'paste').map(c => [c.args.format, c.args.text]), [['text', PASTE.text], ['md', PASTE.markdown]]);
  assert.equal(out.steps.typeText.route, 'paste');
  assert.deepEqual(out.steps.userInFront, [true, true, true]);
  assert.equal(input.current, ABC, 'the owner\'s source is back');
  assert.equal(fs.existsSync(file), false);
  assert.deepEqual(out.steps.clipboard, {same: true});
  assert.doesNotMatch(JSON.stringify(out), /Line 0|owner digest/, 'no document text, no clipboard content');
});

test('pasteCheck: a clipboard left changed and a type_text that keyed fail their expectations; the source is restored all the same', async () => {
  const {io, client, input} = pasteDevice({clipboardAfter: 'engine digest', selectKorean: false});
  const out = await pasteCheck({record: TEXTEDIT, user: FINDER, client, io, screenshots: join(scratch(), 'shots')});
  assert.deepEqual(out.verdict.failed, ['typeTextPasteRoute', 'typeTextLands', 'clipboardRestored']);
  assert.equal(out.steps.inputSource.selected, false);
  assert.equal(input.current, ABC);
});

test('pasteCheck: sends nothing unless the user window is in front, and an engine without paste stops it with the source restored', async () => {
  const {io, client} = pasteDevice();
  const refused = await pasteCheck({record: TEXTEDIT, user: FINDER, client, io: {...io, frontmost: () => ({pid: 1})}, screenshots: join(scratch(), 'shots')});
  assert.match(refused.problem, /user window/);
  assert.deepEqual(client.calls, []);
  const old = pasteDevice();
  const execute = old.client.execute.bind(old.client);
  old.client.execute = async (method, args, options) => {
    if (method === 'paste') throw engineError('unknownMethod', 'Unknown method paste');
    return execute(method, args, options);
  };
  const out = await pasteCheck({record: TEXTEDIT, user: FINDER, client: old.client, io: old.io, screenshots: join(scratch(), 'shots')});
  assert.equal(out.steps.text.errorName, 'unknownMethod');
  assert.equal(out.verdict.pass, false);
  assert.equal(old.input.current, ABC);
});
