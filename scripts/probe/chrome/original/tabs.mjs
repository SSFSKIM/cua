// M10 --with-tabs: the owned-page round trip on one existing Chrome backend, its leftover accounting and its verdict.
//
// Sequence: (compare profiles) -> createBrowserTab -> goto the probe page + AX read -> typeText -> click + AX verify
// -> one screenshot -> close the created tab -> listTabs to confirm it is gone. Input and screenshot run only after
// the page's document marker was seen in the created tab. Close is attempted whenever a tab was created; if close
// fails, nothing further is sent to the browser (no confirmation listTabs, no retry, no reconnect) and the possible
// leftover is reported for the user. A failed createBrowserTab returns no tab id, so nothing is guessed or closed.
//
// Target browser: --browser-index when given; otherwise the only listed browser, or index 0 when every listed browser
// shows the same tabs (several connections to one profile). Distinct profiles without --browser-index are BLOCKED:
// the probe never picks the first of several profiles by itself.
import {createHash} from 'node:crypto';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cellOutcome} from './classify.mjs';
import {COMPARE_PROFILES, createTab, gotoOwnedPage, typeIntoInput, clickAndVerify, screenshot, CLOSE_CREATED_TAB, CONFIRM_CLOSED} from './cells.mjs';
import {PAGE_TITLE, INPUT_LABEL, BUTTON_LABEL, doneText} from './test-page.mjs';

export const TAB_CELLS = ['listBrowsers', 'listTabs', 'compareProfiles', 'createBrowserTab', 'gotoOwnedPage', 'typeText', 'clickAndVerify', 'getScreenshot', 'closeCreatedTab', 'confirmClosed'];
const GOTO_CELL = {cellMs: 45_000, callMs: 75_000};

export function chooseTarget({browsers, listTabs, browserIndex, sameProfile}) {
  const reachable = i => listTabs[i]?.class === 'ok';
  if (browserIndex !== undefined) {
    if (!Number.isInteger(browserIndex) || browserIndex < 0 || browserIndex >= browsers) return {index: null, reason: `--browser-index ${browserIndex} is not one of the ${browsers} listed browser(s)`};
    return reachable(browserIndex) ? {index: browserIndex, reason: 'explicit --browser-index'} : {index: null, reason: `listTabs did not reach browser ${browserIndex}`};
  }
  if (browsers === 0) return {index: null, reason: 'no browser listed'};
  if (browsers === 1) return reachable(0) ? {index: 0, reason: 'only browser'} : {index: null, reason: 'listTabs did not reach the only browser'};
  if (sameProfile === true && reachable(0)) return {index: 0, reason: 'every listed browser shows the same tabs (one profile)'};
  return {index: null, reason: `${browsers} browsers that may be different profiles; rerun with --browser-index N (see the per-browser tab counts)`};
}

export const LEFTOVER = {none: 'none', open: 'open', possiblyOpen: 'possibly-open', unconfirmed: 'unconfirmed', unknown: 'unknown'};
const NOT_RECONNECTED = 'The probe did not reconnect or retry.';
const LEFTOVER_NOTES = {
  [LEFTOVER.open]: `The probe's own test tab ("${PAGE_TITLE}" on 127.0.0.1) is still open in Chrome after close(): close it by hand. ${NOT_RECONNECTED}`,
  [LEFTOVER.possiblyOpen]: `close() of the probe's own test tab ("${PAGE_TITLE}" on 127.0.0.1) failed, so it may still be open in Chrome: close it by hand. ${NOT_RECONNECTED}`,
  [LEFTOVER.unconfirmed]: `The probe's own test tab ("${PAGE_TITLE}" on 127.0.0.1) was closed but its absence could not be confirmed; if it is still open in Chrome, close it by hand. ${NOT_RECONNECTED}`,
  [LEFTOVER.unknown]: `createBrowserTab failed without returning a tab; if a new tab appeared in Chrome, close it by hand. ${NOT_RECONNECTED}`,
};

