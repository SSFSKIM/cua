#!/usr/bin/env node
// task 80 (ruling 700): one first request through cua's service, as linux-native.mjs makes its requests: `cua serve` from
// <checkout>, initialize, then one js cell, `cua.listApps({emit: false})`. Prints one JSON line: whether the cell
// answered, the app count or the error's exact text, any server request it was asked (each declined), and the server's
// stderr lines that name the engine.
//   usage: node first-request.mjs <checkout>
import {join} from 'node:path';

const checkout = process.argv[2];
const {openSession, resultText} = await import(join(checkout, 'scripts/accept/mcp-session.mjs'));
const asked = [];
const session = openSession({args: [join(checkout, 'bin/cua.mjs'), 'serve'], env: {...process.env, CUA_SHIM_PERSIST: 'session'},
  clientName: 'cua-t80-first-request', onServerRequest: msg => { asked.push(msg.method); return {action: 'decline'}; }});
const out = {};
try {
  await session.initialize();
  const answer = await session.js(`let r;
    try { const apps = await cua.listApps({emit: false}); r = {ok: true, apps: apps.length, running: apps.filter(a => a.isRunning).length}; }
    catch (e) { r = {ok: false, error: String(e?.message ?? e)}; }
    nodeRepl.write(JSON.stringify(r));`, 90_000);
  const text = answer.timedOut ? '(no answer)' : resultText(answer);
  const line = /\{"ok".*\}$/m.exec(text)?.[0];
  Object.assign(out, {cellError: !!answer.result?.isError, answer: line ? JSON.parse(line) : null, text: line ? undefined : text.slice(0, 1200)});
} catch (error) {
  out.initialize = error.message;
}
out.asked = asked;
out.exit = await session.terminate();
out.stderr = session.stderr.split('\n').filter(l => /engine|older|install/i.test(l)).slice(0, 10);
console.log(JSON.stringify(out));
process.exit(out.answer?.ok ? 0 : 1);
