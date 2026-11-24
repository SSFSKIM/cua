// The key-route diagnostic's report (ruling 1198; ./key-route.mjs writes it): its one-line summary, which the sitting's
// `diagnostic` check gives as the step's INFO (./checks.mjs), and key-route.md, the sitting's section. Pure. Where the
// Escape went is read from the taps' events inside the press's own window only (captureOf), and a tap that failed is
// told from one that saw nothing.
import {captureOf} from '../native-matrix/key-route-capture.mjs';
import {DIAGNOSTIC_CLIENT} from './tcc.mjs';

export const KEY_ROUTE_ENGINES = Object.freeze(['vendor', 'cua']);

const unique = values => [...new Set(values)];
// The lane's attributed capture as key-route.json stores it (./key-route.mjs), else computed from its record alike.
const captured = lane => lane.capture ?? captureOf(lane.keyRoute?.tap, lane.keyRoute?.press);
const keyDowns = n => `${n} Escape keyDown${n === 1 ? '' : 's'}`;
const notRecorded = lane => (lane.skipped ? `skipped: ${lane.skipped}` : lane.error ?? lane.problems?.[0] ?? `exit ${lane.exit}`);
// The panel after the Escape: the device's own reading after it (never the engine's view), `up` true, false or null
// (unread, a reading that failed included); then what the AX cancel did, kept apart: `cancelled` (it found the panel
// and its own reading confirmed it closed: via) from `goneLater` (it found no panel and a later reading found it gone:
// no cancel made).
function panelAfter(k) {
  const up = k?.after?.up === true || k?.after?.up === false ? k.after.up : null, cancel = k?.cancel;
  return {up, cancelled: cancel?.closed === true && cancel.found !== false ? cancel.via ?? 'unnamed' : null, goneLater: cancel?.closed === true && cancel.found === false};
}
function panelSummary(k) {
  const {up, cancelled, goneLater} = panelAfter(k);
  if (up !== null) return up ? 'the panel not closed by it' : 'the panel closed by it';
  return cancelled ? 'the panel not closed by it (still up at the AX cancel)' : goneLater ? 'the panel unread after it, gone at a later reading (no cancel made)' : 'the panel unread after it';
}

// One line per engine: where its Escape was posted and by whom (fields 40, 41), which tap saw it, the panel after it.
export function keyRouteSummary(report) {
  if (report?.skipped) return `skipped: ${report.skipped}`;
  return KEY_ROUTE_ENGINES.filter(engine => report?.engines?.[engine]).map(engine => {
    const lane = report.engines[engine], k = lane.keyRoute;
    if (!k) return `${engine}: not recorded (${notRecorded(lane)})`;
    if (k.opened && k.opened.ok !== true) return `${engine}: the Open panel did not open (${k.opened.reason})`;
    if (k.press?.sent !== true) return `${engine}: Escape not sent (${k.press?.reason ?? 'no press recorded'})`;
    const capture = captured(lane), panel = panelSummary(k);
    if (!capture.events.length) {
      if (capture.state === 'failed') return `${engine}: Escape sent, where it landed is unknown (${capture.failures.join('; ')}), ${panel}`;
      return `${engine}: Escape sent, seen by no tap in its window${capture.unmatched.length ? ` (${keyDowns(capture.unmatched.length)} outside it)` : ''}, ${panel}`;
    }
    const labels = unique(capture.events.map(e => e.label));
    return `${engine}: Escape posted to pid ${unique(capture.events.map(e => e.target)).join('/')} by pid ${unique(capture.events.map(e => e.source)).join('/')}, seen by the ${labels.join(' and ')} tap${labels.length > 1 ? 's' : ''}${
      capture.failures.length ? ` (the taps failed in part: ${capture.failures.join('; ')})` : ''}, ${panel}`;
  }).join('; ');
}

