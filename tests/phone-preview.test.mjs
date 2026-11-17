import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createPhonePreview} from '../server/phone-preview.mjs';
const origin='https://isolated-preview.trycloudflare.com';
async function request(app,path,{method='GET',host=new URL(origin).host,source=origin,data,cookie}={}){
 const req=Readable.from(data?[Buffer.from(JSON.stringify(data))]:[]);
 Object.assign(req,{url:path,method,headers:{host,origin:source,'content-type':'application/json',cookie},socket:{remoteAddress:'127.0.0.1'}});
 let raw;const headers={};const res={statusCode:200,setHeader:(k,v)=>headers[k.toLowerCase()]=v,end:v=>raw=v};
 await app.handle(req,res);return {status:res.statusCode,body:JSON.parse(raw),headers};
}
test('phone preview rejects foreign origins and hosts and protects existing database',async t=>{
 assert.throws(()=>createPhonePreview({origin,database:'data/hit.sqlite'}));
 assert.throws(()=>createPhonePreview({origin:'https://example.com',database:':memory:'}));
 const app=createPhonePreview({origin,database:':memory:'});t.after(app.close);
 assert.equal((await request(app,'/api/health',{host:'evil.test'})).status,403);
 assert.equal((await request(app,'/api/signup',{method:'POST',source:'https://evil.test',data:{}})).status,403);
 assert.equal((await request(app,'/api/health')).status,200);
 assert.equal((await request(app,'/api/dev/mail')).status,401);
});
test('isolated preview keeps verification and secure cookies and rewrites only text links',async t=>{
 const app=createPhonePreview({origin,database:':memory:'});t.after(app.close);
 const result=await request(app,'/api/signup',{method:'POST',data:{email:'phone@example.test',password:'preview-only-password-123',nickname:'아이폰 점검'}});
 assert.equal(result.status,201);assert.match(result.headers['set-cookie'],/; Secure/);
 const cookie=result.headers['set-cookie'].split(';')[0];await app.drainMail();
 const inbox=await request(app,'/api/dev/mail',{cookie});
 assert.equal(inbox.status,200);assert.ok(JSON.stringify(inbox.body).includes(origin));assert.ok(!JSON.stringify(inbox.body).includes('http://127.0.0.1:3002'));
 const blocked=await request(app,'/api/posts',{method:'POST',cookie,data:{}});assert.equal(blocked.status,403);
});
