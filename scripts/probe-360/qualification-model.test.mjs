import test from 'node:test';import assert from 'node:assert/strict';
import {plan,classify,calibrate,summarize,setupReasons,expected,calKey,ENGINE_REF,MAIN_REF,EDITORS,KEYS,DELAYS} from './qualification-model.mjs';
import {layout} from './qualification-page.mjs';

const OWNER={pageId:'a'.repeat(32),timeOrigin:123,ownerEpoch:1};
const metric=(top=0,left=0,o={})=>({top,left,height:232,width:520,clientHeight:232,clientWidth:520,...o});
// Initial scroll the fixture establishes for an editor/key, with extents as the page reports them.
function initialScroll(editor,key){
 const L=layout(editor,key),doc=metric(0,0,{height:700,clientHeight:700});
 const field=L.kind==='seed'?metric():editor==='input'?metric(0,7000,{width:15400,height:44,clientHeight:44}):metric(L.scrollTop,0,{height:2896});
 return {field,ancestors:[metric(0,0,{height:260,clientHeight:260}),metric(0,0,{height:300,clientHeight:300}),doc],document:doc};
}
const moveScroll=(s,d)=>({...s,field:{...s.field,...d}});
// Build a recorded row. final: {selection,direction,scroll}; everything else defaults to a clean, undisturbed trial.
function row({editor='textarea',key='Left',scene='foreground',engine='fix',rep=1,final={},mutate=()=>{},ms=40}={}){
 const L=layout(editor,key),fg=scene==='foreground',init=initialScroll(editor,key);
 const st=(o={})=>({...OWNER,cmd:1,textHash:L.textHash,textLength:L.textLength,selection:[L.caret,0],direction:'none',focused:true,documentHasFocus:fg,visibility:'visible',scroll:init,trace:[],...o});
 const full=(o={})=>({...st({documentHasFocus:true,...o}),text:L.text,fixture:{kind:L.kind,textLength:L.textLength,textHash:L.textHash,initial:{selection:[L.caret,0],scroll:init},scrollSetup:{reached:true}}});
 const fin=st({delay:1000,...final});
 const r={id:['fix','main'].includes(engine)?[engine,scene,editor,key].join('/')+'/'+rep:'',cell:[engine,scene,editor,key].join('/'),engine,scene,editor,key,rep,owner:OWNER,
  foregroundReset:full(),foregroundPrepare:full(),setup:st(),armed:st(),
  samples:DELAYS.map(d=>d===1000?fin:st({delay:d,...(d>=250?final:{})})),
  identityBefore:{windowTitle:'probe354:'+OWNER.pageId+' - Firefox',windowID:7},identityAfter:{windowTitle:'probe354:'+OWNER.pageId+' - Firefox',windowID:7},
  watch:{complete:true,samples:[{frontmostPid:fg?10:20,orderReadable:true,mainLoopAgeMs:3,targetAboveCover:false}]},action:{durationMs:ms,error:null},targetPid:10,coverPid:20};
 mutate(r);return r;
}
// Rows whose key took full effect. seed keys: the expected selection; nav keys: given moves.
const SEEDFIN={'Left':{selection:[28,0]},'alt+Left':{selection:[24,0]},'cmd+Left':{selection:[0,0]},'cmd+shift+Left':{selection:[0,29],direction:'backward'}};
const fgSeed=(key,o={})=>row({key,final:SEEDFIN[key],...o});
const homeScroll=(editor='textarea')=>moveScroll(initialScroll(editor,'Home'),{top:0});

