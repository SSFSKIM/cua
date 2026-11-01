// #188's two additions to #187's live slot (SSFSKIM/cua#188; ~/.local/share/188/ledger.md, the RULING): run inside
// `paste-187 drive` (./item-187.mjs plan187), right after the harness windows are placed and before Korean is engaged,
// so every act here goes under ABC; nothing here counts for #187's verdict.
//
// The #188 rows, counted for #188. The four Electron fixture rows of the native matrix that #255 repaired, run as the
// matrix defines them: plan.mjs's cases and their prepares as #255 left them (the stated clear, the masked reason, the
// focus judged by `focusVerdict` from the prepare's last observation), sent as ./matrix-cells.mjs caseCells makes them,
// and each row judged the way ./steps.mjs caseRow judges one (prepare, the user window in front and the activation
// watcher alive, the act under the key guard, the after-reading, the check), with the matrix's non-interference oracle
// (./oracle.mjs judgeInterference: the front app, the top window and the user window's keyboard focus unchanged, no
// activation in the row's span outside the kit's own intended ones, no route 4). The frontmost row runs with the fixture
// in front; the three background rows behind the run's own Finder window (the matrix's Electron ↔ Finder pairing: the
// user app is Finder, the `@finder` of the ids). Each item runs on cua's engine and once on the vendor's (#188's
// "compare repaired rows against the vendor").
//
// Cell 3, recorded only: does an element click on a text field keep a selection, and does a positional click place
// the caret where it lands, on cua and on the vendor's engine, the fixture frontmost:
//   (i)  the field given the matrix's known value with one word selected, then `__app.click(index)`;
//   (ii) the same value with the caret at its end and nothing selected, then `__app.click([x, y])` (the facade's
//        coordinate form, in the screenshot's pixels: the only way cua_repl clicks at a point inside an element), at a
//        point in the middle of the field's third line.
// The selection's range is read before and after by the approved bundle's `--probe text-view` (AXSelectedTextRange,
// outside either engine), the observation after (its trailer's selection length, cua's focused index), and the click's
// meta (route, and on an element click `cua/elementClick`: plan, action, reason, hit). Ranges, lengths and enumerations
// only, never the field's text.
//
// Both run only under ABC: each item selects it (the owner's consent, ./input-source.mjs) with the fixture in front
// and reads it back before its first act and again after its last; an item that does not read ABC there sends nothing,
// and its rows are not counted.
import {cell} from '../native-baseline/cells.mjs';
import {caseCells, prelude} from '../native-matrix/matrix-cells.mjs';
import {ownedFocus, ownedPids} from '../native-matrix/matrix-device.mjs';
import {accountActivations, judgeInterference, ownedReading, userWindowOf} from '../native-matrix/oracle.mjs';
import {CASES, caseId, ELECTRON_FIELD_LAYOUT, FIELD_LINES, focusVerdict, PASTED, TYPED} from '../native-matrix/plan.mjs';
import {textViewOf} from '../native-matrix/residue-device.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';
import {LATIN_SOURCE} from './input-source.mjs';
import {SCENE_MARKER} from './target-guard.mjs';

const j = JSON.stringify;
export const S188 = 's';
export const ENGINES_188 = Object.freeze(['cua', 'vendor']);
export const ITEMS_188 = Object.freeze({rows: engine => `188-rows-${engine}`, click: engine => `188-click-${engine}`});
export const ALL_ITEMS_188 = Object.freeze(ENGINES_188.flatMap(e => [ITEMS_188.rows(e), ITEMS_188.click(e)]));
const DRIVEN = 'electron', USER = 'finder';

// The four rows (#188's acceptance), in the matrix's order: the frontmost regime, then the background one behind Finder.
export const ROWS_188 = Object.freeze([
  Object.freeze({regime: 'frontmost', method: 'paste', case: 'replace', user: null}),
  Object.freeze({regime: 'background', method: 'typeText', case: 'replace', user: USER}),
  Object.freeze({regime: 'background', method: 'pressKey', case: 'tab', user: USER}),
  Object.freeze({regime: 'background', method: 'paste', case: 'replace', user: USER}),
]);
export const caseOf188 = r => CASES[DRIVEN].find(c => c.method === r.method && c.case === r.case);
export const rowId188 = r => caseId(DRIVEN, r.regime, caseOf188(r), r.user);

export const LABELS_188 = Object.freeze({
  prepare: key => `${key} prepare: the matrix's prepare`,
  front: key => `${key} front: the user window in front`,
  act: (key, id) => `${key} act: ${id}`,
  check: key => `${key} check: the matrix's check`,
  clickPrepare: (item, part) => `${item} ${part} prepare`,
  click: (item, part) => `${item} ${part} click`,
  read: (item, part) => `${item} ${part} read: the observation after the click`,
  range: (item, part, when) => `${item} ${part} range ${when}`,
});

// ---- the #188 rows ---------------------------------------------------------------------------------------------------

