#!/usr/bin/env node
// The verdict of task 5's run (#228 T5; ./run.sh), from its reports: the candidate passes every scenario, and each
// control fails where and how it must, so each check is shown able to fail.
//   - candidate (the pin head, engine 0.4.7): live1, live3, screenshot and gedit PASS.
//   - base control (main, cua 0.30.5 with engine 0.4.6 and none of #228): live1, live3 and screenshot FAIL, each on its
//     content check (the session opens and the fixture's window is seen), not on a setup step.
//   - override control (the pin head with CUA_LINUX_ENGINE_BIN naming engine 0.4.6): live1 FAILS because the open is
//     refused engine_outdated with the literal sentence and hint, by the new minimum.
//   - direct (engine-direct.mjs): 0.4.6 refuses the screenshot's `tree_wanted: false` and answers the same request
//     without it; 0.4.7 answers both.
//   node judge.mjs <out dir> <override path> <head checkout>   one JSON verdict on stdout; exit 0 when every expectation holds
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {outdatedOverrideMessage, ENGINE_HINT_LITERAL} from '../../../../scripts/accept/linux-runtime-cells.mjs';

const [out, override, head] = process.argv.slice(2);
const read = name => { try { return JSON.parse(readFileSync(join(out, name), 'utf8')); } catch { return null; } };
const problems = [];
const expect = (ok, what) => { if (!ok) problems.push(what); return ok; };
const row = (report, name) => report?.scenarios?.find(s => s.scenario === name);
const failed = (s, what) => (s?.checks ?? []).filter(c => !c.ok).map(c => c.what).filter(w => what.test(w));
const passed = (s, what) => (s?.checks ?? []).some(c => c.ok && what.test(c.what));

const candidate = read('candidate.json');
expect(candidate?.status === 'PASS', 'the candidate did not pass every scenario');
for (const name of ['live1', 'live3', 'screenshot', 'gedit']) expect(row(candidate, name)?.status === 'PASS', `candidate ${name} is not PASS`);

const base = read('base-control.json');
const opened = /^the session opened/;
const appeared = /window appeared$/;
for (const [name, content] of [['live1', /has Fixture button$/], ['live3', /ends with the sentence/], ['screenshot', /next getAXState sent one GetAttributes/]]) {
  const s = row(base, name);
  expect(s?.status === 'FAIL', `base control ${name} did not fail`);
  expect(passed(s, opened) && passed(s, appeared), `base control ${name} did not get as far as the window`);
  expect(failed(s, content).length > 0, `base control ${name} did not fail on its content check (${content})`);
}

const over = read('override-control.json');
const live1 = row(over, 'live1');
expect(live1?.status === 'FAIL', 'override control live1 did not fail');
const refusal = live1?.refused?.refusal;
const message = outdatedOverrideMessage({path: override, version: '0.4.6', minimum: '0.4.7', installer: `node ${head}/bin/cua.mjs install`});
expect(refusal?.code === 'engine_outdated', `override control was refused ${refusal?.code ?? 'not at all'}, not engine_outdated`);
expect(refusal?.message === message, `override control's sentence is not the literal: ${refusal?.message}`);
expect(refusal?.hint === ENGINE_HINT_LITERAL, `override control's hint is not the literal: ${refusal?.hint}`);
expect(live1?.refused?.exit?.code === 1, `override control's serve exited ${JSON.stringify(live1?.refused?.exit)}, not 1`);

const direct = readFileSync(join(out, 'engine-direct.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
const of = v => direct.find(d => d.version.startsWith(`cua-engine ${v} `));
const d046 = of('0.4.6');
const d047 = of('0.4.7');
expect(d046?.screenshot_request?.answer?.ok === false && /tree_wanted/.test(d046.screenshot_request.answer.error ?? ''), '0.4.6 did not refuse tree_wanted naming it');
expect(d046?.control_without_the_field?.answer?.ok === true && d046.control_without_the_field.answer.output.screenshots === 1, '0.4.6 did not answer the request without the field');
expect(d047?.screenshot_request?.answer?.ok === true && d047.screenshot_request.answer.output.screenshots === 1, '0.4.7 did not answer the screenshot request');
expect(d047?.control_without_the_field?.answer?.ok === true, '0.4.7 did not answer the request without the field');

const verdict = {status: problems.length ? 'FAIL' : 'PASS', problems, refusal: refusal ?? null, direct046: d046?.screenshot_request?.answer?.error ?? null};
console.log(JSON.stringify(verdict, null, 1));
process.exitCode = problems.length ? 1 : 0;
