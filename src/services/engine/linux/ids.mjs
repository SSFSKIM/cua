// The element numbering of cua's Linux service (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Design
// "The service"; R/A §1.4), identical to the vendor's so a rendered tree reads the same on either service: cua-engine
// names a node by its bus name and object path, and the model sees a short decimal id instead.
//
// One counter per client, starting at 0 and shared by every window. Each window has a map from native id to decimal
// id. A full observation rebuilds the window's map from the nodes it returned, reusing a node's number while its
// native id stays in the map, so a node that leaves and later comes back is numbered anew; a query observation copies
// the map, so nodes the filter left out keep their numbers. Every node of the tree is numbered in preorder before the
// facade prunes anything, and keeps its native id as `native_id` (the facade's renderer reads it for X11 fallback nodes).
// Translating back: an all-digit element_id becomes the native id the window's map gives that number; anything else
// passes through as a native id; an unknown number is refused with the vendor's refresh sentence.
// The vendor's ElementIds (@oai/sky 0.7.5 targets/linux/element_ids.js), translated as it reads.

export class ElementIds {
  constructor() {
    this.nextId = 0;
    this.windows = new Map();
  }

  // Numbers `tree` (in place) for `window` ({id}); `query` is whether the observation was filtered by a query.
  assign(tree, window, query) {
    const previous = this.windows.get(window.id) ?? new Map();
    const current = query ? new Map(previous) : new Map();
    const visit = node => {
      const native = node.id;
      const id = current.get(native) ?? previous.get(native) ?? String(this.nextId++);
      current.set(native, id);
      node.native_id = native;
      node.id = id;
      node.children.forEach(visit);
    };
    visit(tree);
    this.windows.set(window.id, current);
  }

  // `request` with its decimal element_id translated to the native id, or `request` itself when it names none.
  resolve(request) {
    const id = request.element_id;
    if (id == null || !/^\d+$/.test(id)) return request;
    const map = request.window == null ? undefined : this.windows.get(request.window.id);
    for (const [native, numbered] of map ?? []) if (numbered === id) return {...request, element_id: native};
    throw new Error(`Unknown element ID ${id} for this window; refresh get_window_state()`);
  }
}
