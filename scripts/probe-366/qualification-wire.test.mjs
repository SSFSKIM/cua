import test from 'node:test';
import assert from 'node:assert/strict';
import {Wire} from './wire.mjs';
test('a deliberately short observation deadline reaches the real execute request without losing lineage',async()=>{
 let sent;const wire={lineage:'before',call:async(method,params)=>{sent={method,...params};return {result:{lineage:'after'}};}};
 const before=Date.now();await Wire.prototype.execute.call(wire,'get_app_state',{pid:9},{deadlineMs:1250});const after=Date.now();
 assert.equal(sent.method,'get_app_state');assert.equal(sent.lineage,'before');assert.deepEqual(sent.args,{pid:9});
 assert.ok(sent.deadlineUnixMilliseconds>=before+1250&&sent.deadlineUnixMilliseconds<=after+1250);
 assert.equal(wire.lineage,'after');
});
