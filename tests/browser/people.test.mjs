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
let folder,app,server,browser,origin,author,commentPostId,commentId;
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
    const response=await fetch(origin+'/api/posts',{method:'POST',headers:{origin,'Content-Type':'application/json',cookie:fixtureCookies[email]},body:JSON.stringify(body)});assert.equal(response.status,201);return (await response.json()).post;
  };
  await write({kind:'community',title:'화면검증 채비 질문',body:'실제 사용자 질문이 아닌 화면 검사 자료입니다.'});
  await write({kind:'community',title:'화면검증 장비 정보',body:'화면검증 채비 본문으로 검색합니다.'},'ui-viewer@example.test');
  const photo=(await sharp({create:{width:20,height:20,channels:3,background:'#157da4'}}).png().toBuffer()).toString('base64');
  commentPostId=(await write({title:'화면검증 채비 조황',body:'실제 조황이 아닌 화면 검사 자료입니다.',fish:'농어',region:'강릉',method:'루어',fishing_date:'2026-11-18',photos:[{data:photo}]})).id;
  await write({kind:'market',title:'화면검증 상품 글',body:'실제 판매 상품이 아닌 화면 검사 자료입니다.',region:'강릉',price:15000,photos:[{data:photo}]});
  const commentResponse=await fetch(origin+'/api/posts/'+commentPostId+'/comments',{method:'POST',headers:{origin,'Content-Type':'application/json',cookie:fixtureCookies['ui-viewer@example.test']},body:JSON.stringify({body:'화면검증 댓글 원문'})});assert.equal(commentResponse.status,201);commentId=(await commentResponse.json()).id;
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

test('my posts requires login, isolates ownership, preserves filters and opens existing editing safely',async t=>{
 const page=await context(t);
 await page.goto(origin+'/#my-posts?'+new URLSearchParams({kind:'community',q:'화면검증'}));
 await page.getByRole('heading',{name:'다시 만나 반가워요.',exact:true}).waitFor();
 await page.getByLabel('이메일',{exact:true}).fill('ui-author@example.test');await page.getByLabel('비밀번호 (12~128자)',{exact:true}).fill(password);
 await page.getByRole('button',{name:'로그인',exact:true}).click();
 await page.getByRole('heading',{name:'내 글 관리',exact:true}).waitFor();
 assert.equal(await page.locator('.managed-post').count(),1);assert.match(await page.locator('.managed-post h2').innerText(),/채비 질문/);
 await searchAction(page,()=>page.locator('.tabs').getByRole('link',{name:'장터',exact:true}).click());
 assert.equal(await page.locator('.managed-post').count(),1);assert.match(await page.locator('.managed-post h2').innerText(),/상품 글/);
 assert.equal(await page.getByLabel('내 글 제목·본문 검색',{exact:true}).inputValue(),'화면검증');
 await searchAction(page,()=>page.locator('.tabs').getByRole('link',{name:'조황',exact:true}).click());
 assert.match(await page.locator('.managed-post h2').innerText(),/채비 조황/);
 if(process.env.HIT_UI_SCREENSHOTS){mkdirSync(process.env.HIT_UI_SCREENSHOTS,{recursive:true});await page.locator('#toast').waitFor({state:'hidden'});await page.screenshot({path:join(process.env.HIT_UI_SCREENSHOTS,'my-posts-desktop.png'),fullPage:true});}
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});
  const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(layout.scroll<=layout.width,JSON.stringify(layout));
  if(process.env.HIT_UI_SCREENSHOTS){mkdirSync(process.env.HIT_UI_SCREENSHOTS,{recursive:true});await page.screenshot({path:join(process.env.HIT_UI_SCREENSHOTS,`my-posts-${width}.png`),fullPage:true});}
 }
 await searchAction(page,()=>page.locator('.tabs').getByRole('link',{name:'커뮤니티',exact:true}).click());
 await page.getByRole('link',{name:'수정하기',exact:true}).click();
 await page.getByRole('heading',{name:'커뮤니티 글 수정',exact:true}).waitFor();
 const updated='화면검증 채비 질문 · 관리 수정 확인';await page.getByLabel('제목',{exact:true}).fill(updated);
 await page.getByRole('button',{name:'수정 저장',exact:true}).click();await page.getByRole('heading',{name:updated,exact:true}).waitFor();
 await page.goBack();await page.getByRole('heading',{name:'커뮤니티 글 수정',exact:true}).waitFor();
 await page.goBack();await page.getByRole('heading',{name:'내 글 관리',exact:true}).waitFor();
 assert.equal(await page.getByLabel('내 글 제목·본문 검색',{exact:true}).inputValue(),'화면검증');assert.equal(await page.locator('.managed-post h2').innerText(),updated);
 await page.getByLabel('내 글 제목·본문 검색',{exact:true}).fill('없는내게시글');
 await searchAction(page,()=>page.getByRole('button',{name:'내 글 찾기',exact:true}).click());
 await page.getByRole('heading',{name:'조건에 맞는 내 이야기가 없어요.',exact:true}).waitFor();
 await searchAction(page,()=>page.getByRole('link',{name:'검색어 지우기',exact:true}).click());
 assert.equal(await page.locator('.managed-post').count(),1);assert.equal(await page.getByLabel('내 글 제목·본문 검색',{exact:true}).inputValue(),'');
 assert.deepEqual(errors,[]);
});

