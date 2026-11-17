// Source-boundary checks for side.swift's safariAXPaths op. The hosted runner is the only place the Swift runs, so
// these pin, offline, the properties that keep the observer-effect diagnostic read-only, bounded and fully recorded.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('./side.swift',import.meta.url),'utf8');
const BEGIN='// MARK: safariAXPaths begin',END='// MARK: safariAXPaths end';
// Comments may name APIs the code must not call; only code counts.
const code=text=>text.split('\n').map(l=>l.replace(/\/\/.*$/,'')).join('\n');
function region(){
 const a=source.indexOf(BEGIN),b=source.indexOf(END);
 assert.ok(a>=0&&b>a&&source.indexOf(BEGIN,a+1)<0,'one delimited safariAXPaths region');
 return {inside:source.slice(a,b),outside:source.slice(0,a)+source.slice(b)};
}
// The body of the first `func <name>(` in text, by brace matching from its opening brace.
function body(text,name){
 const at=text.indexOf('func '+name+'(');assert.ok(at>=0,name+' declared');
 let i=text.indexOf('{',at),depth=0,start=i;
 for(;i<text.length;i++){if(text[i]==='{')depth++;else if(text[i]==='}'&&--depth===0)return {start,end:i+1,text:text.slice(start,i+1)}}
 throw Error('unbalanced '+name);
}
const REQUESTS=['AXUIElementCopyAttributeValue','AXUIElementCopyAttributeValues','AXUIElementCopyParameterizedAttributeValue','AXUIElementIsAttributeSettable','AXUIElementCopyAttributeNames','AXUIElementCopyParameterizedAttributeNames','AXUIElementGetAttributeValueCount','AXUIElementCopyActionNames','AXUIElementCopyElementAtPosition'];

test('every AX request the snapshot sends goes through its one budget-checked recorder',()=>{
 // Breaks when a new read bypasses query(): it would be neither bounded by the budget nor listed in queries/notIssued.
 const inside=code(region().inside),recorder=body(inside,'query');
 for(const api of REQUESTS){
  const hits=[...inside.matchAll(new RegExp('\\b'+api+'\\s*\\(','g'))].map(m=>m.index);
  for(const at of hits)assert.ok(at>recorder.start&&at<recorder.end,api+' called outside query()');
 }
 const first=Math.min(...REQUESTS.map(api=>recorder.text.search(new RegExp('\\b'+api+'\\s*\\('))).filter(i=>i>=0));
 assert.ok(Number.isFinite(first),'the recorder sends the requests');
 assert.match(recorder.text.slice(0,first),/guard[^\n]*<\s*limit[^\n]*else[^\n]*\{/,'the budget is checked before any request is sent');
});

test('the snapshot never writes, acts, activates, posts input or reads field text or marker bytes',()=>{
 // Breaks when the diagnostic gains a side effect on Safari or a path to serialize text or opaque marker bytes.
 const inside=code(region().inside);
 for(const forbidden of ['AXUIElementSetAttributeValue','AXUIElementPerformAction','AXUIElementPostKeyboardEvent','AXUIElementCreateSystemWide','AXTextMarkerGetBytePtr','AXTextMarkerGetLength','AXTextMarkerCreate','CGEvent','NSPasteboard','.activate(','.hide(','.unhide(','kAXValueAttribute','kAXSelectedTextAttribute'])
  assert.ok(!inside.includes(forbidden),forbidden);
 for(const attribute of ['AXValue','AXSelectedText','AXStringForTextMarkerRange','AXAttributedStringForTextMarkerRange','AXTextMarkerRangeForUIElement'])
  assert.ok(!inside.includes('"'+attribute+'"'),attribute);
});

test('identifiers are read only after a readable, non-secure classification',()=>{
 // Breaks when an identifier read moves ahead of, or out from under, the secure/unclassifiable guard.
 const inside=code(region().inside),classify=body(inside,'classify').text;
 const reads=['"AXIdentifier"','"AXDOMIdentifier"'];
 for(const name of reads){
  assert.equal(inside.split(name).length-1,1,name+' named once');
  assert.ok(classify.includes(name),name+' read inside classify()');
 }
 const guard=classify.search(/guard\s+result\s*==\s*"readable"/),firstRead=Math.min(...reads.map(r=>classify.indexOf(r)));
 assert.ok(guard>=0&&guard<firstRead,'the readable guard precedes the identifier reads');
});

test('existing ops are untouched by the new op except one dispatch branch',()=>{
 // Breaks when an existing op starts depending on the new region or accepts the new lane.
 const {inside,outside}=region(),insideCode=code(inside),outsideCode=code(outside);
 const outsideSymbols=outsideCode.replace(/"(?:[^"\\\n]|\\.)*"/g,'""');
 const declared=[...insideCode.matchAll(/^(?:final\s+)?(?:func|enum|struct|class|let|var)\s+([A-Za-z_]\w*)/gm)].map(m=>m[1]);
 assert.ok(declared.includes('safariAXPaths'));
 for(const name of declared){
  const uses=[...outsideSymbols.matchAll(new RegExp('\\b'+name+'\\b','g'))].length;
  assert.equal(uses,name==='safariAXPaths'?1:0,name+' used outside the region');
 }
 assert.match(outsideCode,/q\["op"\] as\? String == "safariAXPaths" \{\n\s*answer\.merge\(safariAXPaths\(q\)\) \{ _, new in new \}/);
 assert.ok(!body(outsideCode,'focusEvidence').text.includes('safari-no-key-ax'),'focusEvidence keeps its own lanes');
 // The region must not redefine a name the existing ops use.
 const existing=[...outsideCode.matchAll(/^func\s+([A-Za-z_]\w*)/gm)].map(m=>m[1]);
 for(const name of existing)assert.ok(!declared.includes(name),name+' redefined in the region');
});
