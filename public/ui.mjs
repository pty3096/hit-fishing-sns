export function parseRoute(hash='') {
  const value=hash.replace(/^#/,''),split=value.indexOf('?');
  return {route:(split<0?value:value.slice(0,split))||'home',params:new URLSearchParams(split<0?'':value.slice(split+1))};
}
export function searchPath(params) {
  const query=new URLSearchParams();
  for(const key of ['fish','region']){const value=(params.get(key)||'').trim();if(value)query.set(key,value);}
  return '/posts'+(query.size?'?'+query:'');
}
export function navigationSection(route) {
  if(['home','following'].includes(route)||route.startsWith('post/'))return 'home';
  if(route==='search')return 'search';
  if(route==='write'||route.startsWith('edit/'))return 'write';
  return 'profile';
}
export function canWrite(user,meta) {
  return !!user&&!user.suspended&&(!meta.verification_required||!!user.email_verified);
}
export function emptyMessage(kind='home') {
  return ({
    home:{title:'아직 조황이 없어요.',body:'오늘의 첫 기록을 남겨볼까요?',href:'#write',label:'첫 조황 남기기 →'},
    search:{title:'조건에 맞는 조황이 없어요.',body:'어종이나 지역을 바꾸거나 검색 조건을 지워보세요.',href:'#search',label:'검색 조건 지우기 →'},
    following:{title:'팔로잉 조황이 아직 없어요.',body:'전체 조황에서 관심 있는 작성자를 팔로우해보세요.',href:'#home',label:'전체 조황 둘러보기 →'},
    mine:{title:'나만의 첫 조황을 남겨보세요.',body:'사진과 함께 남긴 기록이 여기에 모입니다.',href:'#write',label:'조황 남기기 →'},
    author:{title:'아직 공개된 조황이 없어요.',body:'다른 낚시인의 기록도 둘러보세요.',href:'#home',label:'전체 조황 보기 →'}
  })[kind]||emptyMessage('home');
}
export function galleryPosition(scroll,width,count) {
  if(!count||width<=0)return 0;
  return Math.min(count-1,Math.max(0,Math.round(scroll/(width||1))));
}
