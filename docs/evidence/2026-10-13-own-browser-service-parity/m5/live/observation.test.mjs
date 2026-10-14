// Offline tests of the M5 live observation's drivers (no ssh, no nettop, no lsof):
//   node --test docs/evidence/2026-10-13-own-browser-service-parity/m5/live/observation.test.mjs
// The sampler runs as a child with a scripted collector in nettop's place; the collector runs local commands.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {startCollector} from './collector.mjs';

const SAMPLER = fileURLToPath(new URL('./sampler.mjs', import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const node = code => ({command: process.execPath, args: ['-e', code]});

function scratch(t) { const dir = mkdtempSync(join(tmpdir(), 'm5-observation-')); t.after(() => rmSync(dir, {recursive: true, force: true})); return dir; }
function spawnNode(code) { const child = spawn(process.execPath, ['-e', code], {stdio: 'ignore'}); return child; }

// Runs the sampler with `nettop` replaced by a node script; `during` runs once it started; resolves its summary.
async function sample(t, fakeNettop, {during = async () => {}, psMs = 250} = {}) {
  const dir = scratch(t), pidFile = join(dir, 'serve.pid'), fake = join(dir, 'fake-nettop.js');
  writeFileSync(fake, fakeNettop);
  const sampler = spawn(process.execPath, [SAMPLER, pidFile], {stdio: ['pipe', 'pipe', 'inherit'],
    env: {...process.env, SAMPLER_NETTOP: JSON.stringify([process.execPath, fake, dir]), SAMPLER_LSOF: 'off', SAMPLER_PS_MS: String(psMs)}});
  let out = ''; sampler.stdout.on('data', d => { out += d; });
  const closed = new Promise(r => sampler.once('close', r));
  await during({dir, pidFile});
  sampler.stdin.end();
  await closed;
  return JSON.parse(out.trim().split('\n').at(-1));
}

// A scripted nettop: a header each 250 ms, then a process row and a connection row for each pid listed in pids.json.
const HEALTHY = `const fs=require('fs'),path=require('path');const dir=process.argv[2];
setInterval(()=>{console.log('time,,interface,state,bytes_in,bytes_out,');let pids=[];try{pids=JSON.parse(fs.readFileSync(path.join(dir,'pids.json'),'utf8'));}catch{}
for(const pid of pids){console.log('00:00:00.0,node.'+pid+',,,0,7,');console.log('00:00:00.0,tcp4 127.0.0.1:5000<->127.0.0.1:6000,lo0,Established,0,7,');}},250);`;

test('a descendant the ps poll never saw is attributed from its nettop row; an exited one is listed as unresolved', async t => {
  let root, child, gone;
  const summary = await sample(t, HEALTHY, {psMs: 600000, during: async ({dir, pidFile}) => {
    await sleep(600);                                         // nettop's first sample precedes the serve
    root = spawnNode(`require('child_process').spawn(process.execPath,['-e','setTimeout(()=>{},5000)'],{stdio:'ignore'});setTimeout(()=>{},5000)`);
    t.after(() => root.kill());
    await sleep(300);
    child = Number(execFileSync('pgrep', ['-P', String(root.pid)], {encoding: 'utf8'}).trim().split('\n')[0]);
    gone = spawnNode('');
    await new Promise(r => gone.once('exit', r));
    writeFileSync(pidFile, String(root.pid));
    writeFileSync(join(dir, 'pids.json'), JSON.stringify([child, gone.pid]));
    await sleep(1200);
  }});
  assert.equal(summary.coverage.ok, true, JSON.stringify(summary.coverage));
  assert.equal(summary.tree.find(p => p.pid === child)?.via, 'nettop');
  assert.ok(summary.tree.some(p => p.pid === root.pid));
  assert.ok(summary.connections.some(c => c.pid === child && c.remote === '127.0.0.1:6000'));
  assert.ok(summary.nettopProcesses.some(p => p.pid === child && p.bytesOut === 7));
  assert.deepEqual(summary.unresolved.map(u => u.pid), [gone.pid]);
});

test('a collector that exits early is lost coverage, with its exit and stderr', async t => {
  const summary = await sample(t, `console.log('time,,');console.error('nettop: no permission');setTimeout(()=>process.exit(1),100);`, {during: async ({pidFile}) => {
    await sleep(500); writeFileSync(pidFile, String(process.pid)); await sleep(500);
  }});
  assert.equal(summary.coverage.ok, false);
  assert.ok(summary.coverage.problems.some(p => /nettop exited before the end \(1\)/.test(p)), JSON.stringify(summary.coverage.problems));
  assert.match(summary.coverage.nettop.stderr, /no permission/);
});

test('a collector that never prints is lost coverage, from before the serve started', async t => {
  const summary = await sample(t, `setInterval(()=>{},1000);`, {during: async ({pidFile}) => {
    await sleep(300); writeFileSync(pidFile, String(process.pid)); await sleep(500);
  }});
  assert.equal(summary.coverage.ok, false);
  assert.ok(summary.coverage.problems.includes('nettop had not printed its first sample when the serve started'));
  assert.ok(summary.coverage.problems.includes('nettop never printed a sample'));
});

test('a collector that falls silent is lost coverage', async t => {
  const summary = await sample(t, `console.log('time,,');setInterval(()=>{},1000);`, {during: async ({pidFile}) => {
    await sleep(300); writeFileSync(pidFile, String(process.pid)); await sleep(6500);
  }});
  assert.equal(summary.coverage.ok, false);
  assert.ok(summary.coverage.problems.some(p => /fell silent/.test(p)), JSON.stringify(summary.coverage.problems));
});

test('the session collector: a sampler that exits early fails the observation and stop() still settles at once', async () => {
  const collector = startCollector(node('process.exit(3)'));
  await sleep(300);
  assert.equal(collector.early.code, 3);
  const started = Date.now();
  const result = await collector.stop({timeoutMs: 5000});
  assert.ok(Date.now() - started < 1000);
  assert.equal(result.ok, false);
  assert.match(result.reason, /exited before the session ended \(3\)/);
});

test('the session collector: a sampler that ignores the end is killed after the timeout', async () => {
  const collector = startCollector(node('process.stdin.resume();process.stdin.on("end",()=>{});setInterval(()=>{},1000)'));
  const result = await collector.stop({timeoutMs: 300});
  assert.equal(result.ok, false);
  assert.match(result.reason, /did not finish within 300 ms/);
});

test('the session collector: a summary whose coverage failed fails the observation; a whole one passes', async () => {
  const lost = startCollector(node(`process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({coverage:{ok:false,problems:['nettop exited before the end (1)']}}));});`));
  const failed = await lost.stop();
  assert.equal(failed.ok, false);
  assert.match(failed.reason, /lost coverage: nettop exited before the end/);
  const whole = startCollector(node(`process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({coverage:{ok:true,problems:[]},tree:[]}));});`));
  const passed = await whole.stop();
  assert.equal(passed.ok, true);
  assert.deepEqual(passed.summary.tree, []);
});

test('the session collector: ready() waits for the sampler\'s first sample and fails when it exits or stalls first', async () => {
  const good = startCollector(node(`setTimeout(()=>console.log(JSON.stringify({ready:true,at:'x'})),200);process.stdin.resume();process.stdin.on('end',()=>console.log(JSON.stringify({coverage:{ok:true,problems:[]}})));`));
  await good.ready(5000);
  assert.equal((await good.stop()).ok, true);
  const dead = startCollector(node('process.exit(2)'));
  await assert.rejects(dead.ready(5000), /exited before it was ready \(2\)/);
  assert.equal((await dead.stop()).ok, false);
  const stalled = startCollector(node('process.stdin.resume();process.stdin.on("end",()=>process.exit(0))'));
  await assert.rejects(stalled.ready(300), /not ready within 300 ms/);
  await stalled.stop();
});
