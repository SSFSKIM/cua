// No audit finding carries its request's raw text into a durable row (#171 M5, task 106, fix wave 3): a forbidden
// request's xtrace line names atoms, properties and payloads (a ClientMessage's type and data, a property's value),
// and the rows outlive the run. Every audit keeps a finding's `what` and where it was (connection, sequence), which
// is all a judge or a re-judge reads (rejudge-device.mjs reads `what`). Display-free.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { auditForeground, auditHeldRelease, auditNothingSent, auditRequests, parseXtrace } from '../../scripts/linux-engine-diff/audit.mjs';

const hex = (id) => `0x${id.toString(16).padStart(8, '0')}`;
const W = 0x01800064;
const SECRET = 'QuarterlyPlanSecret';
// a forbidden _NET_ACTIVE_WINDOW ClientMessage, a payload and a private atom in its line, and a SendEvent of another
// private ClientMessage
const LINES = [
  `005:<:0001: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(0x1ff)} event-mask=SubstructureRedirect,SubstructureNotify ClientMessage(33) format=0x20 window=${hex(W)} type=0x150("_NET_ACTIVE_WINDOW") data=0x02,0x00,0x00,0x00,0x00 ${SECRET}`,
  `005:<:0002: 44: Request(25): SendEvent propagate=false(0x00) destination=${hex(W)} event-mask=0 ClientMessage(33) format=0x08 window=${hex(W)} type=0x1f0("${SECRET}") data='${SECRET}'`,
  `005:<:0003: 20: Request(42): SetInputFocus revert-to=Parent(0x02) focus=${hex(W)} time=CurrentTime(0x00000000)`,
];
const trace = parseXtrace(LINES.join('\n'));

test("no audit's finding carries its request's text, an atom's name or a payload", () => {
  const audits = {
    background: auditRequests(trace),
    foreground: auditForeground(trace, 0x00600002),
    'nothing-sent': auditNothingSent(trace),
    'held-release': auditHeldRelease(trace, W, { route: 'background', marks: [] }),
  };
  for (const [kind, audited] of Object.entries(audits)) {
    assert.ok(audited.forbidden.length > 0, `${kind} finds something`);
    for (const f of audited.forbidden) {
      assert.ok(!('text' in f), `${kind}: a finding keeps the request's text`);
      assert.ok(!JSON.stringify(f).includes(SECRET), `${kind}: ${JSON.stringify(f)}`);
      assert.equal(typeof f.what, 'string');
    }
  }
  assert.ok(!JSON.stringify(audits).includes(SECRET));
});

test("the audit row's findings are written as the audits give them, never the request's text", () => {
  const run = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'linux-engine-diff', 'run.mjs'), 'utf8');
  const pass = run.slice(run.indexOf('// The X request audit, in its own untimed pass'), run.indexOf("// The text commands' accessibility-bus calls"));
  assert.match(pass, /forbidden: audited\.forbidden\.slice\(0, 10\)/);
  assert.doesNotMatch(pass, /\.text\b(?!_)/, 'the audit pass reads no request text');
});
