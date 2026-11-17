// Hosted setup operations; every accepted fixture is proven by independent readback, never a setter's return code.
import {win,usableFrame,offscreenProof,current,sameFrame} from './evidence.mjs';
import fs from 'node:fs';
import {join} from 'node:path';
export async function requestOwnedBounds({directory,bounds,id,pid,wait}){
 const request={id,operation:'setBounds',bounds},file=join(directory,'request.json'),ackFile=join(directory,'ack.json');
 fs.writeFileSync(file+'.tmp',JSON.stringify(request)+'\n',{mode:0o600});fs.renameSync(file+'.tmp',file);
 const received=await wait(()=>fs.existsSync(ackFile)?JSON.parse(fs.readFileSync(ackFile,'utf8')):null,r=>r?.id===id&&r.pid===pid,5000);
 const ack=received.value??null,mechanism='owned Electron BrowserWindow.setBounds';
 const ok=received.ok===true&&!ack.error&&ack.mechanism===mechanism&&usableFrame(ack.accepted)
  &&['x','y','width','height'].every(k=>ack.requested?.[k]===bounds[k]);
 return {mechanism,request,ack,ackReceived:received.ok,ok};
}

export async function offscreenFixture(io){
 const result={before:await io.read(),attempts:[]};
 async function attempt(route,command,args){
  const before=await io.read(),setter=await io[command](...args),readback=await io.read();
  const independentProof=await io.wait(offscreenProof,4000);
  const proof={...independentProof,ok:independentProof.ok&&(command!=='ownedBounds'||setter.ok===true)};
  result.attempts.push({route,request:{command,args},before,setter,readback,independentProof,proof});
  Object.assign(result,proof);
  if(proof.ok)result.route=route;
  return proof.ok;
 }
 if(await attempt('extreme-left','move',[-5000,200]))return result;
 // AXPosition may clamp to 40 visible points. Shrink at that *actual* origin, without another position setter.
 if(await attempt('shrink-at-clamped-origin','size',[300,300]))return result;
 const screens=result.value?.screens;
 if(Array.isArray(screens)&&screens.length>0&&screens.every(usableFrame)){
  const bottom=Math.max(...screens.map(s=>s.y+s.height))+5000;
  if(await attempt('extreme-bottom','move',[screens[0].x+100,bottom]))return result;
 }
 // Only the owned Electron fixture supplies this control. Native TextEdit retains its AX-capability blocker.
 if(io.ownedBounds&&usableFrame(win(result.before)?.frame)){
  const {width,height}=win(result.before).frame;
  if(await attempt('owned-electron-setBounds','ownedBounds',[{x:-5000,y:200,width,height}]))return result;
  result.reason='Owned Electron setBounds did not yield both a matching successful ACK and independent zero display overlap';
 }else result.reason=win(result.value)?.overlapsDisplay===true
  ?'Distinct AX move/shrink constructions retained display overlap; this bounded offscreen fixture is unavailable'
  :'Distinct AX constructions did not yield usable geometry and independently proven zero display overlap';
 return result;
}
export async function restoreOriginalFrame(io,origin){
 const before=await io.read();
 const visible=i=>sameFrame(win(i)?.frame,origin)&&win(i)?.overlapsDisplay===true&&win(i)?.inOnscreenList===true;
 if(io.ownedBounds){
  const boundsControl=await io.ownedBounds(origin),readback=await io.read(),independentProof=await io.wait(visible);
  return {method:'owned-electron-setBounds',before,boundsControl,readback,independentProof,
   verified:{...independentProof,ok:independentProof.ok&&boundsControl.ok===true}};
 }
 const size=await io.size(origin.width,origin.height),afterSize=await io.read();
 const move=await io.move(origin.x,origin.y),readback=await io.read(),verified=await io.wait(visible);
 return {method:'AXSize/AXPosition',before,size,afterSize,move,readback,verified};
}
export async function switchToSpace(target,io){
 const steps=[];let now=await io.read();
 if(!Number.isSafeInteger(target)||target<1)return {ok:false,reason:'target Space ID unavailable',steps,value:now};
 for(let step=0;step<8&&current(now)!==target;step++){
  const ids=now.managedDisplaySpaces?.[0]?.Spaces?.map(s=>s.ManagedSpaceID)??[];
  const from=ids.indexOf(current(now)),to=ids.indexOf(target);
  if(from<0||to<0)return {ok:false,reason:'cannot resolve active/target Space in the managed display list',steps,value:now};
  const command=from<to?'switch-right':'switch-left',posted=await io.post(command),was=current(now);
  const changed=await io.wait(i=>current(i)!==null&&current(i)!==was);steps.push({before:now,posted,after:changed});
  now=changed.value;
  if(!changed.ok)return {ok:false,reason:'System Events shortcut did not change the active Space; hosted switching unavailable, no further setup routes attempted',steps,value:now};
 }
 return {ok:current(now)===target,route:'system-events-key-code',steps,value:now};
}
