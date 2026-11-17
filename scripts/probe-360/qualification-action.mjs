// Measure the unmodified press_key boundary, including the connection-owned hold's release.
// The model's readable labels differ from the names Keyboard.swift accepts; translate only at the RPC.
const PRODUCTION_KEY={PageUp:'Page_Up',PageDown:'Page_Down'};
export async function observeProductionAction({wire,row,pid,key,sample,read,
 settle=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=Date.now,cleanupMs=500,onPhase=()=>{}}){
 let problem;
 try {
  onPhase('key');const startedAt=now();
  const submitted=PRODUCTION_KEY[key]??key;
  const raw=await wire.execute('press_key',{pid,key:submitted});
  const endedAt=now();
  row.action={key:submitted,startedAt,endedAt,durationMs:endedAt-startedAt,error:raw.error??null,
   meta:raw.result?.meta??raw.error?.meta??raw.error?.data?.meta??null};
  onPhase('samples');row.samples=await sample(endedAt);
 } catch(error){problem=error}
 finally {
  // The production hold lasts until disconnect (or idle/app change); never stop the passive watch before this.
  row.connectionClosedAt=now();wire.close();onPhase('cleanup');
  try {await settle(cleanupMs);row.cleanup=await read();row.cleanupObservedAt=now()}
  catch(error){row.cleanupProblem=String(error.stack??error);problem??=error}
 }
 if(problem)throw problem;
 return row;
}
