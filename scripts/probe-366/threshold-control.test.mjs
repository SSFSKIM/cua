import test from 'node:test';
import assert from 'node:assert/strict';
import {ownedReference} from './threshold-control.mjs';
const event=(kind,at,value,error=0,extra={})=>({kind,at,value,error,pid:9,attribute:'AXManualAccessibility',...extra});
test('reference uses the last owned true write for the actual target, not another PID, the request start or a disabled write',()=>{
 const trace=[event('read',1,false),event('write.begin',2,true),event('write.end',3,true),event('read',4,false),event('write.end',5,true),event('write.end',6,true,0,{pid:8})];
 assert.equal(ownedReference(trace,9,'AXManualAccessibility')?.at,5);
 assert.equal(ownedReference([event('write.end',1,true)],9,'AXManualAccessibility'),null);
 assert.equal(ownedReference([event('read',1,true),event('write.end',2,true)],9,'AXManualAccessibility'),null);
 assert.equal(ownedReference([event('read',1,false),event('write.end',2,false)],9,'AXManualAccessibility'),null);
});
test('Chrome not-implemented is accepted only with the observed true read-back; other write errors are not owned',()=>{
 const a='AXEnhancedUserInterface',trace=[event('read',1,false,0,{attribute:a}),event('write.end',2,true,-25208,{attribute:a})];
 assert.equal(ownedReference(trace,9,a),null);
 trace.push(event('read',3,true,0,{attribute:a}));assert.equal(ownedReference(trace,9,a)?.at,2);
 assert.equal(ownedReference([event('read',1,false),event('write.end',2,true,-25204)],9,'AXManualAccessibility'),null);
});
