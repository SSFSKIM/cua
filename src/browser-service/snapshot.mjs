// Ported from readable chatgpt-26.928.40906 BS:49305-49506 (BO, OO, vJ, _J, RO, xJ, DO, MO, NO, TJ, CJ and SJ: playwright_dom_snapshot); see docs/doperpowers/specs/2026-10-13-own-browser-service-design.md "Porting".
// Also: IO (BS:49305); Eo (BS:10537-10539, the sentence of a command a backend does not serve).
//
// `playwright_dom_snapshot`: Playwright's aria snapshot (`incrementalAriaSnapshot`, mode "ai") of the tab's document,
// taken by the injected script in its isolated world, with every visible, not aria-hidden iframe's own snapshot
// stitched in under its `- iframe` line (same-process frames entered in the page, out-of-process ones through their
// targets, as selectors.mjs routes `aria-ref=<ref> >> internal:control=enter-frame >> body`); a frame that cannot be
// read keeps its bare line. The text is then flattened the vendor's way: anonymous `generic`, `listitem` and `group`
// lines give way to their children, bare `img` lines go, `[ref=…]` and `[cursor=…]` are stripped. An iframe line gains
// its element's id and name. One Deadline (`timeout_ms`, clamped: 3 s by default) bounds the whole command, frames
// included (the vendor gives each frame a budget of its own). Dropped from BO: the in-app browser's frame deadline and
// MCP-app documents.
import {Deadline, clamp} from './budgets.mjs';
import {BrowserServiceError} from './errors.mjs';
import {ENTER_FRAME, attemptBudget} from './selectors.mjs';
import {tabIdOf} from './tabs.mjs';

// Runs in the injected script's world (BO's and vJ's page function), called as (injected) on a frame's document or as
// (root, injected) on an element: the aria snapshot of the root (the document's body by default) and the refs of the
// iframes worth entering, each iframe line labelled with its element's id and name.
function ariaSnapshotOf(first, second) {
  const injected = second ?? first;
  const root = second ? first : (document.body || document.documentElement);
  if (!root) return {full: '', iframeDepths: {}, iframeRefs: []};
  const snapshot = injected.incrementalAriaSnapshot(root, {mode: 'ai'});
  let full = snapshot.full;
  const iframeRefs = snapshot.iframeRefs.filter(ref => {
    if (!(ref in snapshot.iframeDepths)) return false;
    try {
      const [frame] = injected.querySelectorAll(injected.parseSelector(`aria-ref=${ref}`), root);
      if (frame == null) return false;
      const id = frame.getAttribute('id');
      const name = frame.getAttribute('name');
      const label = [...(id ? [`[id=${JSON.stringify(id)}]`] : []), ...(name ? [`[name=${JSON.stringify(name)}]`] : [])].join(' ');
      if (label) {
        full = full.replace(/^([ \t]*- iframe(?: [^\r\n]*)?) \[ref=([^\]\r\n]+)\]/gm, (line, head, lineRef) => (lineRef === ref ? `${head} ${label} [ref=${ref}]` : line));
      }
      return frame.getAttribute('aria-hidden') !== 'true' && injected.elementState(frame, 'visible').matches === true;
    } catch {
      return false;
    }
  });
  return {...snapshot, full, iframeRefs};
}

// The ref an `- iframe` line names, or null (_J).
const iframeRefOf = line => (line.trimStart().startsWith('- iframe') ? line.match(/\[ref=([^\]]+)\]/)?.[1] ?? null : null);

// The snapshot's text with each entered frame's own snapshot under its iframe line (OO).
async function stitchFrames(session, tabId, snapshot, deadline, prefix) {
  const refs = snapshot.iframeRefs.filter(ref => ref in snapshot.iframeDepths);
  if (!refs.length || deadline.expired()) return snapshot.full;
  const frames = new Map(await Promise.all(refs.map(async ref => [ref, await frameSnapshot(session, tabId, ref, deadline, prefix)])));
  const lines = [];
  for (const line of snapshot.full.split('\n')) {
    const text = frames.get(iframeRefOf(line));
    if (!text) {
      lines.push(line);
      continue;
    }
    const indent = line.match(/^ */)?.[0] ?? '';
    lines.push(line.endsWith(':') ? line : `${line}:`);
    lines.push(...text.split('\n').map(child => `${indent}  ${child}`));
  }
  return lines.join('\n');
}