test('comment owner can cancel, recover from a failed edit and save literal text without losing a new comment draft',async t=>{
 const page=await context(t);await page.goto(origin+'/#login');
 await page.getByLabel('이메일',{exact:true}).fill('ui-viewer@example.test');await page.getByLabel('비밀번호 (12~128자)',{exact:true}).fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click();
 await page.getByRole('heading',{name:'화면검증 동료',exact:true}).waitFor();await page.goto(origin+'/#post/'+commentPostId);
 const article=page.locator('[data-comment-id="'+commentId+'"]');await article.waitFor();
 await article.getByRole('button',{name:'댓글 수정',exact:true}).click();
 const field=article.getByLabel('댓글 수정 내용',{exact:true});assert.equal(await field.inputValue(),'화면검증 댓글 원문');
 const edited='화면검증 수정 댓글 <b>문자 그대로</b>';
 await field.fill(edited);
 await page.locator('#comment').fill('아직 전송하지 않은 새 댓글');await page.getByRole('button',{name:'댓글 등록',exact:true}).click();
 await page.locator('#comment-form [role=alert]').filter({hasText:'수정 중인 댓글'}).waitFor();
 const pattern='**/api/comments/'+commentId;await page.route(pattern,route=>route.abort('failed'));
 await article.getByRole('button',{name:'댓글 수정 저장',exact:true}).click();
 await article.getByRole('alert').filter({hasText:'연결이 끊겼습니다.'}).waitFor();assert.equal(await field.inputValue(),edited);
 await article.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await article.locator('[data-comment-body]').innerText(),'화면검증 댓글 원문');await page.unroute(pattern);
 await article.getByRole('button',{name:'댓글 수정',exact:true}).click();await article.getByLabel('댓글 수정 내용',{exact:true}).fill(edited);
 const leaving=page.waitForEvent('dialog'),navigation=page.locator('.nav-write').click();const dialog=await leaving;assert.match(dialog.message(),/댓글 수정/);await dialog.dismiss();await navigation;await page.waitForURL(origin+'/#post/'+commentPostId);assert.equal(await article.getByLabel('댓글 수정 내용',{exact:true}).inputValue(),edited);
 await article.getByRole('button',{name:'댓글 수정 저장',exact:true}).click();await article.locator('.comment-edit-form').waitFor({state:'detached'});
 assert.equal(await article.locator('[data-comment-body]').innerText(),edited);assert.equal(await article.locator('[data-comment-body] b').count(),0);
 assert.equal(await page.locator('#comment').inputValue(),'아직 전송하지 않은 새 댓글');assert.equal(await page.locator('#comment-form [role=alert]').isVisible(),false);assert.equal(await page.locator('[data-comment-id]').count(),1);
 await article.getByRole('button',{name:'댓글 수정',exact:true}).click();
 if(process.env.HIT_UI_SCREENSHOTS)await page.locator('#toast').waitFor({state:'hidden'});
 for(const width of [320,390]){
  await page.setViewportSize({width,height:844});const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(layout.scroll<=layout.width,JSON.stringify(layout));
  if(process.env.HIT_UI_SCREENSHOTS){mkdirSync(process.env.HIT_UI_SCREENSHOTS,{recursive:true});await article.screenshot({path:join(process.env.HIT_UI_SCREENSHOTS,`comment-edit-${width}.png`)});}
 }
 await article.getByRole('button',{name:'취소',exact:true}).click();
 const guest=await context(t);await guest.goto(origin+'/#post/'+commentPostId);await guest.locator('[data-comment-id="'+commentId+'"]').waitFor();assert.equal(await guest.locator('[data-edit-comment]').count(),0);
 await article.getByRole('button',{name:'댓글 수정',exact:true}).click();await article.getByLabel('댓글 수정 내용',{exact:true}).fill('화면검증 이동 후 저장 확인');
 let held,arrived;const pendingRequest=new Promise(resolve=>arrived=resolve);await page.route(pattern,route=>{held=route;arrived();});
 await article.getByRole('button',{name:'댓글 수정 저장',exact:true}).click();await pendingRequest;
 const pendingDialog=page.waitForEvent('dialog'),moving=page.getByRole('link',{name:'조황 글쓰기',exact:true}).click();const warning=await pendingDialog;assert.match(warning.message(),/이동해도 수정이 반영/);await warning.accept();await moving;
 await page.getByRole('heading',{name:'오늘의 조황 남기기',exact:true}).waitFor();await page.getByLabel('제목',{exact:true}).fill('화면검증 새 조황 작성 중');
 const saved=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/comments/'+commentId&&r.request().method()==='PATCH');await held.continue();assert.equal((await saved).status(),200);
 assert.equal(await page.getByLabel('제목',{exact:true}).inputValue(),'화면검증 새 조황 작성 중');
 assert.deepEqual(errors,[]);
});

