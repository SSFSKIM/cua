// The result projection of playwright_evaluate (src/browser-service/evaluate.mjs projectResult, the vendor's
// serializeResult): its limits and markers; ordinary objects by their own keys with no toJSON; and, family by family,
// every browser type the vendor's read-only scope hands out through a wrapper factory or a read-only builder, projected
// to the shape the vendor's wrapper or builder serialises to (readable chatgpt-26.928.40906 BS:57301-59500). The native
// objects are stand-ins carrying the platform's Symbol.toStringTag and, like the real ones, prototype getters.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RESULT_LIMITS, boundResult, projectResult} from '../../src/browser-service/evaluate.mjs';

const project = (value, isProtectedField) => projectResult(value, RESULT_LIMITS, isProtectedField);
// A platform object: `tag` its toStringTag, `getters` its prototype getters, `own` its own properties.
const native = (tag, getters = {}, own = {}) => {
  const proto = {[Symbol.toStringTag]: tag};
  for (const name of Reflect.ownKeys(getters)) {
    const value = getters[name];
    Object.defineProperty(proto, name, typeof value === 'function' && (typeof name === 'symbol' || !name.startsWith('get')) ? {value} : {get: () => value});
  }
  return Object.assign(Object.create(proto), own);
};
const listOf = (tag, items) => native(tag, {length: items.length, item(i) { return items[i] ?? null; }, [Symbol.iterator]: function* () { yield* items; }},
  Object.fromEntries(items.map((item, i) => [i, item])));
const element = (props = {}) => ({nodeType: 1, nodeName: 'P', id: '', tagName: 'P', textContent: 'p', cloneNode() {}, ...props});
const summary = e => ({id: e.id, tagName: e.tagName, textContent: e.textContent});
test('the projection keeps the vendor\'s limits and markers', () => {
  const deep = {};
  let cursor = deep;
  for (let i = 0; i < 12; i++) cursor = cursor.next = {};
  const shared = {s: 1};
  const cyclic = {name: 'c'};
  cyclic.self = cyclic;
  const projected = projectResult({
    big: 12n, nan: NaN, inf: -Infinity, fn() {}, sym: Symbol('s'), undef: undefined,
    long: 'x'.repeat(RESULT_LIMITS.maxStringLength + 5), array: Array.from({length: 2005}, (_, i) => i),
    keys: Object.fromEntries(Array.from({length: 205}, (_, i) => [`k${i}`, i])), deep, cyclic, pair: [shared, shared],
  }, RESULT_LIMITS);
  assert.equal(projected.big, '12');
  assert.equal(projected.nan, null);
  assert.equal(projected.inf, null);
  assert.ok(!('fn' in projected) && !('sym' in projected) && !('undef' in projected));
  assert.equal(projected.long.length, RESULT_LIMITS.maxStringLength + '[Truncated]'.length);
  assert.ok(projected.long.endsWith('[Truncated]'));
  assert.equal(projected.array.length, 2000);
  assert.equal(Object.keys(projected.keys).length, 200);
  let depth = 0;
  for (let node = projected.deep; typeof node === 'object'; node = node.next) depth++;
  assert.equal(depth, 8);
  assert.equal(JSON.stringify(projected.deep).includes('[MaxDepth]'), true);
  assert.equal(projected.cyclic.self, '[Circular]');
  assert.deepEqual(projected.pair, [{s: 1}, '[Circular]'], 'a repeated object is marked, as the vendor marks it');
});

test('an ordinary object projects by its own keys, as the vendor\'s does: toJSON is never called, a Date is {}', () => {
  let conversions = 0;
  const chain = depth => ({level: depth, toJSON() { conversions += 1; return chain(depth + 1); }});
  assert.deepEqual(projectResult({x: 1, toJSON() { conversions += 1; return {override: 2}; }}, RESULT_LIMITS), {x: 1});
  assert.deepEqual(projectResult(new Date(0), RESULT_LIMITS), {});
  assert.deepEqual(projectResult(new URL('https://fixture.test/a'), RESULT_LIMITS), {});
  assert.deepEqual(projectResult(chain(0), RESULT_LIMITS), {level: 0});
  assert.equal(conversions, 0, 'no user toJSON ran');
});

