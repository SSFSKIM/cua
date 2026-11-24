// The key-route diagnostic's report (ruling 1198; ./key-route.mjs writes it): its one-line summary, which the sitting's
// `diagnostic` check gives as the step's INFO (./checks.mjs), and key-route.md, the sitting's section. Pure.
import {DIAGNOSTIC_CLIENT} from './tcc.mjs';

export const KEY_ROUTE_ENGINES = Object.freeze(['vendor', 'cua']);

const unique = values => [...new Set(values)];
const eventsOf = keyRoute => keyRoute?.tap?.stop?.events ?? [];
// Whether the Escape closed the panel: the device's own reading after it (never the engine's view of it).
const closedByEscape = keyRoute => (keyRoute?.after?.up === false ? true : keyRoute?.after?.up === true ? false : null);

// One line per engine: where its Escape was posted and by whom (fields 40, 41), which tap saw it, the panel after it.
export function keyRouteSummary(report) {
  return KEY_ROUTE_ENGINES.filter(engine => report?.engines?.[engine]).map(engine => {
    const lane = report.engines[engine], k = lane.keyRoute;
    if (!k) return `${engine}: not recorded (${lane.error ?? lane.problems?.[0] ?? `exit ${lane.exit}`})`;
    if (k.opened && k.opened.ok !== true) return `${engine}: the Open panel did not open (${k.opened.reason})`;
    if (k.press?.sent !== true) return `${engine}: Escape not sent (${k.press?.reason ?? 'no press recorded'})`;
    const events = eventsOf(k), panel = closedByEscape(k) === true ? 'the panel closed by it' : closedByEscape(k) === false ? 'the panel not closed by it' : 'the panel unread after it';
    if (!events.length) return `${engine}: Escape sent, seen by no tap${k.tap?.start?.ready === true ? '' : ` (${k.tap?.start?.reason ?? k.tap?.start?.refused ?? 'no tap ran'})`}, ${panel}`;
    const labels = unique(events.map(e => e.label));
    return `${engine}: Escape posted to pid ${unique(events.map(e => e.target)).join('/')} by pid ${unique(events.map(e => e.source)).join('/')}, seen by the ${labels.join(' and ')} tap${labels.length > 1 ? 's' : ''}, ${panel}`;
  }).join('; ');
}

const yesNo = value => (value === true ? 'yes' : value === false ? 'no' : '-');
const pidText = value => (Number.isInteger(value) ? String(value) : value === 'unavailable' ? 'unavailable' : value?.error !== undefined ? `error ${value.error}` : '-');
const cells = values => `| ${values.join(' | ')} |`;
const row = (values, note = '') => `${cells(values)}${note ? ` ${String(note).replaceAll('|', '\\|')} ` : ' '}|`;

function pressRow(engine, lane) {
  const k = lane.keyRoute;
  if (!k) return row([engine, '-', '-', '-', '-', '-'], `not recorded: ${lane.error ?? lane.problems?.[0] ?? `exit ${lane.exit}`}`);
  const events = eventsOf(k), sent = k.press?.sent === true;
  const closed = closedByEscape(k) === true ? 'yes' : !sent && k.opened?.ok !== true ? '-'
    : k.cancel?.closed === true ? `no (closed by the AX cancel: ${k.cancel.via ?? 'unnamed'})` : closedByEscape(k) === false ? 'no (still up)' : 'unread';
  const notes = [k.opened?.ok === false && `the panel did not open: ${k.opened.reason}`, !sent && k.press?.reason && `not sent: ${k.press.reason}`,
    k.press?.threw && `the press threw: ${k.press.threw}`, k.tap?.start && k.tap.start.ready !== true && `no tap: ${k.tap.start.reason ?? k.tap.start.refused ?? 'not ready'}`,
    k.tap?.start?.ready === true && k.tap.start.listenAccess !== true && 'the tap reports no Input Monitoring access', events.length > 1 && `${events.length} Escape keyDowns seen`].filter(Boolean);
  return row([engine, yesNo(k.press ? sent : null), unique(events.map(e => e.target)).join(', ') || '-', unique(events.map(e => e.source)).join(', ') || '-',
    unique(events.map(e => e.label)).join(', ') || (sent ? 'none' : '-'), closed], notes.join('; '));
}