export function leftoverOf(t) {
  let status;
  if (!t.created) status = t.createError ? LEFTOVER.unknown : LEFTOVER.none;
  else if (t.close?.class !== 'ok') status = LEFTOVER.possiblyOpen;
  else if (t.confirm?.class !== 'ok') status = LEFTOVER.unconfirmed;
  else status = t.confirm.stillListed ? LEFTOVER.open : LEFTOVER.none;
  return status === LEFTOVER.none ? {status} : {status, note: LEFTOVER_NOTES[status]};
}

const sniff = bytes => bytes[0] === 0x89 && bytes[1] === 0x50 ? 'png' : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'jpeg' : bytes.subarray(8, 12).toString('latin1') === 'WEBP' ? 'webp' : 'other';

// The screenshot is written outside the repository (a fresh mkdtemp under the system temp directory); only its size,
// format and SHA-256 enter the observations. The file path is returned separately and never reported.
function keepScreenshot(cell, screenshotDir) {
  const out = {...cellOutcome(cell), images: cell.images.length};
  if (cell.images.length !== 1) return {screenshot: out};
  const bytes = Buffer.from(cell.images[0].data, 'base64');
  const dir = screenshotDir ?? mkdtempSync(join(tmpdir(), 'cua-m10-shot-'));
  const format = sniff(bytes);
  const file = join(dir, `owned-tab.${format === 'other' ? 'bin' : format}`);
  writeFileSync(file, bytes, {mode: 0o600});
  return {screenshot: {...out, bytes: bytes.length, format, sha256: createHash('sha256').update(bytes).digest('hex'), sizeMatches: bytes.length === cell.result?.bytes}, screenshotFile: file};
}

export async function runTabSequence({runCell, page, browserCount, listTabs, browserIndex, screenshotDir}) {
  const t = {created: false};
  let screenshotFile;
  let sameProfile;
  if (browserIndex === undefined && browserCount > 1 && listTabs.every(l => l.class === 'ok')) {
    const cmp = await runCell('compareProfiles', COMPARE_PROFILES);
    sameProfile = cmp.result?.sameProfile === true;
    t.profiles = {...cellOutcome(cmp), sameProfile};
  }
  t.target = chooseTarget({browsers: browserCount, listTabs, browserIndex, sameProfile});
  if (t.target.index === null) { t.leftover = leftoverOf(t); return {tabs: t}; }

  const create = await runCell('createBrowserTab', createTab(t.target.index));
  t.create = {...cellOutcome(create), ...(create.result?.methods ? {methods: create.result.methods} : {})};
  if (create.result?.created !== true) { t.createError = t.create.class; t.leftover = leftoverOf(t); return {tabs: t}; }
  t.created = true;

  const go = await runCell('gotoOwnedPage', gotoOwnedPage(page, {input: INPUT_LABEL, button: BUTTON_LABEL}), GOTO_CELL);
  const g = go.result ?? {};
  t.goto = {...cellOutcome(go), markerFound: g.markerFound === true, originShown: g.originShown === true,
    inputIndex: Number.isInteger(g.inputIndex) ? g.inputIndex : null, buttonIndex: Number.isInteger(g.buttonIndex) ? g.buttonIndex : null,
    ...(g.lineShapes ? {lineShapes: g.lineShapes} : {})};

  if (t.goto.markerFound) {
    const type = await runCell('typeText', typeIntoInput(page));
    t.type = {...cellOutcome(type), usedIndex: type.result?.usedIndex === true};
    const click = await runCell('clickAndVerify', clickAndVerify(page, doneText(page.typedMarker)));
    t.click = {...cellOutcome(click), domChanged: click.result?.domChanged === true};
    const shot = keepScreenshot(await runCell('getScreenshot', screenshot(page)), screenshotDir);
    t.screenshot = shot.screenshot;
    screenshotFile = shot.screenshotFile;
  }

  t.close = cellOutcome(await runCell('closeCreatedTab', CLOSE_CREATED_TAB));
  if (t.close.class === 'ok') {
    const confirm = await runCell('confirmClosed', CONFIRM_CLOSED);
    t.confirm = {...cellOutcome(confirm), stillListed: confirm.result?.stillListed === true, ...(typeof confirm.result?.count === 'number' ? {tabCountAfter: confirm.result.count} : {})};
  }
  t.leftover = leftoverOf(t);
  return {tabs: t, screenshotFile};
}

