// The application-family matrix's judgements (M0.4; Design, Device mode and the foreground route): whether a
// background click, key or type_text took effect, read back through the application's own accessibility objects or,
// for a terminal, through what the terminal's program received; and the per-family summary and table. Pure
// functions; matrix.mjs runs the families.

const chars = (s) => [...s];
const occurrences = (text, marker) => text.split(marker).length - 1;

/** `<bus name>:<object path>` (behaviour §5.1), or null for the X11 fallback's ids. */
export function splitNodeId(id) {
  const at = id.indexOf(':/');
  if (!id.startsWith(':') || at < 0) return null;
  return { bus: id.slice(0, at), path: id.slice(at + 1) };
}

/** The values of a `busctl --json=short` answer, variants unwrapped. */
export function parseBusctl(text) {
  const unwrap = (v) => (v && typeof v === 'object' && !Array.isArray(v) && 'type' in v && 'data' in v ? unwrap(v.data) : v);
  const { data } = JSON.parse(text);
  return data.map(unwrap);
}

/**
 * A key's effect on a field: one character more containing the key once more, or one fewer for BackSpace. With
 * `append` (a terminal's recorded input) the input must end with exactly what the key sends.
 */
export function keyArrived(key, before, after, { append = false } = {}) {
  if (before === null || after === null || before === undefined || after === undefined) return null;
  if (append) {
    if (key === 'BackSpace') return after === `${before}\x7f` || after === `${before}\b`;
    return after === `${before}${key}`;
  }
  const [b, a] = [chars(before), chars(after)];
  if (key === 'BackSpace') return a.length === b.length - 1;
  return a.length === b.length + 1 && occurrences(after, key) === occurrences(before, key) + 1;
}

/**
 * A type_text's effect: its marker occurs exactly once more than before (inserted once, not twice). Firefox's
 * `Text.GetText` puts a U+FEFF after each character beyond the BMP (M0.4), which is not the field's text.
 */
export function typedArrived(marker, before, after) {
  if (before === null || after === null || before === undefined || after === undefined) return null;
  const plain = (s) => s.replaceAll('﻿', '');
  return occurrences(plain(after), marker) === occurrences(plain(before), marker) + 1;
}

/**
 * An editor click's effect: the caret moved to where the click points. `end` clicks low in the text area, so the
 * caret lands on the last line (a paragraph document: in the last paragraph); `start` clicks on the first line,
 * past a line-number gutter, so the caret lands within its first ten characters. A click that leaves the caret
 * where it was shows nothing.
 * Offsets are AT-SPI's, in characters.
 */
export function caretArrived(target, before, after) {
  if (before?.caret === null || before?.caret === undefined || after?.caret === null || after?.caret === undefined) return null;
  const moved = before.caret !== after.caret || before.paragraph !== after.paragraph;
  if (!moved) return false;
  if (after.of !== undefined) {
    return target === 'end' ? after.paragraph === after.of - 1 : after.paragraph === 0 && after.caret <= 10;
  }
  if (target === 'start') return after.caret <= 10;
  const text = chars(after.text ?? '');
  const trimmed = text.join('').trimEnd();
  const lastLine = chars(trimmed.slice(0, trimmed.lastIndexOf('\n') + 1)).length;
  return after.caret >= lastLine;
}

/**
 * Window-relative click points in a text area given in screen coordinates: `start` on its first line, 60 px in
 * (qtcreator's line-number gutter is about 40 px, and a click there selects the line), `end` low in the area,
 * below the document's few lines.
 */
export function clickPoints(area, origin) {
  return {
    start: { x: Math.round(area.x + 60 - origin.x), y: Math.round(area.y + 8 - origin.y) },
    end: { x: Math.round(area.x + area.w / 2 - origin.x), y: Math.round(area.y + area.h * 0.85 - origin.y) },
  };
}

/** A page counter's click: one higher. */
export function counterArrived(before, after) {
  if (before === null || after === null || before === undefined || after === undefined) return null;
  return after === before + 1;
}

/** A terminal click with mouse reporting on: the program received a mouse report. */
export function terminalClickArrived(before, after) {
  if (before === null || after === null) return null;
  return after.length > before.length && after.slice(before.length).includes('\x1b[M');
}

const OPS = ['click', 'key', 'type_text'];

/** Per operation and engine: samples, requests answered ok, effects seen, effects readable, clean witnesses. */
export function summarizeFamily(rows) {
  const out = {};
  for (const r of rows.filter((x) => x.kind === 'matrix-sample')) {
    out[r.op] ??= {};
    const s = (out[r.op][r.engine] ??= { n: 0, ok: 0, effect: 0, effect_known: 0, witness_clean: 0 });
    s.n += 1;
    if (r.ok) s.ok += 1;
    if (r.effect === true) s.effect += 1;
    if (typeof r.effect === 'boolean') s.effect_known += 1;
    if (r.witness === true) s.witness_clean += 1;
  }
  return out;
}

/**
 * Whether the family takes the background route's click and key (on the engines given): `takes` when every
 * readable effect arrived, `ignores` when none did, `partial` otherwise, `unknown` when nothing could be read; and
 * whether every one of those requests kept the witness clean.
 */
