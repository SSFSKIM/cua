import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseOtool, stringRefs, calls, parseSections, makeReader} from '../disasm.mjs';

const DIS = `/x/bin:
(__TEXT,__text) section
_reader_fn:
0000000100001000	stp	x29, x30, [sp, #-0x10]!
0000000100001004	adrp	x8, 1 ; 0x100002000
0000000100001008	add	x8, x8, #0x10
000000010000100c	adrp	x9, 1 ; 0x100002000
0000000100001010	add	x1, x9, #0x20
0000000100001014	bl	0x100003000 ; symbol stub for: _proc_pidinfo
0000000100001018	bl	__RNvMs_3std7process5Child4kill
000000010000101c	ret
__RNvMs_3std7process5Child4kill:
0000000100001020	mov	w1, #0x9
0000000100001024	bl	0x100003010 ; symbol stub for: _kill
`;

test('parseOtool splits functions and instructions', () => {
  const fns = parseOtool(DIS);
  assert.deepEqual(fns.map(f => f.name), ['_reader_fn', '__RNvMs_3std7process5Child4kill']);
  assert.equal(fns[0].instructions.length, 8);
  assert.deepEqual(fns[0].instructions[1], {addr: 0x100001004, op: 'adrp', args: 'x8, 1', comment: '0x100002000'});
});

test('stringRefs resolves adrp+add pairs including a different destination register', () => {
  const fn = parseOtool(DIS)[0];
  assert.deepEqual(stringRefs(fn), [0x100002010, 0x100002020]);
});

test('calls lists stub and direct symbol targets', () => {
  const fns = parseOtool(DIS);
  assert.deepEqual(calls(fns[0]), ['_proc_pidinfo', '__RNvMs_3std7process5Child4kill']);
  assert.deepEqual(calls(fns[1]), ['_kill']);
});

test('makeReader reads printable bytes at a virtual address through the section map', () => {
  const otoolL = `Section
  sectname __const
   segname __TEXT
      addr 0x0000000100002000
      size 0x0000000000000040
    offset 8192
`;
  const sections = parseSections(otoolL);
  assert.deepEqual(sections, [{sectname: '__const', segname: '__TEXT', addr: 0x100002000, size: 0x40, offset: 8192}]);
  const buf = Buffer.alloc(8192 + 0x40, 0);
  buf.write('chrome-native-hosts-v2.json\u0001', 8192 + 0x10, 'latin1');
  const read = makeReader(buf, sections);
  assert.equal(read(0x100002010, 64), 'chrome-native-hosts-v2.json');
  assert.equal(read(0x100009999, 8), null);
});

test('literalAddresses and pointerTables find a literal and the base of the enum table indexing it', async () => {
  const {literalAddresses, pointerTables} = await import('../disasm.mjs');
  const sections = [
    {sectname: '__const', segname: '__TEXT', addr: 0x100001000, size: 0x100, offset: 0x1000},
    {sectname: '__const', segname: '__DATA_CONST', addr: 0x100002000, size: 0x40, offset: 0x2000},
  ];
  const buf = Buffer.alloc(0x2040, 0);
  buf.write('alpha_codebeta_code', 0x1010, 'latin1');
  // chained-fixup style slots: low 36 bits = offset from the image base; slot 0 unrelated (zero), slots 1..2 the table
  buf.writeUInt32LE(0x1010, 0x2008); buf.writeUInt32LE(0x80000000, 0x200c);
  buf.writeUInt32LE(0x101a, 0x2010);
  const [beta] = literalAddresses(buf, sections, 'beta_code');
  assert.equal(beta, 0x10000101a);
  assert.deepEqual(pointerTables(buf, sections, beta), [{base: 0x100002008, slot: 0x100002010}]);
  assert.deepEqual(literalAddresses(buf, sections, 'gamma'), []);
});
