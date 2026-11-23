#!/usr/bin/env node
// Task 113's Chrome X trace, reduced as it is read (development only): xtrace's lines on stdin, one JSON line out per
// request the run's Chrome sent and per event it received, stamped on arrival (epoch ms): the connection, the request's
// name (its extension's too), and only the fields that name protocol objects: the window, the destination of a
// SendEvent with its event's name and a ClientMessage's type atom, a selection's atom, a property's atom, and the event
// mask of ChangeWindowAttributes with whether it sets a cursor. No string, no property value, no title reaches disk.
// High-rate drawing requests are counted per second instead of written one by one.
import { createInterface } from 'node:readline';

const DRAWING = new Set(['PutImage', 'ShmPutImage', 'CopyArea', 'PolyFillRectangle', 'PolyRectangle', 'PolySegment', 'PolyLine', 'PolyText8', 'ImageText8', 'FillRectangles', 'Composite', 'CompositeGlyphs8', 'CompositeGlyphs16', 'CompositeGlyphs32', 'Trapezoids', 'Triangles', 'PresentPixmap', 'CreatePixmap', 'FreePixmap', 'CreatePicture', 'FreePicture', 'ChangeGC', 'CreateGC', 'FreeGC', 'SetPictureClipRectangles', 'SetClipRectangles', 'AttachFd', 'Attach', 'Detach', 'PixmapFromBuffers', 'PixmapFromBuffer', 'FenceFromFd', 'TriggerFence', 'ResetFence', 'AwaitFence', 'DestroyFence', 'SetPictureTransform', 'SetPictureFilter', 'ChangePicture', 'CreateSolidFill', 'FillPoly']);
const atom = (rest, field) => rest.match(new RegExp(`${field}=0x[0-9a-f]+\\("([A-Za-z0-9_:-]+)"\\)`))?.[1] ?? null;
const hex = (rest, field) => rest.match(new RegExp(`\\b${field}=(0x[0-9a-f]+)`))?.[1] ?? null;
const REQUEST = /^(\d{3}):<:[0-9a-f]+:\s*\d+: (?:([A-Za-z0-9-]+)-)?Request\((\d+)(?:,\d+)?\): (\w+)(.*)$/;
const EVENT = /^(\d{3}):>:[0-9a-f]+: Event (\w+)\((\d+)\)(.*)$/;
const counts = new Map();
let second = Math.floor(Date.now() / 1000);
const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
const flush = (now) => {
  if (counts.size) out({ t: second * 1000, kind: 'drawing', counts: Object.fromEntries(counts) });
  counts.clear();
  second = now;
};
for await (const line of createInterface({ input: process.stdin })) {
  const t = Date.now();
  if (Math.floor(t / 1000) !== second) flush(Math.floor(t / 1000));
  let m = line.match(REQUEST);
  if (m) {
    const [, c, ext, , name, rest] = m;
    if (DRAWING.has(name)) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
      continue;
    }
    const o = { t, c: Number(c), k: 'req', n: ext ? `${ext}:${name}` : name };
    const w = hex(rest, 'window') ?? hex(rest, 'grab-window') ?? hex(rest, 'owner') ?? hex(rest, 'requestor');
    if (w) o.w = w;
    if (name === 'SendEvent') {
      o.dest = hex(rest, 'destination');
      o.ev = rest.match(/\bevent=\{?\s*(?:[a-z-]+=[^ ]+ )*?(\w+)\(/)?.[1] ?? rest.match(/(\w+)\(\d+\)/)?.[1] ?? null;
      o.type = atom(rest, 'type');
    }
    for (const f of ['selection', 'property', 'target']) {
      const a = atom(rest, f);
      if (a) o[f] = a;
    }
    if (name === 'ChangeWindowAttributes') {
      o.cursor = /\bcursor=/.test(rest);
      o.mask = /event-mask=/.test(rest);
    }
    out(o);
    continue;
  }
  m = line.match(EVENT);
  if (m) {
    const [, c, name, , rest] = m;
    if (name === 'MotionNotify' || name === 'Expose' || name === 'NoExposure' || name === 'GraphicsExposure') {
      counts.set(`ev:${name}`, (counts.get(`ev:${name}`) ?? 0) + 1);
      continue;
    }
    const o = { t, c: Number(c), k: 'ev', n: name };
    const w = hex(rest, 'event') ?? hex(rest, 'window');
    if (w) o.w = w;
    for (const f of ['selection', 'atom', 'type']) {
      const a = atom(rest, f);
      if (a) o[f] = a;
    }
    out(o);
  }
}
flush(Math.floor(Date.now() / 1000));
