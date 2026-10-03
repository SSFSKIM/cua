#!/usr/bin/env node
// M9 prototyping probe: the original OpenAI Chrome backend through the relocated runtime.
//
//   node scripts/probe-chrome-original.mjs --static --report /tmp/cua-chrome-original-static.json
//   CUA_HOME=<scratch home with the pinned runtime> node scripts/probe-chrome-original.mjs --live --report FILE
//
// --static  nm -u / otool / strings (and otool -tV for the specific liveness and gating questions) on the installed
//           and archived "ChatGPT for Chrome" host binaries. Neither binary is executed.
// --live    the relocated pinned runtime, browser surface only, the vendor's own @oai/browser-desktop service, an owned
//           empty CODEX_HOME, default vendor network behaviour, and BROWSER_USE_BACKEND_PATHS set to exactly the live
//           sockets held by original hosts whose parent is the user's Chrome. Cells: cua.listBrowsers, then
//           cua.listTabs per listed browser; nothing else. Every elicitation is declined.
// Reports are metadata-only (no socket paths beyond a count, no tab data, no profile names, no auth material) and
// carry PASS/FAIL/BLOCKED per scenario. stdout is a short summary.
import {writeFileSync} from 'node:fs';
import {parseArgs} from 'node:util';

const {values: opts} = parseArgs({options: {
  static: {type: 'boolean', default: false},
  live: {type: 'boolean', default: false},
  report: {type: 'string'},
  home: {type: 'string', default: process.env.CUA_HOME},
}});
const usage = message => { process.stderr.write(`probe-chrome-original: ${message}\n`); process.exit(2); };
if (opts.static === opts.live) usage('choose exactly one of --static or --live');
if (!opts.report) usage('--report FILE is required');

const base = {probe: 'scripts/probe-chrome-original.mjs', milestone: 'M9', at: new Date().toISOString()};
let layer;
if (opts.static) {
  const {runStaticLayer} = await import('./probe/chrome/original/static-layer.mjs');
  layer = runStaticLayer();
} else {
  const {runLiveLayer} = await import('./probe/chrome/original/live-layer.mjs');
  layer = await runLiveLayer({home: opts.home});
}
const {forbidden = [], ...rest} = layer;
const report = {...base, ...rest};
const summary = {PASS: 0, FAIL: 0, BLOCKED: 0};
for (const s of report.scenarios) summary[s.status]++;
report.summary = summary;
const text = JSON.stringify(report, null, 1);
// Last line of defence: a report must never carry a selected socket path or a token-like value the layer saw.
for (const secret of forbidden) if (secret && text.includes(secret)) { process.stderr.write('probe-chrome-original: report would disclose a forbidden value; not written\n'); process.exit(1); }
writeFileSync(opts.report, text + '\n', {mode: 0o600});
process.stdout.write(`${report.layer}: ${JSON.stringify(summary)}${report.layer === 'live' ? ` desktopRunning=${report.desktopRunning} hosts=${report.hosts?.count} sockets=${report.hosts?.socketCount} tabOperations=${report.tabOperations}` : ''}\nreport: ${opts.report}\n`);
for (const s of report.scenarios) process.stdout.write(`  ${s.status.padEnd(7)} ${s.id}\n`);
