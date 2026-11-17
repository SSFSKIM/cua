// Evidence predicates shared by the hosted measurement and its headless regression checks.
export const usableFrame=f=>f!=null&&['x','y','width','height'].every(k=>Number.isFinite(f[k]))&&f.width>=1&&f.height>=1;
export const win=i=>i?.selectedWindowNumber!=null?i.windows?.find(w=>w.number===i.selectedWindowNumber):i?.windows?.[0];
const overlaps=(a,b)=>Math.min(a.x+a.width,b.x+b.width)>Math.max(a.x,b.x)&&Math.min(a.y+a.height,b.y+b.height)>Math.max(a.y,b.y);
export const offscreenProof=i=>usableFrame(win(i)?.frame)&&Array.isArray(i?.screens)&&i.screens.length>0&&i.screens.every(usableFrame)
 &&win(i).overlapsDisplay===false&&i.screens.every(s=>!overlaps(win(i).frame,s));
export const sameFrame=(a,b)=>usableFrame(a)&&usableFrame(b)&&['x','y','width','height'].every(k=>Math.abs(a[k]-b[k])<=1);
export function windowMatch(row,i){
 return row?.ok===true&&row.raw?.window?.pid===i?.pid&&win(i)?.numberResult===0&&win(i)?.number>0&&sameFrame(row.raw.window.frame,win(i)?.frame);
}
const spaceId=n=>Number.isSafeInteger(n)&&n>0;
export function current(i){
 const display=i?.managedDisplaySpaces?.[0]?.['Current Space']?.ManagedSpaceID,active=i?.activeSpace;
 if(spaceId(display)&&spaceId(active)&&display!==active)return null;
 return spaceId(display)?display:spaceId(active)?active:null;
}
export const spaceIds=i=>i?.managedDisplaySpaces?.flatMap(d=>(d.Spaces??[]).map(s=>s.ManagedSpaceID)).filter(spaceId)??[];
export const anotherSpaceProof=i=>current(i)!==null&&win(i)?.numberResult===0&&win(i)?.number>0&&Array.isArray(win(i)?.spaces)
 &&win(i).spaces.length>0&&win(i).spaces.every(spaceId)&&!win(i).spaces.includes(current(i))
 &&win(i).cgWindowFound===true&&win(i).cgOnscreen===false&&win(i).inOnscreenList===false;
export const visibleOnSpace=i=>current(i)!==null&&win(i)?.spaces?.includes(current(i))===true&&win(i)?.cgOnscreen===true&&win(i)?.inOnscreenList===true;
export const missingAuthorization=(oracle,engine)=>[
 ...['accessibility','screenRecording','canPostHid'].filter(k=>oracle?.[k]!==true).map(k=>'oracle.'+k),
 ...['accessibility','screenRecording'].filter(k=>engine?.[k]!==true).map(k=>'engine.'+k),
];
export function compareReturn(baseline,returned,baselineScreenshot,returnScreenshot){
 const text=r=>r?.ok===true&&typeof r.value==='string'&&r.value.length>0;
 const image=r=>r?.ok===true&&r.value?.jpeg===true&&Number.isInteger(r.value.bytes)&&r.value.bytes>0&&/^[a-f0-9]{64}$/.test(r.value.sha256??'')
  &&['width','height'].every(k=>Number.isFinite(r.raw?.screenshot?.[k])&&r.raw.screenshot[k]>0);
 const images=image(baselineScreenshot)&&image(returnScreenshot);
 return {textEqual:text(baseline)&&text(returned)?returned.value===baseline.value:null,
  jpegBytesEqual:images?returnScreenshot.value.sha256===baselineScreenshot.value.sha256:null,
  byteLengthsEqual:images?returnScreenshot.value.bytes===baselineScreenshot.value.bytes:null,
  dimensionsEqual:images?['width','height'].every(k=>returnScreenshot.raw.screenshot[k]===baselineScreenshot.raw.screenshot[k]):null};
}
export function raiseTarget(row,i,latest=row?.raw){
 const unavailable=reason=>({available:false,reason});
 if(!windowMatch(row,i))return unavailable('no successful observation matching the independently pinned window frame/PID');
 if(typeof row.raw.lineage!=='string'||!row.raw.lineage||!Number.isInteger(row.raw.revision))return unavailable('observation lacks native lineage/revision');
 const windows=row.raw.nodes?.filter(n=>n.role==='AXWindow')??[];
 if(windows.length!==1||!windows[0].actions?.includes('AXRaise'))return unavailable('observation lacks one AXWindow with AXRaise');
 if(latest?.lineage!==row.raw.lineage||!Number.isInteger(latest?.revision)||latest.revision<row.raw.revision
  ||!latest.nodes?.some(n=>n.token===windows[0].token&&n.role==='AXWindow'))return unavailable('rendered window no longer belongs to the latest successful native observation');
 // Only the top-level rendered window action, never an arbitrary nested container or a previous observation's index.
 const lines=(typeof row.value==='string'?row.value:'').split('\n').filter(l=>/^\d+\s/.test(l)&&/Secondary Actions:.*\bRaise\b/.test(l));
 if(lines.length!==1)return unavailable('no unambiguous rendered window Raise index');
 return {available:true,index:Number(lines[0].match(/^\d+/)[0]),token:windows[0].token,lineage:row.raw.lineage,revision:row.raw.revision};
}