test('nodes: an element as {id, tagName, textContent}; another node by its names (strings only) and text', () => {
  const doctype = {nodeType: 10, nodeName: 'html', name: 'html', publicId: '', systemId: '', textContent: null, cloneNode() {}};
  const text = {nodeType: 3, nodeName: '#text', name: 7, textContent: 't', cloneNode() {}};
  assert.deepEqual(project({e: element({id: 'x', other: 'dropped'}), doctype, text}), {
    e: {id: 'x', tagName: 'P', textContent: 'p'},
    doctype: {name: 'html', nodeName: 'html', nodeType: 10, publicId: '', systemId: '', textContent: null},
    text: {nodeName: '#text', nodeType: 3, textContent: 't'},
  });
});

test('node and rule collections become arrays, within the array limit, a repeated one marked', () => {
  const a = element({id: 'a'});
  const b = element({id: 'b'});
  for (const tag of ['NodeList', 'HTMLCollection', 'HTMLFormControlsCollection', 'HTMLOptionsCollection', 'RadioNodeList', 'StyleSheetList', 'CSSRuleList']) {
    assert.deepEqual(project(listOf(tag, [a, b])), [summary(a), summary(b)], tag);
  }
  const rects = listOf('DOMRectList', [native('DOMRect', {x: 1, y: 2, width: 3, height: 4, top: 2, right: 4, bottom: 6, left: 1})]);
  assert.deepEqual(project(rects), [{bottom: 6, height: 4, left: 1, right: 4, top: 2, width: 3, x: 1, y: 2}]);
  assert.equal(project(listOf('NodeList', Array.from({length: 2500}, () => a))).length, 2000);
  const list = listOf('NodeList', [a]);
  assert.deepEqual(project([list, list]), [[summary(a)], '[Circular]']);
});

test('token lists, attributes, data sets, time ranges and track lists as the vendor\'s read-only builders make them', () => {
  assert.deepEqual(project(listOf('DOMTokenList', ['a', 'b'])), ['a', 'b']);
  const field = element({nodeName: 'INPUT', tagName: 'INPUT'});
  const attr = (name, value) => ({name, value, ownerElement: field});
  const attributes = listOf('NamedNodeMap', [attr('name', 'password'), attr('value', 'hunter2')]);
  const protectedField = e => e === field;
  assert.deepEqual(project(attributes, protectedField), [{name: 'name', nodeName: 'name', nodeValue: 'password', specified: true, value: 'password'}],
    'a credential field\'s value attribute is left out');
  assert.deepEqual(project(attributes).map(a => a.name), ['name', 'value']);
  assert.deepEqual(project(native('DOMStringMap', {}, {userId: '7', role: 'x'})), {userId: '7', role: 'x'});
  const ranges = native('TimeRanges', {length: 2, start(i) { return [0, 5][i]; }, end(i) { return [2, 9][i]; }});
  assert.deepEqual(project(ranges), [{end: 2, start: 0}, {end: 9, start: 5}]);
  const track = {enabled: 1, id: 'a', kind: 'subtitles', label: 'English', language: 'en', mode: 'showing', selected: true};
  const bare = {kind: 'main'};
  for (const tag of ['TextTrackList', 'AudioTrackList', 'VideoTrackList']) {
    assert.deepEqual(project(listOf(tag, [track, bare])), [
      {enabled: false, id: 'a', kind: 'subtitles', label: 'English', language: 'en', mode: 'showing', selected: true},
      {enabled: false, id: '', kind: 'main', label: '', language: '', selected: false},
    ], tag);
  }
});

test('validity, rects, viewport, media queries, font sets and the location as the vendor projects them', () => {
  const validity = native('ValidityState', {badInput: false, customError: false, patternMismatch: true, rangeOverflow: false, rangeUnderflow: false,
    stepMismatch: false, tooLong: false, tooShort: false, typeMismatch: false, valid: false, valueMissing: 'yes'});
  assert.deepEqual(project(validity), {badInput: false, customError: false, patternMismatch: true, rangeOverflow: false, rangeUnderflow: false,
    stepMismatch: false, tooLong: false, tooShort: false, typeMismatch: false, valid: false, valueMissing: false});
  for (const tag of ['DOMRect', 'DOMRectReadOnly']) {
    assert.deepEqual(project(native(tag, {x: 1, y: 2, width: 3, height: 4, top: 2, right: 4, bottom: 6, left: 1})),
      {bottom: 6, height: 4, left: 1, right: 4, top: 2, width: 3, x: 1, y: 2}, tag);
  }
  assert.deepEqual(project(native('VisualViewport', {height: 600, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 10, scale: 1, width: 800, onresize: null})),
    {height: 600, offsetLeft: 0, offsetTop: 0, pageLeft: 0, pageTop: 10, scale: 1, width: 800});
  assert.deepEqual(project(native('MediaQueryList', {matches: 1, media: '(min-width: 1px)', onchange: null})), {matches: false, media: '(min-width: 1px)'});
  assert.deepEqual(project(native('FontFaceSet', {size: 3, status: 'loaded', ready: {}, onloading: null})), {size: 3, status: 'loaded'});
  assert.deepEqual(project(native('Location', {}, {href: 'https://fixture.test/', host: 'fixture.test', assign() {}})), {},
    'the vendor\'s read-only location has no own keys');
});

