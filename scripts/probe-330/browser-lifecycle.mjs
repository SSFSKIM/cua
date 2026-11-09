// Hosted kit only: stop only the child (or Safari PID adapter) this measurement owns before the next launch/head.
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export const childRunning=child=>!!child && child.exitCode===null && child.signalCode==null;
export async function stopOwnedChild(child,graceMs=5000) {
  for(const signal of ['SIGTERM','SIGKILL']) {
    if(!childRunning(child))return;
    child.kill(signal);
    const until=Date.now()+graceMs;
    while(childRunning(child) && Date.now()<until)await sleep(50);
  }
  if(childRunning(child))throw new Error(`owned child ${child.pid} did not terminate`);
}
