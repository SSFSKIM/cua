// The AT-SPI investigations of M4's T6 (#171; the Design's Observation paragraph on `Cache.GetItems`, and the M4
// candidate on GTK 4 text through `EditableText`): one probe pass, `--experiment atspi`.
//
// - `Cache.GetItems` over the matrix: which application families answer it, under which signature, and, where one
//   answers, the window's subtree rebuilt from the answer alone against cua-engine's per-element read of the same
//   window (atspi-cache.mjs): its numeric roles through libatspi's table against `GetRoleName`, Name, Description, the
//   vendor's states and the children in order, and the -1 sentinels. Then the cases adoption names: open menus (the
//   harness scenes pages/atspi-gtk4.py and pages/atspi-qt.py open their own, so the probe sends no input), Qt 5 and 6,
//   and a tree that changes every 250 ms, read in pairs (the answer, then the per-element read) whose straddling of a
//   change is told from the scene's own record of each change.
// - GTK 4's `EditableText`: whether its text widgets implement it, and in a text view, an entry and gnome-text-editor's
//   document, whether `InsertText` inserts, whether Ctrl+Z takes the insert back with the earlier history kept, and
//   which of the widget's signals the insert raises beside those one XTEST key raises; a control in a window of its own
//   (the key, then Ctrl+Z, no `InsertText`) shows each widget's undo working without it.
//
// Where it runs: only on a private X server it starts itself (`startPrivateServer`, under its watchdog and marked
// private), with Openbox there, and the harness's own Desktop on it: every application through the one spawner, in
// the run's homes, under the run's own session bus and accessibility bus launcher. Before anything starts it withdraws
// the harness's live-run declaration, so the spawner refuses any display this process did not create, `:0` included
// (xspawn.mjs); its X input (the GTK 4 text steps' XTEST keys) therefore reaches only its own display. It reads only the
// windows it opened, and writes only into the GTK 4 text widgets the EditableText questions name, all of them windows
// it opened. Its accessibility bus is its own display's, so the probe can never show up in another run's accessibility
// bus trace, and a bus-traced verdict run never sees it. No whole-run RECORD runs: nothing but the probe's own windows
// is on its display, and RECORD can freeze the X server (task 41).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';

import { CACHE_INTERFACE, CACHE_PATH, adoptionReasons, atspiRoleName, cacheSubtree, compareWithTree, decodeStateWords, editableFindings, parseItems, roleCollisions, signatureKind, straddles, trackedNames } from './atspi-cache.mjs';
import { electronReady, openFamily } from './families.mjs';
import { preorder } from './normalize.mjs';
import { Oracle } from './oracle.mjs';
import { Desktop, desktopEnding } from './scenes.mjs';
import { startPrivateServer, xdotool } from './xtools.mjs';
import { LIVE_RUN, assertReachable, xExecFileSync } from './xspawn.mjs';

/** The families of the matrix (M0.4, gnome-terminal from M2), asked who answers. */
export const MATRIX = ['gedit', 'gnome-text-editor', 'kate', 'qtcreator', 'firefox', 'chrome', 'electron', 'writer', 'writer-gen', 'gnome-terminal', 'xterm'];

/** What the probe writes through `InsertText`. */
export const INSERT = ' cua171-inserted';

/** A display name of the hermetic family (xspawn.mjs): before the probe's own server exists, DISPLAY names none. */
const NO_DISPLAY = ':cua171-atspi-probe';
const ROOT = '/org/a11y/atspi/accessible/root';
const PAIRS = 30;
// the largest answer a row keeps whole (with the read it was compared with): the harness scenes' and gnome-text-editor's
const KEEP_ITEMS = 500;
// the Names of the changing scene's moving parts (pages/atspi-gtk4.py `changing`)
const MOVING = /^(tick|row) \d+$/;
// a change made this long before a read began may still be reaching the bus: the read counts as straddling it
const GUARD_MS = 50;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const busOf = (id) => id.slice(0, id.indexOf(':/'));
const firstLine = (text) => String(text ?? '').trim().split('\n')[0].slice(0, 300);

/** DISPLAY set to a display the spawner lets this process reach: its own, or the hermetic name before it has one. */
function useDisplay(display) {
  assertReachable('the AT-SPI probe', [], { DISPLAY: display });
  process.env.DISPLAY = display;
}

