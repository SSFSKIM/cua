import {pressReadiness} from './first-readiness.mjs';

// Input enablement precedes the action scope, so scope-only traces cannot establish this clock.
export function finalizeTiming(row,nativeTrace,appInfo) {
 row.nativeTrace=[...nativeTrace];row.appInfo=[...appInfo];
 row.trace=nativeTrace.filter(e=>e.trial===row.id);
 row.priorTrace=nativeTrace.filter(e=>e.trial===row.id+'/primer');
 row.enablementTrace=nativeTrace.filter(e=>e.pid===row.targetPid&&['AXManualAccessibility','AXEnhancedUserInterface'].includes(e.attribute));
 const attach=(target,scope)=>{
  const presses=scope.filter(e=>e.kind==='perform.begin'&&e.action==='AXPress'&&e.pid===row.targetPid);
  target.actualAXPressAt=presses.length===1&&Number.isFinite(presses[0].at)?presses[0].at:null;
  target.actualAXPressAgeMs=target.actualAXPressAt===null?null:target.actualAXPressAt-row.launchedAt;
  target.readiness=pressReadiness(nativeTrace,appInfo,target.actualAXPressAt,row.targetPid);
 };
 attach(row,row.trace);if(row.primer)attach(row.primer,row.priorTrace);
 if(row.age==='aged'&&row.observeFirst) {
  const observation=row.prePressObservation;
  row.secondWalkManualWrites=Number.isFinite(observation?.startedAt)&&Number.isFinite(observation?.endedAt)?
   row.enablementTrace.filter(e=>e.kind==='write.end'&&e.attribute==='AXManualAccessibility'&&e.at>=observation.startedAt&&e.at<=observation.endedAt):null;
 }
 return row;
}
