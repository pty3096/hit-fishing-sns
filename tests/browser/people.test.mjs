import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import sharp from 'sharp';
import {mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {chromium} from 'playwright-core';
import {createApp} from '../../server/app.mjs';

// Isolated fixtures only: never connect these tests to the developer or phone-preview database.
const password='Only-local-ui-check-87651';
let folder,app,server,browser,origin,author;
const errors=[],fixtureCookies={};
before(async()=>{
  folder=mkdtempSync(join(tmpdir(),'hit-browser-fixture-'));
  const database=join(folder,'fixture.sqlite');
  server=http.createServer((req,res)=>app.handle(req,res));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin='http://127.0.0.1:'+server.address().port;
  app=createApp({database,origin});
  for(const [email,nickname] of [['ui-author@example.test','화면검증 낚시인'],['ui-viewer@example.test','화면검증 동료']]){
    const response=await fetch(origin+'/api/signup',{method:'POST',headers:{origin,'Content-Type':'application/json'},body:JSON.stringify({email,password,nickname})});
    assert.equal(response.status,201);
    fixtureCookies[email]=response.headers.get('set-cookie').split(';')[0];
    const account=await response.json();if(email==='ui-author@example.test')author=account.user.id;
  }
  const db=new DatabaseSync(database);
  db.exec('UPDATE users SET email_verified=1');
  db.prepare('UPDATE users SET bio=? WHERE id=?').run('<b>실제 사용자가 아닌 화면 검증용 소개</b>',author);
  db.close();
  const write=async(body,email='ui-author@example.test')=>{
    const response=await fetch(origin+'/api/posts',{method:'POST',headers:{origin,'Content-Type':'application/json',cookie:fixtureCookies[email]},body:JSON.stringify(body)});assert.equal(response.status,201);
  };
  await write({kind:'community',title:'화면검증 채비 질문',body:'실제 사용자 질문이 아닌 화면 검사 자료입니다.'});
  await write({kind:'community',title:'화면검증 장비 정보',body:'화면검증 채비 본문으로 검색합니다.'},'ui-viewer@example.test');
  const photo=(await sharp({create:{width:20,height:20,channels:3,background:'#157da4'}}).png().toBuffer()).toString('base64');
  await write({title:'화면검증 채비 조황',body:'실제 조황이 아닌 화면 검사 자료입니다.',fish:'농어',region:'강릉',method:'루어',fishing_date:'2026-11-18',photos:[{data:photo}]});
  browser=await chromium.launch({channel:process.env.HIT_BROWSER_CHANNEL||'chrome',headless:true});
});
after(async()=>{
  await browser?.close();
  if(server)await new Promise(resolve=>server.close(resolve));
  if(app){await app.drainMail();app.close();}
  if(folder)rmSync(folder,{recursive:true,force:true});
});
async function context(t,viewport={width:1280,height:900}){
  const context=await browser.newContext({viewport,locale:'ko-KR'});
  t.after(()=>context.close());
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  return page;
}
async function findPeople(page){
  await page.goto(origin+'/#people');
  await page.getByRole('heading',{name:'닉네임으로 만나보세요.',exact:true}).waitFor();
  await page.getByLabel('닉네임',{exact:true}).fill('화면검증');
  await page.getByRole('button',{name:'낚시인 검색',exact:true}).click();
  await page.locator('.people-result').first().waitFor();
  assert.equal(await page.locator('.people-result').count(),2);
}

test('nickname search handles empty, literal profile text, no matches, clear and history',async t=>{
  const page=await context(t);await findPeople(page);
  assert.equal(await page.locator('.people-result b').count(),0);
  assert.ok((await page.locator('.people-result .content').allTextContents()).some(text=>text.includes('<b>실제 사용자가')));
  await page.getByRole('link',{name:'화면검증 낚시인',exact:true}).click();
  await page.getByRole('heading',{name:'화면검증 낚시인',exact:true}).waitFor();
  await page.goBack();await page.locator('.people-result').first().waitFor();
  assert.equal(await page.getByLabel('닉네임',{exact:true}).inputValue(),'화면검증');
  await page.getByLabel('닉네임',{exact:true}).fill('없는사용자닉네임');
  await page.getByRole('button',{name:'낚시인 검색',exact:true}).click();
  await page.getByRole('heading',{name:'일치하는 낚시인이 없어요.',exact:true}).waitFor();
  await page.getByRole('link',{name:'검색 지우기',exact:true}).click();
  await page.getByRole('heading',{name:'닉네임으로 만나보세요.',exact:true}).waitFor();
  await page.getByLabel('닉네임',{exact:true}).fill('   ');
  await page.getByRole('button',{name:'낚시인 검색',exact:true}).click();
  await page.getByRole('alert').filter({hasText:'검색할 닉네임을 입력해주세요.'}).waitFor();
});

test('guest follow asks for login, returns to profile and reflects follow state in search',async t=>{
  const page=await context(t);await findPeople(page);
  await page.getByRole('link',{name:'화면검증 낚시인',exact:true}).click();
  await page.locator('#follow').click();
  await page.getByRole('heading',{name:'다시 만나 반가워요.',exact:true}).waitFor();
  await page.getByLabel('이메일',{exact:true}).fill('ui-viewer@example.test');
  await page.getByLabel('비밀번호 (12~128자)',{exact:true}).fill(password);
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await page.getByRole('heading',{name:'화면검증 낚시인',exact:true}).waitFor();
  assert.equal(await page.locator('#follow').getAttribute('aria-pressed'),'false');
  await page.locator('#follow').click();
  await page.locator('#follow[aria-pressed="true"]').waitFor();
  await page.goto(origin+'/#people?q='+encodeURIComponent('화면검증'));
  await page.locator('.people-result').first().waitFor();
  assert.equal(await page.getByRole('link',{name:'팔로잉 중 · 프로필 보기 →',exact:true}).count(),1);
  assert.equal(await page.getByRole('link',{name:'내 프로필 보기 →',exact:true}).count(),1);
});

test('home discovery and nickname results fit 320px and 390px without script errors',async t=>{
  const page=await context(t);
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    await page.goto(origin+'/#home');
    await page.getByRole('link',{name:'함께할 낚시인 찾기 닉네임 검색 →',exact:true}).click();
    await page.getByRole('heading',{name:'닉네임으로 만나보세요.',exact:true}).waitFor();
    await page.getByLabel('닉네임',{exact:true}).fill('화면검증');
    await page.getByRole('button',{name:'낚시인 검색',exact:true}).click();
    await page.locator('.people-result').first().waitFor();
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(layout.scroll<=layout.width,JSON.stringify(layout));
    const button=page.getByRole('button',{name:'낚시인 검색',exact:true});
    assert.ok((await button.boundingBox()).height>=44);
    if(process.env.HIT_UI_SCREENSHOTS){mkdirSync(process.env.HIT_UI_SCREENSHOTS,{recursive:true});await page.screenshot({path:join(process.env.HIT_UI_SCREENSHOTS,`people-${width}.png`),fullPage:true});}
  }
  assert.deepEqual(errors,[]);
});

