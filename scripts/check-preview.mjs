import {pathToFileURL} from 'node:url';
import http from 'node:http';

function previewFetch(url,options){
 if(!url.startsWith('http://127.0.0.1:3002/'))return fetch(url,options);
 return new Promise((resolve,reject)=>{
  const request=http.request(url,{method:'GET',headers:options.headers,signal:options.signal},response=>{
   let size=0;const chunks=[];response.on('data',chunk=>{size+=chunk.length;if(size>1024*1024){request.destroy(new Error('Response too large'));return;}chunks.push(chunk);});response.on('error',reject);response.on('end',()=>resolve(new Response(Buffer.concat(chunks),{status:response.statusCode,headers:{'content-type':response.headers['content-type']||''}})));
  });request.on('error',reject);request.end();
 });
}


// No cookies, authorization headers, tokens, account changes or redirect following.
export async function checkPreview(origin,{fetcher=previewFetch}={}){
 const url=new URL(origin);
 if(url.origin!==origin||url.protocol!=='https:'||!/^[-a-z0-9]+\.trycloudflare\.com$/.test(url.hostname))throw new Error('보호된 시범 HTTPS 주소가 필요합니다.');
 const results=[];
 const check=async(label,path,inspect)=>{
  try{const response=await fetcher('http://127.0.0.1:3002'+path,{headers:{Host:url.host},redirect:'error',signal:AbortSignal.timeout(5000)});results.push({label,ok:await inspect(response)});}catch{results.push({label,ok:false});}
 };
 await check('시범 서버·데이터베이스 응답','/api/health',async r=>r.status===200&&(await r.json()).status==='ok');
 await check('별도 시범 모드·앱 인증 필수','/api/meta',async r=>{const m=await r.json();return r.status===200&&m.phone_preview===true&&m.development_mail===true&&m.verification_required===true&&m.production===false;});
 await check('비로그인 상태 조회','/api/me',async r=>r.status===200&&(await r.json()).user===null);
 await check('개발용 메일함 접근 제한','/api/dev/mail',async r=>r.status===401);
 await check('공개 목록 데이터 응답','/api/posts',async r=>r.status===200&&Array.isArray((await r.json()).posts));
 await check('연결 처리 화면 파일','/api.mjs',async r=>r.status===200&&(r.headers.get('content-type')||'').startsWith('text/javascript'));
 try{
  const r=await fetcher(origin+'/api/health',{redirect:'manual',signal:AbortSignal.timeout(10000)});let login=false;
  try{const target=new URL(r.headers.get('location'));login=target.protocol==='https:'&&target.hostname==='login.trycloudflare.com';}catch{}
  results.push({label:'외부 미인증 요청의 로그인 보호',ok:[302,303,307,308].includes(r.status)&&login});
 }catch{results.push({label:'외부 미인증 요청의 로그인 보호',ok:false});}
 return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const results=await checkPreview(process.argv[2]);for(const r of results)console.log(`${r.ok?'통과':'확인 필요'} · ${r.label}`);console.log('로그인·메일 수신·아이폰 동작은 이 검사로 확인하지 않습니다.');if(results.some(r=>!r.ok))process.exitCode=1;}
 catch{console.error('보호된 시범 HTTPS 주소를 지정해주세요.');process.exitCode=1;}
}
