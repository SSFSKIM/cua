// A harness-owned Unix listener whose accept queue can be saturated. Never accepts or contacts another socket.
import {createServer} from 'node:net';
const server=createServer();
server.listen({path:process.argv[2],backlog:1},()=>{
 process.stdout.write('ready\n');
 Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0);
});
