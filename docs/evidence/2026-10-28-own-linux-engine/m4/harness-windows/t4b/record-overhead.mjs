// RECORD's overhead, measured once (T4b's audit round): one timed operation, cua's background `press_key` on a harness
// gedit window (its SendEvents are requests the whole-run record copies), with the record on against off, in
// interleaved blocks of fresh engines, each block's first request untimed; judged by Acceptance 3's rule (20 samples a
// side at least, the bootstrap 95% interval of on's median minus off's, a pass within max(5% of off's median, 1 ms)).
// The Desktop's own record is left out so "off" is off; each "on" block runs a whole-run record of its own, audited at
// the end (the windows found before it began taken as found). argv: the cua engine, the blocks a side (default 4),
// the timed samples a block (default 10).
const WT = '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff';
const { Desktop, desktopEnding } = await import(`${WT}/scenes.mjs`);
const { Engine } = await import(`${WT}/engine.mjs`);
const { foreignLine, judgeForeign, recordElements } = await import(`${WT}/foreign.mjs`);
const { startRunRecord } = await import(`${WT}/xtools.mjs`);
const { median, noiseBound, noiseVerdict, speedLabel } = await import(`${WT}/stats.mjs`);
const { medianDifferenceInterval } = await import(`${WT}/events.mjs`);
const [cua, blocksArg = '4', samplesArg = '10'] = process.argv.slice(2);
const blocks = Number(blocksArg);
const perBlock = Number(samplesArg);

const off = { stop: async () => `${JSON.stringify({ kind: 'ready', ms: Date.now() })}\n${JSON.stringify({ kind: 'end', ms: Date.now() })}\n` };
const desktop = new Desktop({ cua, run: 'record-overhead' });
const samples = { on: [], off: [] };
const records = [];
try {
  await desktop.begin({ startRecord: async () => off });
  await desktop.openFront('visible');
  const scene = await desktop.openGedit('overhead', 'cua171 record overhead\n');
  for (let b = 0; b < 2 * blocks; b++) {
    const lane = b % 2 === 0 ? 'on' : 'off';
    const record = lane === 'on' ? await startRunRecord() : null;
    const engine = new Engine({ label: 'cua', bin: cua }).start();
    try {
      for (let i = 0; i <= perBlock; i++) {
        const { response, ms } = await engine.request('press_key', { window: { id: scene.id }, key: 'Right' });
        if (!response.ok) throw new Error(`press_key failed: ${response.error}`);
        if (i > 0) samples[lane].push(ms);
      }
    } finally {
      await engine.close();
      if (record) records.push(await record.stop());
    }
  }
} finally {
  await desktop.closeAll();
}
const ending = desktopEnding(desktop.ending);
// each block's record begins after the scene opened, so the windows the harness found before it are taken as found
// (the whole-run record, begun before anything opens, sees them created)
const audits = records.map((text) => {
  const { elements, meta } = recordElements(text.split('\n').filter(Boolean), desktop.root);
  const judged = judgeForeign(elements, { registered: new Set(desktop.registry().keys()), root: desktop.root });
  return { ...judged, clean: meta.ready && meta.ended && judged.foreign.length === 0, ...(meta.error ? { error: meta.error } : {}) };
});
const bar = median(samples.off);
const interval = medianDifferenceInterval(samples.on, samples.off);
const verdict = noiseVerdict(interval, bar);
const result = {
  op: 'press_key (background, gedit)',
  samples: { on: samples.on.length, off: samples.off.length },
  median_ms: { on: median(samples.on), off: bar },
  interval_ms: interval,
  bound_ms: noiseBound(bar),
  verdict: verdict === 'same' ? speedLabel(interval) : verdict,
  on_records: audits.map((a) => ({ clean: a.clean, requests: a.requests, mutating: a.mutating, foreign: a.foreign.map(foreignLine), ...(a.error ? { error: a.error } : {}) })),
  run_trace: ending.record?.trace ?? null,
  raw_ms: samples,
};
console.log(JSON.stringify(result, null, 2));
process.exit(audits.every((a) => a.clean) && !ending.foreign.some((f) => f.startsWith('the harness:')) ? 0 : 1);
