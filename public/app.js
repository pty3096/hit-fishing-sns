const main = document.querySelector('#main');
let me = null, returnTo = 'profile', generation = 0;
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
const formError = '<p class="error" role="alert" hidden></p>';
function card(p) { return `<article class="card"><div class="author"><div class="avatar">🎣</div><div><strong>${esc(p.nickname)}</strong><div class="muted">${esc(p.region)} · ${esc(p.fishing_date)}</div></div></div><a href="#post/${p.id}"><h2 class="post-title">${esc(p.title)}</h2><p class="content">${esc(p.body.slice(0, 100))}${p.body.length > 100 ? '…' : ''}</p></a><p><span class="tag">${esc(p.fish)}</span><span class="tag">${esc(p.method)}</span></p></article>`; }
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
  main.innerHTML = '<section class="card" role="status">기록을 불러오고 있어요…</section>';
  try {
    me = (await api('/me')).user;
    if (current !== generation) return;
    const account = document.querySelector('#account'); account.textContent = me ? `${me.nickname} →` : '로그인 →'; account.href = me ? '#profile' : '#login';
    document.querySelectorAll('.navlink,.bottom a').forEach(a => a.classList.toggle('active', a.hash === '#' + route));
    if (route === 'home' || route === 'search') {
      const result = await api('/posts'); if (current !== generation) return;
      main.innerHTML = route === 'home' ? `<section class="card hero"><div class="eyebrow">YOUR NEXT HIT</div><h1>오늘, 어디서<br>한 수 하셨나요?</h1><p>나만의 낚시 기록을 차곡차곡 남겨요.</p><a class="primary" href="#write">＋ 조황 남기기</a></section><h2>최근 조황</h2><div id="posts"></div>` : `<div class="eyebrow">DISCOVER</div><h1>조황 찾아보기</h1><form id="search" class="card form"><label for="fish">어종</label><input id="fish" name="fish" maxlength="30" placeholder="예: 농어"><label for="region">지역</label><input id="region" name="region" maxlength="50" placeholder="예: 강원 강릉시"><p class="field-help">입력한 어종과 지역이 정확히 일치하는 기록을 찾습니다.</p>${formError}<button class="primary" type="submit">검색</button><button id="reset-search" type="button">전체 보기</button></form><div id="posts"></div>`;
      showList('#posts', result, '/posts');
      if (route === 'search') {
        formAction('search', async data => { const path = '/posts?' + new URLSearchParams({ fish: data.fish.trim(), region: data.region.trim() }); const result = await api(path); if (current === generation) showList('#posts', result, path); });
        document.querySelector('#reset-search').onclick = () => render();
      }
    } else if (route === 'login' || route === 'signup') {
      const signup = route === 'signup';
      main.innerHTML = `<section class="card"><span class="eyebrow">WELCOME TO HIT</span><h1>${signup ? '첫 기록을 시작해요.' : '다시 만나 반가워요.'}</h1><p class="muted">로컬 개발용 계정입니다. 이메일 인증·비밀번호 재설정은 아직 제공하지 않습니다.</p><form id="auth" class="form">${signup ? '<label for="nickname">닉네임</label><input id="nickname" name="nickname" maxlength="30" autocomplete="nickname" required>' : ''}<label for="email">이메일</label><input id="email" name="email" type="email" maxlength="254" autocomplete="username" required><label for="password">비밀번호 (12~128자)</label><input id="password" name="password" type="password" minlength="12" maxlength="128" autocomplete="${signup ? 'new-password' : 'current-password'}" required>${formError}<button class="primary" type="submit">${signup ? '회원가입' : '로그인'}</button></form><p><a href="#${signup ? 'login' : 'signup'}">${signup ? '이미 계정이 있어요 →' : '처음이신가요? 회원가입 →'}</a></p></section>`;
      formAction('auth', async data => { me = (await api(signup ? '/signup' : '/login', 'POST', data)).user; location.hash = returnTo; toast(signup ? '가입했습니다. 첫 조황을 남겨보세요.' : '로그인했습니다.'); });
    } else if (route === 'write' || /^edit\/\d+$/.test(route)) {
      if (!guard(route)) return;
      const id = route.startsWith('edit/') ? route.split('/')[1] : null;
      const p = id ? (await api('/posts/' + id)).post : {};
      if (current !== generation) return;
      if (id && p.user_id !== me.id) throw new Error('본인의 게시물만 수정할 수 있습니다.');
      main.innerHTML = `<a class="back" href="#home">← 피드로</a><h1>${id ? '조황 수정하기' : '오늘의 조황 남기기'}</h1><section class="card"><p class="muted">먼저 글로 기록을 남겨요. 사진 업로드는 다음 단계에 연결합니다.</p><form id="post-form" class="form">${[['title', '제목', 60], ['fish', '어종', 30], ['region', '지역 (시·군·구)', 50], ['method', '낚시 방식', 30]].map(([name, label, max]) => `<label for="${name}">${label}</label><input id="${name}" name="${name}" value="${esc(p[name])}" maxlength="${max}" required>`).join('')}<label for="fishing_date">출조일</label><input id="fishing_date" name="fishing_date" type="date" value="${esc(p.fishing_date)}" required><label for="body">이야기</label><textarea id="body" name="body" maxlength="2000" required>${esc(p.body)}</textarea>${formError}<button class="primary" type="submit">${id ? '수정 저장' : '조황 등록'}</button></form></section>`;
      formAction('post-form', async data => { const { post } = await api(id ? '/posts/' + id : '/posts', id ? 'PATCH' : 'POST', data); location.hash = 'post/' + post.id; toast('조황을 저장했습니다.'); });
    } else if (/^post\/\d+$/.test(route)) {
      const { post: p } = await api('/posts/' + route.split('/')[1]); if (current !== generation) return;
      main.innerHTML = `<a class="back" href="#home">← 피드로</a><article class="card"><div class="eyebrow">FISHING JOURNAL</div><h1>${esc(p.title)}</h1><p class="muted">${esc(p.nickname)} · ${esc(p.fishing_date)}</p><p><span class="tag">${esc(p.region)}</span><span class="tag">${esc(p.fish)}</span><span class="tag">${esc(p.method)}</span></p><p class="content">${esc(p.body)}</p>${me?.id === p.user_id ? `<div class="actions"><a href="#edit/${p.id}">수정</a><button id="delete-post">삭제</button></div><div id="confirm-delete" hidden><p>이 조황을 삭제할까요? 삭제 후 복구할 수 없습니다.</p><button id="delete-yes">삭제하기</button><button id="delete-no">취소</button><p class="error" role="alert" hidden></p></div>` : ''}</article><p class="muted">댓글·좋아요·팔로우는 다음 단계에 추가됩니다.</p>`;
      if (me?.id === p.user_id) {
        const panel = document.querySelector('#confirm-delete');
        document.querySelector('#delete-post').onclick = () => { panel.hidden = false; };
        document.querySelector('#delete-no').onclick = () => { panel.hidden = true; };
        document.querySelector('#delete-yes').onclick = async event => { event.target.disabled = true; try { await api('/posts/' + p.id, 'DELETE', {}); location.hash = 'home'; toast('삭제했습니다.'); } catch (e) { const err = panel.querySelector('[role=alert]'); err.textContent = e.message; err.hidden = false; event.target.disabled = false; } };
      }
    } else if (route === 'profile') {
      if (!guard(route)) return;
      const result = await api('/posts?mine=1'); if (current !== generation) return;
      main.innerHTML = `<section class="card"><div class="profile"><div class="avatar">🎣</div><div><span class="eyebrow">MY FISHING JOURNAL</span><h1>${esc(me.nickname)}</h1><p class="content">${esc(me.bio || '나만의 낚시 이야기를 남겨보세요.')}</p></div></div><a href="#profile-edit">프로필 편집 →</a><button id="logout">로그아웃</button></section><h2>내 조황 기록</h2><div id="posts"></div>`;
      showList('#posts', result, '/posts?mine=1');
      document.querySelector('#logout').onclick = async () => { try { await api('/logout', 'POST', {}); me = null; location.hash = 'home'; toast('로그아웃했습니다.'); } catch (e) { toast(e.message); } };
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
addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });
render();
