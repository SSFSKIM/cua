// Every acknowledgement is evidence, not just the first Promise.all result. Clock values come from the same device:
// the hook's final synchronous witness write and the adapter's receipt of each host reply. Only durations live in ms.
export function turnCellLabels(cell){return cell.repeat?Array.from({length:cell.repeat},(_,i)=>`${cell.label}-${i+1}`):[cell.label];}
export async function observeTurnReplies(cell,{client}){
 const start=performance.now();
 const replies=await Promise.all(Array.from({length:cell.repeat??1},async()=>{
  const result=await client.request('parity/turn-ended',{...cell.args,_parityWitness:cell.witnessCount!==undefined}),elapsed=performance.now()-start;
  const witness=result._meta?.['cua/parityTurnObservation'];
  if(!witness||!/^\d+$/.test(witness.requestAtNs)||!/^\d+$/.test(witness.ackAtNs)||!(witness.completedAtNs===null||/^\d+$/.test(witness.completedAtNs))||!Number.isInteger(witness.completedHooks)||typeof witness.originalMetaPresent!=='boolean')throw new Error('Missing turn completion witness');
  const raw={...result,_meta:{...result._meta}};delete raw._meta['cua/parityTurnObservation'];if(!witness.originalMetaPresent)delete raw._meta;
  return {result:raw,witness,elapsed};
 }));
 const completion=replies.find(r=>r.witness.completedHooks>=cell.witnessCount)?.witness.completedAtNs;
 return replies.map(r=>{
  const afterHookMs=completion===null||completion===undefined?null:Number(BigInt(r.witness.ackAtNs)-BigInt(completion))/1e6;
  return {result:r.result,elapsed:r.elapsed,hostTurnMs:Number(BigInt(r.witness.ackAtNs)-BigInt(r.witness.requestAtNs))/1e6,observation:{hookCompletedBeforeAck:afterHookMs!==null&&afterHookMs>=0&&r.witness.completedHooks>=cell.witnessCount,completedHooks:r.witness.completedHooks,afterHookMs}};
 });
}