test('plan: constants, denominators, order and shape',()=>{
 assert.equal(ENGINE_REF,'f066023e6e8f91dc3e1570b993bfda8f2f45a9aa');assert.equal(MAIN_REF,'c7eee72403d64c420231ce59baa445524032102f');
 assert.deepEqual(DELAYS,[0,50,250,1000]);assert.equal(EDITORS.length*KEYS.length,32);
 const s=plan(true),f=plan(false);assert.equal(s.length,80);assert.equal(f.length,1600);
 for(const rows of [s,f]){
  assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
  assert.deepEqual(Object.keys(rows[0]),['id','cell','engine','scene','editor','key','rep']);
  for(const r of rows.filter(r=>r.engine==='main'))assert.ok(['contenteditable','compose'].includes(r.editor)&&r.scene==='background');
 }
 const cnt=(rows,e,sc)=>rows.filter(r=>r.engine===e&&r.scene===sc).length;
 assert.deepEqual([cnt(f,'fix','foreground'),cnt(f,'fix','background'),cnt(f,'main','background'),cnt(f,'main','foreground')],[640,640,320,0]);
 // every background row follows its repetition's foreground control, so calibration exists when it is measured
 const at=new Map(f.map((r,i)=>[r.id,i]));
 for(const r of f.filter(r=>r.scene==='background'))assert.ok(at.get('fix/foreground/'+r.editor+'/'+r.key+'/'+r.rep)<at.get(r.id));
 assert.deepEqual(f.filter(r=>r.rep===1).map(r=>r.scene).join().replace(/foreground,/g,'').startsWith('background'),true);
 assert.notDeepEqual(f.slice(0,3).map(r=>r.id),f.filter(r=>r.rep===2).slice(0,3).map(r=>r.id));
});

test('independent expectations of the four original keys, none for navigation',()=>{
 assert.deepEqual([expected('Left'),expected('alt+Left'),expected('cmd+Left'),expected('cmd+shift+Left'),expected('Home')],[[28,0],[24,0],[0,0],[0,29],null]);
});

test('seed keys: a working background row passes against its valid control and the exact expectation',()=>{
 for(const k of ['Left','alt+Left','cmd+Left','cmd+shift+Left']){
  const cal=calibrate(fgSeed(k));assert.equal(cal.status,'calibrated');assert.equal(cal.anyEffect,true);
  const s=classify(fgSeed(k,{scene:'background'}),cal);assert.equal(s.outcome,'pass');assert.equal(s.effect,true);assert.equal(s.safePass,true);
 }
});

test('no-op baseline vs working fix: unchanged caret is a failure, never consumption',()=>{
 const cal=calibrate(fgSeed('alt+Left'));
 const noop=classify(row({key:'alt+Left',scene:'background',final:{selection:[29,0]}}),cal);
 assert.equal(noop.outcome,'fail');assert.equal(noop.effect,false);assert.ok(noop.reasons.includes('selection-mismatch')&&noop.reasons.includes('expectation-mismatch'));
 // the key's own expectation is independent of the control: a control that agrees with a wrong landing is invalid
 const wrongControl=calibrate(row({key:'alt+Left',final:{selection:[23,0]}}));
 assert.equal(wrongControl.status,'invalid');assert.match(wrongControl.reasons[0],/contradicts-independent-expectation/);
 const dep=classify(row({key:'alt+Left',scene:'background',final:{selection:[23,0]}}),wrongControl);assert.equal(dep.outcome,'uncalibrated');
});

test('selection direction must match when the control selected a range',()=>{
 const cal=calibrate(fgSeed('cmd+shift+Left'));
 const s=classify(row({key:'cmd+shift+Left',scene:'background',final:{selection:[0,29],direction:'forward'}}),cal);
 assert.equal(s.outcome,'fail');assert.deepEqual(s.reasons,['direction-mismatch']);
});

test('nav keys: scroll-only control; background must reproduce the moved axis within tolerance',()=>{
 const fgHome=row({key:'Home',final:{scroll:homeScroll()}}),cal=calibrate(fgHome);
 assert.equal(cal.status,'calibrated');assert.deepEqual(cal.moved,['field.top']);assert.equal(cal.selectionChanged,false);
 const pass=classify(row({key:'Home',scene:'background',final:{scroll:moveScroll(initialScroll('textarea','Home'),{top:1})}}),cal);
 assert.equal(pass.outcome,'pass');
 // unchanged scroll with an unchanged selection is exactly what a lost key looks like
 const lost=classify(row({key:'Home',scene:'background'}),cal);assert.equal(lost.outcome,'fail');assert.deepEqual(lost.reasons,['scroll-mismatch:field.top']);
 const off=classify(row({key:'Home',scene:'background',final:{scroll:moveScroll(initialScroll('textarea','Home'),{top:40})}}),cal);assert.equal(off.outcome,'fail');
 // matching scroll but a moved caret also fails: selection is judged for every key
 const moved=classify(row({key:'Home',scene:'background',final:{selection:[0,0],scroll:homeScroll()}}),cal);assert.deepEqual(moved.reasons,['selection-mismatch']);
});