const status = (pass, blocked) => pass ? 'PASS' : blocked ? 'BLOCKED' : 'FAIL';

export function judgeTabs(o) {
  const scenarios = [];
  const add = (id, title, st, detail) => scenarios.push({id, title, status: st, ...(detail === undefined ? {} : {detail})});
  const t = o.tabs ?? {created: false};
  const lt = o.listTabs ?? [];
  add('list-tabs-reach', 'with the login, listTabs reaches every listed backend (counts only)', status(lt.length > 0 && lt.every(l => l.class === 'ok')),
    {outcomes: lt.map(l => ({browserIndex: l.browserIndex, class: l.class, ...(l.text ? {text: l.text} : {}), ...(typeof l.tabCount === 'number' ? {userTabCount: l.tabCount} : {})}))});
  const targeted = t.target?.index != null;
  add('target-browser', 'one backend chosen for the owned tab without guessing between profiles', status(targeted, true), {...t.target, ...(t.profiles ? {profiles: t.profiles} : {})});
  add('create-tab', 'createBrowserTab on the chosen backend returns a tab handle', status(t.created && t.create?.class === 'ok', !targeted), t.create);
  add('owned-page', 'goto the probe page; the AX read of the created tab shows its document marker', status(t.goto?.class === 'ok' && t.goto.markerFound, !t.created), t.goto);
  const verified = t.goto?.markerFound === true;
  add('type-input', 'typeText of a generated benign marker into the page input', status(t.type?.class === 'ok', !verified), t.type);
  add('click-dom-change', 'click the page button; the AX read shows the page-only DOM change with the typed marker', status(t.click?.class === 'ok' && t.click.domChanged, !verified), t.click);
  const s = t.screenshot;
  add('screenshot', 'one screenshot of the created tab, kept outside git (size and SHA-256 only)', status(s?.class === 'ok' && s.images === 1 && s.bytes > 0 && s.sizeMatches && /^[0-9a-f]{64}$/.test(s.sha256 ?? ''), !verified), s);
  const leftover = t.leftover ?? leftoverOf(t);
  add('close-created-tab', 'close() of the created tab, confirmed gone from listTabs; any leftover is reported for the user', status(t.created && leftover.status === LEFTOVER.none, !t.created),
    {close: t.close, confirm: t.confirm, leftover});
  const els = o.elicitations ?? [];
  const accepted = els.filter(e => e.answered.startsWith('accept'));
  const strayAccept = accepted.some(e => !(e.kind === 'origin-access' && e.ownOrigin === true));
  const unstructured = els.some(e => e.unstructuredOwnOrigin);
  const refusedOwn = els.some(e => e.refusedOwnOrigin);
  const declinedByKind = {};
  for (const e of els) if (!e.answered.startsWith('accept')) declinedByKind[e.kind] = (declinedByKind[e.kind] ?? 0) + 1;
  add('elicitations-own-origin-only', 'nothing accepted beyond the probe origin\'s structured origin-access request (session scope); everything else declined by kind',
    strayAccept ? 'FAIL' : unstructured || refusedOwn ? 'BLOCKED' : 'PASS', {count: els.length, accepted: accepted.length, declinedByKind,
      ...(unstructured ? {unstructured: 'a request naming the probe origin did not expose it structurally; declined, not widened to text matching'} : {}),
      ...(refusedOwn ? {refusedOwnOrigin: 'an origin-access request naming the probe origin had a refused shape (two origins, wider grant, URL mode, input form or unknown persistence); declined'} : {})});
  add('user-tabs-untouched', 'only the planned cells ran: no user tab was bound, read, screenshotted or closed (listTabs reduced to counts)', status((o.cellsSent ?? []).every(c => TAB_CELLS.includes(c))), {cellsSent: o.cellsSent});
  return scenarios;
}
