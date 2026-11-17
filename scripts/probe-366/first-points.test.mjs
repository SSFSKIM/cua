import test from 'node:test';
import assert from 'node:assert/strict';
import {inertPoint} from './first-points.mjs';
const geometry={windowFrame:{x:0,y:25,width:1440,height:900},webAreaFrame:{x:0,y:25,width:1440,height:900},screenFrame:{x:0,y:0,width:1024,height:768}};
test('inside candidates stay on the visible owned window despite its oversized bounds',()=>{
 assert.deepEqual(inertPoint('inert-titlebar',geometry),[768,39]);
 assert.deepEqual(inertPoint('inert-toolbar',geometry),[400,47]);
 assert.equal(inertPoint('main',geometry),null);assert.equal(inertPoint('bare',geometry),null);
});
test('native title-bar and DOM toolbar points remain distinct on a default framed browser',()=>{
 const g={windowFrame:{x:100,y:25,width:650,height:700},webAreaFrame:{x:100,y:130,width:650,height:595},screenFrame:geometry.screenFrame};
 assert.deepEqual(inertPoint('inert-titlebar',g),[587.5,39]);
 assert.deepEqual(inertPoint('inert-toolbar',g),[425,152]);
});
test('missing or offscreen target geometry is a setup failure, never an invented fallback',()=>{
 assert.throws(()=>inertPoint('inert-toolbar',{...geometry,webAreaFrame:null}));
 assert.throws(()=>inertPoint('inert-titlebar',{...geometry,windowFrame:{x:1200,y:25,width:600,height:700}}));
 assert.throws(()=>inertPoint('inert-titlebar',{...geometry,windowFrame:{x:0,y:-50,width:800,height:700}}));
 assert.throws(()=>inertPoint('unknown',geometry));
});