const marked = code => `${SCENE_MARKER(DRIVEN)}\n${code}`;
// Whether a prepare answered ready with its field's focus judged as the matrix judges it (steps.mjs caseRow).
const preparedOk = p => p?.ok === true && p.value?.ready === true && (!p.value.focus || focusVerdict(p.value.focus, p.meta?.observation ?? null).problem === null);

function rowSteps188({item, engine, r, k}) {
  const key = `${item}.${k}`, id = rowId188(r), cells = caseCells(DRIVEN, caseOf188(r));
  const prepared = results => preparedOk(results[LABELS_188.prepare(key)]);
  const fronted = results => prepared(results) && results[LABELS_188.front(key)]?.ok === true;
  const acted = results => Boolean(results[LABELS_188.act(key, id)]);
  return [
    {task: '188-before', args: [key]},
    {run: S188, cell: marked(cells.prepare), label: LABELS_188.prepare(key)},
    {task: '188-front', args: [key, r.regime], when: prepared},
    {run: S188, cell: marked(cells.act), label: LABELS_188.act(key, id), ...(caseOf188(r).keys ? {keys: r.user ?? DRIVEN} : {}), when: fronted},
    {task: '188-after', args: [key, r.regime], when: acted},
    {run: S188, cell: marked(cells.check), label: LABELS_188.check(key), when: acted},
    {task: '188-row', args: [key, engine, String(k)]},
  ];
}

// The ABC gate: the fixture in front, ABC selected under the owner's consent, then read back (required).
const abcSteps = item => [
  {task: '188-activate', args: [DRIVEN], required: true},
  {task: 'select-source', args: ['latin', DRIVEN], required: true},
  {task: '188-abc', args: [item, 'start'], required: true},
];

export function rowsItem188(engine) {
  const item = ITEMS_188.rows(engine), front = ROWS_188.filter(r => r.regime === 'frontmost'), back = ROWS_188.filter(r => r.regime === 'background');
  return [
    {say: `#188 ${item}: the matrix's ${ROWS_188.length} repaired Electron rows on the ${engine} engine (counted for #188, never for #187); nobody touches the Mac until the item ends`},
    {series: [item], counts: {rows: ROWS_188.length}},
    {task: '188-preflight', args: [DRIVEN, USER], required: true},
    // Finder is the user window only: never observed through the engine, so only the fixture is bound.
    {open: S188, engine, scenes: [DRIVEN, USER], bind: [DRIVEN]},
    {task: '188-activations-start', args: [item], required: true},
    ...abcSteps(item),
    ...front.flatMap(r => rowSteps188({item, engine, r, k: ROWS_188.indexOf(r)})),
    {task: '188-activate', args: [USER, 'user'], required: true},
    ...back.flatMap(r => rowSteps188({item, engine, r, k: ROWS_188.indexOf(r)})),
    {task: '188-abc', args: [item, 'end']},
    {task: '188-activations-stop', args: [item]},
    {close: S188},
  ];
}

const scrubbed = v => (typeof v === 'string' ? v.split(TYPED).join('[the text]').split(PASTED).join('[the text]').slice(0, 300) : v);
const metaOf = answer => answer?.meta ?? {};
// The engine meta a row keeps of its act (the matrix's per-call meta, value-free).
const actMeta = meta => Object.fromEntries(['activationGuardMs', 'activationClick', 'entered', 'intervention', 'hidIdleMs'].filter(k => meta[k] != null).map(k => [k, meta[k]])
  .concat(meta.paste ? [['paste', {stage: meta.paste.stage ?? null, confirmed: meta.paste.confirmed ?? null, readWait: meta.paste.readWait ?? null, effectWait: meta.paste.effectWait ?? null}]] : []));

