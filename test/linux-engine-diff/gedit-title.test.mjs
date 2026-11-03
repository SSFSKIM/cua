// No gedit title the harness compares is ellipsized (#171 M4, task 51, item 4; the design session's ruling, sminos 336).
// gedit middle-truncates a window title's directory to what is left of 100 characters once the file's name is counted,
// and each lane's window has a file named for its own label, so a long enough scratch path is shortened differently in
// each lane: task 49's session TMPDIR made `gedit tree_shot cua` differ from the vendor's on the title alone, the trees
// equal. The run's scratch root is chosen so the longest title the scenes build stays whole, and a gedit window whose
// title would still be shortened is refused before it opens. Display-free: gedit is a stand-in that logs its start.

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import test from 'node:test';

import { GEDIT_TITLE_MAX, geditTitle } from '../../scripts/linux-engine-diff/gedit-title.mjs';
import { Desktop, scratchRoot } from '../../scripts/linux-engine-diff/scenes.mjs';

// task 49's scratch (its session's TMPDIR, `/tmp/cua171-task49-WqJ6?`, the last character not shown by the titles)
const TASK49_DIR = '/tmp/cua171-task49-WqJ6Jx/cua171-diff-t49-recordjudge-oVS5JT';
const TASK49_LABEL = (lane) => `cua171-diff-t49-recordjudge-04435f23-gedit-${lane}`;

test("gedit's title rule, against the two titles of task 49's failed gedit tree_shot", () => {
  // m4/record-judge-acceptance/runs/attempt-2/record-judge/summary.md: the vendor's window (a) and cua's (b), their
  // labels shown as <label>
  const a = geditTitle(join(TASK49_DIR, `${TASK49_LABEL('pinned')}.txt`));
  const b = geditTitle(join(TASK49_DIR, `${TASK49_LABEL('cua')}.txt`));
  assert.equal(a.title.replace(TASK49_LABEL('pinned'), '<label>'), '<label>.txt (/tmp/cua171-task49-WqJ6…-t49-recordjudge-oVS5JT) - gedit');
  assert.equal(b.title.replace(TASK49_LABEL('cua'), '<label>'), '<label>.txt (/tmp/cua171-task49-WqJ6J…ff-t49-recordjudge-oVS5JT) - gedit');
  assert.equal(a.ellipsized && b.ellipsized, true);
  // a directory that fits is shown whole, at least 20 characters always, and a name over the limit alone is shortened
  assert.deepEqual(geditTitle('/tmp/cua171-run-AbC123/x.txt'), { title: 'x.txt (/tmp/cua171-run-AbC123) - gedit', ellipsized: false });
  const name = `${'n'.repeat(90)}.txt`;
  assert.equal(geditTitle(`/tmp/cua171-run-AbC123/${name}`).title, `${name} (/tmp/cua1…run-AbC123) - gedit`);
  assert.equal(geditTitle(`/a/${'n'.repeat(GEDIT_TITLE_MAX)}.txt`).ellipsized, true);
  assert.equal(geditTitle(`/${'d'.repeat(19)}/${name}`).ellipsized, false, 'a directory of 20 characters is always shown whole');
  assert.equal(geditTitle(`/${'d'.repeat(20)}/${name}`).ellipsized, true);
});

/**
 * Every gedit window the scenes build (scenes.mjs `openGedit`): the differential run's scenes (run.mjs `openScene`: the
 * shared `read` window, each lane's own and its `text_` window, on the gedit and minimized scenes; the safety cases'
 * `case`), the two-services instrument's, the wire recording's and the capture and key-pace experiments', each under the
 * run name it is given by default (or, for task 49's, by hand).
 */
const LANES = ['pinned', 'newest', 'cua'];
const STAMP = '20261103T012345';
const GEDIT_WINDOWS = [
  ...[`run-${STAMP}`, 't49-recordjudge'].flatMap((run) => ['gedit', 'minimized'].flatMap((stem) => ['read', 'case', ...LANES, ...LANES.map((l) => `text_${l}`)].map((role) => ({ run, stem, role })))),
  { run: 'services-4194304', stem: 'gedit', role: 'services' },
  { run: 'wire', stem: 'gedit', role: 'fixture' },
  { run: `capture-readiness-${STAMP}`, stem: 'gedit', role: 'capture' },
  { run: `key-pace-${STAMP}`, stem: 'gedit', role: 'keys' },
];

