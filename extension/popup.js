// The cua extension's popup: whether the native host is connected (and if not, why: the host's refusal such as
// protocol_mismatch, or Chrome's reason), the instance id's first 8 characters (to match against `cua profiles bind`
// output) and how many debuggees the extension holds. It asks the service worker; nothing else.

export function statusLines(status) {
  if (!status) return {host: 'host: unknown (the extension\'s worker did not answer)', instance: 'instance: -', debuggees: 'debuggees: -'};
  const why = status.refusal ? `${status.refusal.code}: ${status.refusal.message}` : status.error;
  const host = status.connected ? `host: connected ${status.hostName}` : `host: disconnected ${status.hostName}${why ? ` (${why})` : ''}`;
  return {host, instance: `instance: ${status.instanceId ? status.instanceId.slice(0, 8) : '-'}`, debuggees: `debuggees: ${status.debuggees}`};
}

export async function render(document, chrome) {
  const status = await chrome.runtime.sendMessage({type: 'cua.status'}).catch(() => null);
  for (const [id, text] of Object.entries(statusLines(status))) document.getElementById(id).textContent = text;
}

if (typeof document !== 'undefined') render(document, chrome);
