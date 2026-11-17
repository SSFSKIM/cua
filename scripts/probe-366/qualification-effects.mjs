// Runs one measured call's steps and always finalizes its side effects from whatever was observed, so a failure in a
// later step (RPC, renderer readback) cannot erase native harm already recorded in `call.samples`. The original error is kept.
import {deriveEffects} from './first-effects.mjs';

export async function withFinalEffects(call,{owner,coverPid},body) {
 try {return await body();}
 finally {
  call.sideEffects=deriveEffects({owner,call,beforeGeometry:call.beforeGeometry,afterGeometry:call.afterGeometry,after:call.after,samples:call.samples,
   frontAfter:call.frontAfter,trace:[],sideEffects:call.sideEffects},coverPid);
 }
}

// The owned cover must still be frontmost right before a measured RPC; it is never reactivated here. The native status
// stays on the call as evidence, and a lost cover throws a precondition failure before anything is dispatched to the target.
export function requireCoverFront(call,native,coverPid) {
 call.beforeNative={frontmostPid:native?.frontmostPid,coverPid,at:native?.endedAt};
 if(Number.isInteger(native?.frontmostPid)&&native.frontmostPid===coverPid){call.precondition={ok:true};return;}
 call.precondition={ok:false,reason:'cover-not-frontmost'};
 throw Object.assign(Error(`precondition: cover ${coverPid} not frontmost before ${call.label} (frontmost ${native?.frontmostPid})`),{stage:'precondition'});
}
