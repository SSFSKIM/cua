// Headless regression checks for the measurement kit, not the pinned engines.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as gate from './gate.mjs';

const rect = (x,y,width,height) => ({x,y,width,height});
const chain = (role,text) => [[role,null,null,[400,100,80,18],null,null,text]];
const fixture = {type:'fixture',kind:'link-same',case:'one',text:'Like (12)',anchor:rect(16,60,244,46),textRects:[rect(48,74,65,18)]};
function linkRow() {
  return {scene:'shared:link-same',at:'text',click:{stalePoint:{recordedRole:'AXStaticText'}},
    atShot:{hit:{chain:chain('AXStaticText','Like (12)')}},
    fixture:{before:fixture,pointInText:true,tailOmitted:false},
    mutations:[{type:'mutation',mutation:'textContent',before:fixture,after:{...fixture,text:'Like (13)'}}]};
}

test('text points use the actual left-aligned text, while padding remains separate', () => {
  const sky = {nodes:[{role:'AXLink',title:'Like (12)',frame:rect(416,160,244,46)}]};
  const text = gate.gateTarget(sky,fixture,'text');
  const padding = gate.gateTarget(sky,fixture,'padding');
  assert.deepEqual(text.point,{x:480.5,y:183});
  assert.deepEqual(padding.point,{x:420,y:183});
  assert.equal(text.fixture.pointInText,true);
  assert.equal(padding.fixture.pointInText,false);
});

test('an exposed AXStaticText frame supplies the text point even if the link frame excludes padding', () => {
  const sky={nodes:[{role:'AXLink',title:'Like (12)',frame:rect(448,174,65,18)},
    {role:'AXStaticText',value:'Like (12)',frame:rect(448,174,65,18)}]};
  const found=gate.gateTarget(sky,fixture,'text');
  assert.deepEqual(found.point,{x:480.5,y:183});
  assert.equal(found.node.role,'AXStaticText');
});

test('budget tail aims inside its single text line, not the span centre', () => {
  const sky = {nodes:[{role:'AXGroup',description:'Budget parent',frame:rect(416,160,500,430)}]};
  const f = {...fixture,kind:'budget',text:'Budget tail text',anchor:rect(16,60,500,430),textRects:[rect(316,95,112,18)]};
  assert.deepEqual(gate.gateTarget(sky,f,'tail').point,{x:772,y:204});
});

test('coverage requires the actual recorded role and screenshot hit, not the text variant name', () => {
  const row = linkRow();
  assert.equal(gate.validateGateRow(row).valid,true);
  row.click.stalePoint.recordedRole='AXLink';
  assert.equal(gate.validateGateRow(row).valid,false);
  row.click.stalePoint.recordedRole='AXStaticText';
  row.atShot.hit.chain=chain('AXLink','Like (12)');
  assert.equal(gate.validateGateRow(row).valid,false);
});

test('same/growing width coverage is measured and requires the textContent replacement evidence', () => {
  const row = linkRow();
  row.mutations=[];
  assert.equal(gate.validateGateRow(row).valid,false);
  row.mutations=[{mutation:'textContent',before:fixture,after:{...fixture,text:'Like (13)',textRects:[rect(48,74,95,18)]}}];
  assert.equal(gate.validateGateRow(row).valid,false);
  row.scene='shared:link-grow';
  row.fixture.before={...fixture,kind:'link-grow',text:'Inbox'};
  row.atShot.hit.chain=chain('AXStaticText','Inbox');
  row.mutations=[{mutation:'textContent',before:row.fixture.before,after:{...row.fixture.before,text:'Inbox (3)',textRects:[rect(48,74,95,18)]}}];
  assert.equal(gate.validateGateRow(row).valid,true);
});

