// M2's text and clipboard operations of the differential run (Design, Text and clipboard: one verified paste route;
// Verification system: "the text cases of Acceptance 6 … run in a harness-owned textarea page in Chrome and in gedit and
// gnome-text-editor, while Chrome's address bar gets a separate single-line Unicode case"; Acceptance 2–6 for the text
// and clipboard commands).
//
// Each runs on each engine's own window (kind `text`): gedit on a scratch file, the textarea page (pages/text.html), a
// Chrome window's address bar, gnome-text-editor. A sample's prior clipboard is the harness's own text, served by a
// harness owner (`clip.mjs`) started for that sample, and the field is read back through the harness's own reads of the
// accessibility bus (`oracle.mjs`): the text, the caret and the selection. The effect is the paste landing exactly
// once where the caret or selection was; the clipboard after the request is read with a real timestamp.
//
// Where the vendor builds' text route reaches the field, they are the reference; where neither does (gedit's
// `clipboard_write`, gnome-text-editor), cua's success is a declared deviation (deviations.mjs). The speed bar is built
// from the vendor samples that succeeded (the union of what either build succeeds at, Terms: Bar); with none there is no
// bar. cua's effect and clipboard are judged on every sample, whatever the vendor builds did.

import { clipRead, startOwner } from './clip.mjs';
import { ENGINE, ORACLE, PrepareStepError } from './prepare.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chars = (s) => [...s];

/** Acceptance 6's text: Hangul, a combining acute after e, an emoji beyond the BMP, a newline. */
export const TEXT = 'cua171 안녕 é 🙂\nline2';
/** The address bar's single-line Unicode text (a newline there would navigate). */
export const SINGLE_LINE = 'cua171 안녕 é 🙂';
/** `type_characters`' text: characters of the US layout's first two levels. */
export const LAYOUT_TEXT = 'Hi 42!';
/** The range `type_text_selection` and the clipboard operations select: the document's first word. */
const FIRST_WORD = [0, 6];

/** Occurrences of a marker in a text. */
export const occurrences = (text, marker) => text.split(marker).length - 1;

/**
 * Whether a paste landed exactly once where the field's selection or caret was (offsets in characters, as AT-SPI
 * counts them): the selection replaced by the text, else the text inserted at the caret. `before`: `{text, caret,
 * selection}`; `after`: `{text}`. null when either was not read.
 */
export function landed(before, after, text) {
  const expected = pasted(before, text);
  if (expected === null || typeof after?.text !== 'string') return null;
  return after.text === expected;
}

/** The field's text once a paste of `text` lands where `before`'s selection or caret is; null when it cannot be told. */
export function pasted(before, text) {
  if (typeof before?.text !== 'string') return null;
  const b = chars(before.text);
  const [start, end] = before.selection ?? [before.caret, before.caret];
  if (!Number.isInteger(start) || start < 0 || end > b.length) return null;
  return [...b.slice(0, start), ...chars(text), ...b.slice(end)].join('');
}

/** The field's state through the harness's own reads: `{text, caret, selection}`. */
function readField(ctx) {
  const { oracle } = ctx.desktop;
  const id = ctx.scene.field;
  try {
    return { text: oracle.text(id), caret: oracle.caret(id), selection: oracle.selection(id) };
  } catch {
    return { text: null, caret: null, selection: null };
  }
}

/** The caret put at the end with nothing selected; an editor that refuses it (GTK 4) keeps its own caret. */
function caretToEnd(ctx) {
  const { oracle } = ctx.desktop;
  try {
    oracle.setCaret(ctx.scene.field, oracle.count(ctx.scene.field));
  } catch {
    // GTK 4 answers NotSupported; the paste lands at the caret it has, which the before-state reads
  }
}

/** A harness owner of CLIPBOARD with this sample's own text, so the clipboard after the request can be judged. */
async function priorClipboard(ctx) {
  ctx.prior = await startOwner(`cua171 prior ${ctx.scene.label} ${ctx.engine.label ?? ''} ${Date.now()}`);
}

/** The clipboard after the request, against what the sample expects it to hold; the sample's owner ended. */
async function clipboardAfter(ctx, expected) {
  const read = clipRead();
  await ctx.prior?.stop();
  ctx.prior = null;
  return { clipboard_kept: read.ok === true && read.text === expected, clipboard: read.ok ? { text: read.text.slice(0, 80) } : { why: read.why } };
}

/** A companion request of the engine under measurement (a hold of the address bar's focus, a read for a handle). */
const companion = (ctx, fn) => (ctx.witnessed ? ctx.witnessed(fn) : fn());