function axSection(engine, ax) {
  if (!ax) return [`### ${engine}'s lane: the AX half not read`, ''];
  if (ax.trusted !== true) return [`### ${engine}'s lane: the AX reader is not trusted for Accessibility`, ''];
  const owner = r => ax.processes?.[String(Number.isInteger(r.actualPid) ? r.actualPid : r.pid)] ?? {};
  return [`### ${engine}'s lane: TextEdit pid ${ax.pid}`, '',
    `cua's keyboardTarget (native/engine/Sources/Engine/Input.swift:1014): pid ${ax.cuaKeyboardTarget}; the focused element's ActualPid: ${pidText(ax.actualPid)}; the static reading's rule: pid ${pidText(ax.staticReadingTarget)}.`, '',
    '| depth | role | AXUIElementGetPid | _AXUIElementGetActualPid | owner | activation policy | finished launching |', '|---|---|---|---|---|---|---|',
    ...(ax.chain ?? []).map(r => cells([r.depth, r.role ?? '-', pidText(r.pid), pidText(r.actualPid), owner(r).bundleId ?? '-', owner(r).activationPolicy ?? '-', yesNo(owner(r).finishedLaunching)])),
    '', '| route | pids | matches ActualPid |', '|---|---|---|',
    ...(ax.routes ?? []).map(r => cells([r.route, r.pids?.length ? r.pids.join(', ') : 'none', yesNo(r.matchesActual)])), ''];
}

// key-route.md: the sitting's section.
export function renderKeyRoute(report) {
  const lanes = KEY_ROUTE_ENGINES.filter(engine => report.engines?.[engine]);
  const grant = report.tap?.grant, engines = report.tcc?.engines;
  return [
    '## The key-route diagnostic (ruling 1198)', '',
    'A diagnostic: its status is INFO and never changes this sitting\'s verdict; only a cleanup failure, named, is a FAIL. Where `pressKey("Escape")` lands while TextEdit\'s Open panel is focused, per engine through its own lane; fields 40 and 41 are the event\'s target and source unix pids as the listen-only taps saw them.', '',
    '| engine | Escape sent | posted to (field 40) | posted by (field 41) | seen by tap | panel closed by the Escape | note |', '|---|---|---|---|---|---|---|',
    ...lanes.map(engine => pressRow(engine, report.engines[engine])), '',
    ...lanes.flatMap(engine => axSection(engine, report.engines[engine].keyRoute?.ax ?? null)),
    `Input Monitoring granted to ${DIAGNOSTIC_CLIENT}: ${grant?.granted === true ? 'yes' : `no${report.tap?.error ? ` (${report.tap.error})` : ''}`}. The engines' TCC rows: ${
      engines?.unchanged === true ? `unchanged (${engines.rows} rows)` : engines ? `CHANGED (added ${engines.added.join(', ') || 'none'}; removed ${engines.removed.join(', ') || 'none'})` : 'not compared'}.`, '',
    report.cleanup?.ok === true ? 'Cleanup: confirmed.' : `Cleanup: FAILED: ${(report.cleanup?.failures ?? ['not confirmed']).join('; ')}.`, '',
  ].join('\n');
}

// The sections the plan's steps name (`section`, a diagnostic's Markdown), for sitting.md, each as its step wrote it; one
// not written is named with its step's status. `read(path)` -> text | null. -> [Markdown].
export const stepSections = (steps, report, {read}) => steps.filter(step => step.section).map(step => read(step.section)
  ?? `## ${step.label}\n\nIts section was not written (the step: ${report.steps.find(s => s.id === step.id)?.status ?? 'not run'}).\n`);
