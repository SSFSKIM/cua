// CI runs `npm test` as shards, one hosted job each (.github/ci-kit.yml's test-1 and test-2; scripts/test-shard.mjs).
// What must hold: the shards together run exactly the files `npm test` runs, each file once; a shard that selects no
// file fails; and the gates in ci-kit.yml name every shard of one total.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { npmTestFiles, npmTestPattern, parseShard, shardFiles } from '../scripts/test-shard.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO, 'scripts', 'test-shard.mjs');

function fixture(files, script = 'node --test "test/**/*.test.mjs"') {
  const root = mkdtempSync(join(tmpdir(), 'cua-test-shard-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { test: script } }));
  for (const [file, body] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), body);
  }
  return root;
}
const PASSING = "import { test } from 'node:test';\ntest('passes', () => {});\n";
const FAILING = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\ntest('fails', () => assert.fail('no'));\n";
// A test file that records its own name, one line, in the file the MARKS variable names, then passes.
const marking = (name) => `import { appendFileSync } from 'node:fs';\nimport { test } from 'node:test';\n`
  + `appendFileSync(process.env.MARKS, ${JSON.stringify(`${name}\n`)});\ntest('passes', () => {});\n`;
// The child must not report into this file's own run (NODE_TEST_CONTEXT makes a nested `node --test` a child reporter).
function runWith(root, extraEnv, ...args) {
  const env = { ...process.env, ...extraEnv };
  delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8', env, timeout: 60_000 });
}
const run = (root, ...args) => runWith(root, {}, ...args);

test("the shards of this repository's npm test run every file npm test runs, each once, and none is empty", () => {
  const files = npmTestFiles(REPO);
  assert.ok(files.length > 100, `npm test's files: ${files.length}`);
  assert.ok(files.includes('test/test-shard.test.mjs'));
  for (const total of [1, 2, 3, 5]) {
    const shards = Array.from({ length: total }, (_, i) => shardFiles(files, i + 1, total));
    assert.deepEqual(shards.flat().sort(), [...files].sort(), `${total} shards: the union`);
    assert.equal(new Set(shards.flat()).size, files.length, `${total} shards: no file twice`);
    for (const shard of shards) assert.ok(shard.length > 0);
  }
});

test('the file list does not depend on the order the file system lists directories in', () => {
  assert.deepEqual(shardFiles(['b', 'a', 'd', 'c'], 1, 2), ['a', 'c']);
  assert.deepEqual(shardFiles(['d', 'c', 'b', 'a'], 2, 2), ['b', 'd']);
});

test('a shard is <index>/<total> with 1 <= index <= total; anything else is refused', () => {
  assert.deepEqual(parseShard('2/3'), { index: 2, total: 3 });
  for (const bad of ['0/2', '3/2', '1/0', '1', '1/2/3', 'a/b', '-1/2', '1.5/2', '', undefined]) {
    assert.throws(() => parseShard(bad), /shard/, String(bad));
  }
});

