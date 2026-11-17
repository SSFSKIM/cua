// Setup-only read wait, matching #354's bounded visible-window binder. It never activates or posts input.
import {FixtureError} from '../probe-354/transport.mjs';
export async function bindVisibleFixture({transport,pid,readWindow,attempts=[],budgetMs=3000,now=Date.now,sleep=ms=>new Promise(r=>setTimeout(r,ms))}){
 const deadline=now()+budgetMs;let last;
 while(now()<deadline){
  last=await readWindow();const attempt={at:now(),window:last};attempts.push(attempt);
  if(last.frontmostPid===pid){
   try{
    const owner=transport.bindVisible(last.windowTitle);
    if(transport.hasPoll())return owner;
    attempt.bindingError='visible fixture has no live command poll yet';
   }catch(e){if(!(e instanceof FixtureError))throw e;attempt.bindingError=String(e)}
  }else attempt.bindingError='target is not foreground during fixture binding';
  await sleep(Math.min(50,Math.max(0,deadline-now())));
 }
 throw new FixtureError('visible-window fixture handshake unavailable after bounded setup wait: '+JSON.stringify(last));
}
