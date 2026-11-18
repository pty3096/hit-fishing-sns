import test from 'node:test';
import assert from 'node:assert/strict';
import {safeReturnPath,authReturnStore} from '../public/auth-return.mjs';
function storage(){const values=new Map();return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key),values};}

test('authentication return paths allow internal tasks but strip tokens and reject redirects',()=>{
 for(const route of ['profile','profile-edit','write','community-write','market-write','following','saved','notifications','settings','mailbox','post/12','edit/12','user/12','report/post/12','report/comment/12'])assert.equal(safeReturnPath(route),route);
 assert.equal(safeReturnPath('#community-write?token=secret'),'community-write');
 assert.equal(safeReturnPath('my-posts?kind=market&q='+encodeURIComponent('내 글 & 50%_')+'&token=secret&author=55'),'my-posts?'+new URLSearchParams({kind:'market',q:'내 글 & 50%_'}));
 for(const bad of ['https://outside.example/','//outside.example','javascript:alert(1)','verify/'+'a'.repeat(64),'reset/'+'a'.repeat(64),'post/0','edit/9007199254740992','login','signup','forgot'])assert.equal(safeReturnPath(bad),'profile');
});

test('return intent survives reload, expires, consumes once and tolerates unavailable storage without keeping credentials',()=>{
 let now=100000;const memory=storage(),store=authReturnStore(memory,()=>now);
 store.write('community-write');assert.equal(authReturnStore(memory,()=>now).read(),'community-write');assert.equal(store.take(),'community-write');assert.equal(store.read(),'profile');
 store.write('my-posts?kind=community&q=질문');now+=30*60*1000;assert.equal(store.read(),'profile');
 memory.setItem('hit-auth-return-v1',JSON.stringify({path:'write',at:now+1}));assert.equal(store.read(),'profile');
 memory.setItem('hit-auth-return-v1','broken');assert.equal(store.read(),'profile');
 store.write('reset/'+'a'.repeat(64)+'?password=secret');assert.ok(![...memory.values.values()].join('').includes('secret'));assert.equal(store.take(),'profile');
 const unavailable=authReturnStore({getItem(){throw Error('denied');},setItem(){throw Error('denied');},removeItem(){throw Error('denied');}},()=>now);unavailable.write('market-write');assert.equal(unavailable.take(),'market-write');assert.equal(unavailable.read(),'profile');
 const noStorage=authReturnStore(null,()=>now);noStorage.write('write');assert.equal(noStorage.take(),'write');
});
