// Preloaded (NODE_OPTIONS=--import) into the fake VM's node processes: `fetch` serves the install fixture's bytes from
// VM_FETCH_MAP ({url: file}) and appends every URL asked for to VM_FETCH_LOG. Anything else is a 404, and nothing reaches
// the network.
import {appendFileSync, readFileSync} from 'node:fs';

const {VM_FETCH_MAP, VM_FETCH_LOG} = process.env;
if (VM_FETCH_MAP) {
  let map = null;
  globalThis.fetch = async input => {
    const url = String(input?.url ?? input);
    if (VM_FETCH_LOG) appendFileSync(VM_FETCH_LOG, `${url}\n`);
    map ??= JSON.parse(readFileSync(VM_FETCH_MAP, 'utf8'));
    if (!map[url]) return new Response('not found', {status: 404});
    const bytes = readFileSync(map[url]);
    return new Response(bytes, {headers: {'content-length': String(bytes.length)}});
  };
}
