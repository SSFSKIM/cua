import {test} from 'node:test';
import assert from 'node:assert/strict';
import {extractWireUnion} from './support/wire-union.mjs';
// Small independent specimen of the pinned executable's table/schema syntax.
const source=`var Rf={};G(Rf,{ReadCommand:()=>read,NavCommand:()=>nav});
var read=L("read",()=>{}); nav.type="navigate";
G(ie,{Get:()=>schema});G(schema,{commandType:()=>type});var type="get";
var zN={[ie.Get.commandType]:fn};
var visibility="visibility_get",viewport="viewport_set",management="management_call",unused="unused_schema";
var RTe={[management]:m};var zTe={[visibility]:v};var iCe={[viewport]:p};`;
test('extracts all three dispatch sources without inventing unused schemas',()=>{
  assert.deepEqual(extractWireUnion(source),['get','management_call','navigate','read','viewport_set','visibility_get']);
});
test('a newly added handler changes the union; unresolved anchors fail closed',()=>{
  assert.ok(extractWireUnion(source.replace('ReadCommand:()=>read','OtherCommand:()=>other,ReadCommand:()=>read')+'var other=L("new_command",()=>{});').includes('new_command'));
  assert.throws(()=>extractWireUnion(source.replace('G(Rf,','G(Missing,')),/Rf/);
});
