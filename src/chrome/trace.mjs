// Optional, session-latched diagnostics. Never include payloads or error sentences.
import {appendFileSync, readFileSync, statSync} from 'node:fs';
import {isAbsolute, join} from 'node:path';
export function sessionTrace(home) {
  if (!home) return null;
  try {
    const config = join(home, 'state/host-trace.json');
    if (!statSync(config).isFile()) return null;
    const {path} = JSON.parse(readFileSync(config, 'utf8'));
    return typeof path === 'string' && isAbsolute(path) ? path : null;
  } catch { return null; }
}
export function traceSession(s, kind, method, params, outcome = {}) {
  if (!s?.tracePath) return;
  const target = params.target ?? params.source;
  // Select identifier fields rather than spreading an untrusted target object.
  const ids = target && Object.fromEntries(['tabId','sessionId','targetId'].filter(k => target[k] !== undefined).map(k => [k, target[k]]));
  const cdp = method === 'executeCdp' || method === 'onCDPEvent' ? params.method : undefined;
  const payload = method === 'executeCdp' ? params.commandParams : method === 'onCDPEvent' ? params.params : params;
  const row = {t:new Date().toISOString(), session:s.id, name:s.title, kind, method,
    ...(params.tabId !== undefined ? {tabId:params.tabId} : {}), ...(ids ? {target:ids} : {}),
    ...(cdp ? {cdp} : {}), paramKeys:Object.keys(payload ?? {}).sort(), ...outcome};
  try { appendFileSync(s.tracePath, JSON.stringify(row)+'\n', {mode:0o600}); } catch { /* tracing cannot affect the host */ }
}
