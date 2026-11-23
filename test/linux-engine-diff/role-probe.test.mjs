import assert from 'node:assert/strict';
import { test } from 'node:test';

import { NULL_PATH, decodeStates, inSelection, probeAt } from '../../scripts/linux-engine-diff/role-probe.mjs';

test("AT-SPI's state bits decode to their names, both words", () => {
  // showing (25) and selectable_text (38, in the high word)
  assert.deepEqual(decodeStates([1 << 25, 1 << (38 - 32)]), ['showing', 'selectable_text']);
  assert.deepEqual(decodeStates([0, 0]), []);
});

test('a point is inside a selection only between its start and its end', () => {
  assert.equal(inSelection(5, [[2, 8]]), true);
  assert.equal(inSelection(8, [[2, 8]]), false, 'the end is outside');
  assert.equal(inSelection(1, [[2, 8], [10, 12]]), false);
  assert.equal(inSelection(-1, [[0, 8]]), false, 'no character at the point');
});

/** A fake bus: a tree of nodes, each with the child at every point, its role and interfaces. */
function fakeOracle(nodes) {
  const calls = [];
  return {
    calls,
    on(id, iface, member, sig, ...args) {
      calls.push(`${id} ${member}`);
      const n = nodes[id];
      if (!n) throw new Error(`no node ${id}`);
      if (member === 'GetAccessibleAtPoint') return [[':1.9', n.child ?? NULL_PATH]];
      if (member === 'GetState') return [[n.states ?? 0, 0]];
      if (member === 'GetInterfaces') return [n.interfaces ?? ['org.a11y.atspi.Accessible']];
      if (member === 'GetAttributes') return [n.attributes ?? {}];
      if (member === 'GetOffsetAtPoint') return [n.offset];
      if (member === 'GetNSelections') return [n.selections?.length ?? 0];
      if (member === 'GetSelection') return n.selections[args[0]];
      throw new Error(`unexpected ${member}`);
    },
    role: (id) => {
      if (!nodes[id]) throw new Error(`no node ${id}`);
      return nodes[id].role;
    },
    name: (id) => nodes[id].name ?? '',
  };
}

test('the probe walks the accessible at the point down to the deepest, and reads whether the point is selected text', () => {
  const nodes = {
    ':1.9:/f': { role: 'frame', child: '/d' },
    ':1.9:/d': { role: 'document web', child: '/p' },
    ':1.9:/p': { role: 'paragraph', child: NULL_PATH, interfaces: ['org.a11y.atspi.Accessible', 'org.a11y.atspi.Text'], offset: 3, selections: [[0, 10]], states: 1 << 25 },
  };
  const oracle = fakeOracle(nodes);
  const p = probeAt(oracle, ':1.9:/f', 100, 40);
  assert.deepEqual(p.chain.map((n) => n.role), ['document web', 'paragraph']);
  assert.equal(p.deepest.role, 'paragraph');
  assert.deepEqual(p.deepest.states, ['showing']);
  assert.equal(p.in_selection, true);
  assert.equal(typeof p.ms, 'number');
  // no Text interface: no selection read, and the answer says so
  nodes[':1.9:/p'].interfaces = ['org.a11y.atspi.Accessible'];
  assert.equal(probeAt(fakeOracle(nodes), ':1.9:/f', 100, 40).in_selection, null);
  // a node that names itself at the point ends the walk, as does a failed call
  nodes[':1.9:/d'].child = '/d';
  assert.deepEqual(probeAt(fakeOracle(nodes), ':1.9:/f', 100, 40).chain.map((n) => n.role), ['document web']);
  const broken = fakeOracle({ ':1.9:/f': { role: 'frame', child: '/gone' } });
  const q = probeAt(broken, ':1.9:/f', 1, 1);
  assert.deepEqual(q.chain, []);
  assert.equal(q.deepest, null);
  assert.match(q.error, /no node/);
});
