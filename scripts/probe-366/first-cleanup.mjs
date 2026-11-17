import {rmSync} from 'node:fs';

// Call only after the owned main process has stopped. Residual profile writes must not end the cohort.
export function removeProfile(path,remove=rmSync) {
 const startedAt=Date.now();
 try {
  remove(path,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  return {attempted:true,ok:true,startedAt,endedAt:Date.now()};
 } catch(error) {
  return {attempted:true,ok:false,startedAt,endedAt:Date.now(),error:String(error.code??'')+' '+String(error)};
 }
}
