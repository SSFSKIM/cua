// Ported from readable chatgpt-26.928.40906 R/cua_node/@oai/cua/dist/lib/js/oai_js_cua/src/core/display.js:3-24,
// core/positive_pixels.js:2-7, core/screenshot_bytes.js:3-12, tinysky_alt/one_screenshot.js:2-9 and
// tinysky_alt/require_plain_text.js:2-6 (the facade's shared output and argument helpers), for
// docs/doperpowers/specs/2026-10-14-own-repl-host-design.md (M3, CuaBootstrap). #120's clean-room rewrite replaces this
// port before distribution.
//
// An observation writes its text as the `cua.state` output item and its image through nodeRepl.emitImage, unless its
// options say emit: false; no downscaling.

// Writes `value` as the cell's `cua.state` output unless `options.emit` is false.
export async function text(value, options) {
  if ((options == null ? undefined : options.emit) !== false) {
    const nodeRepl = globalThis.nodeRepl;
    await nodeRepl?.write?.call(nodeRepl, value, 'cua.state');
  }
}

// Emits `bytes` as an image unless `options.emit` is false.
export async function image({bytes, options}) {
  if (options?.emit !== false) {
    const nodeRepl = globalThis.nodeRepl;
    await nodeRepl?.emitImage?.call(nodeRepl, bytes);
  }
}

export function positive_pixels(pixels) {
  if (!Number.isFinite(pixels) || pixels <= 0) throw new Error('pixels must be a positive finite number.');
  return pixels;
}

// A screenshot's bytes from its data: or file: URL.
export async function screenshot_bytes(url) {
  if (url.startsWith('data:')) return Uint8Array.from(Buffer.from(url.split(',')[1] ?? '', 'base64'));
  const {readFile} = await import('node:fs/promises');
  const {fileURLToPath} = await import('node:url');
  return readFile(fileURLToPath(url));
}

export function one_screenshot(screenshots, windowId) {
  if (screenshots.length > 1) throw new Error(`Window ${windowId} has multiple screenshot regions; a single screenshot is unavailable.`);
  return screenshots[0];
}

export function require_plain_text(options, platform) {
  if ((options == null ? undefined : options.format) !== undefined && options.format !== 'text') throw new Error(`${platform} paste supports only text format.`);
}
