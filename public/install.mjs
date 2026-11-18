let promptEvent=null,registrationState='pending';
const installed=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
export function installationState(){return {installed:installed(),canPrompt:!!promptEvent,worker:registrationState,secure:isSecureContext};}
function changed(){dispatchEvent(new Event('hit-install-state'));}
addEventListener('beforeinstallprompt',event=>{event.preventDefault();promptEvent=event;changed();});
addEventListener('appinstalled',()=>{promptEvent=null;changed();});
export async function requestInstallation(){
  const prompt=promptEvent;if(!prompt)return false;
  promptEvent=null;changed();await prompt.prompt();return (await prompt.userChoice).outcome==='accepted';
}
export async function prepareInstallation(){
  if(!isSecureContext||!('serviceWorker' in navigator)){registrationState='unsupported';changed();return;}
  try{await navigator.serviceWorker.register('/sw.js',{scope:'/',updateViaCache:'none'});registrationState='ready';}
  catch{registrationState='failed';}
  changed();
}
export function installationStatus(){
  const state=installationState();
  return state.installed?'홈 화면 앱으로 실행 중입니다.':
    !state.secure?'설치 준비에는 HTTPS 접속이 필요합니다.':
    state.worker==='failed'?'설치 준비 연결을 확인하지 못했습니다. 온라인 웹 사용은 계속할 수 있습니다.':
    state.worker==='unsupported'?'이 브라우저는 일부 설치 기능을 지원하지 않습니다. Safari에서 홈 화면에 추가를 확인해주세요.':
    state.worker==='ready'?'홈 화면 설치 설정을 불러왔습니다. 실제 설치 여부는 기기에서 확인해주세요.':'설치 설정을 확인하고 있습니다.';
}
