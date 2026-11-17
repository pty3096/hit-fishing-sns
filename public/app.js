const main = document.querySelector('#main');
let me = null, returnTo = 'profile', generation = 0;
let previewUrls = [];
const cleanupPreviews = () => { previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = []; };
const fileBase64 = file => new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('사진을 읽을 수 없습니다.')); reader.readAsDataURL(file); });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, method = 'GET', data) {
  const response = await fetch('/api' + path, { method, headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '요청을 처리하지 못했습니다.');
  return result;
}
function toast(message) { const t = document.querySelector('#toast'); t.textContent = message; t.hidden = false; setTimeout(() => { t.hidden = true; }, 3500); }
function guard(route) { if (me) return true; returnTo = route; location.hash = 'login'; return false; }
function formAction(id, action) {
  const form = document.getElementById(id);
  form.onsubmit = async event => {
    event.preventDefault(); const button = form.querySelector('button[type=submit]');
    const error = form.querySelector('[role=alert]'); error.textContent = ''; error.hidden = true; button.disabled = true;
    try { await action(Object.fromEntries(new FormData(form))); }
    catch (err) { error.textContent = err.message; error.hidden = false; }
    finally { button.disabled = false; }
  };
}
const typeLabel=type=>({post:'게시물',comment:'댓글',user:'사용자'}[type]||type);
const actionLabel=action=>({dismiss:'신고 종결',hide:'콘텐츠 숨김',restore:'콘텐츠 복원',suspend:'이용 제한',unsuspend:'이용 제한 해제'}[action]||action);
const formError = '<p class="error" role="alert" hidden></p>';
const photoGallery = p => p.photos?.length ? `<div class="gallery">${p.photos.map((photo,i) => `<figure><img src="${esc(photo.url)}" alt="${esc(p.title)} 조황 사진 ${i+1}" loading="lazy"><figcaption>${i+1} / ${p.photos.length}</figcaption></figure>`).join('')}</div>` : '';
const likeButton = p => `<button data-like="${p.id}" data-liked="${p.liked}" aria-pressed="${p.liked}" class="${p.liked ? 'liked' : ''}">${p.liked ? '♥' : '♡'} 좋아요 ${p.likes}</button>`;
function card(p) { return `<article class="card"><div class="author"><div class="avatar">🎣</div><div><a href="#user/${p.user_id}"><strong>${esc(p.nickname)}</strong></a><div class="muted">${esc(p.region)} · ${esc(p.fishing_date)}</div></div></div><a href="#post/${p.id}">${p.photos?.[0] ? `<img class="feed-photo" src="${esc(p.photos[0].url)}" alt="${esc(p.title)} 조황 사진" loading="lazy">` : ''}<h2 class="post-title">${esc(p.title)}</h2><p class="content">${esc(p.body.slice(0, 100))}${p.body.length > 100 ? '…' : ''}</p></a><p><span class="tag">${esc(p.fish)}</span><span class="tag">${esc(p.method)}</span></p><div class="actions">${likeButton(p)}<a href="#post/${p.id}">댓글 ${p.comment_count}</a></div></article>`; }
function showList(target, result, morePath) {
  const list = document.querySelector(target); list.innerHTML = result.posts.map(card).join('') || '<section class="card empty">아직 조황이 없어요.<p class="muted">첫 기록을 남기거나 검색 조건을 바꿔보세요.</p><a href="#write">조황 남기기 →</a></section>';
  if (!result.next) return;
  const more = document.createElement('button'); more.textContent = '조황 더 보기'; list.append(more);
  more.onclick = async () => {
    more.disabled = true;
    try { const next = await api(morePath + (morePath.includes('?') ? '&' : '?') + 'before=' + result.next); const container = document.createElement('div'); container.id = 'page-' + result.next; more.replaceWith(container); showList('#' + container.id, next, morePath); }
    catch (e) { toast(e.message); more.disabled = false; }
  };
}
async function render() {
  const current = ++generation, route = location.hash.slice(1) || 'home';
  cleanupPreviews();
  main.innerHTML = '<section class="card" role="status">기록을 불러오고 있어요…</section>';
  try {
    me = (await api('/me')).user;
    if (current !== generation) return;
    const account = document.querySelector('#account'); account.textContent = me ? `${me.nickname} →` : '로그인 →'; account.href = me ? '#profile' : '#login';
    document.querySelectorAll('.navlink,.bottom a').forEach(a => a.classList.toggle('active', a.hash === '#' + route));
    if (['home','following','search'].includes(route)) {
      if (route === 'following' && !guard(route)) return;
      const listPath = route === 'following' ? '/posts?following=1' : '/posts';
      const result = await api(listPath); if (current !== generation) return;
      main.innerHTML = route !== 'search' ? `<section class="card hero"><div class="eyebrow">YOUR NEXT HIT</div><h1>오늘, 어디서<br>한 수 하셨나요?</h1><p>나만의 낚시 기록을 차곡차곡 남겨요.</p><a class="primary" href="#write">＋ 조황 남기기</a></section><div class="tabs"><a class="filter-tab" href="#home" aria-current="${route === 'home' ? 'page' : 'false'}">전체</a><a class="filter-tab" href="#following" aria-current="${route === 'following' ? 'page' : 'false'}">팔로잉</a></div><h2>${route === 'following' ? '팔로잉 조황' : '최근 조황'}</h2><div id="posts"></div>` : `<div class="eyebrow">DISCOVER</div><h1>조황 찾아보기</h1><form id="search" class="card form"><label for="fish">어종</label><input id="fish" name="fish" maxlength="30" placeholder="예: 농어"><label for="region">지역</label><input id="region" name="region" maxlength="50" placeholder="예: 강원 강릉시"><p class="field-help">입력한 어종과 지역이 정확히 일치하는 기록을 찾습니다.</p>${formError}<button class="primary" type="submit">검색</button><button id="reset-search" type="button">전체 보기</button></form><div id="posts"></div>`;
      showList('#posts', result, listPath);
      if (route === 'search') {
        formAction('search', async data => { const path = '/posts?' + new URLSearchParams({ fish: data.fish.trim(), region: data.region.trim() }); const result = await api(path); if (current === generation) showList('#posts', result, path); });
        document.querySelector('#reset-search').onclick = () => render();
      }
    } else if (route === 'login' || route === 'signup') {
      const signup = route === 'signup';
      main.innerHTML = `<section class="card"><span class="eyebrow">WELCOME TO HIT</span><h1>${signup ? '첫 기록을 시작해요.' : '다시 만나 반가워요.'}</h1><p class="muted">로컬 개발용 계정입니다. 이메일 인증·비밀번호 재설정은 아직 제공하지 않습니다.</p><form id="auth" class="form">${signup ? '<label for="nickname">닉네임</label><input id="nickname" name="nickname" maxlength="30" autocomplete="nickname" required>' : ''}<label for="email">이메일</label><input id="email" name="email" type="email" maxlength="254" autocomplete="username" required><label for="password">비밀번호 (12~128자)</label><input id="password" name="password" type="password" minlength="12" maxlength="128" autocomplete="${signup ? 'new-password' : 'current-password'}" required>${formError}<button class="primary" type="submit">${signup ? '회원가입' : '로그인'}</button></form><p><a href="#${signup ? 'login' : 'signup'}">${signup ? '이미 계정이 있어요 →' : '처음이신가요? 회원가입 →'}</a></p></section>`;
      formAction('auth', async data => { me = (await api(signup ? '/signup' : '/login', 'POST', data)).user; location.hash = me.suspended ? 'settings' : returnTo; toast(signup ? '가입했습니다. 첫 조황을 남겨보세요.' : '로그인했습니다.'); });
    } else if (route === 'write' || /^edit\/\d+$/.test(route)) {
      if (!guard(route)) return;
      const id = route.startsWith('edit/') ? route.split('/')[1] : null;
      const p = id ? (await api('/posts/' + id)).post : {};
      if (current !== generation) return;
      if (id && p.user_id !== me.id) throw new Error('본인의 게시물만 수정할 수 있습니다.');
      main.innerHTML = `<a class="back" href="#home">← 피드로</a><h1>${id ? '조황 수정하기' : '오늘의 조황 남기기'}</h1><section class="card"><p class="muted">사진과 함께 오늘의 한 수를 기록해요. 사진의 위치 정보는 저장 시 제거됩니다.</p><form id="post-form" class="form"><label for="photos">조황 사진 (최대 5장, 장당 10MB)</label><input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple><p class="field-help">JPG·PNG·WebP · 사진을 선택한 뒤 개별 삭제할 수 있습니다.</p><div id="photo-preview" class="photo-preview"></div>${[['title', '제목', 60], ['fish', '어종', 30], ['region', '지역 (시·군·구)', 50], ['method', '낚시 방식', 30]].map(([name, label, max]) => `<label for="${name}">${label}</label><input id="${name}" name="${name}" value="${esc(p[name])}" maxlength="${max}" required>`).join('')}<label for="fishing_date">출조일</label><input id="fishing_date" name="fishing_date" type="date" value="${esc(p.fishing_date)}" required><label for="body">이야기</label><textarea id="body" name="body" maxlength="2000" required>${esc(p.body)}</textarea>${formError}<button class="primary" type="submit">${id ? '수정 저장' : '조황 등록'}</button></form></section>`;
      let selectedPhotos = (p.photos || []).map(photo => ({ id:photo.id, url:photo.url }));
      const originalCount = selectedPhotos.length;
      const previews = () => {
        const container = document.querySelector('#photo-preview'); container.replaceChildren();
        selectedPhotos.forEach((photo,index) => {
          const item = document.createElement('div'), img = document.createElement('img'), remove = document.createElement('button');
          img.src = photo.url; img.alt = '선택한 조황 사진 ' + (index+1);
          remove.type = 'button'; remove.textContent = '사진 ' + (index+1) + ' 삭제';
          remove.onclick = () => { selectedPhotos.splice(index,1); previews(); };
          item.append(img,remove); container.append(item);
        });
      };
      previews();
      document.querySelector('#photos').onchange = event => {
        const files = [...event.target.files];
        if (selectedPhotos.length + files.length > 5 || files.some(file => !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10*1024*1024)) {
          toast('JPG·PNG·WebP, 장당 10MB 이하로 최대 5장까지 선택해주세요.');
        } else for (const file of files) { const url = URL.createObjectURL(file); previewUrls.push(url); selectedPhotos.push({file,url}); }
        event.target.value = ''; previews();
      };
      formAction('post-form', async data => {
        if (!selectedPhotos.length && (!id || originalCount)) throw new Error('사진을 한 장 이상 남겨주세요.');
        if (selectedPhotos.length) {
          const submit = document.querySelector('#post-form button[type=submit]'); submit.textContent = '사진을 저장하는 중…';
          try { data.photos = await Promise.all(selectedPhotos.map(async photo => photo.id ? {id:photo.id} : {data:await fileBase64(photo.file)})); }
          finally { submit.textContent = id ? '수정 저장' : '조황 등록'; }
        }
        const { post } = await api(id ? '/posts/' + id : '/posts', id ? 'PATCH' : 'POST', data); location.hash = 'post/' + post.id; toast('조황을 저장했습니다.'); });
    } else if (/^post\/\d+$/.test(route)) {
      const { post: p } = await api('/posts/' + route.split('/')[1]); if (current !== generation) return;
      main.innerHTML = `<a class="back" href="#home">← 피드로</a><article class="card"><div class="eyebrow">FISHING JOURNAL</div><h1>${esc(p.title)}</h1><p class="muted"><a href="#user/${p.user_id}">${esc(p.nickname)}</a> · ${esc(p.fishing_date)}</p>${photoGallery(p)}<p><span class="tag">${esc(p.region)}</span><span class="tag">${esc(p.fish)}</span><span class="tag">${esc(p.method)}</span></p><p class="content">${esc(p.body)}</p>${me?.id === p.user_id ? `<div class="actions"><a href="#edit/${p.id}">수정</a><button id="delete-post">삭제</button></div><div id="confirm-delete" hidden><p>이 조황을 삭제할까요? 삭제 후 복구할 수 없습니다.</p><button id="delete-yes">삭제하기</button><button id="delete-no">취소</button><p class="error" role="alert" hidden></p></div>` : ''}</article><section class="card"><div class="actions">${likeButton(p)}<a href="#user/${p.user_id}">작성자 프로필 →</a>${me?.id!==p.user_id ? `<a href="#report/post/${p.id}">게시물 신고</a>` : ''}</div></section><section class="card"><h2>이야기를 나눠요</h2><form id="comment-form" class="form"><label for="comment">댓글</label><textarea id="comment" name="body" maxlength="300" required placeholder="따뜻한 한마디를 남겨주세요"></textarea>${formError}<button class="primary" type="submit">댓글 등록</button></form><div id="comments"></div></section>`;
      await loadComments(p.id);
      if (current !== generation) return;
      formAction('comment-form', async data => { if (!guard(route)) return; await api('/posts/' + p.id + '/comments','POST',data); document.querySelector('#comment').value=''; await loadComments(p.id); toast('댓글을 남겼습니다.'); });
      if (me?.id === p.user_id) {
        const panel = document.querySelector('#confirm-delete');
        document.querySelector('#delete-post').onclick = () => { panel.hidden = false; };
        document.querySelector('#delete-no').onclick = () => { panel.hidden = true; };
        document.querySelector('#delete-yes').onclick = async event => { event.target.disabled = true; try { await api('/posts/' + p.id, 'DELETE', {}); location.hash = 'home'; toast('삭제했습니다.'); } catch (e) { const err = panel.querySelector('[role=alert]'); err.textContent = e.message; err.hidden = false; event.target.disabled = false; } };
      }
    } else if (route === 'profile' || /^user\/\d+$/.test(route)) {
      if (route === 'profile' && !guard(route)) return;
      const userId = route === 'profile' ? me.id : Number(route.split('/')[1]);
      const person = (await api('/users/' + userId)).user;
      const result = await api('/posts?author=' + userId); if (current !== generation) return;
      const mine = me?.id === userId;
      main.innerHTML = `<section class="card"><div class="profile"><div class="avatar">🎣</div><div><span class="eyebrow">FISHING JOURNAL</span><h1>${esc(person.nickname)}</h1><p class="content">${esc(person.bio || '나만의 낚시 이야기를 남겨보세요.')}</p></div></div><div class="stats"><a href="#user/${userId}/followers"><strong>${person.followers}</strong>팔로워</a><a href="#user/${userId}/following"><strong>${person.following}</strong>팔로잉</a></div>${mine ? '<a href="#profile-edit">프로필 편집 →</a> · <a href="#settings">설정</a><button id="logout">로그아웃</button>' : `<button id="follow" aria-pressed="${person.followed}">${person.followed ? '팔로잉 취소' : '＋ 팔로우'}</button><div class="actions"><a href="#report/user/${userId}">사용자 신고</a><button id="block">사용자 차단</button></div><div id="block-confirm" hidden><p>서로의 글·댓글이 숨겨지고 팔로우 관계가 해제됩니다.</p><button id="block-yes">차단하기</button><button id="block-no">취소</button></div>`}</section><h2>${mine ? '내 조황 기록' : '조황 기록'}</h2><div id="posts"></div>`;
      showList('#posts', result, '/posts?author=' + userId);
      if (mine) document.querySelector('#logout').onclick = async () => { try { await api('/logout', 'POST', {}); me = null; location.hash = 'home'; toast('로그아웃했습니다.'); } catch (e) { toast(e.message); } };
      else document.querySelector('#follow').onclick = async event => { if (!guard(route)) return; event.target.disabled=true; try { await api('/users/'+userId+'/follow', person.followed ? 'DELETE' : 'PUT', {}); render(); } catch (e) { toast(e.message); event.target.disabled=false; } };
      if (!mine) {
        document.querySelector('#block').onclick=()=>{if(guard(route))document.querySelector('#block-confirm').hidden=false;};
        document.querySelector('#block-no').onclick=()=>document.querySelector('#block-confirm').hidden=true;
        document.querySelector('#block-yes').onclick=async event=>{event.target.disabled=true;try{await api('/blocks/'+userId,'PUT',{});location.hash='settings';toast('차단했습니다. 설정에서 해제할 수 있습니다.');}catch(e){toast(e.message);event.target.disabled=false;}};
      }
    } else if (/^user\/\d+\/(followers|following)$/.test(route)) {
      const [,userId,kind] = route.split('/');
      const person = (await api('/users/'+userId)).user;
      if (current !== generation) return;
      main.innerHTML = `<a class="back" href="#user/${userId}">← ${esc(person.nickname)} 프로필</a><h1>${kind === 'followers' ? '팔로워' : '팔로잉'}</h1><section class="card" id="people"></section>`;
      await loadPeople(userId,kind);
    } else if (/^report\/(post|comment|user)\/\d+$/.test(route)) {
      if(!guard(route))return;
      const [,type,id]=route.split('/');
      main.innerHTML=`<a class="back" href="#home">← 홈으로</a><h1>신고하기</h1><form id="report-form" class="card form"><p>접수된 신고는 운영자가 검토합니다.</p><label for="reason">신고 사유</label><textarea id="reason" name="reason" maxlength="300" required placeholder="문제가 되는 내용을 설명해주세요"></textarea>${formError}<button class="primary" type="submit">신고 접수</button></form>`;
      formAction('report-form',async data=>{await api('/reports','POST',{...data,target_type:type,target_id:Number(id)}); main.innerHTML='<section class="card"><h1>신고를 접수했습니다.</h1><p>운영자가 확인하겠습니다.</p><a href="#home">홈으로 →</a></section>';});
    } else if (route === 'settings') {
      if(!guard(route))return;
      main.innerHTML=`<h1>내 계정 설정</h1><section class="card">${me.suspended?'<p class="error">이용이 제한된 계정입니다. 글 작성과 소통 기능을 사용할 수 없습니다. 탈퇴는 가능합니다.</p>':''}<p><a href="#profile">내 프로필 →</a></p>${me.is_admin?'<p><a href="#admin">운영자 신고 관리 →</a></p>':''}<h2>차단한 사용자</h2><div id="blocked-users"></div></section><section class="card"><h2>회원 탈퇴</h2><p>계정, 조황·사진, 댓글, 좋아요, 팔로우·차단 관계와 모든 로그인 세션을 삭제합니다. 접수된 신고·운영 기록은 일부 익명화하여 남습니다.</p><p>이 작업은 되돌릴 수 없습니다. 개발 백업 파일은 별도로 관리됩니다.</p><form id="withdraw" class="form"><label for="withdraw-password">현재 비밀번호</label><input id="withdraw-password" type="password" name="password" autocomplete="current-password" required maxlength="128"><label for="withdraw-confirm">확인을 위해 탈퇴를 입력해주세요</label><input id="withdraw-confirm" name="confirm" required autocomplete="off" pattern="탈퇴">${formError}<button type="submit" class="danger-button">계정과 작성 자료 삭제</button></form></section>`;
      await loadBlocked();
      if(current!==generation)return;
      formAction('withdraw',async data=>{await api('/account','DELETE',data);me=null;returnTo='profile';location.hash='home';toast('계정과 작성 자료를 삭제했습니다.');});
    } else if (route === 'admin') {
      if(!guard(route))return;
      if(!me.is_admin)throw new Error('운영자 권한이 필요합니다.');
      main.innerHTML='<h1>신고 관리</h1><div class="tabs"><button id="open-reports">미처리</button><button id="resolved-reports">처리 완료</button></div><section id="reports" class="card"></section>';
      await loadReports('open');if(current!==generation)return;
      document.querySelector('#open-reports').onclick=()=>loadReports('open').catch(e=>toast(e.message));
      document.querySelector('#resolved-reports').onclick=()=>loadReports('resolved').catch(e=>toast(e.message));
    } else if (/^admin\/report\/\d+$/.test(route)) {
      if(!guard(route))return;
      if(!me.is_admin)throw new Error('운영자 권한이 필요합니다.');
      const id=route.split('/')[2],data=await api('/admin/reports/'+id);
      if(current!==generation)return;
      const r=data.report,item=data.target;
      main.innerHTML=`<a class="back" href="#admin">← 신고 목록</a><h1>신고 #${r.id}</h1><section class="card"><p><strong>${esc(typeLabel(r.target_type))} #${r.target_id} · ${r.status==='open'?'미처리':'처리 완료'}</strong></p><h2>신고 사유</h2><p class="content">${esc(r.reason)}</p><h2>대상 내용</h2>${item?`<p>${esc(item.nickname)}</p><p class="content">${esc(item.title||item.body||item.bio||'소개 없음')}</p>${item.title?`<p class="content">${esc(item.body)}</p>${photoGallery(item)}`:''}<p class="muted">${item.hidden?'숨김 상태':''}${item.suspended?' 이용 제한 상태':''}</p>`:'<p>대상이 삭제되었습니다. 종결만 가능합니다.</p>'}</section><form id="resolve-report" class="card form"><label for="action">조치</label><select name="action" id="action"><option value="dismiss">신고 종결 (콘텐츠 변경 없음)</option>${item?`${r.target_type!=='user'?'<option value="hide">콘텐츠 숨김</option><option value="restore">콘텐츠 복원</option>':''}<option value="suspend">작성자 이용 제한</option><option value="unsuspend">작성자 이용 제한 해제</option>`:''}</select><label for="note">조치 사유 (기록에 보존)</label><textarea name="note" id="note" required maxlength="500"></textarea>${formError}<button type="submit" class="primary">조치 적용</button></form><section class="card"><h2>조치 기록</h2>${data.actions.map(a=>`<article class="comment"><strong>${esc(actionLabel(a.action))}</strong><p class="content">${esc(a.note)}</p><p class="muted">${esc(new Date(a.created_at).toLocaleString('ko-KR'))}</p></article>`).join('')||'<p>아직 조치 기록이 없습니다.</p>'}</section>`;
      formAction('resolve-report',async body=>{await api('/admin/reports/'+id+'/resolve','POST',body);toast('조치를 기록했습니다.');render();});
    } else if (route === 'profile-edit') {
      if (!guard(route)) return;
      main.innerHTML = `<h1>나를 소개해요</h1><form id="profile" class="card form"><label for="nickname">닉네임</label><input id="nickname" name="nickname" maxlength="30" value="${esc(me.nickname)}" required><label for="bio">소개</label><textarea id="bio" name="bio" maxlength="200">${esc(me.bio)}</textarea>${formError}<button class="primary" type="submit">프로필 저장</button></form>`;
      formAction('profile', async data => { me = (await api('/profile', 'PATCH', data)).user; location.hash = 'profile'; toast('프로필을 저장했습니다.'); });
    } else throw new Error('없는 화면입니다. 홈으로 이동해주세요.');
  } catch (e) {
    if (current !== generation) return;
    main.innerHTML = `<section class="card"><h2>잠시 확인이 필요해요</h2><p class="error" role="alert">${esc(e.message)}</p><button id="retry">다시 시도</button> <a href="#home">홈으로</a></section>`;
    document.querySelector('#retry').onclick = render;
  }
}
async function loadComments(postId, before, target = '#comments') {
  const routeAtStart=location.hash;
  const result = await api('/posts/'+postId+'/comments'+(before ? '?before='+before : ''));
  const container = document.querySelector(target); if (!container || routeAtStart!==location.hash) return;
  container.innerHTML = result.comments.map(c => `<article class="comment"><a href="#user/${c.user_id}"><strong>${esc(c.nickname)}</strong></a><p class="content">${esc(c.body)}</p>${me?.id!==c.user_id ? `<a href="#report/comment/${c.id}">댓글 신고</a>` : ''}${me?.id===c.user_id ? `<button data-delete-comment="${c.id}" data-post="${postId}">내 댓글 삭제</button>` : ''}</article>`).join('') || (before ? '' : '<p class="muted">첫 댓글을 남겨보세요.</p>');
  if (result.next) {
    const more = document.createElement('button'); more.textContent='이전 댓글 더 보기'; container.append(more);
    more.onclick = async () => { more.disabled=true; try { const next = document.createElement('div'); next.id='comments-page-'+result.next; more.replaceWith(next); await loadComments(postId,result.next,'#'+next.id); } catch(e) { toast(e.message); await loadComments(postId); } };
  }
}
async function loadPeople(userId,kind,before,target='#people') {
  const routeAtStart=location.hash;
  const result = await api('/users/'+userId+'/'+kind+(before ? '?before='+before : ''));
  const container = document.querySelector(target); if (!container || routeAtStart!==location.hash) return;
  container.innerHTML=result.users.map(u=>`<article class="comment"><a href="#user/${u.id}"><strong>${esc(u.nickname)}</strong></a><p class="content">${esc(u.bio)}</p></article>`).join('') || '<p class="muted">아직 목록이 비어있어요.</p>';
  if (result.next) { const more=document.createElement('button'); more.textContent='더 보기'; container.append(more); more.onclick=async()=>{ more.disabled=true; try { const next=document.createElement('div'); next.id='people-page-'+result.next; more.replaceWith(next); await loadPeople(userId,kind,result.next,'#'+next.id); } catch(e) {toast(e.message);} }; }
}
async function loadBlocked(before,target='#blocked-users') {
  const at=location.hash, result=await api('/blocks'+(before?'?before='+before:''));
  const container=document.querySelector(target);if(!container||at!==location.hash)return;
  container.innerHTML=result.users.map(u=>`<div class="row comment"><strong>${esc(u.nickname)}</strong><button data-unblock="${u.id}">차단 해제</button></div>`).join('')||'<p class="muted">차단한 사용자가 없습니다.</p>';
  if(result.next){const more=document.createElement('button');more.textContent='더 보기';container.append(more);more.onclick=async()=>{more.disabled=true;try{const next=document.createElement('div');next.id='blocked-'+result.next;more.replaceWith(next);await loadBlocked(result.next,'#'+next.id);}catch(e){toast(e.message);}};}
}
async function loadReports(status,before,target='#reports') {
  const at=location.hash,result=await api('/admin/reports?status='+status+(before?'&before='+before:''));
  const container=document.querySelector(target);if(!container||at!==location.hash)return;
  container.innerHTML=result.reports.map(r=>`<article class="comment"><a href="#admin/report/${r.id}"><strong>신고 #${r.id} · ${esc(typeLabel(r.target_type))} #${r.target_id}</strong></a><p class="content">${esc(r.reason)}</p></article>`).join('')||'<p class="muted">해당 신고가 없습니다.</p>';
  if(result.next){const more=document.createElement('button');more.textContent='더 보기';container.append(more);more.onclick=async()=>{more.disabled=true;try{const next=document.createElement('div');next.id='reports-'+result.next;more.replaceWith(next);await loadReports(status,result.next,'#'+next.id);}catch(e){toast(e.message);}};}
}
main.addEventListener('click',async event=>{
  const button=event.target.closest('[data-unblock]');if(!button)return;
  button.disabled=true;try{await api('/blocks/'+button.dataset.unblock,'DELETE',{});await loadBlocked();toast('차단을 해제했습니다. 팔로우는 자동 복원되지 않습니다.');}catch(e){toast(e.message);button.disabled=false;}
});
main.addEventListener('click',async event => {
  const button = event.target.closest('[data-like],[data-delete-comment]'); if (!button) return;
  if (!guard(location.hash.slice(1)||'home')) return;
  button.disabled=true;
  try {
    if (button.dataset.like) {
      const result=await api('/posts/'+button.dataset.like+'/like',button.dataset.liked==='true' ? 'DELETE' : 'PUT',{});
      button.dataset.liked=String(result.liked); button.setAttribute('aria-pressed',result.liked); button.classList.toggle('liked',result.liked); button.textContent=(result.liked ? '♥' : '♡')+' 좋아요 '+result.likes;
    } else { await api('/comments/'+button.dataset.deleteComment,'DELETE',{}); await loadComments(button.dataset.post); toast('댓글을 삭제했습니다.'); }
  } catch(e) {toast(e.message);} finally {button.disabled=false;}
});
addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
render();
