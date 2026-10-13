// dom_cua_get_visible_dom (src/browser-service/visible-dom.mjs): the listing's page function runs for real, in node:vm
// over a small DOM (elements with attributes, client rects and computed styles; text nodes; frames), behind a stub
// controller that answers the CDP calls the listing makes (the frame tree, the DOM-CUA world, Runtime.evaluate,
// DOM.describeNode, frame targets). Checked: which elements are listed and how they are rendered, the public node ids
// and their registry, the 20,000-character / 200-element caps, child frames, and the world made again after a lost
// context.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {DOM_WORLD_NAME, VISIBLE_DOM_HANDLERS, VisibleDom} from '../../src/browser-service/visible-dom.mjs';

// --- a small DOM -------------------------------------------------------------------------------------------------------

const VISIBLE = {visibility: 'visible', display: 'block', pointerEvents: 'auto', opacity: '1'};
let nextTop = 0;
const slot = () => ({left: 10, right: 210, top: (nextTop += 25) % 550, bottom: (nextTop % 550) + 20, width: 200, height: 20});

function dom() {
  class Node {}
  Object.assign(Node, {ELEMENT_NODE: 1, TEXT_NODE: 3, DOCUMENT_NODE: 9, DOCUMENT_FRAGMENT_NODE: 11});
  class Text extends Node { constructor(value) { super(); this.nodeType = 3; this.nodeValue = value; this.childNodes = []; } }
  class Element extends Node {
    constructor(tag, {attrs = {}, children = [], rect = slot(), style = {}} = {}) {
      super();
      this.nodeType = 1;
      this.localName = tag;
      this.nodeName = tag.toUpperCase();
      this.tagName = this.nodeName;
      this.attrs = attrs;
      this.childNodes = children.map(c => (typeof c === 'string' ? new Text(c) : c));
      this.rect = rect;
      this.style = {...VISIBLE, ...style};
      this.shadowRoot = null;
    }
    getAttribute(name) { return Object.hasOwn(this.attrs, name) ? String(this.attrs[name]) : null; }
    hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
    get children() { return this.childNodes.filter(c => c.nodeType === 1); }
    getClientRects() { return this.rect ? [this.rect] : []; }
  }
  class HTMLInputElement extends Element {
    constructor(attrs = {}, options = {}) { super('input', {...options, attrs}); this.type = attrs.type ?? 'text'; this.value = attrs.value ?? ''; this.checked = attrs.checked != null; this.indeterminate = false; }
  }
  class HTMLTextAreaElement extends Element { constructor(value, attrs = {}) { super('textarea', {attrs}); this.value = value; } }
  class HTMLSelectElement extends Element {}
  class HTMLOptionElement extends Element {}
  class HTMLIFrameElement extends Element {
    constructor(src, frameId, options = {}) { super('iframe', options); this.src = src; this.contentFrameId = frameId; this.clientWidth = 300; this.clientHeight = 200; }
  }
  const make = (tag, text, attrs = {}, options = {}) => new Element(tag, {attrs, children: text == null ? [] : [text], ...options});
  return {Node, Element, HTMLInputElement, HTMLTextAreaElement, HTMLSelectElement, HTMLOptionElement, HTMLIFrameElement, make};
}

// A frame: its document's elements in a vm context of their own (one per world made for it).
function frameOf(d, elements) {
  const html = new d.Element('html', {children: [new d.Element('body', {children: elements})]});
  const document = {nodeType: 9, documentElement: html};
  return {document, globals: () => {
    const window = {visualViewport: null, innerWidth: 800, innerHeight: 600, getComputedStyle: element => element.style};
    return vm.createContext({window, document, Node: d.Node, HTMLInputElement: d.HTMLInputElement, HTMLTextAreaElement: d.HTMLTextAreaElement,
      HTMLSelectElement: d.HTMLSelectElement, HTMLOptionElement: d.HTMLOptionElement});
  }};
}

