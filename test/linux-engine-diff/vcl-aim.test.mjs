import assert from 'node:assert/strict';
import { test } from 'node:test';

import { locate } from '../../scripts/linux-engine-diff/drag.mjs';
import { vclShift, vclShiftOf } from '../../scripts/linux-engine-diff/vcl-aim.mjs';

// Writer's frame on the #171 VM (task 72's hierarchy sitting): the client panel at the client's origin, the menu bar's
// panel, the panel hosting VCL's root pane 27 px lower; the root pane at the client's origin after a configure
// (`rootY` 21) and at the host's after a pointer event (48), the paragraph's extents with it.
function writerOracle(rootY) {
  const d = rootY - 21;
  const nodes = {
    frame: { role: 'frame', extents: { x: 0, y: 0, w: 1280, h: 800 }, children: ['hidden', 'client'] },
    hidden: { role: 'panel', extents: { x: -2147483648, y: -2147483648, w: 1, h: 1 }, children: [] },
    client: { role: 'panel', extents: { x: 0, y: 21, w: 1280, h: 779 }, children: ['menus', 'host'] },
    menus: { role: 'panel', extents: { x: 0, y: 21, w: 1280, h: 27 }, children: [] },
    host: { role: 'panel', extents: { x: 0, y: 48, w: 1280, h: 752 }, children: ['root'] },
    root: { role: 'root pane', extents: { x: 0, y: rootY, w: 1280, h: 752 }, children: [] },
    doc: { role: 'document text', children: ['p0', 'p1'] },
    p0: { role: 'paragraph' },
    p1: { role: 'paragraph' },
  };
  return {
    children: (id) => nodes[id].children,
    role: (id) => nodes[id].role,
    extents: (id) => nodes[id].extents,
    // character 2 of the first line, 8x15, at y 220 in VCL's coordinates after a configure
    charExtents: (id, offset) => ({ x: 282 + 8 * offset, y: 220 + d, w: 8, h: 15 }),
  };
}

const scene = (family) => ({ family, kindOf: 'paragraphs', document: 'doc', frame: 'frame', window: { x: 0, y: 21, width: 1280, height: 779 } });

test("a Writer drag is aimed where VCL draws the text, by the host panel's offset, after a configure as after a pointer event", async () => {
  for (const rootY of [21, 48]) {
    const at = await locate({ oracle: writerOracle(rootY), desktop: null }, scene('writer'), ['select']);
    // the line is drawn at client y 226 to 241 (the capture): the aim is its centre, whatever VCL's state
    assert.deepEqual(at.text.cell(2), [302, 234], `root pane at ${rootY}`);
  }
});

test("another family's text keeps the AT-SPI extents less the window's origin", async () => {
  const at = await locate({ oracle: writerOracle(21), desktop: null }, scene('gedit-like'), ['select']);
  assert.deepEqual(at.text.cell(2), [302, 207]);
});

test("VCL's offset is the host's origin less the root pane's, and only the menu bar's shape is read", () => {
  const client = { x: 0, y: 21, w: 1280, h: 779 };
  const host = { x: 0, y: 48, w: 1280, h: 752 };
  assert.deepEqual(vclShiftOf({ client, host, root: { ...host, y: 21 } }), { dx: 0, dy: 27 });
  assert.deepEqual(vclShiftOf({ client, host, root: host }), { dx: 0, dy: 0 }, 'agreeing after a pointer event');
  assert.throws(() => vclShiftOf({ client, host, root: { ...host, y: 30 } }), /unknown shape/, 'not at the client origin');
  assert.throws(() => vclShiftOf({ client, host, root: { ...host, y: 21, h: 700 } }), /unknown shape/, 'another size');
  assert.throws(() => vclShiftOf({ client, host, root: { ...host, x: 4, y: 21 } }), /unknown shape/, 'sideways');
  assert.deepEqual(vclShift(writerOracle(21), 'frame'), { dx: 0, dy: 27 }, 'found under the frame, past a hidden panel');
  assert.throws(() => vclShift({ ...writerOracle(21), children: (id) => (id === 'frame' ? [] : []) }, 'frame'), /no panel hosting a root pane/);
});

test("the declared refusal is the engine's own sentence (native/linux-engine/src/vcl.rs `UNTRUSTED`)", async () => {
  const { readFileSync } = await import('node:fs');
  const { VCL_UNTRUSTED } = await import('../../scripts/linux-engine-diff/deviations.mjs');
  const source = readFileSync(new URL('../../native/linux-engine/src/vcl.rs', import.meta.url), 'utf8');
  const sentence = source.match(/pub const UNTRUSTED: &str =\s*"([^"]+)";/)?.[1];
  assert.ok(sentence, 'the constant is found');
  assert.match(sentence, VCL_UNTRUSTED);
});
