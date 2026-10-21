// What the native matrix's cells read off an observation's text, in the vendor's grammar (src/services/engine/render.mjs
// renders cua's in the same one): element lines, a labelled part, a value across the lines a multi-line value spans,
// the trailer (the focused element, selected text, selected elements), Finder's rows and visible range, TextEdit's
// scroll bar, and the finding-elements scorer's target search and line measures. Every function is self-contained (it
// calls only the others listed in EMBEDDED), so a cell embeds them by their source and runs them inside the REPL on the
// device: what leaves the cell is the answer, never the text. Role words are localized (TextEdit runs in English, the
// other scenes in the system's language, Korean on the mini), so nothing here depends on one except the finding
// scorer's two tables, which name both languages.
import {indexOfTarget, windowTitleOf} from '../repl-parity/scenes-mac-text.mjs';

export {indexOfTarget, windowTitleOf};

// Every element line, the trailer and a value's continuation lines aside: [{index, depth, content}].
export function elementLines(ax) {
  const out = [];
  for (const line of String(ax).split('\n')) {
    if (/^(The focused UI element is |Selected text: |Selected:$)/.test(line)) break;
    const m = /^[~+-]?(\t*)(\d+) (.*)$/.exec(line);
    if (m) out.push({index: Number(m[2]), depth: m[1].length, content: m[3]});
  }
  return out;
}
// The content of the element `index`'s line (its first line, for a multi-line value), or null.
export function lineOfIndex(ax, index) {
  return elementLines(ax).find(l => l.index === index)?.content ?? null;
}
// The index of the element above `index` (the nearest earlier line one level up), or null at the top.
export function parentIndexOf(ax, index) {
  const lines = elementLines(ax), i = lines.findIndex(l => l.index === index);
  if (i < 0) return null;
  for (let j = i - 1; j >= 0; j--) if (lines[j].depth === lines[i].depth - 1) return lines[j].index;
  return null;
}
// The first element carrying the part `<label>: <text>` whole (ended by a comma, the width rule's `(showing …)` or the
// line's end), or null.
export function indexOfPart(ax, label, text) {
  const escaped = `${label}: ${text}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const part = new RegExp(`(?:^| |, )${escaped}(?:,| \\(showing |$)`);
  return elementLines(ax).find(l => part.test(l.content))?.index ?? null;
}
// The value of the element `index` (its `Value: ` part, through the lines a multi-line value spans, up to the next
// element line or the blank line before the trailer), or null when the line carries none.
export function valueOfIndex(ax, index) {
  const lines = String(ax).split('\n');
  const at = lines.findIndex(line => { const m = /^[~+-]?\t*(\d+) /.exec(line); return m && Number(m[1]) === index; });
  if (at < 0) return null;
  const head = lines[at], start = head.indexOf('Value: ');
  if (start < 0) return null;
  const parts = [head.slice(start + 'Value: '.length)];
  for (let j = at + 1; j < lines.length && lines[j] !== '' && !/^[~+-]?\t*\d+ /.test(lines[j]); j++) parts.push(lines[j]);
  const value = parts.join('\n');
  // A part after the value on its first line (only short parts follow a value; a long value moves last).
  return parts.length === 1 ? value.split(', ')[0] : value;
}
// The trailer's focused element, or null.
export function focusedIndexOf(ax) {
  const m = /^The focused UI element is (\d+) /m.exec(String(ax));
  return m ? Number(m[1]) : null;
}
// The trailer's selected text, or null.
export function selectedTextOf(ax) {
  const m = /\nSelected text: ```\n([\s\S]*?)\n```/.exec(String(ax));
  return m ? m[1] : null;
}
// The trailer's selected elements: [index].
export function selectedIndexesOf(ax) {
  const text = String(ax), at = text.indexOf('\nSelected:\n');
  if (at < 0) return [];
  const out = [];
  for (const line of text.slice(at + '\nSelected:\n'.length).split('\n')) {
    const m = /^\t(\d+) /.exec(line);
    if (!m) break;
    out.push(Number(m[1]));
  }
  return out;
}
// Finder: the row holding the file `name` (its name field's line is two levels below the row), or null when the name
// is not in the text (outside the visible subset).
export function rowIndexOfName(ax, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const part = new RegExp(`(?:^| |: )${escaped}(?:,|$)`);
  const lines = elementLines(ax), i = lines.findIndex(l => part.test(l.content));
  if (i < 0) return null;
  for (let j = i - 1; j >= 0; j--) if (lines[j].depth === lines[i].depth - 2) return lines[j].index;
  return null;
}
// The width rule's visible range on the element `index` (`(showing <from>-<to>[, …] of <of> items)`), or null.
export function showingOf(ax, index) {
  const content = lineOfIndex(ax, index);
  const m = content && /\(showing (\d+)-(\d+)(?:, [\d, -]+)? of (\d+) items\)/.exec(content);
  return m ? {from: Number(m[1]), to: Number(m[2]), of: Number(m[3])} : null;
}
// TextEdit: the number an enabled, settable float scroll bar beside the element `index` carries (the vertical one; the
// horizontal bar of a wrapping text view is disabled), or null.
export function scrollBarValueBeside(ax, index) {
  const lines = elementLines(ax), i = lines.findIndex(l => l.index === index);
  if (i < 0) return null;
  const parent = parentIndexOf(ax, index);
  for (const line of lines) {
    if (line.depth !== lines[i].depth || line.index === index || parentIndexOf(ax, line.index) !== parent) continue;
    const flags = /\(([^)]*)\)/.exec(line.content)?.[1] ?? '';
    if (!/\bsettable, float\b/.test(flags) || /\bdisabled\b/.test(flags)) continue;
    const number = /(-?\d+(?:\.\d+)?)$/.exec(line.content);
    if (number) return Number(number[1]);
  }
  return null;
}

// ---- The finding-elements scorer (part 5) ---------------------------------------------------------------------------

// The role words an unnamed target is found by, per subrole, in English and Korean (the mini's system language): what
// the vendor's grammar prints for that subrole (the role description), the only thing the text says about an unnamed
// control. A target by orientation has no word: the text does not print an orientation.
const SUBROLE_WORDS = {
  AXCloseButton: ['close button', '닫기 버튼'],
  AXMinimizeButton: ['minimize button', '최소화 버튼'],
  AXFullScreenButton: ['full screen button', '전체 화면 버튼'],
};
// The element a scene's target names (scripts/repl-parity/scenes-mac.mjs SCENES[*].targets): by `name` or `value`
// (`match` exact or prefix) the first element line carrying it as a whole part, as the model would search; unnamed, by
// its subrole's role word, only when exactly one line is that control. -> index or null (a miss).
export function findTarget(ax, target) {
  const lines = elementLines(ax);
  const wanted = target.name ?? target.value;
  if (typeof wanted === 'string') {
    if (target.match !== 'prefix') return indexOfTarget(ax, wanted);
    const escaped = wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const part = new RegExp(`(?:^| |: )${escaped}[^,\\n]*(?:,|$)`);
    return lines.find(l => part.test(l.content))?.index ?? null;
  }
  const words = SUBROLE_WORDS[target.subrole];
  if (!words) return null;
  const found = lines.filter(l => words.some(w => l.content === w || l.content.startsWith(`${w} `) || l.content.startsWith(`${w},`)));
  return found.length === 1 ? found[0].index : null;
}
// The role words of the scenes' text, English and Korean (the goldens of both engines on the mini), longest first when
// read: the line measures split a line's role word off by this table.
const ROLE_WORDS = ['standard window', 'scroll area', 'scroll bar', 'text entry area', 'value indicator', 'increment arrow button', 'decrement arrow button',
  'increment page button', 'decrement page button', 'ruler marker', 'ruler', 'container', 'checkbox', 'pop up button', 'combo box', 'menu button', 'close button',
  'full screen button', 'minimize button', 'button', 'image', 'text field', 'text', 'menu bar', 'row', 'cell', 'link', 'toolbar', 'group', 'list', 'outline',
  'radio button', 'tab group', 'tab', 'heading', 'HTML content', 'web area', 'menu', 'sheet', 'dialog', 'unknown',
  '표준 윈도우', '스크롤 영역', '스크롤 막대', '텍스트 엔트리 영역', '텍스트 필드', '텍스트', '버튼', '팝업 버튼', '체크박스', '라디오 버튼', '메뉴 버튼', '닫기 버튼',
  '전체 화면 버튼', '최소화 버튼', '이미지', '셀', '윤곽체', '자르기 그룹', '자르기 도구', '도구 막대', '툴바', 'HTML 콘텐츠', '항목', '목록 상자', '목록', '링크', '탭 그룹', '탭',
  '콤보 상자', '그룹', '시트', '대화상자', '메뉴', '값 표시기', '화살표 증가 버튼', '화살표 감소 버튼', '페이지 증가 버튼', '페이지 감소 버튼'];
const LABELS = /^(Description|Rows|Columns|URL|Help|Value|Details|Placeholder|ID|Secondary Actions): /;
// The line measures of part 5's finding elements: how many element lines carry a title or a label (a bare title, or a
// `Description:` part), out of the lines whose role word the table knows; a menu item prints no role word, so a line
// under the menu bar is its bare title. A line neither splits is `unclassified` (counted apart, with a few of its role
// heads for the table). The same reading on both engines' text: the measure compares them, it does not grade either.
// -> {lines, named, unclassified, unclassifiedSamples}.
export function namedLines(ax) {
  const words = [...ROLE_WORDS].sort((a, b) => b.length - a.length);
  const lines = elementLines(ax);
  let named = 0, counted = 0, unclassified = 0;
  const samples = [];
  let menuDepth = null;
  for (const line of lines) {
    if (menuDepth !== null && line.depth <= menuDepth) menuDepth = null;
    let rest = null;
    // A menu item and a radio group print no role word: a line under the menu bar, or one opening with its flags.
    if (menuDepth !== null || line.content.startsWith('(')) rest = line.content.replace(/^\([^)]*\) ?/, '');
    else {
      const word = words.find(w => line.content === w || line.content.startsWith(`${w} `) || line.content.startsWith(`${w},`));
      if (word !== undefined) rest = line.content.slice(word.length).replace(/^ \([^)]*\)/, '').replace(/^[ ,]+/, '');
    }
    if (/^menu bar(?:$|[ ,])/.test(line.content)) menuDepth = line.depth;
    if (rest === null) {
      unclassified++;
      if (samples.length < 5) samples.push(line.content.split(' ').slice(0, 2).join(' ').slice(0, 40));
      continue;
    }
    counted++;
    const first = rest.split(', ')[0];
    const bareTitle = first !== '' && !LABELS.test(first) && !/^-?\d+(?:\.\d+)?$/.test(first) && !/^\(showing /.test(first);
    if (bareTitle || /(?:^|, )Description: /.test(rest)) named++;
  }
  return {lines: counted, named, unclassified, unclassifiedSamples: samples};
}
// How many element lines carry an `ID: ` part (the trailer's repeat of the focused line is not counted).
export function idCount(ax) {
  return elementLines(ax).filter(l => /(?:^| |, )ID: /.test(l.content)).length;
}

// The SHA-256 of a string's UTF-8, lowercase hex: what `--probe focus` reports as a value's hash (FocusProbe.swift
// valueHash), computed inside a cell so a read-back is compared by hash (part 6) with nothing of the value leaving it.
// Self-contained: the REPL's globals are not assumed to carry TextEncoder or crypto.
export function sha256Hex(text) {
  const bytes = [];
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) c = 0x10000 + ((c - 0xd800) << 10) + (s.charCodeAt(++i) - 0xdc00);
    else if (c >= 0xd800 && c <= 0xdfff) c = 0xfffd;
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  const k = [];
  for (let n = 2; k.length < 64; n++) {
    let prime = true;
    for (let d = 2; d * d <= n; d++) if (n % d === 0) { prime = false; break; }
    if (prime) k.push((Math.cbrt(n) % 1) * 2 ** 32 >>> 0);
  }
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const length = bytes.length;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const bits = length * 8;
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bits >>> (i * 8)) & 255);
  const hi = Math.floor(length / 2 ** 29);
  bytes[bytes.length - 8] = (hi >>> 24) & 255; bytes[bytes.length - 7] = (hi >>> 16) & 255; bytes[bytes.length - 6] = (hi >>> 8) & 255; bytes[bytes.length - 5] = hi & 255;
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  const w = new Array(64);
  for (let at = 0; at < bytes.length; at += 64) {
    for (let i = 0; i < 16; i++) w[i] = (bytes[at + 4 * i] << 24) | (bytes[at + 4 * i + 1] << 16) | (bytes[at + 4 * i + 2] << 8) | bytes[at + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + k[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((v, i) => { h[i] = (h[i] + v) | 0; });
  }
  return h.map(v => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

// The helpers' source, for a cell to embed (in this order: each calls only earlier ones or indexOfTarget).
export const EMBEDDED = [`const windowTitleOf = ${windowTitleOf.toString()};`, indexOfTarget, elementLines, lineOfIndex, parentIndexOf, indexOfPart, valueOfIndex,
  focusedIndexOf, selectedTextOf, selectedIndexesOf, rowIndexOfName, showingOf, scrollBarValueBeside,
  `const SUBROLE_WORDS = ${JSON.stringify(SUBROLE_WORDS)};`, findTarget, `const ROLE_WORDS = ${JSON.stringify(ROLE_WORDS)};`, `const LABELS = ${LABELS.toString()};`,
  namedLines, idCount, sha256Hex].map(f => (typeof f === 'string' ? f : f.toString())).join('\n');
