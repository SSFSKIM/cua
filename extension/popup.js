// The cua extension's popup: whether the native host is connected (and if not, why: the host's refusal such as
// protocol_mismatch, or Chrome's reason), the instance id's first 8 characters (to match against `cua profiles bind`
// output) and how many debuggees the extension holds. It asks the service worker, and asks again on each change it
// announces; nothing else.

export function statusLines(status) {
  if (!status) return {host: 'host: unknown (the extension\'s worker did not answer)', instance: 'instance: -', debuggees: 'debuggees: -'};
  const why = status.refusal ? `${status.refusal.code}: ${status.refusal.message}` : status.error;
  const host = status.connected ? `host: connected ${status.hostName}` : `host: disconnected ${status.hostName}${why ? ` (${why})` : ''}`;
  return {host, instance: `instance: ${status.instanceId ? status.instanceId.slice(0, 8) : '-'}`, debuggees: `debuggees: ${status.debuggees}`};
}

// `retry`: the popup just opened, so a host that refused for a lasting reason is tried once more now (the user may
// have updated cua since); re-renders on a change never retry, or a refusing host would be spawned in a loop.
export async function render(document, chrome, {retry = false} = {}) {
  const status = await chrome.runtime.sendMessage({type: 'cua.status', ...(retry ? {retry: true} : {})}).catch(() => null);
  for (const [id, text] of Object.entries(statusLines(status))) document.getElementById(id).textContent = text;
}

// Renders now and again whenever the worker reports a change, so an open popup never shows a stale "connected".
export function start(document, chrome) {
  chrome.runtime.onMessage.addListener(message => { if (message?.type === 'cua.changed') render(document, chrome); });
  return render(document, chrome, {retry: true});
}

if (typeof document !== 'undefined') start(document, chrome);
