import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dragItemsPlan,dragBoxPlan,rewardFromLogs} from './bench/drag-rules.mjs';
// Five 26 px rows, 29 px apart, starting at y=40 (MiniWoB drag-items' list geometry).
const rows=names=>names.map((text,i)=>({text,x:8,y:40+29*i,width:140,height:26}));
const NAMES=['Mavis','Kori','Mireielle','Kalli','Cherye'];
test('drag-items: every query form maps to its target index and a drop on the target row\'s far half', () => {
  const items=rows(NAMES);
  const cases=[
    ['Drag Kori to the bottom.',5],['Drag Kalli to the top.',1],['Drag Kori down by one position.',3],
    ['Drag Kalli up by one position.',3],['Drag Kori to the 4th position.',4],['Drag Cherye to the 2nd position.',2],
    ['Drag Mireielle to the 1st position.',1],['Drag Mavis to the 3rd position.',3],
  ];
  for(const [query,target] of cases) {
    const plan=dragItemsPlan(query,items),name=query.split(' ')[1],from=NAMES.indexOf(name)+1,row=items[target-1];
    assert.equal(plan.item,name,query);assert.equal(plan.fromIndex,from,query);assert.equal(plan.targetIndex,target,query);
    assert.deepEqual(plan.path[0],{x:78,y:items[from-1].y+13},query);
    assert.equal(plan.path.length,2,query);
    // Moving down the pointer ends in the target row's lower half, moving up in its upper half (jQuery UI sortable's rule).
    const to=plan.path[1];assert.equal(to.x,78,query);
    if(target>from) assert.ok(to.y>row.y+row.height/2&&to.y<row.y+row.height,query);
    else assert.ok(to.y>=row.y&&to.y<row.y+row.height/2,query);
  }
});
test('drag-items: an unknown query, an absent or ambiguous item and a no-op target are refused, not guessed', () => {
  assert.throws(()=>dragItemsPlan('Drag Kori somewhere.',rows(NAMES)),/query/);
  assert.throws(()=>dragItemsPlan('Drag Zed to the top.',rows(NAMES)),/Zed/);
  assert.throws(()=>dragItemsPlan('Drag Kori to the top.',rows(['Kori','Kori','A','B','C'])),/Kori/);
  assert.throws(()=>dragItemsPlan('Drag Kori to the 2nd position.',rows(NAMES)),/already/);
  assert.throws(()=>dragItemsPlan('Drag Kori to the 9th position.',rows(NAMES)),/position/);
});
test('drag-box: the small box\'s centre is dropped on the large box\'s centre', () => {
  const query='Drag the smaller box so that it is completely inside the larger box.';
  const plan=dragBoxPlan(query,{x:100,y:90,width:28,height:28},{x:40,y:60,width:58,height:58});
  assert.deepEqual(plan.path,[{x:114,y:104},{x:69,y:89}]);
  assert.throws(()=>dragBoxPlan('Drag the larger box.',{x:0,y:0,width:1,height:1},{x:0,y:0,width:1,height:1}),/query/);
});
test('the outcome is the episode\'s console reward line: done with its raw reward, or not done', () => {
  assert.deepEqual(rewardFromLogs([{level:'log',message:'hello'},{level:'log',message:'reward: 0.9733055555555555 (raw: 1)'}]),
    {done:true,raw:1,reward:0.9733055555555555,line:'reward: 0.9733055555555555 (raw: 1)'});
  assert.deepEqual(rewardFromLogs([{level:'log',message:'reward: -1 (raw: -1)'}]),{done:true,raw:-1,reward:-1,line:'reward: -1 (raw: -1)'});
  assert.deepEqual(rewardFromLogs([]),{done:false,raw:null,reward:null,line:null});
  assert.throws(()=>rewardFromLogs([{message:'reward: 1 (raw: 1)'},{message:'reward: 1 (raw: 1)'}]),/more than one/);
});
import vm from 'node:vm';
import dragItems from './bench/scenarios/miniwob/drag-items.mjs';
import dragBox from './bench/scenarios/miniwob/drag-box.mjs';
// A cell runs as an async-function body in the REPL; here in a VM whose `tab` records what the cell asks of it. Values
// cross back as JSON, as the harness's result marker carries them.
const plain=value=>JSON.parse(JSON.stringify(value));
const runCell=async(scenario,label,globals)=>plain(await vm.runInContext(`(async()=>{${scenario.cells.find(c=>c.label===label).code}\n})()`,vm.createContext({setTimeout,Date,Promise,...globals})));
test('the drag cells plan from the REPL\'s query and rects and send that one path to tab.cua.drag', async () => {
  const drags=[],tab={cua:{drag:async options=>{drags.push(plain(options));}}};
  const items=await runCell(dragItems,'drag',{tab,benchQuery:'Drag Kori to the bottom.',benchItems:rows(NAMES)});
  assert.deepEqual(drags,[{path:items.path}]);assert.equal(items.targetIndex,5);
  const box={x:100,y:90,width:28,height:28},large={x:40,y:60,width:58,height:58};
  const boxPlan=await runCell(dragBox,'drag',{tab,benchQuery:'Drag the smaller box so that it is completely inside the larger box.',benchBoxes:{small:box,large}});
  assert.deepEqual(drags[1],{path:[{x:114,y:104},{x:69,y:89}]});assert.deepEqual(boxPlan.path,drags[1].path);
});
test('the outcome cell re-reads the console until the reward line arrives, within its bound', async () => {
  let reads=0;
  const tab={dev:{logs:async({filter})=>{assert.equal(filter,'reward:');return ++reads<3?[]:[{message:'reward: 0.97 (raw: 1)'}];}}};
  assert.deepEqual(await runCell(dragItems,'outcome',{tab}),{done:true,raw:1,reward:0.97,line:'reward: 0.97 (raw: 1)'});
  assert.equal(reads,3);
});
test('an episode passes only when every cell succeeded and the raw reward is 1', () => {
  for(const scenario of [dragItems,dragBox]) {
    const ok=scenario.cells.map(c=>({cell:c.label,ok:true,value:c.label==='outcome'?{done:true,raw:1}:true}));
    assert.deepEqual(scenario.assert({results:ok}),{ok:true});
    const withOutcome=value=>ok.map(r=>r.cell==='outcome'?{...r,value}:r);
    assert.equal(scenario.assert({results:withOutcome({done:true,raw:-1})}).ok,false);
    assert.equal(scenario.assert({results:withOutcome({done:false,raw:null})}).ok,false);
    assert.equal(scenario.assert({results:scenario.cells.map(c=>({cell:c.label,ok:false,error:{message:'broken'}}))}).ok,false);
    assert.equal(scenario.setup.open,'goto');
    assert.match(scenario.setup.page,new RegExp(`^http://127\\.0\\.0\\.1:48731/miniwob/miniwob/${scenario.id.split('/')[1]}\\.html\\?seed=bench-${scenario.id.split('/')[1]}$`));
  }
});
test('the bench corpus is its own root, selected only by --corpus bench and run only on a live device', async () => {
  const {selectScenarioPaths,corpusRoot}=await import('../../scripts/browser-parity.mjs');
  assert.equal(corpusRoot('parity'),'test/browser-parity/scenarios');
  assert.equal(corpusRoot('bench'),'test/browser-parity/bench/scenarios');
  assert.throws(()=>corpusRoot('other'),/corpus/);
  const bench=['miniwob/drag-box.mjs','miniwob/drag-items.mjs'];
  assert.deepEqual(selectScenarioPaths(bench,{local:false,corpus:'bench'}),bench);
  assert.deepEqual(selectScenarioPaths(bench,{local:false,corpus:'bench',scenarios:'miniwob/drag-box.mjs'}),['miniwob/drag-box.mjs']);
  assert.deepEqual(selectScenarioPaths(bench,{local:false,corpus:'bench',scenarios:'test/browser-parity/bench/scenarios/miniwob/drag-items.mjs'}),['miniwob/drag-items.mjs']);
  assert.throws(()=>selectScenarioPaths(bench,{local:true,corpus:'bench'}),/live device/);
});
