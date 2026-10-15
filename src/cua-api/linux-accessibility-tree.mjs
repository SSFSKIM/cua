// Ported from readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/project/cua/sky_js/src/targets/linux/accessibility_tree.js:2-255
// (how the Sky facade renders a Linux window's AT-SPI/X11 tree as text), for
// docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M3, the Sky facade ./sky.mjs: a Linux get_window_state
// answer's ax_tree gains to_string). #120's clean-room rewrite replaces this port before distribution.
//
// accessibility_tree(node) defines a non-enumerable to_string (and Node's inspect hook) on the tree and every node in
// it, and returns it. to_string() prunes and condenses the tree (empty containers collapse, redundant text children
// fold into their parent, runs of plain text merge) and renders one line per node, tab-indented by depth:
// "<id> <role> (<states>) <labels>", with control characters escaped. The rendering is the vendor's exactly.

export function accessibility_tree(node) {
  for (const child of node.children) accessibility_tree(child);
  return Object.defineProperties(node, {
    to_string: {value: render, configurable: true},
    [Symbol.for('nodejs.util.inspect.custom')]: {value: render, configurable: true},
  });
}

function render() {
  const root = prune(this);
  if (root == null) return '';
  const lines = [];
  (function visit(node, depth) {
    lines.push(`${'\t'.repeat(depth)}${node.id} ${describe(node)}`);
    for (const child of node.children) visit(child, depth + 1);
  })(root, 0);
  return lines.join('\n');
}

function describe(node) {
  let role = node.role;
  if (isContainer(node)) role = 'container';
  else if (isText(node)) role = 'text';
  else if (role === 'menu item') role = '';
  const flags = [];
  const states = node.states;
  for (const state of ['focused', 'selected', 'expanded', 'indeterminate']) if (states == null ? undefined : states.includes(state)) flags.push(state);
  if (states == null ? undefined : states.includes('checked')) flags.push('checked');
  else if ((states == null ? undefined : states.includes('checkable')) && !states.includes('indeterminate')) flags.push('unchecked');
  if (states == null ? undefined : states.includes('editable')) flags.push('settable');
  if (states != null && !states.includes('enabled') && !isContainer(node) && !isText(node)) flags.push('disabled');
  const parts = labels(node);
  const singleContextMenu = node.actions?.filter(action => action.toLowerCase() === 'showcontextmenu').length === 1;
  const secondary = node.actions?.filter((action, index) =>
    (index !== 0 || !['press', 'click', 'dodefault', 'clickancestor'].includes(action.toLowerCase()))
    && (!singleContextMenu || action.toLowerCase() !== 'showcontextmenu'));
  if (secondary?.length) parts.push({title: 'Secondary Actions', text: secondary.join(', ')});
  parts.sort((a, b) => Number(isLong(a.text)) - Number(isLong(b.text)));
  const labelText = parts.map(part => (part.title == null || (parts.length === 1 && part.title !== 'Secondary Actions') ? part.text : `${part.title}: ${part.text}`)).join(', ');
  return [role, flags.length ? `(${flags.join(', ')})` : '', labelText].filter(Boolean).join(' ')
    .replaceAll('\r', '\\r').replaceAll('\n', '\\n').replaceAll('\t', '\\t');
}

// The node condensed for rendering, or undefined when nothing of it is worth showing.
function prune(node) {
  const children = [];
  for (const child of node.children) {
    const kept = prune(child);
    if (kept != null) children.push(kept);
  }
  const copy = Object.assign(Object.assign({}, node), {children});
  const labelled = hasLabel(copy);
  const interactive = isInteractive(copy);
  if (labelled || children.length !== 0 || (copy.native_id ?? copy.id).startsWith('x11:')
    || (interactive && (copy.states == null || copy.states.includes('enabled') || copy.states.includes('focused')))) {
    if (!interactive && !labelled && isContainer(copy)) {
      if (children.length === 1) return children[0];
      copy.children = children.flatMap(child => (child.role !== copy.role || isInteractive(child) || hasLabel(child) ? [child] : child.children));
    }
    if (!copy.children.some(hasInteractive)) {
      const own = labels(copy).map(label => label.text);
      let changed = true;
      while (changed) {
        changed = false;
        copy.children = copy.children.flatMap(child => {
          const childLabels = labels(child);
          if (isText(child) && childLabels.length > 0 && childLabels.every(label => own.some(text => text.includes(label.text)))) {
            changed = true;
            return child.children;
          }
          return [child];
        });
      }
    }
    if (!interactive) {
      const merged = [];
      let run = [];
      function flush() {
        const first = run[0];
        if (first != null) {
          if (run.length === 1) merged.push(first);
          else merged.push(Object.assign(Object.assign({}, first), {role: 'text', name: undefined, description: undefined,
            value: run.flatMap(item => labels(item).map(label => label.text)).join(' ')}));
        }
        run = [];
      }
      for (const child of copy.children) {
        if (isText(child) && !isInteractive(child) && child.children.length === 0) run.push(child);
        else {
          flush();
          merged.push(child);
        }
      }
      flush();
      copy.children = merged;
    }
    return copy;
  }
}

const isContainer = node => ['group', 'panel', 'filler', 'section', 'generic'].includes(node.role);
const isText = node => ['text', 'static', 'label'].includes(node.role);

function isInteractive(node) {
  return node.actions?.some(action => !['dodefault', 'clickancestor', 'showcontextmenu', 'scrolltovisible'].includes(action.toLowerCase())) === true
    || node.states?.some(state => ['focusable', 'focused', 'editable', 'selected', 'checkable', 'checked', 'indeterminate', 'expanded'].includes(state)) === true
    || ['push button', 'button', 'toggle button', 'check box', 'radio button', 'entry', 'password text', 'link', 'menu item', 'check menu item',
      'radio menu item', 'combo box', 'slider', 'spin button', 'scroll bar', 'scroll pane', 'viewport'].includes(node.role);
}

const hasInteractive = node => isInteractive(node) || node.children.some(hasInteractive);
const hasLabel = node => labels(node).length > 0 || node.role === 'image' || node.role === 'icon';

// The node's distinct nonblank name, description and value, titled except the name.
function labels(node) {
  const found = [];
  const seen = new Set();
  for (const [title, value] of [[undefined, node.name], ['Description', node.description], ['Value', node.value]]) {
    if (value != null && value.trim() !== '' && !seen.has(value)) {
      found.push({title, text: value});
      seen.add(value);
    }
  }
  return found;
}

const isLong = value => value.length > 100 || value.includes('\n');
