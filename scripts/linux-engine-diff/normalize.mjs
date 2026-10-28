// Output normalization (Design, Verification system): native ids mapped by position, file paths dropped, and, for
// equivalent windows (each engine's own scene window), the window's own label and placement set aside.

import { isDeepStrictEqual } from 'node:util';

const TEXT_FIELDS = ['name', 'description', 'value'];

/**
 * Text the application changes between two reads of an unchanged window, whatever engine reads it: Chrome puts its
 * tab's current memory use into the tab's name. Replaced in every comparison.
 */
export const VOLATILE = [[/Memory usage - [\d.]+ [KMG]B/g, 'Memory usage - <n>']];

function replaceLabel(text, label) {
  if (typeof text !== 'string') return text;
  let out = text;
  for (const [pattern, replacement] of VOLATILE) out = out.replace(pattern, replacement);
  if (label instanceof RegExp) return out.replace(label, '<label>');
  return label ? out.split(label).join('<label>') : out;
}

/** Nodes in preorder. */
export function preorder(tree) {
  const out = [];
  const visit = (node) => {
    out.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  if (tree) visit(tree);
  return out;
}

export function retainedIds(state) {
  return preorder(state.ax_tree).map((n) => n.id);
}

/**
 * A `get_window_state` output in comparable form. `exactIds` keeps native ids (two reads of one window); otherwise
 * ids become preorder positions and the window's id and position are dropped (equivalent windows). `label` is the
 * window's own distinguishing text (its scene label, a string, or a global RegExp matching every label of the run, as
 * gedit lists the other scene windows' files in its recent-files menu), replaced wherever it appears.
 */
export function normalizeState(state, { label = null, exactIds = false } = {}) {
  let position = 0;
  const node = (n) => {
    const out = {};
    for (const [key, value] of Object.entries(n)) {
      if (key === 'children') continue;
      if (key === 'id') out.id = exactIds ? value : position;
      else out[key] = TEXT_FIELDS.includes(key) ? replaceLabel(value, label) : value;
    }
    position += 1;
    out.children = (n.children ?? []).map(node);
    return out;
  };
  const window = { ...state.window, title: replaceLabel(state.window?.title, label) };
  if (!exactIds) {
    delete window.id;
    delete window.x;
    delete window.y;
  }
  return {
    ax_tree: state.ax_tree ? node(state.ax_tree) : null,
    ax_tree_source: state.ax_tree_source,
    screenshots: (state.screenshots ?? []).map(() => ({})),
    window,
  };
}

/** Compares two outputs; reports equality, node counts and the first difference (preorder position and field). */
export function compareStates(a, b, { exactIds = false, labelA = null, labelB = null } = {}) {
  const na = normalizeState(a, { exactIds, label: labelA });
  const nb = normalizeState(b, { exactIds, label: labelB });
  const pa = preorder(na.ax_tree);
  const pb = preorder(nb.ax_tree);
  const result = { equal: true, nodes: pa.length, nodes_b: pb.length, first_difference: null };
  // The differing values are kept, shortened: every compared window is one the harness owns.
  const show = (v) => (v === undefined ? undefined : JSON.stringify(v).slice(0, 160));
  const differ = (position, field, x, y) => {
    result.equal = false;
    result.first_difference = { position, field, a: show(x), b: show(y) };
    return result;
  };
  for (const field of ['ax_tree_source', 'window', 'screenshots']) {
    if (!isDeepStrictEqual(na[field], nb[field])) return differ(null, field, na[field], nb[field]);
  }
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (!x || !y) return differ(i, 'missing');
    const keys = new Set([...Object.keys(x), ...Object.keys(y)]);
    for (const key of keys) {
      if (key === 'children') {
        if (x.children.length !== y.children.length) return differ(i, 'children', x.children.length, y.children.length);
      } else if (!isDeepStrictEqual(x[key], y[key])) {
        return differ(i, key, x[key], y[key]);
      }
    }
  }
  return result;
}
