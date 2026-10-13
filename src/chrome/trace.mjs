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
// Chrome tab ids are integers; CDP/session ids are bounded opaque tokens, never payload objects or URLs.
const idToken=value=>typeof value==='string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
const identifier=(key,value)=>key==='tabId'?Number.isSafeInteger(value):idToken(value);
export function traceSession(s, kind, method, params, outcome = {}) {
  if (!s?.tracePath) return;
  const target = params.target ?? params.source;
  // Select identifier fields rather than spreading an untrusted target object.
  const ids = target && Object.fromEntries(['tabId','sessionId','targetId'].filter(k => identifier(k,target[k])).map(k => [k, target[k]]));
  const cdp = method === 'executeCdp' || method === 'onCDPEvent' ? params.method : undefined;
  const payload = method === 'executeCdp' ? params.commandParams : method === 'onCDPEvent' ? params.params : params;
  const row = {t:new Date().toISOString(), ...(idToken(s.id)?{session:s.id}:{}), name:s.title, kind, method:idToken(method)?method:'<invalid>',
    ...(identifier('tabId',params.tabId) ? {tabId:params.tabId} : {}), ...(ids && Object.keys(ids).length ? {target:ids} : {}),
    ...(idToken(cdp) ? {cdp} : {}), paramKeys:Object.keys(payload ?? {}).sort(), ...outcome};
  try { appendFileSync(s.tracePath, JSON.stringify(row)+'\n', {mode:0o600}); } catch { /* tracing cannot affect the host */ }
}
