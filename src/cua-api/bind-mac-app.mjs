// Ported from readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/bind_mac_app.js:5-156
// (a macOS App: the Target methods bound to one app through the trusted Sky service), for
// docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M3, CuaBootstrap; Table 1 "Target (App + decorated Tab)"
// and "App"). #120's clean-room rewrite replaces this port before distribution.
//
// bind_mac_app(sky, app) -> App. Element indexes and [x, y] coordinates map to Sky's snake_case payloads; scroll takes a
// page count (an object distance is refused before any input); paste defaults to text; screenshots are read from Sky's
// data: or file: URL and returned as bytes, a missing one an error (the combined observation returns the state alone).
import {image, screenshot_bytes, text} from './display.mjs';

export function bind_mac_app(sky, app) {
  return {
    async getAXState(options) {
      const state = (await sky.get_app_state(appStateRequest(app, options))).text;
      await text(state, options);
      return state;
    },
    async getScreenshot(options) {
      const appState = await sky.get_app_state({app});
      if (appState.screenshot === null) throw new Error(`Screenshot unavailable for ${app}.`);
      const bytes = await screenshot_bytes(appState.screenshot.url);
      await image({bytes, options});
      return bytes;
    },
    async getAXStateAndScreenshot(options) {
      const appState = await sky.get_app_state(appStateRequest(app, options));
      const state = appState.text;
      await text(state, options);
      if (appState.screenshot === null) return {state};
      const bytes = await screenshot_bytes(appState.screenshot.url);
      await image({bytes, options});
      return {state, screenshot: bytes};
    },
    paste(value, options) {
      const format = (options == null ? undefined : options.format) ?? 'text';
      return sky.paste({app, text: value, format});
    },
    click(target, options) {
      const request = {app};
      if (Array.isArray(target)) {
        request.x = target[0];
        request.y = target[1];
      } else {
        request.element_index = target;
      }
      if ((options == null ? undefined : options.mouseButton) !== undefined) request.mouse_button = options.mouseButton;
      if ((options == null ? undefined : options.clickCount) !== undefined) request.click_count = options.clickCount;
      return sky.click(request);
    },
    drag(from, to) {
      const [fromX, fromY] = from;
      const [toX, toY] = to;
      return sky.drag({app, from_x: fromX, from_y: fromY, to_x: toX, to_y: toY});
    },
    pressKey: key => sky.press_key({app, key}),
    scroll(target, direction, pages) {
      if (typeof pages == 'object') throw new Error('macOS scroll accepts pages, not pixels.');
      const request = {app, direction};
      if (Array.isArray(target)) {
        request.x = target[0];
        request.y = target[1];
      } else {
        request.element_index = target;
      }
      if (pages !== undefined) request.pages = pages;
      return sky.scroll(request);
    },
    selectText(elementIndex, value, options) {
      const request = {app, element_index: elementIndex, text: value};
      if ((options == null ? undefined : options.prefix) !== undefined) request.prefix = options.prefix;
      if ((options == null ? undefined : options.suffix) !== undefined) request.suffix = options.suffix;
      if ((options == null ? undefined : options.selectionType) !== undefined) request.selection_type = options.selectionType;
      return sky.select_text(request);
    },
    setValue: (elementIndex, value) => sky.set_value({app, element_index: elementIndex, value}),
    typeText: value => sky.type_text({app, text: value}),
    performSecondaryAction: (elementIndex, action) => sky.perform_secondary_action({app, element_index: elementIndex, action}),
  };
}

function appStateRequest(app, options) {
  const request = {app};
  if ((options == null ? undefined : options.disableDiffing) !== undefined) request.disableDiff = options.disableDiffing;
  return request;
}
