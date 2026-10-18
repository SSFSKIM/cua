#!/usr/bin/env node
// #159: the public forms of the hosted gate's reports (scripts/sandbox-probe/hosted-gate.sh). The repo is public, so the
// gate's artifact carries labels, outcomes, booleans and counts: each form below is an allowlist built field by field
// from a raw report, which stays in the gate's scratch root. Nothing free-text (a detail, a stderr excerpt, an argument,
// a rendered profile, an environment value) is copied, except the fingerprint's own judged fields: the runner's scratch
// paths and the launch's fixed flags, with credential-like names already redacted by fingerprint.c. That reduced
// fingerprint is also what the committed hosted baseline holds and what the gate judges.
//
//   node scripts/sandbox-probe/hosted-public.mjs <form> <raw.json> <public.json>
import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

// An error code (EPERM, ECONNREFUSED) or a number (an exit status), never a message.
const CODE = /^[A-Z][A-Z0-9_]{1,30}$|^\d+$/;
const names = list => (list ?? []).map(item => (typeof item === 'string' ? item : item.name));

export const PUBLIC_FORMS = Object.freeze({
  // oracle.mjs fingerprint: without `input` (the launch's args, env and policy) and the pid.
  fingerprint: ({launcher, fingerprint: {sandboxed, cwd, env, checks}, pins}) => ({launcher, fingerprint: {sandboxed, cwd, env, checks}, ...(pins ? {pins} : {})}),
  // oracle.mjs port-vs-capture: the comparison's verdicts; of a difference only its line number, count or variable name.
  'port-vs-capture': ({input, comparison: c}) => (!c.captured ? {mode: input.mode, captured: false} : {
    mode: input.mode, captured: true, argvEqual: c.argvEqual, profileEqual: c.profileEqual,
    ...(c.firstProfileDifference ? {firstProfileDifferenceLine: c.firstProfileDifference.line} : {}), paramsDiffering: c.paramsDiffering.length,
    commandEqual: c.commandEqual, env: {onlyCaptured: names(c.env.onlyCaptured), onlyGolden: names(c.env.onlyGolden), differing: names(c.env.differing)},
    tiocsti: c.tiocsti, cliOnlyEnv: c.cliOnlyEnv, equalButDeviations: c.equalButDeviations}),
  // scripts/accept/own-sandbox.mjs: each check's label and pass, and its detail only when that is a code.
  'own-sandbox': ({ok, checks}) => ({ok, checks: checks.map(({label, pass, detail}) => ({label, pass, ...(CODE.test(String(detail ?? '')) ? {code: detail} : {})}))}),
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
  writeFileSync(out, `${JSON.stringify(publish(JSON.parse(readFileSync(raw, 'utf8'))), null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