test('nav keys: selection-and-scroll control requires both; caret-only control ignores scroll differences',()=>{
 const L=layout('textarea','PageDown'),fin={selection:[L.caret+1500,0],scroll:moveScroll(initialScroll('textarea','PageDown'),{top:L.scrollTop+216})};
 const cal=calibrate(row({key:'PageDown',final:fin}));assert.deepEqual([cal.selectionChanged,cal.moved],[true,['field.top']]);
 assert.equal(classify(row({key:'PageDown',scene:'background',final:fin}),cal).outcome,'pass');
 assert.equal(classify(row({key:'PageDown',scene:'background',final:{selection:fin.selection}}),cal).outcome,'fail');
 const calCaret=calibrate(row({key:'End',final:{selection:[layout('textarea','End').caret+22,0]}}));assert.deepEqual(calCaret.moved,[]);
 const bg=classify(row({key:'End',scene:'background',final:{selection:[layout('textarea','End').caret+22,0],scroll:moveScroll(initialScroll('textarea','End'),{top:70})}}),calCaret);
 assert.equal(bg.outcome,'pass');
});

test('notApplicable: valid control with no effect, for itself and dependents; never a pass or failure',()=>{
 const fgInput=row({editor:'input',key:'PageUp'}),cal=calibrate(fgInput);
 assert.equal(cal.status,'calibrated');assert.equal(cal.anyEffect,false);
 const self=classify(fgInput);assert.equal(self.outcome,'notApplicable');assert.equal(self.effect,null);assert.equal(self.naReason,'foreground-control-no-dom-effect');
 const dep=classify(row({editor:'input',key:'PageUp',scene:'background'}),cal);
 assert.equal(dep.outcome,'notApplicable');assert.equal(dep.notApplicable,true);assert.equal(dep.safePass,false);
 assert.equal(classify(row({editor:'input',key:'PageUp',scene:'background'}),cal).outcome,'notApplicable');
});

test('a background key that changes the DOM against a no-op foreground control is a failure, never N/A',()=>{
 const cal=calibrate(row({editor:'input',key:'PageUp'}));assert.equal(cal.anyEffect,false);
 const bg=(o)=>classify(row({editor:'input',key:'PageUp',scene:'background',...o}),cal);
 const sel=bg({final:{selection:[0,0]}});
 assert.equal(sel.outcome,'fail');assert.equal(sel.notApplicable,false);assert.equal(sel.effect,false);assert.deepEqual(sel.reasons,['background-effect-despite-foreground-noop:selection']);
 const scr=bg({final:{scroll:moveScroll(initialScroll('input','PageUp'),{left:100})}});
 assert.equal(scr.outcome,'fail');assert.deepEqual(scr.reasons,['background-effect-despite-foreground-noop:scroll']);
 // a change seen only at an earlier sample is still an effect of this trial
 assert.equal(bg({mutate:r=>{r.samples[1].selection=[0,0]}}).outcome,'fail');
 // missing control stays uncalibrated; an unchanged trial stays N/A
 assert.equal(classify(row({editor:'input',key:'PageUp',scene:'background',final:{selection:[0,0]}}),null).outcome,'uncalibrated');
 assert.equal(bg({}).outcome,'notApplicable');
});

test('N/A cannot hide wrong text, focus loss, errors or safety violations',()=>{
 const cal=calibrate(row({editor:'input',key:'PageUp'}));
 const cases={
  'wrong-text':r=>{r.samples[3].textHash='deadbeef'},
  'editor-focus-lost':r=>{r.samples[1].focused=false},
  'action-error':r=>{r.action.error={message:'boom'}},
  'side-effect-observed':r=>{r.watch.samples.push({frontmostPid:10,orderReadable:true,mainLoopAgeMs:3})},
 };
 for(const [reason,m] of Object.entries(cases)){
  const s=classify(row({editor:'input',key:'PageUp',scene:'background',mutate:m}),cal);
  assert.equal(s.outcome,'fail',reason);assert.ok(s.reasons.includes(reason),reason);assert.equal(s.notApplicable,false);
 }
 // and a hard failure fails even with no calibration at all
 assert.equal(classify(row({key:'Home',scene:'background',mutate:cases['editor-focus-lost']}),null).outcome,'fail');
});

