// Network only: no CacheStorage, IndexedDB, API responses, photos or credentials saved here.
const offlineHTML=`<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>히트 HIT · 연결 확인</title><style>body{margin:0;background:#edf8ff;color:#0a2e6d;font:17px/1.7 system-ui,sans-serif}main{max-width:460px;margin:12vh auto;padding:28px;background:white;border-radius:20px}a{display:inline-block;padding:12px 20px;background:#0d8dff;color:white;border-radius:14px;text-decoration:none}small{color:#52677e}@media(max-width:540px){main{margin:12vh 18px}} </style><main><p>히트 HIT</p><h1>인터넷 연결을 확인해주세요</h1><p>앱에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 열어주세요.</p><p>조황·사진·알림은 연결된 상태에서 볼 수 있습니다. 이 화면에서는 글을 자동으로 전송하지 않습니다.</p><a href="/">연결 후 홈 다시 열기</a><p><small>연결이 정상이라면 서버가 실행 중인지 확인해주세요. 시범 접속은 PC가 켜져 있어야 합니다.</small></p></main></html>`;
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||request.mode!=='navigate'||url.origin!==self.location.origin||url.pathname!=='/')return;
  event.respondWith(fetch(request).catch(()=>new Response(offlineHTML,{status:503,headers:{
    'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
  }})));
});
