// Sentinel scanning for scripts/probe-secrets.mjs: does a generated value appear, raw or base64-encoded, in text or
// in files? Files are streamed whole, whatever their size, keeping enough of each chunk's end that a fingerprint
// straddling two chunks is still found. A file or directory that cannot be read is returned as unread: the caller
// must treat that as incomplete evidence, never as clean.
import {createReadStream, readdirSync, statSync} from 'node:fs';
import {join} from 'node:path';

// The value and its base64 forms at each byte alignment (node_repl relays nativePipe bytes as base64), trimmed of the
// characters that depend on neighbouring bytes.
export function fingerprints(value) {
  const out = [value];
  for (let pad = 0; pad < 3; pad++) {
    const b64 = Buffer.concat([Buffer.alloc(pad, 0x20), Buffer.from(value)]).toString('base64');
    out.push(b64.slice(pad ? 4 : 0, -4));
  }
  return out;
}

export const textLeaks = (text, prints) => prints.filter(print => text.includes(print)).length;

async function fileLeaks(path, prints, chunkBytes) {
  const keep = Math.max(...prints.map(print => print.length)) - 1;
  let tail = '';
  for await (const chunk of createReadStream(path, {highWaterMark: chunkBytes})) {
    // latin1 maps bytes 1:1, and fingerprints are ASCII, so byte and character matching agree.
    const text = tail + chunk.toString('latin1');
    if (textLeaks(text, prints)) return true;
    tail = text.slice(-keep);
  }
  return false;
}

// Every regular file under `roots` (symbolic links are not followed). Returns {scanned, leaked, unread, links}.
export async function scanFiles(roots, prints, {chunkBytes = 1 << 20} = {}) {
  const result = {scanned: 0, leaked: [], unread: [], links: 0};
  async function visit(dir) {
    let entries;
    try { entries = readdirSync(dir, {withFileTypes: true}); } catch { result.unread.push(dir); return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isSymbolicLink()) result.links++;
      else if (entry.isFile()) {
        try {
          if (await fileLeaks(path, prints, chunkBytes)) result.leaked.push(path);
          result.scanned++;
        } catch { result.unread.push(path); }
      }
    }
  }
  // A root that does not exist has nothing to scan; one that cannot be reached (an inaccessible ancestor, say) is
  // unread, not absent.
  for (const root of roots) {
    try { statSync(root); } catch (error) {
      if (error.code !== 'ENOENT') result.unread.push(root);
      continue;
    }
    await visit(root);
  }
  return result;
}