test('public share buttons copy applied filters, reopen correctly and offer a mobile fallback when clipboard is denied',async t=>{
 const page=await context(t);await page.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.__copiedShare=text;}}}));
 const fields={q:'화면검증 채비',region:'강릉',method:'루어',date_from:'2026-11-18',date_to:'2026-11-18',token:'not-a-real-token',mine:'1'};
 await page.goto(origin+'/?token=not-a-real-root-token#search?'+new URLSearchParams(fields));await page.locator('#posts .post-title').first().waitFor();
 assert.equal(await page.evaluate(()=>window.__copiedShare),undefined);
 await page.getByLabel('제목·본문 검색',{exact:true}).fill('아직 검색하지 않은 입력');await page.getByRole('button',{name:'링크 복사',exact:true}).click();
 const copied=await page.evaluate(()=>window.__copiedShare),url=new URL(copied),params=new URLSearchParams(url.hash.split('?')[1]);
 assert.equal(url.search,'');assert.equal(params.get('q'),'화면검증 채비');assert.equal(params.get('token'),null);assert.equal(params.get('mine'),null);assert.equal(params.get('date_to'),'2026-11-18');
 const receiver=await context(t);await receiver.goto(copied);await receiver.locator('#posts .post-title').first().waitFor();assert.equal(await receiver.getByLabel('제목·본문 검색',{exact:true}).inputValue(),'화면검증 채비');
 for(const hash of ['#post/'+commentPostId,'#community?'+new URLSearchParams({q:'화면검증',author:String(author)}),'#market?'+new URLSearchParams({status:'selling',q:'화면검증',region:'강릉',min_price:'0',max_price:'15000',author:String(author)})]){
  await page.goto(origin+'/'+hash);await page.getByRole('button',{name:'링크 복사',exact:true}).waitFor();await page.getByRole('button',{name:'링크 복사',exact:true}).click();
  const shared=await page.evaluate(()=>window.__copiedShare);assert.equal(shared,origin+'/'+hash);
 }
 const fallback=await context(t);await fallback.addInitScript(()=>Object.defineProperty(navigator,'clipboard',{value:{writeText:async()=>{throw new DOMException('Denied','NotAllowedError');}}}));
 await fallback.goto(origin+'/#community?'+new URLSearchParams({q:'화면검증 & 50%_ ?'}));await fallback.getByRole('button',{name:'링크 복사',exact:true}).click();
 const field=fallback.getByLabel('복사할 공유 링크',{exact:true});await field.waitFor();assert.equal(await field.getAttribute('readonly'),'');assert.ok((await field.inputValue()).startsWith(origin+'/#community?'));
 assert.equal(await fallback.getByText('공유 링크를 복사했습니다.',{exact:true}).isVisible(),false);
 for(const width of [320,390]){
  await fallback.setViewportSize({width,height:844});const layout=await fallback.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(layout.scroll<=layout.width,JSON.stringify(layout));
  if(process.env.HIT_UI_SCREENSHOTS){mkdirSync(process.env.HIT_UI_SCREENSHOTS,{recursive:true});await fallback.locator('.share-controls').screenshot({path:join(process.env.HIT_UI_SCREENSHOTS,`share-link-${width}.png`)});}
 }
 await fallback.getByRole('button',{name:'닫기',exact:true}).click();await field.waitFor({state:'hidden'});assert.deepEqual(errors,[]);
});

