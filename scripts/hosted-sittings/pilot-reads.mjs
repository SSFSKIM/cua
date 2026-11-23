// The pilot's readings (#117 M5, T10b′; docs/evidence/2026-11-23-own-native-engine/harness.md "What part 2 must
// provide"): the first hosted run reads, from the matrix's own records, what part 1 could not know before a runner:
//   openPanel        the bundle ids front and key on the Open panel's rows, against the panel service the plan names
//                    (../native-matrix/steps.mjs PANEL_SERVICE; the window-order oracle's target)
//   savePanel        the Save panel's structure as #212's observation-only cell recorded it (`outcome.observed`), from
//                    which its Go To controls (../native-matrix/probe-plan.mjs SAVE_PANEL_CONTROLS) are read by hand
//   focusedApps      the key application read on Chrome for Testing's and the Electron fixture's frontmost rows,
//                    against their scenes' bundle ids
//   typeSelect       Acceptance 3's witness on both lanes: Finder's type-select after the background TextEdit click
//   focusProbe       the focus probe's cost, timed on the device (scripts/hosted-sittings/focus-timing.mjs)
//   korean           whether 2-Set's layout engaged after each refocus (the Unicode matrix's post-refocus readings)
//   vendorErrorNames the error names the vendor lane's thrown acts recorded (`cua/errorName` through the vendor host)
// Bundle ids and the fixture's own panel structure only; nothing of a window the run does not own.
import {PANEL_SERVICE} from '../native-matrix/steps.mjs';
import {SCENES} from '../repl-parity/scenes-mac.mjs';

const ACCEPTANCE_3 = 'textedit/background/click.element@finder';
const SAVE_SHEET = 'textedit/intervention.saveSheet';
const engineOf = result => result.lanes?.[0]?.engine ?? null;
const rowsOf = results => results.flatMap(({result}) => (result.rows ?? []).map(row => ({row, result})));
const distinct = values => [...new Set(values.filter(v => typeof v === 'string'))];
const readingsOf = row => [row.frontKey?.before?.front, row.frontKey?.before?.key, row.frontKey?.after?.front, row.frontKey?.after?.key];

// `results`: [{path, result}]; `focusTiming`: the device's timing record, or null. -> the readings, and `unread`: the
// questions no record answered.
export function pilotReads(results, {focusTiming = null} = {}) {
  const rows = rowsOf(results);
  const panelIds = distinct(rows.filter(({row}) => row.target === 'openPanel').flatMap(({row}) => readingsOf(row)));
  // The panel's own service is the one id here that is neither TextEdit (the panel's app) nor an alert's.
  const openPanel = panelIds.length ? {expected: PANEL_SERVICE, read: panelIds.sort((a, b) => Number(b.includes('Panel')) - Number(a.includes('Panel'))), matches: panelIds.includes(PANEL_SERVICE)} : null;
  const focused = scene => {
    const read = distinct(rows.filter(({row}) => row.target === scene && row.regime === 'frontmost').map(({row}) => row.frontKey?.before?.key));
    return read.length ? {expected: SCENES[scene].bundleId, read, matches: read.every(id => id === SCENES[scene].bundleId)} : null;
  };
  const sides = (filter, map) => {
    const out = {};
    for (const {row, result} of rows.filter(filter)) (out[row.engine ?? engineOf(result)] ??= []).push(map(row, result));
    return Object.keys(out).length ? out : null;
  };
  const typeSelect = sides(({row}) => row.id === ACCEPTANCE_3 && row.outcome?.keystroke, (row, result) => {
    const k = row.outcome.keystroke;
    return {sample: row.sample, run: result.meta?.run ?? null, posted: k.posted ?? null, finderSelected: k.finderSelected ?? null, documentUnchanged: k.documentUnchanged ?? null, gate: k.gate ?? null};
  });
  const korean = {};
  for (const {result} of results) {
    const readings = (result.meta?.unicode?.readings ?? []).filter(r => /post-refocus$/.test(r.when ?? ''));
    if (!readings.length) continue;
    const side = korean[engineOf(result)] ??= {held: 0, of: 0};
    side.held += readings.filter(r => r.held === true).length;
    side.of += readings.length;
    const missed = readings.filter(r => r.held !== true).map(r => `${r.current ?? 'nothing'} / ${r.layout ?? 'nothing'}`);
    if (missed.length) side.read = distinct([...(side.read ?? []), ...missed]);
  }
  const observed = rows.filter(({row}) => row.id === SAVE_SHEET && row.outcome?.observed).map(({row}) => row.outcome.observed);
  const vendorErrorNames = {};
  for (const {row, result} of rows) {
    if ((row.engine ?? engineOf(result)) !== 'vendor' || typeof row.outcome?.errorName !== 'string') continue;
    vendorErrorNames[row.outcome.errorName] = (vendorErrorNames[row.outcome.errorName] ?? 0) + 1;
  }
  const reads = {
    openPanel,
    savePanel: observed.length ? {observed} : null,
    focusedApps: {chrome: focused('chrome'), electron: focused('electron')},
    typeSelect,
    focusProbe: focusTiming,
    korean: Object.keys(korean).length ? korean : null,
    vendorErrorNames: Object.keys(vendorErrorNames).length ? vendorErrorNames : null,
  };
  const unread = [['openPanel', reads.openPanel], ['savePanel', reads.savePanel], ['focusedApps.chrome', reads.focusedApps.chrome], ['focusedApps.electron', reads.focusedApps.electron],
    ['typeSelect', reads.typeSelect], ['focusProbe', reads.focusProbe], ['korean', reads.korean], ['vendorErrorNames', reads.vendorErrorNames]].filter(([, v]) => v === null).map(([k]) => k);
  return {...reads, unread};
}