// One row's record, as ./steps.mjs caseRow judges it, from its cells' answers and the kit's readings. `front`: {ok,
// reading, userWindow, watcher} before the act; `after`: {reading, focus, watcher}; `window`: [from, to]. Its
// interference is judged with the item's activations (judge188). -> the record; `delivered` is the check's ok.
export function row188({spec, prepare = null, front = null, act = null, after = null, check = null, window = null}) {
  const background = spec.regime === 'background', value = prepare?.value ?? null;
  let invalid = null, focusReadBy = null;
  if (!prepare) invalid = 'the prepare cell was not sent';
  else if (!prepare.ok) invalid = 'the prepare cell failed';
  else if (value?.ready !== true) invalid = `not prepared: ${value?.reason ?? 'no reason'}`;
  else if (value.focus) {
    const verdict = focusVerdict(value.focus, prepare.meta?.observation ?? null);
    focusReadBy = verdict.by;
    if (verdict.problem) invalid = `not prepared: ${verdict.problem}`;
  }
  if (invalid === null && background && !front?.userWindow) invalid = 'the user window was not in front before the action';
  else if (invalid === null && background && front.watcher !== true) invalid = 'the activation watcher was not running before the action';
  if (invalid === null && !act) invalid = 'the key guard did not send the action\'s keys';
  else if (invalid === null && !act.ok) invalid = 'the act cell failed';
  if (invalid === null && !check?.ok) invalid = 'the check cell failed';
  else if (invalid === null && check.value?.invalid) invalid = String(check.value.invalid);
  if (invalid === null && background && after?.watcher !== true) invalid = 'the activation watcher was not running after the action';
  const outcome = check?.ok && check.value?.outcome ? Object.fromEntries(Object.entries(check.value.outcome).map(([k, v]) => [k, scrubbed(v)])) : null;
  const observation = prepare?.meta?.observation ?? null;
  return {key: spec.key, item: spec.item, id: spec.id, engine: spec.engine, regime: spec.regime, method: spec.method, case: spec.case, user: spec.user,
    invalid, valid: invalid === null, delivered: invalid === null && check.value?.ok === true,
    prepared: Array.isArray(value?.prepared) ? value.prepared : [], focus: value?.focus ?? null, focusReadBy,
    observationFocus: observation && Object.hasOwn(observation, 'focusedIndex') ? {focusedIndex: observation.focusedIndex, focusedRole: observation.focusedRole ?? null, focusRead: observation.focusRead ?? null} : null,
    reason: value?.ready === true ? null : scrubbed(value?.reason ?? null),
    route: act?.route ?? null, actMs: act?.value?.actMs ?? null, threw: act?.value?.threw ?? null, meta: actMeta(metaOf(act)),
    // An element click's meta rides only on the cell whose last call it was (./session.mjs readReply).
    elementClick: [prepare, act, check].map(a => metaOf(a).elementClick).find(Boolean) ?? null,
    outcome, window,
    oracle: background && front?.reading && after?.reading ? {before: front.reading, after: after.reading, focus: after.focus ?? null, inputRoute: act?.route ?? null, scene: DRIVEN,
      userPid: front.userWindow?.pid ?? null} : null};
}

// ---- cell 3: the click and the selection (recorded only) -------------------------------------------------------------

export const CLICK_VALUE = FIELD_LINES.join('\n');
export const CLICK_WORD = 'charlie';
// (i)'s selection, and (ii)'s caret at the value's end.
export const WORD_RANGE = Object.freeze({location: CLICK_VALUE.indexOf(CLICK_WORD), length: CLICK_WORD.length});
export const END_RANGE = Object.freeze({location: CLICK_VALUE.length, length: 0});
// (ii)'s point, in the fixture window's points: the middle of the drag's span of lines (the field's third line) and
// about five characters into it (fixtures/electron/fixture.css; plan.mjs ELECTRON_FIELD_LAYOUT); the line's range of
// caret offsets, start to end inclusive.
export const CLICK_LINE = 2;
export const CLICK_POINT_PT = Object.freeze([60, (ELECTRON_FIELD_LAYOUT.from[1] + ELECTRON_FIELD_LAYOUT.to[1]) / 2]);
const lineStart = FIELD_LINES.slice(0, CLICK_LINE).reduce((n, l) => n + l.length + 1, 0);
export const CLICK_LINE_RANGE = Object.freeze([lineStart, lineStart + FIELD_LINES[CLICK_LINE].length]);

const head = `${SCENE_MARKER(DRIVEN)}\n${prelude(DRIVEN)}`;
// The field given the known value, then the selection or the caret; the last observation's index kept for the click.
const fieldWithValue = `const ax0 = await observe();
if (!inFront(ax0)) return {ready: false, reason: "the fixture window is not the app's front window"};
let index = indexOfTarget(ax0, "Fixture text");
if (index === null) return {ready: false, reason: "the field is not in the text"};
await __app.setValue(index, ${j(CLICK_VALUE)});
let now = await observe(); index = indexOfTarget(now, "Fixture text");
if (index === null || plain(valueOfIndex(now, index)) !== ${j(CLICK_VALUE)}) return {ready: false, reason: "the field could not be given its value"};`;
export const CLICK_PREPARE = Object.freeze({
  i: cell(`${head}
// cua-188: click prepare (i), a word selected
${fieldWithValue}
await __app.selectText(index, ${j(CLICK_WORD)});
now = await observe(); index = indexOfTarget(now, "Fixture text");
if (index === null || selectedTextOf(now) !== ${j(CLICK_WORD)}) return {ready: false, reason: "the word could not be selected"};
globalThis.__c3 = {index};
return {ready: true};`),
  ii: cell(`${head}
// cua-188: click prepare (ii), the caret at the end
${fieldWithValue}
await __app.selectText(index, "eight", {selectionType: "cursor_after"});
now = await observe(); index = indexOfTarget(now, "Fixture text");
if (index === null || selectedTextOf(now) !== null) return {ready: false, reason: "a selection is left in the field"};
const size = jpegSize(await __app.getScreenshot({emit: false}));
if (!size) return {ready: false, reason: "the screenshot's size could not be read"};
const layout = ${j(ELECTRON_FIELD_LAYOUT)};
if (Math.abs(size.height / size.width - layout.window[1] / layout.window[0]) > 0.03) return {ready: false, reason: "the screenshot is not the fixture window's shape"};
const scale = size.width / layout.window[0], point = ${j(CLICK_POINT_PT)}.map(v => Math.round(v * scale));
globalThis.__c3 = {index, point};
return {ready: true, point};`),
});
// The click alone in its cell, so the cell's meta is the click's.
const clicked = target => cell(`${head}
// cua-188: click
const __t = performance.now(); let threw = false, errorName = null;
try { await __app.click(${target}); } catch (e) { threw = true; errorName = String(e?.errorName ?? e?.name ?? "").slice(0, 80) || null; }
return {clickMs: performance.now() - __t, threw, errorName};`);
export const CLICK_ACT = Object.freeze({i: clicked('globalThis.__c3.index'), ii: clicked('globalThis.__c3.point')});
export const CLICK_READ = cell(`${head}
// cua-188: the observation after the click
const ax = await observe();
const field = indexOfTarget(ax, "Fixture text"), selected = selectedTextOf(ax);
const focusedByTrailer = field !== null && focusedIndexOf(ax) === field, valueIntact = field !== null && plain(valueOfIndex(ax, field)) === ${j(CLICK_VALUE)};
const selectedLength = selected === null ? null : selected.length, sameWord = selected === ${j(CLICK_WORD)};
return {fieldIndex: field, focusedByTrailer, selectedLength, sameWord, valueIntact};`);

