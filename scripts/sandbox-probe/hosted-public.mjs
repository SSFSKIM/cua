#!/usr/bin/env node
// #159: the public forms of the hosted gate's reports (scripts/sandbox-probe/hosted-gate.sh). The repo is public, so the
// gate's artifact carries labels, outcomes, booleans and counts: each form below is an allowlist built field by field
// from a raw report, which stays in the gate's scratch root. Nothing free-text (a detail, a stderr excerpt, an argument,
// a rendered profile, a check's target) is copied. The fingerprint keeps what its judgement compares: each check's
// outcome, and of its environment the values of the launcher's own settings only, each read relative to the run's own
// roots (`<cua-home>/…`, `<home>/…`, `<checkout>/…`, `<session>`) by compare.mjs's own functions; any other variable is
// published by name, its value withheld. That form is also what the committed hosted baseline holds and what the gate
// judges.
//
//   node scripts/sandbox-probe/hosted-public.mjs <form> <raw.json> <public.json>
//
// A report it cannot read, parse, reduce or write fails it with one fixed line naming the form and the two files'
// basenames: never the input, which an error message would quote.
import {readFileSync, writeFileSync} from 'node:fs';
import {basename} from 'node:path';
import {pathToFileURL} from 'node:url';
import {normalizeValue, relativeToRoots} from './compare.mjs';

// An error code (EPERM, ECONNREFUSED) or a number (an exit status), never a message.
const CODE = /^[A-Z][A-Z0-9_]{1,30}$|^\d+$/;
const names = list => (list ?? []).map(item => (typeof item === 'string' ? item : item.name));
// The variables cua's launcher sets for a kernel or a worker (and the Codex CLI's CODEX_HOME, M0's records): their values
// are paths under the run's roots or fixed settings.
const LAUNCHER_ENV = new Set(['HOME', 'PATH', 'TMPDIR', 'LANG', 'CODEX_SANDBOX', 'CODEX_SANDBOX_NETWORK_DISABLED', 'CODEX_HOME',
  'CUA_REPL_NODE_PATH', 'CUA_REPL_NODE_MODULE_DIRS', 'CUA_REPL_SANDBOX_EXEC', 'CUA_SANDBOX_DENY_READ']);
export const WITHHELD = '<withheld>';

// A checks report ({ok, checks: [{label, pass, detail?}]}): each check's label and pass, and its detail only when that
// is a code.
const checkList = ({ok, checks}) => ({ok, checks: checks.map(({label, pass, detail}) => ({label, pass, ...(CODE.test(String(detail ?? '')) ? {code: detail} : {})}))});

export const PUBLIC_FORMS = Object.freeze({
  // oracle.mjs fingerprint: without `input` (the launch's args, env and policy), the pid and the checks' targets.
  fingerprint: ({launcher, fingerprint, pins}) => {
    const relative = relativeToRoots(fingerprint);
    const value = text => normalizeValue(relative(text));
    return {launcher, fingerprint: {sandboxed: fingerprint.sandboxed, cwd: value(fingerprint.cwd),
      env: Object.fromEntries(Object.entries(fingerprint.env).map(([name, text]) => [name, LAUNCHER_ENV.has(name) ? value(text) : WITHHELD])),
      checks: fingerprint.checks.map(({op, filter, label, result, errno}) => ({op, filter, label, result, ...(errno === undefined ? {} : {errno})}))},
    ...(pins ? {pins: {ok: pins.ok, rows: pins.rows.map(({label, op, want, got}) => ({label, op, want, got}))}} : {})};
  },
  // oracle.mjs port-vs-capture: the comparison's verdicts; of a difference only its line number, count or variable name.
  'port-vs-capture': ({input, comparison: c}) => (!c.captured ? {mode: input.mode, captured: false} : {
    mode: input.mode, captured: true, argvEqual: c.argvEqual, profileEqual: c.profileEqual,
    ...(c.firstProfileDifference ? {firstProfileDifferenceLine: c.firstProfileDifference.line} : {}), paramsDiffering: c.paramsDiffering.length,
    commandEqual: c.commandEqual, env: {onlyCaptured: names(c.env.onlyCaptured), onlyGolden: names(c.env.onlyGolden), differing: names(c.env.differing)},
    tiocsti: c.tiocsti, cliOnlyEnv: c.cliOnlyEnv, equalButDeviations: c.equalButDeviations}),
  // scripts/accept/own-sandbox.mjs and scripts/probe-engine-lane.mjs: their checks.
  'own-sandbox': checkList,
  'engine-lane': checkList,
  // scripts/probe-secrets.mjs: the steps' names and statuses, without their details.
  'probe-secrets': ({status, steps}) => ({status, steps: steps.map(({name, status: step}) => ({name, status: step}))}),
  // cua doctor --json: the checks' names and statuses.
  doctor: ({ok, checks}) => ({ok, checks: checks.map(({name, status}) => ({name, status}))}),
});

function main([form, raw, out]) {
  const publish = PUBLIC_FORMS[form];
  if (!publish || !raw || !out) {
    console.error(`hosted-public: no public form ${JSON.stringify(form)}; usage: hosted-public.mjs ${Object.keys(PUBLIC_FORMS).join('|')} <raw.json> <public.json>`);
    process.exit(2);
  }
  try {
    writeFileSync(out, `${JSON.stringify(publish(JSON.parse(readFileSync(raw, 'utf8'))), null, 2)}\n`);
  } catch {
    console.error(`hosted-public: could not publish the ${form} form of ${basename(raw)} as ${basename(out)}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
