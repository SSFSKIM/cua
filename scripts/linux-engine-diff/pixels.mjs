// The family matrix's last-resort effect reader, for an application with no accessibility objects (Writer on its
// X11-only `gen` plugin): a capture of the window before and after the input, each through a fresh cua-engine
// with per-request retention (redirected for the capture, with M0.3's 40 ms wait, and unredirected after), and
// whether anything below the title rows changed. A typed key must draw a glyph, so no change means it did not
// arrive; a moved caret may draw nothing in a window without the focus, so for a click only a change counts.

import { copyFileSync } from 'node:fs';
import { join } from 'node:path';

import { Engine } from './engine.mjs';
import { xprobeDiff } from './images.mjs';
import { XPROBE } from './scenes.mjs';

let seq = 0;

/** A JPEG of the window, copied out of the capturing engine's private directory before it exits. */
export async function captureWindow(bin, scene, dir) {
  const engine = new Engine({ label: 'pixels', bin, args: ['--retention', 'per-request', '--settle-ms', '40'] }).start();
  try {
    const { response } = await engine.request('get_window_state', { window: { id: scene.id }, include_screenshot: true });
    const shot = response.ok ? response.output.screenshots?.[0]?.filepath : null;
    if (!shot) return null;
    const copy = join(dir, `pixels-${++seq}.jpg`);
    copyFileSync(shot, copy);
    return copy;
  } finally {
    await engine.close();
  }
}

/** Whether any compared pixel differs between two captures (null when either is missing). */
export function pixelsChanged(a, b) {
  if (!a || !b) return null;
  const d = xprobeDiff(XPROBE)(a, b);
  return d.over === null ? null : d.over > 0;
}
