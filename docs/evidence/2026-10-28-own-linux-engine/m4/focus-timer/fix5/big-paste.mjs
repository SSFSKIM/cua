// Task 56 fix 4: a 64 KiB paste into a full gnome-terminal screen, on a private display the harness creates
// (`startPrivateServer`, the live-run declaration withdrawn first, so the spawner refuses every display this process
// did not create, `:0` included). The scene is the never-taken probe's (fix3/probe.mjs, direct, idle): Openbox, the
// front window covering the terminal, the screen filled by keys. Each run is one `type_text` of <chars> ASCII letters
// (no newline; task 56 fix 4 pasted 65,536, fix 5 4 MiB) from a fresh engine with `--stats`, the engines alternating; the engine's own CPU time over the request
// (utime + stime of /proc/<pid>/stat, every thread, the exited ones included) and the request's wall time are
// recorded beside the paste's `--stats`. After an unconfirmed answer the retry guard is waited out.
//
// usage: node big-paste.mjs <harness dir> <out dir> <runs per engine> <chars> <name>=<cua-engine>...
import { createWriteStream, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';

const [harness, out, runsArg, charsArg, ...engineSpecs] = process.argv.slice(2);
const runs = Number(runsArg);
const chars = Number(charsArg);
const engines = engineSpecs.map((spec) => {
  const i = spec.indexOf('=');
  return { name: spec.slice(0, i), bin: spec.slice(i + 1) };
});

const lib = (m) => import(join(harness, 'scripts/linux-engine-diff', m));
const { Engine } = await lib('engine.mjs');
const { openFamily, readText } = await lib('families.mjs');
const { Oracle } = await lib('oracle.mjs');
const { Desktop } = await lib('scenes.mjs');
const { startPrivateServer } = await lib('xtools.mjs');
const { LIVE_RUN, assertReachable, xExecFileSync } = await lib('xspawn.mjs');
const { GUARD_WAIT_MS, UNCONFIRMED, keysOf, settledRead } = await lib('focus-timer.mjs');

mkdirSync(out, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rows = createWriteStream(join(out, 'runs.jsonl'));
const emit = (o) => {
  const s = JSON.stringify(o);
  rows.write(`${s}\n`);
  console.log(s.slice(0, 600));
};

delete process.env[LIVE_RUN];
const use = (d) => {
  assertReachable('the 64 KiB paste sitting', [], { DISPLAY: d });
  process.env.DISPLAY = d;
};
use(':cua171-big-paste');
const server = await startPrivateServer({ out });
use(server.display);

// /proc counts CPU time in USER_HZ ticks, 100 a second on Linux
const TICK_MS = 10;
/** The process's CPU time so far, ms: utime + stime (fields 14 and 15 of /proc/<pid>/stat, after the command's name). */
const cpuMs = (pid) => {
  const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
  const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  return (Number(fields[11]) + Number(fields[12])) * TICK_MS;
};

const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const text = LETTERS.repeat(Math.ceil(chars / LETTERS.length)).slice(0, chars);

const desktop = new Desktop({ cua: engines[0].bin, run: 'big-paste', logs: out });
let wm;
try {
  await desktop.begin({ startRecord: async () => null });
  wm = desktop.spawnApp('openbox', 'openbox', [], { app: 'openbox' });
  await sleep(1500);
  const oracle = new Oracle();
  desktop.oracle = oracle;
  await desktop.openFront('covered');
  const a = await openFamily(desktop, oracle, 'gnome-terminal', 'focus-a');
  desktop.arrangeFront('covered');
  await sleep(500);
  const versions = Object.fromEntries(engines.map((e) => [e.name, xExecFileSync(e.bin, ['--version'], { encoding: 'utf8' }).trim()]));
  emit({ kind: 'meta', versions, display: server.display, a: a.id, text_chars: text.length, tick_ms: TICK_MS });
  const window = { id: a.id };
  {
    const engine = new Engine({ label: 'fill', bin: engines[0].bin }).start();
    try {
      await engine.pipeline(keysOf('abcDefgHPasted'.repeat(110)).map((key) => ({ command: 'press_key', input: { window, key } })));
    } finally {
      await engine.close();
    }
  }
  await sleep(1000);
  const read = () => Promise.resolve(readText(desktop, oracle, a)).then((t) => ({ text: t, caret: typeof t === 'string' ? t.length : null }));
  for (let trial = 0; trial < runs; trial++) {
    for (const e of engines) {
      const before = await settledRead(read);
      const recordBefore = readFileSync(a.record, 'utf8').length;
      const engine = new Engine({ label: `big-${e.name}`, bin: e.bin, stats: true }).start();
      const pid = engine.child.pid;
      await sleep(200);
      const cpuBefore = cpuMs(pid);
      const started = performance.now();
      let responses;
      let cpuOver;
      try {
        ({ responses } = await engine.pipeline([{ command: 'type_text', input: { window, text } }]));
        cpuOver = cpuMs(pid) - cpuBefore;
      } finally {
        await engine.close();
      }
      const wall = performance.now() - started;
      const after = await settledRead(read);
      const received = readFileSync(a.record, 'utf8').slice(recordBefore);
      const stats = [...engine.statsById.values()].find((s) => s?.paste)?.paste ?? null;
      const answer = responses.at(-1);
      const p = stats ?? {};
      emit({
        kind: 'run',
        trial,
        engine: e.name,
        ok: answer.ok === true,
        error: answer.ok === true ? null : String(answer.error).slice(0, 200),
        received_whole: received === text,
        received_chars: received.length,
        field_before: before.text?.length ?? null,
        field_after: after.text?.length ?? null,
        request_wall_ms: wall,
        engine_cpu_ms: cpuOver,
        confirmed: p.confirmed,
        confirm_ms: p.confirm_ms,
        confirm_rule: p.confirm_rule,
        confirm_looks: p.confirm_looks ?? null,
        scrolled: p.scrolled ?? null,
        observed_whole: p.observed_whole,
        observed_whole_ms: p.observed_whole_ms,
        expected: p.expected,
        transfer: p.transfer,
        requests: p.requests,
        attributed: p.attributed,
        targets: p.targets,
      });
      if (answer.ok !== true && String(answer.error).includes(UNCONFIRMED)) await sleep(GUARD_WAIT_MS);
    }
  }
  await desktop.close([a]);
} finally {
  await desktop.closeAll();
  if (wm) {
    try {
      process.kill(-wm.pid, 'SIGTERM');
    } catch {
      // gone
    }
  }
  const watched = await server.stop();
  emit({ kind: 'end', watchdog: watched });
  await new Promise((r) => rows.end(r));
}
