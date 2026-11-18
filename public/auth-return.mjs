const key='hit-auth-return-v1',lifetime=30*60*1000;
export function safeReturnPath(value){
 if(typeof value!=='string'||value.length>1500)return 'profile';
 const raw=value.trim().replace(/^#/,''),split=raw.indexOf('?'),route=split<0?raw:raw.slice(0,split);
 const simple=['profile','profile-edit','write','community-write','market-write','following','saved','notifications','settings','mailbox','my-posts'];
 const item=route.match(/^(?:post|edit|user)\/(\d+)$|^report\/(?:post|comment|user)\/(\d+)$/);
 if(!simple.includes(route)&&(!item||!Number.isSafeInteger(Number(item[1]||item[2]))||Number(item[1]||item[2])<1))return 'profile';
 if(route!=='my-posts')return route;
 const params=new URLSearchParams(split<0?'':raw.slice(split+1)),query=new URLSearchParams();
 const kind=params.get('kind');if(['catch','community','market'].includes(kind))query.set('kind',kind);
 const q=(params.get('q')||'').trim();if(q&&q.length<=80)query.set('q',q);
 return route+(query.size?'?'+query:'');
}
export function authReturnStore(storage,now=Date.now){
 let memory=null;
 const clear=()=>{memory=null;try{storage?.removeItem(key);}catch{storage=null;}};
 const read=()=>{
  let record=memory;
  if(storage){let raw;try{raw=storage.getItem(key);}catch{storage=null;}
   if(storage){try{record=raw?JSON.parse(raw):null;}catch{record=null;}}
  }
  if(!record||!Number.isFinite(record.at)||now()-record.at>=lifetime||record.at>now()||typeof record.path!=='string'||safeReturnPath(record.path)!==record.path){clear();return 'profile';}
  return record.path;
 };
 return {read,clear,write(path){memory={path:safeReturnPath(path),at:now()};try{storage?.setItem(key,JSON.stringify(memory));}catch{storage=null;}},take(){const path=read();clear();return path;}};
}
