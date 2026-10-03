#!/usr/bin/env node
// M9/M10 prototyping probe: the original OpenAI Chrome backend through the relocated runtime.
//
//   node scripts/probe-chrome-original.mjs --static --report /tmp/cua-chrome-original-static.json
//   CUA_HOME=<home with the pinned runtime> node scripts/probe-chrome-original.mjs --live --report FILE
//   node scripts/probe-chrome-original.mjs --fixtures --report /tmp/cua-chrome-original-fixtures.json
//   CUA_HOME="$HOME/Library/Application Support/cua" node scripts/probe-chrome-original.mjs --live --with-tabs \
//     [--browser-index N] --report FILE      (only after `cua login` with that CUA_HOME)
//
// --static  nm -u / otool / strings (and otool -tV for the specific liveness and gating questions) on the installed
//           and archived "ChatGPT for Chrome" host binaries. Neither binary is executed.
// --live    the relocated pinned runtime, browser surface only, the vendor's own @oai/browser-desktop service, an owned
//           empty CODEX_HOME, default vendor network behaviour, and BROWSER_USE_BACKEND_PATHS set to exactly the live
//           sockets held by original hosts whose parent is the user's Chrome. Cells: cua.listBrowsers, then
//           cua.listTabs per listed browser; nothing else. Every elicitation is declined.
// --with-tabs  (M10, with --live) CODEX_HOME is the home's own state/codex holding the server's login; after the M9
//           cells, the owned-page round trip on one backend: createBrowserTab, goto the probe's own loopback page,
//           AX read, typeText, click + AX verify, one screenshot (kept outside git; size and SHA-256 reported), close
//           the created tab and confirm it is gone. Only the structured origin-access request for the probe page's
//           exact origin is accepted, for the session; every other elicitation is declined and recorded by kind. User
//           tabs are never bound, read, screenshotted or closed (listTabs is reduced to counts). A tab that cannot be
//           closed while authorized is reported for the user; the probe never reconnects to clean up.
// --fixtures  (M10) the --with-tabs machinery against a fake runtime: accept/decline matrix, leftover reporting,
//           target selection and report sanitization. No vendor runtime, browser, account or network beyond loopback.
// Reports are metadata-only (no socket paths beyond a count, no tab data, no profile names, no auth material) and
// carry PASS/FAIL/BLOCKED per scenario. Live and fixture reports pass a leak guard (no URL, absolute path, token-like
// run or known sensitive value) before they are written. stdout is a short summary.
import {writeFileSync} from 'node:fs';
import {parseArgs} from 'node:util';

const {values: opts} = parseArgs({options: {
  static: {type: 'boolean', default: false},
  live: {type: 'boolean', default: false},
  fixtures: {type: 'boolean', default: false},
  'with-tabs': {type: 'boolean', default: false},
  'browser-index': {type: 'string'},
  report: {type: 'string'},
  home: {type: 'string', default: process.env.CUA_HOME},
}});
const usage = message => { process.stderr.write(`probe-chrome-original: ${message}\n`); process.exit(2); };
if ([opts.static, opts.live, opts.fixtures].filter(Boolean).length !== 1) usage('choose exactly one of --static, --live or --fixtures');
if (opts['with-tabs'] && !opts.live) usage('--with-tabs needs --live');
if (opts['browser-index'] !== undefined && !opts['with-tabs']) usage('--browser-index needs --with-tabs');
if (opts['browser-index'] !== undefined && !/^\d{1,2}$/.test(opts['browser-index'])) usage('--browser-index takes a small non-negative integer');
if (!opts.report) usage('--report FILE is required');

const base = {probe: 'scripts/probe-chrome-original.mjs', milestone: 'M9', at: new Date().toISOString()};
let layer;
if (opts.static) {
  const {runStaticLayer} = await import('./probe/chrome/original/static-layer.mjs');
  layer = runStaticLayer();
} else if (opts.fixtures) {
  const {runFixturesLayer} = await import('./probe/chrome/original/fixtures-layer.mjs');
  layer = await runFixturesLayer();
} else {
  const {runLiveLayer} = await import('./probe/chrome/original/live-layer.mjs');
  layer = await runLiveLayer({home: opts.home, withTabs: opts['with-tabs'], browserIndex: opts['browser-index'] === undefined ? undefined : Number(opts['browser-index'])});
}
const {forbidden = [], screenshotFile, leftover, ...rest} = layer;
const report = {...base, ...rest};
const summary = {PASS: 0, FAIL: 0, BLOCKED: 0};
for (const s of report.scenarios) summary[s.status]++;
report.summary = summary;
const text = JSON.stringify(report, null, 1);
// Last line of defence: a report must never carry a selected socket path, the probe page's origin, a user-tab value
// or anything URL-, path- or token-like. The static layer reports binary paths by design and keeps the value check.
const { reportLeaks } = await import('./probe/chrome/original/classify.mjs');
const leaks = opts.static ? forbidden.filter(v => v && text.includes(v)).map(() => 'forbidden value') : reportLeaks(text, forbidden);
if (leaks.length) { process.stderr.write(`probe-chrome-original: report would disclose ${[...new Set(leaks)].join(', ')}; not written\n`); process.exit(1); }
writeFileSync(opts.report, text + '\n', {mode: 0o600});
const live = report.layer === 'live' || report.layer === 'live-with-tabs';
process.stdout.write(`${report.layer}: ${JSON.stringify(summary)}${live ? ` desktopRunning=${report.desktopRunning} hosts=${report.hosts?.count} sockets=${report.hosts?.socketCount} tabOperations=${report.tabOperations}` : ''}\nreport: ${opts.report}\n`);
for (const s of report.scenarios) process.stdout.write(`  ${s.status.padEnd(7)} ${s.id}\n`);
// Not in the report: where the screenshot of the probe's own tab was kept, and any tab the user must close by hand.
if (screenshotFile) process.stdout.write(`screenshot of the probe's own tab (outside git): ${screenshotFile}\n`);
if (leftover?.note) process.stdout.write(`ACTION FOR THE USER: ${leftover.note}\n`);