test('real signup and verification survive reload and resume the requested first community post',async t=>{
 const page=await context(t);await page.goto(origin+'/#community-write');await page.getByRole('heading',{name:'다시 만나 반가워요.',exact:true}).waitFor();
 await page.getByRole('link',{name:'처음이신가요? 회원가입 →',exact:true}).click();
 await page.getByLabel('닉네임',{exact:true}).fill('가입흐름 화면검증');await page.getByLabel('이메일',{exact:true}).fill('ui-onboarding@example.test');await page.getByLabel('비밀번호 (12~128자)',{exact:true}).fill(password);
 await page.getByRole('button',{name:'회원가입',exact:true}).click();await page.getByRole('heading',{name:'내 계정 설정',exact:true}).waitFor();
 await page.reload();await page.getByRole('heading',{name:'내 계정 설정',exact:true}).waitFor();
 await page.getByRole('link',{name:'개발용 메일함 열기 →',exact:true}).click();
 await page.locator('article').filter({hasText:'히트 HIT 이메일 인증'}).getByRole('link',{name:'안내 열기 →',exact:true}).click();
 await page.getByRole('button',{name:'이메일 인증 완료하기',exact:true}).click();await page.getByRole('heading',{name:'커뮤니티 글쓰기',exact:true}).waitFor();assert.ok(!page.url().includes('verify/'));
 await page.getByLabel('제목',{exact:true}).fill('가입·인증 화면검증 첫 글');await page.getByLabel('이야기',{exact:true}).fill('실제 이용자 글이 아닌 가입 흐름 검증 자료입니다.');
 if(process.env.HIT_UI_SCREENSHOTS){mkdirSync(process.env.HIT_UI_SCREENSHOTS,{recursive:true});await page.locator('#toast').waitFor({state:'hidden'});await page.screenshot({path:join(process.env.HIT_UI_SCREENSHOTS,'onboarding-first-post.png'),fullPage:true});}
 await page.getByRole('button',{name:'글 등록',exact:true}).click();await page.getByRole('heading',{name:'가입·인증 화면검증 첫 글',exact:true}).waitFor();
});

test('password recovery rejects mismatched confirmation, revokes old sessions and resumes the original task after login',async t=>{
 const observer=await context(t);await observer.goto(origin+'/#login');await observer.getByLabel('이메일',{exact:true}).fill('ui-viewer@example.test');await observer.getByLabel('비밀번호 (12~128자)',{exact:true}).fill(password);await observer.getByRole('button',{name:'로그인',exact:true}).click();await observer.getByRole('heading',{name:'화면검증 동료',exact:true}).waitFor();
 const page=await context(t);await page.goto(origin+'/#write');await page.getByRole('heading',{name:'다시 만나 반가워요.',exact:true}).waitFor();
 await page.getByRole('link',{name:'비밀번호를 잊으셨나요? →',exact:true}).click();await page.getByRole('heading',{name:'비밀번호 찾기',exact:true}).waitFor();await page.getByLabel('이메일',{exact:true}).fill('ui-viewer@example.test');await page.getByRole('button',{name:'재설정 안내 받기',exact:true}).click();await page.getByRole('heading',{name:'메일함을 확인해주세요.',exact:true}).waitFor();
 await observer.goto(origin+'/#mailbox');const resetLink=observer.locator('article').filter({hasText:'히트 HIT 비밀번호 재설정'}).getByRole('link',{name:'안내 열기 →',exact:true});await resetLink.waitFor();const link=await resetLink.getAttribute('href');
 await page.goto(link);await page.getByRole('heading',{name:'새 비밀번호 설정',exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'새 비밀번호 설정',exact:true}).waitFor();
 const changed='Only-local-ui-reset-98765';await page.getByLabel('새 비밀번호 (12~128자)',{exact:true}).fill(changed);await page.getByLabel('새 비밀번호 확인',{exact:true}).fill('different-confirmation-value');await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();await page.getByRole('alert').filter({hasText:'두 비밀번호가 일치하지 않습니다.'}).waitFor();
 await page.getByLabel('새 비밀번호 확인',{exact:true}).fill(changed);await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();await page.getByRole('heading',{name:'다시 만나 반가워요.',exact:true}).waitFor();assert.ok(!page.url().includes('reset/'));
 assert.equal((await (await observer.request.get(origin+'/api/me')).json()).user,null);
 await page.getByLabel('이메일',{exact:true}).fill('ui-viewer@example.test');await page.getByLabel('비밀번호 (12~128자)',{exact:true}).fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click();await page.getByRole('alert').filter({hasText:'이메일 또는 비밀번호를 확인해주세요.'}).waitFor();
 await page.getByLabel('비밀번호 (12~128자)',{exact:true}).fill(changed);await page.getByRole('button',{name:'로그인',exact:true}).click();await page.getByRole('heading',{name:'오늘의 조황 남기기',exact:true}).waitFor();assert.deepEqual(errors,[]);
});

