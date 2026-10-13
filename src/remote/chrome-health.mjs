// Read in the agent process, not by spawning its node from doctor's terminal (which would inherit the wrong TCC context).
import {profileStatuses} from '../profiles/registry.mjs';
import {readAgentState} from './health.mjs';

export const agentChromeAccessHint = node => `Grant Full Disk Access to the agent's node binary ${node} for the Chrome profile route (System Settings → Privacy & Security → Full Disk Access). After node moves, run cua agent install again and grant access to the new path.`;

export function observeAgentChrome({home, chrome}) {
  const data = chrome.dataReadability();
  const observation = {userData: chrome.userData, ...data, profiles: []};
  try {
    observation.profiles = profileStatuses({home, chrome}).map(p => ({key: p.key, directory: p.chromeProfileDirectory,
      status: p.chromeDataError ? 'unreadable' : p.reason === 'profile_directory_missing' ? 'missing' : 'readable',
      ...(p.chromeDataError ? {error: p.chromeDataError} : {})}));
    const denied = observation.profiles.find(p => p.status === 'unreadable');
    if (denied) Object.assign(observation, {status: 'unreadable', error: denied.error});
  } catch (error) {
    observation.registryError = error.code ?? 'error';
  }
  return observation;
}

export function agentChromeRow(home, status) {
  const row = (state, detail) => ({name: 'chrome.agent', status: state, detail});
  if (!status.installed) return row('skip', 'no installed launchd agent; chrome.extension.* describes this calling process only');
  if (!status.job) return row('blocked', 'the launchd plist is unreadable; see agent.installed for the node path');
  const node = status.job.node;
  const hint = agentChromeAccessHint(node);
  const state = readAgentState(home);
  if (!status.running || state?.pid !== status.pid || state?.node !== node || !Number.isFinite(Date.parse(state.chrome?.checkedAt)))
    return row('blocked', `no Chrome readability observation from the running job's node ${node}; an older agent needs updating, or the job has not recorded this process yet. ${hint}`);
  const chrome = state.chrome;
  const observed = `agent node ${node}, pid ${state.pid}, checked ${chrome.checkedAt}: ${chrome.userData}`;
  if (chrome.registryError) return row('blocked', `${observed}; agent could not read its profiles registry (${chrome.registryError}); check $CUA_HOME/profiles.json in the agent's environment. ${hint}`);
  if (chrome.status === 'readable') return row('pass', `${observed}; Chrome data was readable in the agent process (not a terminal test; refreshed at startup and each profiles_list)`);
  return row('blocked', `${observed}; ${chrome.status}${chrome.error ? ` (${chrome.error})` : ''}. ${chrome.status === 'missing' ? 'Open Chrome in this user account first.' : hint} Bound profiles can still be ready when their exact instance is confirmed live.`);
}
