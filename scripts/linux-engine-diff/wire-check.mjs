// The wire fixtures (M0, docs/doperpowers/specs/2026-10-28-own-linux-engine-design.md, Plan of Work): each fixture
// is one engine answer of one output kind (an object, an array, a string, null). The check replays it through
// OpenAI's own JavaScript client against a stub engine (stub-replay.mjs) and checks what the client's wrapper
// returns, so an engine whose `output` has the wrong shape (a JSON-encoded string, say) is caught before the vendor
// JavaScript ever drives it. A negative control replays every fixture with its output JSON-encoded and requires the
// check to fail it.

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_DIR = join(here, 'fixtures', 'wire');
export const STUB = join(here, 'stub-replay.mjs');
export const KINDS = ['object', 'array', 'string', 'null'];

/** The node ids of a wire tree in preorder (the order the vendor JavaScript numbers them). */
export function preorderIds(tree) {
  const ids = [];
  const visit = (node) => {
    ids.push(node.id);
    for (const child of node.children ?? []) visit(child);
  };
  visit(tree);
  return ids;
}

/** The kind of a wire `output` value. */
export function outputKind(output) {
  if (output === null) return 'null';
  if (Array.isArray(output)) return 'array';
  return typeof output;
}

/**
 * Failures (sentences) for a get_window_state wrapper result, given the replayed output, the screenshot bytes the
 * stub pointed at, and the native ids the stub received when the check clicked decimal ids it asked for.
 */
export function objectFailures(result, output, { screenshotBytes, resolved }) {
  const failures = [];
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    return [`the wrapper returned ${outputKind(result)}, not an object`];
  }
  if (!isDeepStrictEqual(result.window, output.window)) failures.push('window differs from the engine output');
  if (result.ax_tree_source !== output.ax_tree_source) failures.push('ax_tree_source differs from the engine output');
  if (typeof result.ax_tree?.to_string !== 'function') {
    failures.push('ax_tree has no to_string renderer');
  } else {
    const rendered = result.ax_tree.to_string();
    const n = preorderIds(output.ax_tree).length;
    const lines = rendered.split('\n');
    if (rendered === '' || !lines.every((line) => /^\t*\d+ /.test(line) && Number(line.trim().split(' ')[0]) < n)) {
      failures.push('the rendered tree is empty or names an element id outside the tree');
    }
    if (result.ax_tree.id !== '0') failures.push(`the root's element id is ${JSON.stringify(result.ax_tree.id)}, not "0"`);
  }
  const ids = preorderIds(output.ax_tree);
  for (const { decimal, native } of resolved) {
    if (native !== ids[Number(decimal)]) {
      failures.push(`element ${decimal} resolved to ${JSON.stringify(native)}, not the preorder node ${JSON.stringify(ids[Number(decimal)])}`);
    }
  }
  const shots = result.screenshots;
  if (!Array.isArray(shots) || shots.length !== output.screenshots.length) {
    failures.push('screenshots differ in number from the engine output');
  } else {
    for (const shot of shots) {
      const bytes = Buffer.from(shot.bytes ?? []);
      if (!screenshotBytes || !bytes.equals(screenshotBytes)) failures.push('a screenshot was not loaded from its file');
      if (shot.data_url !== `data:image/jpeg;base64,${bytes.toString('base64')}`) failures.push('a screenshot data_url is wrong');
    }
  }
  return failures;
}

export function arrayFailures(result, output) {
  if (!Array.isArray(result)) return [`the wrapper returned ${outputKind(result)}, not an array`];
  return isDeepStrictEqual(result, output) ? [] : ['the array differs from the engine output'];
}

export function stringFailures(result, output) {
  if (typeof result !== 'string') return [`the wrapper returned ${outputKind(result)}, not a string`];
  return result === output ? [] : [`the string is ${JSON.stringify(result)}, not ${JSON.stringify(output)}`];
}

export function nullFailures(result, request, received) {
  const failures = [];
  if (result !== undefined) failures.push(`the void wrapper returned ${outputKind(result)}`);
  if (!received || received.command !== request.command || !isDeepStrictEqual(received.input, request.input)) {
    failures.push('the engine did not receive the request as sent');
  }
  return failures;
}

export function loadFixtures(dir = FIXTURE_DIR) {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => ({ name, ...JSON.parse(readFileSync(join(dir, name), 'utf8')) }));
}

/** The vendor JavaScript's Linux client, loaded from an @oai/sky directory. */
export async function loadVendorClient(skyDir) {
  const entry = join(skyDir, 'dist/project/cua/sky_js/src/targets/linux/create_client.js');
  statSync(entry);
  const { create_client: createClient } = await import(pathToFileURL(entry).href);
  return createClient;
}