test('verification response recovery removes the used token and offers the preserved next task',async t=>{
 const page=await context(t);await page.goto(origin+'/#market-write');await page.getByRole('heading',{name:'다시 만나 반가워요.',exact:true}).waitFor();await page.getByRole('link',{name:'처음이신가요? 회원가입 →',exact:true}).click();
 await page.getByLabel('닉네임',{exact:true}).fill('인증복구 화면검증');await page.getByLabel('이메일',{exact:true}).fill('ui-verification-recovery@example.test');await page.getByLabel('비밀번호 (12~128자)',{exact:true}).fill(password);await page.getByRole('button',{name:'회원가입',exact:true}).click();await page.getByRole('heading',{name:'내 계정 설정',exact:true}).waitFor();
 await page.getByRole('link',{name:'개발용 메일함 열기 →',exact:true}).click();await page.locator('article').filter({hasText:'히트 HIT 이메일 인증'}).getByRole('link',{name:'안내 열기 →',exact:true}).click();await page.getByRole('heading',{name:'이메일 인증',exact:true}).waitFor();
 let failed=false;await page.route('**/api/me',route=>{if(!failed){failed=true;return route.abort('failed');}return route.continue();});
 await page.getByRole('button',{name:'이메일 인증 완료하기',exact:true}).click();await page.getByRole('heading',{name:'하던 작업을 계속할까요?',exact:true}).waitFor();assert.ok(!page.url().includes('verify/'));
 await page.getByRole('link',{name:'이어서 진행하기',exact:true}).click();await page.getByRole('heading',{name:'장터 상품 등록',exact:true}).waitFor();assert.deepEqual(errors,[]);
});

