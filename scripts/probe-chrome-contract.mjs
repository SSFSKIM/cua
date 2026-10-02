#!/usr/bin/env node
// M7 knowledge spike: can an owned adapter supply the CUA browser-backend contract over the Playwright Extension's
// relay protocol v2? Never opens, attaches to, navigates or queries Chrome; never reads tokens or profile data.
//
//   node scripts/probe-chrome-contract.mjs --fixtures --report /tmp/cua-chrome-contract-fixtures.json
//   CUA_HOME=<scratch home with the pinned runtime> node scripts/probe-chrome-contract.mjs --vendor --report FILE
//
// --fixtures  layer (a): deterministic scenarios over owned sockets, a fake extension peer and the prototype adapter.
// --vendor    layer (b): the relocated pinned vendor runtime, browser surface only, discovering ONLY owned fixture
//             backends through an explicit BROWSER_USE_BACKEND_PATHS; no account, no browser process, no native
//             helper. Every browser answer it receives is synthetic and reported as such.
// Reports carry PASS/FAIL/BLOCKED per scenario, chromeAttached:false and a sentinel scan; stdout is a summary.
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync} from 'node:fs';
import {tmpdir, homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {parseArgs} from 'node:util';
import {SCENARIOS} from './probe/chrome/scenarios.mjs';
import {fakeSentinels} from './probe/chrome/fixture.mjs';
import {fingerprints, textLeaks, scanFiles} from './probe/leak-scan.mjs';

const {values: opts} = parseArgs({options: {
  fixtures: {type: 'boolean', default: false},
  vendor: {type: 'boolean', default: false},
  report: {type: 'string'},
  home: {type: 'string', default: process.env.CUA_HOME},
}});
if (opts.fixtures === opts.vendor) usage('choose exactly one of --fixtures or --vendor');
if (!opts.report) usage('--report FILE is required');

function usage(message) { process.stderr.write(`probe-chrome-contract: ${message}\n`); process.exit(2); }

const sentinels = fakeSentinels();
const prints = [sentinels.token, sentinels.capability].flatMap(fingerprints);
const base = {
  probe: 'scripts/probe-chrome-contract.mjs',
  milestone: 'M7',
  at: new Date().toISOString(),
  chromeAttached: false,
  facts: {
    real: 'none: no Chrome process, extension, profile, token or account was used',
    synthetic: 'every tab, debugger session, CDP answer and extension message came from the fake peer',
    sourceOnly: 'citations name the pinned vendor and installed-extension source lines each scenario reproduces',
  },
  sentinels: 'generated fake token and relay-capability markers; values never written here',
};

async function runFixtures() {
  const dir = mkdtempSync(join(realpathSync(tmpdir()), 'cua-m7-fx-'));
  try {
    const results = [];
    const captures = [];
    for (const s of SCENARIOS) results.push(await s.run({dir, sentinels, captures}));
    return {layer: 'fixtures', scenarios: results, scanTexts: captures};
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}

async function runVendor() {
  const {runVendorLayer} = await import('./probe/chrome/vendor-layer.mjs');
  return await runVendorLayer({home: opts.home, sentinels});
}

const layer = opts.fixtures ? await runFixtures() : await runVendor();
const report = {...base, ...layer};
const counts = {PASS: 0, FAIL: 0, BLOCKED: 0};
for (const s of report.scenarios) counts[s.status]++;
report.summary = counts;

// The report itself, and anything the layer handed back for scanning, must not contain a sentinel.
let text = JSON.stringify(report, null, 1);
const scan = {reportLeaks: textLeaks(text, prints), extraTextLeaks: 0, files: null};
for (const extra of layer.scanTexts ?? []) scan.extraTextLeaks += textLeaks(extra, prints);
if (layer.scanRoots) {
  const files = await scanFiles(layer.scanRoots, prints);
  scan.files = {scanned: files.scanned, leaked: files.leaked.length, unread: files.unread.length};
}
delete report.scanTexts; delete report.scanRoots;
const clean = !scan.reportLeaks && !scan.extraTextLeaks && (!scan.files || (!scan.files.leaked && !scan.files.unread));
report.scenarios.push({id: 'sentinel-non-disclosure', title: 'fake token/capability markers absent from report, captures and owned files', status: clean ? 'PASS' : 'FAIL', checks: [{name: 'scan', pass: clean, detail: scan}]});
report.summary = {...counts, [clean ? 'PASS' : 'FAIL']: counts[clean ? 'PASS' : 'FAIL'] + 1};
text = JSON.stringify(report, null, 1).split(homedir()).join('~');
if (layer.cleanup) await layer.cleanup();
mkdirSync(dirname(opts.report), {recursive: true});
writeFileSync(opts.report, text + '\n');
const lines = report.scenarios.map(s => `${s.status.padEnd(7)} ${s.id}`);
process.stdout.write(`${lines.join('\n')}\nchromeAttached: false\nsummary: ${JSON.stringify(report.summary)}\nreport: ${opts.report}\n`);
process.exitCode = report.summary.FAIL ? 1 : 0;