const PARTS = Object.freeze(['i', 'ii']);
export function clickItem188(engine) {
  const item = ITEMS_188.click(engine);
  const part = p => {
    const ready = results => results[LABELS_188.clickPrepare(item, p)]?.ok === true && results[LABELS_188.clickPrepare(item, p)].value?.ready === true;
    const done = results => Boolean(results[LABELS_188.click(item, p)]);
    return [
      {run: S188, cell: CLICK_PREPARE[p], label: LABELS_188.clickPrepare(item, p)},
      {task: '188-range', args: [item, p, 'before'], when: ready},
      {run: S188, cell: CLICK_ACT[p], label: LABELS_188.click(item, p), when: ready},
      {task: '188-range', args: [item, p, 'after'], when: done},
      {run: S188, cell: CLICK_READ, label: LABELS_188.read(item, p), when: done},
      {task: '188-click-record', args: [item, engine, p]},
    ];
  };
  return [
    {say: `#188 ${item}: cell 3 on the ${engine} engine, recorded only: (i) an element click on the field holding a selection, (ii) a positional click mid-text`},
    {series: [item], counts: {cells: PARTS.length}},
    {task: '188-preflight', args: [DRIVEN], required: true},
    {open: S188, engine, scenes: [DRIVEN]},
    ...abcSteps(item),
    ...PARTS.flatMap(part),
    {task: '188-abc', args: [item, 'end']},
    {close: S188},
  ];
}

const sameRange = (a, b) => Boolean(a && b) && a.location === b.location && a.length === b.length;
// What a click did to the field's selection, from the probe's ranges before and after (the trailer's reading when the
// probe read none). -> {outcome, where?, by}.
export function selectionOutcome(part, before, after, read) {
  if (part === 'i') {
    if (!after) {
      if (!read) return {outcome: 'unread', by: null};
      return {outcome: read.sameWord ? 'kept' : read.selectedLength === null ? 'collapsed' : 'moved', ...(read.selectedLength === null ? {where: 'unread'} : {}), by: 'trailer'};
    }
    const from = before ?? WORD_RANGE;
    if (sameRange(after, from)) return {outcome: 'kept', by: 'probe'};
    if (after.length === 0) return {outcome: 'collapsed', where: after.location === from.location ? 'at its start' : after.location === from.location + from.length ? 'at its end' : 'elsewhere', by: 'probe'};
    return {outcome: 'moved', by: 'probe'};
  }
  if (!after) return {outcome: 'unread', by: null};
  if (after.length > 0) return {outcome: 'selected', by: 'probe'};
  if (after.location >= CLICK_LINE_RANGE[0] && after.location <= CLICK_LINE_RANGE[1]) return {outcome: 'moved to the click point', by: 'probe'};
  if (after.location === (before ?? END_RANGE).location) return {outcome: 'stayed', by: 'probe'};
  return {outcome: 'moved elsewhere', by: 'probe'};
}

