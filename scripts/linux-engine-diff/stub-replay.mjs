#!/usr/bin/env node
// A stub engine for the wire fixtures (--check-wire): it speaks the engine's wire on stdin and stdout and answers
// every request with the response recorded in the file LINUX_ENGINE_DIFF_REPLAY names, re-read per request, under
// the request's own id. A recorded screenshot path is replaced by the replay file's `screenshot` (the recorded
// files are long gone). Each request received is appended to LINUX_ENGINE_DIFF_REPLAY_LOG, so the check can confirm
// what the vendor JavaScript sent.

import { appendFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const replayPath = process.env.LINUX_ENGINE_DIFF_REPLAY;
const logPath = process.env.LINUX_ENGINE_DIFF_REPLAY_LOG;
if (!replayPath) {
  process.stderr.write('stub-replay: LINUX_ENGINE_DIFF_REPLAY is not set\n');
  process.exit(2);
}

const lines = createInterface({ input: process.stdin });
lines.on('line', (line) => {
  if (line.trim() === '') return;
  const request = JSON.parse(line);
  if (logPath) appendFileSync(logPath, `${JSON.stringify({ argv: process.argv.slice(2), request })}\n`);
  const replay = JSON.parse(readFileSync(replayPath, 'utf8'));
  const response = structuredClone(replay.response);
  response.id = request.id;
  if (replay.screenshot && response.output && Array.isArray(response.output.screenshots)) {
    for (const shot of response.output.screenshots) shot.filepath = replay.screenshot;
  }
  process.stdout.write(`${JSON.stringify(response)}\n`);
});
