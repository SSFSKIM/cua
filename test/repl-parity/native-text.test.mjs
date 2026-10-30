import {test} from 'node:test';
import assert from 'node:assert/strict';
import scenarios from './scenarios/native.mjs';

const MARKER = 'cuamfourfixture';
const FORMAT = [{error: 'Linux paste supports only text format.'}, {error: 'Linux paste supports only text format.'}];
const end = {isError: false, structuredContent: {status: 'ended'}};
const results = values => [{isError: false, content: [{type: 'text', text: 'NATIVE:' + JSON.stringify(values)}]}, end];
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
for (const [id, method] of [['native/app/typetext', 'typeText'], ['native/app/paste', 'paste']]) {
  const scenario = scenarios.find(s => s.id === id), prefix = method === 'paste' ? FORMAT : [];
  test(`${id} passes only when the method returns, the marker arrives exactly once and the window survives`, () => {
    assert.deepEqual(scenario.assert({results: results([...prefix, 'undefined', 1, false])}), {ok: true});
    for (const tail of [[{error: 'editable Paste did not insert text'}, 0, false], ['undefined', 0, false], ['undefined', 2, false], ['undefined', null, false], ['undefined', 1, true]])
      assert.throws(() => scenario.assert({results: results([...prefix, ...tail])}), JSON.stringify(tail));
    if (prefix.length) assert.throws(() => scenario.assert({results: results([{error: 'wrong format error'}, prefix[1], 'undefined', 1, false])}));
  });
  test(`${id} records a count (or null for an unreadable tree) rather than accepting duplicate text`, async () => {
    for (const [tree, count] of [[`0 frame fixture\n\t1 text ${MARKER}`, 1], [`0 frame fixture\n\t1 text ${MARKER}${MARKER}`, 2], ['0 frame fixture\n\t1 text empty', 0], [null, null]]) {
      const calls = []; let values, clock = 0;
      const app = {[method]: async (text, options) => {
        calls.push([text, options]);
        if (options) throw new Error('Linux paste supports only text format.');
      }};
      await new AsyncFunction('app', 'nativeAX', 'cua', 'nativeWindow', 'nativeSay', 'Date', scenario.cells[0].code)(
        app, async () => {if (tree === null) throw new Error('window unreadable'); return tree;},
        {listWindows: async () => [{id: 7}]}, {id: 7}, v => {values = v;}, {now: () => clock += 10_001});
      assert.deepEqual(values, [...prefix, 'undefined', count, false]);
      assert.deepEqual(calls, [...(method === 'paste' ? [['fixture', {format: 'html'}], ['fixture', {format: 'md'}]] : []), [MARKER, undefined]]);
    }
  });
}
