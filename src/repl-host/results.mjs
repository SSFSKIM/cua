// What cua's own REPL host turns a kernel's execution into: the MCP tool result the vendor's Rust supervisor assembles
// (docs/doperpowers/specs/2026-10-14-own-repl-host-design.md, Design "Supervisor, execution order and lifecycle", and
// its revised output line), and the images the kernel's `emit_image` requests carry. Pure functions. The ordering and
// sentences below were observed on the pinned node_repl (M0's vendor control and the M1 probes of 2026-10-14):
//   success: one text item per write name, names in order of first appearance and concatenated within a name, then
//            the unnamed output (console lines and unnamed writes) when it is non-empty or nothing else was produced,
//            then the images in emission order, then the execution's content items;
//   error:   the error sentence, then the named outputs and the non-empty unnamed output; images are dropped.
// `_meta['codex/nodeReplExecutionDurationMs']` is the submitted code's duration when the kernel reported one.
export const DURATION_META_KEY = 'codex/nodeReplExecutionDurationMs';
export const IMAGE_DETAIL_META = {'codex/imageDetail': 'original'};

const text = value => ({type: 'text', text: value});

// `execution`: {ok, error, output, namedOutputs, images, contentItems, durationMs}.
export function assembleResult({ok, error, output = '', namedOutputs = [], images = [], contentItems = [], durationMs = null}) {
  const named = namedOutputs.map(text);
  let content;
  if (ok) {
    const others = named.length + images.length + contentItems.length;
    content = [...named, ...(output !== '' || others === 0 ? [text(output)] : []), ...images, ...contentItems];
  } else {
    content = [text(error), ...named, ...(output !== '' ? [text(output)] : [])];
  }
  return {content, isError: !ok, ...(typeof durationMs === 'number' ? {_meta: {[DURATION_META_KEY]: durationMs}} : {})};
}

// A result that is only a sentence.
export const sentenceResult = (sentence, {isError = true} = {}) => ({content: [text(sentence)], isError});

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;

// Percent-decoding of a non-base64 data URL body, byte by byte: an escape that is not two hex digits stays as it is.
function percentDecode(body) {
  const bytes = [];
  const raw = Buffer.from(body, 'utf8');
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 0x25 && i + 2 < raw.length) {
      const hex = String.fromCharCode(raw[i + 1], raw[i + 2]);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) { bytes.push(parseInt(hex, 16)); i += 2; continue; }
    }
    bytes.push(raw[i]);
  }
  return Buffer.from(bytes);
}

// An `emit_image` request's `image_url` -> {image} (the MCP image item) or {error} (the sentence the cell's
// emitImage rejects with). The kernel has already turned files, bytes and {bytes, mimeType} into data URLs; this is
// the host's half: a data URL whose media type is image/* (any case; parameters dropped, the type kept as written),
// with strictly canonical standard base64 when it says ;base64, else percent-encoded bytes.
export function imageFromDataUrl(url) {
  if (typeof url !== 'string' || !/^data:/i.test(url)) return {error: 'nodeRepl.emitImage only accepts data URLs'};
  const comma = url.indexOf(',');
  if (comma === -1) return {error: 'nodeRepl.emitImage received a malformed data URL'};
  const [mimeType, ...params] = url.slice('data:'.length, comma).split(';');
  if (!/^image\//i.test(mimeType)) return {error: 'nodeRepl.emitImage only accepts image/* data URLs'};
  const body = url.slice(comma + 1);
  let bytes;
  if (params.some(p => p.toLowerCase() === 'base64')) {
    bytes = Buffer.from(body, 'base64');
    if (body.length % 4 !== 0 || !BASE64.test(body) || bytes.toString('base64') !== body) return {error: 'nodeRepl.emitImage received an invalid base64 data URL'};
  } else {
    bytes = percentDecode(body);
  }
  return {image: {type: 'image', data: bytes.toString('base64'), mimeType, _meta: {...IMAGE_DETAIL_META}}};
}