const num = v => (Number.isFinite(v) ? v : null);
const rangeOf = r => (r && Number.isFinite(r.location) && Number.isFinite(r.length) ? {location: r.location, length: r.length} : null);
const word = v => (typeof v === 'string' && v.length <= 80 ? v : null);
// One part's record from its answers, value-free by construction: ranges, lengths, booleans and the engine's
// enumerations only. `before`, `after`: the probe's readings ({range, focusedIsTextArea, error}).
export function clickRecord188({item, engine, part, prepare = null, before = null, click = null, after = null, read = null}) {
  const expected = part === 'i' ? WORD_RANGE : END_RANGE;
  const ready = prepare?.ok === true && prepare.value?.ready === true;
  const invalid = !prepare ? 'the prepare cell was not sent' : !prepare.ok ? 'the prepare cell failed' : !ready ? `not prepared: ${word(prepare.value?.reason) ?? 'no reason'}`
    : !click ? 'the click was not sent' : !click.ok ? 'the click cell failed' : click.value?.threw ? `the click threw${click.value.errorName ? ` (${word(click.value.errorName)})` : ''}` : null;
  const rangeBefore = rangeOf(before?.range), rangeAfter = rangeOf(after?.range);
  const r = read?.ok ? read.value ?? null : null;
  const afterRead = r && {selectedLength: num(r.selectedLength), sameWord: r.sameWord === true, valueIntact: r.valueIntact === true, focusedByTrailer: r.focusedByTrailer === true};
  const observation = metaOf(read).observation;
  const focusedOnField = observation && Object.hasOwn(observation, 'focusedIndex') && Number.isInteger(r?.fieldIndex) ? observation.focusedIndex === r.fieldIndex : null;
  const click_ = metaOf(click), ec = click_.elementClick;
  return {item, engine, part, invalid, expected, precondition: rangeBefore ? sameRange(rangeBefore, expected) : null,
    before: rangeBefore, after: rangeAfter, ...(invalid ? {outcome: null} : selectionOutcome(part, rangeBefore, rangeAfter, afterRead)),
    afterRead, focusedOnField, probeFocusOnField: typeof after?.focusedIsTextArea === 'boolean' ? after.focusedIsTextArea : null,
    point: part === 'ii' && Array.isArray(prepare?.value?.point) ? prepare.value.point.map(num) : null,
    route: num(click?.route) ?? word(click?.route ?? null), clickMs: num(click?.value?.clickMs), activationClick: word(click_.activationClick ?? null), activationGuardMs: num(click_.activationGuardMs),
    elementClick: ec ? {plan: word(ec.plan), action: word(ec.action ?? null), reason: word(ec.reason), hit: word(ec.hit ?? null), hitTest: word(ec.hitTest ?? null)} : null,
    probeError: word(before?.error ?? after?.error ?? null)};
}

// ---- the tasks -------------------------------------------------------------------------------------------------------

