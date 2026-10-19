// Synthetic Skyshots for the renderer's and the diff's unit tests (src/services/engine/render.mjs, diff.mjs): a node is
// written as [depth, role, fields], the rest of the Interfaces' Node shape defaulted.
export function node(token, depth, role, fields = {}) {
  const {flags, ...rest} = fields;
  return {
    token, depth, pid: 1, role, subrole: null, roleDescription: rest.roleDescription ?? role.replace(/^AX/, '').toLowerCase(),
    title: null, description: null, value: null, valueType: null, valueMarkdown: null, identifier: null,
    flags: {enabled: true, focused: false, focusable: false, selected: false, selectable: false, settable: false, ...flags},
    actions: [], frame: null, children: 0, ...rest,
  };
}

export function skyshot(nodes, fields = {}) {
  return {
    app: {bundleIdentifier: 'com.example.app', displayName: 'Example', appPath: '/Applications/Example.app', pid: 1},
    window: {title: 'W', frame: {x: 0, y: 0, width: 100, height: 100}, pid: 1},
    lineage: 'L1', revision: 1, nodes, truncated: null, screenshot: null, focused: null, selectedText: null,
    selectedElements: [], menuBar: [], ...fields,
  };
}
