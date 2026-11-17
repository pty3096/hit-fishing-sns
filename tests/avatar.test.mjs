import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../server/app.mjs';
const origin='http://127.0.0.1:3000';
const password='avatar-testing-password-123';
async function request(app,method,path,data,cookie,overrides={}){
  const req=Readable.from(data===undefined?[]:[Buffer.from(JSON.stringify(data))]);
  Object.assign(req,{method,url:path,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...overrides},socket:{remoteAddress:'avatar-test'}});
  const headers={};let raw;
  const res={statusCode:200,setHeader(k,v){headers[k.toLowerCase()]=v;},end(v){raw=v;}};
  await app.handle(req,res);return{status:res.statusCode,body:headers['content-type']?.startsWith('image/')?Buffer.from(raw):JSON.parse(raw),headers,cookie:headers['set-cookie']?.split(';')[0]};
}
async function signup(app,email,verify=true){
  const result=await request(app,'POST','/api/signup',{email,password,nickname:email.split('@')[0]});
  assert.equal(result.status,201);
  if(verify){const mail=(await request(app,'GET','/api/dev/mail',undefined,result.cookie)).body.messages[0];assert.equal((await request(app,'POST','/api/email/verify',{token:mail.link.split('/').at(-1)})).status,200);}
  return result;
}
const source=await sharp({create:{width:120,height:80,channels:3,background:'#1589ad'}}).jpeg().withMetadata({orientation:6}).toBuffer();
const photo={data:source.toString('base64')};
const post={photos:[photo],title:'사진과 프로필',body:'아바타 반영 확인',fish:'농어',region:'강원 강릉시',method:'루어',fishing_date:'2026-11-17'};

test('avatar is normalized and reused in public profile, feed, comments and follow lists',async t=>{
  const app=createApp({database:':memory:'});t.after(app.close);
  const a=await signup(app,'avatar-a@example.test'),b=await signup(app,'avatar-b@example.test');
  const saved=await request(app,'PUT','/api/profile/photo',{photo},a.cookie);
  assert.equal(saved.status,200);const url=saved.body.user.avatar_url;assert.match(url,/^\/api\/avatars\/\d+\/[a-f0-9]{32}$/);
  const picture=await request(app,'GET',url);assert.equal(picture.headers['content-type'],'image/webp');
  const meta=await sharp(picture.body).metadata();assert.equal(meta.width,512);assert.equal(meta.height,512);assert.equal(meta.exif,undefined);assert.equal(meta.xmp,undefined);
  assert.equal((await request(app,'GET','/api/me',undefined,a.cookie)).body.user.avatar_url,url);
  assert.equal((await request(app,'GET','/api/users/'+a.body.user.id)).body.user.avatar_url,url);
  const p=(await request(app,'POST','/api/posts',post,a.cookie)).body.post;
  assert.equal(p.avatar_url,url);assert.equal((await request(app,'GET','/api/posts')).body.posts[0].avatar_url,url);
  await request(app,'POST','/api/posts/'+p.id+'/comments',{body:'내 댓글 사진'},a.cookie);
  assert.equal((await request(app,'GET','/api/posts/'+p.id+'/comments')).body.comments[0].avatar_url,url);
  await request(app,'PUT','/api/users/'+b.body.user.id+'/follow',{},a.cookie);
  assert.equal((await request(app,'GET','/api/users/'+b.body.user.id+'/followers')).body.users[0].avatar_url,url);
  const bUpload=await request(app,'PUT','/api/profile/photo',{photo,user_id:a.body.user.id},b.cookie);
  assert.notEqual(bUpload.body.user.avatar_url,url);
  assert.equal((await request(app,'GET','/api/users/'+a.body.user.id)).body.user.avatar_url,url);
});

test('avatar validation is atomic, updates require verification and old image URLs expire',async t=>{
  const app=createApp({database:':memory:'});t.after(app.close);
  const a=await signup(app,'avatar-validate@example.test'),unverified=await signup(app,'avatar-unverified@example.test',false);
  assert.equal((await request(app,'PUT','/api/profile/photo',{photo})).status,401);
  assert.equal((await request(app,'PUT','/api/profile/photo',{photo},unverified.cookie)).status,403);
  const old=(await request(app,'PUT','/api/profile/photo',{photo},a.cookie)).body.user.avatar_url;
  for(const invalid of [undefined,{data:'not an image'},{data:Buffer.from('<svg/>').toString('base64')}]){
    assert.equal((await request(app,'PUT','/api/profile/photo',{photo:invalid},a.cookie)).status,400);
    assert.equal((await request(app,'GET','/api/me',undefined,a.cookie)).body.user.avatar_url,old);
  }
  assert.equal((await request(app,'PUT','/api/profile/photo',{photo},a.cookie,{'content-length':String(15*1024*1024)})).status,413);
  assert.equal((await request(app,'PUT','/api/profile/photo',{photo},a.cookie,{origin:'https://other.example'})).status,403);
  const replacement=(await request(app,'PUT','/api/profile/photo',{photo},a.cookie)).body.user.avatar_url;
  assert.notEqual(replacement,old);assert.equal((await request(app,'GET',old)).status,404);
  assert.equal((await request(app,'DELETE','/api/profile/photo',{},a.cookie)).body.user.avatar_url,null);
  assert.equal((await request(app,'GET',replacement)).status,404);
});

test('avatar survives restart, respects blocking and suspension, is reviewable only by admins and is removed on withdrawal',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'hit-avatar-')),database=join(dir,'hit.sqlite');
  let app=createApp({database});t.after(()=>{app.close();rmSync(dir,{recursive:true,force:true});});
  const a=await signup(app,'avatar-persist@example.test'),b=await signup(app,'avatar-viewer@example.test');
  const url=(await request(app,'PUT','/api/profile/photo',{photo},a.cookie)).body.user.avatar_url;
  const report=(await request(app,'POST','/api/reports',{target_type:'user',target_id:a.body.user.id,reason:'프로필 사진 검토'},b.cookie)).body;
  app.close();app=createApp({database});
  assert.equal((await request(app,'GET','/api/me',undefined,a.cookie)).body.user.avatar_url,url);
  assert.equal((await request(app,'GET',url)).status,200);
  await request(app,'PUT','/api/blocks/'+a.body.user.id,{},b.cookie);
  assert.equal((await request(app,'GET',url,undefined,b.cookie)).status,404);
  assert.equal((await request(app,'GET',url)).status,200);
  const db=new DatabaseSync(database);db.prepare('UPDATE users SET suspended=1 WHERE id=?').run(a.body.user.id);db.prepare('UPDATE users SET is_admin=1 WHERE id=?').run(b.body.user.id);
  assert.equal((await request(app,'GET',url)).status,404);
  const adminURL=(await request(app,'GET','/api/admin/reports/'+report.id,undefined,b.cookie)).body.target.avatar_url;
  assert.equal((await request(app,'GET',adminURL)).status,401);
  assert.equal((await request(app,'GET',adminURL,undefined,a.cookie)).status,403);
  assert.equal((await request(app,'GET',adminURL,undefined,b.cookie)).status,200);
  assert.equal((await request(app,'DELETE','/api/account',{password,confirm:'탈퇴'},a.cookie)).status,200);
  assert.equal(db.prepare('SELECT count(*) n FROM avatars WHERE user_id=?').get(a.body.user.id).n,0);db.close();
  assert.equal((await request(app,'GET',url)).status,404);
  assert.equal((await request(app,'GET',adminURL,undefined,b.cookie)).status,404);
});
