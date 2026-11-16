// Radix FocusScope fires onCloseAutoFocus from a zero-timer after unmount (react-focus-scope 1.1.7,
// dist/index.mjs:87-99), and then focuses the old trigger. A reset must not reopen before that lifecycle
// has finished, so count mounts against completed closes and wait on the completion signal itself.
export function createLifecycle(setTimer=setTimeout,clearTimer=clearTimeout) {
 let mounts=0,closes=0,waiters=[];
 const idle=()=>mounts===closes;
 return {
  idle,
  mounted(){mounts++;},
  // The waiter resolves inside the close event handler; its continuation is a microtask, so it runs only
  // after Radix's own callback has finished focusing and removing the scope.
  closed(){closes++;if(idle())for(const done of waiters.splice(0))done();},
  // The bound only fails a stuck fixture; it is never the thing that decides the lifecycle is over.
  drained(failAfterMs=2000) {
   if(idle())return Promise.resolve();
   return new Promise((ok,no)=>{
    const entry=()=>{clearTimer(timer);ok();},timer=setTimer(()=>{waiters=waiters.filter(w=>w!==entry);no(Error('Radix close lifecycle did not complete'));},failAfterMs);
    waiters.push(entry);
   });
  },
 };
}
// One text node per marker: the AX reader looks for a single static-text value.
export const pressMarker=n=>`Press marker ${n}`;
export const valueMarker=v=>`Search marker ${v}`;
