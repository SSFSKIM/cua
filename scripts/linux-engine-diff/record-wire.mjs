// Records the spike's wire fixtures (fixtures/wire/cua-*.json and the screenshot the object fixture's replay
// loads) from a harness-owned gedit window: one answer of each kind cua-engine produces today — an object
// (get_window_state with its screenshot), an array (list_windows, kept to the harness's own windows) and null
// (a coordinate click). The spike answers no string-valued command (clipboard_read arrives in M2).

import { copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Engine } from './engine.mjs';
import { Desktop } from './scenes.mjs';
import { FIXTURE_DIR } from './wire-check.mjs';

export async function recordWire(args) {
  const desktop = new Desktop({ cua: args.cua, run: 'wire' });
  const engine = new Engine({ label: 'cua', bin: args.cua }).start();
  const version = (await import('node:child_process')).execFileSync(args.cua, ['--version'], { encoding: 'utf8' }).trim();
  const write = (kind, request, response, note) => {
    const fixture = { kind, engine: version, source: `recorded by scripts/linux-engine-diff.mjs --record-wire on a harness-owned gedit window${note ? `; ${note}` : ''}`, request, response };
    writeFileSync(join(FIXTURE_DIR, `cua-${kind}.json`), `${JSON.stringify(fixture)}\n`);
    process.stdout.write(`cua-${kind}.json: ${request.command}\n`);
  };
  try {
    const scene = await desktop.openGedit('fixture', 'cua171 wire fixture\nline two\n');
    const ask = async (id, command, input) => {
      const { response } = await engine.request(command, input);
      if (!response.ok) throw new Error(`${command} failed: ${response.error}`);
      return { request: { id: response.id, command, input }, response };
    };
    const windows = await ask(1, 'list_windows', {});
    windows.response.output = windows.response.output.filter((w) => w.title.includes(scene.label));
    write('array', windows.request, windows.response, 'the output is kept to the harness-owned windows');
    const state = await ask(2, 'get_window_state', { window: windows.response.output[0], include_screenshot: true });
    copyFileSync(state.response.output.screenshots[0].filepath, join(FIXTURE_DIR, 'screenshot.jpg'));
    write('object', state.request, state.response, 'its screenshot is fixtures/wire/screenshot.jpg');
    const click = await ask(3, 'click', { window: { id: scene.id }, x: 455, y: 600 });
    write('null', click.request, click.response);
  } finally {
    await engine.close();
    await desktop.closeAll();
  }
}