/** A Desktop made under `tmp` as the harness's TMPDIR, then put away. */
function withDesktop(run, tmp, fn) {
  const saved = process.env.TMPDIR;
  process.env.TMPDIR = tmp;
  let desktop;
  try {
    desktop = new Desktop({ cua: 'unused', run, reader: { request: async () => ({ response: { ok: true, output: [] } }), close: async () => {} }, startActive: 0 });
  } finally {
    if (saved === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = saved;
  }
  try {
    return fn(desktop);
  } finally {
    desktop.unhookStop();
    rmSync(desktop.dir, { recursive: true, force: true });
  }
}

test("no gedit window the scenes build gets a shortened title, under the plain TMPDIR or one as long as task 49's session's", () => {
  // task 49's session TMPDIR was 25 characters; this one, inside the test's own temporary directory, is longer still
  const long = join(tmpdir(), 'cua171-task49-WqJ6Jx');
  mkdirSync(long, { recursive: true });
  try {
    for (const tmp of [tmpdir(), long]) {
      for (const { run, stem, role } of GEDIT_WINDOWS) {
        withDesktop(run, tmp, (desktop) => {
          const { title, ellipsized } = geditTitle(join(desktop.dir, `${desktop.label(stem, role)}.txt`));
          assert.equal(ellipsized, false, `${title} (TMPDIR ${tmp})`);
        });
      }
    }
  } finally {
    rmSync(long, { recursive: true, force: true });
  }
});

test("the scratch root is the harness's TMPDIR when the run's longest gedit title fits under it, else /tmp", () => {
  // the suite's own directory (suite-check.mjs) fits a short run's titles; macOS's per-user TMPDIR
  // (/var/folders/…/T, which plain `npm test` there runs under) does not
  assert.equal(scratchRoot('a11y', '/tmp/cua171-suite-AbC123'), '/tmp/cua171-suite-AbC123');
  assert.equal(scratchRoot('a11y', '/var/folders/n6/hn37q6pj7sj_9dmqqc2113800000gn/T'), '/tmp');
  assert.equal(scratchRoot('t49-recordjudge', '/tmp/cua171-task49-WqJ6Jx'), '/tmp', "task 49's session TMPDIR");
  // the Desktop takes its scratch where the rule says, under this test's TMPDIR and under a long one
  assert.equal(withDesktop('a11y', tmpdir(), (desktop) => dirname(desktop.dir)), scratchRoot('a11y'));
  const long = join(tmpdir(), `cua171-${'t'.repeat(40)}`);
  mkdirSync(long, { recursive: true });
  try {
    assert.equal(withDesktop('t49-recordjudge', long, (desktop) => dirname(desktop.dir)), '/tmp');
  } finally {
    rmSync(long, { recursive: true, force: true });
  }
});

test('a gedit window whose title gedit would still shorten (a run name too long for it) is refused before it opens', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cua171-gedit-standin-'));
  writeFileSync(join(dir, 'gedit'), `#!/bin/sh\ntouch ${JSON.stringify(join(dir, 'gedit.started'))}\n`);
  chmodSync(join(dir, 'gedit'), 0o755);
  const saved = process.env.PATH;
  process.env.PATH = `${dir}${delimiter}${saved}`;
  try {
    await withDesktop(`a-run-named-at-length-${'x'.repeat(60)}`, tmpdir(), async (desktop) => {
      desktop.session = { address: 'unix:path=/nonexistent/cua171-test-bus', stop: async () => ({}) };
      await assert.rejects(desktop.openGedit('text_newest', 'x\n', { stem: 'minimized' }), (error) => {
        assert.match(error.message, /^refusing to open cua171-diff-a-run-named-at-length-x+-[0-9a-f]{8}-minimized-text_newest: gedit would shorten its title/);
        assert.match(error.message, /a shorter run name/);
        return true;
      });
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(existsSync(join(dir, 'gedit.started')), false, 'gedit never started');
      assert.equal(desktop.windows.length, 0);
    });
  } finally {
    process.env.PATH = saved;
    rmSync(dir, { recursive: true, force: true });
  }
});
