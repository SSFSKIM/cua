// The vendor lane's js cells of the M2a.5 menu check (./live.mjs menu; the Decision Log's "M2a vendor reading" item
// 10), sent through the vendor host's facade in the native baseline's envelope (scripts/native-baseline/cells.mjs), on
// the TextEdit the goldens' BIND cell bound (globalThis.__apps.textedit). One cell per action, so the controller reads
// the frontmost process between them (the vendor activates; that is recorded). A cell returns indexes and booleans,
// never accessibility text. Each cell opens with a `/* live:<kind> <item> */` tag naming it.
import {cell} from '../native-baseline/cells.mjs';
import {FIRST_LINE, LAST_LINE, MENU_ITEMS, vendorMenuBarIndex, vendorMenuItem, vendorSelectedText, vendorTextAreaIndex} from './live-checks.mjs';

const j = JSON.stringify;
const HELPERS = `${vendorMenuBarIndex.toString()}
${vendorMenuItem.toString()}
${vendorSelectedText.toString()}
${vendorTextAreaIndex.toString()}
const __app = globalThis.__apps?.textedit;
if (!__app) throw new Error("TextEdit is not bound on this connection");
const __error = e => String(e?.message ?? e).slice(0, 300);`;
const itemOf = id => { if (!Object.hasOwn(MENU_ITEMS, id)) throw new Error(`unknown menu item ${id}`); return MENU_ITEMS[id]; };

// The document's first line selected through selectText on its text area (Bold needs text selected). -> {prepared}.
export const SELECT_FIRST_LINE = cell(`/* live:select bold */
${HELPERS}
const ax = await __app.getAXState({emit: false, disableDiffing: true});
const index = vendorTextAreaIndex(ax, ${j(FIRST_LINE)});
if (index === null) throw new Error("the run's document is not in the vendor's tree");
await __app.selectText(index, ${j(FIRST_LINE)});
return {prepared: vendorSelectedText(await __app.getAXState({emit: false})) === ${j(FIRST_LINE)}};`);

// A full observation, then a click on the item's menu-bar item (the vendor records it, after its fake activation).
// -> {barFound, recorded, clickError}.
export const MENU_BAR = id => cell(`/* live:bar ${id} */
${HELPERS}
const ax = await __app.getAXState({emit: false, disableDiffing: true});
const index = vendorMenuBarIndex(ax, ${j(itemOf(id).menu)});
if (index === null) return {barFound: false, recorded: false, clickError: null};
try { await __app.click(index); return {barFound: true, recorded: true, clickError: null}; }
catch (e) { return {barFound: true, recorded: false, clickError: __error(e)}; }`);

// The observation the record roots, the item's enabled state, and a click on it unless it reads disabled.
// -> {found, enabled, clicked, clickError}.
export const MENU_ITEM = id => cell(`/* live:item ${id} */
${HELPERS}
const item = vendorMenuItem(await __app.getAXState({emit: false}), ${j(itemOf(id).path)});
if (!item) return {found: false, enabled: null, clicked: false, clickError: null};
if (!item.enabled) return {found: true, enabled: false, clicked: false, clickError: null};
try { await __app.click(item.index); return {found: true, enabled: true, clicked: true, clickError: null}; }
catch (e) { return {found: true, enabled: true, clicked: false, clickError: __error(e)}; }`);

// The item's effect read back through an observation: Select All's selection is the whole document, Bold's first line
// renders bold. -> {effect}.
export const EFFECT = id => {
  itemOf(id);
  const test = id === 'selectAll'
    ? `const s = vendorSelectedText(ax); return {effect: typeof s === "string" && s.startsWith(${j(FIRST_LINE)}) && s.trimEnd().endsWith(${j(LAST_LINE)})};`
    : `return {effect: ax.includes(${j(`**${FIRST_LINE}**`)})};`;
  return cell(`/* live:effect ${id} */
${HELPERS}
const ax = await __app.getAXState({emit: false});
${test}`);
};
