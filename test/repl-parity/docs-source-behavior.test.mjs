// Execute only the committed, hash-pinned readable source fragments. No installed runtime/browser/services.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {docsSource,coreDocument,vendorCore,confirmations,auxiliary} from '../../scripts/repl-parity/docs-oracle.mjs';
// tslib's __awaiter is the only imported dependency of these two pure vendor factories.
const awaiter=async(self,args,_Promise,generator)=>{const iterator=generator.apply(self,args??[]);let step=iterator.next();while(!step.done){try{step=iterator.next(await step.value);}catch(error){step=iterator.throw(error);}}return step.value;};
function factory(name,exported,context){const pin=docsSource.files[name],source=readFileSync(new URL(`./fixtures/docs-${pin.fixture}`,import.meta.url),'utf8');assert.equal(createHash('sha256').update(source).digest('hex'),pin.sha256);return runInNewContext(source.replace(/^import .*;$/m,'').replace(/^export .*;$/m,exported),{TextEncoder,...context});}
test('policy composition and byte bounds agree with the actual pinned vendor factory',async()=>{
 const values=[' valid \npolicy ','é'.repeat(6000),'é'.repeat(6001),' \n',42,null];
 for(const value of values){
  const requestMeta={'openai/confirmation_policies':{computer_use:value}},nodeRepl={requestMeta,env:{}};
  const create=factory('create_documentation','n',{o:awaiter,nodeRepl});
  const docs=create(async name=>({'core-cua-repl':vendorCore,confirmations})[name]);
  assert.equal(await docs.read_core(),coreDocument({host:'vendor',requestMeta}));assert.equal(docs.exclude_browser_confirmations,true);
 }
 // Table 3 deliberately removes the vendor training/Orbit policy suppression, rather than accidentally losing policy.
 for(const env of ['training','orbit']){
  const create=factory('create_documentation','n',{o:awaiter,nodeRepl:{env:{CUA_REPL_BROWSER_ENV:env}}});
  assert.equal(await create(async name=>({'core-cua-repl':vendorCore,confirmations})[name]).read_core(),vendorCore);
  assert.ok(coreDocument({host:'cua'}).endsWith('\n'+confirmations));
 }
});
test('pinned emitter establishes named order, once-per-browser auxiliary, emit:false and requestMeta identity',async()=>{
 const writes=[],nodeRepl={requestMeta:{same:'value'},write:async(text,id)=>{writes.push({text,id});}};
 const create=factory('create_bootstrap_emitter','o',{e:awaiter,nodeRepl});
 const emitter=create({read_core:async()=>coreDocument({host:'vendor'}),read:async name=>{assert.equal(name,'other-browser-apis');return auxiliary;}});
 const browser={browserId:'one',documentation:async()=>'<selected one>'};
 await emitter.load_browser_documentation(browser);await emitter.emit('state',{browser});
 const expected=[{text:coreDocument({host:'vendor'}),id:'cua.core'},{text:auxiliary+'\n\n<selected one>',id:'cua.browser.one'},{text:'state',id:'cua.state'}];
 assert.deepEqual(writes,expected);
 writes.length=0;await emitter.rewrite_documentation();await emitter.emit('hidden',{browser,emit:false});assert.deepEqual(writes,[]);
 nodeRepl.requestMeta={same:'value'};await emitter.rewrite_documentation();await emitter.rewrite_documentation();assert.deepEqual(writes,expected.slice(0,2));
 writes.length=0;const other={browserId:'two',documentation:async()=>'<selected two>'};await emitter.load_browser_documentation(other);await emitter.emit('hidden',{browser:other,emit:false});assert.deepEqual(writes,[{text:'<selected two>',id:'cua.browser.two'}]);
 writes.length=0;nodeRepl.requestMeta={later:true};await emitter.rewrite_documentation();assert.deepEqual(writes,[...expected.slice(0,2),{text:'<selected two>',id:'cua.browser.two'}]);
});
