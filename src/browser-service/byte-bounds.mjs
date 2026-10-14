// The byte bounds on the files the content exports and page asset bundles write (cua's own, Decision Log 2026-10-14,
// "M3 task 1 review, controller"; the vendor has none): 50 MiB per exported file or asset, 200 MiB per asset bundle.
// Each is enforced twice: inside the page, while the body is read and before it is expanded to base64 (the page fetch
// reads its body through readBoundedBodyInPage), and on this side, on the bytes the page or Chrome's resource cache
// hand back, before they are decoded (the page controls its own globals, so its bound is not trusted alone). A file
// over its bound fails with a fixed sentence; nothing of it is written.

export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_BUNDLE_BYTES = 200 * 1024 * 1024;
export const EXPORT_TOO_LARGE = 'Exported content exceeds the 50 MiB limit';
export const ASSET_TOO_LARGE = 'Asset exceeds the 50 MiB limit';
export const BUNDLE_TOO_LARGE = 'Asset bundle exceeds the 200 MiB limit';

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
