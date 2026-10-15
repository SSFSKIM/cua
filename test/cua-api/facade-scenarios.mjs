// The facade scenarios: each runs one Table 1 behaviour of the cua facade's modules through ./facade-harness.mjs and
// checks its record (`check`); ./facade-vendor.test.mjs also runs each against the vendor's readable facade and
// requires the same record, unless the scenario declares a deliberate difference (`differs`, with the Table 2 row).
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {skyDouble, tabDouble} from './facade-harness.mjs';

const writes = record => record.log.filter(entry => 'write' in entry).map(entry => [entry.write, entry.text]);
const calls = record => record.log.filter(entry => 'call' in entry).map(entry => entry.args === undefined ? [entry.call] : [entry.call, ...entry.args]);
const images = record => record.log.filter(entry => 'image' in entry).map(entry => entry.image);
const PNG_URL = `data:image/png;base64,${Buffer.from([9, 8, 7]).toString('base64')}`;
const DOM_ONLY_INPUT = 'This tab does not support accessibility input. Use its Playwright API.';
const ELEMENT_INDEX = 'Browser input requires an element index from the latest AX snapshot, or null to use current focus.';
const sync = message => ({sync: {error: 'Error', message}});
const rejected = message => ({rejected: {error: 'Error', message}});

// A rendered Linux window: a frame whose panel holds a labelled button, two plain texts and a disabled entry.
const linuxTree = () => ({id: 'n1', native_id: 'at:1', role: 'frame', name: 'Editor', states: ['enabled'], actions: [], children: [
  {id: 'n2', role: 'panel', states: ['enabled'], actions: [], children: [
    {id: 'n3', role: 'push button', name: 'Save', description: 'Save the file', states: ['enabled', 'focusable', 'focused'], actions: ['press', 'showContextMenu'], children: []},
    {id: 'n4', role: 'label', name: 'Line 1', states: ['enabled'], children: []},
    {id: 'n5', role: 'label', name: 'Col 2\tok', states: ['enabled'], children: []},
    {id: 'n6', role: 'entry', name: 'Find', value: 'x'.repeat(120), states: ['editable', 'focusable'], actions: ['activate'], children: []},
  ]},
  {id: 'n7', role: 'filler', states: ['enabled'], children: []},
]});

const linuxWindow = {id: 7, app: 'gedit', title: 'Untitled'};
const linuxSky = (ctx, f, {screenshots = [{bytes: Uint8Array.from([5, 6])}]} = {}) => skyDouble(ctx, 'linux', {
  get_window_state: request => ({window: {...request.window, title: 'Refreshed'}, ax_tree_source: 'at_spi', ax_tree: f.accessibility_tree(linuxTree()),
    screenshots: request.include_screenshot ? screenshots : []}),
});

function browserFixture(ctx, f, {id = 'b1', tabs = [{id: 't1', title: 'One', url: 'https://one.test/'}], userTabs = [], tabKind = 'ax', noNew = false, noGoto = false,
  capabilities = true, nameSession = true, documentation = `DOC ${id}`} = {}) {
  const log = (call, ...args) => ctx.log(args.length ? {call: `${id}.${call}`, args} : {call: `${id}.${call}`});
  const tab = tabId => f.bind_tab(tabDouble(ctx, {id: tabId, kind: tabKind, state: `STATE ${tabId}`,
    extra: {...(noGoto ? {} : {goto: async url => log(`${tabId}.goto`, url)}), close: async () => log(`${tabId}.close`)}}));
  return {
    browserId: id,
    documentation: async () => { log('documentation'); return documentation; },
    tabs: {
      list: async () => { log('tabs.list'); return structuredClone(tabs); },
      get: async tabId => { log('tabs.get', tabId); return tab(tabId); },
      ...(noNew ? {} : {new: async () => { log('tabs.new'); return tab('new1'); }}),
    },
    user: {
      openTabs: async () => { log('user.openTabs'); if (userTabs instanceof Error) throw userTabs; return structuredClone(userTabs); },
      claimTab: async info => { log('user.claimTab', info); return tab(info.id); },
    },
    ...(nameSession ? {nameSession: async name => log('nameSession', name)} : {}),
    ...(capabilities ? {capabilities: {get: async name => { log('capabilities.get', name); return {set: async value => log(`${name}.set`, value)}; }}} : {}),
  };
}

function browsersFixture(ctx, list, byId, {getDefault = true, getForUrl = true} = {}) {
  return {
    list: async () => { ctx.log({call: 'browsers.list'}); return structuredClone(list); },
    get: async id => { ctx.log({call: 'browsers.get', args: [id]}); if (!byId[id]) throw new Error(`no browser ${id}`); return byId[id]; },
    ...(getDefault ? {getDefault: async () => { ctx.log({call: 'browsers.getDefault'}); return Object.values(byId)[0]; }} : {}),
    ...(getForUrl ? {getForUrl: async url => { ctx.log({call: 'browsers.getForUrl', args: [url]}); return Object.values(byId)[0]; }} : {}),
  };
}

// The emitter over a documentation double whose reads are logged.
function emitterFixture(ctx, f) {
  return f.create_bootstrap_emitter({
    read_core: async () => { ctx.log({call: 'docs.read_core'}); return 'CORE'; },
    read: async name => { ctx.log({call: 'docs.read', args: [name]}); return `DOC:${name}`; },
  });
}

