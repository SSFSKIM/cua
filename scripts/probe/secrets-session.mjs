// Probe-only lifecycle and value-free bootstrap evidence. Keep both streams even when open() fails; scanning
// zero streams after a failed banner is not evidence that the runtime kept a sentinel out of its output.
import {resultText} from '../accept/mcp-session.mjs';

function startupDiagnostic(stage, reply) {
  const text = resultText(reply);
  const detail = {stage, timedOut: reply.timedOut === true, isError: Boolean(reply.error || reply.result?.isError),
    trustedImportRefused: text.includes('Trusted RPC dependency must resolve within a configured trusted code path:')};
  const encoded = text.split('\n\nnode_repl diagnostics: ')[1];
  try {
    const raw = JSON.parse(encoded);
    detail.kernel = {
      pid: Number.isSafeInteger(raw.kernel_pid) && raw.kernel_pid > 0 ? raw.kernel_pid : null,
      status: /^(?:exited\(code=\d+\)|signaled\(signal=\d+\)|running|unknown)$/.test(raw.kernel_status) ? raw.kernel_status : null,
      reason: ['stdout_eof', 'stdin_error', 'stdout_error'].includes(raw.reason) ? raw.reason : null,
    };
  } catch { /* no structured kernel diagnostic */ }
  return detail;
}

export async function openSecretSession(session) {
  try { await session.initialize(); } catch {
    throw new Error(`${session.name}: initialize failed (no cell sent)`);
  }
  // The controlled target serves setup. A failed banner is a failed bootstrap, not something to hide by trying
  // another cell: the original import refusal often preceded a less informative kernel-exit reply.
  for (const [stage, timeout] of [['banner', 120_000], ['ready', 60_000]]) {
    const reply = await session.js(`nodeRepl.write("${stage}")`, timeout);
    if (reply.timedOut || reply.error || reply.result?.isError)
      throw new Error(`${session.name}: startup failed ${JSON.stringify(startupDiagnostic(stage, reply))}`);
  }
}

export async function finishSecretSessions(sessions, channels) {
  for (const session of sessions) {
    await session.terminate();
    channels.push({name: `${session.name} MCP transport`, text: session.transcript.join('\n')});
    channels.push({name: `${session.name} stderr (serve, runtime, node_repl, kernel, trusted worker)`, text: session.stderr});
  }
}
