// playwright_dom_snapshot (src/browser-service/snapshot.mjs): the injected script's aria snapshot of the tab's
// document with each visible iframe's own snapshot stitched under its line (same-process frames entered in the page,
// out-of-process ones through their targets), then flattened the vendor's way. The flattening is checked on its own;
// the stitching runs over the real controller and selector engine against the fake Chrome of support/page-world.mjs,
// whose stand-in InjectedScript gains a small aria snapshot (one `- role "text" [ref=eN]` line per element with a
// role, `- iframe [ref=eN]` per frame) and the `aria-ref=` engine.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CdpController} from '../../src/browser-service/cdp.mjs';
import {InjectedScripts} from '../../src/browser-service/injected.mjs';
import {SelectorEngine} from '../../src/browser-service/selectors.mjs';
import {AX_HANDLERS, SNAPSHOT_HANDLERS, flattenSnapshot} from '../../src/browser-service/snapshot.mjs';
import {FAKE_INJECTED_SOURCE, el, iframe, pageWorld} from './support/page-world.mjs';

const TAB = 4;
const SNAPSHOT_SOURCE = `${FAKE_INJECTED_SOURCE}
PlaywrightInjected.InjectedScript = class extends PlaywrightInjected.InjectedScript {
  incrementalAriaSnapshot(root, options) {
    if (options.mode !== 'ai') throw new Error('unexpected snapshot mode');
    this._refs = new Map();
    let n = 0;
    const lines = [], iframeRefs = [], iframeDepths = {};
    const visit = (element, depth) => {
      const indent = '  '.repeat(depth);
      if (element.localName === 'iframe') {
        const ref = 'e' + (++n);
        this._refs.set(ref, element);
        iframeRefs.push(ref);
        iframeDepths[ref] = depth;
        lines.push(indent + '- iframe [ref=' + ref + ']');
        return;
      }
      const role = element.getAttribute('role');
      if (role) {
        const ref = 'e' + (++n);
        this._refs.set(ref, element);
        lines.push(indent + '- ' + role + (element.ownText ? ' "' + element.ownText + '"' : '') + ' [ref=' + ref + ']' + (element.children.length ? ':' : ''));
        for (const child of element.children) visit(child, depth + 1);
        return;
      }
      for (const child of element.children) visit(child, depth);
    };
    for (const child of root.children) visit(child, 0);
    return {full: lines.join('\\n'), iframeRefs, iframeDepths};
  }
  querySelectorAll(parsed, root) {
    if (parsed.parts[0] && parsed.parts[0].name === 'aria-ref') {
      const found = this._refs && this._refs.get(parsed.parts[0].body);
      return found ? [found] : [];
    }
    return super.querySelectorAll(parsed, root);
  }
};`;

function setup(elements) {
  const {api, browser} = pageWorld();
  browser.tab(TAB, {elements});
  const cdp = new CdpController(api);
  const injected = new InjectedScripts(cdp, {source: SNAPSHOT_SOURCE});
  const session = {cdp, injected, selectors: new SelectorEngine(cdp, injected), clientInfo: {name: 'cua'}};
  return {browser, session, snapshot: params => SNAPSHOT_HANDLERS.playwright_dom_snapshot({browser_id: 'b', tab_id: String(TAB), ...params}, session)};
}
const role = (name, text, children = []) => el('div', {text, attrs: {role: name}, children});

test('the flattening dissolves anonymous containers, drops bare images and strips refs and cursors (RO)', () => {
  assert.equal(flattenSnapshot([
    '- generic [ref=e1]:',
    '  - heading "Title" [level=1] [ref=e2]',
    '  - list [ref=e3]:',
    '    - listitem [ref=e4]:',
    '      - link "One" [ref=e5] [cursor=pointer]',
    '    - listitem [ref=e6]: Two',
    '  - img [ref=e7]',
    '  - img "Logo" [ref=e8]',
    '  - group [ref=e9]:',
    '    - button "Go" [ref=e10]',
  ].join('\n')), [
    '- heading "Title" [level=1]',
    '- list:',
    '  - link "One"',
    '  - listitem: Two',
    '- img "Logo"',
    '- button "Go"',
  ].join('\n'));
  assert.equal(flattenSnapshot('plain text, not a snapshot'), 'plain text, not a snapshot');
  assert.equal(flattenSnapshot(''), '');
});

test('frames are stitched in under their iframe lines, labelled by id and name; a hidden frame keeps its bare line', async () => {
  const {browser, snapshot} = setup([
    role('heading', 'Frames'),
    iframe({id: 'same', name: 'pane', frame: {id: 'SAME', url: 'https://fixture.test/frame', elements: [role('button', 'Inside'),
      iframe({id: 'nested', frame: {id: 'NESTED', url: 'https://fixture.test/nested', elements: [role('link', 'Deep')]}})]}}),
    iframe({id: 'far', frame: {id: 'OOPIF', url: 'https://other.test/frame', access: 'oopif', elements: [role('button', 'Remote')]}}),
    iframe({id: 'hidden', visible: false, frame: {id: 'HIDDEN', url: 'https://fixture.test/hidden', elements: [role('button', 'Unseen')]}}),
  ]);
  const {dom_snapshot: text} = await snapshot({});
  assert.equal(text, [
    '- heading "Frames"',
    '- iframe [id="same"] [name="pane"]:',
    '  - button "Inside"',
    '  - iframe [id="nested"]:',
    '    - link "Deep"',
    '- iframe [id="far"]:',
    '  - button "Remote"',
    '- iframe [id="hidden"]',
  ].join('\n'));
  assert.ok(browser.calls.some(c => c.op === 'attachTarget' && c.targetId === 'OOPIF'), 'the out-of-process frame was read on its own target');
  assert.equal(browser.objects.size, 0);
});

test('a frame that cannot be read keeps its bare line; the snapshot still answers', async () => {
  const frame = iframe({id: 'gone', frame: {id: 'GONE', url: 'https://fixture.test/gone', elements: [role('button', 'X')]}});
  const {browser, snapshot} = setup([role('heading', 'Top'), frame]);
  // The frame element goes away between the top snapshot (the second Runtime.evaluate, after the install) and the
  // frame's own read.
  browser.after('Runtime.evaluate', () => browser.after('Runtime.evaluate', () => { frame.connected = false; }));
  assert.equal((await snapshot({})).dom_snapshot, '- heading "Top"\n- iframe [id="gone"]');
});

test('the AX commands are refused as a capability this browser does not provide', async () => {
  const {session} = setup([]);
  for (const type of ['tab_ax_get_state', 'tab_ax_action']) {
    const error = await AX_HANDLERS[type]({tab_id: String(TAB)}, session).catch(e => e);
    assert.equal(error.code, 'browser_capability_unavailable');
    assert.equal(error.message, `cua does not support command "${type}".`);
  }
});
