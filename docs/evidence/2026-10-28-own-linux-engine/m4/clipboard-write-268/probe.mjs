// #268's probe (T2, part 2): why every vendor gedit `clipboard_write` fails at about 10.2 s. Three cases on harness gedit
// windows opened as the gate opens them (scenes.mjs, run.mjs `openScene`), each its own `gedit --standalone` with its
// stderr kept (`apps/<label>.stderr`, scenes.mjs `spawnApp`), behind the harness's front window:
//   newest   the newest vendor build's `clipboard_write`, prepared by text.mjs's own `handleOfFirstWord`, the caret at
//            the end and a harness owner on CLIPBOARD, as the gate prepares it (3 samples);
//   ctl-a    gedit's own `EditableText.CopyText(0, 6)`, so gedit owns CLIPBOARD, then `EditableText.PasteText(end)`
//            straight from the harness's accessibility client: GTK answers the request in-process, synchronously;
//   ctl-b    the same, but a separate process (`startOwner`) owns CLIPBOARD before `PasteText`, serving the same text
//            gedit copied: GTK's request completes after `PasteText` returned. Ownership is the only variable.
// Writes results.jsonl (one row per case and sample, with wall-clock instants to match gedit's critical lines) to --out.
//
// usage: DISPLAY=:0 XAUTHORITY=~/.Xauthority node probe.mjs --cua <cua-engine, the reader> --newest <sky_linux_x64> --out <dir>

import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { clipRead, startOwner } from '../../../../../scripts/linux-engine-diff/clip.mjs';
import { Engine } from '../../../../../scripts/linux-engine-diff/engine.mjs';
import { splitNodeId } from '../../../../../scripts/linux-engine-diff/matrix-judge.mjs';
import { Oracle } from '../../../../../scripts/linux-engine-diff/oracle.mjs';
import { openScene } from '../../../../../scripts/linux-engine-diff/run.mjs';
import { Desktop } from '../../../../../scripts/linux-engine-diff/scenes.mjs';
import { handleOfFirstWord, selectFirstWord } from '../../../../../scripts/linux-engine-diff/text.mjs';

const { values } = parseArgs({ options: { cua: { type: 'string' }, newest: { type: 'string' }, out: { type: 'string' }, samples: { type: 'string', default: '3' } } });
if (!values.cua || !values.newest || !values.out) throw new Error('usage: probe.mjs --cua <bin> --newest <bin> --out <dir>');
mkdirSync(values.out, { recursive: true });
const results = join(values.out, 'results.jsonl');
const emit = (row) => appendFileSync(results, `${JSON.stringify(row)}\n`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EDITABLE = 'org.a11y.atspi.EditableText';
/** An instant as gedit's GLib log prints it (local time, milliseconds), and as ISO. */
const stamp = () => {
  const d = new Date();
  const local = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  return { iso: d.toISOString(), local };
};

const desktop = new Desktop({ cua: values.cua, run: 'p268', logs: values.out });
desktop.oracle = new Oracle();
const { oracle } = desktop;
const field = (scene) => ({ text: oracle.text(scene.field), caret: oracle.caret(scene.field), selection: oracle.selection(scene.field) });
const clip = () => {
  const r = clipRead();
  return r.ok ? { owner: r.owner, text: r.text.slice(0, 40) } : { why: r.why };
};
const caretToEnd = (scene) => oracle.setCaret(scene.field, oracle.count(scene.field));

/** Polls the field's text for `ms`: the first text that differs from `before`, or null. */
async function changed(scene, before, ms = 2000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const now = oracle.text(scene.field);
    if (now !== before) return now;
    await sleep(20);
  }
  return null;
}

/** A direct `PasteText` at the end of the field, after gedit's own Copy of the first word; `other`: a separate owner. */
async function control(name, scene, { other }) {
  selectFirstWord({ desktop, scene });
  // CopyText's reply has no body in GTK 3 (`()`), which the oracle's JSON parse does not take: busctl straight
  const at = splitNodeId(scene.field);
  execFileSync('busctl', [`--address=${oracle.address}`, '--timeout=5', 'call', '--', at.bus, at.path, EDITABLE, 'CopyText', 'ii', '0', '6'], { timeout: 10000 });
  const copied = 'replied';
  await sleep(200);
  const afterCopy = clip();
  if (afterCopy.text !== 'cua171') throw new Error(`gedit's Copy left ${JSON.stringify(afterCopy)} on CLIPBOARD`);
  // control B's owner serves control A's payload, gedit's own copy: the owning process is the only difference
  const owner = other ? await startOwner(afterCopy.text) : null;
  try {
    caretToEnd(scene);
    const before = field(scene);
    const atPaste = clip();
    const sent = stamp();
    const answer = oracle.on(scene.field, EDITABLE, 'PasteText', 'i', before.text.length);
    const after = await changed(scene, before.text);
    emit({
      case: name,
      label: scene.label,
      copy_answer: copied,
      clipboard_after_copy: afterCopy,
      separate_owner: owner ? owner.text : null,
      clipboard_at_paste: atPaste,
      paste_sent: sent,
      paste_answer: answer,
      before: { length: before.text.length, caret: before.caret, selection: before.selection },
      inserted: after === null ? null : after.slice(before.text.length),
      text_after_matches: after === null ? 'unchanged for 2 s' : after === before.text + afterCopy.text ? 'before + copied word' : 'other',
    });
  } finally {
    await owner?.stop();
  }
}

try {
  await desktop.openFront('visible');
  const newestScene = await openScene(desktop, 'gedit', 'newest', { text: true });
  const ctlA = await openScene(desktop, 'gedit', 'ctla', { text: true });
  const ctlB = await openScene(desktop, 'gedit', 'ctlb', { text: true });
  emit({ case: 'meta', started: stamp(), newest: values.newest, reader: values.cua, scenes: [newestScene.label, ctlA.label, ctlB.label] });

  const engine = new Engine({ label: 'newest', bin: values.newest }).start();
  try {
    for (let i = 0; i < Number(values.samples); i++) {
      const ctx = { desktop, scene: newestScene, engine, sceneName: 'gedit', i };
      const handle = await handleOfFirstWord(ctx);
      caretToEnd(newestScene);
      const prior = await startOwner(`cua171 prior p268 newest ${Date.now()}`);
      try {
        const before = field(newestScene);
        const atRequest = clip();
        const sent = stamp();
        const t0 = performance.now();
        const { response } = await engine.request('clipboard_write', { window: { id: newestScene.id }, handle });
        const ms = performance.now() - t0;
        const answered = stamp();
        const after = field(newestScene);
        emit({
          case: 'newest',
          i,
          label: newestScene.label,
          handle_ok: handle !== 'cua171-no-handle',
          prepare_error: ctx.prepareError ?? null,
          clipboard_at_request: atRequest,
          request_sent: sent,
          answered,
          ms: Math.round(ms),
          ok: response.ok,
          error: response.error,
          before: { length: before.text.length, caret: before.caret, selection: before.selection },
          text_unchanged: after.text === before.text,
          clipboard_after: clip(),
        });
      } finally {
        await prior.stop();
        await engine.request('clipboard_release', { handle });
      }
    }
  } finally {
    await engine.close();
  }

  await control('ctl-a', ctlA, { other: false });
  await control('ctl-b', ctlB, { other: true });
  emit({ case: 'meta', finished: stamp() });
} finally {
  desktop.unhookStop();
  await desktop.closeAll();
}
