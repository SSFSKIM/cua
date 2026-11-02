// T4b's live controls (private-controls.sh, on a private display only): one harness Desktop per control, begun with the
// person's window active (so the holder opens), a recorder window of the run's own opened, the control's act, and the
// run closed; each run's end as the harness records it (scenes.mjs `desktopEnding`). The clean run must pass; every
// negative control must fail, through the run's own trace, the whole run's record, or both, as each says.
// argv: the cua engine, the person's window, the window titled as the pre-created control's recorder.
const WT = '/Users/new/Developer/GitHub/cua/.claude/worktrees/cua-171/scripts/linux-engine-diff';
const { Desktop, desktopEnding } = await import(`${WT}/scenes.mjs`);
const { Engine } = await import(`${WT}/engine.mjs`);
const { xdotool } = await import(`${WT}/xtools.mjs`);
const [cua, personArg, precreatedArg] = process.argv.slice(2);
const person = Number(personArg);
const precreated = Number(precreatedArg);
const hex = (id) => `0x${Number(id).toString(16).padStart(8, '0')}`;

/** A key a fresh engine sends to `window` through the background route; its answer. */
async function pressKey(window) {
  const engine = new Engine({ label: 'cua', bin: cua }).start();
  try {
    const { response } = await engine.request('press_key', { window: { id: window }, key: 'x' });
    return response.ok ? 'ok' : response.error;
  } finally {
    await engine.close();
  }
}

const CONTROLS = [
  // nothing but the run's own windows: the trace and the record both clean
  { name: 'clean', expect: 'pass', act: async (d, own) => ({ key_to_own: await pressKey(own.id) }) },
  // an engine's request no audit pass samples: a key to the person's window, sent directly (no proxy), after one to
  // the run's own window; only the whole run's record sees it
  { name: 'engine-key-to-foreign', expect: 'record', act: async (d, own) => ({ key_to_own: await pressKey(own.id), key_to_person: await pressKey(person) }) },
  // XTEST at a foreign target: the pointer warped onto the middle of the person's window, where the window manager put
  // it, and a button pressed there
  {
    name: 'xtest-at-foreign',
    expect: 'both',
    act: async () => {
      const g = Object.fromEntries(xdotool('getwindowgeometry', '--shell', person).split('\n').map((l) => l.split('=')));
      const at = [Number(g.X) + Math.floor(Number(g.WIDTH) / 2), Number(g.Y) + Math.floor(Number(g.HEIGHT) / 2)];
      return { at, ran: xdotool('mousemove', '--sync', ...at, 'click', '1') };
    },
  },
  // the harness's own tool writing a property of the person's window (WM_NAME)
  { name: 'foreign-property-write', expect: 'both', act: async () => ({ ran: xdotool('set_window', '--name', 'changed', person) }) },
  // the harness's own tool changing the person's window's override-redirect flag
  { name: 'foreign-override-redirect', expect: 'both', act: async () => ({ ran: xdotool('set_window', '--overrideredirect', '1', person) }) },
];

const out = [];
let failures = 0;
for (const control of CONTROLS) {
  const desktop = new Desktop({ cua, run: `control-${control.name}` });
  let acted = null;
  let own = null;
  try {
    await desktop.begin();
    own = await desktop.openRecorder('r');
    acted = await control.act(desktop, own);
  } catch (error) {
    acted = { error: error.message };
  } finally {
    await desktop.closeAll();
  }
  const ending = desktopEnding(desktop.ending);
  const traceFailed = ending.foreign.some((f) => f.startsWith('the harness:'));
  const recordFailed = ending.foreign.some((f) => f.startsWith("the run's record:"));
  const held = { pass: !traceFailed && !recordFailed, record: recordFailed, both: traceFailed && recordFailed }[control.expect];
  if (!held) failures++;
  out.push({ control: control.name, expect: control.expect, held, own: own?.id ? hex(own.id) : null, acted, foreign: ending.foreign, desktop: ending.record });
}

// a window already on the display when the run began, titled exactly as the run's recorder is: never found or adopted
{
  const desktop = new Desktop({ cua, run: 'precreated', nonce: 'fixednonce' });
  let own = null;
  let error = null;
  try {
    await desktop.begin();
    own = await desktop.openRecorder('r');
  } catch (e) {
    error = e.message;
  } finally {
    await desktop.closeAll();
  }
  const ending = desktopEnding(desktop.ending);
  const held = own !== null && own.id !== precreated && desktop.ownerOf(precreated) === 'foreign' && ending.foreign.length === 0;
  if (!held) failures++;
  out.push({ control: 'preexisting-exact-title', expect: 'pass, and the run found its own window', held, title: desktop.label('recorder', 'r'), own: own?.id ? hex(own.id) : null, precreated: hex(precreated), precreated_owner: desktop.ownerOf(precreated), error, foreign: ending.foreign, desktop: ending.record });
}

console.log(JSON.stringify({ person: hex(person), controls: out }, null, 2));
process.exit(failures ? 1 : 0);
