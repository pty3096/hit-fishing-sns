import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createApp} from '../server/app.mjs';
import {readConfig} from '../server/config.mjs';
import {backupDatabase} from '../server/backup.mjs';
const origin='http://127.0.0.1:3000';
async function request(app,method,path,data,cookie,overrides={}){
  const req=Readable.from(data===undefined?[]:[Buffer.from(JSON.stringify(data))]);
  Object.assign(req,{method,url:path,headers:{origin,'content-type':'application/json',...(cookie?{cookie}:{}),...overrides},socket:{remoteAddress:'email-test'}});
  const headers={};let raw;
  const res={statusCode:200,setHeader(k,v){headers[k.toLowerCase()]=v;},end(value){raw=value;}};
  await app.handle(req,res);return{status:res.statusCode,body:JSON.parse(raw),headers,cookie:headers['set-cookie']?.split(';')[0]};
}
const credentials=email=>({email,password:'a-long-test-password-123',nickname:'이메일 검증'});
const tokenOf=mail=>mail.link.split('/').at(-1);
async function mailbox(app,cookie){return(await request(app,'GET','/api/dev/mail',undefined,cookie)).body.messages;}

test('onboarding enforces verification; local inbox is private and tokens are purpose-bound and single-use',async t=>{
  const app=createApp({database:':memory:'});t.after(app.close);
  const a=await request(app,'POST','/api/signup',credentials('verify-a@example.test'));
  assert.equal(a.body.user.email_verified,false);
  assert.equal((await request(app,'PATCH','/api/profile',{nickname:'검증',bio:''},a.cookie)).status,403);
  assert.equal((await request(app,'GET','/api/dev/mail')).status,401);
  const mail=(await mailbox(app,a.cookie))[0];assert.match(mail.link,/^http:\/\/127\.0\.0\.1:3000\/#verify\/[a-f0-9]{64}$/);
  const b=await request(app,'POST','/api/signup',credentials('verify-b@example.test'));
  assert.notEqual((await mailbox(app,b.cookie))[0].link,mail.link);
  assert.equal((await request(app,'POST','/api/password/reset',{token:tokenOf(mail),password:'new-password-value-123'})).status,400);
  assert.equal((await request(app,'POST','/api/email/verify',{token:tokenOf(mail)})).status,200);
  assert.equal((await request(app,'POST','/api/email/verify',{token:tokenOf(mail)})).status,400);
  assert.equal((await mailbox(app,a.cookie)).length,0);
  assert.equal((await request(app,'PATCH','/api/profile',{nickname:'인증 완료',bio:''},a.cookie)).status,200);
  assert.equal((await request(app,'GET','/api/me',undefined,a.cookie)).body.user.email_verified,true);
  assert.equal((await request(app,'GET','/api/dev/mail',undefined,a.cookie,{host:'attacker.example'})).status,403);
});

test('resending invalidates old links, expiry and persistent throttles apply',async t=>{
  let clock=Date.now();const app=createApp({database:':memory:',now:()=>clock});t.after(app.close);
  const a=await request(app,'POST','/api/signup',credentials('expiry@example.test'));
  const old=(await mailbox(app,a.cookie))[0];
  assert.equal((await request(app,'POST','/api/email/resend',{},a.cookie)).status,202);
  const latest=(await mailbox(app,a.cookie))[0];assert.notEqual(latest.link,old.link);
  assert.equal((await request(app,'POST','/api/email/verify',{token:tokenOf(old)})).status,400);
  clock+=86400001;
  assert.equal((await request(app,'POST','/api/email/verify',{token:tokenOf(latest)})).status,400);
  assert.equal((await request(app,'POST','/api/email/resend',{},a.cookie)).status,202);
  for(let i=0;i<4;i++)assert.equal((await request(app,'POST','/api/email/resend',{},a.cookie)).status,202);
  assert.equal((await request(app,'POST','/api/email/resend',{},a.cookie)).status,429);
});

test('password reset conceals existence, expires, revokes sessions and cannot be replayed concurrently',async t=>{
  let clock=Date.now();const app=createApp({database:':memory:',now:()=>clock});t.after(app.close);
  const account=await request(app,'POST','/api/signup',credentials('reset@example.test'));
  const exists=await request(app,'POST','/api/password/forgot',{email:'reset@example.test'});
  const absent=await request(app,'POST','/api/password/forgot',{email:'absent@example.test'});
  assert.equal(exists.status,202);assert.deepEqual(exists.body,absent.body);assert.equal(exists.body.token,undefined);
  const first=(await mailbox(app,account.cookie)).find(m=>m.link.includes('#reset/'));
  clock+=1800001;
  assert.equal((await request(app,'POST','/api/password/reset',{token:tokenOf(first),password:'new-password-long-123'})).status,400);
  await request(app,'POST','/api/password/forgot',{email:'reset@example.test'});
  const mail=(await mailbox(app,account.cookie)).find(m=>m.link.includes('#reset/'));
  const payload={token:tokenOf(mail),password:'new-password-long-123'};
  const responses=await Promise.all([request(app,'POST','/api/password/reset',payload),request(app,'POST','/api/password/reset',payload)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,400]);
  assert.equal((await request(app,'GET','/api/me',undefined,account.cookie)).body.user,null);
  assert.equal((await request(app,'POST','/api/login',credentials('reset@example.test'))).status,401);
  const login=await request(app,'POST','/api/login',{email:'reset@example.test',password:payload.password});
  assert.equal(login.status,200);assert.equal(login.body.user.email_verified,true);
  assert.equal((await mailbox(app,login.cookie)).length,0);
});

test('SMTP mode stores hashes only, hides development inbox and preserves suspension on reset',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'hit-mail-')),database=join(dir,'hit.sqlite'),sent=[];
  const app=createApp({database,origin:'https://hit.example.test',secure:true,production:true,mail:{localMailbox:false,sendMail:message=>sent.push(message)}});
  t.after(()=>{app.close();rmSync(dir,{recursive:true,force:true});});
  const headers={origin:'https://hit.example.test'};
  const a=await request(app,'POST','/api/signup',credentials('smtp@example.test'),undefined,headers);await app.drainMail();
  assert.equal(a.status,201);assert.match(a.headers['set-cookie'],/Secure/);assert.equal(sent.length,1);
  assert.equal((await request(app,'GET','/api/dev/mail',undefined,a.cookie)).status,404);
  const db=new DatabaseSync(database),token=sent[0].text.match(/#verify\/([a-f0-9]{64})/)[1];
  assert.notEqual(db.prepare('SELECT token_hash FROM auth_tokens').get().token_hash,token);
  assert.equal(db.prepare('SELECT count(*) n FROM dev_mail').get().n,0);
  db.prepare('UPDATE users SET suspended=1 WHERE id=?').run(a.body.user.id);
  await request(app,'POST','/api/password/forgot',{email:'smtp@example.test'},undefined,headers);await app.drainMail();
  const reset=sent.at(-1).text.match(/#reset\/([a-f0-9]{64})/)[1];
  assert.equal((await request(app,'POST','/api/password/reset',{token:reset,password:'new-smtp-password-123'},undefined,headers)).status,200);
  assert.equal(db.prepare('SELECT suspended FROM users').get().suspended,1);
  assert.equal((await request(app,'GET','/api/health')).body.status,'ok');
  assert.match((await request(app,'GET','/api/me')).headers['strict-transport-security'],/max-age/);
  db.close();
});

