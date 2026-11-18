import {marketSearchError,marketFilters,marketPath} from './market-search.mjs';
import {mapRegions,regionMapView,regionMapPath} from './region-map.mjs';
import {prepareInstallation,installationState,installationStatus,requestInstallation} from './install.mjs';
import {parseRoute,searchPath,navigationSection,canWrite,emptyMessage,galleryPosition,photoSelectionError,searchValidation,peoplePath,communityPath,myPostsPath} from './ui.mjs';
import {draftStore,draftFields} from './drafts.mjs';
let drafts;try{drafts=draftStore(sessionStorage);}catch{drafts=draftStore(null);}
let editor=null,activeHash=location.hash;
addEventListener('beforeunload',event=>{if(editor?.dirty()){editor.save();event.preventDefault();event.returnValue='';}});
const main = document.querySelector('#main');
let meta = {development_mail:false,verification_required:true,production:false};
let me = null, returnTo = 'profile', generation = 0;
let previewUrls = [];
const cleanupPreviews = () => { previewUrls.forEach(url => URL.revokeObjectURL(url)); previewUrls = []; };
const fileBase64 = file => new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('사진을 읽을 수 없습니다.')); reader.readAsDataURL(file); });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function api(path, method = 'GET', data) {
  let response;try{response=await fetch('/api' + path, { method, headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });}catch{throw new Error('연결이 끊겼습니다. 인터넷 연결을 확인하고 다시 시도해주세요.');}
  let result;try{result=await response.json();}catch{throw new Error('서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.');}
  if (!response.ok) throw new Error(result.error || '요청을 처리하지 못했습니다.');
  return result;
}
let toastTimer;
function toast(message) { clearTimeout(toastTimer);const t = document.querySelector('#toast'); t.textContent = message; t.hidden = false; toastTimer=setTimeout(() => { t.hidden = true; }, 4500); }
function guard(route) { if (me) return true; returnTo = route; location.hash = 'login'; return false; }
function guardWrite(route) {
  if(!guard(route))return false;
  if(!canWrite(me,meta)){toast(me.suspended?'이용이 제한된 계정입니다. 설정을 확인해주세요.':'이메일 인증 후 이용할 수 있어요.');location.hash='settings';return false;}
  return true;
}
function formAction(id, action) {
  const form = document.getElementById(id);if(!form)return;
  const formRoute=location.hash;
  form.onsubmit = async event => {
    event.preventDefault(); const button = form.querySelector('button[type=submit]');
    const error = form.querySelector('[role=alert]'); error.textContent = ''; error.hidden = true; button.disabled = true;const originalLabel=button.textContent;button.textContent='처리 중…';form.setAttribute('aria-busy','true');
    try { await action(Object.fromEntries(new FormData(form)),()=>form.isConnected&&location.hash===formRoute); }
    catch (err) { if(form.isConnected&&location.hash===formRoute){error.textContent=err.message;error.hidden=false;error.tabIndex=-1;error.focus();} }
    finally {button.disabled=false;button.textContent=originalLabel;form.removeAttribute('aria-busy');}
  };
}
const icon=name=>`<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const upcoming={shorts:'숏폼',booking:'선상예약'};
function quickLinks(){return `<div class="quick-grid">${[['feed','feed','조황피드'],['coming/shorts','play','숏폼영상'],['map','map','낚시지도'],['coming/booking','calendar','출조예약'],['community','users','커뮤니티'],['ranking','trophy','랭킹']].map(([href,symbol,label])=>`<a href="#${href}" class="quick-tile">${icon(symbol)}<strong>${label}</strong>${href.startsWith('coming')?'<small>준비 중</small>':''}</a>`).join('')}</div>`;}
function discovery(posts){
 const authors=[...new Map(posts.map(p=>[p.user_id,p])).values()].slice(0,3);
 document.querySelector('#discovery').innerHTML=`<section class="card"><div class="section-head"><h2>만나보는 낚시인</h2><a href="#people">찾기 →</a></div>${authors.map(p=>`<a class="discovery-person" href="#user/${p.user_id}">${avatar(p)}<span><strong>${esc(p.nickname)}</strong><small>조황 작성자</small></span><b>프로필</b></a>`).join('')||'<p class="muted">첫 조황의 주인공이 되어주세요.</p>'}</section><section class="card"><h2>새로 올라온 조황 <span class="live-dot"></span></h2>${posts.slice(0,3).map(p=>`<a class="latest-item" href="#post/${p.id}">${p.photos?.[0]?`<img src="${esc(p.photos[0].url)}" alt="" loading="lazy">`:icon('feed')}<span><strong>${esc(p.fish)}</strong><small>${esc(p.region)} · ${esc(p.nickname)}</small></span></a>`).join('')||'<p class="muted">아직 등록된 조황이 없어요.</p>'}<p class="field-help">화면을 연 시점의 최근 기록입니다.</p></section>`;
}
function homeIntro(posts){return `<section class="hero approved-hero"><div class="hero-copy"><p>낚시하는 모든 순간, 히트!</p><h1>오늘의 조황,<br>히트에서!</h1><p>낚시인들의 리얼 기록과 이야기</p><a href="#write" class="hero-cta">나의 조황 남기기 ${icon('write')}</a></div><span class="hero-dots" aria-hidden="true">● ○ ○</span></section>${quickLinks()}<a class="home-people-link" href="#people">${icon('users')}<strong>함께할 낚시인 찾기</strong><span>닉네임 검색 →</span></a><a class="home-install-link" href="#install">히트를 홈 화면에 추가 →</a><a class="home-market-link" href="#market">${icon('shop')}<strong>낚시용품 장터</strong><span>상품 둘러보기 →</span></a>${posts.length?`<section class="featured"><div class="section-head"><h2>지금 눈여겨볼 조황 <span>🔥</span></h2><a href="#feed">더보기 ›</a></div><div class="featured-grid">${posts.slice(0,4).map(p=>`<a href="#post/${p.id}" class="featured-item">${p.photos?.[0]?`<img src="${esc(p.photos[0].url)}" alt="${esc(p.title)}" loading="lazy">`:''}<span>${esc(p.fish)} · ${esc(p.region)}</span></a>`).join('')}</div></section>`:''}<section class="regions"><div class="section-head"><h2>${icon('map')} 지역별 조황</h2></div><div class="region-grid">${['거제','통영','제주','부산'].map(region=>`<a href="#search?region=${encodeURIComponent(region)}">${icon('map')}${region}<small>조황 보기 ›</small></a>`).join('')}</div></section>`;}
const typeLabel=type=>({post:'게시물',comment:'댓글',user:'사용자'}[type]||type);
const actionLabel=action=>({dismiss:'신고 종결',hide:'콘텐츠 숨김',restore:'콘텐츠 복원',suspend:'이용 제한',unsuspend:'이용 제한 해제'}[action]||action);
const formError = '<p class="error" role="alert" hidden></p>';
const photoGallery = p => p.photos?.length ? `<section class="gallery" aria-label="게시물 사진"><div class="gallery-track" tabindex="0" aria-label="게시물 사진 목록. 좌우 방향키로 이동">${p.photos.map((photo,i) => `<figure><img src="${esc(photo.url)}" alt="${esc(p.title)} ${p.kind!=='catch'?'게시물':'조황'} 사진 ${i+1}" loading="lazy"></figure>`).join('')}</div><div class="gallery-controls">${p.photos.length>1?'<button type="button" data-gallery="-1" aria-label="이전 사진" disabled>←</button>':''}<span class="gallery-position" aria-live="polite">1 / ${p.photos.length}</span>${p.photos.length>1?'<button type="button" data-gallery="1" aria-label="다음 사진">→</button>':''}</div></section>` : '';

const avatar=person=>`<div class="avatar">${person.avatar_url?`<img src="${esc(person.avatar_url)}" alt="${esc(person.nickname)} 프로필 사진" loading="lazy">`:'🎣'}</div>`;
const saveButton=p=>`<button data-save="${p.id}" data-saved="${p.saved}" aria-pressed="${p.saved}" class="save-button ${p.saved?'is-saved':''}">${icon('bookmark')} ${p.saved?'저장됨':'저장'}</button>`;
const marketInfo=p=>p.kind==='market'?`<div class="market-meta"><span class="trade-status ${p.trade_status==='sold'?'is-sold':''}">${p.trade_status==='sold'?'거래 완료':'판매 중'}</span><strong>${p.price===0?'나눔':Number(p.price).toLocaleString('ko-KR')+'원'}</strong><small>${esc(p.region)}</small></div>`:'';
const postMeta=p=>p.kind==='catch'?p.region+' · '+p.fishing_date:(p.kind==='market'?'장터':'커뮤니티')+' · '+new Date(p.created_at).toLocaleDateString('ko-KR');
const likeButton = p => `<button data-like="${p.id}" data-liked="${p.liked}" aria-pressed="${p.liked}" class="${p.liked ? 'liked' : ''}">${p.liked ? '♥' : '♡'} 좋아요 ${p.likes}</button>`;
function card(p) { return `<article class="card"><div class="author">${avatar(p)}<div><a href="#user/${p.user_id}"><strong>${esc(p.nickname)}</strong></a><div class="muted">${esc(postMeta(p))}</div></div></div><a href="#post/${p.id}">${p.photos?.[0] ? `<img class="feed-photo" src="${esc(p.photos[0].url)}" alt="${esc(p.title)} ${p.kind!=='catch'?'게시물':'조황'} 사진" loading="lazy">` : ''}<h2 class="post-title">${esc(p.title)}</h2><p class="content">${esc(p.body.slice(0, 100))}${p.body.length > 100 ? '…' : ''}</p></a>${marketInfo(p)}<p>${p.kind!=='catch'?`<span class="tag">${p.kind==='market'?'장터':'커뮤니티'}</span>`:`<span class="tag">${esc(p.fish)}</span><span class="tag">${esc(p.method)}</span>`}</p><div class="actions">${likeButton(p)}${saveButton(p)}<a href="#post/${p.id}">댓글 ${p.comment_count}</a></div></article>`; }
function managedCard(p){const label={catch:'조황',community:'커뮤니티',market:'장터'}[p.kind];return `<article class="card managed-post" data-post-id="${p.id}">${p.photos?.[0]?`<img class="managed-thumb" src="${esc(p.photos[0].url)}" alt="${esc(p.title)} 대표 사진" loading="lazy">`:''}<div class="managed-content"><span class="tag">${label}</span><h2><a href="#post/${p.id}">${esc(p.title)}</a></h2><p class="muted">${esc(postMeta(p))}</p><p class="content">${esc(p.body.slice(0,80))}${p.body.length>80?'…':''}</p>${marketInfo(p)}<div class="managed-actions"><a href="#edit/${p.id}" class="primary">수정하기</a><a href="#post/${p.id}">글 보기 →</a></div></div></article>`;}
function showList(target,result,morePath,kind='home',append=false) {
  const viewGeneration=generation;
  const list=document.querySelector(target);if(!list)return;
  const empty=emptyMessage(kind);
  list.innerHTML=result.posts.map(p=>kind.startsWith('manage-')?managedCard(p):card(p)).join('')||(append?'<p class="muted">더 이상 게시물이 없습니다.</p>':`<section class="card empty"><h2>${esc(empty.title)}</h2><p class="muted">${esc(empty.body)}</p><a class="primary" href="${empty.href}">${esc(empty.label)}</a></section>`);
  if (!result.next) return;
  const more = document.createElement('button'); more.textContent = kind.startsWith('manage-')?'내 글 더 보기':kind==='market'?'상품 더 보기':kind.startsWith('community')?'이야기 더 보기':kind==='saved'?'저장한 글 더 보기':'조황 더 보기'; list.append(more);
  more.onclick = async () => {
    more.disabled = true;
    try { const next = await api(morePath + (morePath.includes('?') ? '&' : '?') + 'before=' + result.next);if(viewGeneration!==generation)return; const container = document.createElement('div'); container.id = 'page-' + result.next; more.replaceWith(container); showList('#' + container.id,next,morePath,kind,true); }
    catch (e) { toast(e.message); more.disabled = false; }
  };
}
async function render({focus=false}={}) {
  const current=++generation;const {route,params}=parseRoute(location.hash);
  if(route==='coming/map'){location.hash=regionMapPath(params.get('region')||'');return;}
  main.setAttribute('aria-busy','true');
  document.querySelector('#discovery').innerHTML='<section class="card"><h2>낚시하는 모든 순간, 히트!</h2><p class="muted">조황을 기록하고 낚시인들과 이야기를 나눠보세요.</p><a class="primary" href="#write">조황 남기기</a></section>';
  editor=null;
  cleanupPreviews();
  main.innerHTML = '<section class="card" role="status">기록을 불러오고 있어요…</section>';
  try {
    const [session,configuration]=await Promise.all([api('/me'),api('/meta')]);
    if(current!==generation)return;
    me=session.user;meta=configuration;
    document.querySelector('.notice').textContent=meta.phone_preview?'아이폰 시범 버전 · 별도 테스트 기록 · 인증 안내는 개발용 메일함에서 확인':meta.production?'히트 HIT · 낚시의 순간을 함께':'개발 버전 · 이 PC에 기록을 저장합니다 · 메일 발송 연결 전 로컬 검증';
    const authStatus=document.querySelector('#auth-status');authStatus.hidden=!me||me.email_verified||!meta.verification_required;authStatus.innerHTML='이메일 인증을 완료하면 글 작성과 소통 기능을 이용할 수 있어요. <a href="#settings">인증 안내 →</a>';
    const bell=document.querySelector('#notifications-link'),badge=document.querySelector('#notification-count');badge.hidden=true;bell.setAttribute('aria-label','알림');
    if(canWrite(me,meta))api('/notifications?summary=1').then(r=>{if(current!==generation)return;updateNotificationBadge(r.unread);}).catch(()=>{});
    const account = document.querySelector('#account'); account.textContent = me ? `${me.nickname} →` : '로그인 →'; account.href = me ? '#profile' : '#login';
    main.className='';document.body.dataset.route=route.startsWith('user/')||route==='profile'?'profile':route;
    document.querySelectorAll('.navlink,.bottom a,.mobile-top a').forEach(a=>{const section=navigationSection(route);const target=route==='my-posts'&&a.classList.contains('navlink')?'my-posts':route==='saved'&&a.classList.contains('navlink')?'saved':route.startsWith('coming/')?route:route==='feed'?'feed':a.classList.contains('navlink')&&route==='settings'?'settings':section;const active=a.hash==='#'+target;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    if (['home','feed','following','search'].includes(route)) {
      if (route === 'following' && !guardWrite(route)) return;
      const listPath=route==='following'?'/posts?following=1':route==='search'?searchPath(params):'/posts';
      const result = await api(listPath); if (current !== generation) return;
      if(route!=='search')discovery(result.posts);
      main.innerHTML = route !== 'search' ? `${route!=='feed'?homeIntro(result.posts):'<div class="section-head"><h1>조황피드</h1><a href="#write" class="primary">글쓰기</a></div>'}<div class="tabs"><a class="filter-tab" href="#feed" aria-current="${route !== 'following' ? 'page' : 'false'}">전체 조황</a><a class="filter-tab" href="#following" aria-current="${route === 'following' ? 'page' : 'false'}">팔로잉</a></div><h2>${route === 'following' ? '팔로잉 조황' : '최근 조황'}</h2><div id="posts"></div>` : `<div class="eyebrow">DISCOVER</div><h1>조황 찾아보기</h1><form id="search" class="card form"><label for="post-query">제목·본문 검색</label><input id="post-query" name="q" maxlength="80" value="${esc(params.get('q'))}" placeholder="예: 첫 농어, 루어 후기"><p class="field-help">제목 또는 본문에 검색어가 포함된 조황을 찾습니다.</p><label for="fish">어종</label><input id="fish" name="fish" maxlength="30" value="${esc(params.get('fish'))}" placeholder="예: 농어"><label for="region">지역</label><input id="region" name="region" maxlength="50" value="${esc(params.get('region'))}" placeholder="예: 강릉, 거제"><p class="field-help">지역의 일부만 입력해도 찾아드려요. 예: 강릉, 거제</p><details class="advanced-search" ${['method','date_from','date_to'].some(key=>params.get(key))?'open':''}><summary>낚시 방식·출조 기간</summary><label for="method-filter">낚시 방식</label><input id="method-filter" name="method" maxlength="30" value="${esc(params.get('method'))}" placeholder="예: 루어, 원투, 찌낚시"><div class="grid date-grid"><div><label for="date-from">출조 시작일</label><input id="date-from" name="date_from" type="date" value="${esc(params.get('date_from'))}"></div><div><label for="date-to">출조 종료일</label><input id="date-to" name="date_to" type="date" value="${esc(params.get('date_to'))}"></div></div><p class="field-help">출조일 기준이며 시작일·종료일을 모두 포함합니다. 한쪽 날짜만 입력해도 검색할 수 있어요.</p></details>${formError}<button class="primary" type="submit">검색</button><button id="reset-search" type="button">전체 보기</button></form><div id="posts"></div>`;
      showList('#posts',result,listPath,route==='search'?'search':route==='following'?'following':'home');
      if (route === 'search') {
        formAction('search',async data=>{const error=searchValidation(data);if(error)throw new Error(error);const path=searchPath(new URLSearchParams(data));const hash='#search'+(path.includes('?')?path.slice(path.indexOf('?')):'');if(location.hash===hash)await render({focus:true});else location.hash=hash;});
        document.querySelector('#reset-search').onclick=()=>{if(location.hash==='#search')render();else location.hash='search';};
      }
    } else if(route==='map'){
      const region=(params.get('region')||'').trim().slice(0,50),view=regionMapView(region);
      const listPath='/posts'+(region?'?'+new URLSearchParams({region}):'');
      const result=await api(listPath);if(current!==generation)return;
      main.innerHTML=`<div class="section-head"><div><p class="eyebrow">FISHING REGIONS</p><h1>${icon('map')} 지역별 낚시지도</h1></div><a href="#write" class="primary">조황 남기기</a></div><p class="muted">조황에 적힌 지역으로 찾아보세요. 지도는 지역 주변을 보여주며 실제 낚시 지점이나 조황 위치 핀을 표시하지 않습니다.</p><nav class="region-map-tabs" aria-label="지도 지역 선택">${mapRegions.map(item=>`<a href="${esc(regionMapPath(item.region))}" aria-current="${region===item.region?'page':'false'}">${esc(item.name)}</a>`).join('')}</nav><section class="card map-panel"><div class="section-head"><h2>${esc(view.name)} 주변 지도</h2><span class="tag">지역 참고용</span></div>${!view.matched?'<p class="field-help">입력한 지역의 지도 범위가 준비되지 않아 전국 지도를 표시합니다. 조황 목록은 입력한 지역으로 검색합니다.</p>':''}<div id="map-slot" class="map-slot"><div><p>지도를 열면 OpenStreetMap에 연결됩니다.</p><p class="field-help">휴대폰 GPS와 조황 정보는 보내지 않습니다. 외부 지도 서비스에는 일반 접속 정보가 전달됩니다.</p><button type="button" id="load-map" class="primary">외부 지도 불러오기</button></div></div><p class="field-help map-credit">지도 © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap 기여자</a> · <a href="${esc(view.external)}" target="_blank" rel="noopener noreferrer">지도 크게 열기 ↗</a></p><p class="field-help">지도가 비어 있거나 연결되지 않으면 크게 열기를 이용해주세요. 지도 연결 없이도 아래 조황 목록을 이용할 수 있습니다.</p></section><form id="map-search" class="card form"><label for="map-region">조황 지역 검색</label><div class="market-search-row"><input id="map-region" name="region" maxlength="50" value="${esc(region)}" placeholder="예: 강릉, 거제"><button type="submit">찾기</button></div>${formError}</form><h2>${region?esc(region)+' 지역 조황':'전체 지역 조황'}</h2><div id="posts"></div>`;
      showList('#posts',result,listPath,'map');
      formAction('map-search',async data=>{const hash=regionMapPath(data.region);if(location.hash===hash)await render({focus:true});else location.hash=hash;});
      document.querySelector('#load-map').onclick=()=>{const frame=document.createElement('iframe');frame.title=view.name+' 주변 참고 지도 · OpenStreetMap';frame.src=view.embed;frame.referrerPolicy='no-referrer';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-popups');frame.setAttribute('allow',"geolocation 'none'");document.querySelector('#map-slot').replaceChildren(frame);};
    } else if(route==='ranking'){
      const period=params.get('period')||'7';
      const result=await api('/rankings?period='+encodeURIComponent(period));if(current!==generation)return;
      main.innerHTML=`<div class="section-head"><div><p class="eyebrow">POPULAR CATCHES</p><h1>${icon('trophy')} 인기 조황 랭킹</h1></div><button type="button" id="refresh-ranking">새로고침</button></div><div class="tabs ranking-periods">${[['7','최근 7일'],['30','최근 30일'],['all','전체 기간']].map(([value,label])=>`<a class="filter-tab" href="#ranking?period=${value}" aria-current="${period===value?'page':'false'}">${label}</a>`).join('')}</div><section class="ranking-guide"><p>${period==='all'?'전체 기간':`최근 ${esc(period)}일`}에 등록된 조황의 <strong>누적 좋아요 수</strong> 순입니다. 동률이면 나중에 등록된 글을 먼저 표시합니다.</p><p class="field-help">좋아요 1개 이상인 공개 조황 최대 20개 · 커뮤니티 제외<br>조회 시점: ${esc(new Date(result.generated_at).toLocaleString('ko-KR'))} · 새로고침하면 순위가 갱신됩니다.</p></section><div id="ranking-posts">${result.posts.map((p,i)=>`<section class="rank-entry"><div class="rank-label ${i<3?'rank-top':''}">${icon('trophy')} <strong>${i+1}위</strong><span>누적 좋아요 ${p.ranking_likes}</span></div>${card(p)}</section>`).join('')||'<section class="card empty"><h2>아직 순위에 오른 조황이 없어요.</h2><p class="muted">선택한 기간에 등록되고 좋아요를 받은 조황이 여기에 표시됩니다.</p><a class="primary" href="#feed">조황피드 둘러보기</a></section>'}</div>`;
      document.querySelector('#refresh-ranking').onclick=()=>render();
    } else if(route==='market'){
      const status=params.get('status')||'all',fields=marketFilters(params),author=Number(params.get('author'))||null;
      if(!['all','selling','sold'].includes(status))throw new Error('거래 상태를 확인해주세요.');
      const validation=marketSearchError(fields);if(validation)throw new Error(validation);
      const path=marketPath(fields,status,author,true),result=await api(path);if(current!==generation)return;main.className='market-page';
      main.innerHTML=`<div class="section-head"><div><p class="eyebrow">HIT MARKET</p><h1>${author?'낚시인의 장터 글':'낚시 장터'}</h1></div><a href="#market-write" class="primary">상품 등록</a></div><p class="muted">낚시용품을 소개하는 상품 게시판입니다. 앱 내 결제·배송·채팅은 아직 제공하지 않습니다.</p><form id="market-search" class="card form"><label for="market-query">상품명·설명 검색</label><input id="market-query" name="q" maxlength="80" value="${esc(fields.q)}" placeholder="예: 낚싯대, 릴, 가방"><label for="market-region">거래 지역</label><input id="market-region" name="region" maxlength="50" value="${esc(fields.region)}" placeholder="예: 강릉, 거제"><div class="grid market-price-grid">${[['min_price','최저 가격 (원)'],['max_price','최고 가격 (원)']].map(([key,label])=>`<div><label for="market-${key}">${label}</label><input id="market-${key}" name="${key}" type="number" inputmode="numeric" min="0" max="1000000000" step="1" value="${esc(fields[key])}" placeholder="제한 없음"></div>`).join('')}</div><p class="field-help">상품명 또는 설명에 검색어가 포함된 글을 찾습니다. 가격은 양 끝을 포함하며 최고 가격을 0원으로 입력하면 나눔 글을 찾습니다.</p><div class="actions"><button type="submit" class="primary">상품 찾기</button><a href="${esc(marketPath({},'all',author))}">검색 조건 지우기</a></div>${formError}</form><div class="tabs">${[['all','전체'],['selling','판매 중'],['sold','거래 완료']].map(([value,label])=>`<a href="${esc(marketPath(fields,value,author))}" class="filter-tab" aria-current="${status===value?'page':'false'}">${label}</a>`).join('')}</div><p class="field-help">현재 조건의 최신 상품 글입니다.${author?' 이 작성자의 상품만 표시합니다.':''}</p><div id="posts"></div>`;
      showList('#posts',result,path,'market');
      formAction('market-search',async data=>{const error=marketSearchError(data);if(error)throw new Error(error);const hash=marketPath(data,status,author);if(location.hash===hash)await render();else location.hash=hash;});
    } else if(route==='people'){
      const query=(params.get('q')||'').trim();
      if(query.length>30)throw new Error('닉네임은 30자 이내로 검색해주세요.');
      main.innerHTML=`<p class="eyebrow">MEET ANGLERS</p><h1>${icon('users')} 낚시인 찾기</h1><p class="muted">함께 낚시 이야기를 나누고 싶은 사람의 닉네임을 검색해보세요.</p><form id="people-search" class="card form"><label for="people-query">닉네임</label><input id="people-query" name="q" required maxlength="30" value="${esc(query)}" placeholder="닉네임의 일부를 입력해주세요"><p class="field-help">닉네임에 포함된 글자를 찾습니다. 이메일·소개 글로는 검색하지 않습니다.</p>${formError}<button type="submit" class="primary">낚시인 검색</button><a href="#people" class="back">검색 지우기</a></form><div id="people-results" aria-live="polite"></div>`;
      formAction('people-search',async data=>{if(!data.q.trim())throw new Error('검색할 닉네임을 입력해주세요.');if(data.q.trim().length>30)throw new Error('닉네임은 30자 이내로 검색해주세요.');const hash=peoplePath(data.q);if(location.hash===hash)await render({focus:true});else location.hash=hash;});
      const list=document.querySelector('#people-results');
      if(!query){list.innerHTML='<section class="card empty"><h2>닉네임으로 만나보세요.</h2><p class="muted">검색한 낚시인의 프로필에서 조황을 보고 팔로우할 수 있어요.</p></section>';}
      else {
        const path=peoplePath(query,true),result=await api(path);if(current!==generation)return;
        const showPeople=(result,append=false)=>{
          if(!append)list.replaceChildren();
          if(!result.users.length&&!append){list.innerHTML='<section class="card empty"><h2>일치하는 낚시인이 없어요.</h2><p class="muted">닉네임의 일부만 입력하거나 다른 글자로 찾아보세요.</p></section>';return;}
          for(const person of result.users){const item=document.createElement('article');item.className='card people-result';item.innerHTML=`${avatar(person)}<div><h2><a href="#user/${person.id}">${esc(person.nickname)}</a></h2><p class="content">${esc(person.bio||'아직 소개를 작성하지 않았어요.')}</p><a href="#user/${person.id}" class="people-profile-link">${person.id===me?.id?'내 프로필 보기':person.followed?'팔로잉 중 · 프로필 보기':'프로필 보기'} →</a></div>`;list.append(item);}
          if(result.next){const more=document.createElement('button');more.type='button';more.textContent='검색 결과 더 보기';list.append(more);more.onclick=async()=>{more.disabled=true;try{const next=await api(path+'&before='+result.next);if(current!==generation)return;more.remove();showPeople(next,true);}catch(error){toast(error.message);more.disabled=false;}};}
        };
        showPeople(result);
      }
    } else if(route==='community'){
      const author=Number(params.get('author'))||null,query=(params.get('q')||'').trim();
      const validation=searchValidation({q:query});if(validation)throw new Error(validation);
      const path=communityPath(query,author,true);
      const result=await api(path);if(current!==generation)return;
      main.innerHTML=`<div class="section-head"><div><p class="eyebrow">HIT COMMUNITY</p><h1>${author?'낚시인의 커뮤니티 글':'커뮤니티'}</h1></div><a href="#community-write" class="primary">글쓰기</a></div><p class="muted">낚시 질문과 장비 이야기, 유용한 정보를 나눠보세요.</p><p><a class="back" href="#people">함께할 낚시인 찾기 →</a></p><form id="community-search" class="card form"><label for="community-query">제목·본문 검색</label><input id="community-query" name="q" maxlength="80" value="${esc(query)}" placeholder="예: 채비 질문, 낚싯대 후기"><p class="field-help">제목 또는 본문에 검색어가 포함된 글을 찾습니다.${author?' 현재 작성자의 글에서 검색합니다.':''}</p>${formError}<button type="submit" class="primary">이야기 찾기</button><a class="back" href="${esc(communityPath('',author))}">검색어 지우기</a></form><div class="tabs"><a href="${esc(communityPath(query))}" class="filter-tab" ${!author?'aria-current="page"':''}>전체 이야기</a>${me?`<a class="filter-tab" href="${esc(communityPath(query,me.id))}" ${author===me.id?'aria-current="page"':''}>내 글</a>`:''}</div><div id="posts"></div>`;
      showList('#posts',result,path,query?'community-search':'community');
      formAction('community-search',async data=>{const error=searchValidation({q:data.q});if(error)throw new Error(error);const hash=communityPath(data.q,author);if(location.hash===hash)await render({focus:true});else location.hash=hash;});
    } else if(route==='notifications'){
      if(!guardWrite(route))return;
      const result=await api('/notifications');if(current!==generation)return;
      updateNotificationBadge(result.unread);
      main.innerHTML=`<div class="section-head"><h1>${icon('bell')} 알림</h1><button id="refresh-notifications" type="button">새로고침</button></div><p class="muted">내 글의 댓글·좋아요와 새 팔로워 소식을 확인하세요. 화면을 열거나 새로고침하면 갱신됩니다.</p><button id="read-all" type="button" ${!result.unread?'disabled':''}>모두 읽음</button><div id="notifications-list"></div>`;
      showNotifications(result);
      document.querySelector('#refresh-notifications').onclick=()=>render();
      document.querySelector('#read-all').onclick=async event=>{event.target.disabled=true;try{if(result.notifications[0])await api('/notifications/read','PUT',{through_id:result.notifications[0].id});if(current===generation)await render();}catch(e){toast(e.message);if(event.target.isConnected)event.target.disabled=false;}};
    } else if(route==='my-posts'){
      if(!guardWrite(route+(params.size?'?'+params:'')))return;
      const kind=params.get('kind')||'catch',query=(params.get('q')||'').trim(),path=myPostsPath(query,kind,true);
      const validation=searchValidation({q:query});if(validation)throw new Error(validation);
      const result=await api(path);if(current!==generation)return;
      const label={catch:'조황',community:'커뮤니티',market:'장터'}[kind],write={catch:'#write',community:'#community-write',market:'#market-write'}[kind];
      main.innerHTML=`<div class="section-head"><div><p class="eyebrow">MY POSTS</p><h1>내 글 관리</h1></div><a href="${write}" class="primary">${label} 글쓰기</a></div><p class="muted">로그인한 계정이 작성한 글을 찾아 수정합니다. 숨김 처리되거나 현재 볼 수 없는 글은 표시되지 않습니다.</p><div class="tabs">${[['catch','조황'],['community','커뮤니티'],['market','장터']].map(([value,name])=>`<a class="filter-tab" href="${esc(myPostsPath(query,value))}" aria-current="${kind===value?'page':'false'}">${name}</a>`).join('')}</div><form id="my-posts-search" class="card form"><label for="my-posts-query">내 글 제목·본문 검색</label><input id="my-posts-query" name="q" maxlength="80" value="${esc(query)}" placeholder="찾을 단어를 입력해주세요"><p class="field-help">현재 ${label} 게시판의 내 글에서 검색합니다. 게시판을 바꿔도 검색어를 유지합니다.</p>${formError}<button type="submit" class="primary">내 글 찾기</button><a class="back" href="${esc(myPostsPath('',kind))}">검색어 지우기</a></form><div id="managed-posts"></div>`;
      showList('#managed-posts',result,path,'manage-'+kind);
      formAction('my-posts-search',async data=>{const error=searchValidation({q:data.q});if(error)throw new Error(error);const hash=myPostsPath(data.q,kind);if(location.hash===hash)await render({focus:true});else location.hash=hash;});
    } else if(route==='saved'){
      if(!guardWrite(route))return;
      const result=await api('/posts?saved=1');if(current!==generation)return;
      main.innerHTML=`<a class="back" href="#profile">← 내 프로필</a><div class="section-head"><h1>${icon('bookmark')} 저장한 글</h1></div><p class="muted">나만 볼 수 있는 목록입니다. 글이 삭제되거나 볼 수 없는 상태가 되면 목록에서 숨겨집니다.</p><div id="posts"></div>`;
      showList('#posts',result,'/posts?saved=1','saved');
    } else if(route.startsWith('coming/')){
      const label=upcoming[route.split('/')[1]];if(!label)throw new Error('페이지를 찾을 수 없습니다.');
      main.innerHTML=`<section class="card coming-soon"><div class="coming-icon">${icon('calendar')}</div><p class="eyebrow">COMING SOON</p><h1>${esc(label)} 준비 중입니다.</h1><p class="muted">더 즐거운 낚시를 위한 공간을 준비하고 있어요.<br>지금은 조황을 기록하고 낚시인들과 이야기를 나눠보세요.</p><a class="primary" href="#feed">조황피드 둘러보기</a></section>`;
    } else if (route === 'login' || route === 'signup') {
      const signup = route === 'signup';
      main.innerHTML = `<section class="card"><span class="eyebrow">WELCOME TO HIT</span><h1>${signup ? '첫 기록을 시작해요.' : '다시 만나 반가워요.'}</h1><p class="muted">${meta.development_mail?'개발용 메일함에서 인증·재설정 안내를 확인할 수 있습니다.':'가입한 이메일로 인증·재설정 안내를 보내드립니다.'}</p><form id="auth" class="form">${signup ? '<label for="nickname">닉네임</label><input id="nickname" name="nickname" maxlength="30" autocomplete="nickname" required>' : ''}<label for="email">이메일</label><input id="email" name="email" type="email" maxlength="254" autocomplete="username" required><label for="password">비밀번호 (12~128자)</label><input id="password" name="password" type="password" minlength="12" maxlength="128" autocomplete="${signup ? 'new-password' : 'current-password'}" required>${formError}<button class="primary" type="submit">${signup ? '회원가입' : '로그인'}</button></form><p><a href="#${signup ? 'login' : 'signup'}">${signup ? '이미 계정이 있어요 →' : '처음이신가요? 회원가입 →'}</a></p>${!signup?'<p><a href="#forgot">비밀번호를 잊으셨나요? →</a></p>':''}</section>`;
      formAction('auth',async(data,stillHere)=>{ me = (await api(signup ? '/signup' : '/login', 'POST', data)).user; if(stillHere())location.hash=me.suspended||!me.email_verified?'settings':returnTo;else render(); toast(signup ? '가입했습니다. 첫 조황을 남겨보세요.' : '로그인했습니다.'); });
    } else if (route === 'forgot') {
      main.innerHTML=`<a href="#login" class="back">← 로그인</a><h1>비밀번호 찾기</h1><form id="forgot-form" class="card form"><p>가입한 이메일을 입력해주세요.</p><label for="email">이메일</label><input id="email" name="email" type="email" maxlength="254" autocomplete="email" required>${formError}<button type="submit" class="primary">재설정 안내 받기</button></form>`;
      formAction('forgot-form',async(data,stillHere)=>{const result=await api('/password/forgot','POST',data);if(!stillHere()){toast('재설정 요청을 접수했습니다.');return;}main.innerHTML=`<section class="card"><h1>메일함을 확인해주세요.</h1><p>${esc(result.message)}</p>${meta.development_mail?`<p class="muted">로컬 검증에서는 로그인한 계정의 <a href="#mailbox">개발용 메일함</a> 또는 이 PC의 메일함 확인 명령을 사용합니다.</p>`:''}<a href="#login">로그인으로 →</a></section>`;});
    } else if (/^verify\/[a-f0-9]{64}$/.test(route)) {
      const token=route.split('/')[1];
      main.innerHTML=`<h1>이메일 인증</h1><form id="verify-form" class="card form"><p>아래 버튼을 누르면 이메일 인증이 완료됩니다.</p>${formError}<button type="submit" class="primary">이메일 인증 완료하기</button></form>`;
      formAction('verify-form',async(_,stillHere)=>{await api('/email/verify','POST',{token});if(!stillHere()){toast('이메일 인증을 완료했습니다.');return;}history.replaceState(null,'',me?'#settings':'#login');toast('이메일 인증을 완료했습니다.');render();});
    } else if (/^reset\/[a-f0-9]{64}$/.test(route)) {
      const token=route.split('/')[1];
      main.innerHTML=`<h1>새 비밀번호 설정</h1><form id="reset-form" class="card form"><p>변경하면 모든 기기의 기존 로그인이 종료됩니다.</p><label for="password">새 비밀번호 (12~128자)</label><input id="password" name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required><label for="password-confirm">새 비밀번호 확인</label><input id="password-confirm" name="confirm" type="password" minlength="12" maxlength="128" autocomplete="new-password" required>${formError}<button type="submit" class="primary">비밀번호 변경</button></form>`;
      formAction('reset-form',async data=>{if(data.password!==data.confirm)throw new Error('두 비밀번호가 일치하지 않습니다.');await api('/password/reset','POST',{token,password:data.password});me=null;history.replaceState(null,'','#login');toast('비밀번호를 변경했습니다. 다시 로그인해주세요.');render();});
    } else if (route === 'mailbox') {
      if(!guard(route))return;
      if(!meta.development_mail)throw new Error('개발용 메일함은 로컬 검증에서만 사용할 수 있습니다.');
      const data=await api('/dev/mail');if(current!==generation)return;
      main.innerHTML=`<a href="#settings" class="back">← 설정</a><h1>개발용 메일함</h1><p class="muted">실제 이메일 발송 없이 본인 계정의 링크를 확인하는 화면입니다.</p><button id="refresh-mail">새로 확인</button><div>${data.messages.map(m=>`<article class="card"><h2>${esc(m.subject)}</h2><p class="muted">유효 시간: ${esc(new Date(m.expires).toLocaleString('ko-KR'))}까지</p><a class="primary" href="${esc(m.link)}">안내 열기 →</a></article>`).join('')||'<section class="card">아직 안내가 없거나 이미 사용한 링크입니다. 설정에서 새 인증 안내를 요청할 수 있습니다.</section>'}</div>`;
      document.querySelector('#refresh-mail').onclick=render;
    } else if (route === 'write' || route === 'community-write' || route === 'market-write' || /^edit\/\d+$/.test(route)) {
      if (!guardWrite(route)) return;
      const id = route.startsWith('edit/') ? route.split('/')[1] : null;
      const p = id ? (await api('/posts/' + id)).post : {};
      if (current !== generation) return;
      const community=id?p.kind==='community':route==='community-write',market=id?p.kind==='market':route==='market-write',discussion=community||market;
      if (id && p.user_id !== me.id) throw new Error('본인의 게시물만 수정할 수 있습니다.');
      main.innerHTML = `<a class="back" href="${market?'#market':community?'#community':'#home'}">← ${market?'장터로':community?'커뮤니티로':'피드로'}</a><h1>${market?(id?'상품 글 수정':'장터 상품 등록'):community?(id?'커뮤니티 글 수정':'커뮤니티 글쓰기'):(id?'조황 수정하기':'오늘의 조황 남기기')}</h1><section class="card"><p class="muted">${market?'상품 상태와 가격을 설명해주세요. 전화번호 등 개인 연락처는 글에 적지 마세요.':community?'낚시 질문과 정보를 자유롭게 나눠주세요. 사진 없이도 등록할 수 있어요.':'사진과 함께 오늘의 한 수를 기록해요.'} 사진의 위치 정보는 저장 시 제거됩니다.</p><p id="draft-status" class="field-help" role="status">글은 이 탭에 24시간 임시 저장됩니다. 탭을 닫으면 사라집니다. 사진과 사진 삭제·순서 변경은 임시 저장되지 않습니다.</p><div id="draft-offer" hidden><p>작성 중이던 임시 글이 있어요. 이어쓰려면 사진은 다시 확인해주세요.</p><button type="button" id="draft-restore">이어쓰기</button><button type="button" id="draft-discard">임시 글 삭제</button></div><form id="post-form" class="form"><label for="photos">${community?'사진 (선택 사항)':market?'상품 사진':'조황 사진'} (최대 5장, 장당 10MB)</label><input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple aria-describedby="photo-help photo-error"><p id="photo-help" class="field-help">JPG·PNG·WebP · 사진을 선택한 뒤 개별 삭제할 수 있습니다. HEIC 원본은 JPG로 변환하거나 스크린샷을 선택해주세요.</p><p id="photo-error" class="error" role="alert" hidden></p><p id="photo-count" class="field-help" role="status"></p><div id="photo-preview" class="photo-preview"></div>${(community?[['title','제목',60]]:market?[['title','상품명',60],['region','거래 지역 (시·군·구)',50]]:[['title', '제목', 60], ['fish', '어종', 30], ['region', '지역 (시·군·구)', 50], ['method', '낚시 방식', 30]]).map(([name, label, max]) => `<label for="${name}">${label}</label><input id="${name}" name="${name}" value="${esc(p[name])}" maxlength="${max}" required>`).join('')}${discussion?'':`<label for="fishing_date">출조일</label><input id="fishing_date" name="fishing_date" type="date" value="${esc(p.fishing_date)}" required>`}${market?`<label for="price">가격 (원, 0원은 나눔)</label><input id="price" name="price" type="number" inputmode="numeric" min="0" max="1000000000" step="1" required value="${esc(p.price)}"><label for="trade-status">거래 상태</label><select id="trade-status" name="trade_status"><option value="selling" ${p.trade_status!=='sold'?'selected':''}>판매 중</option><option value="sold" ${p.trade_status==='sold'?'selected':''}>거래 완료</option></select>`:''}<label for="body">${market?'상품 설명':'이야기'}</label><textarea id="body" name="body" maxlength="2000" required>${esc(p.body)}</textarea>${formError}<button class="primary" type="submit">${id ? '수정 저장' : market?'상품 등록':community?'글 등록':'조황 등록'}</button></form></section>`;
      let selectedPhotos = (p.photos || []).map(photo => ({ id:photo.id, url:photo.url }));
      const originalCount = selectedPhotos.length;
      const owner=me.id,key=id||(market?'new-market':community?'new-community':'new'),form=document.querySelector('#post-form'),status=document.querySelector('#draft-status');
      const values=()=>draftFields(Object.fromEntries(new FormData(form)));
      let baseline=JSON.stringify(values()),photoBaseline=JSON.stringify(selectedPhotos.map(photo=>photo.id));
      const saved=drafts.read(owner,key);
      let pending=saved;
      const save=()=>{
        // Preserve an offered draft until the writer explicitly chooses whether to restore it.
        if(pending)return false;
        const text=values();
        if(JSON.stringify(text)===baseline){drafts.remove(owner,key);return true;}
        const ok=drafts.write(owner,key,text);
        status.textContent=ok?'글 임시 저장됨 · 이 탭에서 24시간 · 사진은 다시 선택해야 합니다.':'임시 저장할 수 없습니다. 화면을 나가기 전에 글을 복사해주세요.';
        return ok;
      };
      editor={save,dirty:()=>JSON.stringify(values())!==baseline||JSON.stringify(selectedPhotos.map(photo=>photo.id||'new'))!==photoBaseline};
      form.addEventListener('input',event=>{if(!Object.hasOwn(draftFields(),event.target.name))return;pending=null;document.querySelector('#draft-offer').hidden=true;save();});
      if(saved){
        document.querySelector('#draft-offer').hidden=false;
        document.querySelector('#draft-restore').onclick=()=>{for(const [name,value] of Object.entries(saved)){const field=form.elements.namedItem(name);if(field)field.value=value;}pending=null;document.querySelector('#draft-offer').hidden=true;save();toast('글을 이어씁니다. 사진을 확인해주세요.');};
        document.querySelector('#draft-discard').onclick=()=>{drafts.remove(owner,key);pending=null;document.querySelector('#draft-offer').hidden=true;toast('임시 글을 삭제했습니다.');};
      }

      const previews = () => {
        const container = document.querySelector('#photo-preview'); container.replaceChildren();document.querySelector('#photo-count').textContent=`선택한 사진 ${selectedPhotos.length} / 5장`;
        selectedPhotos.forEach((photo,index) => {
          const item = document.createElement('div'), img = document.createElement('img'), remove = document.createElement('button');
          img.src = photo.url; img.alt = '선택한 사진 ' + (index+1);
          remove.type = 'button'; remove.textContent = '사진 ' + (index+1) + ' 삭제';
          remove.onclick = () => { const [removed]=selectedPhotos.splice(index,1);if(removed.file){URL.revokeObjectURL(removed.url);previewUrls=previewUrls.filter(url=>url!==removed.url);}document.querySelector('#photo-error').hidden=true;document.querySelector('#photos').removeAttribute('aria-invalid');previews(); };
          item.append(img,remove); container.append(item);
        });
      };
      previews();
      document.querySelector('#photos').onchange = event => {
        const files = [...event.target.files];
        if(!files.length)return;
        const message=photoSelectionError(files,selectedPhotos.length),error=document.querySelector('#photo-error');
        error.textContent=message;error.hidden=!message;
        if(message){event.target.setAttribute('aria-invalid','true');}
        else {event.target.removeAttribute('aria-invalid');for (const file of files) { const url = URL.createObjectURL(file); previewUrls.push(url); selectedPhotos.push({file,url}); }}
        event.target.value = ''; previews();
      };
      let lastFingerprint=null,lastRequestId=null;
      formAction('post-form',async(data,stillHere)=>{
        if (!community && !selectedPhotos.length && (!id || originalCount)) throw new Error('사진을 한 장 이상 남겨주세요.');
        if (selectedPhotos.length) {
          const submit = document.querySelector('#post-form button[type=submit]'); submit.textContent = '사진을 저장하는 중…';
          try { data.photos = await Promise.all(selectedPhotos.map(async photo => photo.id ? {id:photo.id} : {data:await fileBase64(photo.file)})); }
          finally { submit.textContent = id ? '수정 저장' : market?'상품 등록':community?'글 등록':'조황 등록'; }
        }
        if(community){data.kind='community';data.photos=data.photos||[];}
        if(market){data.kind='market';data.price=Number(data.price);}
        if(!id){
          const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)))),byte=>byte.toString(16).padStart(2,'0')).join('');
          if(fingerprint!==lastFingerprint){lastFingerprint=fingerprint;lastRequestId=crypto.randomUUID().replaceAll('-','');}
          data.request_id=lastRequestId;
        }
        const { post } = await api(id ? '/posts/' + id : '/posts', id ? 'PATCH' : 'POST', data); if(stillHere()||JSON.stringify(drafts.read(owner,key))===JSON.stringify(draftFields(data)))drafts.remove(owner,key);if(stillHere()){editor=null;location.hash='post/'+post.id;}toast(market?'상품 글을 저장했습니다.':community?'글을 저장했습니다.':'조황을 저장했습니다.'); });
    } else if (/^post\/\d+$/.test(route)) {
      const { post: p } = await api('/posts/' + route.split('/')[1]); if (current !== generation) return;
      main.innerHTML = `<a class="back" href="${p.kind==='market'?'#market':p.kind==='community'?'#community':'#home'}">← ${p.kind==='market'?'장터로':p.kind==='community'?'커뮤니티로':'피드로'}</a><article class="card"><div class="eyebrow">${p.kind==='market'?'HIT MARKET':p.kind==='community'?'HIT COMMUNITY':'FISHING JOURNAL'}</div><h1>${esc(p.title)}</h1><p class="muted"><a href="#user/${p.user_id}">${esc(p.nickname)}</a> · ${esc(p.kind!=='catch'?new Date(p.created_at).toLocaleDateString('ko-KR'):p.fishing_date)}</p>${photoGallery(p)}${marketInfo(p)}<p>${p.kind!=='catch'?`<span class="tag">${p.kind==='market'?'장터':'커뮤니티'}</span>`:`<span class="tag">${esc(p.region)}</span><span class="tag">${esc(p.fish)}</span><span class="tag">${esc(p.method)}</span>`}</p><p class="content">${esc(p.body)}</p>${me?.id === p.user_id ? `<div class="actions"><a href="#edit/${p.id}">수정</a><button id="delete-post">삭제</button></div><div id="confirm-delete" hidden><p>이 글을 삭제할까요? 삭제 후 복구할 수 없습니다.</p><button id="delete-yes">삭제하기</button><button id="delete-no">취소</button><p class="error" role="alert" hidden></p></div>` : ''}</article><section class="card"><div class="actions">${likeButton(p)}${saveButton(p)}<a href="#user/${p.user_id}">작성자 프로필 →</a>${me?.id!==p.user_id ? `<a href="#report/post/${p.id}">게시물 신고</a>` : ''}</div></section><section class="card"><h2>이야기를 나눠요</h2>${canWrite(me,meta)?`<form id="comment-form" class="form"><p class="field-help">전송에 실패하면 이 화면에서 다시 시도해주세요. 화면을 다시 열었다면 댓글 목록에서 등록 여부를 먼저 확인해주세요.</p><label for="comment">댓글</label><textarea id="comment" name="body" maxlength="300" required placeholder="따뜻한 한마디를 남겨주세요"></textarea>${formError}<button class="primary" type="submit">댓글 등록</button></form>`:`<p class="muted">${!me?'로그인하고 이야기를 나눠보세요.':me.suspended?'이용 제한 상태에서는 댓글을 남길 수 없습니다.':'이메일 인증 후 댓글을 남길 수 있어요.'}</p><a class="primary" href="${me?'#settings':'#login'}" data-login-return="${esc(route)}">${me?'계정 설정 확인':'로그인하기 →'}</a>`}<div id="comments"></div></section>`;
      await loadComments(p.id);
      if (current !== generation) return;
      let lastCommentText=null,commentRequestId=null;
      formAction('comment-form',async(data,stillHere)=>{
        if(editor?.comment)throw new Error('수정 중인 댓글을 먼저 저장하거나 취소해주세요.');
        if(!guardWrite(route))return;
        const content=data.body.trim(),field=document.querySelector('#comment');
        if(content!==lastCommentText){lastCommentText=content;commentRequestId=crypto.randomUUID().replaceAll('-','');}
        data.request_id=commentRequestId;field.readOnly=true;
        try{
          await api('/posts/'+p.id+'/comments','POST',data);
          lastCommentText=null;commentRequestId=null;
          if(stillHere()){if(field.value===data.body)field.value='';await loadComments(p.id);}
          toast('댓글을 남겼습니다.');
        }finally{field.readOnly=false;}
      });
      if (me?.id === p.user_id) {
        const panel = document.querySelector('#confirm-delete');
        document.querySelector('#delete-post').onclick = () => { panel.hidden = false; };
        document.querySelector('#delete-no').onclick = () => { panel.hidden = true; };
        document.querySelector('#delete-yes').onclick = async event => { event.target.disabled = true; try { await api('/posts/' + p.id, 'DELETE', {}); location.hash = p.kind==='market'?'market':p.kind==='community'?'community':'home'; toast('삭제했습니다.'); } catch (e) { const err = panel.querySelector('[role=alert]'); err.textContent = e.message; err.hidden = false; event.target.disabled = false; } };
      }
    } else if (route === 'profile' || /^user\/\d+$/.test(route)) {
      if (route === 'profile' && !guard(route)) return;
      const userId = route === 'profile' ? me.id : Number(route.split('/')[1]);
      const person = (await api('/users/' + userId)).user;
      const result = await api('/posts?author=' + userId); if (current !== generation) return;
      const mine = me?.id === userId;
      main.className="profile-page";
      main.innerHTML = `<section class="card profile-card"><div class="profile">${avatar(person)}<div><span class="eyebrow">히트 크루 · 나의 낚시 기록</span><h1>${esc(person.nickname)}</h1><p class="content">${esc(person.bio || '나만의 낚시 이야기를 남겨보세요.')}</p></div></div><div class="stats"><div><strong>${result.posts.length}${result.next?'+':''}</strong>조황</div><a href="#user/${userId}/followers"><strong>${person.followers}</strong>팔로워</a><a href="#user/${userId}/following"><strong>${person.following}</strong>팔로잉</a></div>${mine ? '<div class="profile-owner-actions"><a href="#profile-edit">프로필 편집 →</a><a href="#my-posts">내 글 관리 →</a><a href="#settings">설정</a><button id="logout">로그아웃</button></div>' : `<button id="follow" aria-pressed="${person.followed}">${person.followed ? '팔로잉 취소' : '＋ 팔로우'}</button><div class="actions"><a href="#report/user/${userId}">사용자 신고</a><button id="block">사용자 차단</button></div><div id="block-confirm" hidden><p>서로의 글·댓글이 숨겨지고 팔로우 관계가 해제됩니다.</p><button id="block-yes">차단하기</button><button id="block-no">취소</button></div>`}</section><div class="profile-tabs"><span aria-current="page">${icon('feed')} 조황</span><a href="#community?author=${userId}">${icon('users')} 커뮤니티</a><a href="#market?author=${userId}">${icon('shop')} 장터</a>${mine?`<a href="#saved">${icon('bookmark')} 저장</a>`:''}</div><h2 class="sr-only">${mine ? '내 글 기록' : '조황 기록'}</h2><div id="posts" class="profile-posts"></div>`;
      showList('#posts',result,'/posts?author='+userId,mine?'mine':'author');
      if (mine) document.querySelector('#logout').onclick = async () => { try { await api('/logout', 'POST', {}); drafts.clear(me.id);me = null; location.hash = 'home'; toast('로그아웃했습니다.'); } catch (e) { toast(e.message); } };
      else document.querySelector('#follow').onclick = async event => { if (!guardWrite(route)) return; event.target.disabled=true; try { await api('/users/'+userId+'/follow', person.followed ? 'DELETE' : 'PUT', {}); render(); } catch (e) { toast(e.message); event.target.disabled=false; } };
      if (!mine) {
        document.querySelector('#block').onclick=()=>{if(guardWrite(route))document.querySelector('#block-confirm').hidden=false;};
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
      if(!guardWrite(route))return;
      const [,type,id]=route.split('/');
      main.innerHTML=`<a class="back" href="#home">← 홈으로</a><h1>신고하기</h1><form id="report-form" class="card form"><p>접수된 신고는 운영자가 검토합니다.</p><label for="reason">신고 사유</label><textarea id="reason" name="reason" maxlength="300" required placeholder="문제가 되는 내용을 설명해주세요"></textarea>${formError}<button class="primary" type="submit">신고 접수</button></form>`;
      formAction('report-form',async(data,stillHere)=>{await api('/reports','POST',{...data,target_type:type,target_id:Number(id)});if(!stillHere()){toast('신고를 접수했습니다.');return;}main.innerHTML='<section class="card"><h1>신고를 접수했습니다.</h1><p>운영자가 확인하겠습니다.</p><a href="#home">홈으로 →</a></section>';});
    } else if(route==='install'){
      main.innerHTML=`<p class="eyebrow">HIT ON YOUR HOME SCREEN</p><h1>히트를 홈 화면에</h1><section class="card install-guide"><img class="app-icon-preview" src="/assets/icon-180.png" width="100" height="100" alt="확정 시안의 히트 HIT 물고기 로고"><h2>아이폰에서 추가하기</h2><ol><li>Safari에서 히트 접속 주소를 엽니다.</li><li>공유 메뉴에서 <strong>홈 화면에 추가</strong>를 선택합니다.</li><li>‘웹 앱으로 열기’가 보이면 켠 뒤 <strong>추가</strong>를 누릅니다.</li><li>홈 화면의 히트 HIT 아이콘을 눌러 실행합니다.</li></ol><p class="field-help">iOS 버전에 따라 메뉴 위치와 표현이 다를 수 있습니다. Safari와 홈 화면 앱의 로그인 상태는 다를 수 있어 다시 로그인이 필요할 수 있습니다.</p><p id="install-state" role="status"></p><button id="install-prompt" type="button" class="primary" hidden>이 기기에 설치</button></section><section class="card"><h2>연결해서 사용하는 앱</h2><p>조황·사진·알림 열람과 글 전송에는 인터넷 연결이 필요합니다. 연결이 끊기면 다시 접속하도록 안내하며 작성 글을 자동으로 전송하지 않습니다.</p><p>앱스토어에 등록된 앱은 아닙니다. 홈 화면 추가와 푸시 알림 수신은 별개이며 푸시는 아직 제공하지 않습니다.</p>${meta.phone_preview?'<p class="field-help">현재는 시범 접속 주소입니다. 이 PC가 켜져 있어야 하며 주소가 바뀌면 홈 화면에 다시 추가해야 합니다. 접속 이메일 인증이 다시 필요할 수 있습니다.</p>':meta.production?'<p class="field-help">서비스 접속 주소를 Safari에서 열어 홈 화면에 추가해주세요.</p>':'<p class="field-help">로컬 주소는 이 PC에서만 열립니다. 아이폰에서는 별도로 안내받은 HTTPS 시범 접속 주소를 사용해주세요.</p>'}<a href="#home">히트 홈으로 →</a></section>`;
      updateInstallView();document.querySelector('#install-prompt').onclick=async()=>{try{const accepted=await requestInstallation();toast(accepted?'설치 요청을 보냈습니다. 기기에서 완료 여부를 확인해주세요.':'설치는 나중에 다시 진행할 수 있습니다.');}catch{toast('설치 메뉴를 열지 못했습니다. Safari 공유 메뉴를 이용해주세요.');}updateInstallView();};
    } else if (route === 'settings') {
      if(!guard(route))return;
      main.innerHTML=`<h1>내 계정 설정</h1><p><a href="#my-posts">내 글 관리 →</a></p><p><a href="#install">홈 화면에 추가 안내 →</a></p><section class="card"><h2>이메일 인증</h2><p>${me.email_verified?'인증을 완료했습니다.':'이메일 인증이 필요합니다.'}</p>${!me.email_verified?'<button id="resend-email">인증 안내 다시 받기</button>':''}${meta.development_mail?'<p><a href="#mailbox">개발용 메일함 열기 →</a></p>':''}<p><a href="#forgot">비밀번호 재설정 안내 받기 →</a></p></section><section class="card">${me.suspended?'<p class="error">이용이 제한된 계정입니다. 글 작성과 소통 기능을 사용할 수 없습니다. 탈퇴는 가능합니다.</p>':''}<p><a href="#profile">내 프로필 →</a></p>${me.is_admin?'<p><a href="#admin">운영자 신고 관리 →</a></p>':''}<h2>차단한 사용자</h2><div id="blocked-users"></div></section><section class="card"><h2>회원 탈퇴</h2><p>계정, 조황·사진, 댓글, 좋아요, 팔로우·차단 관계와 모든 로그인 세션을 삭제합니다. 접수된 신고·운영 기록은 일부 익명화하여 남습니다.</p><p>이 작업은 되돌릴 수 없습니다. 개발 백업 파일은 별도로 관리됩니다.</p><form id="withdraw" class="form"><label for="withdraw-password">현재 비밀번호</label><input id="withdraw-password" type="password" name="password" autocomplete="current-password" required maxlength="128"><label for="withdraw-confirm">확인을 위해 탈퇴를 입력해주세요</label><input id="withdraw-confirm" name="confirm" required autocomplete="off" pattern="탈퇴">${formError}<button type="submit" class="danger-button">계정과 작성 자료 삭제</button></form></section>`;
      const resend=document.querySelector('#resend-email');if(resend)resend.onclick=async()=>{resend.disabled=true;try{const r=await api('/email/resend','POST',{});toast(r.message);}catch(e){toast(e.message);}finally{resend.disabled=false;}};
      await loadBlocked();
      if(current!==generation)return;
      formAction('withdraw',async data=>{await api('/account','DELETE',data);drafts.clear(me.id);me=null;returnTo='profile';location.hash='home';toast('계정과 작성 자료를 삭제했습니다.');});
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
      main.innerHTML=`<a class="back" href="#admin">← 신고 목록</a><h1>신고 #${r.id}</h1><section class="card"><p><strong>${esc(typeLabel(r.target_type))} #${r.target_id} · ${r.status==='open'?'미처리':'처리 완료'}</strong></p><h2>신고 사유</h2><p class="content">${esc(r.reason)}</p><h2>대상 내용</h2>${item?`${item.avatar_url?avatar(item):''}<p>${esc(item.nickname)}</p><p class="content">${esc(item.title||item.body||item.bio||'소개 없음')}</p>${item.title?`<p class="content">${esc(item.body)}</p>${photoGallery(item)}`:''}<p class="muted">${item.hidden?'숨김 상태':''}${item.suspended?' 이용 제한 상태':''}</p>`:'<p>대상이 삭제되었습니다. 종결만 가능합니다.</p>'}</section><form id="resolve-report" class="card form"><label for="action">조치</label><select name="action" id="action"><option value="dismiss">신고 종결 (콘텐츠 변경 없음)</option>${item?`${r.target_type!=='user'?'<option value="hide">콘텐츠 숨김</option><option value="restore">콘텐츠 복원</option>':''}<option value="suspend">작성자 이용 제한</option><option value="unsuspend">작성자 이용 제한 해제</option>`:''}</select><label for="note">조치 사유 (기록에 보존)</label><textarea name="note" id="note" required maxlength="500"></textarea>${formError}<button type="submit" class="primary">조치 적용</button></form><section class="card"><h2>조치 기록</h2>${data.actions.map(a=>`<article class="comment"><strong>${esc(actionLabel(a.action))}</strong><p class="content">${esc(a.note)}</p><p class="muted">${esc(new Date(a.created_at).toLocaleString('ko-KR'))}</p></article>`).join('')||'<p>아직 조치 기록이 없습니다.</p>'}</section>`;
      formAction('resolve-report',async body=>{await api('/admin/reports/'+id+'/resolve','POST',body);toast('조치를 기록했습니다.');render();});
    } else if (route === 'profile-edit') {
      if (!guardWrite(route)) return;
      main.innerHTML = `<h1>나를 소개해요</h1><section class="card"><h2>프로필 사진</h2><div class="profile-avatar-preview" id="avatar-preview">${avatar(me)}</div><form id="avatar-form" class="form"><label for="avatar-file">사진 선택</label><input id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" required aria-describedby="avatar-help avatar-error"><p id="avatar-help" class="field-help">JPG·PNG·WebP 1장, 최대 10MB. 가운데를 정사각형으로 맞추고 위치 정보는 제거합니다. HEIC 원본은 JPG나 PNG로 변환해주세요.</p><p id="avatar-error" class="error" role="alert" hidden></p>${formError}<button class="primary" type="submit">사진 저장</button></form><button id="remove-avatar" type="button" ${!me.avatar_url?'disabled':''}>기본 이미지로 변경</button></section><form id="profile" class="card form"><label for="nickname">닉네임</label><input id="nickname" name="nickname" maxlength="30" value="${esc(me.nickname)}" required><label for="bio">소개</label><textarea id="bio" name="bio" maxlength="200">${esc(me.bio)}</textarea>${formError}<button class="primary" type="submit">프로필 저장</button></form>`;
      let selectedAvatar=null;
      document.querySelector('#avatar-file').onchange=event=>{
        const file=event.target.files[0];
        if(!file)return;
        const message=photoSelectionError([file],0,1),error=document.querySelector('#avatar-error');error.textContent=message;error.hidden=!message;
        if(message){event.target.setAttribute('aria-invalid','true');event.target.value='';return;}
        event.target.removeAttribute('aria-invalid');
        selectedAvatar=file;event.target.required=false;const url=URL.createObjectURL(file);previewUrls.push(url);document.querySelector('#avatar-preview').innerHTML=avatar({nickname:me.nickname,avatar_url:url});
      };
      formAction('avatar-form',async(_,stillHere)=>{if(!selectedAvatar)throw new Error('사진을 선택해주세요.');const picker=document.querySelector('#avatar-file'),remove=document.querySelector('#remove-avatar');picker.disabled=true;remove.disabled=true;try{const r=await api('/profile/photo','PUT',{photo:{data:await fileBase64(selectedAvatar)}});if(stillHere()){me=r.user;render();}toast('프로필 사진을 저장했습니다.');}finally{picker.disabled=false;remove.disabled=!me?.avatar_url;}});
      document.querySelector('#remove-avatar').onclick=async event=>{event.target.disabled=true;try{me=(await api('/profile/photo','DELETE',{})).user;toast('기본 이미지로 변경했습니다.');render();}catch(e){toast(e.message);event.target.disabled=false;}};
      formAction('profile',async(data,stillHere)=>{const result=await api('/profile','PATCH',data);if(stillHere()){me=result.user;location.hash='profile';}toast('프로필을 저장했습니다.');});
    } else throw new Error('없는 화면입니다. 홈으로 이동해주세요.');
  } catch (e) {
    if (current !== generation) return;
    main.innerHTML = `<section class="card"><h2>잠시 확인이 필요해요</h2><p class="error" role="alert">${esc(e.message)}</p><button id="retry">다시 시도</button> ${route==='search'?'<a href="#search" class="back">검색 조건 초기화</a>':''} <a href="#home">홈으로</a></section>`;
    document.querySelector('#retry').onclick=()=>render({focus:true});
  }finally{if(current===generation){main.removeAttribute('aria-busy');if(focus)main.focus({preventScroll:true});}}
}
async function loadComments(postId, before, target = '#comments') {
  const routeAtStart=location.hash;
  const result = await api('/posts/'+postId+'/comments'+(before ? '?before='+before : ''));
  const container = document.querySelector(target); if (!container || routeAtStart!==location.hash) return;
  container.innerHTML = result.comments.map(c => `<article class="comment" data-comment-id="${c.id}"><div class="author">${avatar(c)}<a href="#user/${c.user_id}"><strong>${esc(c.nickname)}</strong></a></div><p class="content" data-comment-body>${esc(c.body)}</p>${me?.id!==c.user_id ? `<a href="#report/comment/${c.id}">댓글 신고</a>` : ''}${me?.id===c.user_id ? `<div class="comment-actions"><button data-edit-comment="${c.id}" type="button">댓글 수정</button><button data-delete-comment="${c.id}" data-post="${postId}" type="button">내 댓글 삭제</button></div>` : ''}</article>`).join('') || (before ? '' : '<p class="muted">첫 댓글을 남겨보세요.</p>');
  if (result.next) {
    const more = document.createElement('button'); more.textContent='이전 댓글 더 보기'; container.append(more);
    more.onclick = async () => { more.disabled=true; try { const next = document.createElement('div'); next.id='comments-page-'+result.next; more.before(next);try{await loadComments(postId,result.next,'#'+next.id);more.remove();}catch(e){next.remove();throw e;} } catch(e){toast(e.message);more.disabled=false;} };
  }
}
async function loadPeople(userId,kind,before,target='#people') {
  const routeAtStart=location.hash;
  const result = await api('/users/'+userId+'/'+kind+(before ? '?before='+before : ''));
  const container = document.querySelector(target); if (!container || routeAtStart!==location.hash) return;
  container.innerHTML=result.users.map(u=>`<article class="comment"><div class="author">${avatar(u)}<a href="#user/${u.id}"><strong>${esc(u.nickname)}</strong></a></div><p class="content">${esc(u.bio)}</p></article>`).join('') || '<p class="muted">아직 목록이 비어있어요.</p>';
  if (result.next) { const more=document.createElement('button'); more.textContent='더 보기'; container.append(more); more.onclick=async()=>{ more.disabled=true; try { const next=document.createElement('div'); next.id='people-page-'+result.next; more.before(next);try{await loadPeople(userId,kind,result.next,'#'+next.id);more.remove();}catch(e){next.remove();throw e;} } catch(e){toast(e.message);more.disabled=false;} }; }
}
async function loadBlocked(before,target='#blocked-users') {
  const at=location.hash, result=await api('/blocks'+(before?'?before='+before:''));
  const container=document.querySelector(target);if(!container||at!==location.hash)return;
  container.innerHTML=result.users.map(u=>`<div class="row comment"><strong>${esc(u.nickname)}</strong><button data-unblock="${u.id}">차단 해제</button></div>`).join('')||'<p class="muted">차단한 사용자가 없습니다.</p>';
  if(result.next){const more=document.createElement('button');more.textContent='더 보기';container.append(more);more.onclick=async()=>{more.disabled=true;try{const next=document.createElement('div');next.id='blocked-'+result.next;more.before(next);try{await loadBlocked(result.next,'#'+next.id);more.remove();}catch(e){next.remove();throw e;}}catch(e){toast(e.message);more.disabled=false;}};}
}
async function loadReports(status,before,target='#reports') {
  const at=location.hash,result=await api('/admin/reports?status='+status+(before?'&before='+before:''));
  const container=document.querySelector(target);if(!container||at!==location.hash)return;
  container.innerHTML=result.reports.map(r=>`<article class="comment"><a href="#admin/report/${r.id}"><strong>신고 #${r.id} · ${esc(typeLabel(r.target_type))} #${r.target_id}</strong></a><p class="content">${esc(r.reason)}</p></article>`).join('')||'<p class="muted">해당 신고가 없습니다.</p>';
  if(result.next){const more=document.createElement('button');more.textContent='더 보기';container.append(more);more.onclick=async()=>{more.disabled=true;try{const next=document.createElement('div');next.id='reports-'+result.next;more.before(next);try{await loadReports(status,result.next,'#'+next.id);more.remove();}catch(e){next.remove();throw e;}}catch(e){toast(e.message);more.disabled=false;}};}
}
main.addEventListener('click',async event=>{
  const button=event.target.closest('[data-unblock]');if(!button)return;
  button.disabled=true;try{await api('/blocks/'+button.dataset.unblock,'DELETE',{});await loadBlocked();toast('차단을 해제했습니다. 팔로우는 자동 복원되지 않습니다.');}catch(e){toast(e.message);button.disabled=false;}
});
main.addEventListener('click',async event => {
  const button = event.target.closest('[data-like],[data-delete-comment],[data-save]'); if (!button) return;
  if (!guardWrite(location.hash.slice(1)||'home')) return;
  if(button.dataset.deleteComment&&editor?.comment){toast('수정 중인 댓글을 먼저 저장하거나 취소해주세요.');return;}
  const viewGeneration=generation;
  button.disabled=true;
  try {
    if(button.dataset.save){
      const result=await api('/posts/'+button.dataset.save+'/save',button.dataset.saved==='true'?'DELETE':'PUT',{});
      if(viewGeneration!==generation)return;
      document.querySelectorAll('[data-save="'+button.dataset.save+'"]').forEach(item=>{item.dataset.saved=String(result.saved);item.setAttribute('aria-pressed',result.saved);item.classList.toggle('is-saved',result.saved);item.innerHTML=icon('bookmark')+' '+(result.saved?'저장됨':'저장');});
      if(location.hash==='#saved'&&!result.saved)await render();
      toast(result.saved?'내 저장 목록에 담았습니다.':'저장을 해제했습니다.');
    } else if (button.dataset.like) {
      const result=await api('/posts/'+button.dataset.like+'/like',button.dataset.liked==='true' ? 'DELETE' : 'PUT',{});
      button.dataset.liked=String(result.liked); button.setAttribute('aria-pressed',result.liked); button.classList.toggle('liked',result.liked); button.textContent=(result.liked ? '♥' : '♡')+' 좋아요 '+result.likes;
    } else { await api('/comments/'+button.dataset.deleteComment,'DELETE',{}); await loadComments(button.dataset.post); toast('댓글을 삭제했습니다.'); }
  } catch(e) {toast(e.message);} finally {button.disabled=false;}
});
main.addEventListener('click',event=>{
  const button=event.target.closest('[data-edit-comment]');if(!button)return;
  if(!guardWrite(location.hash.slice(1)||'home'))return;
  if(editor?.comment){toast('수정 중인 댓글을 먼저 저장하거나 취소해주세요.');return;}
  if(document.querySelector('#comment-form')?.getAttribute('aria-busy')==='true'||document.querySelector('[data-delete-comment]:disabled')){toast('진행 중인 댓글 처리가 끝난 뒤 수정해주세요.');return;}
  const article=button.closest('[data-comment-id]'),bodyNode=article.querySelector('[data-comment-body]'),original=bodyNode.textContent,current=generation;
  const form=document.createElement('form');form.className='form comment-edit-form';form.innerHTML=`<label for="edit-comment-${button.dataset.editComment}">댓글 수정 내용</label><textarea id="edit-comment-${button.dataset.editComment}" name="body" maxlength="300" required aria-describedby="edit-comment-help-${button.dataset.editComment}"></textarea><p class="field-help" id="edit-comment-help-${button.dataset.editComment}">300자 이내 · 수정 내용은 임시 저장되지 않습니다.</p>${formError}<button type="submit" class="primary">댓글 수정 저장</button><button type="button" data-cancel-edit>취소</button>`;
  const field=form.querySelector('textarea'),error=form.querySelector('[role=alert]'),controls=article.querySelectorAll('.comment-actions button');let pending=false;
  field.value=original;bodyNode.hidden=true;controls.forEach(item=>item.disabled=true);article.querySelector('.comment-actions').before(form);field.focus();
  const session={comment:true,save:()=>false,dirty:()=>pending||field.value!==original,get leaveMessage(){return pending?'댓글을 저장 중입니다. 이동해도 수정이 반영될 수 있습니다. 이동할까요?':'댓글 수정이 끝나지 않았습니다. 임시 저장 없이 이동할까요?';}};editor=session;
  const close=value=>{if(editor===session)editor=null;if(!article.isConnected||current!==generation)return;const blockedError=document.querySelector('#comment-form [role=alert]');if(blockedError?.textContent==='수정 중인 댓글을 먼저 저장하거나 취소해주세요.'){blockedError.hidden=true;blockedError.textContent='';}if(value!==undefined)bodyNode.textContent=value;bodyNode.hidden=false;form.remove();controls.forEach(item=>item.disabled=false);button.focus();};
  form.querySelector('[data-cancel-edit]').onclick=()=>close();
  form.onsubmit=async event=>{
    event.preventDefault();if(pending)return;
    error.hidden=true;error.textContent='';pending=true;field.readOnly=true;form.setAttribute('aria-busy','true');form.querySelectorAll('button').forEach(item=>item.disabled=true);
    try{const result=await api('/comments/'+button.dataset.editComment,'PATCH',{body:field.value});close(result.body);if(current===generation)toast('댓글을 수정했습니다.');}
    catch(err){if(form.isConnected&&current===generation){error.textContent=err.message;error.hidden=false;error.tabIndex=-1;error.focus();}}
    finally{pending=false;field.readOnly=false;form.removeAttribute('aria-busy');form.querySelectorAll('button').forEach(item=>item.disabled=false);}
  };
});
function updateNotificationBadge(unread){const badge=document.querySelector('#notification-count');badge.hidden=!unread;badge.textContent=unread>99?'99+':String(unread);document.querySelector('#notifications-link').setAttribute('aria-label',unread?`알림, 읽지 않은 알림 ${unread}개`:'알림');}
function showNotifications(result,append=false){
  const list=document.querySelector('#notifications-list'),viewGeneration=generation;
  if(!list)return;
  if(!append)list.replaceChildren();
  if(!result.notifications.length&&!append){list.innerHTML='<section class="card empty"><h2>아직 새로운 소식이 없어요.</h2><p class="muted">내 글에 댓글·좋아요가 달리거나 새 팔로워가 생기면 알려드릴게요.</p><a href="#feed" class="primary">조황피드 둘러보기</a></section>';return;}
  for(const n of result.notifications){const item=document.createElement('article');item.className='card notification-item '+(n.is_read?'is-read':'is-unread');item.innerHTML=`<span class="notification-symbol">${icon(n.kind==='follow'?'users':n.kind==='like'?'feed':'bell')}</span><div><p><strong>${esc(n.nickname)}</strong>님이 ${n.kind==='follow'?'나를 팔로우했습니다.':n.kind==='like'?'내 글을 좋아합니다.':'내 글에 댓글을 남겼습니다.'}</p><small class="muted">${esc(new Date(n.created_at).toLocaleString('ko-KR'))} · ${n.is_read?'읽음':'읽지 않음'}</small><button type="button" data-notification="${n.id}" data-destination="${esc(n.href)}">${n.kind==='follow'?'프로필 확인':'조황 확인'} →</button></div>`;list.append(item);}
  if(result.next){const more=document.createElement('button');more.type='button';more.textContent='이전 알림 더 보기';list.append(more);more.onclick=async()=>{more.disabled=true;try{const next=await api('/notifications?before='+result.next);if(viewGeneration!==generation)return;more.remove();showNotifications(next,true);}catch(e){toast(e.message);more.disabled=false;}};}
}
main.addEventListener('click',async event=>{const button=event.target.closest('[data-notification]');if(!button)return;const current=generation;button.disabled=true;try{await api('/notifications/'+button.dataset.notification+'/read','PUT',{});if(current===generation)location.hash=button.dataset.destination;}catch(e){toast(e.message);button.disabled=false;}});
function updateGallery(track){
  const gallery=track.closest('.gallery'),count=track.children.length,index=galleryPosition(track.scrollLeft,track.clientWidth,count);
  gallery.querySelector('.gallery-position').textContent=`${index+1} / ${count}`;
  gallery.querySelectorAll('[data-gallery]').forEach(button=>button.disabled=Number(button.dataset.gallery)<0?index===0:index>=count-1);
}
function moveGallery(track,direction){track.scrollBy({left:track.clientWidth*direction,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
main.addEventListener('click',event=>{const button=event.target.closest('[data-gallery]');if(button)moveGallery(button.closest('.gallery').querySelector('.gallery-track'),Number(button.dataset.gallery));const link=event.target.closest('[data-login-return]');if(link)returnTo=link.dataset.loginReturn;});
main.addEventListener('scroll',event=>{if(event.target.classList?.contains('gallery-track'))updateGallery(event.target);},true);
main.addEventListener('keydown',event=>{if(event.target.classList?.contains('gallery-track')&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();moveGallery(event.target,event.key==='ArrowLeft'?-1:1);}});
document.querySelector('#skip-link').onclick=event=>{event.preventDefault();main.focus();};
addEventListener('hashchange',()=>{
  if(location.hash===activeHash)return;
  if(editor?.dirty()){
    const saved=editor.save();
    if(!confirm(editor.leaveMessage||(saved?'작성 중인 글은 이 탭에 임시 저장됩니다. 사진 변경은 저장되지 않습니다. 이동할까요?':'임시 저장하지 못했습니다. 이동하면 작성 내용을 잃을 수 있습니다. 이동할까요?'))){
      history.replaceState(null,'',location.pathname+location.search+activeHash);return;
    }
  }
  activeHash=location.hash;render({focus:true});window.scrollTo(0,0);
});
render();
prepareInstallation();

document.querySelector('#header-search').onsubmit=event=>{event.preventDefault();location.hash='search?region='+encodeURIComponent(document.querySelector('#quick-search').value.trim());};
function updateInstallView(){const status=document.querySelector('#install-state'),button=document.querySelector('#install-prompt');if(status)status.textContent=installationStatus();if(button)button.hidden=!installationState().canPrompt;}
addEventListener('hit-install-state',updateInstallView);
function connectionStatus(){const banner=document.querySelector('#connection-status');banner.hidden=navigator.onLine!==false;banner.textContent='기기가 오프라인 상태입니다. 입력 중인 화면은 그대로 두고 인터넷 연결을 확인해주세요. 글은 자동 전송되지 않습니다.';}
addEventListener('online',connectionStatus);addEventListener('offline',connectionStatus);connectionStatus();
