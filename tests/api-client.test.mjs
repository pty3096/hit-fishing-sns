import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient} from '../public/api.mjs';
const stalled=signal=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));
test('API client bounds stalled reads and writes without automatically resending mutations',async()=>{
 for(const method of ['GET','POST']){
  let attempts=0;const client=createApiClient({readTimeout:10,writeTimeout:10,fetcher:async(_,options)=>{attempts++;assert.equal(options.redirect,'error');return stalled(options.signal);}});
  await assert.rejects(client('/fixture',method,method==='POST'?{title:'fixture'}:undefined),error=>error.code==='timeout'&&error.message.includes(method==='GET'?'응답이 늦어지고':'처리 결과를 확인하지 못했습니다'));
  assert.equal(attempts,1);
 }
});
test('API client bounds response body reads and rejects malformed shapes while keeping server errors',async()=>{
 const body=createApiClient({readTimeout:10,fetcher:async(_,options)=>({ok:true,json:()=>stalled(options.signal)})});await assert.rejects(body('/fixture'),{code:'timeout'});
 for(const value of [null,[],3,'login']){const client=createApiClient({fetcher:async()=>({ok:true,json:async()=>value})});await assert.rejects(client('/fixture'),{code:'response'});}
 const html=createApiClient({fetcher:async()=>({ok:true,json:async()=>{throw Error('HTML');}})});await assert.rejects(html('/fixture'),{code:'response'});
 const rejected=createApiClient({fetcher:async()=>({ok:false,json:async()=>({error:'이메일 인증 후 이용해주세요.'})})});await assert.rejects(rejected('/fixture'),error=>!error.code&&error.message==='이메일 인증 후 이용해주세요.');
});
test('API client serializes once, clears completed timers and classifies ordinary network failures separately',async()=>{
 let signal,body;const client=createApiClient({writeTimeout:10,fetcher:async(url,options)=>{assert.equal(url,'/api/fixture');signal=options.signal;body=options.body;return {ok:true,json:async()=>({saved:true})};}});
 assert.deepEqual(await client('/fixture','POST',{title:'fixture'}),{saved:true});assert.deepEqual(JSON.parse(body),{title:'fixture'});await new Promise(resolve=>setTimeout(resolve,25));assert.equal(signal.aborted,false);
 const offline=createApiClient({fetcher:async()=>{throw Error('offline');}});await assert.rejects(offline('/fixture'),{code:'connection'});
});
test('API client exposes HTTP status for login recovery without classifying permission errors as connectivity failures',async()=>{
 for(const status of [401,403,429]){const client=createApiClient({fetcher:async()=>({ok:false,status,json:async()=>({error:'서버 안내'})})});await assert.rejects(client('/fixture','POST',{}),error=>error.status===status&&!error.code&&error.message==='서버 안내');}
});
