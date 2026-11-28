#!/usr/bin/env node
// Why the minimum is 0.4.7 (#228 T5; ruling 1279): the request the facade's getScreenshot sends, `get_window_state`
// with `tree_wanted: false`, sent straight to an engine binary, outside cua, on the run's private display. Each engine
// named runs as the service runs it (`server --desktop dedicated`) and is asked, for one window of a zenity this script
// starts with no network: list_windows, then the screenshot's request, then the same request without the field (the
// control: the window and the picture are fine, so a refusal is the field's). One JSON line per engine.
//   node engine-direct.mjs <engine> [<engine> ...]
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createInterface} from 'node:readline';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const marker = `cua-t5-direct-${randomBytes(4).toString('hex')}`;
const zenity = spawn('unshare', ['--user', '--net', `--map-user=${process.getuid()}`, `--map-group=${process.getgid()}`, '--',
  'zenity', '--info', `--text=${marker}`, `--title=${marker}`], {detached: true, stdio: 'ignore'});

function engineOf(path) {
  const child = spawn(path, ['server', '--desktop', 'dedicated'], {stdio: ['pipe', 'pipe', 'pipe']});
  const waiting = new Map();
  let stderr = '';
  child.stderr.on('data', d => { stderr += d; });
  createInterface({input: child.stdout}).on('line', line => { const m = JSON.parse(line); waiting.get(m.id)?.(m); });
  let id = 0;
  return {
    ask: (command, input) => new Promise((resolve, reject) => {
      const n = ++id;
      const timer = setTimeout(() => reject(new Error(`${command}: no answer in 20 s`)), 20_000);
      waiting.set(n, m => { clearTimeout(timer); resolve(m); });
      child.stdin.write(`${JSON.stringify({id: n, command, input})}\n`);
    }),
    stop: () => { child.stdin.end(); child.kill(); return stderr; },
  };
}

// An answer as it came, its pictures reduced to their count (their files are the engine's, not evidence).
const shown = answer => (answer?.output?.screenshots ? {...answer, output: {...answer.output, ax_tree: '(omitted)', screenshots: answer.output.screenshots.length}} : answer);

try {
  for (const path of process.argv.slice(2)) {
    const version = await new Promise(resolve => { const v = spawn(path, ['--version']); let out = ''; v.stdout.on('data', d => { out += d; }); v.on('close', () => resolve(out.trim())); });
    const engine = engineOf(path);
    try {
      let window;
      for (let i = 0; i < 80 && !window; i++) {
        window = ((await engine.ask('list_windows', {})).output ?? []).find(w => w.title === marker);
        if (!window) await sleep(250);
      }
      if (!window) throw new Error('the zenity window did not appear');
      const wanted = await engine.ask('get_window_state', {window, include_screenshot: true, tree_wanted: false});
      const plain = await engine.ask('get_window_state', {window, include_screenshot: true});
      console.log(JSON.stringify({engine: path, version, window: {id: window.id, title: window.title},
        screenshot_request: {input: {window: '(the zenity window)', include_screenshot: true, tree_wanted: false}, answer: shown(wanted)},
        control_without_the_field: {input: {window: '(the zenity window)', include_screenshot: true}, answer: shown(plain)}}));
    } finally { engine.stop(); }
  }
} finally {
  try { process.kill(-zenity.pid, 'SIGTERM'); } catch {}
}