test('selections and ranges as the vendor\'s wrappers summarise them', () => {
  const a = element({id: 'a'});
  const range = native('Range', {collapsed: false, commonAncestorContainer: a, endOffset: 3, startOffset: 1, toString() { return 'ell'; }});
  assert.deepEqual(project(range), {collapsed: false, commonAncestorContainer: summary(a), endOffset: 3, startOffset: 1, text: 'ell'});
  const selection = native('Selection', {anchorNode: a, anchorOffset: 0, focusNode: null, focusOffset: 0, isCollapsed: true, rangeCount: 0, type: 'Caret', toString() { return ''; }});
  assert.deepEqual(project(selection), {anchorNode: summary(a), anchorOffset: 0, focusNode: null, focusOffset: 0, isCollapsed: true, rangeCount: 0, text: '', type: 'Caret'});
});

test('styles, media lists, CSS rules and style sheets as the vendor\'s CSS wrappers summarise them', () => {
  const declaration = tag => native(tag, {length: 2, item(i) { return ['color', 'display'][i]; }, getPropertyValue(n) { return {color: 'red', display: 'block'}[n]; }});
  for (const tag of ['CSSStyleDeclaration', 'CSSStyleProperties']) assert.deepEqual(project(declaration(tag)), {color: 'red', display: 'block'}, tag);
  const wide = native('CSSStyleDeclaration', {length: 300, item(i) { return `p${i}`; }, getPropertyValue() { return 'v'; }});
  assert.equal(Object.keys(project(wide)).length, 200);
  const media = native('MediaList', {length: 2, mediaText: 'screen, print', item(i) { return ['screen', 'print'][i] ?? null; }});
  assert.deepEqual(project(media), ['screen', 'print']);
  const styleRule = native('CSSStyleRule', {cssText: 'p { color: red; }', type: 1, selectorText: 'p', style: declaration('CSSStyleProperties'), href: 5});
  assert.deepEqual(project(styleRule), {cssText: 'p { color: red; }', type: 1, selectorText: 'p', style: {color: 'red', display: 'block'}});
  const mediaRule = native('CSSMediaRule', {cssText: '@media print {}', type: 4, conditionText: 'print', media, cssRules: listOf('CSSRuleList', [])});
  assert.deepEqual(project(mediaRule), {cssText: '@media print {}', type: 4, conditionText: 'print'});
  const keyframes = native('CSSKeyframesRule', {cssText: '@keyframes k {}', type: 7, name: 'k'});
  assert.deepEqual(project(keyframes), {cssText: '@keyframes k {}', type: 7, name: 'k'});
  const sheet = native('CSSStyleSheet', {disabled: false, href: 'https://fixture.test/a.css', media, title: null, type: 'text/css', cssRules: listOf('CSSRuleList', [styleRule, mediaRule])});
  assert.deepEqual(project(sheet), {disabled: false, href: 'https://fixture.test/a.css', media: ['screen', 'print'], title: null, type: 'text/css', ruleCount: 2});
  const foreign = native('CSSStyleSheet', {disabled: true, href: 'https://other.test/b.css', media: null, title: 't', type: 'text/css'});
  Object.defineProperty(Object.getPrototypeOf(foreign), 'cssRules', {get() { const e = new Error('Cannot access rules'); e.name = 'SecurityError'; throw e; }});
  assert.deepEqual(project(foreign), {disabled: true, href: 'https://other.test/b.css', media: null, title: 't', type: 'text/css', ruleAccessError: 'SecurityError'});
});

