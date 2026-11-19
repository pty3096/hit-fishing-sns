import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPreview} from '../scripts/check-preview.mjs';
const origin='https://fixture.trycloudflare.com';
const response=(value,status=200,headers={})=>new Response(JSON.stringify(value),{status,headers});
function fixture(external){return async(url,options)=>{
 assert.ok(!options.headers?.cookie);assert.ok(!options.headers?.authorization);
 if(url.startsWith(origin)){assert.equal(options.redirect,'manual');return external();}
 assert.ok(url.startsWith('http://127.0.0.1:3002/'));assert.equal(options.headers.Host,'fixture.trycloudflare.com');assert.equal(options.redirect,'error');
 if(url.endsWith('/api/health'))return response({status:'ok'});
 if(url.endsWith('/api/meta'))return response({phone_preview:true,development_mail:true,verification_required:true,production:false});
 if(url.endsWith('/api/me'))return response({user:null});
 if(url.endsWith('/api/dev/mail'))return response({},401);
 if(url.endsWith('/api/posts'))return response({posts:[]});
 return response({},200,{'content-type':'text/javascript'});
};}
test('preview diagnosis checks local data and external login without cookies or following redirects',async()=>{
 const results=await checkPreview(origin,{fetcher:fixture(()=>response({},302,{location:'https://login.trycloudflare.com/authorize?state=not-recorded'}))});assert.equal(results.length,7);assert.ok(results.every(r=>r.ok));assert.ok(!JSON.stringify(results).includes('state='));
});
test('preview diagnosis rejects public API exposure, foreign redirects and unreachable app checks',async()=>{
 for(const external of [()=>response({status:'ok'}),()=>response({},302,{location:'https://evil.test/'}),()=>{throw Error('offline');}]){const results=await checkPreview(origin,{fetcher:fixture(external)});assert.equal(results.at(-1).ok,false);}
 const offline=await checkPreview(origin,{fetcher:async()=>{throw Error('offline');}});assert.ok(offline.every(r=>!r.ok));
});
test('preview diagnosis refuses arbitrary, local and credentialed targets before making requests',async()=>{
 for(const target of ['http://localhost','https://evil.test','https://fixture.trycloudflare.com/path','https://user:secret@fixture.trycloudflare.com'])await assert.rejects(checkPreview(target,{fetcher:()=>{assert.fail('unexpected network');}}));
});