// The tasks the steps above name, over `d` (./item-187.mjs liveDeps187's shape: state, scene, activate, frontmost,
// probe, activations, now).
export function item188Tasks(d) {
  const st = ctx => (ctx.r188 ??= {rows: {}, windows: [], activations: null, userWindow: null});
  const attempt = fn => { try { return fn(); } catch { return null; } };
  const reading = () => {
    const f = d.frontmost();
    return ownedReading({at: d.now(), frontmost: f ? {pid: f.pid, bundleId: f.bundleId ?? null} : null, topWindow: f?.topWindow ?? null}, ownedPids(d.state()));
  };
  const alive = s => Boolean(s.activations) && attempt(() => d.activations.alive(s.activations)) === true;
  // An activation the kit means, inside its own step's span: the harness's, never a row's (./oracle.mjs).
  const activate = async (s, scene, key) => {
    const from = d.now(), answer = await d.activate(scene);
    s.windows.push({kind: 'harness', key, at: [from, d.now()], apps: [SCENES[scene].bundleId]});
    return answer;
  };
  const userNow = s => { const r = reading(); const w = userWindowOf(r, d.scene(USER).pid); return {r, w, same: Boolean(w && s.userWindow) && w.pid === s.userWindow.pid && ['x', 'y', 'width', 'height'].every(k => w.bounds[k] === s.userWindow.bounds[k])}; };
  return {
    '188-preflight': async scenes => {
      const state = d.state(), missing = scenes.filter(id => !state.scenes?.[id]);
      return {ok: missing.length === 0, scenes, ...(missing.length ? {problem: `the ${missing.join(' and ')} scene${missing.length > 1 ? 's are' : ' is'} not up (scenes-mac.mjs up ${missing.join(', ')})`} : {})};
    },
    // A scene brought to the front, the step's activation the harness's; as the user window ('user'), its window read.
    '188-activate': async ([scene, role], ctx) => {
      const s = st(ctx), answer = await activate(s, scene, `activate:${scene}`);
      if (role !== 'user') return {ok: answer?.ok !== false, scene};
      s.userWindow = userWindowOf(reading(), d.scene(scene).pid);
      return {ok: answer?.ok !== false && s.userWindow !== null, scene, userWindow: s.userWindow, ...(s.userWindow ? {} : {problem: `the user window (${scene}) did not come to the front`})};
    },
    // The current source read back: ABC, or the item sends nothing more.
    '188-abc': async ([item, edge]) => {
      const answer = attempt(() => d.probe(['input-source', 'current']));
      const source = answer && {id: answer.id ?? null, layout: answer.layout ?? null};
      const ok = source?.id === LATIN_SOURCE;
      return {ok, item, edge, source, ...(ok ? {} : {problem: `the input source reads ${source?.id ?? 'nothing'}, not ${LATIN_SOURCE}: #188's rows run only under ABC`})};
    },
    '188-activations-start': async ([item], ctx) => {
      const s = st(ctx), watch = d.activations.start();
      s.activations = watch;
      s.stop = () => d.activations.stop(watch);
      return {ok: true, item};
    },
    // Every activation the watcher saw, accounted for against the item's steps (./oracle.mjs accountActivations).
    '188-activations-stop': async ([item], ctx) => {
      const s = st(ctx), watch = s.activations;
      if (!watch) return {ok: false, item, problem: 'no activation watcher is running'};
      const wasAlive = alive(s);
      s.activations = null;
      s.stop = null;
      const lines = d.activations.stop(watch);
      d.write(`item-${item}-activations.ndjson`, lines.map(l => JSON.stringify(l)).join('\n') + (lines.length ? '\n' : ''));
      const {byRow, accounted, unaccounted} = accountActivations(lines, s.windows);
      const brief = e => ({bundleId: e.bundleId ?? null, at: e.at ?? null});
      return {ok: wasAlive, item, alive: wasAlive, lines: lines.length, byRow: Object.fromEntries(Object.entries(byRow).map(([k, v]) => [k, v.map(brief)])),
        accounted: accounted.length, unaccounted: unaccounted.map(brief), ...(wasAlive ? {} : {problem: 'the activation watcher was not running at the end'})};
    },
    '188-before': async ([key], ctx) => { st(ctx).rows[key] = {from: d.now()}; return {ok: true, key}; },
    // Before the act: in the background, the user window in front (activated once more when it is not, the kit's own
    // activation) and the watcher alive; in front, the reading only.
    '188-front': async ([key, regime], ctx) => {
      const s = st(ctx), row = (s.rows[key] ??= {});
      let result;
      if (regime !== 'background') result = {ok: true, key, reading: reading()};
      else {
        let now = userNow(s);
        if (!now.same) { await activate(s, USER, `front:${key}`); now = userNow(s); }
        const watcher = alive(s);
        result = {ok: now.same && watcher, key, reading: now.r, userWindow: now.same ? now.w : null, watcher,
          ...(now.same ? watcher ? {} : {problem: 'the activation watcher was not running before the action'} : {problem: 'the user window was not in front before the action'})};
      }
      row.front = result;
      ctx.results[LABELS_188.front(key)] = result;
      return result;
    },
    // After the act: in the background, the reading and the user window's keyboard focus (the focus probe on it).
    '188-after': async ([key, regime], ctx) => {
      const s = st(ctx), row = (s.rows[key] ??= {});
      if (regime !== 'background') { row.after = {reading: reading()}; return {ok: true, key}; }
      const w = s.userWindow, owned = ownedPids(d.state());
      const focus = w ? attempt(() => ownedFocus(d.probe(['focus', '--window', [w.pid, w.bounds.x, w.bounds.y, w.bounds.width, w.bounds.height].join(',')]), owned, w)) : null;
      row.after = {reading: reading(), focus, watcher: alive(s)};
      return {ok: row.after.watcher, key, focus};
    },
    '188-row': async ([key, engine, k], ctx) => {
      const s = st(ctx), row = (s.rows[key] ??= {}), r = ROWS_188[Number(k)], id = rowId188(r), item = key.slice(0, key.lastIndexOf('.'));
      const to = d.now(), window = Number.isFinite(row.from) ? [row.from, to] : null;
      if (window) s.windows.push({kind: 'row', key, at: window});
      return row188({spec: {key, item, id, engine, regime: r.regime, method: r.method, case: r.case, user: r.user}, window,
        prepare: ctx.results[LABELS_188.prepare(key)] ?? null, front: row.front ?? null, act: ctx.results[LABELS_188.act(key, id)] ?? null, after: row.after ?? null,
        check: ctx.results[LABELS_188.check(key)] ?? null});
    },
    // The field's selected range by the approved bundle's probe, outside either engine (numbers only).
    '188-range': async ([item, part, when], ctx) => {
      const answer = attempt(() => textViewOf(d.probe(['text-view', '--pid', String(d.scene(DRIVEN).pid)]))) ?? {error: 'the text-view probe gave no answer'};
      const kept = {range: rangeOf(answer.range), focusedIsTextArea: answer.focusedIsTextArea ?? null, error: answer.error ?? null};
      ctx.results[LABELS_188.range(item, part, when)] = kept;
      return {ok: !kept.error && kept.range !== null, item, part, when, ...kept};
    },
    '188-click-record': async ([item, engine, part], ctx) => clickRecord188({item, engine, part, prepare: ctx.results[LABELS_188.clickPrepare(item, part)] ?? null,
      before: ctx.results[LABELS_188.range(item, part, 'before')] ?? null, click: ctx.results[LABELS_188.click(item, part)] ?? null,
      after: ctx.results[LABELS_188.range(item, part, 'after')] ?? null, read: ctx.results[LABELS_188.read(item, part)] ?? null}),
  };
}

