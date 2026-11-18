const keys=['q','region','min_price','max_price'];
export function marketSearchError(fields={}){
  if((fields.q||'').trim().length>80)return '검색어는 80자 이내로 입력해주세요.';
  for(const key of ['min_price','max_price']){
    const value=(fields[key]||'').trim();
    if(value&&(!/^\d{1,10}$/.test(value)||Number(value)>1000000000))return '가격 조건은 0원부터 10억원까지 정수로 입력해주세요.';
  }
  const min=(fields.min_price||'').trim(),max=(fields.max_price||'').trim();
  if(min&&max&&Number(min)>Number(max))return '최저 가격은 최고 가격보다 클 수 없습니다.';
  return '';
}
export function marketFilters(params){
  const fields={};for(const key of keys)fields[key]=(params.get(key)||'').trim();
  return fields;
}
export function marketPath(fields={},status='all',author=null,api=false){
  const query=new URLSearchParams(api?{kind:'market'}:{status});
  if(api&&status!=='all')query.set('trade_status',status);
  for(const key of keys){const value=(fields[key]||'').trim();if(value)query.set(key,value);}
  if(author)query.set('author',author);
  return (api?'/posts?':'#market?')+query;
}
