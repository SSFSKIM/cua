// Ported from readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/tinysky_alt/bind_tab.js:4-101
// (the Target methods every browser Tab gets), for docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M3,
// CuaBootstrap; Table 1 "Target (App + decorated Tab)" and "decorated Tab"). #120's clean-room rewrite replaces this port
// before distribution.
//
// bind_tab(tab) adds the Target methods to a Tab (the browser client's decorateTab hook) and returns it. A tab with an
// accessibility API (`tab.ax`) observes and acts through it. A DOM-only tab observes through its Playwright DOM snapshot
// and screenshot API (both at once for the combined observation), and its input methods stay present but throw before
// any input. Browser input takes an element index from the latest AX snapshot (an integer >= 0) or null for the current
// focus, checked before anything is sent. The synchronous throws of the non-async methods are the vendor's.
import {image, text} from './display.mjs';

export function bind_tab(tab) {
  return Object.assign(tab, {
    async getAXState(options) {
      const state = tab.ax === undefined ? await domSnapshot(tab) : await tab.ax.get('state', diffingOptions(options));
      await text(state, options);
      return state;
    },
    async getScreenshot(options) {
      const bytes = tab.ax === undefined ? await screenshot(tab) : await tab.ax.get('screenshot');
      await image({bytes, options});
      return bytes;
    },
    async getAXStateAndScreenshot(options) {
      const observed = tab.ax === undefined
        ? await Promise.all([domSnapshot(tab), screenshot(tab)]).then(([state, shot]) => ({state, screenshot: shot}))
        : await tab.ax.get('both', diffingOptions(options));
      await text(observed.state, options);
      if (observed.screenshot !== undefined) await image({bytes: observed.screenshot, options});
      return observed;
    },
    async paste(elementIndex, value, options) {
      requireElementIndex(elementIndex);
      await accessibilityInput(tab).paste(elementIndex, value, options);
    },
    click: (target, options) => accessibilityInput(tab).click(target, options),
    drag: (from, to) => accessibilityInput(tab).drag(from, to),
    pressKey: (elementIndex, key) => {
      requireElementIndex(elementIndex);
      return accessibilityInput(tab).pressKey(elementIndex, key);
    },
    scroll: (target, direction, pages) => accessibilityInput(tab).scroll(target, direction, pages),
    selectText: (elementIndex, value, options) => accessibilityInput(tab).selectText(elementIndex, value, options),
    setValue: (elementIndex, value) => accessibilityInput(tab).setValue(elementIndex, value),
    typeText: (elementIndex, value) => {
      requireElementIndex(elementIndex);
      return accessibilityInput(tab).typeText(elementIndex, value);
    },
    performSecondaryAction: (elementIndex, action) => accessibilityInput(tab).performSecondaryAction(elementIndex, action),
  });
}

async function domSnapshot(tab) {
  if (tab.playwright?.domSnapshot === undefined) throw new Error(`Tab ${tab.id} does not support DOM snapshots.`);
  return tab.playwright.domSnapshot();
}

async function screenshot(tab) {
  if (tab.screenshot === undefined) throw new Error(`Tab ${tab.id} does not support screenshots.`);
  return tab.screenshot();
}

function accessibilityInput(tab) {
  if (tab.ax === undefined) throw new Error('This tab does not support accessibility input. Use its Playwright API.');
  return tab.ax;
}

function requireElementIndex(elementIndex) {
  if (elementIndex !== null && (!Number.isInteger(elementIndex) || elementIndex < 0))
    throw new Error('Browser input requires an element index from the latest AX snapshot, or null to use current focus.');
}

function diffingOptions(options) {
  const disableDiffing = options == null ? undefined : options.disableDiffing;
  if (disableDiffing !== undefined) return {disableDiffing};
}