test('missing or invalid foreground control is uncalibrated, never N/A or pass',()=>{
 const bg=row({key:'Left',scene:'background',final:{selection:[28,0]}});
 for(const c of [null,undefined]){const s=classify(bg,c);assert.equal(s.outcome,'uncalibrated');assert.equal(s.calibration,'missing');assert.equal(s.notApplicable,false);assert.equal(s.effect,null)}
 const badFg=fgSeed('Left',{mutate:r=>{r.setup.selection=[3,0]}});
 assert.equal(calibrate(badFg).status,'invalid');assert.equal(classify(bg,badFg).outcome,'uncalibrated');
 // a raw foreground row is accepted too; a control for another cell is refused
 assert.equal(classify(bg,fgSeed('Left')).outcome,'pass');
 assert.equal(classify(bg,fgSeed('alt+Left')).outcome,'uncalibrated');
 assert.equal(classify(bg,fgSeed('Left',{rep:2})).outcome,'uncalibrated');
 // controls that lose the foreground are invalid calibration
 assert.equal(calibrate(fgSeed('Left',{mutate:r=>{r.watch.samples[0].frontmostPid=20}})).status,'invalid');
 assert.equal(calibrate(fgSeed('Left',{mutate:r=>{r.samples[0].documentHasFocus=false}})).status,'invalid');
});

test('control and trial must be comparable: scroll start and extents',()=>{
 const cal=calibrate(row({key:'Home',final:{scroll:homeScroll()}}));
 const shifted=row({key:'Home',scene:'background',final:{scroll:homeScroll()},mutate:r=>{const s=moveScroll(initialScroll('textarea','Home'),{top:1000});r.prepare=null;r.foregroundPrepare.scroll=s;r.setup.scroll=s;r.armed.scroll=s;r.samples.forEach(x=>{x.scroll=s});r.foregroundPrepare.fixture.initial.scroll=s}});
 assert.equal(classify(shifted,cal).outcome,'uncalibrated');
 const taller=row({key:'Home',scene:'background',final:{scroll:homeScroll()},mutate:r=>{const s=moveScroll(initialScroll('textarea','Home'),{height:3000});for(const x of [r.foregroundPrepare,r.setup,r.armed,...r.samples])x.scroll=moveScroll(x.scroll,{height:3000})}});
 assert.equal(classify(taller,cal).outcome,'uncalibrated');
});

test('setup and calibration checks are explicit and invalidate (not fail) a trial',()=>{
 const cal=calibrate(fgSeed('Left'));
 const cases={
  ownerConsistent:r=>{r.samples[2].ownerEpoch=2},
  identity:r=>{r.identityAfter.windowID=9},
  samplesComplete:r=>{r.samples.pop()},
  setupExact:r=>{r.setup.selection=[3,0]},
  fixtureDeterministic:r=>{r.foregroundPrepare.text='not the fixture'},
  scrollSetupReached:r=>{r.foregroundPrepare.fixture.scrollSetup.reached=false},
  setupScrollStable:r=>{r.setup.scroll=moveScroll(r.setup.scroll,{top:30})},
  armUnchanged:r=>{r.armed.selection=[1,0]},
  extentsStable:r=>{r.samples[1].scroll=moveScroll(r.samples[1].scroll,{height:999})},
  watchComplete:r=>{r.watch.complete=false},
  problemFree:r=>{r.problem='fixture command expired'},
  stagesPresent:r=>{delete r.armed},
 };
 for(const [check,m] of Object.entries(cases)){
  const s=classify(row({key:'Left',scene:'background',final:{selection:[28,0]},mutate:m}),cal);
  assert.equal(s.outcome,'invalid',check);assert.equal(s.scorable,false);assert.ok(s.setupFailed.includes(check==='stagesPresent'?'ownerConsistent':check),check+' '+s.setupFailed);
 }
 // invalid owner (a different page answered)
 const o=classify(row({key:'Left',scene:'background',final:{selection:[28,0]},mutate:r=>{r.samples[3].pageId='b'.repeat(32)}}),cal);assert.equal(o.outcome,'invalid');
 // interior scroll is required for long fixtures
 const flat=row({key:'Home',mutate:r=>{for(const x of [r.foregroundPrepare,r.setup,r.armed,...r.samples])x.scroll=moveScroll(x.scroll,{top:0})}});
 assert.ok(classify(flat).setupFailed.includes('setupInterior'));assert.equal(calibrate(flat).status,'invalid');
});

