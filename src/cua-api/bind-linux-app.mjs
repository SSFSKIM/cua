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
import {image, one_screenshot, positive_pixels, require_plain_text, text} from './display.mjs';

export function bind_linux_app(sky, window) {
  async function windowState({include_screenshot}) {
    const state = await sky.get_window_state({window, include_screenshot});
    window = state.window;
    return state;
  }
  const describe = state => `Accessibility source: ${state.ax_tree_source}\n${state.ax_tree.to_string()}`;
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