/** The scene's first word, as it opened (`FIRST_WORD` of its content); null for a scene the harness wrote no text to. */
const firstWordOf = (scene) => (typeof scene.content === 'string' ? chars(scene.content).slice(...FIRST_WORD).join('') : null);

/** A candidate's own text window that lost its first word: a candidate's sample left the text wrong (task 24). */
export class CandidateTextLost extends Error {
  constructor(label, record) {
    super(`${label} lost its first word (found '${record.found}'): a sample of its lane left the text wrong`);
    this.record = record;
  }
}

/**
 * The scene's first word checked before a sample's preparation, and put back through EditableText when it is missing
 * (task 24, the design session's ruling after m3-gate-verdict): the pinned build's failed paste over a selection deletes
 * the range and inserts nothing, which emptied its window after 9 samples. Each lane's window is its own, so only its
 * lane's requests change it: the same check for every lane, and the restore is recorded on the sample (`{inserted,
 * found}`, null when nothing was missing). A candidate's (`candidate`) window is never put back: its lane left the
 * person's text wrong, so the run stops (`CandidateTextLost`). A window that will not take the word back fails the
 * preparation at the oracle's step.
 */
export function sceneTextBefore(ctx, { candidate }) {
  const word = firstWordOf(ctx.scene);
  if (word === null) return null;
  const { oracle } = ctx.desktop;
  const id = ctx.scene.field;
  const head = () => chars(oracle.text(id)).slice(...FIRST_WORD).join('');
  let found;
  try {
    found = head();
  } catch (error) {
    throw new PrepareStepError(ORACLE, `${ctx.scene.label}'s text could not be read: ${String(error.message).slice(0, 160)}`);
  }
  if (found === word) return null;
  if (candidate) throw new CandidateTextLost(ctx.scene.label, { expected: word, found });
  let taken;
  try {
    taken = oracle.insertText(id, 0, word) && head() === word;
  } catch (error) {
    throw new PrepareStepError(ORACLE, `${ctx.scene.label}'s first word could not be put back: ${String(error.message).slice(0, 160)}`);
  }
  if (!taken) throw new PrepareStepError(ORACLE, `${ctx.scene.label} refused to take back its first word`);
  return { inserted: word, found };
}

/**
 * The document's first word selected through the harness oracle; `ctx.selected` its text. The caret is put at the end
 * first, which clears a selection the lane's previous sample left (GTK 3 refuses `AddSelection` while one exists:
 * m3-gate-final's cua `clipboard_write` after its own `clipboard_read`). A window that refuses the selection fails the
 * preparation at the oracle's step (prepare.mjs: the sample is resampled, never judged).
 */
export function selectFirstWord(ctx) {
  const { oracle } = ctx.desktop;
  caretToEnd(ctx);
  let selected;
  try {
    selected = oracle.select(ctx.scene.field, ...FIRST_WORD) && chars(oracle.text(ctx.scene.field)).slice(...FIRST_WORD).join('');
  } catch (error) {
    throw new PrepareStepError(ORACLE, `${ctx.scene.label}'s selection could not be made: ${String(error.message).slice(0, 160)}`);
  }
  if (!selected) throw new PrepareStepError(ORACLE, `${ctx.scene.label} refused the selection`);
  ctx.selected = selected;
}

/** The handle an operation sends when its engine could not read one: no engine issued it. */
export const NO_HANDLE = 'cua171-no-handle';

/**
 * A `clipboard_read` of the document's first word, for the operations that need a handle (untimed, witnessed), each
 * failed attempt recorded with its step (`ctx.prepareAttempts`, prepare.mjs). Only the harness oracle's selection is
 * tried again (twice in all): the engine's Copy is never retried, since a retry that succeeded would hide the engine's
 * own failure (task 22 review). An engine whose Copy failed (the pinned build, once its window is in some states, M2.3)
 * is sent a handle it never issued, and its sample records why (`prepare_error`, `prepare_step` engine): the request
 * still runs, its answer and effect are judged as any other, so a candidate's failure here fails its verdict and a
 * vendor build's is recorded. Only when every attempt failed at the oracle's selection (a window that refused it, gedit
 * once in m3-gate-final) does the preparation fail at the oracle's step, and the gate's rule resamples the sample
 * (prepare.mjs).
 */
export async function handleOfFirstWord(ctx) {
  ctx.prepareAttempts ??= [];
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      selectFirstWord(ctx);
    } catch (e) {
      if (!(e instanceof PrepareStepError)) throw e;
      ctx.prepareAttempts.push({ step: ORACLE, error: e.message });
      await sleep(200);
      continue;
    }
    const { response } = await companion(ctx, () => ctx.engine.request('clipboard_read', { window: { id: ctx.scene.id } }));
    if (response.ok) return response.output;
    // the engine's own failure: never retried, the sample's verdict carries it
    const error = String(response.error).slice(0, 200);
    ctx.prepareAttempts.push({ step: ENGINE, error });
    ctx.prepareStep = ENGINE;
    ctx.prepareError = `clipboard_read for a handle failed: ${error}`;
    return NO_HANDLE;
  }
  throw new PrepareStepError(ORACLE, ctx.prepareAttempts.at(-1).error, ctx.prepareAttempts);
}