test('setupReasons: the pre-action checks, needing no samples, agree with classify',()=>{
 const pre=r=>{const x=structuredClone(r);delete x.samples;delete x.watch;delete x.identityAfter;delete x.action;return x};
 assert.deepEqual(setupReasons(pre(row({key:'Left'}))),[]);
 assert.deepEqual(setupReasons(pre(row({key:'Home',scene:'background'}))),[]);
 const cases={
  ownerConsistent:r=>{r.setup.ownerEpoch=2},
  fixtureDeterministic:r=>{r.foregroundPrepare.text='x'},
  scrollSetupReached:r=>{r.foregroundReset.fixture.scrollSetup.reached=false},
  setupExact:r=>{r.setup.selection=[3,0]},
  setupScrollStable:r=>{r.setup.scroll=moveScroll(r.setup.scroll,{top:30})},
  armUnchanged:r=>{r.armed.selection=[1,0]},
  problemFree:r=>{r.problem='x'},
 };
 for(const [check,m] of Object.entries(cases)){
  const r=row({key:'Left',mutate:m});
  assert.ok(setupReasons(pre(r)).includes(check),check);assert.ok(classify(r).setupFailed.includes(check),check);
 }
 const flat=row({key:'Home',mutate:r=>{for(const x of [r.foregroundPrepare,r.setup,r.armed,...r.samples])x.scroll=moveScroll(x.scroll,{top:0})}});
 assert.ok(setupReasons(pre(flat)).includes('setupInterior'));
 assert.ok(setupReasons({}).length>0);
});

test('cleanup after lease release: owner/focus/text corruption fails; selection/scroll drift is reported apart',()=>{
 const cal=calibrate(fgSeed('Left')),mk=m=>row({key:'Left',scene:'background',final:{selection:[28,0]},mutate:r=>{r.cleanup={...r.samples[3]};m(r.cleanup)}});
 for(const m of [c=>{c.focused=false},c=>{c.textHash='deadbeef'},c=>{c.pageId='b'.repeat(32)},c=>{c.error='x'}]){
  const s=classify(mk(m),cal);assert.equal(s.outcome,'fail');assert.ok(s.reasons.includes('cleanup-corrupted'));assert.equal(s.cleanupCorrupted,true);
 }
 const drift=classify(mk(c=>{c.selection=[0,0]}),cal);assert.equal(drift.outcome,'pass');assert.equal(drift.cleanupChanged,true);assert.equal(drift.cleanupCorrupted,false);
 assert.equal(classify(mk(()=>{}),cal).cleanupChanged,false);
 const na=classify(row({editor:'input',key:'PageUp',scene:'background',mutate:r=>{r.cleanup={...r.samples[3],focused:false}}}),calibrate(row({editor:'input',key:'PageUp'})));
 assert.equal(na.outcome,'fail');
});

test('field focus loss is a scored failure even when selection matches',()=>{
 const cal=calibrate(fgSeed('Left'));
 const s=classify(row({key:'Left',scene:'background',final:{selection:[28,0]},mutate:r=>{r.samples[3].focused=false}}),cal);
 assert.equal(s.outcome,'fail');assert.equal(s.editorFocusLost,true);assert.equal(s.effect,false);
});

test('matchByDelay reports when the effect appeared; cleanup drift is informational',()=>{
 const cal=calibrate(fgSeed('Left'));
 const r=row({key:'Left',scene:'background',final:{selection:[28,0]},mutate:r=>{r.samples[0].selection=[29,0];r.samples[1].selection=[29,0];r.cleanup={...r.samples[3],selection:[27,0]}}});
 const s=classify(r,cal);assert.deepEqual(s.matchByDelay,{0:false,50:false,250:true,1000:true});assert.equal(s.outcome,'pass');assert.equal(s.cleanupChanged,true);
});