test('production config refuses local mail and unsafe origins without opening network connections',()=>{
  assert.throws(()=>readConfig({NODE_ENV:'production'}),/HTTPS/);
  assert.throws(()=>readConfig({APP_ORIGIN:'https://public.example',MAIL_MODE:'local'}),/local origin/);
  assert.throws(()=>readConfig({MAIL_MODE:'local',HOST:'0.0.0.0'}),/loopback/);
  assert.throws(()=>readConfig({APP_ORIGIN:'http://127.0.0.1:3000/path'}),/only a scheme/);
  assert.throws(()=>readConfig({NODE_ENV:'production',APP_ORIGIN:'https://hit.example.test',MAIL_MODE:'smtp'}),/HIT_DB/);
  assert.throws(()=>readConfig({NODE_ENV:'production',APP_ORIGIN:'https://hit.example.test',MAIL_MODE:'smtp',HIT_DB:'/tmp/hit.sqlite'}),/SMTP_HOST/);
  const config=readConfig({NODE_ENV:'production',APP_ORIGIN:'https://hit.example.test',MAIL_MODE:'smtp',HIT_DB:'/tmp/hit.sqlite',SMTP_HOST:'smtp.example.test',SMTP_USER:'example',SMTP_PASS:'not-a-real-password',MAIL_FROM:'HIT <mail@example.test>'});
  assert.equal(config.secure,true);assert.equal(config.host,'0.0.0.0');assert.equal(config.mail.localMailbox,false);
  assert.equal(readConfig({}).mail.localMailbox,true);
});

test('backup restores a usable database including account verification and data migration',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'hit-backup-')),database=join(dir,'source.sqlite'),destination=join(dir,'copy.sqlite');
  const app=createApp({database});t.after(()=>{app.close();rmSync(dir,{recursive:true,force:true});});
  const a=await request(app,'POST','/api/signup',credentials('backup@example.test'));
  await request(app,'POST','/api/email/verify',{token:tokenOf((await mailbox(app,a.cookie))[0])});
  await backupDatabase(database,destination);
  const restored=createApp({database:destination});
  try{
    const login=await request(restored,'POST','/api/login',credentials('backup@example.test'));
    assert.equal(login.status,200);assert.equal(login.body.user.email_verified,true);
    assert.equal((await request(restored,'GET','/api/health')).status,200);
    const db=new DatabaseSync(destination);assert.equal(db.prepare('PRAGMA user_version').get().user_version,4);db.close();
  }finally{restored.close();}
});