test('mobile authentication fits narrow screens and password visibility controls preserve values without submitting',async t=>{
 for(const width of [320,390]){
  const page=await context(t,{width,height:844});
  for(const [route,heading] of [['login','다시 만나 반가워요.'],['signup','첫 기록을 시작해요.'],['forgot','비밀번호 찾기'],['verify/'+'b'.repeat(64),'이메일 인증'],['reset/'+'b'.repeat(64),'새 비밀번호 설정']]){
   await page.goto(origin+'/#'+route);await page.getByRole('heading',{name:heading,exact:true}).waitFor();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   for(const input of await page.locator('main input').all())assert.ok(Number(await input.evaluate(el=>parseFloat(getComputedStyle(el).fontSize)))>=16);
   const controls=page.locator('.password-toggle');
   for(let i=0;i<await controls.count();i++){
    const button=controls.nth(i),target=await button.getAttribute('aria-controls'),input=page.locator('#'+target);await input.fill('Only-local-visible-12345');
    assert.equal(await input.getAttribute('type'),'password');assert.ok((await button.boundingBox()).height>=44);
    await button.click();assert.equal(await input.getAttribute('type'),'text');assert.equal(await button.getAttribute('aria-pressed'),'true');assert.equal(await input.inputValue(),'Only-local-visible-12345');assert.ok(page.url().endsWith('#'+route));
    await button.press('Space');assert.equal(await input.getAttribute('type'),'password');assert.equal(await button.getAttribute('aria-pressed'),'false');
   }
   if(route.startsWith('reset/')){
    await page.getByLabel('새 비밀번호 확인',{exact:true}).fill('different-confirmation-12345');await page.getByRole('button',{name:'비밀번호 변경',exact:true}).click();await page.getByRole('alert').filter({hasText:'두 비밀번호가 일치하지 않습니다.'}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   }
  }
 }
 assert.deepEqual(errors,[]);
});

test('avatar selection cancels safely, rejects a replacement without saving an older choice and retries failed uploads',async t=>{
 const page=await context(t,{width:390,height:844});await page.goto(origin+'/#login');await page.getByLabel('이메일',{exact:true}).fill('ui-author@example.test');await page.getByLabel('비밀번호 (12~128자)',{exact:true}).fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click();await page.getByRole('heading',{name:'화면검증 낚시인',exact:true}).waitFor();
 await page.goto(origin+'/#profile-edit');await page.getByRole('heading',{name:'나를 소개해요',exact:true}).waitFor();
 const picker=page.locator('#avatar-file'),cancel=page.getByRole('button',{name:'사진 선택 취소',exact:true});
 const png=await sharp({create:{width:24,height:24,channels:3,background:'#0d8dff'}}).png().toBuffer(),file={name:'fixture.png',mimeType:'image/png',buffer:png};
 await picker.setInputFiles(file);await cancel.waitFor();assert.ok((await page.locator('#avatar-preview img').getAttribute('src')).startsWith('blob:'));
 await cancel.click();assert.equal(await page.locator('#avatar-preview img').count(),0);assert.equal(await picker.getAttribute('required'),'');await cancel.waitFor({state:'hidden'});
 await picker.setInputFiles(file);await picker.setInputFiles({name:'fixture.heic',mimeType:'image/heic',buffer:Buffer.from('not a real photo')});await page.locator('#avatar-error').filter({hasText:'HEIC'}).waitFor();assert.equal(await picker.getAttribute('aria-invalid'),'true');assert.equal(await page.locator('#avatar-preview img').count(),0);await cancel.waitFor({state:'hidden'});assert.equal(await picker.evaluate(el=>el.files.length),0);
 await picker.setInputFiles(file);assert.equal(await picker.getAttribute('aria-invalid'),null);
 let failed=false;await page.route('**/api/profile/photo',async route=>{if(route.request().method()==='PUT'&&!failed){failed=true;return route.abort('failed');}return route.continue();});
 await page.getByRole('button',{name:'사진 저장',exact:true}).click();await page.locator('#avatar-status').filter({hasText:'사진을 저장하지 못했습니다.'}).waitFor();assert.equal(await cancel.isEnabled(),true);assert.ok((await page.locator('#avatar-preview img').getAttribute('src')).startsWith('blob:'));
 await page.getByRole('button',{name:'사진 저장',exact:true}).click();await page.locator('#avatar-preview img[src^="/api/"]').waitFor();await cancel.waitFor({state:'hidden'});const saved=await page.locator('#avatar-preview img').getAttribute('src');
 await picker.setInputFiles(file);await cancel.click();assert.equal(await page.locator('#avatar-preview img').getAttribute('src'),saved);
 for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 assert.deepEqual(errors,[]);
});

test('post submission freezes its snapshot, preserves drafts during navigation and restores editing after failure',async t=>{
 const page=await context(t,{width:390,height:844});await page.goto(origin+'/#login');await page.getByLabel('이메일',{exact:true}).fill('ui-author@example.test');await page.getByLabel('비밀번호 (12~128자)',{exact:true}).fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click();await page.getByRole('heading',{name:'화면검증 낚시인',exact:true}).waitFor();
 await page.goto(origin+'/#community-write');await page.getByRole('heading',{name:'커뮤니티 글쓰기',exact:true}).waitFor();await page.getByLabel('제목',{exact:true}).fill('전송잠금 화면검증 글');await page.getByLabel('이야기',{exact:true}).fill('실제 이용자 게시물이 아닌 전송 복구 검증 자료입니다.');
 const png=await sharp({create:{width:24,height:24,channels:3,background:'#123453'}}).png().toBuffer();await page.locator('#photos').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:png});await page.getByRole('button',{name:'사진 1 삭제',exact:true}).waitFor();
 let release,entered;const held=new Promise(resolve=>release=resolve),started=new Promise(resolve=>entered=resolve),payloads=[];
 await page.route('**/api/posts',async route=>{if(route.request().method()!=='POST')return route.continue();payloads.push(route.request().postDataJSON());if(payloads.length===1){entered();await held;return route.abort('failed');}return route.continue();});
 await page.getByRole('button',{name:'글 등록',exact:true}).click();await started;
 for(const control of await page.locator('#post-form input,#post-form textarea,#post-form button').all())assert.equal(await control.isDisabled(),true);
 page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('link',{name:'← 커뮤니티로',exact:true}).click();await page.waitForFunction(()=>location.hash==='#community-write');
 assert.equal(await page.getByLabel('제목',{exact:true}).inputValue(),'전송잠금 화면검증 글');
 const drafts=await page.evaluate(()=>Object.entries(sessionStorage).filter(([key])=>key.startsWith('hit-draft')).map(([,value])=>value).join(''));assert.ok(drafts.includes('전송잠금 화면검증 글'));
 release();await page.locator('#post-form [role=alert]:not([hidden])').waitFor();assert.equal(await page.getByRole('button',{name:'사진 1 삭제',exact:true}).isEnabled(),true);assert.equal(await page.getByLabel('제목',{exact:true}).isEnabled(),true);assert.equal(await page.locator('#photo-preview img').count(),1);
 await page.getByRole('button',{name:'글 등록',exact:true}).click();await page.getByRole('heading',{name:'전송잠금 화면검증 글',exact:true}).waitFor();assert.equal(payloads.length,2);assert.deepEqual(payloads[0],payloads[1]);assert.equal(await page.locator('.gallery img').count(),1);assert.deepEqual(errors,[]);
});