// The controller the listing talks to: frames by id, each world a vm context; calls recorded.
function stubCdp(frames, {mainFrameId = 'MAIN', loaderId = 'L1'} = {}) {
  const calls = [];
  const worlds = new Map();          // contextId -> {frameId, context}
  const objects = new Map();
  let nextContext = 1;
  let nextObject = 1;
  const cleanup = [];
  const failures = [];
  const cdp = {
    calls, frames, loaderId,
    addTabCleanupHandler(handler) { cleanup.push(handler); },
    cleanup: tabId => cleanup.forEach(h => h(tabId)),
    fail(method, message) { failures.push({method, message}); },
    loseContexts() { worlds.clear(); },
    async call(tabId, method, params, options) { return await cdp.callTarget({tabId}, method, params, options); },
    async callTarget(target, method, params = {}, options = {}) {
      calls.push({target, method, params, timeoutMs: options.deadline?.remaining()});
      const i = failures.findIndex(f => f.method === method);
      if (i >= 0) throw new Error(failures.splice(i, 1)[0].message);
      switch (method) {
        case 'Page.getFrameTree': return {frameTree: {frame: {id: mainFrameId, loaderId: cdp.loaderId}}};
        case 'Page.createIsolatedWorld': {
          assert.equal(params.worldName, DOM_WORLD_NAME);
          const id = nextContext++;
          worlds.set(id, {frameId: params.frameId, context: frames[params.frameId].globals()});
          return {executionContextId: id};
        }
        case 'Runtime.evaluate': {
          const world = worlds.get(params.contextId);
          if (world == null) throw new Error('Cannot find context with specified id');
          if (frames[world.frameId].fails) throw new Error('frame unreadable');
          const value = vm.runInContext(params.expression, world.context);
          if (params.returnByValue) return {result: {type: 'object', value: JSON.parse(JSON.stringify(value))}};
          if (value == null) return {result: {type: 'object', subtype: 'null', value: null}};
          const objectId = `obj-${nextObject++}`;
          objects.set(objectId, value);
          return {result: {type: 'object', objectId}};
        }
        case 'DOM.describeNode': return {node: {frameId: objects.get(params.objectId)?.contentFrameId}};
        case 'Runtime.releaseObject': objects.delete(params.objectId); return {};
        default: throw new Error(`unexpected ${method}`);
      }
    },
    async targetForFrameOrAttach(tabId, frameId) { return frames[frameId].oopif ? {tabId, targetId: frameId} : null; },
    objects,
  };
  return cdp;
}

const TAB = 9;
const TOP = {left: 0, right: 50, top: 5, bottom: 25, width: 50, height: 20};

test('the interactive elements in view are listed with their attributes and text, numbered from 1', async () => {
  const d = dom();
  const frames = {MAIN: frameOf(d, [
    d.make('h1', 'Heading is not interactive'),
    d.make('button', 'Enabled'),
    d.make('button', 'Disabled', {disabled: ''}),
    d.make('a', 'Docs  &  <more>', {href: '/docs?a=1&b="2"'}),
    new d.HTMLInputElement({'aria-label': 'City', value: 'Seoul'}),
    new d.HTMLInputElement({name: 'password', value: 'hunter2'}),
    new d.HTMLInputElement({type: 'checkbox', checked: ''}),
    new d.HTMLTextAreaElement('typed text', {'aria-label': 'Notes'}),
    d.make('div', 'Role button', {role: 'button'}),
    d.make('span', 'Focusable', {tabindex: '0'}),
    d.make('button', 'Hidden attr', {hidden: ''}),
    d.make('button', 'Aria hidden', {'aria-hidden': 'true'}),
    d.make('button', 'Not displayed', {}, {style: {display: 'none'}}),
    d.make('button', 'Transparent', {}, {style: {opacity: '0'}}),
    d.make('button', 'Below the fold', {}, {rect: {left: 0, right: 100, top: 900, bottom: 920, width: 100, height: 20}}),
    d.make('button', null, {}, {children: [d.make('script', 'ignored()'), 'Shown']}),
    d.make('div', null, {id: 'codex-agent-overlay-root'}, {children: [d.make('button', 'Overlay')]}),
  ])};
  const listing = new VisibleDom(stubCdp(frames));
  const text = await listing.listing(TAB);
  assert.equal(text, [
    '<button node_id=1>Enabled</button>',
    '<button node_id=2 disabled="true">Disabled</button>',
    '<a node_id=3 href="/docs?a=1&amp;b=&quot;2&quot;">Docs &amp; &lt;more&gt;</a>',
    '<input node_id=4 aria-label="City" value="Seoul" />',
    '<input node_id=5 name="password" value="<redacted>" />',
    '<input node_id=6 type="checkbox" checked="true" />',
    '<textarea node_id=7 aria-label="Notes">typed text</textarea>',
    '<div node_id=8 role="button">Role button</div>',
    '<span node_id=9>Focusable</span>',
    '<button node_id=10>Shown</button>',
  ].join('\n'));
  assert.equal(await listing.listing(TAB), text, 'the same document lists with the same ids');
  assert.deepEqual(listing.node(TAB, '4'), {frameId: 'MAIN', loaderId: 'L1', localRef: listing.node(TAB, '4').localRef, target: {tabId: TAB},
    viewportClip: {bottom: 600, left: 0, right: 800, top: 0}});
  assert.throws(() => listing.node(TAB, '99'), /^Error: DOM node 99 is stale or missing$/);
});

