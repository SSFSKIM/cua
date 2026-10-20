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
// targets are names the scene owns.
export function indexOfTarget(ax, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const part = new RegExp('(?:^| |: )' + escaped + '(?:,|$)');
  for (const line of String(ax).split('\n')) {
    const element = /^[~+-]?[\t ]*(\d+) (.*)$/.exec(line);
    if (element && part.test(element[2])) return Number(element[1]);
  }
  return null;
}
// Finder's click target in a row: a click on a selected row's name starts a rename, so the target is a cell of the row
// that holds `name` other than the name's own (the first such cell, the date in list view's default columns): the row
// is the line two levels above the name field, its cells the lines one level above, and the index is that cell's first
// child (its text), else the cell. Null when the name has no row or the row no other cell: never the name. It calls
// indexOfTarget, so a cell that embeds it embeds both.
export function indexOfRowCell(ax, name) {
  const lines = String(ax).split('\n').map(line => /^[~+-]?(\t*)(\d+) /.exec(line)).map(m => (m ? {depth: m[1].length, index: Number(m[2])} : null));
  const at = indexOfTarget(ax, name);
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
export const actionIndex = (ax, {click}) => (typeof click === 'string' ? indexOfTarget(ax, click) : indexOfRowCell(ax, click.rowCellOf));