test('photo ordering changes the cover and persists new and existing photo order',async t=>{
 const page=await context(t,{width:390,height:844});await page.goto(origin+'/#login');await page.getByLabel('이메일',{exact:true}).fill('ui-author@example.test');await page.getByLabel('비밀번호 (12~128자)',{exact:true}).fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click();await page.getByRole('heading',{name:'화면검증 낚시인',exact:true}).waitFor();
 await page.goto(origin+'/#community-write');await page.getByRole('heading',{name:'커뮤니티 글쓰기',exact:true}).waitFor();await page.getByLabel('제목',{exact:true}).fill('사진순서 화면검증 글');await page.getByLabel('이야기',{exact:true}).fill('실제 게시물이 아닌 대표 사진 검증 자료입니다.');
 const files=[];for(const [name,background] of [['red.png','#ee2222'],['blue.png','#2222ee']])files.push({name,mimeType:'image/png',buffer:await sharp({create:{width:24,height:24,channels:3,background}}).png().toBuffer()});await page.locator('#photos').setInputFiles(files);
 assert.equal(await page.getByRole('button',{name:'사진 1 앞으로',exact:true}).isDisabled(),true);assert.equal(await page.getByRole('button',{name:'사진 2 뒤로',exact:true}).isDisabled(),true);
 await page.getByRole('button',{name:'사진 2 앞으로',exact:true}).click();assert.ok(await page.locator('#photo-preview>div').first().textContent().then(text=>text.includes('대표 사진')));
 for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 const create=page.waitForRequest(request=>request.url()===origin+'/api/posts'&&request.method()==='POST');await page.getByRole('button',{name:'글 등록',exact:true}).click();const created=await create;assert.equal(created.postDataJSON().photos[0].data,files[1].buffer.toString('base64'));await page.getByRole('heading',{name:'사진순서 화면검증 글',exact:true}).waitFor();
 const first=await page.locator('.gallery img').first().getAttribute('src'),blue=await sharp(await (await page.request.get(origin+first)).body()).stats();assert.ok(blue.channels[2].mean>blue.channels[0].mean);
 const originals=await page.locator('.gallery img').evaluateAll(images=>images.map(img=>img.getAttribute('src').split('/').pop()));await page.getByRole('link',{name:'수정',exact:true}).click();await page.getByRole('heading',{name:'커뮤니티 글 수정',exact:true}).waitFor();await page.getByRole('button',{name:'사진 1 뒤로',exact:true}).click();
 const patch=page.waitForRequest(request=>request.url().includes('/api/posts/')&&request.method()==='PATCH');await page.getByRole('button',{name:'수정 저장',exact:true}).click();assert.deepEqual((await patch).postDataJSON().photos,originals.reverse().map(id=>({id})));await page.getByRole('heading',{name:'사진순서 화면검증 글',exact:true}).waitFor();await page.reload();await page.getByRole('heading',{name:'사진순서 화면검증 글',exact:true}).waitFor();
 const changed=await page.locator('.gallery img').first().getAttribute('src'),red=await sharp(await (await page.request.get(origin+changed)).body()).stats();assert.ok(red.channels[0].mean>red.channels[2].mean);assert.deepEqual(errors,[]);
});