// One frame's stitched snapshot, or null when it cannot be read (vJ).
async function frameSnapshot(session, tabId, ref, deadline, prefix) {
  try {
    const frameSelector = prefix ? `${prefix}${ENTER_FRAME}aria-ref=${ref}` : `aria-ref=${ref}`;
    if (deadline.expired()) return null;
    const {result} = await session.selectors.evaluateOnSelector(`${frameSelector}${ENTER_FRAME}body`, tabId, ariaSnapshotOf,
      {deadline, retry: false, scrollFrameIntoView: false});
    return await stitchFrames(session, tabId, result, deadline, frameSelector);
  } catch {
    return null;
  }
}

// --- flattening (RO) -----------------------------------------------------------------------------------------------

const lineWithoutRefs = line => line.replace(/ \[ref=[^\]]+\]/g, '').replace(/ \[cursor=[^\]]+\]/g, '');           // TJ
const isAnonymousContainer = line => /^- (generic|listitem|group)(?: \[[^\]]+\])*:?$/.test(line);                     // CJ
const isBareImage = line => /^- img(?: \[[^\]]+\])*:?$/.test(line);                                                   // SJ

// The snapshot's lines as a tree by indentation (xJ).
function snapshotTree(text) {
  const root = {children: [], indent: -1, line: ''};
  const stack = [root];
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const indent = raw.match(/^ */)?.[0].length ?? 0;
    const node = {children: [], indent, line: raw.slice(indent)};
    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    stack.at(-1).children.push(node);
    stack.push(node);
  }
  return root.children;
}

// A node with its refs stripped, its anonymous containers dissolved into their children and bare images dropped (MO).
function simplified(node) {
  const children = node.children.flatMap(simplified);
  const line = lineWithoutRefs(node.line);
  if (isBareImage(line)) return [];
  if (isAnonymousContainer(line)) return children;
  return [{children, line}];
}

function rendered(nodes, depth = 0) {                                                                                  // NO
  const lines = [];
  const indent = '  '.repeat(depth);
  for (const node of nodes) {
    lines.push(indent + node.line);
    const children = rendered(node.children, depth + 1);
    if (children !== '') lines.push(children);
  }
  return lines.join('\n');
}

// The flattened text the model reads; text that is not a snapshot is returned as it is.
export function flattenSnapshot(text) {
  if (!text.startsWith('- ') && !text.includes('\n- ') && !text.includes('\n  - ')) return text;
  return rendered(snapshotTree(text).flatMap(simplified));
}

export const SNAPSHOT_HANDLERS = {
  async playwright_dom_snapshot(params, session) {
    const tabId = tabIdOf(params.tab_id);
    const deadline = attemptBudget(new Deadline(clamp(params.timeout_ms)));
    const top = await session.selectors.evaluateInFrame(tabId, ariaSnapshotOf, {deadline});
    return {dom_snapshot: flattenSnapshot(await stitchFrames(session, tabId, top, deadline, undefined))};
  },
};

// The accessibility tree (tab.ax) is not offered on the extension route: the manifest disables it, the REPL client
// falls back to playwright_dom_snapshot for getAXState, and the vendor's AX engine (a proprietary WASM) is not ported.
// A client that sends these anyway is told so, as the vendor words a command a backend does not serve (Eo).
const axUnavailable = type => async (params, session) => {
  throw new BrowserServiceError('browser_capability_unavailable', `${session.clientInfo.name} does not support command "${type}".`);
};

export const AX_HANDLERS = {
  tab_ax_get_state: axUnavailable('tab_ax_get_state'),
  tab_ax_action: axUnavailable('tab_ax_action'),
};
