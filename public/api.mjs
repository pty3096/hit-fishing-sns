export function createApiClient({fetcher=(...args)=>fetch(...args),readTimeout=15000,writeTimeout=90000}={}){
 return async function api(path,method='GET',data){
  const reading=['GET','HEAD'].includes(method),controller=new AbortController();let timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;controller.abort();},reading?readTimeout:writeTimeout);
  try{
   let response;
   try{response=await fetcher('/api'+path,{method,redirect:'error',signal:controller.signal,headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});}
   catch{
    if(timedOut)throw Object.assign(new Error(reading?'응답이 늦어지고 있습니다. 연결을 확인한 뒤 다시 시도해주세요.':'처리 결과를 확인하지 못했습니다. 연결을 확인한 뒤 변경 사항이 반영됐는지 확인해주세요.'),{code:'timeout'});
    throw Object.assign(new Error('연결이 끊겼습니다. 인터넷 연결을 확인하고 다시 시도해주세요.'),{code:'connection'});
   }
   let result;
   try{result=await response.json();}catch{
    if(timedOut)throw Object.assign(new Error(reading?'응답이 늦어지고 있습니다. 연결을 확인한 뒤 다시 시도해주세요.':'처리 결과를 확인하지 못했습니다. 연결을 확인한 뒤 변경 사항이 반영됐는지 확인해주세요.'),{code:'timeout'});
    throw Object.assign(new Error('서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.'),{code:'response'});
   }
   if(!result||typeof result!=='object'||Array.isArray(result))throw Object.assign(new Error('서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.'),{code:'response'});
   if(!response.ok)throw new Error(typeof result.error==='string'?result.error:'요청을 처리하지 못했습니다.');
   return result;
  }finally{clearTimeout(timer);}
 };
}
