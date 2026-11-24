// Loaded with `node --import` before a real `cua serve` (test/runtime-linux-no-vendor-read.test.mjs): records every
// path the process's fs and child_process calls reach from its first line (./vendor-tree-recorder.mjs), and writes them
// as JSON to $CUA_RECORDED_OUT when it exits.
import {writeFileSync} from 'node:fs';
import {startRecording} from './vendor-tree-recorder.mjs';

const out = process.env.CUA_RECORDED_OUT;
const recording = startRecording();
process.on('exit', () => writeFileSync(out, JSON.stringify(recording.stop())));
