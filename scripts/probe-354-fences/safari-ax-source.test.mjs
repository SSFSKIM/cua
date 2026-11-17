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

test('existing ops are untouched by the region except one dispatch branch per region op',()=>{
 // Breaks when an existing op starts depending on the region or accepts a region lane.
 const {inside,outside}=region(),insideCode=code(inside),outsideCode=code(outside);
 const outsideSymbols=outsideCode.replace(/"(?:[^"\\\n]|\\.)*"/g,'""');
 const declared=[...insideCode.matchAll(/^(?:final\s+)?(?:func|enum|struct|class|let|var)\s+([A-Za-z_]\w*)/gm)].map(m=>m[1]);
 const ops=['safariAXPaths','safariLargeMarker'];
 for(const op of ops)assert.ok(declared.includes(op),op+' declared in the region');
 for(const name of declared){
  const uses=[...outsideSymbols.matchAll(new RegExp('\\b'+name+'\\b','g'))].length;
  assert.equal(uses,ops.includes(name)?1:0,name+' used outside the region');
 }
 for(const op of ops)assert.match(outsideCode,new RegExp('q\\["op"\\] as\\? String == "'+op+'" \\{\\n\\s*answer\\.merge\\('+op+'\\(q\\)\\) \\{ _, new in new \\}'));
 for(const lane of ['safari-no-key-ax','safari-large-page'])assert.ok(!body(outsideCode,'focusEvidence').text.includes(lane),'focusEvidence keeps its own lanes');
 // The region must not redefine a name the existing ops use.
 const existing=[...outsideCode.matchAll(/^func\s+([A-Za-z_]\w*)/gm)].map(m=>m[1]);
 for(const name of existing)assert.ok(!declared.includes(name),name+' redefined in the region');
});

// safariLargeMarker: after the actual type_text on the large page, the marker chain comes first and survives the size check.
const large=()=>body(code(region().inside),'safariLargeMarker').text;

test('the large-page op reads the marker chain right after finding the web area, with no focus or flag read before it',()=>{
 // Breaks when a focus path, focus walk, flag read or any other walk is inserted ahead of the marker observation.
 const text=large(),at=text.indexOf('.textMarker(');
 assert.ok(at>=0,'the marker chain is read');
 const head=text.slice(0,at);
 assert.deepEqual([...head.matchAll(/"(AX\w+)"/g)].map(m=>m[1]),['AXFocusedWindow','AXMainWindow','AXWindows'],'only front-window discovery is named before the marker');
 assert.deepEqual([...head.matchAll(/goal:\s*\.(\w+)/g)].map(m=>m[1]),['webArea'],'only the web-area walk precedes the marker');
 assert.ok(!text.includes('.focused'),'no focus walk');
});

test('the large group is found after the marker and its children are counted once without being registered or walked',()=>{
 // Breaks when the size check moves ahead of the marker, registers the group's children or walks into them.
 const text=large(),marker=text.indexOf('.textMarker('),search=text.search(/goal:\s*\.domIdentifier/);
 assert.ok(search>marker,'the group search follows the marker');
 assert.deepEqual([...text.matchAll(/goal:\s*\.(\w+)/g)].map(m=>m[1]),['webArea','domIdentifier'],'two bounded walks, none from the group');
 const children=[...text.slice(search).matchAll(/query\([^\n]*"AXChildren"[^\n]*\)/g)].map(m=>m[0]);
 assert.equal(children.length,1,'one AXChildren read of the group');
 assert.match(children[0],/arrayCap:\s*0\b/,'no child of the group is registered');
});

test('the marker result is recorded before the size check and no later path returns without it',()=>{
 // Breaks when a size-check failure returns early or the marker is recorded only after the size check.
 const text=large(),marker=text.indexOf('.textMarker('),search=text.search(/goal:\s*\.domIdentifier/);
 const recorded=text.search(/result\["textMarker"\]\s*=\s*marker/);
 assert.ok(recorded>marker&&recorded<search,'recorded between the marker read and the size check');
 const returns=[...text.slice(marker).matchAll(/\breturn\b/g)].length;
 assert.equal(returns,1,'only the final return follows the marker read');
 assert.match(text.slice(marker),/return result\s*\}\s*$/);
});
