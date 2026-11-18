export function parseRoute(hash='') {
  const value=hash.replace(/^#/,''),split=value.indexOf('?');
  return {route:(split<0?value:value.slice(0,split))||'home',params:new URLSearchParams(split<0?'':value.slice(split+1))};
}
export function searchPath(params) {
  const query=new URLSearchParams();
  for(const key of ['q','fish','region','method','date_from','date_to']){const value=(params.get(key)||'').trim();if(value)query.set(key,value);}
  return '/posts'+(query.size?'?'+query:'');
}
export function navigationSection(route) {
  if(['home','following'].includes(route)||route.startsWith('post/'))return 'home';
  if(route==='community'||route==='community-write')return 'community';
  if(route==='market'||route==='market-write')return 'market';
  if(route==='ranking')return 'ranking';
  if(route==='map')return 'map';
  if(route==='people')return 'people';
  if(route==='search')return 'search';
  if(route==='write'||route.startsWith('edit/'))return 'write';
  return 'profile';
}
export function canWrite(user,meta) {
  return !!user&&!user.suspended&&(!meta.verification_required||!!user.email_verified);
}
export function emptyMessage(kind='home') {
  return ({
    map:{title:'이 지역의 조황이 아직 없어요.',body:'다른 지역을 고르거나 조황을 남겨보세요.',href:'#write',label:'조황 남기기 →'},
    market:{title:'조건에 맞는 상품 글이 없어요.',body:'거래 지역이나 판매 상태를 바꿔보세요.',href:'#market',label:'전체 상품 글 보기 →'},
    'community-search':{title:'조건에 맞는 이야기가 없어요.',body:'검색어를 바꾸거나 검색 조건을 지워보세요.',href:'#community',label:'전체 이야기 보기 →'},
    community:{title:'첫 이야기를 나눠보세요.',body:'낚시 질문이나 유용한 정보를 남겨주세요.',href:'#community-write',label:'커뮤니티 글쓰기 →'},
    home:{title:'아직 조황이 없어요.',body:'오늘의 첫 기록을 남겨볼까요?',href:'#write',label:'첫 조황 남기기 →'},
    search:{title:'조건에 맞는 조황이 없어요.',body:'어종이나 지역을 바꾸거나 검색 조건을 지워보세요.',href:'#search',label:'검색 조건 지우기 →'},
    following:{title:'팔로잉 조황이 아직 없어요.',body:'전체 조황에서 관심 있는 작성자를 팔로우해보세요.',href:'#home',label:'전체 조황 둘러보기 →'},
    saved:{title:'아직 저장한 글이 없어요.',body:'마음에 드는 글의 저장 버튼을 눌러보세요.',href:'#feed',label:'조황피드 둘러보기 →'},
    mine:{title:'나만의 첫 조황을 남겨보세요.',body:'사진과 함께 남긴 기록이 여기에 모입니다.',href:'#write',label:'조황 남기기 →'},
    author:{title:'아직 공개된 조황이 없어요.',body:'다른 낚시인의 기록도 둘러보세요.',href:'#home',label:'전체 조황 보기 →'}
  })[kind]||emptyMessage('home');
}
export function galleryPosition(scroll,width,count) {
  if(!count||width<=0)return 0;
  return Math.min(count-1,Math.max(0,Math.round(scroll/(width||1))));
}

export function photoSelectionError(files,existing=0,max=5) {
  if(!files.length)return '';
  if(existing+files.length>max)return `사진은 최대 ${max}장까지 선택할 수 있어요. 기존 사진을 지우거나 적게 선택해주세요.`;
  for(const file of files){
    if(file.size===0)return '빈 사진 파일입니다. 다른 사진을 선택해주세요.';
    if(file.size>10*1024*1024)return '사진은 장당 10MB 이하로 선택해주세요. 크기를 줄인 사진으로 다시 시도해주세요.';
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
      if(/image\/(heic|heif)/i.test(file.type)||/\.(heic|heif)$/i.test(file.name||''))return '아이폰 HEIC·HEIF 원본은 아직 지원하지 않습니다. JPG로 변환한 사진이나 스크린샷(PNG)을 선택해주세요. 확장자만 바꾸면 변환되지 않습니다.';
      return 'JPG·PNG·WebP 사진만 선택할 수 있어요. 동영상·GIF·RAW는 지원하지 않습니다.';
    }
  }
  return '';
}

export function searchValidation(fields) {
  if((fields.q||'').trim().length>80)return '검색어는 80자 이내로 입력해주세요.';
  for(const key of ['date_from','date_to']){
    const value=fields[key]?.trim();
    if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))return '출조 기간의 날짜를 확인해주세요.';
  }
  const from=fields.date_from?.trim(),to=fields.date_to?.trim();
  if(from&&to&&from>to)return '시작일은 종료일보다 늦을 수 없습니다.';
  return '';
}

export function peoplePath(query='',api=false){const q=query.trim();return (api?'/users':'#people')+(q?'?'+new URLSearchParams({q}):'');}

export function communityPath(query='',author=null,api=false){const params=new URLSearchParams(api?{kind:'community'}:{});if(query.trim())params.set('q',query.trim());if(author)params.set('author',author);return (api?'/posts':'#community')+(params.size?'?'+params:'');}
