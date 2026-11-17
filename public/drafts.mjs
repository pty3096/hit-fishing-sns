const prefix='hit-draft-v1:';
const limits={title:60,fish:30,region:50,method:30,fishing_date:10,body:2000};
export function draftFields(value={}) {
  return Object.fromEntries(Object.entries(limits).map(([key,max])=>[key,typeof value[key]==='string'?value[key].slice(0,max):'']));
}
export function draftStore(storage,now=()=>Date.now()) {
  const key=(owner,post)=>`${prefix}${owner}:${post}`;
  const remove=(owner,post)=>{try{storage?.removeItem(key(owner,post));}catch{}};
  return {
    read(owner,post){try{const record=JSON.parse(storage.getItem(key(owner,post)));if(!record||!Number.isFinite(record.at)||now()-record.at>=86400000||record.at>now()||!record.fields||typeof record.fields!=='object'){remove(owner,post);return null;}return draftFields(record.fields);}catch{remove(owner,post);return null;}},
    write(owner,post,fields){try{if(!storage)return false;storage.setItem(key(owner,post),JSON.stringify({at:now(),fields:draftFields(fields)}));return true;}catch{return false;}},
    remove,
    clear(owner){try{for(let i=storage.length-1;i>=0;i--){const name=storage.key(i);if(name?.startsWith(`${prefix}${owner}:`))storage.removeItem(name);}}catch{}}
  };
}
