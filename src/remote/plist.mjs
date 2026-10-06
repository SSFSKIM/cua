// XML property lists, read and written by cua itself (no plutil): the launchd job cua writes (src/remote/launchd.mjs)
// and the IORegistry root `ioreg -a` prints (src/remote/console.mjs). Reads the XML form only: dict, array, key,
// string, integer, real, true, false, date (kept as its text) and data (a Buffer); anything else is `plist_invalid`.
import {fail} from '../runtime/errors.mjs';

const ENTITIES = {amp: '&', lt: '<', gt: '>', quot: '"', apos: '\''};
// Characters XML 1.0 cannot carry at all, escaped or not.
const UNREPRESENTABLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/;

const invalid = why => fail('plist_invalid', `not a property list: ${why}`);

export const representable = text => !UNREPRESENTABLE.test(text);

// A parsed <dict>: a plain object (an <array> is an Array, a <data> a Buffer).
export const isDict = value => value !== null && typeof value === 'object' && !Array.isArray(value) && !Buffer.isBuffer(value);

const ESCAPES = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&apos;'};
export const escapeXml = text => text.replace(/[&<>"']/g, c => ESCAPES[c]);

function unescape(text) {
  return text.replace(/&(#x[0-9A-Fa-f]+|#\d+|[a-z]+);|&/g, (_, name) => {
    if (name === undefined) invalid('a bare & in text');
    if (name.startsWith('#')) {
      const code = name.startsWith('#x') ? parseInt(name.slice(2), 16) : Number(name.slice(1));
      if (!(code <= 0x10ffff)) invalid(`&${name}; is past the last Unicode character`);
      return String.fromCodePoint(code);
    }
    if (!Object.hasOwn(ENTITIES, name)) invalid(`unknown entity &${name};`);
    return ENTITIES[name];
  });
}

// Tokens: {open, close, empty} tags by name, and text (`blank` when only whitespace). The prolog, the doctype and
// comments are dropped.
function tokenize(text) {
  const tokens = [];
  const pattern = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z]+)(?:\s[^>]*?)?(\/?)>|([^<]+)|(<)/g;
  for (const [, slash, name, selfClosing, chars, stray] of text.matchAll(pattern)) {
    if (stray) invalid('a stray <');
    if (chars !== undefined) { tokens.push({text: chars, blank: !chars.trim()}); continue; }
    if (name === undefined) continue;
    tokens.push({tag: name, kind: slash ? 'close' : selfClosing ? 'empty' : 'open'});
  }
  return tokens;
}

// Object.defineProperty, so a key such as __proto__ is an ordinary key.
const put = (object, key, value) => Object.defineProperty(object, key, {value, enumerable: true, writable: true, configurable: true});

export function parsePlist(text) {
  if (typeof text !== 'string') invalid('no text');
  const tokens = tokenize(text);
  let at = 0;
  // Between elements whitespace means nothing; inside a <string> or <key> it is the value (`content`).
  const skipBlank = () => { while (tokens[at]?.blank) at++; };
  const peek = () => { skipBlank(); return tokens[at]; };
  const next = () => { skipBlank(); return tokens[at++] ?? invalid('it ends early'); };
  const expectClose = tag => {
    const token = next();
    if (token.kind !== 'close' || token.tag !== tag) invalid(`<${tag}> is not closed`);
  };
  // The text inside <tag>…</tag> (an empty element is the empty string).
  const content = open => {
    if (open.kind === 'empty') return '';
    let chars = '';
    if (tokens[at]?.text !== undefined) chars = unescape(tokens[at++].text);
    expectClose(open.tag);
    return chars;
  };

  function value() {
    const open = next();
    if (open.kind === 'close' || open.text !== undefined) invalid('a value was expected');
    switch (open.tag) {
      case 'dict': {
        const dict = {};
        if (open.kind === 'empty') return dict;
        while (!(peek()?.kind === 'close' && peek().tag === 'dict')) {
          const key = next();
          if (key.tag !== 'key' || key.kind === 'close') invalid('a dict entry does not start with <key>');
          put(dict, content(key), value());
        }
        next();
        return dict;
      }
      case 'array': {
        const array = [];
        if (open.kind === 'empty') return array;
        while (!(peek()?.kind === 'close' && peek().tag === 'array')) array.push(value());
        next();
        return array;
      }
      case 'string': case 'date': return content(open);
      case 'integer': {
        const chars = content(open).trim();
        if (!/^[+-]?\d+$/.test(chars)) invalid(`<integer>${chars}</integer>`);
        return Number(chars);
      }
      case 'real': {
        const number = Number(content(open).trim());
        if (Number.isNaN(number)) invalid('a <real> that is not a number');
        return number;
      }
      case 'data': return Buffer.from(content(open).replace(/\s+/g, ''), 'base64');
      case 'true': case 'false':
        if (open.kind === 'open') expectClose(open.tag);
        return open.tag === 'true';
      default: return invalid(`<${open.tag}>`);
    }
  }

  const root = next();
  if (root.tag !== 'plist' || root.kind !== 'open') invalid('no <plist> element');
  const result = value();
  expectClose('plist');
  skipBlank();
  if (at !== tokens.length) invalid('something follows </plist>');
  return result;
}
