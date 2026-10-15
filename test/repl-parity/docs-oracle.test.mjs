import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {docsSource, transformCoreDocument, coreDocument, normalizeSelectedBrowserDocument, projectDocumentationRow, transformDocumentContent, assertProfileObservation} from '../../scripts/repl-parity/docs-oracle.mjs';
const fixture=name=>readFileSync(new URL(`./fixtures/docs-${name}`,import.meta.url),'utf8');
const hash=value=>createHash('sha256').update(value).digest('hex');

test('core transform preserves every surviving source byte and refuses unpinned input',()=>{
 const source=fixture('vendor-core.md'),expected=fixture('cua-core.md');
 assert.equal(transformCoreDocument(source),expected);
 assert.throws(()=>transformCoreDocument(source.replace('persistent','temporary')),/pin|source/i);
 assert.throws(()=>transformCoreDocument(source+'\n'),/pin|source/i);
 assert.equal(coreDocument({host:'vendor'}),source+'\n'+fixture('vendor-confirmations.md'));
 assert.equal(coreDocument({host:'cua'}),expected+'\n'+fixture('vendor-confirmations.md'));
});
test('fixtures independently match the readable vendor source when explicitly supplied',()=>{
 const pins=JSON.parse(fixture('source-pins.json'));
 for(const entry of Object.values(pins.files))assert.equal(hash(fixture(entry.fixture)),entry.sha256);
 const root=process.env.CUA_PARITY_READABLE_SOURCE;
 if(root)for(const entry of Object.values(pins.files)){
  const source=readFileSync(`${root}/${entry.path}`);assert.equal(hash(source),entry.sourceSha256??entry.sha256,entry.path);
  if(entry.lines)assert.equal(source.toString().split(/(?<=\n)/).slice(entry.lines[0]-1,entry.lines[1]).join(''),fixture(entry.fixture));
 }
 assert.equal(docsSource.release,pins.release);
});
test('confirmation overrides count UTF-8 bytes, preserve whitespace, and reject invalid shapes',()=>{
 const base=fixture('cua-core.md'),policy=fixture('vendor-confirmations.md');
 const cases=[[' \nfixture policy \n ',true],['é'.repeat(6000),true],['é'.repeat(6001),false],['  \n',false],[7,false],[null,false]];
 for(const [value,valid] of cases)assert.equal(coreDocument({host:'cua',requestMeta:{'openai/confirmation_policies':{computer_use:value}}}),base+'\n'+(valid?value:policy));
 for(const value of [[],null,'policy'])assert.equal(coreDocument({host:'cua',requestMeta:{'openai/confirmation_policies':value}}),base+'\n'+policy);
 assert.throws(()=>coreDocument({host:'unknown'}),/host/i);
});
const selected=(name='Fixture browser',id='extension:fixture')=>`# Selected Browser\n- Name: ${name}\n- Type: extension\n- ID: ${id}\n- Service: cua browser service 0.1.0\nKeep extension:fixture in this prose and https://example.invalid/Fixture browser.\n`;
test('selected-browser projection changes only explicit header identity slots',()=>{
 const actual=selected(),canonical=normalizeSelectedBrowserDocument(actual);
 assert.equal(canonical,selected('<browser-name>','<browser-id>'));
 assert.equal(normalizeSelectedBrowserDocument(selected('Other','extension:other')),canonical);
 assert.notEqual(normalizeSelectedBrowserDocument(actual.replace('Keep','DROP')),canonical);
 assert.notEqual(normalizeSelectedBrowserDocument(actual.replace('0.1.0','0.2.0')),canonical);
 assert.notEqual(normalizeSelectedBrowserDocument(actual.replace('extension\n','cdp\n')),canonical);
 assert.throws(()=>normalizeSelectedBrowserDocument(actual.replace('- ID:','- Unknown:')),/header|identity/i);
});
test('row projection is narrowly scoped to docs cases and complete pinned core blocks',()=>{
 const raw={case:'cells/documentation/first-call-core-policy-bytes',cell:'first',content:[{type:'text',text:coreDocument({host:'vendor'})},{type:'text',text:'literal '+fixture('vendor-core.md')}],isError:false};
 const result=projectDocumentationRow(raw,{host:'vendor'});
 assert.equal(result.content[0].text,coreDocument({host:'cua'}));assert.deepEqual(result.content[1],raw.content[1]);assert.notStrictEqual(result,raw);
 assert.deepEqual(projectDocumentationRow({...raw,case:'cells/output/write-values'},{host:'vendor'}),{...raw,case:'cells/output/write-values'});
 const drift=structuredClone(raw);drift.content[0].text=drift.content[0].text.replace('Prefer purpose-built','Ignore purpose-built');
 assert.deepEqual(projectDocumentationRow(drift,{host:'vendor'}),drift);
});
const observation=()=>({serverInfo:{name:'cua-repl-host',version:'0.1.0'},_meta:{'cua/replHost':{host:'cua',version:'0.1.0'}},executionFacts:{ownNode:{path:'/fixture/node',version:'v24.0.0'}},backends:[{instanceId:'fixture',family:'chrome',profileName:'Fixture',tabCount:null},{family:'edge'}],tabCounts:false,teardown:{confirmed:true}});
test('profiles proof requires the bounded listing host answer, safe inventory and confirmed teardown',()=>{
 assertProfileObservation(observation(),{host:'cua'});
 for(const mutate of [x=>delete x._meta,x=>x.serverInfo.name='node_repl',x=>delete x.executionFacts,x=>x.backends[0].url='https://private.invalid',x=>x.backends[0].title='private',x=>x.backends[0].tabCount=3,x=>x.tabCounts=true,x=>x.teardown.confirmed=false,x=>x.backends[0].instanceId='maws:fixture']){
  const bad=observation();mutate(bad);assert.throws(()=>assertProfileObservation(bad,{host:'cua'}));
 }
 const vendor=observation();vendor.serverInfo={name:'node_repl',version:'vendor'};vendor._meta={};delete vendor.executionFacts;assertProfileObservation(vendor,{host:'vendor'});
 assert.throws(()=>assertProfileObservation(vendor,{host:'cua'}));
});

