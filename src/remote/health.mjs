// Passive diagnostics shared by the resident agent and doctor. Atomic snapshots, never credentials or network calls.
import {mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';

export const agentStatePath = home => join(home, 'state', 'agent.json');
export function readAgentState(home) {
  try {
    const state = JSON.parse(readFileSync(agentStatePath(home), 'utf8'));
    return state?.version === 1 ? state : null;
  } catch { return null; }
}

export function createAgentState(home, {now = Date.now, diagnostics = () => {}} = {}) {
  const state = {version: 1, pid: process.pid, node: process.execPath, startedAt: new Date(now()).toISOString()};
  function save() {
    const path = agentStatePath(home);
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      mkdirSync(join(home, 'state'), {recursive: true, mode: 0o700});
      writeFileSync(temp, `${JSON.stringify(state)}\n`, {mode: 0o600, flag: 'wx'});
      renameSync(temp, path);
    } catch (error) {
      diagnostics(`could not record agent health (${error.code ?? 'error'})`);
    } finally { try { rmSync(temp, {force: true}); } catch {} }
  }
  return {
    chrome(observation) {
      state.chrome = {...observation, checkedAt: new Date(now()).toISOString()};
      save();
    },
    relay({url, status, error = null}) {
      const at = new Date(now()).toISOString();
      const previous = state.relay?.url === url ? state.relay : null;
      state.relay = {url, status, updatedAt: at,
        lastConnectedAt: status === 'connected' ? at : previous?.lastConnectedAt ?? null,
        failingSince: status === 'failing' ? previous?.failingSince ?? at : null,
        lastError: error};
      save();
    },
  };
}

// Relay pings arrive within the 60 s watchdog. Ninety seconds allows a scheduling delay, not perpetual green after a crash.
export function relayHealthRow(home, url, now = Date.now()) {
  const row = (status, detail) => ({name: 'agent.relay', status, detail});
  if (!url) return row('skip', 'no relay is enrolled (not applicable)');
  const link = readAgentState(home)?.relay;
  if (!link || link.url !== url) return row('blocked', `${url}: no recorded link state for this relay; see ${agentStatePath(home)} and agent.log (an older agent may need updating)`);
  const age = now - Date.parse(link.updatedAt);
  if (link.status === 'connected' && age >= 0 && age <= 90_000)
    return row('pass', `${url}: connected recently, last confirmed ${link.updatedAt}`);
  if (link.status === 'failing') return row('blocked', `${url}: failing since ${link.failingSince}; last error: ${link.lastError}; last attempt ${link.updatedAt}`);
  return row('blocked', `${url}: ${link.status === 'connected' ? 'connection record is stale' : link.status}; last update ${link.updatedAt}${link.lastError ? `; last error: ${link.lastError}` : ''}; see agent.log`);
}
