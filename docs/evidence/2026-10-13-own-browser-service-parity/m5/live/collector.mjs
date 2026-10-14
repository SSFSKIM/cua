// The sampler's process as live/session.mjs runs it (over ssh, beside the serve): its completion is owned from spawn
// on, so a sampler that exits before the session ends is recorded as a failed observation instead of hanging the
// finalizer, and `stop()` always settles (it ends the sampler's stdin, waits up to `timeoutMs`, then kills it).
// ready(timeoutMs) resolves once the sampler says its collector printed a first sample, and rejects if it exits or
// the time runs out first: the serve starts only after it.
// stop() -> {ok, reason?, summary?}: ok only when the sampler ran to the end, printed its summary and that summary's
// coverage holds (sampler.mjs `coverage`).
import {spawn} from 'node:child_process';

export function startCollector({command, args}) {
  const child = spawn(command, args, {stdio: ['pipe', 'pipe', 'inherit']});
  let output = '', stopping = false, early = null;
  let markReady;
  const readied = new Promise(resolve => { markReady = resolve; });
  child.stdout.on('data', chunk => { output += chunk; if (/^\{"ready":true/m.test(output)) markReady(); });
  child.stdin.on('error', () => {});                    // a sampler that already exited closes the pipe
  const closed = new Promise(resolve => {
    child.once('error', error => { if (!stopping) early ??= {error: error.message, at: new Date().toISOString()}; resolve(); });
    child.once('close', (code, signal) => { if (!stopping) early ??= {code, signal, at: new Date().toISOString()}; resolve(); });
  });
  return {
    get early() { return early; },
    async ready(timeoutMs = 15000) {
      let timer;
      const outcome = await Promise.race([readied.then(() => 'ready'), closed.then(() => 'exited'),
        new Promise(resolve => { timer = setTimeout(() => resolve('timeout'), timeoutMs); })]);
      clearTimeout(timer);
      if (outcome === 'exited') throw new Error(`the sampler exited before it was ready (${early?.code ?? early?.signal ?? early?.error})`);
      if (outcome === 'timeout') throw new Error(`the sampler was not ready within ${timeoutMs} ms`);
    },
    async stop({timeoutMs = 30000} = {}) {
      stopping = true;
      if (!child.stdin.destroyed) child.stdin.end();
      let timer, timedOut = false;
      await Promise.race([closed, new Promise(resolve => { timer = setTimeout(() => { timedOut = true; resolve(); }, timeoutMs); })]);
      clearTimeout(timer);
      if (timedOut) { child.kill('SIGKILL'); await closed; return {ok: false, reason: `the sampler did not finish within ${timeoutMs} ms of the session's end and was killed`}; }
      if (early) return {ok: false, reason: `the sampler exited before the session ended (${early.code ?? early.signal ?? early.error}) at ${early.at}`};
      let summary;
      try { summary = JSON.parse(output.trim().split('\n').at(-1)); } catch (e) { return {ok: false, reason: `the sampler's summary is unreadable: ${e.message}`}; }
      if (!summary.coverage?.ok) return {ok: false, reason: `the sampler lost coverage: ${(summary.coverage?.problems ?? ['no coverage record']).join('; ')}`, summary};
      return {ok: true, summary};
    },
  };
}