const release = (ctx, handle) => companion(ctx, () => ctx.engine.request('clipboard_release', { handle }));

/** Which scenes run which text operation, and what the scene's text is. */
export const TEXT_SCENE_OPS = {
  gedit: ['type_text', 'type_text_selection', 'type_text_dedicated', 'type_characters', 'clipboard_read', 'clipboard_write', 'clipboard_release'],
  'chrome-textarea': ['type_text'],
  'chrome-address-bar': ['type_text'],
  'gnome-text-editor': ['type_text'],
};

const typeText = {
  kind: 'text',
  // gnome-text-editor (GTK 4) ignores the background route: cua takes the foreground route there, in dedicated mode
  // (Decision Log, M2 pre-flight); every other scene's request takes the background route (`route`, run.mjs)
  cuaArgs: (scene) => (scene === 'gnome-text-editor' ? ['--desktop', 'dedicated'] : []),
  route: (scene) => (scene === 'gnome-text-editor' ? 'foreground' : 'background'),
  prepare: async (ctx) => {
    if (ctx.sceneName === 'chrome-address-bar') {
      // the address bar focused with its text selected, as a person's Ctrl+L leaves it; the paste replaces it. The
      // selection is also made through AT-SPI: a background window's address bar reports the focus only while a
      // FocusIn holds, so an engine may click it to focus it and then put back the selection it observed
      await companion(ctx, () => ctx.engine.request('press_key', { window: { id: ctx.scene.id }, key: 'ctrl+l' }));
      await sleep(300);
      const { oracle } = ctx.desktop;
      oracle.select(ctx.scene.field, 0, oracle.count(ctx.scene.field));
    } else caretToEnd(ctx);
    await priorClipboard(ctx);
  },
  read: readField,
  request: (ctx) => {
    if (ctx.sceneName === 'chrome-address-bar') return ['type_text', { window: { id: ctx.scene.id }, element_id: ctx.scene.field, text: SINGLE_LINE }];
    return ['type_text', { window: { id: ctx.scene.id }, text: TEXT }];
  },
  effect: (ctx, input, before, after) => (ctx.sceneName === 'chrome-address-bar' ? (after?.text === null ? null : after.text === SINGLE_LINE) : landed(before, after, input.text)),
  check: (ctx) => clipboardAfter(ctx, ctx.prior.text),
  // the foreground route leaves its window active: the front window takes the focus back, outside every span
  restore: (ctx) => {
    if (ctx.sceneName === 'gnome-text-editor') ctx.desktop.focusFront();
  },
  // the address bar given back its page's address, untimed and witnessed
  cleanup: async (ctx) => {
    if (ctx.sceneName !== 'chrome-address-bar') return;
    for (let i = 0; i < 2; i++) await companion(ctx, () => ctx.engine.request('press_key', { window: { id: ctx.scene.id }, key: 'Escape' }));
    await sleep(200);
  },
};