test('npm test must keep the plain form the pattern is read from', () => {
  const root = fixture({}, 'node --test "test/**/*.test.mjs" --test-concurrency=1');
  try {
    assert.equal(npmTestPattern(root), undefined);
    const result = run(root, '1/1');
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /package\.json's test script is not `node --test "<pattern>"`/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a shard runs its files and only them, and exits as node --test does', () => {
  const root = fixture({ 'test/a.test.mjs': PASSING, 'test/b.test.mjs': FAILING, 'test/sub/c.test.mjs': PASSING });
  try {
    // sorted: test/a, test/b, test/sub/c -> shard 1 of 2 holds a and sub/c, shard 2 holds b
    const first = run(root, '1/2');
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stderr, /shard 1\/2: 2 of 3 files/);
    const second = run(root, '2/2');
    assert.equal(second.status, 1, second.stdout + second.stderr);
    assert.match(second.stderr, /shard 2\/2: 1 of 3 files/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a file name with glob characters runs as itself, in the shard that owns it', () => {
  const bracketed = 'test/widget-[ab].test.mjs';
  const root = fixture({ 'test/a.test.mjs': PASSING, [bracketed]: FAILING, 'test/z.test.mjs': PASSING });
  try {
    // sorted: test/a, test/widget-[ab], test/z -> shard 2 of 2 holds the bracketed file
    const first = run(root, '1/2');
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const second = run(root, '2/2');
    assert.equal(second.status, 1, `the bracketed file ran:\n${second.stdout}${second.stderr}`);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("across the shards of a fixture every file runs exactly once, as many as each shard's progress line says", () => {
  const names = ['test/a.test.mjs', 'test/b.test.mjs', 'test/widget-[ab].test.mjs', 'test/sub/c.test.mjs', 'test/sub/deep/d.test.mjs',
    'test/e f.test.mjs', 'test/g.test.mjs'];
  const root = fixture(Object.fromEntries(names.map((name) => [name, marking(name)])));
  try {
    for (const total of [1, 2, 3, 7]) {
      const ran = [];
      for (let index = 1; index <= total; index += 1) {
        const marks = join(root, `marks-${total}-${index}`);
        const result = runWith(root, { MARKS: marks }, `${index}/${total}`);
        assert.equal(result.status, 0, `${index}/${total}: ${result.stdout}${result.stderr}`);
        const mine = readFileSync(marks, 'utf8').split('\n').filter(Boolean);
        assert.match(result.stderr, new RegExp(`shard ${index}/${total}: ${mine.length} of ${names.length} files`), `${index}/${total}: the progress line`);
        assert.deepEqual([...mine].sort(), shardFiles(names, index, total), `${index}/${total}: the script's deal is Node's`);
        ran.push(...mine);
      }
      assert.deepEqual(ran.sort(), [...names].sort(), `${total} shards: every file once`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a shard that selects no file fails; it does not pass empty', () => {
  const root = fixture({ 'test/only.test.mjs': PASSING });
  try {
    const result = run(root, '2/2');
    assert.equal(result.status, 2, result.stdout + result.stderr);
    assert.match(result.stderr, /shard 2\/2 selects no file of 1/);
    const none = fixture({});
    try {
      const empty = run(none, '1/1');
      assert.equal(empty.status, 2, empty.stdout + empty.stderr);
      assert.match(empty.stderr, /shard 1\/1 selects no file of 0/);
    } finally { rmSync(none, { recursive: true, force: true }); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("ci-kit's test gates name every shard of one total, each once, and the harness suite's cleanup check", () => {
  const config = readFileSync(join(REPO, '.github', 'ci-kit.yml'), 'utf8');
  const gates = [...config.matchAll(/^ {2}- name: (\S+)\n((?: {4}.*\n)+)/gm)].map(([, name, body]) => ({ name, body }));
  const shards = gates.flatMap(({ name, body }) =>
    [...body.matchAll(/node scripts\/test-shard\.mjs (\d+)\/(\d+)/g)].map(([, index, total]) => ({ name, index: Number(index), total: Number(total) })));
  assert.ok(shards.length >= 2, 'the shard gates');
  const total = shards[0].total;
  assert.deepEqual(shards.map((shard) => shard.total), shards.map(() => total), 'one total');
  assert.deepEqual(shards.map((shard) => shard.index).sort((a, b) => a - b), Array.from({ length: total }, (_, i) => i + 1));
  assert.deepEqual(shards.map((shard) => shard.name), shards.map((shard) => `test-${shard.index}`));
  // A gate with `paths` or `on` is not in every pull request's run, and the verdict would pass without its shard.
  for (const { name, body } of gates.filter((gate) => /^test-\d+$/.test(gate.name))) {
    assert.doesNotMatch(body, /^ {4}(paths|on):/m, `${name} runs in every run`);
  }
  assert.doesNotMatch(config, /^\s+run: npm test\b/m, 'no gate runs npm test whole beside the shards');
});
