import {pathToFileURL} from 'node:url';

// Read-only checks: no accounts, uploads, sessions or messages are created.
export async function checkLocal(base='http://127.0.0.1:3000') {
  const url=new URL(base);
  if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.protocol!=='http:'||url.origin!==base)throw new Error('로컬 HTTP 주소만 점검할 수 있습니다.');
  const results=[];
  const check=async(label,path,inspect)=>{
    try{
      const response=await fetch(base+path,{redirect:'error',signal:AbortSignal.timeout(5000)});
      const ok=await inspect(response);
      results.push({label,ok});
    }catch{results.push({label,ok:false});}
  };
  await check('앱 실행 및 데이터베이스 응답','/api/health',async r=>r.status===200&&(await r.json()).status==='ok');
  await check('개발 메일함·인증 필수 설정','/api/meta',async r=>{const m=await r.json();return r.status===200&&m.development_mail===true&&m.verification_required===true&&m.production===false;});
  await check('로그인하지 않은 방문자 상태','/api/me',async r=>r.status===200&&(await r.json()).user===null);
  await check('개발 메일함의 비로그인 접근 제한','/api/dev/mail',async r=>r.status===401);
  for(const [path,type] of [['/','text/html'],['/app.js','text/javascript'],['/ui.mjs','text/javascript'],['/drafts.mjs','text/javascript'],['/region-map.mjs','text/javascript'],['/market-search.mjs','text/javascript'],['/install.mjs','text/javascript'],['/sw.js','text/javascript'],['/manifest.webmanifest','application/manifest+json'],['/style.css','text/css']]) {
    await check(`화면 파일 ${path}`,path,async r=>r.status===200&&(r.headers.get('content-type')||'').startsWith(type)&&(await r.text()).length>0);
  }
  await check('브라우저 보안 헤더','/',async r=>r.headers.get('x-content-type-options')==='nosniff'&&r.headers.get('cache-control')==='no-store'&&(r.headers.get('content-security-policy')||'').includes("frame-ancestors 'none'"));
  return results;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    const results=await checkLocal(process.argv[2]);
    for(const {label,ok} of results)console.log(`${ok?'통과':'확인 필요'} · ${label}`);
    console.log('실제 휴대폰·카메라·메일 발송·공개 배포 점검은 별도로 필요합니다.');
    if(results.some(r=>!r.ok))process.exitCode=1;
  }catch{console.error('로컬 주소를 확인해주세요. 예: npm run check:local -- http://127.0.0.1:3000');process.exitCode=1;}
}
