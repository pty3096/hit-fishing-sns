import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import sharp from 'sharp';
import {appIcon} from '../server/app-icons.mjs';

const root=new URL('../public/',import.meta.url);
const source=readFileSync(new URL('sw.js',root),'utf8');
function worker(fetch){
  const listeners={},claimed=[];
  vm.runInNewContext(source,{URL,Response,fetch,self:{location:{origin:'https://hit.example.test'},clients:{claim:async()=>claimed.push(true)},addEventListener:(type,listener)=>listeners[type]=listener}});
  const dispatch=async request=>{let response;listeners.fetch({request,respondWith:value=>{response=value;}});return response===undefined?null:await response;};
  return {dispatch,listeners,claimed};
}
const navigation={method:'GET',mode:'navigate',url:'https://hit.example.test/'};

test('worker passes through online and server/auth responses and falls back only on root navigation network failure',async()=>{
  const ok=new Response('live data');let received;
  let sw=worker(async request=>{received=request;return ok;});
  assert.equal(await sw.dispatch(navigation),ok);assert.equal(received,navigation);
  for(const response of [new Response('error',{status:500}),new Response('sign in',{status:302,headers:{Location:'/login'}})]){
    sw=worker(async()=>response);assert.equal(await sw.dispatch(navigation),response);
  }
  sw=worker(async()=>{throw Error('offline');});
  const offline=await sw.dispatch(navigation);assert.equal(offline.status,503);
  assert.equal(offline.headers.get('cache-control'),'no-store');
  assert.match(offline.headers.get('content-security-policy'),/default-src 'none'/);
  const html=await offline.text();assert.match(html,/인터넷 연결/);assert.doesNotMatch(html,/<script|password|token/i);
  let activating;sw.listeners.activate({waitUntil:value=>activating=value});await activating;assert.deepEqual(sw.claimed,[true]);
});

test('worker never intercepts private APIs, photos, mutations, external maps or other paths',async()=>{
  let calls=0;const sw=worker(async()=>{calls++;throw Error('should not fetch');});
  for(const request of [
    {...navigation,url:'https://hit.example.test/api/me'},
    {...navigation,url:'https://hit.example.test/api/dev/mail'},
    {...navigation,url:'https://hit.example.test/api/photos/123'},
    {...navigation,mode:'cors'},
    {...navigation,method:'POST'},
    {...navigation,url:'https://www.openstreetmap.org/'},
    {...navigation,url:'https://hit.example.test/sw.js'}
  ])assert.equal(await sw.dispatch(request),null);
  assert.equal(calls,0);
});

test('manifest uses same-origin app scope and approved-logo PNG icons with exact declared sizes',async()=>{
  const manifest=JSON.parse(readFileSync(new URL('manifest.webmanifest',root),'utf8'));
  assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/#home');
  assert.deepEqual(manifest.icons.map(icon=>icon.sizes),['192x192','512x512']);
  for(const size of [180,192,512]){const png=await appIcon(size),meta=await sharp(png).metadata();assert.equal(meta.format,'png');assert.equal(meta.width,size);assert.equal(meta.height,size);}
  assert.throws(()=>appIcon(999));
});