test('the listing stops at 200 elements and at 20,000 characters', async () => {
  const d = dom();
  const many = Array.from({length: 250}, (_, i) => d.make('button', `B${i}`, {}, {rect: {left: 0, right: 10, top: 1, bottom: 2, width: 10, height: 1}}));
  const counted = await new VisibleDom(stubCdp({MAIN: frameOf(d, many)})).listing(TAB);
  assert.equal(counted.split('\n').length, 200);
  const long = Array.from({length: 150}, (_, i) => d.make('button', null, {'aria-label': 'x'.repeat(190) + i}, {rect: {left: 0, right: 10, top: 1, bottom: 2, width: 10, height: 1}}));
  const sized = await new VisibleDom(stubCdp({MAIN: frameOf(d, long)})).listing(TAB);
  assert.ok(sized.length <= 20000, `${sized.length} characters`);
  assert.ok(sized.length > 19000, 'filled up to the cap');
  assert.ok(sized.split('\n').length < 150);
});

test('a visible child frame is listed after its parent within the part the parent shows, its ids continuing; an unreadable one is skipped', async () => {
  const d = dom();
  const frames = {
    MAIN: frameOf(d, [d.make('button', 'Top'), new d.HTMLIFrameElement('https://fixture.test/child', 'CHILD', {rect: {left: 0, right: 300, top: 100, bottom: 300, width: 300, height: 200}}),
      new d.HTMLIFrameElement('https://other.test/far', 'FAR', {rect: {left: 400, right: 700, top: 100, bottom: 300, width: 300, height: 200}}),
      new d.HTMLIFrameElement('https://fixture.test/broken', 'BROKEN', {rect: {left: 0, right: 300, top: 350, bottom: 550, width: 300, height: 200}})]),
    CHILD: frameOf(d, [d.make('button', 'Inside', {}, {rect: TOP})]),
    FAR: Object.assign(frameOf(d, [d.make('a', 'Remote', {href: '/r'}, {rect: TOP}), d.make('a', 'Clipped', {href: '/c'}, {rect: {left: 0, right: 50, top: 250, bottom: 270, width: 50, height: 20}})]), {oopif: true}),
    BROKEN: Object.assign(frameOf(d, [d.make('button', 'Never')]), {fails: true}),
  };
  const cdp = stubCdp(frames);
  const listing = new VisibleDom(cdp);
  assert.equal(await listing.listing(TAB), '<button node_id=1>Top</button>\n<button node_id=2>Inside</button>\n<a node_id=3 href="/r">Remote</a>');
  assert.equal(listing.node(TAB, '2').frameId, 'CHILD');
  assert.deepEqual(listing.node(TAB, '3').target, {tabId: TAB, targetId: 'FAR'});
  assert.equal(listing.frame(TAB, 'CHILD').parentFrameId, 'MAIN');
  assert.equal(cdp.objects.size, 0, 'the frame elements looked up were released');
});

test('a new document renumbers from 1; a lost world is made again once; the tab\'s state goes with its cleanup', async () => {
  const d = dom();
  const cdp = stubCdp({MAIN: frameOf(d, [d.make('button', 'One'), d.make('button', 'Two')])});
  const listing = new VisibleDom(cdp);
  await listing.listing(TAB);
  cdp.loseContexts();
  assert.equal(await listing.listing(TAB), '<button node_id=1>One</button>\n<button node_id=2>Two</button>');
  assert.equal(cdp.calls.filter(c => c.method === 'Page.createIsolatedWorld').length, 2);
  cdp.frames.MAIN = frameOf(d, [d.make('button', 'Fresh')]);
  cdp.loaderId = 'L2';
  assert.equal(await listing.listing(TAB), '<button node_id=1>Fresh</button>');
  cdp.cleanup(TAB);
  assert.throws(() => listing.node(TAB, '1'), /stale or missing/);
});

test('the command takes only the tab: the client cannot send options', async () => {
  const d = dom();
  const session = {visibleDom: new VisibleDom(stubCdp({MAIN: frameOf(d, [d.make('button', 'Go')])}))};
  assert.equal(await VISIBLE_DOM_HANDLERS.dom_cua_get_visible_dom({browser_id: 'b', tab_id: String(TAB)}, session), '<button node_id=1>Go</button>');
});