/** Replays each fixture through the vendor client; returns `[{name, kind, engine, pass, failures, negative}]`. */
export async function checkWire({ skyDir, fixtureDir = FIXTURE_DIR }) {
  const createClient = await loadVendorClient(skyDir);
  const scratch = mkdtempSync(join(tmpdir(), 'linux-engine-diff-wire-'));
  const replayPath = join(scratch, 'replay.json');
  const logPath = join(scratch, 'requests.jsonl');
  process.env.OAI_SKY_LINUX_BIN = STUB;
  process.env.LINUX_ENGINE_DIFF_REPLAY = replayPath;
  process.env.LINUX_ENGINE_DIFF_REPLAY_LOG = logPath;
  const screenshot = join(fixtureDir, 'screenshot.jpg');
  const screenshotBytes = (() => {
    try {
      return readFileSync(screenshot);
    } catch {
      return null;
    }
  })();
  const received = () => {
    let text = '';
    try {
      text = readFileSync(logPath, 'utf8');
    } catch {
      return [];
    }
    return text.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line).request);
  };
  const replay = (response) => writeFileSync(replayPath, JSON.stringify({ response, screenshot }));

  const run = async (fixture, response) => {
    const client = createClient({ post_action_sleep_ms: 0 });
    const output = response.output;
    writeFileSync(logPath, '');
    replay(response);
    try {
      switch (fixture.kind) {
        case 'object': {
          const result = await client.get_window_state(fixture.request.input);
          const ids = preorderIds(fixture.response.output.ax_tree);
          const resolved = [];
          replay({ id: 0, ok: true, output: null, error: null, restart: false });
          for (const decimal of new Set(['0', String(ids.length - 1)])) {
            writeFileSync(logPath, '');
            await client.click({ window: fixture.response.output.window, element_id: decimal });
            resolved.push({ decimal, native: received().at(-1)?.input?.element_id });
          }
          return objectFailures(result, fixture.response.output, { screenshotBytes, resolved });
        }
        case 'array':
          return arrayFailures(await client.list_windows(), fixture.response.output);
        case 'string':
          return stringFailures(await client.clipboard_read(fixture.request.input), fixture.response.output);
        case 'null': {
          const result = await client.click(fixture.request.input);
          return nullFailures(result, fixture.request, received().at(-1));
        }
        default:
          return [`unknown fixture kind ${fixture.kind} (output ${outputKind(output)})`];
      }
    } catch (error) {
      return [`the wrapper threw: ${error.message.split('\n')[0]}`];
    }
  };

  const results = [];
  try {
    for (const fixture of loadFixtures(fixtureDir)) {
      const kindMatches = outputKind(fixture.response.output) === fixture.kind;
      const failures = kindMatches ? await run(fixture, fixture.response) : [`output is ${outputKind(fixture.response.output)}`];
      // The negative control: the same answer with its output JSON-encoded, which the Design forbids. For the
      // void commands the wrapper ignores the value, so the control is recorded but cannot fail.
      const encoded = { ...fixture.response, output: JSON.stringify(fixture.response.output) };
      const negative = fixture.kind === 'null' ? null : (await run(fixture, encoded)).length > 0;
      results.push({ name: fixture.name, kind: fixture.kind, engine: fixture.engine, pass: failures.length === 0, failures, negative });
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return results;
}

/** Why an engine's fixture set lacks a kind. */
export const SKIP_REASONS = {
  cua: { string: 'the spike answers no string-valued command (clipboard_read arrives in M2)' },
};

/** The PASS/FAIL lines, one per fixture, and a SKIP line for each engine set that lacks a kind. */
export function formatWireReport(results) {
  const lines = [];
  const sets = new Map();
  for (const r of results) {
    const set = r.name.replace(/-(object|array|string|null)\.json$/, '');
    if (!sets.has(set)) sets.set(set, new Set());
    sets.get(set).add(r.kind);
    const control = r.negative === null ? 'negative control n/a (void)' : r.negative ? 'negative control refused' : 'NEGATIVE CONTROL PASSED';
    lines.push(`${r.pass && r.negative !== false ? 'PASS' : 'FAIL'} ${r.kind} ${set} (${r.engine}); ${control}${r.failures.length ? `: ${r.failures.join('; ')}` : ''}`);
  }
  for (const [set, kinds] of sets) {
    for (const kind of KINDS) {
      if (!kinds.has(kind)) lines.push(`SKIP ${kind} ${set}: ${SKIP_REASONS[set]?.[kind] ?? 'no fixture of this kind'}`);
    }
  }
  return lines;
}