// What the runner's finally calls: the watcher an item started and did not stop.
export function stop188(ctx) {
  const s = ctx.r188;
  if (!s?.stop) return;
  const stop = s.stop;
  s.stop = null;
  s.activations = null;
  try { stop(); } catch {}
}

// ---- the judge -------------------------------------------------------------------------------------------------------

const lastAttempt = rows => rows.slice(Math.max(0, rows.map(r => r.kind).lastIndexOf('start')));
const taskResults = (rows, task) => rows.filter(r => r.kind === 'task' && r.task === task && r.result).map(r => r.result);

// A row's verdict for #188: PASS (valid, delivered, and in the background not interfering), FAIL, INVALID (with the
// reason), INCOMPLETE (the item's ABC gate or activation coverage not proven) or NOT RUN.
function verdictOf(record, {stop, gates, stopped}) {
  if (!record) return {verdict: 'NOT RUN', why: stopped ? `the item stopped: ${stopped}` : 'no record'};
  const end = gates.find(g => g.edge === 'end'), startGate = gates.find(g => g.edge === 'start');
  if (startGate?.ok !== true) return {verdict: 'INCOMPLETE', why: 'the input source was not read as ABC before the rows'};
  if (!end) return {verdict: 'INCOMPLETE', why: 'the input source was not read back after the rows'};
  if (end.ok !== true) return {verdict: 'INVALID', why: `the input source after the rows was ${end.source?.id ?? 'unread'}, not ABC`};
  if (record.invalid) return {verdict: 'INVALID', why: record.invalid};
  let interference = null;
  if (record.regime === 'background') {
    if (!stop?.ok) return {verdict: 'INCOMPLETE', why: 'the activation watcher\'s coverage was not proven'};
    if (stop.unaccounted?.length) return {verdict: 'INCOMPLETE', why: `${stop.unaccounted.length} activation(s) fell in no step of the item`};
    if (!record.oracle) return {verdict: 'INCOMPLETE', why: 'no oracle reading around the act'};
    interference = judgeInterference({...record.oracle, activations: stop.byRow?.[record.key] ?? []});
  }
  const activations = stop?.byRow?.[record.key]?.length ?? null;
  const pass = record.delivered && (interference === null || interference.ok);
  const why = !record.delivered ? `not delivered (${Object.entries(record.outcome ?? {}).map(([k, v]) => `${k} ${v}`).join(', ') || 'no outcome'})`
    : interference && !interference.ok ? `interfered: ${['frontmost', 'topWindow', 'focus'].filter(k => interference[k] === false).join(', ') || ''}${interference.activations ? ` ${interference.activations} activation(s)` : ''}${interference.route4 ? ' route 4' : ''}`.trim() : null;
  return {verdict: pass ? 'PASS' : 'FAIL', why, interference, activations};
}

// #188's judgement from the evidence (`items`: {item: its jsonl rows}). -> {rows: {engine: [...]}, cua, click, ran}.
export function judge188(items) {
  const rowsOf = name => (items[name] ? lastAttempt(items[name]) : []);
  const stoppedOf = name => rowsOf(name).findLast(r => r.kind === 'stopped')?.error ?? null;
  const rows = {}, click = {};
  for (const engine of ENGINES_188) {
    const name = ITEMS_188.rows(engine), evidence = rowsOf(name), records = taskResults(evidence, '188-row');
    const context = {stop: taskResults(evidence, '188-activations-stop').at(-1) ?? null, gates: taskResults(evidence, '188-abc'), stopped: stoppedOf(name)};
    rows[engine] = ROWS_188.map(r => { const id = rowId188(r), record = records.find(x => x.id === id) ?? null; return {id, record, ...verdictOf(record, context)}; });
    const clickName = ITEMS_188.click(engine), clickEvidence = rowsOf(clickName), gates = taskResults(clickEvidence, '188-abc');
    const abc = gates.find(g => g.edge === 'start')?.ok === true && gates.find(g => g.edge === 'end')?.ok === true;
    click[engine] = {recorded: Boolean(items[clickName]), stopped: stoppedOf(clickName), abc, parts: Object.fromEntries(PARTS.map(p => [p, taskResults(clickEvidence, '188-click-record').findLast(x => x.part === p) ?? null]))};
  }
  const cua = rows.cua, passed = cua.filter(r => r.verdict === 'PASS').length;
  const verdict = !items[ITEMS_188.rows('cua')] ? 'NOT RUN' : passed === cua.length ? 'PASS' : cua.some(r => r.verdict === 'FAIL') ? 'FAIL' : 'INCOMPLETE';
  return {ran: ALL_ITEMS_188.some(n => items[n]), rows, click, cua: {verdict, passed, of: cua.length}};
}

