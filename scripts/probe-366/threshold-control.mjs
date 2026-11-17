// Mirrors the engine's ownership boundary: read false, then an accepted true write (Chrome needs read-back).
export function ownedReference(trace,pid,attribute) {
 const records=trace.filter(e=>e.pid===pid&&e.attribute===attribute&&Number.isFinite(e.at)).sort((a,b)=>a.at-b.at);
 const write=records.findLast(e=>e.kind==='write.end');
 if(!write||write.value!==true)return null;
 const prior=records.findLast(e=>e.kind==='read'&&e.at<=write.at);
 if(prior?.error!==0||prior.value!==false)return null;
 const accepted=write.error===0||(attribute==='AXEnhancedUserInterface'&&write.error===-25208&&records.some(e=>e.kind==='read'&&e.at>=write.at&&e.error===0&&e.value===true));
 return accepted?write:null;
}
