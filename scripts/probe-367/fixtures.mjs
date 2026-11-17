// Hosted setup operations; every accepted fixture is proven by independent readback, never a setter's return code.
import {win,usableFrame,offscreenProof,current,sameFrame} from './evidence.mjs';

export async function offscreenFixture(io){
 const result={before:await io.read(),attempts:[]};
 async function attempt(route,command,args){
  const before=await io.read(),setter=await io[command](...args),readback=await io.read();
  const proof=await io.wait(offscreenProof,4000);
  result.attempts.push({route,request:{command,args},before,setter,readback,proof});
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
 result.reason=win(result.value)?.overlapsDisplay===true
  ?'Distinct AX move/shrink constructions retained display overlap; this bounded offscreen fixture is unavailable'
  :'Distinct AX constructions did not yield usable geometry and independently proven zero display overlap';
 return result;
}
export async function restoreOriginalFrame(io,origin){
 const before=await io.read(),size=await io.size(origin.width,origin.height),afterSize=await io.read();
 const move=await io.move(origin.x,origin.y),readback=await io.read();
 const verified=await io.wait(i=>sameFrame(win(i)?.frame,origin)&&win(i)?.overlapsDisplay===true&&win(i)?.inOnscreenList===true);
 return {before,size,afterSize,move,readback,verified};
}
export async function switchToSpace(target,io){
 const steps=[];let now=await io.read(),keyboardReason;
 if(current(now)===target)return {ok:true,route:'already-current',steps,value:now};
 for(let step=0;step<8&&current(now)!==target;step++){
  const ids=now.managedDisplaySpaces?.[0]?.Spaces?.map(s=>s.ManagedSpaceID)??[];
  const from=ids.indexOf(current(now)),to=ids.indexOf(target);
  if(from<0||to<0){keyboardReason='cannot resolve active/target Space in the managed display list';break;}
  const command=from<to?'switch-right':'switch-left',posted=await io.post(command),was=current(now);
  const changed=await io.wait(i=>current(i)!==null&&current(i)!==was);steps.push({before:now,posted,after:changed});
  now=changed.value;
  if(!changed.ok){keyboardReason='one posted Space transition did not complete; not retried';break;}
 }
 if(current(now)===target)return {ok:true,route:'keyboard',steps,value:now};
 // Shortcuts can be disabled on the runner even though fullscreen Space creation works. Change the setup mechanism.
 const fallback={keyboardReason:keyboardReason??'bounded adjacent Space transitions exhausted'};
 const display=now?.managedDisplaySpaces?.find(d=>d.Spaces?.some(s=>s.ManagedSpaceID===target));
 const desktops=display?.Spaces?.filter(s=>s.type===0)??[],ordinal=desktops.findIndex(s=>s.ManagedSpaceID===target)+1;
 if(ordinal===0)return {ok:false,reason:'Space switching fallback cannot resolve the requested desktop ordinal',steps,fallback,value:now};
 fallback.finder={before:now,activate:await io.activateFinder()};
 fallback.finder.after=await io.wait(i=>current(i)===target);
 now=fallback.finder.after.value;
 if(fallback.finder.after.ok)return {ok:true,route:'finder-activation',steps,fallback,value:now};
 const mc=fallback.missionControl={desktopOrdinal:ordinal,open:await io.openMissionControl()};
 mc.select=await io.selectDesktop(ordinal);mc.selected=await io.wait(i=>current(i)===target);
 mc.dismiss=await io.dismissMissionControl();mc.after=await io.read();
 now=mc.after;
 return {ok:current(now)===target,route:'mission-control-selection',steps,fallback,value:now,
  ...(current(now)===target?{}:{reason:`Space switching setup could not select managed desktop ${target}; see Finder and Dock AX evidence`})};
}
