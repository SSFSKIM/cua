// What scripts/accept/linux-chrome.mjs records about the live Chrome host it drove, from the process table and cua's
// own host files (no connection). The host is the bound profile's cua host: its socket at the path `cua serve`
// pre-lists (socketNameFor(instanceId)), its status file naming that instance id, its pid running host.mjs.
import {join} from 'node:path';
import {backendDir, socketNameFor, socketPathFor} from '../../src/chrome/extension.mjs';

export function cuaHostStep({home, instanceId, psLines, exists, readJson}) {
  const name = socketNameFor(instanceId);
  const socket = socketPathFor(home, name);
  const status = readJson(join(backendDir(home), `${name}.json`));
  const process = psLines.find(line => Number(line.trim().split(/\s+/)[0]) === status?.pid && /\/src\/chrome\/host\.mjs\b/.test(line));
  const ok = exists(socket) && status?.instanceId === instanceId && Boolean(process);
  return {ok, detail: {socket, pid: status?.pid ?? null, extensionVersion: status?.extensionVersion ?? null, process: process?.trim() ?? null}};
}

export const ownedTabs = status => (status?.sessions ?? []).flatMap(s => s.tabs.map(({tabId, mark}) => ({session_id: s.session_id, tabId, mark})));
