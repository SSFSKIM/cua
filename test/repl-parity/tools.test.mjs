import {test} from 'node:test';
import assert from 'node:assert/strict';
import {toolDifferences} from '../../scripts/repl-parity/tools.mjs';
test('effective tools comparison preserves every field and absence, not just names or schemas',()=>{
 const base={tools:[{name:'js',description:'base',inputSchema:{type:'object'},annotations:{readOnlyHint:true}}]};
 assert.deepEqual(toolDifferences(base,structuredClone(base)),[]);
 const candidate=structuredClone(base);candidate.tools[0].description='effective';candidate.tools[0].title=null;delete candidate.tools[0].annotations;
 assert.deepEqual(toolDifferences(base,candidate),[
 {field:'tools.0.annotations',left:{present:true,value:{readOnlyHint:true}},right:{present:false}},
 {field:'tools.0.description',left:{present:true,value:'base'},right:{present:true,value:'effective'}},
 {field:'tools.0.title',left:{present:false},right:{present:true,value:null}},
 ]);
 const changed=structuredClone(base);changed.tools[0].inputSchema.type='array';assert.equal(toolDifferences(base,changed)[0].field,'tools.0.inputSchema.type');
});
