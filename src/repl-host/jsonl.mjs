// The JSONL framing of every JSON-lines channel cua owns (#565, ruling 1190): the MCP stdio and HTTP connections, the
// runtime's stdio, the own REPL host's kernel and worker wires, the Linux engine's and the sandbox app-server's.
//
// node:readline ends a line at U+2028 (LS) and U+2029 (PS) as well as at LF and CR on Node 24 and 26 (not on 22),
// while JSON.stringify leaves both raw inside strings: a readline-based reader cut any message carrying them (a window
// title, a tab title, an app id) in two and dropped both halves. So:
// - lines(input) reads LF-terminated lines only, a trailing CR trimmed (CRLF, which readline also took), multi-byte
//   UTF-8 characters decoded across chunk boundaries, a last line without LF read at the input's end; it emits 'line'
//   for each, then 'close' at the end, and re-emits the input's 'error' until then, as readline's interface did (with
//   no listener on the reader, that error throws, as it did); it resumes a paused input and lets go of it at the end.
// - stringify(value) and jsonLine(value) write LS and PS as the escapes \u2028 and \u2029: the same JSON value, which
//   every reader of cua's output then reads whole, Node readline (Claude Code's MCP client) included.
// It lives in src/repl-host, a trusted code path of the own host (src/runtime/launch.mjs REPL_HOST_DIR), because the
// kernel, the trusted worker and cua's Linux service load it: the trusted worker refuses an import from outside one.
import {EventEmitter} from 'node:events';
import {StringDecoder} from 'node:string_decoder';

const SEPARATORS = /[\u2028\u2029]/g;
const escapeSeparator = character => `\\u${character.charCodeAt(0).toString(16)}`;

export const stringify = value => JSON.stringify(value).replace(SEPARATORS, escapeSeparator);
export const jsonLine = value => `${stringify(value)}\n`;

export function lines(input) {
  const reader = new EventEmitter();
  const decoder = new StringDecoder('utf8');
  let rest = '';
  const emit = line => reader.emit('line', line.endsWith('\r') ? line.slice(0, -1) : line);
  const onData = chunk => {
    const text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
    let start = 0;
    for (let end; (end = text.indexOf('\n', start)) !== -1; start = end + 1) {
      const line = rest + text.slice(start, end);
      rest = '';
      emit(line);
    }
    rest += text.slice(start);
  };
  const onError = error => reader.emit('error', error);
  // At the end the reader lets go of the input, as readline's close did: a later stream error (a teardown's) is the
  // stream's own handler's, never thrown from a closed reader with no listener.
  const onEnd = () => {
    input.off('data', onData);
    input.off('end', onEnd);
    input.off('error', onError);
    const last = rest + decoder.end();
    rest = '';
    if (last) emit(last);
    reader.emit('close');
  };
  input.on('data', onData);
  input.on('end', onEnd);
  input.on('error', onError);
  // As readline did: a stream its owner paused is read too (a 'data' listener alone does not restart one).
  input.resume();
  return reader;
}