async function searchAction(page,action){
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/posts'&&r.request().method()==='GET');
  await action();assert.equal((await response).status(),200);
  await page.locator('#main:not([aria-busy="true"])').waitFor();
}

test('community keyword search keeps author scope, all-author links, history and empty-state recovery',async t=>{
  const page=await context(t);
  await page.goto(origin+'/#community?author='+author);
  await page.getByLabel('제목·본문 검색',{exact:true}).fill('화면검증 채비');
  await searchAction(page,()=>page.getByRole('button',{name:'이야기 찾기',exact:true}).click());
  await page.locator('#posts .post-title').first().waitFor();
  assert.equal(await page.locator('#posts .post-title').count(),1);
  assert.equal(new URL(page.url()).hash.includes('author='+author),true);
  await searchAction(page,()=>page.getByRole('link',{name:'전체 이야기',exact:true}).click());
  await page.locator('#posts .post-title').first().waitFor();
  assert.equal(await page.locator('#posts .post-title').count(),2);
  assert.equal(await page.getByLabel('제목·본문 검색',{exact:true}).inputValue(),'화면검증 채비');
  await page.locator('#posts .post-title').filter({hasText:'화면검증 채비 질문'}).click();
  await page.getByRole('heading',{name:'화면검증 채비 질문',exact:true}).waitFor();
  await page.goBack();await page.locator('#posts .post-title').first().waitFor();
  assert.equal(await page.getByLabel('제목·본문 검색',{exact:true}).inputValue(),'화면검증 채비');
  await page.getByLabel('제목·본문 검색',{exact:true}).fill('없는게시글');
  await searchAction(page,()=>page.getByRole('button',{name:'이야기 찾기',exact:true}).click());
  await page.getByRole('heading',{name:'조건에 맞는 이야기가 없어요.',exact:true}).waitFor();
  await searchAction(page,()=>page.getByRole('link',{name:'검색어 지우기',exact:true}).click());
  await page.locator('#posts .post-title').first().waitFor();
  assert.equal(await page.getByLabel('제목·본문 검색',{exact:true}).inputValue(),'');
  assert.equal(await page.locator('#posts .post-title').count(),2);
});

