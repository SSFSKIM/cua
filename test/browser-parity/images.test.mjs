import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateSync} from 'node:zlib';
import {readFileSync} from 'node:fs';
import {createNormalizer} from '../../scripts/browser-parity/normalize.mjs';
import {compareRuns} from '../../scripts/browser-parity/compare.mjs';
// Minimal grayscale PNG encoder; CRCs are immaterial to the decoder, which never emits this image.
function png(invert=false) {
  const chunk=(type,data)=>{const n=Buffer.alloc(4);n.writeUInt32BE(data.length);return Buffer.concat([n,Buffer.from(type),data,Buffer.alloc(4)]);};
  const header=Buffer.alloc(13);header.writeUInt32BE(64,0);header.writeUInt32BE(64,4);header[8]=8;
  const pixels=Buffer.alloc(65*64);
  for(let y=0;y<64;y++)pixels.fill((y<32)!==invert?240:10,y*65+1,(y+1)*65);
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
test('screenshots become perceptual hashes instead of byte hashes; shape and changed visual content remain observable', async()=>{
  const normalize=createNormalizer();
  const first=await normalize({type:'image',mimeType:'image/png',data:png().toString('base64')});
  assert.deepEqual(first,{$image:'ahash64',width:64,height:64,hash:'ffffffff00000000'});
  const second=await normalize({$imageData:[...png(true)]});
  assert.equal(second.hash,'00000000ffffffff');
  const run=value=>[{case:'shot',cell:'image',ok:true,value,screenshotTolerance:4},{case:'shot',assertion:{ok:true}}];
  assert.equal(compareRuns(run(first),run({...first,hash:'ffffffff00000001'})).ok,true);
  assert.equal(compareRuns(run(first),run(second)).ok,false);
  await assert.rejects(normalize({type:'image',mimeType:'image/png',data:'invalid'}),/image|PNG|JPEG/i);
});
test('baseline JPEG screenshots use decoded luminance DCs, not compressed bytes',async()=>{
  const normalize=createNormalizer();
  const value=await normalize({$imageData:[...readFileSync(new URL('./fixture/hash-sample.jpg',import.meta.url))]});
  assert.deepEqual(value,{$image:'ahash64',width:64,height:64,hash:'ffffffff00000000'});
});
test('multi-component color JPEG screenshots decode every scan component without advancing the selector cursor during lookup',async()=>{
  const normalize=createNormalizer();
  const value=await normalize({$imageData:[...readFileSync(new URL('./fixture/hash-color.jpg',import.meta.url))]});
  assert.deepEqual(value,{$image:'ahash64',width:64,height:64,hash:'00000000ffffffff'});
});
