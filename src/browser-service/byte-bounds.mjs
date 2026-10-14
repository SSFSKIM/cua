// The byte bounds on the files the content exports and page asset bundles write. They are set at the vendor route's
// own ceiling, never below it (the session's requirement of 2026-10-14: nothing the vendor carries fails on cua):
//   - The vendor has no limit of its own (qY, ZZ and eQ read whole bodies; YZ bundles every asset at once, BS:54321-54446,
//     BS:61770-61905). What bounds it is the transport: every page result and cached resource reaches the service as one
//     message from Chrome's extension (or MAWS's primitive server, which the host serves the same way), and Chrome caps a
//     message to a native host at 64 MiB ("The maximum size of the message sent to the native messaging host is 64 MiB",
//     developer.chrome.com native messaging); cua's host decodes at most that much from its peer (src/chrome/host.mjs
//     MAX_FROM_EXTENSION_BYTES). So no single file the vendor writes exceeds 64 MiB of payload (about 48 MiB when it
//     travels as base64), except a cleaned Markdown export, which can grow up to threefold as replacement characters
//     and so stays within 3 x 64 MiB without a bound of its own.
//   - A bundle has no total on either side: assets arriving one after another are written and released, so the vendor's
//     only ceiling is the disk.
// MAX_FILE_BYTES is enforced twice: inside the page, while the body is read and before it is expanded to base64 (the page
// fetch reads its body through readBoundedBodyInPage), and on this side, on the bytes the page or Chrome's resource cache
// hand back, before they are decoded (the page controls its own globals, so its bound is not trusted alone). A file over
// it fails with a fixed sentence; nothing of it is written.

export const MAX_FILE_BYTES = 64 * 1024 * 1024;
export const EXPORT_TOO_LARGE = 'Exported content exceeds the 64 MiB limit';
export const ASSET_TOO_LARGE = 'Asset exceeds the 64 MiB limit';

// The number of bytes a base64 string decodes to, without decoding it.
export function decodedLength(base64) {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

// In the page: a fetch Response's body, read up to `maxBytes` (a declared larger length refused before reading, an
// actual one stopped as soon as it passes the bound) -> Uint8Array, else throws `sentence`. Serialised into the page
// with toString and passed to the page fetch as its reader.
export async function readBoundedBodyInPage(response, maxBytes, sentence) {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN);
  if (Number.isFinite(declared) && declared > maxBytes) {
    try { await response.body?.cancel(); } catch {}
    throw new Error(sentence);
  }
  const reader = response.body?.getReader();
  if (reader == null) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) throw new Error(sentence);
    return bytes;
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const {done, value} = await reader.read();
    if (done) break;
    if (value == null) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error(sentence);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