// A complete synthetic run: every planned row, working keys where an effect exists.
function fullRows(smoke,{skip=()=>false,tweak=()=>{}}={}){
 const out=[];
 for(const p of plan(smoke)){
  if(skip(p))continue;
  const fin=SEEDFIN[p.key]??(p.editor==='input'&&(p.key==='PageUp'||p.key==='PageDown')?{}:{scroll:moveScroll(initialScroll(p.editor,p.key),p.editor==='input'?{left:0}:{top:0})});
  const r=row({...p,final:fin,ms:10+out.length%7});r.id=p.id;tweak(r,p);out.push(r);
 }
 return out;
}

test('summarize: full denominator, N/A counts, per-cell action percentiles, coverage independent of effect',()=>{
 const rows=fullRows(true),s=summarize(rows,true);
 assert.equal(s.coverage.complete,true);assert.deepEqual([s.planned,s.recorded,s.denominator.attempted,s.denominator.missing],[80,80,80,0]);
 // the single-line input has no paging effect: PageUp/PageDown x (fg + fix bg) are the only N/A cells
 assert.equal(s.denominator.notApplicable,4);
 const d=s.denominator;assert.equal(d.pass+d.fail+d.notApplicable+d.uncalibrated+d.invalid,80);assert.equal(d.fail,0);
 const cell=s.cells.find(c=>c.cell==='fix/background/input/PageUp');assert.deepEqual([cell.notApplicable,cell.judged,cell.planned,cell.attempted],[1,0,1,1]);
 assert.equal(s.cells.find(c=>c.cell==='main/background/compose/Home').pass,1);
 assert.equal(s.cells.length,80);assert.equal(s.totals.all.planned,80);assert.equal(s.totals['main/background'].planned,16);
 assert.ok(s.cells.every(c=>Number.isFinite(c.actionMsP50)&&Number.isFinite(c.actionMsP95)));
 // coverage completeness does not depend on whether keys worked
 const failing=summarize(fullRows(true,{tweak:(r,p)=>{if(p.scene==='background'&&p.key==='Left'){r.samples[3].selection=[29,0]}}}),true);
 assert.equal(failing.coverage.complete,true);assert.ok(failing.denominator.fail>0);
});

test('summarize: percentiles over repeated attempts use nearest rank',()=>{
 const base=plan(false).filter(p=>p.cell==='fix/foreground/textarea/Left'),rows=base.map((p,i)=>{const r=row({...p,final:SEEDFIN.Left,ms:i+1});r.id=p.id;return r});
 const c=summarize(rows,false).cells.find(c=>c.cell==='fix/foreground/textarea/Left');
 assert.deepEqual([c.actionMsN,c.actionMsP50,c.actionMsP95,c.attempted,c.missing],[20,10,19,20,0]);
});

test('summarize: missing, duplicate, unknown, mismatched and out-of-order rows break coverage',()=>{
 const rows=fullRows(true);
 const miss=summarize(rows.slice(1),true);assert.deepEqual([miss.coverage.missing,miss.coverage.complete,miss.denominator.missing],[1,false,1]);
 assert.equal(summarize([...rows,rows[0]],true).coverage.duplicates,1);
 assert.equal(summarize([...rows,{...rows[0],id:'x'}],true).coverage.unknown,1);
 assert.equal(summarize([{...rows[0],key:'End'},...rows.slice(1)],true).coverage.mismatched,1);
 assert.equal(summarize(rows,false).coverage.complete,false);
 // a background row recorded before its control counts as an order violation
 const bgIdx=rows.findIndex(r=>r.id==='fix/background/textarea/Left/1'),b=rows[bgIdx],rest=rows.filter((_,i)=>i!==bgIdx);
 const early=summarize([b,...rest],true);assert.equal(early.coverage.orderViolations,1);assert.equal(early.coverage.complete,false);
});

test('summarize: a missing control leaves its dependents uncalibrated, visible in the denominator',()=>{
 const rows=fullRows(true,{skip:p=>p.scene==='foreground'&&p.editor==='compose'&&p.key==='Left'});
 const s=summarize(rows,true);
 for(const cell of ['fix/background/compose/Left','main/background/compose/Left'])assert.equal(s.cells.find(c=>c.cell===cell).uncalibrated,1);
 assert.equal(s.denominator.uncalibrated,2);assert.equal(s.denominator.missing,1);assert.equal(s.coverage.complete,false);
});