const yesNo = value => (value === true ? 'yes' : value === false ? 'no' : '-');
const pidText = value => (Number.isInteger(value) ? String(value) : value === 'unavailable' ? 'unavailable' : value?.error !== undefined ? `error ${value.error}` : '-');
const selectedText = s => (s === 'unavailable' ? 'unavailable' : s === null ? 'none' : Number.isInteger(s?.pid) ? `depth ${s.depth}, pid ${s.pid}` : '-');
const cells = values => `| ${values.join(' | ')} |`;
const row = (values, note = '') => `${cells(values)}${note ? ` ${String(note).replaceAll('|', '\\|')} ` : ' '}|`;

function pressRow(engine, lane) {
  const k = lane.keyRoute;
  if (!k) return row([engine, '-', '-', '-', '-', '-'], `not recorded: ${notRecorded(lane)}`);
  const capture = captured(lane), events = capture.events, sent = k.press?.sent === true, {up, cancelled, goneLater} = panelAfter(k);
  const closed = up === false ? 'yes' : !sent && k.opened?.ok !== true ? '-'
    : up === true ? (cancelled ? `no (closed by the AX cancel: ${cancelled})` : goneLater ? 'no (gone at a later reading; no cancel made)' : 'no (still up)')
      : cancelled ? `no (the reading after it unread; still up at the AX cancel, which closed it: ${cancelled})` : goneLater ? 'unread (gone at a later reading; no cancel made)' : 'unread';
  const notes = [k.opened?.ok === false && `the panel did not open: ${k.opened.reason}`, !sent && k.press?.reason && `not sent: ${k.press.reason}`,
    k.press?.threw && `the press threw: ${k.press.threw}`, sent && capture.failures.length && `the taps failed: ${capture.failures.join('; ')}`,
    events.length > 1 && `${keyDowns(events.length)} seen`, capture.unmatched.length && `${keyDowns(capture.unmatched.length)} outside the press's window (not counted)`,
    lane.timedOut && 'the lane ran past its bound and was stopped'].filter(Boolean);
  return row([engine, yesNo(k.press ? sent : null), unique(events.map(e => e.target)).join(', ') || '-', unique(events.map(e => e.source)).join(', ') || '-',
    unique(events.map(e => e.label)).join(', ') || (sent ? (capture.state === 'failed' ? 'unknown' : 'none') : '-'), closed], notes.join('; '));
}

function axSection(engine, ax) {
  if (!ax) return [`### ${engine}'s lane: the AX half not read`, ''];
  if (ax.trusted !== true) return [`### ${engine}'s lane: the AX reader is not trusted for Accessibility`, ''];
  const owner = r => ax.processes?.[String(Number.isInteger(r.actualPid) ? r.actualPid : r.pid)] ?? {};
  // cua's keyboardTarget as #582 merged it (./key-route.swift predicts it from the observed chain, mirroring
  // KeyTarget.swift), and beside it the public AXUIElementGetPid owner cua posted keys to before #582, a column of its
  // own. A reading made before the mirror (pilot C-4's: no cuaPublicPidTarget) held the public pid in cuaKeyboardTarget:
  // shown as the public one, the merged prediction unread.
  return [`### ${engine}'s lane: TextEdit pid ${ax.pid}`, '',
    cells(['cua\'s keyboardTarget (native/engine/Sources/Engine/KeyTarget.swift:95, #582), predicted from the observed chain', 'the focused element\'s public AXUIElementGetPid owner (cua\'s target before #582)',
      'the focused element\'s ActualPid', 'the selected ancestor (the static reading\'s walk)', 'the static reading\'s rule']), '|---|---|---|---|---|',
    cells([...('cuaPublicPidTarget' in ax ? [pidText(ax.cuaKeyboardTarget), pidText(ax.cuaPublicPidTarget)] : ['unread (read before the mirror)', pidText(ax.cuaKeyboardTarget)]),
      pidText(ax.actualPid), selectedText(ax.selectedAncestor), pidText(ax.staticReadingTarget)]), '',
    '| depth | role | AXUIElementGetPid | _AXUIElementGetActualPid | owner | activation policy | finished launching |', '|---|---|---|---|---|---|---|',
    ...(ax.chain ?? []).map(r => cells([r.depth, r.role ?? '-', pidText(r.pid), pidText(r.actualPid), owner(r).bundleId ?? '-', owner(r).activationPolicy ?? '-', yesNo(owner(r).finishedLaunching)])),
    '', '| route | read | pids | matches ActualPid | matches the selected ancestor |', '|---|---|---|---|---|',
    ...(ax.routes ?? []).map(r => (r.read === false ? cells([r.route, `no: ${r.error ?? 'unread'}`, '-', '-', '-'])
      : cells([r.route, 'yes', r.pids?.length ? r.pids.join(', ') : 'none', yesNo(r.matchesActual), yesNo(r.matchesSelected)]))), ''];
}

