import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {imageHash,exactImage} from '../../scripts/browser-parity/image-hash.mjs';
import {compareRuns} from '../../scripts/browser-parity/compare.mjs';
const fixture=name=>readFileSync(new URL(`./fixtures/${name}`,import.meta.url));
const rows=image=>[{case:'synthetic-image',cell:'emit',ok:true,content:[image]},{case:'synthetic-image',assertion:{ok:true}}];
test('the comparator rejects actual equal-average-hash brightness and colour changes',()=>{
 const black=fixture('black.png'),white=fixture('white.png'),red=fixture('red.png'),blue=fixture('blue.png');
 assert.equal(imageHash(black).hash,imageHash(white).hash);
 assert.equal(imageHash(red).hash,imageHash(blue).hash);
 for(const [a,b] of [[black,white],[red,blue]])assert.equal(compareRuns(rows(exactImage(a)),rows(exactImage(b))).ok,false);
});
test('WebP bytes, decoded dimensions and declared MIME all participate in exact parity',()=>{
 const bytes=fixture('pattern.webp'),value=exactImage(bytes),mutated=Buffer.from(bytes);mutated[mutated.length-1]^=1;
 assert.equal(compareRuns(rows(value),rows(exactImage(mutated))).ok,false);
 for(const change of [{width:value.width+1},{height:value.height+1},{mimeType:'image/png'}])assert.equal(compareRuns(rows(value),rows({...value,...change})).ok,false);
 assert.throws(()=>exactImage(bytes,{mimeType:'image/png'}),/MIME mismatch/);
 assert.throws(()=>exactImage(bytes.subarray(0,-1)),/Truncated/);
});

test('raw live screenshots retain MIME and average-hash tolerance, separate from exact emitImage bytes',async()=>{
 const {createNormalizer}=await import('../../scripts/browser-parity/normalize.mjs');
 const normalize=createNormalizer({imageMode:'live',schemaFields:false});
 const image=await normalize({type:'image',mimeType:'image/png',data:fixture('black.png').toString('base64')});
 assert.equal(image.$image,'ahash64');assert.equal(image.mimeType,'image/png');
 assert.equal(compareRuns(rows(image),rows({...image,mimeType:'image/jpeg'})).ok,false);
});