function browserApi(ctx, f, options = {}) {
  const b1 = browserFixture(ctx, f, options.b1);
  const b2 = browserFixture(ctx, f, {id: 'b2', ...options.b2});
  const list = options.list ?? [{id: 'b1', type: 'extension', metadata: {extensionInstanceId: 'inst-1'}}, {id: 'b2', type: 'extension', metadata: {extensionInstanceId: 'inst-2'}}];
  const emitter = emitterFixture(ctx, f);
  return f.create_browser_api(browsersFixture(ctx, list, {b1, b2}, options.browsers), emitter);
}

const mention = (fields, user = 'chrome') => `plugin://${user}@openai-bundled?${new URLSearchParams({mention: 'tab-v1', browserId: 'inst-1', tabId: 'p9', title: 'Nine', url: 'https://nine.test/', ...fields})}`;

export const scenarios = [
  // ---- bind_tab: the decorated Tab ----
  {name: 'tab: AX observations read through tab.ax, write cua.state and emit images unless emit:false', run: async (f, ctx) => {
    const tab = f.bind_tab(tabDouble(ctx));
    return [await tab.getAXState(), await tab.getAXState({disableDiffing: true, emit: false}), await tab.getScreenshot(), await tab.getScreenshot({emit: false}),
      await tab.getAXStateAndScreenshot({disableDiffing: false}), await tab.getAXStateAndScreenshot({emit: false})];
  }, check(record, assert) {
    assert.deepEqual(calls(record), [['t1.ax.get', 'state'], ['t1.ax.get', 'state', {disableDiffing: true}], ['t1.ax.get', 'screenshot'], ['t1.ax.get', 'screenshot'],
      ['t1.ax.get', 'both', {disableDiffing: false}], ['t1.ax.get', 'both']]);
    assert.deepEqual(writes(record), [['cua.state', 'STATE'], ['cua.state', 'STATE']]);
    assert.deepEqual(images(record), [[1, 2, 3], [1, 2, 3]]);
    assert.deepEqual(record.result[2], {uint8: [1, 2, 3]});
  }},
  {name: 'tab: a combined observation without a screenshot emits the state alone', run: async (f, ctx) => {
    const tab = f.bind_tab(tabDouble(ctx, {both: {state: 'ONLY'}}));
    return tab.getAXStateAndScreenshot();
  }, check(record, assert) {
    assert.deepEqual(record.result, {state: 'ONLY'});
    assert.deepEqual(writes(record), [['cua.state', 'ONLY']]);
    assert.deepEqual(images(record), []);
  }},
  {name: 'tab: a DOM-only tab observes through its DOM snapshot and screenshot API, both at once when combined', run: async (f, ctx) => {
    const tab = f.bind_tab(tabDouble(ctx, {kind: 'dom'}));
    return [await tab.getAXState({disableDiffing: true}), await tab.getScreenshot(), await tab.getAXStateAndScreenshot(), await tab.getAXStateAndScreenshot({emit: false})];
  }, check(record, assert) {
    assert.deepEqual(calls(record), [['t1.domSnapshot'], ['t1.screenshot'], ['t1.domSnapshot'], ['t1.screenshot'], ['t1.domSnapshot'], ['t1.screenshot']]);
    assert.deepEqual(writes(record), [['cua.state', 'DOM t1'], ['cua.state', 'DOM t1']]);
    assert.deepEqual(record.result[2], {state: 'DOM t1', screenshot: {uint8: [1, 2, 3]}});
    assert.equal(images(record).length, 2);
  }},
  {name: 'tab: a tab with neither DOM snapshots nor screenshots says so', run: async (f, ctx) => {
    const tab = f.bind_tab(tabDouble(ctx, {id: 'bare', kind: 'bare'}));
    return [await ctx.settle(() => tab.getAXState()), await ctx.settle(() => tab.getScreenshot()), await ctx.settle(() => tab.getAXStateAndScreenshot())];
  }, check(record, assert) {
    assert.deepEqual(record.result, [rejected('Tab bare does not support DOM snapshots.'), rejected('Tab bare does not support screenshots.'), rejected('Tab bare does not support DOM snapshots.')]);
  }},
  {name: 'tab: a DOM-only tab keeps its input wrappers, which throw before any input', run: async (f, ctx) => {
    const tab = f.bind_tab(tabDouble(ctx, {kind: 'dom'}));
    return Promise.all([
      () => tab.click(1), () => tab.drag([1, 2], [3, 4]), () => tab.scroll(1, 'down', 2), () => tab.selectText(1, 'x'), () => tab.setValue(1, 'x'),
      () => tab.performSecondaryAction(1, 'Expand'), () => tab.paste(1, 'x'), () => tab.pressKey(null, 'Return'), () => tab.typeText(0, 'x'),
      () => tab.pressKey(-1, 'a'), () => tab.typeText(1.5, 'a'), () => tab.paste('1', 'a'),
    ].map(fn => ctx.settle(fn)));
  }, check(record, assert) {
    assert.deepEqual(record.result, [sync(DOM_ONLY_INPUT), sync(DOM_ONLY_INPUT), sync(DOM_ONLY_INPUT), sync(DOM_ONLY_INPUT), sync(DOM_ONLY_INPUT),
      sync(DOM_ONLY_INPUT), rejected(DOM_ONLY_INPUT), sync(DOM_ONLY_INPUT), sync(DOM_ONLY_INPUT), sync(ELEMENT_INDEX), sync(ELEMENT_INDEX), rejected(ELEMENT_INDEX)]);
    assert.deepEqual(calls(record), []);
  }},
  {name: 'tab: AX input forwards every argument to tab.ax, the element index checked first', run: async (f, ctx) => {
    const raw = tabDouble(ctx);
    const tab = f.bind_tab(raw);
    await tab.click([4, 5], {mouseButton: 'right', clickCount: 2});
    await tab.drag([1, 2], [3, 4]);
    await tab.scroll(7, 'down', 2);
    await tab.selectText(3, 'hello', {prefix: 'a', suffix: 'b', selectionType: 'cursor_after'});
    await tab.setValue(3, 'v');
    await tab.performSecondaryAction(3, 'Expand');
    await tab.paste(null, 'text', {format: 'md'});
    await tab.pressKey(0, 'Return');
    await tab.typeText(9, 'hi');
    return [tab === raw, await ctx.settle(() => tab.typeText(-2, 'x'))];
  }, check(record, assert) {
    assert.deepEqual(record.result, [true, sync(ELEMENT_INDEX)]);
    assert.deepEqual(calls(record), [['t1.ax.click', [4, 5], {mouseButton: 'right', clickCount: 2}], ['t1.ax.drag', [1, 2], [3, 4]], ['t1.ax.scroll', 7, 'down', 2],
      ['t1.ax.selectText', 3, 'hello', {prefix: 'a', suffix: 'b', selectionType: 'cursor_after'}], ['t1.ax.setValue', 3, 'v'], ['t1.ax.performSecondaryAction', 3, 'Expand'],
      ['t1.ax.paste', null, 'text', {format: 'md'}], ['t1.ax.pressKey', 0, 'Return'], ['t1.ax.typeText', 9, 'hi']]);
  }},

  // ---- bind_mac_app ----
  {name: 'mac app: observations go through get_app_state, diffing forwarded as disableDiff, screenshots read from data: and file: URLs', run: async (f, ctx) => {
    const dir = mkdtempSync(join(tmpdir(), 'cua-facade-'));
    try {
      writeFileSync(join(dir, 'shot.png'), Uint8Array.from([4, 4]));
      const fileUrl = pathToFileURL(join(dir, 'shot.png')).href;
      let answer = 0;
      const sky = skyDouble(ctx, 'mac', {get_app_state: () => [{text: 'AX', screenshot: {url: PNG_URL}}, {text: 'AX', screenshot: {url: fileUrl}}, {text: 'AX2', screenshot: null}, {text: 'AX3', screenshot: {url: PNG_URL}}, {text: 'AX4', screenshot: null}][answer++ % 5]});
      const app = f.bind_mac_app(sky, 'TextEdit');
      return [await app.getAXState({disableDiffing: true}), await app.getScreenshot(), await app.getAXStateAndScreenshot({emit: false}), await app.getAXStateAndScreenshot(),
        await ctx.settle(() => app.getScreenshot())];
    } finally { rmSync(dir, {recursive: true, force: true}); }
  }, check(record, assert) {
    assert.deepEqual(calls(record), [['sky.get_app_state', {app: 'TextEdit', disableDiff: true}], ['sky.get_app_state', {app: 'TextEdit'}], ['sky.get_app_state', {app: 'TextEdit'}],
      ['sky.get_app_state', {app: 'TextEdit'}], ['sky.get_app_state', {app: 'TextEdit'}]]);
    assert.deepEqual(record.result.slice(0, 4), ['AX', {uint8: [4, 4]}, {state: 'AX2'}, {state: 'AX3', screenshot: {uint8: [9, 8, 7]}}]);
    assert.deepEqual(record.result[4], rejected('Screenshot unavailable for TextEdit.'));
    assert.deepEqual(writes(record), [['cua.state', 'AX'], ['cua.state', 'AX3']]);
    assert.deepEqual(images(record), [[4, 4], [9, 8, 7]]);
  }},
  {name: 'mac app: input maps to Sky\'s payloads; scroll takes pages only', run: async (f, ctx) => {
    const app = f.bind_mac_app(skyDouble(ctx, 'mac'), 'Notes');
    await app.click(5);
    await app.click([10, 20], {mouseButton: 'right', clickCount: 2});
    await app.drag([1, 2], [3, 4]);
    await app.pressKey('super+c');
    await app.scroll(3, 'down', 2);
    await app.scroll([1, 2], 'up');
    await app.selectText(4, 'hi', {prefix: 'a', suffix: 'b', selectionType: 'text'});
    await app.selectText(4, 'hi');
    await app.setValue(4, 'v');
    await app.typeText('typed');
    await app.performSecondaryAction(4, 'Expand');
    await app.paste('p');
    await app.paste('p', {format: 'html'});
    return [await ctx.settle(() => app.scroll(1, 'down', {pixels: 5})), await ctx.settle(() => app.scroll(1, 'down', null))];
  }, check(record, assert) {
    assert.deepEqual(record.result, [sync('macOS scroll accepts pages, not pixels.'), sync('macOS scroll accepts pages, not pixels.')]);
    assert.deepEqual(calls(record), [
      ['sky.click', {app: 'Notes', element_index: 5}], ['sky.click', {app: 'Notes', x: 10, y: 20, mouse_button: 'right', click_count: 2}],
      ['sky.drag', {app: 'Notes', from_x: 1, from_y: 2, to_x: 3, to_y: 4}], ['sky.press_key', {app: 'Notes', key: 'super+c'}],
      ['sky.scroll', {app: 'Notes', direction: 'down', element_index: 3, pages: 2}], ['sky.scroll', {app: 'Notes', direction: 'up', x: 1, y: 2}],
      ['sky.select_text', {app: 'Notes', element_index: 4, text: 'hi', prefix: 'a', suffix: 'b', selection_type: 'text'}], ['sky.select_text', {app: 'Notes', element_index: 4, text: 'hi'}],
      ['sky.set_value', {app: 'Notes', element_index: 4, value: 'v'}], ['sky.type_text', {app: 'Notes', text: 'typed'}],
      ['sky.perform_secondary_action', {app: 'Notes', element_index: 4, action: 'Expand'}], ['sky.paste', {app: 'Notes', text: 'p', format: 'text'}],
      ['sky.paste', {app: 'Notes', text: 'p', format: 'html'}]]);
  }},

  // ---- bind_linux_app ----
  {name: 'linux app: observations refresh the bound window and name the tree source; one screenshot region at most', run: async (f, ctx) => {
    const app = f.bind_linux_app(linuxSky(ctx, f), linuxWindow);
    const multi = f.bind_linux_app(linuxSky(ctx, f, {screenshots: [{bytes: Uint8Array.from([1])}, {bytes: Uint8Array.from([2])}]}), {...linuxWindow, id: 8});
    const none = f.bind_linux_app(linuxSky(ctx, f, {screenshots: []}), {...linuxWindow, id: 9});
    return [await app.getAXState(), await app.getScreenshot(), await app.getAXStateAndScreenshot({emit: false}), await ctx.settle(() => multi.getScreenshot()),
      await ctx.settle(() => none.getScreenshot()), await none.getAXStateAndScreenshot({emit: false})];
  }, check(record, assert) {
    const [state] = record.result;
    assert.ok(state.startsWith('Accessibility source: at_spi\nn1 frame Editor\n'), state);
    assert.deepEqual(calls(record)[0], ['sky.get_window_state', {window: linuxWindow, include_screenshot: false}]);
    assert.deepEqual(calls(record)[1], ['sky.get_window_state', {window: {...linuxWindow, title: 'Refreshed'}, include_screenshot: true}], 'the refreshed window is the bound one');
    assert.deepEqual(record.result[1], {uint8: [5, 6]});
    assert.deepEqual(record.result[3], rejected('Window 8 has multiple screenshot regions; a single screenshot is unavailable.'));
    assert.deepEqual(record.result[4], rejected('Screenshot unavailable for window 9.'));
    assert.deepEqual(Object.keys(record.result[5]), ['state']);
    assert.deepEqual(writes(record), [['cua.state', state]]);
  }},
  {name: 'linux app: input is bound to the window; element ids are strings; scroll takes pixels; paste is text; selectText and setValue refuse first', run: async (f, ctx) => {
    const app = f.bind_linux_app(skyDouble(ctx, 'linux'), linuxWindow);
    await app.click(5);
    await app.click([10, 20], {mouseButton: 'middle', clickCount: 3});
    await app.drag([1, 2], [3, 4]);
    await app.scroll(3, 'down');
    await app.scroll([1, 2], 'up', {pixels: 300});
    await app.paste('p');
    await app.paste('p', {format: 'text'});
    await app.pressKey('ctrl+a');
    await app.typeText('typed');
    await app.performSecondaryAction(4, 'Expand');
    return Promise.all([() => app.scroll(1, 'down', 2), () => app.scroll(1, 'down', {pixels: 0}), () => app.scroll(1, 'down', {pixels: Infinity}),
      () => app.paste('p', {format: 'md'}), () => app.selectText(1, 'x'), () => app.setValue(1, 'x')].map(fn => ctx.settle(fn)));
  }, check(record, assert) {
    const pixels = 'pixels must be a positive finite number.';
    assert.deepEqual(record.result, [sync('Linux scroll accepts { pixels }, not pages.'), sync(pixels), sync(pixels), sync('Linux paste supports only text format.'),
      rejected('selectText is unavailable on Linux.'), rejected('setValue is unavailable on Linux; use click, pressKey, and typeText.')]);
    const w = linuxWindow;
    assert.deepEqual(calls(record), [['sky.click', {window: w, element_id: '5'}], ['sky.click', {window: w, x: 10, y: 20, mouse_button: 'middle', click_count: 3}],
      ['sky.drag', {window: w, path: [{x: 1, y: 2}, {x: 3, y: 4}]}], ['sky.scroll', {window: w, direction: 'down', element_id: '3'}],
      ['sky.scroll', {window: w, direction: 'up', x: 1, y: 2, pixels: 300}], ['sky.type_text', {window: w, text: 'p'}], ['sky.type_text', {window: w, text: 'p'}],
      ['sky.press_key', {window: w, key: 'ctrl+a'}], ['sky.type_text', {window: w, text: 'typed'}], ['sky.perform_secondary_action', {window: w, element_id: '4', action: 'Expand'}]]);
  }},
  {name: 'linux accessibility tree: the vendor\'s condensed one-line-per-node rendering', run: async f => {
    const tree = f.accessibility_tree(linuxTree());
    return [tree.to_string(), Object.keys(tree).includes('to_string'), f.accessibility_tree({id: 'x', role: 'filler', children: []}).to_string()];
  }, check(record, assert) {
    assert.equal(record.result[0], ['n1 frame Editor', '\tn2 container', '\t\tn3 push button (focused) Save, Description: Save the file', '\t\tn4 text Line 1 Col 2\\tok',
      `\t\tn6 entry (settable, disabled) Find, Secondary Actions: activate, Value: ${'x'.repeat(120)}`].join('\n'));
    assert.deepEqual(record.result.slice(1), [false, '']);
  }},

  // ---- inventory ----
  {name: 'state: both inventories settle independently; an empty errors list is omitted', run: async (f, ctx) => {
    const sky = skyDouble(ctx, 'linux', {list_apps: [{id: 'gedit', name: 'Text Editor', windows: [{id: 7, app: 'gedit'}]}, {id: 'calc', name: 'Calculator', windows: []}]});
    const browser = browserFixture(ctx, f, {userTabs: [{id: 't0', title: 'User'}, {id: 't1', title: 'Old'}]});
    return f.get_state({computer: sky, browsers: browsersFixture(ctx, [{id: 'b1', type: 'extension'}], {b1: browser})});
  }, check(record, assert) {
    assert.deepEqual(record.result, {apps: [{id: 'gedit', displayName: 'Text Editor', isRunning: true, windows: [{id: 7, app: 'gedit'}]}, {id: 'calc', displayName: 'Calculator', isRunning: false, windows: []}],
      browsers: [{id: 'b1', type: 'extension', tabs: [{id: 't0', title: 'User'}, {id: 't1', title: 'One', url: 'https://one.test/'}]}]});
  }},
  {name: 'state: a failed inventory is an error; a failed browser stays listed without tabs; a failed user listing is logged and empty', run: async (f, ctx) => {
    const failing = skyDouble(ctx, 'mac', {list_apps: () => { throw new Error('apps down'); }});
    const b1 = browserFixture(ctx, f, {userTabs: new Error('user tabs down')});
    const browsers = browsersFixture(ctx, [{id: 'b1'}, {id: 'gone'}], {b1});
    const listFailure = {list: async () => { throw new Error('list down'); }};
    return [await f.get_state({computer: failing, browsers}), await f.get_state({browsers: listFailure}), await f.get_state({})];
  }, check(record, assert) {
    assert.deepEqual(record.result[0], {apps: [], browsers: [{id: 'b1', tabs: [{id: 't1', title: 'One', url: 'https://one.test/'}]}, {id: 'gone', tabs: []}],
      errors: ['Native apps: Error: apps down', 'Browser gone: Error: no browser gone']});
    assert.deepEqual(record.result[1], {apps: [], browsers: [], errors: ['Browsers: Error: list down']});
    assert.deepEqual(record.result[2], {apps: [], browsers: []});
    assert.deepEqual(record.log.filter(entry => 'logged' in entry), [{logged: {error: 'Error', message: 'user tabs down'}}]);
  }},
  {name: 'apps: macOS inventory is Sky\'s own; an unknown target is unreachable', run: async (f, ctx) => [
    await f.get_apps(skyDouble(ctx, 'mac', {list_apps: [{id: 'com.apple.Notes', displayName: 'Notes'}]})),
    await ctx.settle(() => f.get_apps(skyDouble(ctx, 'beos'))),
  ], check(record, assert) {
    assert.deepEqual(record.result, [[{id: 'com.apple.Notes', displayName: 'Notes'}], {rejected: {error: 'UnreachableCaseError', message: 'beos'}}]);
  }},

  // ---- the bootstrap emitter ----
  {name: 'emitter: the core once, then documentation before state; emit:false keeps documentation; values are JSON unless strings', run: async (f, ctx) => {
    const emitter = emitterFixture(ctx, f);
    const browser = {browserId: 'b1', documentation: async () => { ctx.log({call: 'b1.documentation'}); return 'DOC b1'; }};
    const second = {browserId: 'b2', documentation: async () => 'DOC b2'};
    await emitter.emit();
    await emitter.emit('text');
    await emitter.emit({a: 1}, {emit: false});
    await emitter.load_browser_documentation(browser);
    await emitter.load_browser_documentation(browser);
    await emitter.emit([1], {browser});
    await emitter.emit('again', {browser});
    await emitter.load_browser_documentation(second);
    await emitter.emit(undefined, {browser: second, emit: false});
    await emitter.emit({b: 2});
  }, check(record, assert) {
    assert.deepEqual(writes(record), [['cua.core', 'CORE'], ['cua.state', 'text'], ['cua.browser.b1', 'DOC:other-browser-apis\n\nDOC b1'], ['cua.state', '[1]'],
      ['cua.state', 'again'], ['cua.browser.b2', 'DOC b2'], ['cua.state', '{"b":2}']]);
    assert.deepEqual(calls(record), [['docs.read_core'], ['b1.documentation'], ['docs.read', 'other-browser-apis']], 'documentation fetched once each, the auxiliary document once');
  }},
  {name: 'emitter: rewriteDocumentation re-emits cached documents except for the requestMeta object they were last written for', requestMeta: {turn: 1}, run: async (f, ctx) => {
    const emitter = emitterFixture(ctx, f);
    const browser = {browserId: 'b1', documentation: async () => 'DOC b1'};
    await emitter.rewrite_documentation();
    ctx.log({mark: 'nothing emitted yet'});
    await emitter.load_browser_documentation(browser);
    await emitter.emit('s', {browser});
    await emitter.rewrite_documentation();
    ctx.log({mark: 'same requestMeta'});
    ctx.meta({turn: 1});
    await emitter.rewrite_documentation();
    await emitter.rewrite_documentation();
    ctx.log({mark: 'null requestMeta'});
    ctx.meta(null);
    await emitter.rewrite_documentation();
    await emitter.rewrite_documentation();
  }, check(record, assert) {
    const entries = record.log.filter(entry => 'write' in entry || 'mark' in entry).map(entry => entry.mark ?? entry.write);
    assert.deepEqual(entries, ['nothing emitted yet', 'cua.core', 'cua.browser.b1', 'cua.state', 'same requestMeta', 'cua.core', 'cua.browser.b1', 'null requestMeta',
      'cua.core', 'cua.browser.b1', 'cua.core', 'cua.browser.b1']);
  }},
  {name: 'emitter: a failed browser documentation fetch is forgotten; without nodeRepl.write nothing is fetched or written', run: async (f, ctx) => {
    const emitter = emitterFixture(ctx, f);
    let attempts = 0;
    const browser = {browserId: 'b1', documentation: async () => { ctx.log({call: 'b1.documentation'}); if (++attempts === 1) throw new Error('docs down'); return 'DOC b1'; }};
    const first = await ctx.settle(() => emitter.load_browser_documentation(browser));
    await emitter.load_browser_documentation(browser);
    await emitter.emit('', {browser});
    return first;
  }, check(record, assert) {
    assert.deepEqual(record.result, rejected('docs down'));
    assert.deepEqual(writes(record), [['cua.core', 'CORE'], ['cua.browser.b1', 'DOC:other-browser-apis\n\nDOC b1']]);
  }},
  {name: 'emitter: no nodeRepl.write', noWrite: true, run: async (f, ctx) => {
    const emitter = emitterFixture(ctx, f);
    const browser = {browserId: 'b1', documentation: async () => { ctx.log({call: 'b1.documentation'}); return 'DOC'; }};
    await emitter.load_browser_documentation(browser);
    await emitter.emit('x', {browser});
    await emitter.rewrite_documentation();
  }, check(record, assert) {
    assert.deepEqual(record.log, []);
  }},

  // ---- documentation ----
  {name: 'documentation: the core is followed by one policy, a valid request override or the bundled one', run: async (f, ctx) => {
    const documentation = f.create_documentation(async name => `<${name}>`);
    const out = [documentation.exclude_browser_confirmations, await documentation.read_core()];
    for (const policies of [{computer_use: 'OVERRIDE'}, {computer_use: '   '}, {computer_use: 'é'.repeat(6001)}, {computer_use: 'é'.repeat(6000)}, {computer_use: 5}, ['x'], 'x', null]) {
      ctx.meta({'openai/confirmation_policies': policies});
      const core = await documentation.read_core();
      out.push(core.length > 40 ? `${core.slice(0, 20)}…${core.length}` : core);
    }
    return out;
  }, check(record, assert) {
    const bundled = '<core-cua-repl>\n<confirmations>';
    assert.deepEqual(record.result, [true, bundled, '<core-cua-repl>\nOVERRIDE', bundled, bundled, `<core-cua-repl>\néééé…${16 + 6000}`, bundled, bundled, bundled, bundled]);
  }},

  // ---- the browser facade ----
  {name: 'browser: setup asks for the decorated client with Tab.ax undocumented and the superseded documents excluded', run: async f => {
    let seen;
    const agent = await f.setup_browser({setupBrowserRuntime: async options => { seen = options; return 'agent'; }, exclude_browser_confirmations: true});
    return [agent, JSON.parse(JSON.stringify(seen)), seen.decorateTab === f.bind_tab];
  }, check(record, assert) {
    assert.deepEqual(record.result, ['agent', {undocumentedApiMembers: ['Tab.ax'], excludedDocumentation: ['tab-claiming-chrome', 'tab-mentions-iab', 'confirmations']}, true]);
  }},
  {name: 'browser: getBrowser selects without opening a tab and emits first-use documentation once', run: async (f, ctx) => {
    const api = browserApi(ctx, f);
    const browser = await api.getBrowser();
    await api.getBrowser({id: 'b1'});
    const byUrl = await api.getBrowser({url: 'example.test/path'});
    const byInstance = await api.getBrowser({extensionInstanceId: 'inst-2'});
    return [browser.browserId, byUrl.browserId, byInstance.browserId, api.browsers === undefined];
  }, check(record, assert) {
    assert.deepEqual(record.result, ['b1', 'b1', 'b2', false]);
    assert.deepEqual(calls(record).filter(([name]) => name.startsWith('browsers.')), [['browsers.getDefault'], ['browsers.get', 'b1'], ['browsers.getForUrl', 'https://example.test/path'],
      ['browsers.list'], ['browsers.get', 'b2']]);
    assert.deepEqual(writes(record), [['cua.core', 'CORE'], ['cua.browser.b1', 'DOC:other-browser-apis\n\nDOC b1'], ['cua.browser.b2', 'DOC b2']]);
  }},
  {name: 'browser: getBrowser refuses id with extensionInstanceId, and an instance matching none or several', run: async (f, ctx) => {
    const api = browserApi(ctx, f, {list: [{id: 'b1', type: 'extension', metadata: {extensionInstanceId: 'dup'}}, {id: 'b2', type: 'extension', metadata: {extensionInstanceId: 'dup'}}, {id: 'c', type: 'cdp', metadata: {extensionInstanceId: 'cdp-1'}}]});
    return Promise.all([() => api.getBrowser({id: 'b1', extensionInstanceId: 'dup'}), () => api.getBrowser({extensionInstanceId: 'cdp-1'}), () => api.getBrowser({extensionInstanceId: 'dup'})].map(fn => ctx.settle(fn)));
  }, check(record, assert) {
    assert.deepEqual(record.result.slice(0, 2), [rejected('Specify either id or extensionInstanceId, not both.'), rejected('The Chrome instance is unavailable.')]);
    assert.match(record.result[2].rejected.message, /^Multiple browsers match the Chrome instance: \[\{"id":"b1"/);
  }},
  {name: 'browser: createBrowserTab names the session and sets visibility before opening, navigates, then emits the full initial state before returning', run: async (f, ctx) => {
    const api = browserApi(ctx, f);
    const tab = await api.createBrowserTab('b1', 'example.test', {sessionName: 'Research', visible: false});
    const blank = await api.createBrowserTab('b1');
    return [tab.id, typeof tab.getAXState, blank.id];
  }, check(record, assert) {
    assert.deepEqual(record.result, ['new1', 'function', 'new1']);
    assert.deepEqual(calls(record), [['browsers.get', 'b1'], ['b1.documentation'], ['b1.nameSession', 'Research'], ['b1.capabilities.get', 'visibility'], ['b1.visibility.set', false],
      ['b1.tabs.new'], ['b1.new1.goto', 'https://example.test'], ['new1.ax.get', 'state', {disableDiffing: true}], ['docs.read_core'], ['docs.read', 'other-browser-apis'],
      ['browsers.get', 'b1'], ['b1.tabs.new'], ['b1.new1.goto', 'about:blank'], ['new1.ax.get', 'state', {disableDiffing: true}]]);
    assert.deepEqual(writes(record), [['cua.core', 'CORE'], ['cua.browser.b1', 'DOC:other-browser-apis\n\nDOC b1'], ['cua.state', 'STATE new1'], ['cua.state', 'STATE new1']]);
  }},
  {name: 'browser: createBrowserTab refuses what the browser cannot do', run: async (f, ctx) => {
    const api = browserApi(ctx, f, {b1: {noNew: true}, b2: {noGoto: true, nameSession: false, capabilities: false}});
    return Promise.all([() => api.createBrowserTab(''), () => api.createBrowserTab('  '), () => api.createBrowserTab(5), () => api.createBrowserTab('b1'),
      () => api.createBrowserTab('b2', undefined, {sessionName: 'x'}), () => api.createBrowserTab('b2', undefined, {visible: true}), () => api.createBrowserTab('b2', 'https://x.test/')].map(fn => ctx.settle(fn)));
  }, check(record, assert) {
    const select = 'createBrowserTab requires a browser ID. Select one with cua.getBrowser().';
    assert.deepEqual(record.result, [rejected(select), rejected(select), rejected(select), rejected('Browser b1 does not support creating tabs.'), rejected('Browser b2 does not support sessionName.'),
      rejected('Browser b2 does not support visibility control.'), rejected('Tab new1 does not support navigation.')]);
    assert.ok(calls(record).some(([name]) => name === 'b2.new1.close'), 'the tab that cannot navigate is closed');
  }},
  {name: 'browser: getTab binds a managed tab by id or provider id, claims an unowned user tab, and emits its initial state', run: async (f, ctx) => {
    const api = browserApi(ctx, f, {b1: {tabs: [{id: 't1', title: 'One', url: 'https://one.test/'}], userTabs: [{id: 't1', providerTabId: 'p1'}, {id: 'u2', providerTabId: 'p2', url: 'https://two.test/'}]}});
    const byId = await api.getTab('t1');
    const byProvider = await api.getTab('p1', {browser: 'b1'});
    const claimed = await api.getTab('p2');
    return [byId.id, byProvider.id, claimed.id];
  }, check(record, assert) {
    assert.deepEqual(record.result, ['t1', 't1', 'u2']);
    assert.ok(calls(record).some(([name, info]) => name === 'b1.user.claimTab' && info.id === 'u2'));
    assert.deepEqual(writes(record).map(([name]) => name), ['cua.core', 'cua.browser.b1', 'cua.state', 'cua.state', 'cua.state']);
  }},
  {name: 'browser: getTab refuses an empty, missing, ambiguous or unclaimable reference', run: async (f, ctx) => {
    const api = browserApi(ctx, f, {b1: {tabs: [{id: 't1', providerTabId: 'dup'}, {id: 't2', providerTabId: 'dup'}]}});
    return Promise.all([() => api.getTab(''), () => api.getTab('none'), () => api.getTab('dup')].map(fn => ctx.settle(fn)));
  }, check(record, assert) {
    assert.deepEqual(record.result.slice(0, 2), [rejected('getTab requires a tab reference'), rejected('Tab not found in browser b1.')]);
    assert.equal(record.result[2].rejected.message, 'Multiple tabs match the reference in browser b1: [{"id":"t1","providerTabId":"dup","browserId":"b1"},{"id":"t2","providerTabId":"dup","browserId":"b1"}]');
  }},
  {name: 'browser: getTab by URL needs an absolute URL and an explicit browser; a new-tab page answers with its metadata', run: async (f, ctx) => {
    const api = browserApi(ctx, f, {b1: {tabs: [{id: 't1', url: 'chrome://newtab/'}], userTabs: [{id: 'u1', url: 'https://u.test/'}]}});
    const refusals = await Promise.all([() => api.getTab({url: 'not a url'}), () => api.getTab({url: 'https://u.test/'})].map(fn => ctx.settle(fn)));
    const user = await api.getTab({url: 'https://u.test/'}, {browser: 'b1'});
    const newTab = await api.getTab({url: 'chrome://newtab/'}, {browser: 'b1'});
    return [refusals, user.id, newTab.id];
  }, check(record, assert) {
    assert.deepEqual(record.result, [[rejected('getTab requires an absolute URL.'), rejected('getTab({ url }) requires an explicit browser.')], 'u1', 't1']);
    assert.deepEqual(writes(record).at(-1), ['cua.state', '{"id":"t1","url":"chrome://newtab/","browserId":"b1"}']);
    assert.equal(calls(record).filter(([name]) => name === 't1.ax.get').length, 0, 'a new-tab page is not read');
  }},
  {name: 'browser: getTab by extension tab mention resolves its profile and refuses a stale or mismatched one', run: async (f, ctx) => {
    const api = browserApi(ctx, f, {b1: {tabs: [{id: 't9', providerTabId: 'p9', title: 'Nine', url: 'https://nine.test/'}]}});
    const bound = await api.getTab({mention: mention()});
    const refusals = await Promise.all([
      () => api.getTab({mention: mention({title: 'Renamed'})}), () => api.getTab({mention: mention()}, {browser: 'b2'}), () => api.getTab({mention: mention({browserId: 'inst-x'})}),
      () => api.getTab({mention: 'not a url'}), () => api.getTab({mention: mention({}, 'firefox')}), () => api.getTab({mention: `${mention()}&tabId=p9`}),
      () => api.getTab({mention: mention({mention: 'tab-v2'})}),
    ].map(fn => ctx.settle(fn)));
    return [bound.id, refusals];
  }, check(record, assert) {
    assert.deepEqual(record.result, ['t9', [rejected('Stale tab mention: the tab\'s title or URL has changed.'), rejected('The requested browser does not match the tab mention\'s browser/profile.'),
      rejected('The browser/profile referenced by the tab mention is unavailable.'), rejected('Invalid tab mention URL.'), rejected('Invalid tab mention URL.'),
      rejected('Invalid tab mention fields.'), rejected('Invalid tab mention fields.')]]);
  }},
  {name: 'browser: an in-app browser mention without a source has no default (surface inventory Table 2, IAB source default)', differs: 'Table 2 "IAB source/default in parse_tab_mention"', run: async (f, ctx) => {
    const api = browserApi(ctx, f);
    return [await ctx.settle(() => api.getTab({mention: mention({}, 'browser')})), await ctx.settle(() => api.getTab({mention: mention({source: 'extension'}, 'browser')}))];
  }, check(record, assert) {
    assert.deepEqual(record.result[0], rejected('Invalid tab mention fields.'));
    assert.deepEqual(record.result[1], rejected('Tab not found in browser b1.'), 'an explicit extension source still resolves');
  }},
  {name: 'browser: an in-app browser mention never bypasses the profile match (surface inventory Table 2, IAB match bypass)', differs: 'Table 2 "IAB source/default in parse_tab_mention / get_mentioned_browser_id"', run: async (f, ctx) => {
    const api = browserApi(ctx, f, {list: [{id: 'b1', type: 'iab'}]});
    return ctx.settle(() => api.getTab({mention: mention({source: 'iab', browserId: 'anything'}, 'browser')}));
  }, check(record, assert) {
    assert.deepEqual(record.result, rejected('The browser/profile referenced by the tab mention is unavailable.'));
  }},
  {name: 'browser: the Orbit signed new-tab page is an ordinary tab (surface inventory Table 2, Orbit new-tab exception)', differs: 'Table 2 "Orbit signed new-tab extension URL"', run: async (f, ctx) => {
    const api = browserApi(ctx, f, {b1: {tabs: [{id: 't1', url: 'chrome-extension://njkekoimnfiafpgdgahjjnmhckkfojea/newtab.html'}]}});
    await api.getTab('t1');
  }, check(record, assert) {
    assert.deepEqual(writes(record).at(-1), ['cua.state', 'STATE t1']);
  }},
  {name: 'browser: listBrowsers and listTabs emit their results unless emit:false; listTabs merges user then managed tabs by id and never claims', run: async (f, ctx) => {
    const api = browserApi(ctx, f, {b1: {userTabs: [{id: 'u1'}, {id: 't1', title: 'stale'}]}, b2: {tabs: []}});
    const browsers = await api.listBrowsers();
    await api.listBrowsers({emit: false});
    const all = await api.listTabs();
    const scoped = await api.listTabs({browser: 'b2', emit: false});
    return [browsers.length, all, scoped];
  }, check(record, assert) {
    assert.deepEqual(record.result, [2, [{id: 'u1', browserId: 'b1'}, {id: 't1', title: 'One', url: 'https://one.test/', browserId: 'b1'}], []]);
    assert.deepEqual(writes(record).map(([name]) => name), ['cua.core', 'cua.state', 'cua.state', 'cua.browser.b2']);
    assert.equal(calls(record).some(([name]) => name.endsWith('claimTab')), false);
  }},
];
