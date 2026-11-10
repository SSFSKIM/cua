// Ported from readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/bind_linux_app.js:7-158
// (a Linux App: the Target methods bound to one window through the trusted Sky service), for
// docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M3, CuaBootstrap; Table 1 "Target (App + decorated Tab)"
// and "App"). #120's clean-room rewrite replaces this port before distribution.
//
// bind_linux_app(sky, window) -> App bound to `window`; every observation refreshes the bound window from Sky's answer.
// The accessibility state is always full and names its source ("Accessibility source: <source>\n<tree>"). A window has
// at most one screenshot region; a missing screenshot is an error alone (the combined observation returns the state).
// Element ids are String(index); scroll takes { pixels } (a positive finite number) or nothing, never a page count;
// paste is text only and types it; selectText and setValue are unavailable. Each refusal comes before any input.
//
// cua's one addition to the vendor's binder (docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Observation;
// #171 M3): a window state whose `truncated` ({nodes, depth, failed}, cua-engine's count of the elements cut by the
// element limit, the depth limit and failed reads) counts any, ends its rendered state with the line
// `Accessibility tree truncated: at least <n> elements not shown (<reason>)`, in getAXState and the combined observation
// alike, emitted or not. Each count is a cut point whose subtree is never read, so <n> is a lower bound. The reason
// names each cause that cut something, with its count when there are several. A state without the field renders as the
// vendor's does.
//
// And its second (the design session's ruling, 2026-11-10; #171 M4 T14): a window state whose `notice` is a non-empty
// string (cua-engine's report of what a drag's after-release watch left pending: a late drag and drop, an unconfirmed
// drop or a failed watch) starts its rendered state with that sentence as its first line, before `Accessibility
// source:`, so the model reads it before it acts again. A state without it, or with an empty one, renders as before,
// byte for byte. The screenshot alone, the window and app lists and the releases show no notice: the next acting
// request is refused with it, so the model cannot act again without meeting it.
import {image, one_screenshot, positive_pixels, require_plain_text, text} from './display.mjs';

// The causes of `truncated`, in the order the line names them.
const TRUNCATION_CAUSES = [['nodes', 'over the element limit'], ['depth', 'below the depth limit'], ['failed', 'unreadable']];

// The truncation line for a state's `truncated`, with the newline that puts it after the tree, or '' when it cut nothing.
function truncation(truncated) {
  const cut = TRUNCATION_CAUSES.map(([key, words]) => [Number.isSafeInteger(truncated?.[key]) && truncated[key] > 0 ? truncated[key] : 0, words]).filter(([count]) => count > 0);
  if (cut.length === 0) return '';
  const total = cut.reduce((sum, [count]) => sum + count, 0);
  const reason = cut.length === 1 ? cut[0][1] : cut.map(([count, words]) => `${count} ${words}`).join(', ');
  return `\nAccessibility tree truncated: at least ${total} elements not shown (${reason})`;
}

// A state's pending drag notice as its first line, with the newline that puts the rest after it, or ''.
const pending = notice => (typeof notice === 'string' && notice !== '' ? `${notice}\n` : '');

export function bind_linux_app(sky, window) {
  async function windowState({include_screenshot}) {
    const state = await sky.get_window_state({window, include_screenshot});
    window = state.window;
    return state;
  }
  const describe = state => `${pending(state.notice)}Accessibility source: ${state.ax_tree_source}\n${state.ax_tree.to_string()}${truncation(state.truncated)}`;
  return {
    async getAXState(options) {
      const state = describe(await windowState({include_screenshot: false}));
      await text(state, options);
      return state;
    },
    async getScreenshot(options) {
      const state = await windowState({include_screenshot: true});
      const shot = one_screenshot(state.screenshots, window.id);
      if (shot === undefined) throw new Error(`Screenshot unavailable for window ${window.id}.`);
      const bytes = shot.bytes;
      await image({bytes, options});
      return bytes;
    },
    async getAXStateAndScreenshot(options) {
      const observed = await windowState({include_screenshot: true});
      const state = describe(observed);
      await text(state, options);
      const shot = one_screenshot(observed.screenshots, window.id);
      if (shot === undefined) return {state};
      const bytes = shot.bytes;
      await image({bytes, options});
      return {state, screenshot: bytes};
    },
    click(target, options) {
      const request = {window};
      if (Array.isArray(target)) {
        request.x = target[0];
        request.y = target[1];
      } else {
        request.element_id = String(target);
      }
      if ((options == null ? undefined : options.mouseButton) !== undefined) request.mouse_button = options.mouseButton;
      if ((options == null ? undefined : options.clickCount) !== undefined) request.click_count = options.clickCount;
      return sky.click(request);
    },
    drag: (from, to) => sky.drag({window, path: [{x: from[0], y: from[1]}, {x: to[0], y: to[1]}]}),
    scroll(target, direction, distance) {
      if (typeof distance == 'number') throw new Error('Linux scroll accepts { pixels }, not pages.');
      const request = {window, direction};
      if (Array.isArray(target)) {
        request.x = target[0];
        request.y = target[1];
      } else {
        request.element_id = String(target);
      }
      if (distance !== undefined) request.pixels = positive_pixels(distance.pixels);
      return sky.scroll(request);
    },
    async selectText() {
      throw new Error('selectText is unavailable on Linux.');
    },
    async setValue() {
      throw new Error('setValue is unavailable on Linux; use click, pressKey, and typeText.');
    },
    paste: (value, options) => {
      require_plain_text(options, 'Linux');
      return sky.type_text({window, text: value});
    },
    pressKey: key => sky.press_key({window, key}),
    typeText: value => sky.type_text({window, text: value}),
    performSecondaryAction(elementIndex, action) {
      const elementId = String(elementIndex);
      return sky.perform_secondary_action({window, element_id: elementId, action});
    },
  };
}