const cellText = r => `${r.verdict}${r.why ? ` (${r.why})` : ''}`;
const rangeText = r => (r ? `${r.location}+${r.length}` : '–');
// The two sections, for item-187.md.
export function markdown188(j188) {
  if (!j188?.ran) return ['## #188 rows (counted for #188, never for #187): NOT RUN', '', '## #188 cell 3, the click and the selection (recorded only): NOT RUN', ''];
  const lines = [`## #188 rows (counted for #188, never for #187): ${j188.cua.verdict} on cua (${j188.cua.passed} of ${j188.cua.of})`, '',
    'The native matrix\'s four Electron rows #255 repaired, run as plan.mjs defines them (its prepares, the focus judged by `focusVerdict`), under ABC, judged as the matrix judges a row: valid, delivered (the check\'s exact post-state) and, in the background (behind the run\'s Finder window), not interfering (front app, top window, the user window\'s keyboard focus, no activation outside the kit\'s own, no route 4). The vendor\'s rows are the comparison, not judged.', '',
    '| row | cua | vendor |', '|---|---|---|'];
  ROWS_188.forEach((r, k) => lines.push(`| ${rowId188(r)} | ${cellText(j188.rows.cua[k])} | ${cellText(j188.rows.vendor[k])} |`));
  lines.push('');
  for (const engine of ENGINES_188) {
    for (const r of j188.rows[engine].filter(x => x.record)) {
      const rec = r.record, i = r.interference;
      lines.push(`- ${engine} ${r.id}: prepared ${rec.prepared.length ? rec.prepared.join('; ') : 'with no stated step'}; focus read by ${rec.focusReadBy ?? '–'}${rec.observationFocus ? ` (focusedRole ${rec.observationFocus.focusedRole ?? '–'}${rec.observationFocus.focusRead ? `, focusRead ${rec.observationFocus.focusRead}` : ''})` : ''}; route ${rec.route ?? '–'}${rec.meta.activationClick ? `, activation click ${rec.meta.activationClick}` : ''}${Number.isFinite(rec.meta.activationGuardMs) ? `, guard ${rec.meta.activationGuardMs} ms` : ''}${rec.meta.paste ? `, paste stage ${rec.meta.paste.stage}` : ''}; element click ${rec.elementClick ? `${rec.elementClick.plan}${rec.elementClick.action ? ` ${rec.elementClick.action}` : ''} (${rec.elementClick.reason}${rec.elementClick.hit ? `, hit ${rec.elementClick.hit}` : ''})` : 'not in the row\'s meta (the prepare\'s click is not its cell\'s last call; cell 3 records the field\'s)'}${i ? `; oracle: frontmost ${i.frontmost}, top window ${i.topWindow}, focus ${i.focus}, activations ${i.activations}, route 4 ${i.route4}` : r.activations !== null ? `; activations ${r.activations}` : ''}`);
    }
  }
  lines.push('', '## #188 cell 3, the click and the selection (recorded only, never counted for #187 or #188)', '',
    '(i) the field holding the known value with one word selected, then an element click by index; (ii) the caret at the value\'s end, then a coordinate click mid-text (the facade\'s `click([x, y])`). The range is the approved bundle\'s AXSelectedTextRange read (`location+length`), the expected one before the click shown first.', '',
    '| engine | part | before (expected) | after | outcome | route | element click (plan, action, reason, hit) | focus on the field after | ABC |', '|---|---|---|---|---|---|---|---|---|');
  for (const engine of ENGINES_188) {
    const c = j188.click[engine];
    for (const p of PARTS) {
      const r = c.parts[p];
      if (!r) { lines.push(`| ${engine} | ${p} | – | – | ${c.recorded ? c.stopped ? `stopped: ${c.stopped}` : 'not recorded' : 'NOT RUN'} | – | – | – | ${c.abc ? 'yes' : 'no'} |`); continue; }
      const ec = r.elementClick;
      lines.push(`| ${engine} | ${p} | ${rangeText(r.before)} (${rangeText(r.expected)}) | ${rangeText(r.after)} | ${r.invalid ?? `${r.outcome}${r.where ? ` ${r.where}` : ''}${r.by === 'trailer' ? ' (by the trailer)' : ''}`} | ${r.route ?? '–'}${r.activationClick ? `, ${r.activationClick}` : ''} | ${ec ? [ec.plan, ec.action, ec.reason, ec.hit].filter(Boolean).join(', ') : '–'} | ${r.focusedOnField ?? r.afterRead?.focusedByTrailer ?? '–'} | ${c.abc ? 'yes' : 'no'} |`);
    }
  }
  lines.push('');
  return lines;
}