/** busctl's JSON answer `{type, data}` on the run's accessibility bus. */
function busctl(address, args, timeoutS = 25) {
  const text = execFileSync('busctl', [`--address=${address}`, '--json=short', `--timeout=${timeoutS}`, ...args], { encoding: 'utf8', timeout: (timeoutS + 10) * 1000, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(text);
}

/** The signature an application's introspection data gives `GetItems`, or null when it has none. */
function advertised(address, bus) {
  try {
    const xml = execFileSync('busctl', [`--address=${address}`, '--timeout=10', 'introspect', '--xml-interface', bus, CACHE_PATH], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] });
    return xml.match(/<method name="GetItems">[\s\S]*?type="([^"]+)"/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * One `GetItems` call: `{type, kind, items, ms, error}`. `ms` is busctl's whole run, its own start included, so it
 * bounds the call from above and is no speed measurement.
 */
function askCache(address, bus) {
  const started = performance.now();
  try {
    const { type, data } = busctl(address, ['call', bus, CACHE_PATH, CACHE_INTERFACE, 'GetItems']);
    const ms = Math.round(performance.now() - started);
    if (!signatureKind(type)) return { type, kind: null, items: null, ms, error: `an answer under the signature ${type}, which is neither known one` };
    return { type, ...parseItems(type, data), ms };
  } catch (error) {
    return { type: null, kind: null, items: null, ms: Math.round(performance.now() - started), error: firstLine(error.stderr || error.message) };
  }
}

/**
 * A node the answer holds and the per-element read does not: what the answer says of it, and what the application
 * answers for it when asked directly (its role, its index in its parent, and whether its parent's `GetChildren` lists
 * it), so the evidence says what kind of node the cache keeps that the tree does not show.
 */
function explainOnlyCache(oracle, items, id) {
  const item = items.find((i) => i.id === id);
  const parent = items.find((i) => i.id === item?.parent);
  const ask = (fn) => {
    try {
      return fn();
    } catch (error) {
      return `error: ${firstLine(error.stderr || error.message)}`;
    }
  };
  return {
    id,
    cache: item ? { role: atspiRoleName(item.role) ?? item.role, name: item.name || null, states: decodeStateWords(item.states), index: item.index, parent_child_count: parent?.childCount ?? null } : null,
    role_name: ask(() => oracle.role(id)),
    index_in_parent: ask(() => oracle.on(id, 'org.a11y.atspi.Accessible', 'GetIndexInParent')[0]),
    listed_by_parent: item?.parent ? ask(() => oracle.children(item.parent).includes(id)) : null,
  };
}

/** What a comparison row keeps: the counts, and a few examples of each kind of difference. */
function compareRow(answer, tree, oracle = null) {
  const sub = cacheSubtree(answer.items, tree.id);
  const cmp = compareWithTree(sub.tree, tree, atspiRoleName);
  return {
    equal: cmp.equal,
    structural: cmp.structural,
    nodes: cmp.nodes,
    only: { cache: cmp.only.cache.length, tree: cmp.only.tree.length, cache_first: oracle ? cmp.only.cache.slice(0, 4).map((id) => explainOnlyCache(oracle, answer.items, id)) : cmp.only.cache.slice(0, 4), tree_first: cmp.only.tree.slice(0, 4) },
    fields: cmp.fields,
    unknown_roles: cmp.unknownRoles,
    // every kind of difference shown before the role names, which are many
    examples: [...cmp.examples.filter((e) => e.field !== 'role'), ...cmp.examples.filter((e) => e.field === 'role')].slice(0, 12),
    sentinels: sub.sentinels,
    unordered: sub.unordered.length,
    anomalies: { count: sub.anomalies.length, first: sub.anomalies.slice(0, 4) },
    roles: cmp.roles,
  };
}

/** The whole answer's -1 sentinels, wherever they sit (outside the window's subtree too), with the roles that carry them. */
function answerSentinels(items) {
  const at = (pick) => {
    const roles = {};
    for (const i of items.filter(pick)) roles[atspiRoleName(i.role) ?? i.role] = (roles[atspiRoleName(i.role) ?? i.role] ?? 0) + 1;
    return { count: items.filter(pick).length, roles };
  };
  return { index: at((i) => i.index === -1), child_count: at((i) => i.childCount === -1) };
}

/** The record lines a harness scene wrote (pages/atspi-*.py), each `{t, event, ...}`. */
function recordOf(scene) {
  if (!scene.record || !existsSync(scene.record)) return [];
  return readFileSync(scene.record, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

async function waitForEvent(scene, event, ms = 15000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (recordOf(scene).some((r) => r.event === event)) return true;
    await sleep(100);
  }
  return false;
}

/** The application's bus: the frame's, or the registry's application of the scene's process. */
function busFor(oracle, scene, tree) {
  if (tree) return busOf(tree.id);
  const apps = scene.pid ? oracle.appsOf(scene.pid) : [];
  return apps[0] ? busOf(apps[0]) : null;
}

/** Who answers: one window of a family, its provider asked for its cache, and the answer rebuilt against the read. */
async function whoAnswers(ctx, family) {
  const { desktop, oracle, emit, address } = ctx;
  const row = { kind: 'atspi-answer', family };
  let scene = null;
  try {
    if (family === 'electron' && !electronReady()) throw new Error('the Electron fixture is not installed (npm ci)');
    scene = await openFamily(desktop, oracle, family, 'answer');
    const state = await desktop.state(scene);
    row.source = state.ax_tree_source;
    const tree = row.source === 'at_spi' ? state.ax_tree : null;
    const bus = busFor(oracle, scene, tree);
    row.provider = bus !== null;
    if (bus) {
      row.toolkit = oracle.toolkit(`${bus}:${ROOT}`);
      row.advertised = advertised(address, bus);
      const answer = askCache(address, bus);
      Object.assign(row, { type: answer.type, signature: answer.kind, items: answer.items?.length ?? null, ms: answer.ms, error: answer.error });
      if (answer.items) row.sentinels = answerSentinels(answer.items);
      if (answer.items && tree) row.compare = compareRow(answer, tree, oracle);
      if (tree) row.tree_nodes = preorder(tree).length;
      // a small answer is kept whole, with the read, so the comparison can be checked again offline
      if (answer.items?.length && answer.items.length <= KEEP_ITEMS && tree) row.kept = { items: answer.items, tree };
    }
  } catch (error) {
    row.failure = firstLine(error.message);
  } finally {
    if (scene) await desktop.close([scene]);
  }
  emit(row);
  return row;
}

/** An open menu (the scene opens its own): the answer against the read, and the menu roles each holds. */
async function openMenus(ctx, family, mode) {
  const { desktop, oracle, emit, address } = ctx;
  const row = { kind: 'atspi-menus', family };
  let scene = null;
  try {
    scene = await openFamily(desktop, oracle, family, 'menus', { mode });
    row.menu_opened = await waitForEvent(scene, 'menu-opened');
    await sleep(1000);
    const answer = askCache(address, busFor(oracle, scene, null) ?? '');
    const state = await desktop.state(scene);
    row.source = state.ax_tree_source;
    const menuRoles = (roles) => roles.filter((r) => /menu/.test(r)).length;
    row.tree_menu_nodes = state.ax_tree ? menuRoles(preorder(state.ax_tree).map((n) => n.role)) : null;
    Object.assign(row, { signature: answer.kind, items: answer.items?.length ?? null, error: answer.error });
    if (answer.items) row.cache_menu_nodes = menuRoles(answer.items.map((i) => atspiRoleName(i.role) ?? ''));
    if (answer.items && state.ax_tree && row.source === 'at_spi') row.compare = compareRow(answer, state.ax_tree, oracle);
    if (answer.items?.length && answer.items.length <= KEEP_ITEMS && state.ax_tree) row.kept = { items: answer.items, tree: state.ax_tree };
  } catch (error) {
    row.failure = firstLine(error.message);
  } finally {
    if (scene) await desktop.close([scene]);
  }
  emit(row);
  return row;
}

/**
 * A changing tree: `PAIRS` reads in pairs, the answer then the per-element read, each pair marked by whether a change
 * the scene recorded fell inside it (or within `GUARD_MS` before it). The answer reproduces the read on a changing tree
 * only if every quiet pair is equal.
 */
async function changingTree(ctx, family, mode) {
  const { desktop, oracle, emit, address } = ctx;
  const row = { kind: 'atspi-changing', family };
  let scene = null;
  try {
    scene = await openFamily(desktop, oracle, family, 'changing', { mode });
    row.started = await waitForEvent(scene, 'changing-started');
    await sleep(600);
    const bus = busFor(oracle, scene, null);
    const pairs = [];
    for (let k = 0; k < PAIRS; k++) {
      const start = Date.now();
      const answer = askCache(address, bus ?? '');
      const state = await desktop.state(scene);
      const end = Date.now();
      pairs.push({ start, end, answer, state });
      await sleep(37 * (k % 5));
    }
    const changes = recordOf(scene).filter((r) => r.event === 'changed');
    row.changes = changes.filter((c) => c.t >= pairs[0].start && c.t <= pairs.at(-1).end).length;
    row.pairs = pairs.map(({ start, end, answer, state }) => {
      const straddled = straddles(changes, { start: start - GUARD_MS, end });
      const read = state.ax_tree_source === 'at_spi' ? state.ax_tree : null;
      const compared = answer.items && read ? compareRow(answer, read) : null;
      // the scene's moving parts (its `tick` label and its rows) as each read has them
      const tracked = answer.items && read ? { cache: trackedNames(cacheSubtree(answer.items, read.id).tree, MOVING), read: trackedNames(read, MOVING) } : null;
      return { straddled, ms: end - start, signature: answer.kind, items: answer.items?.length ?? null, error: answer.error, equal: compared?.equal ?? null, structural: compared?.structural ?? null, fields: compared?.fields ?? null, only: compared ? { cache: compared.only.cache, tree: compared.only.tree } : null, tracked, moving_same: tracked ? JSON.stringify(tracked.cache) === JSON.stringify(tracked.read) : null, examples: compared && !compared.equal ? compared.examples.filter((e) => e.field !== 'role').slice(0, 4) : undefined };
    });
    const tally = (list) => ({ pairs: list.length, equal: list.filter((p) => p.equal === true).length, structural: list.filter((p) => p.structural === true).length, moving_same: list.filter((p) => p.moving_same === true).length });
    row.quiet = tally(row.pairs.filter((p) => !p.straddled));
    row.straddled = tally(row.pairs.filter((p) => p.straddled));
  } catch (error) {
    row.failure = firstLine(error.message);
  } finally {
    if (scene) await desktop.close([scene]);
  }
  emit(row);
  return row;
}

/** A Qt scene (pages/atspi-qt.py): its answer once its own menu is open, then while its tree changes. */
async function qtScene(ctx, family) {
  const { desktop, oracle, emit, address } = ctx;
  const row = { kind: 'atspi-qt', family };
  let scene = null;
  try {
    scene = await openFamily(desktop, oracle, family, 'qt');
    const state = await desktop.state(scene);
    row.source = state.ax_tree_source;
    const tree = row.source === 'at_spi' ? state.ax_tree : null;
    const bus = busFor(oracle, scene, tree);
    row.toolkit = bus ? oracle.toolkit(`${bus}:${ROOT}`) : null;
    row.advertised = bus ? advertised(address, bus) : null;
    row.menu_opened = await waitForEvent(scene, 'menu-opened');
    await sleep(500);
    const menu = askCache(address, bus ?? '');
    const menuState = await desktop.state(scene);
    row.at_menu = { signature: menu.kind, type: menu.type, items: menu.items?.length ?? null, error: menu.error, tree_nodes: menuState.ax_tree ? preorder(menuState.ax_tree).length : null, tree_menu_nodes: menuState.ax_tree ? preorder(menuState.ax_tree).filter((n) => /menu/.test(n.role)).length : null };
    row.changing_started = await waitForEvent(scene, 'changing-started');
    const polls = [];
    for (let k = 0; k < 10; k++) {
      const answer = askCache(address, bus ?? '');
      polls.push(answer.items?.length ?? null);
      await sleep(180);
    }
    row.while_changing = polls;
    row.changes = recordOf(scene).filter((r) => r.event === 'changed').length;
  } catch (error) {
    row.failure = firstLine(error.message);
  } finally {
    if (scene) await desktop.close([scene]);
  }
  emit(row);
  return row;
}

/**
 * A text widget's whole text, read up to its `CharacterCount`: GTK 4.14's entry answers `GetText(0, -1)` with the
 * empty string whatever it holds (the probe's first pass), so the end is given as a count.
 */
function textOf(oracle, id) {
  return oracle.on(id, 'org.a11y.atspi.Text', 'GetText', 'ii', 0, oracle.count(id))[0];
}

async function waitForText(oracle, id, previous, ms) {
  const deadline = Date.now() + ms;
  let text = previous;
  while (Date.now() < deadline) {
    text = textOf(oracle, id);
    if (text !== previous) return text;
    await sleep(50);
  }
  return text;
}

/**
 * GTK 4's `EditableText` in one text widget of a window the probe opened: the interfaces and methods it offers, then
 * the steps `editableFindings` reads (one XTEST key, the probe's `InsertText`, two XTEST Ctrl+Z), each with the text
 * read back and the signals the scene recorded meanwhile. `mode`: the harness scene's (`text-view`, `entry`), or none
 * for gnome-text-editor's document.
 */
async function editableText(ctx, family, mode, { control = false } = {}) {
  const { desktop, oracle, emit, address } = ctx;
  const row = { kind: 'atspi-editable', family, mode: mode ?? 'document', control };
  let scene = null;
  const key = (name) => () => {
    xdotool('key', name);
    return {};
  };
  try {
    scene = await openFamily(desktop, oracle, family, `${control ? 'control' : 'edit'}${mode ?? 'doc'}`.replace(/[^a-z]/g, ''), mode ? { mode } : {});
    xdotool('windowactivate', '--sync', scene.id);
    await sleep(500);
    const nodes = preorder((await desktop.state(scene)).ax_tree);
    const editable = nodes.filter((n) => {
      try {
        return oracle.on(n.id, 'org.a11y.atspi.Accessible', 'GetInterfaces')[0].includes('org.a11y.atspi.EditableText');
      } catch {
        return false;
      }
    });
    row.editable_nodes = editable.map((n) => ({ role: n.role, focused: (n.states ?? []).includes('focused') }));
    const target = mode ? editable.find((n) => (n.states ?? []).includes('focused')) : nodes.find((n) => n.id === scene.field);
    if (!target) throw new Error(`no focused node with EditableText among ${editable.length}`);
    row.role = target.role;
    row.interfaces = oracle.on(target.id, 'org.a11y.atspi.Accessible', 'GetInterfaces')[0];
    const [bus, path] = [busOf(target.id), target.id.slice(target.id.indexOf(':/') + 1)];
    row.methods = execFileSync('busctl', [`--address=${address}`, 'introspect', bus, path, 'org.a11y.atspi.EditableText'], { encoding: 'utf8', timeout: 20000, stdio: ['ignore', 'pipe', 'pipe'] })
      .split('\n')
      .filter((l) => l.startsWith('.'))
      .map((l) => l.split(/\s+/).slice(0, 4).join(' '));
    const titleBefore = desktop.windowTitle(scene.id);
    // only a harness scene records its signals; an application's are not seen (null)
    const events = (from, to) => (scene.record ? recordOf(scene).filter((r) => r.t >= from && r.t <= to).map((r) => r.event) : null);
    const steps = [{ step: 'before', text: textOf(oracle, target.id), whole_by_minus_one: oracle.text(target.id) }];
    row.steps = steps;
    try {
      row.caret_set = oracle.setCaret(target.id, 0);
    } catch (error) {
      row.caret_set = `error: ${firstLine(error.stderr || error.message)}`;
    }
    const act = async (step, send, wait = 2000) => {
      const from = Date.now();
      const previous = steps.at(-1).text;
      const extra = await send();
      const text = await waitForText(oracle, target.id, previous, wait);
      await sleep(300);
      steps.push({ step, text: textOf(oracle, target.id) ?? text, ...extra, events: events(from, Date.now()) });
    };
    await act('typed', key('q'));
    if (control) {
      // the control: the same key and one Ctrl+Z with no InsertText between, which must take the key back
      await act('undo 1', key('ctrl+z'), 1500);
      row.control_undone = steps[1].text !== steps[0].text && steps[2].text === steps[0].text;
    } else {
      // the insert far from the typed key, so no undo history could merge the two
      const typedAt = [...steps[1].text].findIndex((c, k) => c !== [...steps[0].text][k]);
      const length = [...steps[1].text].length;
      const position = typedAt >= 0 && typedAt < length / 2 ? length : 0;
      row.insert_at = position;
      await act('inserted', () => {
        try {
          return { answer: oracle.insertText(target.id, position, INSERT) };
        } catch (error) {
          return { answer: `error: ${firstLine(error.stderr || error.message)}` };
        }
      });
      await act('undo 1', key('ctrl+z'), 1500);
      await act('undo 2', key('ctrl+z'), 1500);
      row.findings = editableFindings(steps, INSERT);
      row.title_changed = desktop.windowTitle(scene.id) !== titleBefore;
    }
  } catch (error) {
    row.failure = firstLine(error.message);
  } finally {
    if (scene) await desktop.close([scene]);
  }
  emit(row);
  return row;
}

const yes = (v) => (v === true ? 'yes' : v === false ? 'no' : v === null || v === undefined ? '–' : String(v));
const differing = (c) => (c ? Object.entries(c.fields).filter(([, n]) => n).map(([f, n]) => `${f} ${n}`).join(', ') || 'none' : '–');
const extra = (c) => (c ? `${c.only.cache} / ${c.only.tree}` : '–');
const signals = (events) => (events === null || events === undefined ? 'not recorded' : events.join(', ') || 'nothing');

/** The summary's Markdown, and the adoption verdict, from the probe's rows. */
export function atspiMarkdown({ answers, menus, changing, qt, editable, display }) {
  const md = [`On the probe's own private display ${display}, with cua-engine's per-element read of each window as the reference. "Same structure" is the same nodes in the same places with the same Name, Description and states, whatever libatspi's table makes of the role numbers.`, ''];
  md.push('### Who answers `Cache.GetItems`', '', '| family | toolkit | tree | GetItems | signature (advertised) | items | window subtree: cache / read / both | only in the cache / only in the read | fields differing | same structure | -1 index / count (whole answer) |', '|---|---|---|---|---|---:|---|---|---|---|---|');
  for (const a of answers) {
    const tk = a.toolkit ? `${a.toolkit.toolkit ?? '?'} ${a.toolkit.toolkit_version ?? ''}`.trim() : '–';
    const got = a.failure ? `failed: ${a.failure}` : !a.provider ? 'no accessibility provider' : a.signature ? 'answers' : a.error ?? '–';
    const c = a.compare;
    md.push(`| ${a.family} | ${tk} | ${a.source ?? '–'} | ${got} | ${a.signature ?? '–'}${a.advertised && a.advertised !== a.type ? ` (advertised \`${a.advertised}\`)` : ''} | ${a.items ?? '–'} | ${c ? `${c.nodes.cache} / ${c.nodes.tree} / ${c.nodes.both}` : '–'} | ${extra(c)} | ${differing(c)} | ${yes(c?.structural)} | ${a.sentinels ? `${a.sentinels.index.count} / ${a.sentinels.child_count.count}` : '–'} |`);
  }
  // what the nodes only the cache holds are, as the application answers for them when asked directly
  for (const r of [...answers, ...menus].filter((x) => x.compare?.only.cache)) {
    const shown = r.compare.only.cache_first.filter((o) => typeof o === 'object').map((o) => `${o.cache?.role ?? '?'} (GetRoleName ${o.role_name}) at index ${o.cache?.index} under a parent whose child count is ${o.cache?.parent_child_count}, ${o.listed_by_parent === false ? 'not listed by the parent\'s GetChildren' : `listed by the parent: ${o.listed_by_parent}`}, GetIndexInParent ${o.index_in_parent}`);
    if (shown.length) md.push('', `${r.family}${r.kind === 'atspi-menus' ? ' with its menu open' : ''}: the cache holds ${r.compare.only.cache} node(s) the read does not: ${shown.join('; ')}.`);
  }
  const pairs = [...answers, ...menus].flatMap((r) => r.compare?.roles ?? []);
  const roles = roleCollisions(pairs, atspiRoleName);
  md.push('', "### Role numbers against `GetRoleName`, through libatspi's table (every node both reads hold, in the windows above and the open menus)", '', '| number | libatspi | GetRoleName (nodes) |', '|---:|---|---|');
  for (const n of [...roles.numbers].sort((a, b) => a.role - b.role)) md.push(`| ${n.role} | ${n.table ?? 'none'} | ${Object.entries(n.names).map(([k, v]) => `${k} (${v})`).join(', ')} |`);
  md.push('', `${pairs.length} nodes; the table names ${roles.tableMisses} of them otherwise than GetRoleName; numbers GetRoleName names several ways: ${roles.ambiguous.join(', ') || 'none'}.`);
  md.push('', '### Open menus (the scene opens its own)', '', '| scene | menu open | GetItems | items | menu nodes (cache / read) | only in the cache / only in the read | fields differing | equal to the read | same structure |', '|---|---|---|---:|---|---|---|---|---|');
  for (const m of menus) md.push(`| ${m.family} | ${yes(m.menu_opened)} | ${m.failure ? `failed: ${m.failure}` : m.signature ?? m.error ?? '–'} | ${m.items ?? '–'} | ${m.cache_menu_nodes ?? '–'} / ${m.tree_menu_nodes ?? '–'} | ${extra(m.compare)} | ${differing(m.compare)} | ${yes(m.compare?.equal)} | ${yes(m.compare?.structural)} |`);
  md.push('', `### A changing tree (${PAIRS} pairs: GetItems, then the per-element read; a pair is quiet when no change fell inside it or within ${GUARD_MS} ms before it)`, '', '| scene | changes during the pairs | pairs | equal to the read | same structure | moving parts as the read has them |', '|---|---:|---|---|---|---|');
  for (const c of changing) {
    if (c.failure) md.push(`| ${c.family} | – | failed: ${c.failure} | | | |`);
    else for (const [which, t] of [['quiet', c.quiet], ['straddling', c.straddled]]) md.push(`| ${c.family} | ${c.changes ?? '–'} | ${t.pairs} ${which} | ${t.equal} | ${t.structural} | ${t.moving_same} |`);
  }
  md.push('', '### Qt 5 and Qt 6 (the harness scene: its own menu open, then its tree changing)', '', '| scene | toolkit | signature (advertised) | items with the menu open | read nodes (menu nodes) | items while changing |', '|---|---|---|---:|---|---|');
  for (const q of qt) md.push(`| ${q.family} | ${q.toolkit ? `${q.toolkit.toolkit} ${q.toolkit.toolkit_version}` : '–'} | ${q.failure ? `failed: ${q.failure}` : `${q.at_menu?.signature ?? q.at_menu?.error ?? '–'}${q.advertised ? ` (advertised \`${q.advertised}\`)` : ''}`} | ${q.at_menu?.items ?? '–'} | ${q.at_menu?.tree_nodes ?? '–'} (${q.at_menu?.tree_menu_nodes ?? '–'}) | ${(q.while_changing ?? []).join(', ') || '–'} |`);
  const comparisons = [
    ...answers.filter((a) => a.compare).map((a) => ({ what: `${a.family}'s window`, equal: a.compare.equal })),
    ...menus.map((m) => ({ what: `${m.family} with its menu open`, equal: m.compare?.equal === true })),
    ...changing.map((c) => ({ what: `${c.family} changing, quiet pairs${c.quiet?.pairs ? '' : ' (none was quiet)'}`, equal: Boolean(c.quiet?.pairs) && c.quiet.equal === c.quiet.pairs })),
  ];
  // the Qt scenes are answers too: a window with its menu open and its tree changing
  const qtAnswers = qt.map((q) => ({ family: `${q.family} (its menu open)`, provider: true, kind: q.at_menu?.signature ?? null, items: q.at_menu?.items ?? null, error: q.at_menu?.error ?? q.failure }));
  const asked = answers.map((a) => ({ family: a.family, provider: a.provider, kind: a.signature ?? null, items: a.items, error: a.error ?? a.failure }));
  const reasons = adoptionReasons({ answers: [...asked, ...qtAnswers], comparisons, roles });
  md.push('', '### GTK 4 `EditableText` (one XTEST key, then `InsertText`, then two XTEST Ctrl+Z; the control, in a window of its own: the key, then one Ctrl+Z)', '', '| widget | role | EditableText methods | GetText(0, -1) gives the whole text | SetCaretOffset | control: Ctrl+Z takes the key back | InsertText answer | inserted | first Ctrl+Z takes the insert back | second takes the key back | the insert raised | the key raised |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const e of editable.filter((x) => !x.control)) {
    const f = e.findings;
    const c = editable.find((x) => x.control && x.family === e.family && x.mode === e.mode);
    md.push(`| ${e.family} ${e.mode} | ${e.role ?? '–'} | ${e.failure ? `failed: ${e.failure}` : (e.methods ?? []).map((m) => m.split(' ')[0].replace(/^\./, '')).join(', ')} | ${e.steps ? yes(e.steps[0].whole_by_minus_one === e.steps[0].text) : '–'} | ${yes(e.caret_set)} | ${c ? (c.failure ? `failed: ${c.failure}` : yes(c.control_undone)) : '–'} | ${yes(f?.answer)} | ${yes(f?.inserted)} | ${yes(f?.undoRemovesInsert)} | ${yes(f?.historyKept)} | ${f ? signals(f.insertEvents) : '–'} | ${f ? signals(f.typedEvents) : '–'} |`);
  }
  md.push('', reasons.length ? `**Cache.GetItems: not adopted.** ${reasons.join('; ')}.` : '**Cache.GetItems: nothing in this pass stands against adoption under the Observation rules.**');
  return { md, reasons, roles };
}

/**
 * `--experiment atspi`: the pass. Returns `{md, complete}`: complete when the display stayed watched, every family and
 * scene was read (a failure to open or read one leaves the pass incomplete, whatever it found), and the run's own trace
 * saw no window of another's changed.
 */
export async function runAtspi(args, { emit, run }) {
  // from here on the spawner refuses every display this process did not create (xspawn.mjs), the person's included
  delete process.env[LIVE_RUN];
  useDisplay(NO_DISPLAY);
  const server = await startPrivateServer({ out: args.out });
  useDisplay(server.display);
  emit({ kind: 'atspi-display', display: server.display, cua_version: xExecFileSync(args.cua, ['--version'], { encoding: 'utf8' }).trim() });
  const desktop = new Desktop({ cua: args.cua, run, logs: args.out });
  const rows = { answers: [], menus: [], changing: [], qt: [], editable: [] };
  let wm = null;
  let watched = null;
  try {
    await desktop.begin({ startRecord: async () => null });
    // Openbox in the run's home, so the engines find windows through its client list; nothing of the person's is read
    wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
    await sleep(1500);
    const oracle = new Oracle();
    desktop.oracle = oracle;
    const ctx = { desktop, oracle, emit, address: oracle.address };
    for (const family of args.families.length ? args.families : MATRIX) rows.answers.push(await whoAnswers(ctx, family));
    rows.menus.push(await openMenus(ctx, 'atspi-gtk4', 'menus'));
    rows.changing.push(await changingTree(ctx, 'atspi-gtk4', 'changing'));
    for (const family of ['atspi-qt5', 'atspi-qt6']) rows.qt.push(await qtScene(ctx, family));
    // each widget twice, in windows of its own: the control (a key and Ctrl+Z), then the key, InsertText and Ctrl+Z twice
    for (const [family, mode] of [['atspi-gtk4', 'text-view'], ['atspi-gtk4', 'entry'], ['gnome-text-editor', null]]) {
      for (const control of [true, false]) rows.editable.push(await editableText(ctx, family, mode, { control }));
    }
  } finally {
    await desktop.closeAll();
    if (wm) {
      try {
        process.kill(-wm.pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
    watched = await server.stop();
  }
  const { md, reasons } = atspiMarkdown({ ...rows, display: server.display });
  const ending = desktopEnding(desktop.ending);
  const failed = [...Object.values(rows).flat().filter((r) => r.failure).map((r) => `${r.kind} ${r.family}: ${r.failure}`), ...ending.foreign.map((f) => `a window the probe did not open was changed: ${f}`)];
  if (!watched.clean) failed.push(`the private display's watchdog: ${watched.reason}`);
  if (failed.length) md.push('', `**Incomplete:** ${failed.join('; ')}.`);
  emit({ kind: 'atspi-verdict', adopted: reasons.length === 0, reasons });
  return { md, complete: failed.length === 0, failed, ending };
}
