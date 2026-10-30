// summary.md from results.jsonl: per run, one row per operation, scene and engine — the cold and warm medians, the
// bus calls of the counting pass, the witness, the effect, output equality — and each candidate's verdict against
// the bar (the faster vendor build).

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { matrixMarkdown } from './matrix-judge.mjs';
import { summarizeEngine } from './stats.mjs';

const fmt = (v) => (v === null || v === undefined ? '–' : String(v));
const frac = (rows, key) => {
  const known = rows.filter((r) => typeof r[key] === 'boolean');
  return known.length ? `${known.filter((r) => r[key]).length}/${known.length}` : '–';
};

export function renderSummary(lines) {
  const runs = [...new Set(lines.map((l) => l.run))];
  const out = ['# linux-engine-diff summary', ''];
  for (const run of runs) {
    const rows = lines.filter((l) => l.run === run);
    const meta = rows.find((r) => r.kind === 'meta');
    if (meta?.experiment) {
      out.push(`## ${run} (experiment ${meta.experiment})`, '');
      // a matrix is rendered from its rows with the current judgement; other experiments keep their own summary
      if (meta.experiment === 'matrix') out.push(...matrixMarkdown(rows), '');
      else for (const r of rows.filter((x) => x.kind === 'experiment-summary')) out.push(...r.markdown, '');
      continue;
    }
    out.push(`## ${run}`, '');
    if (meta) {
      out.push(`commit ${fmt(meta.commit)}; ${fmt(meta.cua_version)}; occlusion ${meta.occlusion}; ${meta.blocks} blocks; ${meta.samples_tree} warm tree reads and ${meta.samples_input} warm inputs per block`);
      const variants = meta.engines.filter((e) => e.args.length).map((e) => `\`${e.label}\` = \`${e.args.join(' ')}\``);
      if (variants.length) out.push('', `variants: ${variants.join('; ')}`);
      out.push('');
    }
    const stub = rows.find((r) => r.kind === 'stub-check');
    if (stub) {
      const audit = stub.audit ? `; the X request audit ${stub.audit_failed_it ? 'failed' : '**passed (run invalid)**'} it (${[...new Set(stub.audit.forbidden)].join(', ') || 'nothing forbidden'}, ${stub.audit.requests} requests traced)` : '; no X request audit in this run';
      out.push(`negative check: the witness ${stub.witness_failed_it ? 'failed' : '**passed (run invalid)**'} the activating stub (${stub.witness.fields.join(', ') || 'no change'})${audit}`, '');
    }
    const samples = rows.filter((r) => r.kind === 'sample');
    const counts = rows.filter((r) => r.kind === 'counts');
    const verdicts = rows.filter((r) => r.kind === 'verdict');
    const equality = rows.filter((r) => r.kind === 'equality');
    const audits = rows.filter((r) => r.kind === 'audit');
    const ops = [...new Set(samples.map((r) => `${r.scene}|${r.op}`))];
    out.push('| scene | op | engine | cold ms | warm ms | n warm | bus calls cold / warm | awaited alone | wasted max | witness clean | audit | effect | equal | verdict |');
    out.push('|---|---|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|');
    for (const key of ops) {
      const [scene, op] = key.split('|');
      const engines = [...new Set(samples.filter((r) => r.scene === scene && r.op === op).map((r) => r.engine))];
      const bar = verdicts.find((v) => v.scene === scene && v.op === op)?.bar;
      for (const engine of engines) {
        const mine = samples.filter((r) => r.scene === scene && r.op === op && r.engine === engine);
        const s = summarizeEngine(mine);
        const c = counts.filter((r) => r.scene === scene && r.engine === engine && r.op === op);
        const cold = c.find((r) => r.pass === 'cold');
        const warm = c.find((r) => r.pass === 'warm');
        const eq = equality.find((r) => r.scene === scene && r.op === op && r.engine === engine);
        const v = verdicts.find((r) => r.scene === scene && r.op === op && r.candidate === engine);
        const declared = v?.deviations?.length ? ` (declared: ${v.deviations.join(', ')})` : '';
        const verdict = v ? (v.pass ? `PASS${declared}` : `FAIL: ${v.reasons.join('; ')}${declared}`) : '';
        const a = audits.find((r) => r.scene === scene && r.op === op && r.engine === engine);
        const audit = a ? (a.clean ? 'clean' : `**${[...new Set(a.forbidden.map((f) => f.what))].join(', ') || 'not traced'}**`) : '–';
        const wasted = mine.map((r) => r.stats?.tree?.wasted_calls).filter((w) => typeof w === 'number');
        out.push(`| ${scene} | ${op} | ${engine} | ${fmt(s.cold)} | ${fmt(s.warm)} | ${s.n_warm} | ${cold ? `${cold.calls} / ${warm?.calls ?? '–'}` : '–'} | ${cold ? `${cold.serial_calls} / ${warm?.serial_calls ?? '–'}` : '–'} | ${wasted.length ? Math.max(...wasted) : '–'} | ${frac(mine, 'witness')} | ${audit} | ${frac(mine, 'effect')} | ${eq ? `${eq.equal}/${eq.of}${eq.declared ? ` (${eq.declared} declared)` : ''}` : '–'} | ${verdict} |`);
      }
      if (bar) out.push(`| ${scene} | ${op} | **bar** | ${fmt(bar.cold)} | ${fmt(bar.warm)} | | | | | | | | | |`);
    }
    const notes = verdicts.filter((v) => v.first_comparison && !v.first_comparison.equal);
    if (notes.length) {
      out.push('', 'Output differences (first sample against the pinned build\'s):');
      for (const v of notes) out.push(`- ${v.scene} ${v.op} ${v.candidate}: nodes ${v.first_comparison.nodes} vs ${v.first_comparison.nodes_b}, first difference ${JSON.stringify(v.first_comparison.first_difference)}`);
    }
    const images = rows.filter((r) => r.kind === 'image');
    if (images.length) {
      out.push('', "Window screenshots, every sample against the pinned build's last of its block (each engine's own window; the top 40 rows, the window's own label, left out; in the `equal` column):", '');
      out.push('| scene | engine | within tolerance | most differing pixels | largest mean difference | first failure |', '|---|---|---|---:|---:|---|');
      for (const key of [...new Set(images.map((r) => `${r.scene}|${r.engine}`))]) {
        const [scene, engine] = key.split('|');
        const mine = images.filter((r) => r.scene === scene && r.engine === engine);
        const most = (field) => Math.max(...mine.map((r) => (typeof r[field] === 'number' ? r[field] : -1)));
        const bad = mine.find((r) => !r.ok);
        out.push(`| ${scene} | ${engine} | ${mine.filter((r) => r.ok).length}/${mine.length} | ${most('over')} | ${most('mad')} | ${bad ? `block ${bad.block} sample ${bad.i}: ${bad.reason}` : ''} |`);
      }
    }
    const textBus = rows.filter((r) => r.kind === 'text-bus');
    const textSamples = samples.filter((r) => r.clipboard_kept !== undefined || r.route !== undefined);
    if (textBus.length || textSamples.length) {
      out.push('', "Text commands (M2): the clipboard after each sample (the harness's prior text kept, or for clipboard_write what its owner set between the read and the write), the route cua reports, the witness's allowance for the foreground route, and the text calls of each engine's bus pass:", '');
      out.push('| scene | op | engine | clipboard kept | routes | foreground allowed | PasteText / InsertText / SetTextContents |', '|---|---|---|---|---|---|---|');
      for (const key of [...new Set([...textSamples, ...textBus].map((r) => `${r.scene}|${r.op}|${r.engine}`))]) {
        const [scene, op, engine] = key.split('|');
        const mine = textSamples.filter((r) => r.scene === scene && r.op === op && r.engine === engine);
        const bus = textBus.find((r) => r.scene === scene && r.op === op && r.engine === engine);
        const routes = [...new Set(mine.map((r) => r.route).filter(Boolean))].join(', ') || '–';
        const allowed = [...new Set(mine.flatMap((r) => r.witness_allowed ?? []))].join(', ') || '–';
        const calls = bus ? ['PasteText', 'InsertText', 'SetTextContents'].map((m) => bus.forbidden[m]).join(' / ') : '–';
        out.push(`| ${scene} | ${op} | ${engine} | ${frac(mine, 'clipboard_kept')} | ${routes} | ${allowed} | ${calls} |`);
      }
    }
    const cases = rows.filter((r) => r.kind === 'case');
    if (cases.length) {
      out.push('', "Paste safety cases (cua alone; safety.mjs):", '');
      out.push('| scene | case | trial | verdict | answer | ms | detail |', '|---|---|---:|---|---|---:|---|');
      for (const c of cases) {
        const answer = c.answer ? (c.answer.ok ? 'success' : `\`${String(c.answer.error).slice(0, 90)}\``) : c.answers ? c.answers.map((a) => (a.ok ? 'success' : a.error)).join(', ') : c.pastes !== undefined ? `${c.pastes} pastes` : '–';
        const ms = c.ms ?? c.ms_median ?? '–';
        const detail = [c.mode, c.retake_delay_ms !== undefined ? `retake after ${c.retake_delay_ms} ms` : null, c.route ? `route ${c.route}` : null, c.next_ms !== undefined ? `next request ${c.next_ms} ms` : null, c.transfer ? `transfer ${c.transfer}` : null, c.ms_max !== undefined ? `max ${c.ms_max} ms` : null].filter(Boolean).join('; ');
        out.push(`| ${c.scene} | ${c.op} | ${c.trial ?? '–'} | ${c.pass ? 'PASS' : `FAIL: ${c.reasons.join('; ')}`} | ${answer} | ${ms} | ${detail} |`);
      }
      const bus = rows.find((r) => r.kind === 'case-bus');
      if (bus) out.push('', `The cases' bus trace (${bus.calls} calls of ${bus.connections} connections): PasteText ${bus.forbidden.PasteText}, InsertText ${bus.forbidden.InsertText}, SetTextContents ${bus.forbidden.SetTextContents}.`);
    }
    const refusals = rows.filter((r) => r.kind === 'refusal');
    if (refusals.length) {
      out.push('', "Declared refusals (cua alone; the text and clipboard commands are M2's, `deviations.mjs`):", '');
      out.push('| command | cua answered | declared | verdict |', '|---|---|---|---|');
      for (const r of refusals) out.push(`| ${r.op} | ${r.ok ? 'ok' : `\`${r.error}\``} | ${r.declared ? r.declared.section : '–'} | ${r.pass === null ? 'n/a (not in the client)' : r.pass ? 'PASS' : 'FAIL'} |`);
    }
    const retained = verdicts.filter((v) => v.retained_ids_equal !== undefined);
    if (retained.length) {
      out.push('', 'Over-budget retained native ids:');
      for (const v of retained) out.push(`- ${v.candidate}: ${v.retained_ids_equal ? 'equal to the pinned build\'s' : '**differ**'}`);
    }
    const bounded = verdicts.filter((v) => v.calls_bound);
    if (bounded.length) {
      out.push('', "Bus-call bound (the cold and the warm count, each at most the vendor's plus 256):");
      for (const v of bounded) out.push(`- ${v.scene} ${v.candidate}: ${v.calls_bound.pass ? 'within' : `**${v.calls_bound.reasons.join('; ')}**`}`);
    }
    const end = rows.find((r) => r.kind === 'end');
    const verdictLine = !end || end.pass === undefined ? '' : end.pass ? '; every verdict PASS' : `; **FAIL**: ${end.failed.join(', ')}`;
    out.push('', end ? `run ${end.valid ? 'valid' : '**invalid**'}${verdictLine}, finished ${end.finished}` : 'run unfinished', '');
  }
  return out.join('\n');
}

export function writeSummary(dir) {
  const path = join(dir, 'results.jsonl');
  const lines = existsSync(path) ? readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const text = renderSummary(lines);
  writeFileSync(join(dir, 'summary.md'), `${text}\n`);
  return text;
}