const same = matches => (matches ? 'matches' : '**differs**');
// The readings as Markdown, for the pilot's report.
export function renderPilotReads(reads) {
  const out = ['## What the pilot read', ''];
  const panel = reads.openPanel;
  out.push(`- **Open panel**: ${panel ? `front/key ids read on its rows: ${panel.read.join(', ')}; the plan's service ${panel.expected} ${panel.matches ? 'was read' : '**was not read**'}` : 'not read'}.`);
  const sheet = reads.savePanel;
  out.push(`- **Save panel** (#212, SAVE_PANEL_CONTROLS): ${sheet ? `${sheet.observed.length} observation(s) recorded; the first: ${sheet.observed[0].lines?.filter(l => l.id).map(l => `${l.id} (${l.head})`).join('; ') || 'no element carries an ID'}` : 'not read'}.`);
  for (const [scene, name] of [['chrome', 'Chrome for Testing'], ['electron', 'Electron fixture']]) {
    const f = reads.focusedApps[scene];
    out.push(`- **Focused app**, ${name}: ${f ? `read ${f.read.join(', ')}, the scene names ${f.expected}: ${same(f.matches)}` : 'not read'}.`);
  }
  const witness = reads.typeSelect;
  out.push(`- **Finder type-select** after the background TextEdit click (Acceptance 3): ${witness ? Object.entries(witness).map(([engine, list]) => `${engine} ${list.filter(w => w.posted && w.finderSelected && w.documentUnchanged).length} of ${list.length} selected with the document unchanged${list.some(w => w.gate) ? ` (${list.filter(w => w.gate).length} held by the probe's gate)` : ''}`).join('; ') : 'not read'}.`);
  const probe = reads.focusProbe;
  out.push(`- **Focus probe** cost: ${probe ? `median ${probe.medianMs} ms, max ${probe.maxMs} ms over ${probe.samples} launches` : 'not read'}.`);
  out.push(`- **2-Set** after refocus: ${reads.korean ? Object.entries(reads.korean).map(([engine, k]) => `${engine} ${k.held} of ${k.of} engaged${k.read ? ` (else read ${k.read.join(', ')})` : ''}`).join('; ') : 'not read'}.`);
  out.push(`- **cua/errorName** on the vendor lane's thrown acts: ${reads.vendorErrorNames ? Object.entries(reads.vendorErrorNames).map(([name, n]) => `${name} ${n}`).join(', ') : 'not read'} (only \`Error\` means the name did not cross the vendor host).`);
  if (reads.unread.length) out.push('', `Not read in this pilot: ${reads.unread.join(', ')}.`);
  return out.join('\n') + '\n';
}
