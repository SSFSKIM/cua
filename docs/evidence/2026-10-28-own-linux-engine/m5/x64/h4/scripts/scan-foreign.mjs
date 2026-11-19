// Task 105: copied as is from task 106 (the controller's scan for ruling 857(b)); run over the H'''' V1-V5 results.
// Scan stored results for any foreign-window finding: audit rows, stub-check, the end row's trace/record and failures.
// Read-only. One JSON line per results file.
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

for (const file of process.argv.slice(2)) {
  const bytes = readFileSync(file);
  const rows = (file.endsWith('.gz') ? gunzipSync(bytes) : bytes)
    .toString('utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const s = { audits: 0, auditForeign: [], stubForeign: [], traceForeign: [], recordForeign: [], failedForeign: [], record: null, trace: null, endRows: 0, restores: null, scene_ends: null, textRestores: 0, sceneEnded: 0 };
  for (const r of rows) {
    if (r.kind === 'audit') {
      s.audits++;
      if (r.foreign?.length) s.auditForeign.push(`${r.engine} ${r.scene} ${r.op}: ${r.foreign.join(' | ')}`);
    }
    if (r.kind === 'scene-ended') s.sceneEnded++;
    if (r.kind === 'stub-check' && r.audit?.foreign?.length) s.stubForeign.push(...r.audit.foreign);
    if (r.kind === 'end') {
      s.endRows++;
      const d = r.desktop ?? {};
      if (d.trace?.foreign?.length) s.traceForeign.push(...d.trace.foreign);
      if (d.record?.foreign?.length) s.recordForeign.push(...d.record.foreign);
      s.trace = d.trace ? `clean=${d.trace.clean}` : 'none';
      s.record = d.record?.skipped ? 'skipped' : d.record ? `clean=${d.record.clean}` : 'none';
      s.failedForeign.push(...(r.failed ?? []).filter((f) => /did not open/.test(f)));
      s.restores = r.restores ?? null;
      s.scene_ends = r.scene_ends ?? null;
    }
  }
  const findings = s.auditForeign.length + s.stubForeign.length + s.traceForeign.length + s.recordForeign.length + s.failedForeign.length;
  console.log(JSON.stringify({ file, findings, audits: s.audits, ends: s.endRows, trace: s.trace, record: s.record, restores: s.restores, scene_ends: s.scene_ends, scene_ended_rows: s.sceneEnded, ...(findings ? { s } : {}) }));
}
