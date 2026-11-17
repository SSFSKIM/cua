// Probe service: answers its worker's pid; its turn-ended handler outlasts its 1 s deadline (runs 8 s).
let registered = false;
const started = Date.now();
export async function handleRpc(request) {
  if (!registered) {
    globalThis.nodeRepl.addTurnEndedHandler({timeoutMs: 1000, run: async () => { await new Promise(r => setTimeout(r, 8000)); }});
    registered = true;
  }
  return {pid: process.pid, age: Date.now() - started};
}