export const TEXT_OPS = {
  type_text: typeText,
  // a preselected range is replaced by the text (Plan of Work, M2, Decisions)
  type_text_selection: {
    ...typeText,
    cuaArgs: () => [],
    needsFirstWord: () => true,
    prepare: async (ctx) => {
      selectFirstWord(ctx);
      await priorClipboard(ctx);
    },
    request: (ctx) => ['type_text', { window: { id: ctx.scene.id }, text: TEXT }],
    effect: (ctx, input, before, after) => (before?.selection ? landed(before, after, input.text) : false),
    cleanup: undefined,
  },
  // dedicated mode on a family that takes the background route: the route stays the background one, so the witness
  // allows nothing, exactly as in shared mode (Decision Log, M2.2); cua alone
  type_text_dedicated: {
    ...typeText,
    cuaOnly: true,
    cuaArgs: () => ['--desktop', 'dedicated'],
    route: () => 'background',
    prepare: async (ctx) => {
      caretToEnd(ctx);
      await priorClipboard(ctx);
    },
    request: (ctx) => ['type_text', { window: { id: ctx.scene.id }, text: TEXT }],
    effect: (ctx, input, before, after) => landed(before, after, input.text),
    cleanup: undefined,
  },
  // the newest build's command (the pinned build has none): the newest build is the reference
  type_characters: {
    kind: 'text',
    reference: 'newest',
    route: () => 'background',
    prepare: async (ctx) => caretToEnd(ctx),
    read: readField,
    request: (ctx) => ['type_characters', { window: { id: ctx.scene.id }, text: LAYOUT_TEXT }],
    effect: (ctx, input, before, after) => landed(before, after, input.text),
  },
  // the application's Copy of a selection: the clipboard then holds the selection; the handle released untimed
  clipboard_read: {
    kind: 'text',
    needsFirstWord: () => true,
    prepare: async (ctx) => {
      selectFirstWord(ctx);
      await priorClipboard(ctx);
    },
    read: () => ({ clipboard: clipRead().text ?? null }),
    request: (ctx) => ['clipboard_read', { window: { id: ctx.scene.id } }],
    effect: (ctx, input, before, after) => (after.clipboard === null ? null : after.clipboard === ctx.selected),
    check: async (ctx) => {
      await ctx.prior?.stop();
      ctx.prior = null;
      return {};
    },
    cleanup: async (ctx, response) => {
      if (response.ok) await release(ctx, response.output);
    },
  },
  // a snapshot pasted at the caret; between the read and the write the harness's owner takes CLIPBOARD, which cua's
  // cleanup leaves serving (the vendor builds leave the snapshot instead, a declared deviation)
  clipboard_write: {
    kind: 'text',
    route: () => 'background',
    needsFirstWord: () => true,
    prepare: async (ctx) => {
      ctx.handle = await handleOfFirstWord(ctx);
      caretToEnd(ctx);
      await priorClipboard(ctx);
    },
    read: readField,
    request: (ctx) => ['clipboard_write', { window: { id: ctx.scene.id }, handle: ctx.handle }],
    effect: (ctx, input, before, after) => landed(before, after, ctx.selected),
    check: (ctx) => clipboardAfter(ctx, ctx.prior.text),
    cleanup: async (ctx) => {
      if (ctx.handle !== NO_HANDLE) await release(ctx, ctx.handle);
    },
  },
  // a handle read untimed before each warm sample; the cold sample (the engine's start and its first request, as for
  // every operation without untimed preparation) releases a handle the engine never issued, which both builds answer
  // with success too (behaviour §13.1)
  // A release is a map removal in every engine, a tenth of a millisecond the harness's own scheduling dominates: ten
  // warm samples a block give each side the 20 that Acceptance 3's noise rule needs (stats.mjs).
  clipboard_release: {
    kind: 'text',
    warmSamples: 10,
    // the one text operation with no effect outside the engine: a release removes the handle from the engine's own map,
    // and the desktop and the clipboard stay as they were (the witness and the bus trace show that)
    effectFree: 'a release changes only the engine’s own handle map; nothing on the desktop or the clipboard to read back',
    // the cold sample releases a handle never issued and selects nothing
    needsFirstWord: (ctx) => ctx.i > 0,
    prepare: async (ctx) => {
      if (ctx.i === 0) {
        ctx.handle = 'cua171-never-issued';
        return;
      }
      ctx.handle = await handleOfFirstWord(ctx);
      caretToEnd(ctx);
    },
    request: (ctx) => ['clipboard_release', { handle: ctx.handle }],
  },
};

/**
 * The route cua's request of a text operation must take on a scene (Decision Log, M2.2: the foreground route's witness
 * allowance is granted only where it is the expected route and the one the engine reports taking), or null for an
 * operation that pastes nothing and reports no route.
 */
export function expectedRoute(op, sceneName) {
  return TEXT_OPS[op]?.route?.(sceneName) ?? null;
}

/** The scene's field (and the textarea page's second field), found once its window is open (run.mjs). */
export async function resolveField(desktop, scene, sceneName) {
  const { preorder } = await import('./normalize.mjs');
  const nodes = preorder((await desktop.state(scene)).ax_tree);
  const find = (pred, what) => {
    const node = nodes.find(pred);
    if (!node) throw new Error(`${scene.label} has no ${what}`);
    return node.id;
  };
  if (sceneName === 'gedit') scene.field = find((n) => n.role === 'text' && n.states?.includes('editable'), 'editable text');
  else if (sceneName === 'chrome-textarea') {
    scene.field = find((n) => n.role === 'entry' && n.name === 'Text A', 'Text A');
    scene.other = find((n) => n.role === 'entry' && n.name === 'Text B', 'Text B');
  } else if (sceneName === 'chrome-address-bar') scene.field = find((n) => n.role === 'entry' && /address and search bar/i.test(n.name ?? ''), 'address bar');
  // gnome-text-editor: families.mjs found its text box
  if (!scene.field) throw new Error(`${scene.label} has no field to type into`);
  return scene;
}