test('budget coverage needs omitted text, a text hit at the screenshot, and exclusively byte truncation', () => {
  const row = {scene:'shared:budget',at:'tail',click:{stalePoint:{recordedRole:'AXGroup'}},
    fixture:{before:{...fixture,kind:'budget',text:'Budget tail text'},pointInText:true,tailOmitted:true},
    atShot:{hit:{chain:chain('AXStaticText','Budget tail text')}},
    observation:{timings:{budgetHit:true},truncated:{count:1}},
    mutations:[{mutation:'budget-unchanged'}]};
  assert.equal(gate.validateGateRow(row).valid,true);
  for (const flag of ['nodeCapHit','deadlineHit']) {
    row.observation.timings[flag]=true;
    assert.equal(gate.validateGateRow(row).valid,false);
    delete row.observation.timings[flag];
  }
  row.atShot.hit.chain=chain('AXGroup','Budget parent');
  assert.equal(gate.validateGateRow(row).valid,false);
  row.atShot.hit.chain=chain('AXStaticText','Budget tail text');
  row.fixture.tailOmitted=false;
  assert.equal(gate.validateGateRow(row).valid,false);
  row.fixture.tailOmitted=true;
  row.click.stalePoint.recordedRole='AXStaticText';
  assert.equal(gate.validateGateRow(row).valid,false);
  row.click.stalePoint.recordedRole='AXGroup';
  row.fixture.before.text='Not the tail';
  assert.equal(gate.validateGateRow(row).valid,false);
});

test('coverage matrix leaves missing recorded-role cases visible', () => {
  const row = {...linkRow(),head:'main',app:'cft'};
  const coverage = gate.summarizeGateCoverage([row]);
  assert.equal(coverage.complete,false);
  assert.ok(coverage.missing.includes('link-same:AXLink'));
  assert.ok(coverage.missing.includes('link-grow:AXStaticText'));
  assert.ok(!coverage.missing.includes('link-same:AXStaticText'));
});

test('coverage completes only with both actual link roles in both width cases and an evidenced byte-budget tail', () => {
  const rows=[];
  for(const scene of ['link-same','link-grow'])for(const at of ['text','padding']) {
    const row=linkRow(), before=scene==='link-same'?'Like (12)':'Inbox',after=scene==='link-same'?'Like (13)':'Inbox (3)';
    const role=at==='text'?'AXStaticText':'AXLink';
    row.scene=`shared:${scene}`;row.at=at;
    row.fixture.before={...fixture,kind:scene,text:before};row.fixture.pointInText=at==='text';
    row.atShot.hit.chain=chain(role,before);row.click.stalePoint.recordedRole=role;
    row.mutations=[{mutation:'textContent',before:row.fixture.before,after:{...row.fixture.before,text:after,textRects:[rect(48,74,scene==='link-same'?65:95,18)]}}];
    rows.push(row);
  }
  rows.push({scene:'shared:budget',click:{stalePoint:{recordedRole:'AXGroup'}},fixture:{before:{...fixture,kind:'budget',text:'Budget tail text'},pointInText:true,tailOmitted:true},
    atShot:{hit:{chain:chain('AXStaticText','Budget tail text')}},observation:{timings:{budgetHit:true},truncated:{count:1}},mutations:[{mutation:'budget-unchanged'}]});
  const coverage=gate.summarizeGateCoverage(rows);
  assert.equal(coverage.complete,true);
  assert.deepEqual(coverage.missing,[]);
  assert.ok(Object.values(coverage.counts).every(n=>n===1));
});

