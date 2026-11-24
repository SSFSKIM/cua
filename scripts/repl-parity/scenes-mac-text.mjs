// What the macOS scenes read off an observation's text (./scenes-mac.mjs): the header's window title and the element an
// action targets. Pure and self-contained, so a driver can embed each function into a cell by its source, as M0's
// measure cells did (indexOfRowCell calls indexOfTarget, so a cell that embeds it embeds both). indexOfTarget and
// indexOfRowCell are M0's, unchanged (scripts/spike/engine/measure/cells.mjs).

// The header's window title (`Window: "<title>", App: …`), or null.
export const windowTitleOf = text => /^Window: "([^"]*)"/m.exec(String(text))?.[1] ?? null;

// The index of the first element line that names `name` as a whole part of the grammar: the bare title, or a label's
// text (`Value: <name>`), ended by the next part's comma or the line's end, whatever the role word (the vendor's are
// localized). A longer name that begins with it ("Scene options") or a window title that only begins with it ("cua scene
// page - Chrome for Testing") is not it. A longer bare title that ends with it ("My Scene option") can be: the role word
// before a bare title is localized and multi-word, so its boundary is only a space. The first matching line wins, so
// targets are names the scene owns. On cua's lane (`rendering` 'cua', by default the lane the run's bind recorded,
// globalThis.__axRendering) a multi-line value prints on its element's one line with its breaks escaped
// (src/services/engine/render.mjs escapeLineBreaks, #526), and so does every other part's continuation. There a line
// holding an escape is matched only within its first line (the text before its first escape, the vendor's element line):
// a name ended there by a comma, as before, or, the one exception, a final `Value:` part's first line, the escape right
// after the name and nothing `, ` after it (a value followed by another part is not found, ruling 1182), its label at a
// real part start (ruling 1185: after `, `, or as the element's first part, anchored after its role words and flags
// group from the element's start), never inside another part's text. A part's continuation never matches. Every other
// line, and the vendor's lane, match exactly as before. A part whose own text holds `Value:` is #561's.
export function indexOfTarget(ax, name, rendering = globalThis.__axRendering) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const part = new RegExp('(?:^| |: )' + escaped + '(?:,|$)'), inFirst = new RegExp('(?:^| |: )' + escaped + ',');
  const flag = '(?:selectable|selected|disabled|expanded|collapsed|settable|boolean|integer|float|string|date|unknown|sent by me)';
  const finalValue = new RegExp('(?:^(?:[^,:()]+ )?(?:\\(' + flag + '(?:, ' + flag + ')*\\) )?|, )Value: ' + escaped + '$');
  const escape = /\\(?:n|r|u(?:000b|000c|001c|001d|001e|0085|2028|2029))/;
  for (const line of String(ax).split('\n')) {
    const element = /^[~+-]?[\t ]*(\d+) (.*)$/.exec(line);
    if (!element) continue;
    const at = rendering === 'cua' ? element[2].search(escape) : -1;
    if (at < 0 ? part.test(element[2])
      : inFirst.test(element[2].slice(0, at)) || (finalValue.test(element[2].slice(0, at)) && !element[2].slice(at).includes(', '))) return Number(element[1]);
  }
  return null;
}
// Finder's click target in a row: a click on a selected row's name starts a rename, so the target is a cell of the row
// that holds `name` other than the name's own (the first such cell, the date in list view's default columns): the row
// is the line two levels above the name field, its cells the lines one level above, and the index is that cell's first
// child (its text), else the cell. Null when the name has no row or the row no other cell: never the name. It calls
// indexOfTarget, so a cell that embeds it embeds both.
export function indexOfRowCell(ax, name, rendering = globalThis.__axRendering) {
  const lines = String(ax).split('\n').map(line => /^[~+-]?(\t*)(\d+) /.exec(line)).map(m => (m ? {depth: m[1].length, index: Number(m[2])} : null));
  const at = indexOfTarget(ax, name, rendering);
  const i = lines.findIndex(l => l && l.index === at);
  if (i < 0) return null;
  const depth = lines[i].depth;
  for (let j = i + 1; j < lines.length; j++) {
    const line = lines[j];
    if (!line) continue;
    if (line.depth <= depth - 2) return null;
    if (line.depth === depth - 1) {
      const child = lines[j + 1];
      return child && child.depth === depth ? child.index : line.index;
    }
  }
  return null;
}
// The element index a scene's `action` clicks in an observation's text, or null when it is not exposed there.
// `rendering`: the text's lane, as indexOfTarget takes it.
export const actionIndex = (ax, {click}, rendering = globalThis.__axRendering) => (typeof click === 'string' ? indexOfTarget(ax, click, rendering) : indexOfRowCell(ax, click.rowCellOf, rendering));