test('callers can explicitly scope identical content projection to other documented bootstrap cells',()=>{
 const content=[{type:'text',text:coreDocument({host:'vendor'})},{type:'text',text:selected()}];
 assert.deepEqual(transformDocumentContent(content,{host:'vendor'}),[{type:'text',text:coreDocument({host:'cua'})},{type:'text',text:normalizeSelectedBrowserDocument(selected())}]);
 const row={case:'api/cua/rewritedocumentation',cell:'rewrite',content};
 assert.deepEqual(projectDocumentationRow(row,{host:'vendor'}),row,'caller must explicitly authorize the additional scope');
});

test('explicit content projection handles consecutive complete bootstrap documents without rewriting suffixes',()=>{
 const vendor=coreDocument({host:'vendor'}),own=coreDocument({host:'cua'});
 const project=text=>transformDocumentContent([{type:'text',text}],{host:'vendor'})[0].text;
 assert.equal(project(vendor+vendor+'tail'),own+own+'tail');
 assert.equal(project(vendor+'tail'+vendor),own+'tail'+vendor,'a document after unrelated output is not an anchored bootstrap');
 const corrupt=vendor.replace('purpose-built','changed-purpose');
 assert.equal(project(vendor+corrupt+'tail'),own+corrupt+'tail','second core corruption must remain visible');
 const corruptPolicy=vendor.replace('Computer Use Confirmations Policy','Changed Confirmations Policy');
 assert.equal(project(vendor+corruptPolicy),own+corruptPolicy,'second policy corruption must remain visible');
 assert.notEqual(project(vendor+vendor+'changed tail'),own+own+'tail');
});