test('preview connection failures offer explicit top-level reconnect without mistaking application errors for authentication',async t=>{
 const page=await context(t,{width:390,height:844});await page.route('**/api/meta',async route=>{const response=await route.fetch();return route.fulfill({response,json:{...await response.json(),phone_preview:true}});});
 let failure='network';await page.route('**/api/posts',route=>{if(failure==='network')return route.abort('failed');if(failure==='html')return route.fulfill({status:200,contentType:'text/html',body:'<html>access login</html>'});if(failure==='permission')return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({error:'화면 검증용 접근 제한입니다.'})});return route.continue();});
 await page.goto(origin+'/#feed');await page.getByRole('button',{name:'접속 다시 확인',exact:true}).waitFor();await page.getByText(/시범 접속 인증이 만료됐거나/).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 failure='';await Promise.all([page.waitForEvent('load'),page.getByRole('button',{name:'접속 다시 확인',exact:true}).click()]);await page.locator('#posts .post-title').first().waitFor();assert.equal(await page.locator('#reconnect').count(),0);
 failure='html';await page.reload();await page.getByRole('button',{name:'접속 다시 확인',exact:true}).waitFor();await page.getByRole('alert').filter({hasText:'서버 응답을 확인하지 못했습니다.'}).waitFor();
 failure='permission';await page.getByRole('button',{name:'다시 시도',exact:true}).click();await page.getByRole('alert').filter({hasText:'화면 검증용 접근 제한입니다.'}).waitFor();assert.equal(await page.locator('#reconnect').count(),0);assert.deepEqual(errors,[]);
});

test('expired login keeps a post on screen and resumes its account-scoped text draft only after explicit login navigation',async t=>{
 const page=await context(t,{width:390,height:844});await page.goto(origin+'/#login');await page.getByLabel('이메일',{exact:true}).fill('ui-author@example.test');await page.getByLabel('비밀번호 (12~128자)',{exact:true}).fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click();await page.getByRole('heading',{name:'화면검증 낚시인',exact:true}).waitFor();
 await page.goto(origin+'/#community-write');await page.getByRole('heading',{name:'커뮤니티 글쓰기',exact:true}).waitFor();await page.getByLabel('제목',{exact:true}).fill('로그인만료 화면검증 글');await page.getByLabel('이야기',{exact:true}).fill('실제 게시물이 아닌 세션 복귀 검증 자료입니다.');
 const file={name:'fixture.png',mimeType:'image/png',buffer:await sharp({create:{width:24,height:24,channels:3,background:'#0d8dff'}}).png().toBuffer()};await page.locator('#photos').setInputFiles(file);
 const logout=await page.request.post(origin+'/api/logout',{headers:{origin},data:{}});assert.equal(logout.status(),200);
 await page.getByRole('button',{name:'글 등록',exact:true}).click();const recovery=page.getByRole('link',{name:'다시 로그인하고 이어가기',exact:true});await recovery.waitFor();assert.equal(await page.getByLabel('제목',{exact:true}).inputValue(),'로그인만료 화면검증 글');assert.equal(await page.locator('#photo-preview img').count(),1);assert.ok(page.url().endsWith('#community-write'));
 const posts=await (await page.request.get(origin+'/api/posts?kind=community&q='+encodeURIComponent('로그인만료 화면검증 글'))).json();assert.equal(posts.posts.length,0);
 for(const width of [320,390]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 page.once('dialog',dialog=>dialog.dismiss());await recovery.click();await page.waitForFunction(()=>location.hash==='#community-write');assert.ok(page.url().endsWith('#community-write'));assert.equal(await page.locator('#photo-preview img').count(),1);
 page.once('dialog',dialog=>dialog.accept());await recovery.click();await page.getByRole('heading',{name:'다시 만나 반가워요.',exact:true}).waitFor();
 await page.getByLabel('이메일',{exact:true}).fill('ui-author@example.test');await page.getByLabel('비밀번호 (12~128자)',{exact:true}).fill('Wrong-password-12345');await page.getByRole('button',{name:'로그인',exact:true}).click();await page.getByRole('alert').filter({hasText:'이메일 또는 비밀번호를 확인해주세요.'}).waitFor();assert.equal(await page.locator('[data-session-recovery]').count(),0);
 await page.getByLabel('비밀번호 (12~128자)',{exact:true}).fill(password);await page.getByRole('button',{name:'로그인',exact:true}).click();await page.getByRole('heading',{name:'커뮤니티 글쓰기',exact:true}).waitFor();await page.getByRole('button',{name:'이어쓰기',exact:true}).click();assert.equal(await page.getByLabel('제목',{exact:true}).inputValue(),'로그인만료 화면검증 글');assert.equal(await page.locator('#photo-preview img').count(),0);
 await page.locator('#photos').setInputFiles(file);await page.getByRole('button',{name:'글 등록',exact:true}).click();await page.getByRole('heading',{name:'로그인만료 화면검증 글',exact:true}).waitFor();assert.deepEqual(errors,[]);
});
