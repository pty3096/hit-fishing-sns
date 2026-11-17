import test from 'node:test';
import assert from 'node:assert/strict';
import {draftStore} from '../public/drafts.mjs';
const memory=()=>{const map=new Map();return {get length(){return map.size;},key:i=>[...map.keys()][i],getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};};
test('drafts survive reload, isolate accounts/editors, whitelist text and expire',()=>{
 const storage=memory();let time=1000;const d=draftStore(storage,()=>time);
 assert.equal(d.write(1,'new',{title:'한 수',body:'바다',photos:['private'],password:'secret'}),true);
 assert.equal(draftStore(storage,()=>time).read(1,'new').title,'한 수');
 assert.equal(d.read(2,'new'),null);assert.equal(d.read(1,3),null);
 assert.equal(storage.getItem('hit-draft-v1:1:new').includes('secret'),false);
 assert.equal(storage.getItem('hit-draft-v1:1:new').includes('photos'),false);
 time+=86400000;assert.equal(d.read(1,'new'),null);assert.equal(storage.length,0);
});
test('logout clears only own drafts; corrupt storage and unavailable storage are safe',()=>{
 const storage=memory(),d=draftStore(storage);d.write(1,'new',{});d.write(1,3,{});d.write(2,'new',{title:'다른 계정'});d.clear(1);
 assert.equal(storage.length,1);assert.equal(d.read(2,'new').title,'다른 계정');
 storage.setItem('hit-draft-v1:2:new','broken');assert.equal(d.read(2,'new'),null);
 const blocked=draftStore({setItem(){throw Error();},getItem(){throw Error();}});assert.equal(blocked.write(1,'new',{}),false);assert.equal(blocked.read(1,'new'),null);blocked.clear(1);
});
