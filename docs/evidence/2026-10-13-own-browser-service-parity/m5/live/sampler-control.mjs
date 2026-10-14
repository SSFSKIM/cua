// The sampler's positive control, run on the mini beside sampler.mjs (same directory):
//   node sampler-control.mjs
// A listener outside the observed tree; an observed tree (a parent and its child) whose child holds one TCP
// connection to the listener for 4 s (writing 4 bytes), then opens and closes a second one within a few milliseconds
// (1 byte), then sends one UDP datagram (1 byte); a second child whose only activity is one brief connection (3 bytes)
// and one datagram (2 bytes). The sampler must attribute the held connection to the first child (nettop and lsof); the
// summary shows whether the brief flows show up, as connection rows or in their process's nettop byte totals.
import {spawn} from 'node:child_process';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'sampler-control-'));
const pidFile = join(dir, 'tree.pid');
const listener = spawn(process.execPath, ['-e', `const net=require('net');const s=net.createServer(c=>{c.on('data',()=>{});c.on('error',()=>{});}).listen(0,'127.0.0.1',()=>console.log(s.address().port));`], {stdio: ['ignore', 'pipe', 'inherit']});
const port = await new Promise(r => listener.stdout.once('data', d => r(Number(String(d).trim()))));
const sampler = spawn(process.execPath, [join(fileURLToPath(new URL('.', import.meta.url)), 'sampler.mjs'), pidFile], {stdio: ['pipe', 'pipe', 'inherit']});
let output = '';
const ready = await Promise.race([new Promise(resolve => sampler.stdout.on('data', d => { output += d; if (/^\{"ready":true/m.test(output)) resolve(true); })),
  new Promise(resolve => sampler.once('close', () => resolve(false))), new Promise(resolve => setTimeout(() => resolve(false), 15000))]);
if (!ready) { sampler.kill(); listener.kill(); console.error('the sampler did not become ready'); process.exit(1); }
const child = `const net=require('net'),dgram=require('dgram');
setTimeout(()=>{const held=net.connect(${port},'127.0.0.1',()=>held.write('held'));setTimeout(()=>{held.end();
  const brief=net.connect(${port},'127.0.0.1',()=>{brief.end('x');});
  brief.on('close',()=>setTimeout(()=>{const u=dgram.createSocket('udp4');u.send('x',${port},'127.0.0.1',()=>{u.close();setTimeout(()=>process.exit(0),3500);});},2500));},4000);},1500);`;
// A second child whose only network activity is one brief connection (written and closed at once) and one datagram.
const briefOnly = `const net=require('net'),dgram=require('dgram');
setTimeout(()=>{const brief=net.connect(${port},'127.0.0.1',()=>{brief.end('xyz');});brief.on('close',()=>{const u=dgram.createSocket('udp4');u.send('xy',${port},'127.0.0.1',()=>{u.close();setTimeout(()=>process.exit(0),4000);});});},3000);`;
const parent = `require('fs').writeFileSync(${JSON.stringify(pidFile)},String(process.pid));const {spawn}=require('child_process');let left=2;for(const code of [${JSON.stringify(child)},${JSON.stringify(briefOnly)}])spawn(process.execPath,['-e',code],{stdio:'inherit'}).on('exit',()=>{if(--left===0)process.exit(0);});`;
const tree = spawn(process.execPath, ['-e', parent], {stdio: 'inherit'});
await new Promise(r => tree.once('exit', r));
await new Promise(r => setTimeout(r, 1500));
sampler.stdin.end();
await new Promise(r => sampler.once('close', r));
listener.kill();
const summary = JSON.parse(output.trim().split('\n').at(-1));
writeFileSync(join(dir, 'summary.json'), output);
console.log(JSON.stringify({listenerPort: port, ...summary}));
