// The role probe (#171 M4, T13: Chromium drop signals, measured only): what the accessibility tree says is at a drag's
// start point, read before the press as an engine would read it to decide that a drag will never start a drag and drop
// (the hold's never-take signal, #263). From a window's frame, `Component.GetAccessibleAtPoint` (screen coordinates)
// is followed down to the deepest accessible; each step's role, name, states, interfaces and attributes are kept (the
// hit test's steps, not the parent chain: Chrome can answer the deepest from the frame in one step), and
// where the deepest carries `Text`, whether the point's character lies inside a selection (a press there drags the
// selected text). The harness's own reads (oracle.mjs, `busctl`), only of windows the harness opened.

/** The path AT-SPI answers for no accessible. */
export const NULL_PATH = '/org/a11y/atspi/null';

/** AT-SPI's state names by bit (`AtspiStateType`). */
export const STATE_NAMES = [
  'invalid', 'active', 'armed', 'busy', 'checked', 'collapsed', 'defunct', 'editable', 'enabled', 'expandable', 'expanded',
  'focusable', 'focused', 'has_tooltip', 'horizontal', 'iconified', 'modal', 'multi_line', 'multiselectable', 'opaque',
  'pressed', 'resizable', 'selectable', 'selected', 'sensitive', 'showing', 'single_line', 'stale', 'transient',
  'vertical', 'visible', 'manages_descendants', 'indeterminate', 'required', 'truncated', 'animated', 'invalid_entry',
  'supports_autocompletion', 'selectable_text', 'is_default', 'visited', 'checkable', 'has_popup', 'read_only',
];

/** The names of the states set in `GetState`'s two words. */
export function decodeStates([low, high]) {
  const out = [];
  for (let bit = 0; bit < STATE_NAMES.length; bit++) {
    const word = bit < 32 ? low : high;
    if ((word >>> bit % 32) & 1) out.push(STATE_NAMES[bit]);
  }
  return out;
}

/** Whether a character offset lies inside one of the `[start, end)` selections. */
export function inSelection(offset, selections) {
  return offset >= 0 && selections.some(([start, end]) => offset >= start && offset < end);
}

const TEXT = 'org.a11y.atspi.Text';

function describe(oracle, id) {
  const read = (member) => oracle.on(id, 'org.a11y.atspi.Accessible', member)[0];
  const node = { id, role: oracle.role(id), name: oracle.name(id) };
  try {
    node.states = decodeStates(read('GetState'));
  } catch {
    node.states = null;
  }
  try {
    node.interfaces = read('GetInterfaces').map((i) => i.replace(/^org\.a11y\.atspi\./, ''));
  } catch {
    node.interfaces = null;
  }
  try {
    node.attributes = read('GetAttributes');
  } catch {
    node.attributes = null;
  }
  return node;
}

/**
 * The accessibles at screen point `(x, y)` from `rootId` down: `{ms, chain, deepest, in_selection, error?}`. The walk
 * ends at no accessible, at a node that answers itself, at `maxDepth`, or at a failed call (kept in `error`).
 * `in_selection` is null when the deepest carries no `Text`.
 */
export function probeAt(oracle, rootId, x, y, { maxDepth = 24 } = {}) {
  const started = performance.now();
  const chain = [];
  let error;
  let node = rootId;
  try {
    for (let d = 0; d < maxDepth; d++) {
      const [[bus, path]] = oracle.on(node, 'org.a11y.atspi.Component', 'GetAccessibleAtPoint', 'iiu', x, y, 0);
      const next = path === NULL_PATH ? null : `${bus}:${path}`;
      if (!next || next === node) break;
      chain.push(describe(oracle, next));
      node = next;
    }
  } catch (e) {
    error = String(e.message ?? e).slice(0, 200);
  }
  const deepest = chain.at(-1) ?? null;
  let selected = null;
  if (deepest?.interfaces?.includes('Text')) {
    try {
      const [offset] = oracle.on(deepest.id, TEXT, 'GetOffsetAtPoint', 'iiu', x, y, 0);
      const [n] = oracle.on(deepest.id, TEXT, 'GetNSelections');
      const selections = Array.from({ length: n }, (_, k) => oracle.on(deepest.id, TEXT, 'GetSelection', 'i', k));
      selected = inSelection(offset, selections);
    } catch (e) {
      error ??= String(e.message ?? e).slice(0, 200);
    }
  }
  return { ms: Math.round((performance.now() - started) * 10) / 10, chain, deepest, in_selection: selected, ...(error ? { error } : {}) };
}