test('generated fixture scripts parse and beacon DOM Range bounds on load and replacement', () => {
  const source=readFileSync(new URL('./measure.mjs',import.meta.url),'utf8');
  const scriptSource=source.slice(source.indexOf('const SCRIPT = '),source.indexOf('\nconst items = '));
  const script=vm.runInNewContext(`${scriptSource}\nSCRIPT`);
  for (const kind of ['clock','lazy','spa','banner','link-same','link-grow','recreate','budget']) {
    const scripts = [...gate.gatePage(kind,script).matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
    for (const source of scripts) new vm.Script(source,{filename:`${kind}-page.js`});
    if (!kind.startsWith('link-') && kind!=='budget') continue;
    const sent=[],listeners={};
    const target={textContent:kind==='budget'?'Budget tail text':kind==='link-same'?'Like (12)':'Inbox',
      getBoundingClientRect:()=>rect(16,60,244,46)};
    const parent={...target,children:Array(91)};
    const ctx={location:{search:'?kind='+kind+'&case=one'},window:{},
      navigator:{sendBeacon:(_url,s)=>sent.push(JSON.parse(s))},
      addEventListener:(event,fn)=>{listeners[event]=fn;},
      document:{querySelector:s=>s==='#budget-parent'?parent:target,addEventListener:()=>{},
        createRange:()=>({selectNodeContents:()=>{},getClientRects:()=>[rect(48,74,target.textContent.length*8,18)]})}};
    vm.runInNewContext(scripts[0],ctx);
    listeners.load();
    assert.equal(sent[0].type,'fixture');
    assert.deepEqual(sent[0].textRects,[rect(48,74,target.textContent.length*8,18)]);
    ctx.window.__change();
    if (kind.startsWith('link-')) {
      assert.equal(sent[1].mutation,'textContent');
      assert.notEqual(sent[1].before.text,sent[1].after.text);
    }
  }
});

test('shared real-page picks exclude the toolbar and retain link content in the sample', () => {
  const sky={window:{frame:rect(0,0,600,700)},nodes:[
    {role:'AXWebArea',frame:rect(0,100,600,600)},
    {role:'AXButton',title:'Reload',frame:rect(20,40,30,30)},
    ...Array.from({length:10},(_,i)=>({role:'AXButton',title:`Page ${i}`,frame:rect(20,120+i*30,60,25)})),
    {role:'AXLink',title:'PR discussion',frame:rect(200,140,100,25)},
  ]};
  const picks=gate.pagePicks(sky,s=>s.nodes.filter(n=>['AXButton','AXLink'].includes(n.role)).map(n=>({...n,bucket:n.role})));
  assert.equal(picks.length,8);
  assert.ok(picks.every(p=>p.frame.y>=100));
  assert.ok(picks.some(p=>p.role==='AXLink'));
});

test('stillBrowser closes on a budget return and on reset failure', async () => {
  // Exercise the real function without importing the live-GUI entry point.
  const source=readFileSync(new URL('./measure.mjs',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('async function stillBrowser('),source.indexOf('/// A native app\'s still sweep:'));
  for (const failure of [false,true]) {
    let closes=0;
    const ctx={config:{},version:()=>'',stillHarness:async()=>({close:async()=>{closes++;},reset:async()=>{throw new Error('reset failed');}}),
      NEAR_CHANGES:{clock:''},URL_:'http://local/',REPS:1,NEAR_TARGETS:[['button',[],null,[]]],EDGES:['top'],
      overBudget:()=>!failure,save:()=>{}};
    const run=vm.runInNewContext(`(${fn})`,ctx);
    if (failure) await assert.rejects(run('cft'),/reset failed/); else await run('cft');
    assert.equal(closes,1);
  }
});

test('offline reader reports incomplete coverage but still counts a refusal on an invalid cell', () => {
  const root=mkdtempSync(join(tmpdir(),'p330-reader-'));
  try {
    for(const head of ['main','branch']) {
      const dir=join(root,head);mkdirSync(dir);
      const row={...linkRow(),part:'still',app:'cft',label:'link-same-text',problem:'mis-aimed'};
      if(head==='branch')row.click={error:'stalePoint',stalePoint:{reason:'newElementOverPoint',recordedRole:'AXLink'}};
      writeFileSync(join(dir,'results.json'),JSON.stringify({config:{head,group:'gate-chrome'},results:[row]}));
    }
    const p=spawnSync(process.execPath,[new URL('./offline/ab-table.mjs',import.meta.url).pathname,root],{encoding:'utf8'});
    assert.equal(p.status,0,p.stderr);
    const summary=JSON.parse(readFileSync(join(root,'summary.json'),'utf8'));
    assert.equal(summary.measuredRefusals.length,1);
    assert.equal(summary.falseRefusals.length,1);
    assert.equal(summary.coverageProblems.length,2);
    assert.equal(summary.coverage.length,2);
    assert.ok(summary.coverage.every(c=>!c.validation.complete));
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('owned child termination is awaited, including SIGKILL escalation', async () => {
  const {stopOwnedChild,childRunning}=await import('./browser-lifecycle.mjs');
  const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{}); console.log('ready'); setInterval(()=>{},1000)"],{stdio:['ignore','pipe','inherit']});
  try {
    await once(child.stdout,'data');
    assert.equal(childRunning(child),true);
    await stopOwnedChild(child,100);
    assert.equal(childRunning(child),false);
    assert.equal(child.signalCode,'SIGKILL');
    await stopOwnedChild(child,100);
  } finally {if (childRunning(child)) child.kill('SIGKILL');}
});