export function classifyFamily(summary, { engines = ['pinned', 'newest', 'cua'] } = {}) {
  const states = {};
  let n = 0;
  let clean = 0;
  for (const op of ['click', 'key']) {
    let known = 0;
    let arrived = 0;
    for (const engine of engines) {
      const s = summary[op]?.[engine];
      if (!s) continue;
      known += s.effect_known;
      arrived += s.effect;
      n += s.n;
      clean += s.witness_clean;
    }
    states[op] = known === 0 ? 'unknown' : arrived === 0 ? 'ignored' : arrived === known ? 'taken' : 'partial';
  }
  const values = Object.values(states);
  const uniform = values.every((s) => s === values[0]);
  const background = uniform ? { taken: 'takes', ignored: 'ignores', unknown: 'unknown', partial: 'partial' }[values[0]] : 'partial';
  const plural = { click: 'clicks', key: 'keys' };
  const words = { taken: 'takes', ignored: 'ignores', partial: 'partly takes' };
  const of = (state) => Object.entries(states).filter(([, s]) => s === state).map(([op]) => op);
  // `takes keys; clicks unknown`: each decided kind with its verb, then the kinds nothing could be read for
  const description = uniform
    ? background
    : [
        ...['taken', 'ignored', 'partial'].filter((state) => of(state).length).map((state) => `${words[state]} ${of(state).map((op) => plural[op]).join(' and ')}`),
        ...(of('unknown').length ? [`${of('unknown').map((op) => plural[op]).join(' and ')} unknown`] : []),
      ].join('; ');
  return {
    background,
    description,
    ops: states,
    ignored_ops: of('ignored'),
    unknown_ops: of('unknown'),
    witness: n > 0 && clean === n ? 'clean' : 'dirty',
  };
}

// The objects a family's effects are read from, by how they are read: a run that did not find them cannot judge.
const NEEDED = { editor: ['field'], paragraphs: ['document'], page: ['field'], button: ['button'], electron: ['field', 'button'], terminal: [], pixels: [] };

/**
 * Whether a matrix run is complete: every family asked for recorded its identity, found what its effects are read
 * from, and raised no exception while opening, reading or requesting. A vendor's refusal and input a family
 * ignores are outcomes the run records, not failures.
 */
export function matrixOutcome(rows, families) {
  const failed = [];
  for (const family of families) {
    const error = rows.find((r) => r.kind === 'matrix-error' && r.family === family);
    const identity = rows.find((r) => r.kind === 'matrix-identity' && r.family === family);
    if (error) failed.push(`${family}: ${String(error.error).split('\n')[0]}`);
    else if (!identity) failed.push(`${family}: no identity recorded`);
    else {
      const missing = (NEEDED[identity.kindOf] ?? []).filter((t) => !identity.targets?.[t]);
      if (missing.length) failed.push(`${family}: its ${missing.join(' and ')} ${missing.length > 1 ? 'were' : 'was'} not found`);
    }
  }
  return { complete: failed.length === 0, failed };
}

const cell = (s) => {
  if (!s) return '–';
  const failed = s.n - s.ok;
  const effect = s.effect_known === 0 && s.n > 0 ? `?/${s.n}` : `${s.effect}/${s.n}`;
  return failed ? `${effect} (${failed} failed)` : effect;
};

/** The matrix table: one row per family, its identity, each operation's effects per engine, the classification. */
export function renderMatrix(families, { engines = ['pinned', 'newest', 'cua'], textEngines = ['pinned', 'newest'] } = {}) {
  const head = [
    'family',
    'ToolkitName',
    'X11 class (instance / class)',
    'tree (nodes)',
    `click ${engines.join(' / ')}`,
    `key ${engines.join(' / ')}`,
    `type_text ${textEngines.join(' / ')}`,
    'witness',
    'background route',
    'run',
  ];
  const out = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`];
  for (const f of families) {
    const id = f.identity ?? {};
    const toolkit = id.toolkit ? `${id.toolkit}${id.toolkit_version ? ` ${id.toolkit_version}` : ''}` : 'none (no AT-SPI provider)';
    const ops = (op, list) => list.map((e) => cell(f.summary[op]?.[e])).join(' / ');
    const c = classifyFamily(f.summary, { engines });
    const background = c.background === 'partial' ? `partial: ${c.description}` : c.background;
    out.push(`| ${f.title} | ${toolkit} | ${id.wm_class ?? '–'} | ${id.source ?? '–'}${id.nodes ? ` (${id.nodes})` : ''} | ${ops('click', engines)} | ${ops('key', engines)} | ${ops('type_text', textEngines)} | ${c.witness} | ${background} | ${f.run} |`);
  }
  return out;
}

/** The matrix table and the list of families that ignore background input, from a run's rows. */
export function matrixMarkdown(rows) {
  const families = [];
  for (const id of rows.filter((r) => r.kind === 'matrix-identity')) {
    const samples = rows.filter((r) => r.kind === 'matrix-sample' && r.family === id.family && r.run === id.run);
    families.push({ family: id.family, title: id.title, identity: id, summary: summarizeFamily(samples), run: id.run });
  }
  const md = renderMatrix(families);
  const none = renderMatrix(families, { engines: ['cua', 'cua:none'], textEngines: [] });
  md.push('', 'Without the redirect (`cua:none`, `--retention none`) beside cua with session retention:', '', ...none);
  const ignoring = families.filter((f) => classifyFamily(f.summary).background !== 'takes');
  md.push('', 'Families that do not take the background route:', '');
  if (ignoring.length === 0) md.push('- none');
  for (const f of ignoring) {
    const c = classifyFamily(f.summary);
    md.push(`- ${f.title} (${f.identity.wm_class}; ${f.identity.toolkit ?? 'no AT-SPI provider'}): ${c.description} (run \`${f.run}\`)`);
  }
  const meta = rows.find((r) => r.kind === 'meta');
  const outcome = matrixOutcome(rows, meta?.families?.length ? meta.families : [...new Set(rows.filter((r) => r.family).map((r) => r.family))]);
  md.push('', outcome.complete ? 'The run is complete.' : `**The run is incomplete:** ${outcome.failed.join('; ')}`);
  return md;
}

export { OPS };
