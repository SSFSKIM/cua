// Regression tests for the M1a whole-branch review's harness findings (8b757c3c..8272cc51).

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { desktopExecArg } from '../../scripts/linux-engine-diff/desktop-entry.mjs';
import { launchEntry } from '../../scripts/linux-engine-diff/run.mjs';

/** The engines' `Exec` tokenizing (native/linux-engine/src/apps.rs `tokenize_exec`, the vendor's rule). */
function tokenizeExec(exec) {
  const tokens = [];
  let current = '';
  let inToken = false;
  let quote = null;
  for (let i = 0; i < exec.length; i++) {
    const c = exec[i];
    if (quote === "'") {
      if (c === "'") quote = null;
      else current += c;
    } else if (quote && c === '"') quote = null;
    else if (c === '\\') current += exec[++i];
    else if (quote) current += c;
    else if (/\s/.test(c)) {
      if (inToken) tokens.push(current);
      current = '';
      inToken = false;
      continue;
    } else if (c === '"' || c === "'") quote = c;
    else current += c;
    inToken = true;
  }
  if (inToken) tokens.push(current);
  return tokens.map((t) => t.replace(/%%/g, '%'));
}

test("a hostile run label never reaches shell source: launch_app's probe takes its marker as an argument", () => {
  const work = mkdtempSync(join(tmpdir(), 'cua171-hostile-'));
  try {
    const label = 'x$(touch INJECTED)`touch INJECTED2`"; touch INJECTED3; "%c \'q\'';
    const dir = mkdtempSync(join(work, `cua171-diff-${label}-`));
    const entry = launchEntry(dir);
    const script = readFileSync(join(dir, 'launch', 'launch.sh'), 'utf8');
    assert.equal(script, '#!/bin/sh\necho launched >> "$1"\n', 'the script text is fixed');
    const desktop = readFileSync(join(dir, 'launch', 'applications', 'cua171-launch-probe.desktop'), 'utf8');
    const exec = desktop.match(/^Exec=(.*)$/m)[1];
    const argv = tokenizeExec(exec);
    assert.deepEqual(argv, ['/bin/sh', join(dir, 'launch', 'launch.sh'), join(dir, 'launch', 'launched')], 'every argument arrives whole');
    // run it as an engine would, and as a shell reading the Exec line would: neither runs the label
    const run = spawnSync(argv[0], argv.slice(1), { cwd: work });
    assert.equal(run.status, 0);
    const shell = spawnSync('/bin/sh', ['-c', exec.replace(/%%/g, '%')], { cwd: work });
    assert.equal(shell.status, 0);
    assert.equal(entry.count(), 2);
    for (const f of ['INJECTED', 'INJECTED2', 'INJECTED3']) assert.equal(existsSync(join(work, f)), false, f);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

test('an Exec argument is quoted per the Desktop Entry spec, and one the two escape layers would read differently is refused', () => {
  assert.equal(desktopExecArg('/tmp/a b'), '"/tmp/a b"');
  assert.equal(desktopExecArg('a"b`c$d'), '"a\\"b\\`c\\$d"');
  assert.equal(desktopExecArg('50%'), '"50%%"');
  assert.throws(() => desktopExecArg('a\\b'), /backslash/);
  assert.throws(() => desktopExecArg('a\nb'), /line/);
});

test("the events experiment's variants run the candidate binary with their own flags", async () => {
  const { eventEngines } = await import('../../scripts/linux-engine-diff/events.mjs');
  const { parseArgs } = await import('../../scripts/linux-engine-diff/cli.mjs');
  const args = parseArgs(['--experiment', 'events', '--cua', '/c', '--out', 'o', '--vendor', '/v', '--newest', '/n', '--variant', 'none=--retention none']);
  assert.deepEqual(eventEngines(args), [
    { label: 'pinned', bin: '/v', args: [] },
    { label: 'newest', bin: '/n', args: [] },
    { label: 'cua', bin: '/c', args: [] },
    { label: 'cua:none', bin: '/c', args: ['--retention', 'none'] },
  ]);
});

test('a drag cell with a usable reference needs every cua run to take effect, where the pinned build missed too', async () => {
  const { judgeCell, judgeRuns } = await import('../../scripts/linux-engine-diff/drag.mjs');
  const run = (engine, i, before, after) => ({ engine, i, ok: true, witness: true, before, after });
  const drops = (n) => ({ starts: n, drops: n });
  // the reviewer's case: pinned [true, false], cua [true, false]
  const dnd = judgeRuns('dnd', [run('pinned', 0, drops(0), drops(1)), run('pinned', 1, drops(1), drops(1)), run('cua', 0, drops(0), drops(1)), run('cua', 1, drops(1), drops(1))]);
  const cell = judgeCell(dnd.runs, ['cua'], dnd.expected);
  assert.equal(cell.lanes.cua.pass, false);
  assert.deepEqual(cell.lanes.cua.misses, [1]);
  // a parity the pinned build never took leaves the cell without a usable reference: unjudged, never a pass
  const range = judgeRuns('range', [run('pinned', 0, 25, 75), run('pinned', 1, 75, 75), run('cua', 0, 25, 75), run('cua', 1, 75, 75)]);
  assert.equal(range.expected[1], null);
  assert.equal(judgeCell(range.runs, ['cua'], range.expected).lanes.cua.pass, null);
  // a lane that lacks a run the reference has is a miss
  const short = judgeRuns('dnd', [run('pinned', 0, drops(0), drops(1)), run('pinned', 1, drops(1), drops(2)), run('cua', 0, drops(0), drops(1))]);
  assert.deepEqual(judgeCell(short.runs, ['cua'], short.expected).lanes.cua.misses, [1]);
});

test('an audit counts only when the audited requests answered as the timed pass did; an expected refusal still passes', async () => {
  const { judgeOperation } = await import('../../scripts/linux-engine-diff/stats.mjs');
  const rows = (engine, ok) => [
    { engine, series: 'cold', ms: 100, ok, witness: true, effect: ok ? true : undefined, equal: true },
    { engine, series: 'warm', ms: 90, ok, witness: true, effect: ok ? true : undefined, equal: true },
  ];
  const opts = { vendors: ['pinned', 'newest'], candidate: 'cua', judgeSpeed: false };
  const audit = (clean, ...oks) => ({ clean, oks });
  const base = [...rows('pinned', true), ...rows('newest', true), ...rows('cua', true)];
  // cua's operation failed early under the proxy: its setup requests alone made a clean trace
  const early = judgeOperation(base, { ...opts, audits: { pinned: audit(true, true, true), newest: audit(true, true, true), cua: audit(true, false, false) } });
  assert.equal(early.pass, false);
  assert.match(early.reasons.join(), /did not answer as the timed pass/);
  assert.equal(judgeOperation(base, { ...opts, audits: { pinned: audit(true, true, true), newest: audit(true, true, true), cua: audit(true, true, true) } }).pass, true);
  // the hidden-element scroll: every engine refuses it, timed and audited alike
  const refused = [...rows('pinned', false), ...rows('newest', false), ...rows('cua', false)];
  assert.equal(judgeOperation(refused, { ...opts, audits: { pinned: audit(true, false, false), newest: audit(true, false, false), cua: audit(true, false, false) } }).pass, true);
  // a vendor audit that did not exercise the operation does not make the audit required, nor does it count as clean
  assert.equal(judgeOperation(base, { ...opts, audits: { pinned: audit(true), newest: audit(true), cua: audit(true) } }).pass, false, 'an audit with no audited request is not clean');
});

test("the events experiment's wire speed verdicts are part of its outcome; through the vendor client they are recorded only", async () => {
  const { eventSpeeds, eventsPass } = await import('../../scripts/linux-engine-diff/events.mjs');
  const step = (command, ms, first = false) => ({ command, ms, first, answer: { ok: true }, events: [] });
  const rows = [{ route: 'desktop', records: { pinned: [step('key_down', 1, true), step('key_up', 33)], newest: [step('key_down', 1, true), step('key_up', 0.17)], cua: [step('key_down', 0.5, true), step('key_up', 2.4)] } }];
  const speeds = eventSpeeds(rows, { minSamples: 1 });
  assert.equal(speeds.find((s) => s.command === 'key_up').pass, false);
  assert.equal(eventsPass({ answers: true, speeds, via: 'wire' }), false, 'a wire speed loss fails the experiment');
  assert.equal(eventsPass({ answers: true, speeds, via: 'vendor-js' }), true, "the client's deferred settle distorts speed: recorded, not judged");
  assert.equal(eventsPass({ answers: false, speeds: [], via: 'wire' }), false);
});

test('a drag run that selects no cell is refused before it starts, never reported complete', async () => {
  const { runDrag } = await import('../../scripts/linux-engine-diff/drag.mjs');
  const desktop = { openChrome: () => assert.fail('the run must not open a window') };
  await assert.rejects(runDrag({ vendor: 'v', cua: 'c', variants: [], families: ['gedit'], ops: ['dnd'] }, { desktop, emit: () => {} }), /no drag cell/);
});

test('--via vendor-js refuses --variant, since the vendor client runs the binary without its flags', async () => {
  const { parseArgs } = await import('../../scripts/linux-engine-diff/cli.mjs');
  const base = ['--vendor', 'v', '--newest', 'n', '--cua', 'c', '--out', 'o', '--via', 'vendor-js', '--vendor-js', 's'];
  assert.throws(() => parseArgs([...base, '--scene', 'gedit', '--ops', 'tree', '--variant', 'none=--retention none']), /--variant/);
  assert.throws(() => parseArgs([...base, '--experiment', 'events', '--variant', 'none=--retention none']), /--variant/);
  assert.equal(parseArgs([...base, '--scene', 'gedit', '--ops', 'tree']).via, 'vendor-js');
});