// The engines' rows: a grant change is CHANGED; tccd's bookkeeping moving alone is said, as recorded and no failure.
const moved = b => `; tccd's bookkeeping (${b.columns.join(', ')}) moved on ${b.removed.length} row${b.removed.length === 1 ? '' : 's'}, recorded, not a failure`;
const tccText = engines => (engines?.unchanged === true ? `unchanged (${engines.rows} rows${engines.bookkeeping ? moved(engines.bookkeeping) : ''})` : engines
  ? `CHANGED (added ${engines.added.join(', ') || 'none'}; removed ${engines.removed.join(', ') || 'none'}${engines.columns ? `; the columns ${engines.columns.before.join(', ')} became ${engines.columns.after.join(', ')}` : ''})`
  : 'not compared');

// key-route.md: the sitting's section.
export function renderKeyRoute(report) {
  if (report.skipped) return ['## The key-route diagnostic (ruling 1198)', '', `Skipped before it read, built, granted or held anything: ${report.skipped}. A diagnostic: INFO, never this sitting's verdict.`, ''].join('\n');
  const lanes = KEY_ROUTE_ENGINES.filter(engine => report.engines?.[engine]);
  const grant = report.tap?.grant;
  return [
    '## The key-route diagnostic (ruling 1198)', '',
    'A diagnostic: its status is INFO and never changes this sitting\'s verdict; only a cleanup failure, named, is a FAIL. Where `pressKey("Escape")` lands while TextEdit\'s Open panel is focused, per engine through its own lane; fields 40 and 41 are the event\'s target and source unix pids as the listen-only taps saw them, read only inside the press\'s own window ("unavailable": a field the event did not carry).', '',
    '| engine | Escape sent | posted to (field 40) | posted by (field 41) | seen by tap | panel closed by the Escape | note |', '|---|---|---|---|---|---|---|',
    ...lanes.map(engine => pressRow(engine, report.engines[engine])), '',
    ...lanes.flatMap(engine => axSection(engine, report.engines[engine].keyRoute?.ax ?? null)),
    `Input Monitoring granted to ${DIAGNOSTIC_CLIENT}: ${grant?.granted === true ? 'yes' : `no${report.tap?.error ? ` (${report.tap.error})` : ''}`}. The engines' TCC rows: ${tccText(report.tcc?.engines)}.`, '',
    report.cleanup?.ok === true ? 'Cleanup: confirmed.' : `Cleanup: FAILED: ${(report.cleanup?.failures ?? ['not confirmed']).join('; ')}.`, '',
  ].join('\n');
}

// The sections the plan's steps name (`section`, a diagnostic's Markdown), for sitting.md, each as its step wrote it; one
// not written is named with its step's status. `read(path)` -> text | null. -> [Markdown].
export const stepSections = (steps, report, {read}) => steps.filter(step => step.section).map(step => read(step.section)
  ?? `## ${step.label}\n\nIts section was not written (the step: ${report.steps.find(s => s.id === step.id)?.status ?? 'not run'}).\n`);