test('catch keyword search combines fishing filters and dates, restores history and fits mobile layouts',async t=>{
  const page=await context(t);await page.goto(origin+'/#search');
  await page.getByLabel('제목·본문 검색',{exact:true}).fill('화면검증 채비');
  await page.getByLabel('어종',{exact:true}).fill('농어');
  await page.getByLabel('지역',{exact:true}).fill('강릉');
  await page.getByText('낚시 방식·출조 기간',{exact:true}).click();
  await page.locator('#method-filter').fill('루어');
  await page.locator('#date-from').fill('2026-11-18');await page.locator('#date-to').fill('2026-11-18');
  await searchAction(page,()=>page.locator('#search button[type=submit]').click());
  await page.locator('#posts .post-title').first().waitFor();assert.equal(await page.locator('#posts .post-title').count(),1);
  await page.locator('#posts .post-title').click();
  await page.getByRole('heading',{name:'화면검증 채비 조황',exact:true}).waitFor();
  await page.goBack();await page.locator('#posts .post-title').first().waitFor();
  assert.equal(await page.getByLabel('제목·본문 검색',{exact:true}).inputValue(),'화면검증 채비');
  assert.equal(await page.locator('#date-to').inputValue(),'2026-11-18');
  await page.getByLabel('어종',{exact:true}).fill('광어');await searchAction(page,()=>page.locator('#search button[type=submit]').click());
  await page.getByRole('heading',{name:'조건에 맞는 조황이 없어요.',exact:true}).waitFor();
  await searchAction(page,()=>page.getByRole('button',{name:'전체 보기',exact:true}).click());
  await page.locator('#posts .post-title').first().waitFor();assert.equal(await page.getByLabel('제목·본문 검색',{exact:true}).inputValue(),'');
  for(const width of [320,390])for(const route of ['search','community']){
    await page.setViewportSize({width,height:844});
    await page.goto(origin+'/#'+route+'?q='+encodeURIComponent('화면검증 채비'));
    await page.locator('#posts .post-title').first().waitFor();
    const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(layout.scroll<=layout.width,JSON.stringify(layout));
    if(process.env.HIT_UI_SCREENSHOTS){mkdirSync(process.env.HIT_UI_SCREENSHOTS,{recursive:true});await page.screenshot({path:join(process.env.HIT_UI_SCREENSHOTS,`${route}-${width}.png`),fullPage:true});}
  }
  assert.deepEqual(errors,[]);
});
