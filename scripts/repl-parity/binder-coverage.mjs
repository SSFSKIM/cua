// Mac-only source-double supplements accompany native paired cases. Shared decorated-tab contracts instead use
// the real Chrome lane on both platforms. Do not discard the successful AX translation/suppression witnesses.
export function bindMacSupplements(binders,liveShared){
 const shared=new Set(liveShared.map(s=>s.id));
 const parents={
  'api/decorated-tab/paste':'api/app/paste',
  'api/decorated-tab/presskey':'api/app/presskey',
  'api/decorated-tab/typetext':'api/app/typetext',
  'cells/facade/emit-false-state':'api/cua/getapp',
  'cells/facade/emit-false-screenshot':'api/target-app-decorated-tab/getscreenshot',
  'cells/facade/emit-false-combined':'api/target-app-decorated-tab/getaxstateandscreenshot',
  'cells/facade/dom-only-input-refusal':'api/target-app-decorated-tab/click',
 };
 const result=binders.filter(s=>!shared.has(s.id)).map(s=>({...s}));
 for(const [id,parent] of Object.entries(parents)){
  const supplement=binders.find(s=>s.id===id),target=result.find(s=>s.id===parent);
  if(!supplement||!target||!shared.has(id))throw new Error('Missing shared binder coverage');
  const offset=target.cells.length,check=target.assert;
  target.cells=[...target.cells,...supplement.cells.map(c=>({...c,label:'decorated-'+c.label}))];
  target.assert=({results,timings,...context})=>{check({...context,results:results.slice(0,offset),timings:timings?.slice(0,offset)});return supplement.assert({...context,results:results.slice(offset),timings:timings?.slice(offset)});};
 }
 // get_state's allSettled behavior is platform independent; the service target remains explicitly a double.
 const inventory=result.find(s=>s.id==='cells/facade/all-settled-inventory');inventory.platforms=['darwin','linux'];
 return result;
}