test('a collection is read only up to the array limit, and one that throws or never ends gives the prefix it yielded', () => {
  const a = element({id: 'a'});
  let reads = 0;
  const endless = native('NodeList', {length: 1e9});
  const proxy = new Proxy(endless, {get(target, key) {
    if (typeof key === 'string' && /^\d+$/.test(key)) { reads += 1; return a; }
    return Reflect.get(target, key);
  }});
  assert.equal(project(proxy).length, 2000);
  assert.equal(reads, 2000, 'nothing past the limit was read');
  const throwing = native('HTMLCollection', {length: 3000});
  for (let i = 0; i < 1500; i++) throwing[i] = a;
  Object.defineProperty(throwing, 1500, {get() { throw new Error('gone'); }});
  assert.equal(project(throwing).length, 1500, 'the prefix before the throw');
  assert.equal(project(listOf('NodeList', [a, a])).length, 2);
  const prefix = native('DOMTokenList', {length: 5});
  prefix[0] = 'x';
  prefix[1] = 'y';
  Object.defineProperty(prefix, 2, {get() { throw new Error('gone'); }});
  assert.deepEqual(project(prefix), ['x', 'y']);
  const iterated = native('TextTrackList', {[Symbol.iterator]: function* () { for (let i = 0; ; i++) yield {kind: `k${i}`}; }});
  assert.equal(project(iterated).length, 2000, 'an endless iterator without a length stops at the limit');
  const iterThrows = native('TextTrackList', {[Symbol.iterator]: function* () { yield {kind: 'one'}; throw new Error('gone'); }});
  assert.deepEqual(project(iterThrows).map(t => t.kind), ['one']);
});

test('the service bounds the by-value result itself, and leaves an in-page projection unchanged', () => {
  let deep = 'bottom';
  for (let i = 0; i < 12; i++) deep = {next: deep};
  const raw = {list: Array.from({length: 2501}, (_, i) => i), keys: Object.fromEntries(Array.from({length: 300}, (_, i) => [`k${i}`, i])),
    long: 'y'.repeat(200005), deep};
  const bounded = boundResult(raw, RESULT_LIMITS);
  assert.equal(bounded.list.length, 2000);
  assert.equal(Object.keys(bounded.keys).length, 200);
  assert.equal(bounded.long, `${'y'.repeat(200000)}[Truncated]`);
  assert.ok(JSON.stringify(bounded.deep).includes('[MaxDepth]') && !JSON.stringify(bounded.deep).includes('bottom'));
  const projected = projectResult(raw, RESULT_LIMITS);
  assert.deepEqual(boundResult(projected, RESULT_LIMITS), projected, 'a projected value is already within the limits');
  assert.deepEqual(boundResult(projected, RESULT_LIMITS), bounded, 'and the two sides agree on the limits');
  for (const scalar of [undefined, null, 1, true, 'x']) assert.equal(boundResult(scalar, RESULT_LIMITS), scalar);
});

test('a bare attribute is the vendor\'s read-only attribute; a credential field\'s value attribute is null, as its list leaves it out', () => {
  const field = element({nodeName: 'INPUT', tagName: 'INPUT'});
  const plain = element();
  // An Attr is a node (nodeType 2): it must not take the node summary.
  const attr = (name, value, ownerElement) => native('Attr', {nodeType: 2, nodeName: name, name, value, ownerElement, textContent: value, cloneNode() {}});
  assert.deepEqual(project(attr('class', 'item', plain), e => e === field), {name: 'class', nodeName: 'class', nodeValue: 'item', specified: true, value: 'item'});
  assert.deepEqual(project(attr('name', 'password', field), e => e === field), {name: 'name', nodeName: 'name', nodeValue: 'password', specified: true, value: 'password'});
  assert.equal(project(attr('value', 'hunter2', field), e => e === field), null);
  assert.equal(project(attr('VALUE', 'hunter2', field), e => e === field), null);
  assert.deepEqual(project([attr('value', 'kept', plain)], e => e === field), [{name: 'value', nodeName: 'value', nodeValue: 'kept', specified: true, value: 'kept'}]);
  assert.deepEqual(project({nodeType: 2, name: 'plain'}), {nodeType: 2, name: 'plain'}, 'an ordinary object is not taken for an attribute');
});
