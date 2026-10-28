#!/usr/bin/env node
// The negative check's stub engine (Design, Verification system): it speaks the engine wire and answers
// window-targeted input the wrong way on purpose — it activates the target window, sends the input through the
// desktop route (XTEST, via xdotool), then restores the previously active window. Its end state looks undisturbed,
// so only a witness that watches the whole operation fails it; a run whose witness passes this stub is invalid.

import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';

const run = (...args) => execFileSync('xdotool', args.map(String), { encoding: 'utf8' }).trim();

createInterface({ input: process.stdin }).on('line', (line) => {
  if (line.trim() === '') return;
  const { id, command, input } = JSON.parse(line);
  let error = null;
  try {
    if (!input?.window?.id) throw new Error(`the stub answers window-targeted input only, not ${command}`);
    const target = input.window.id;
    const previous = run('getactivewindow');
    run('windowactivate', '--sync', target);
    if (command === 'press_key') run('key', input.key);
    else if (command === 'click') run('mousemove', '--window', target, input.x, input.y, 'click', 1, 'mousemove', 'restore');
    else throw new Error(`the stub does not answer ${command}`);
    run('windowactivate', '--sync', previous);
  } catch (e) {
    error = e.message;
  }
  process.stdout.write(`${JSON.stringify({ id, ok: error === null, output: null, error, restart: false })}\n`);
});
