// The <host>:<port> an agent listens on (`agent run --http`, `agent install --http`). A module of its own so that
// src/remote/launchd.mjs, and with it `cua doctor` and `cua agent status`, never load the HTTP stack.
import {fail} from '../runtime/errors.mjs';

const HINT = 'name the address to listen on: 127.0.0.1 for this Mac only, the Mac\'s LAN address for other machines (never 0.0.0.0)';

export function parseAddress(text) {
  const found = /^(?:\[([0-9A-Fa-f:.]+)\]|([^:\s[\]]+)):(\d{1,5})$/.exec(text ?? '');
  const port = Number(found?.[3]);
  if (!found || port > 65535)
    fail('invalid_http_address', `--http takes <host>:<port>, such as 127.0.0.1:7801 or [::1]:7801 (got ${JSON.stringify(text)})`, {hint: HINT});
  return {host: found[1] ?? found[2], port};
}

// A launchd job serves one address across restarts, so the port is fixed: 0 (the system picks) is refused.
export function parseFixedAddress(text) {
  const address = parseAddress(text);
  if (address.port === 0) fail('invalid_http_address', `--http needs a fixed port for an installed agent (got ${JSON.stringify(text)})`, {hint: 'for example --http 192.168.1.20:7801'});
  return address;
}
