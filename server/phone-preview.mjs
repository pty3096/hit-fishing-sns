import http from 'node:http';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from './app.mjs';

// This adapter is only for an email-protected Quick Tunnel, never a public deployment.
export function createPhonePreview({origin,database}={}) {
  const url=new URL(origin);
  if(url.origin!==origin||url.protocol!=='https:'||!/^[-a-z0-9]+\.trycloudflare\.com$/.test(url.hostname))throw new Error('A protected Quick Tunnel HTTPS origin is required.');
  if(database&&database!==':memory:'&&resolve(database)===resolve('data/hit.sqlite'))throw new Error('Use a separate preview database.');
  if(!database)throw new Error('A separate preview database is required.');
  const localOrigin='http://127.0.0.1:3002';
  const app=createApp({database,origin:localOrigin,secure:true,mail:{localMailbox:true}});
  return {
    close:app.close,drainMail:app.drainMail,
    async handle(req,res){
      const reject=()=>{res.statusCode=403;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'허용되지 않은 접속 주소입니다.'}));};
      if(req.headers.host!==url.host)return reject();
      if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==origin)return reject();
      req.headers={...req.headers,host:new URL(localOrigin).host,...(req.headers.origin?{origin:localOrigin}:{})};
      const wrapped={
        get statusCode(){return res.statusCode;},set statusCode(value){res.statusCode=value;},
        setHeader:(name,value)=>res.setHeader(name,value),
        end:body=>{if(req.url==='/api/meta'&&res.statusCode===200)body=JSON.stringify({...JSON.parse(body),phone_preview:true});res.end(typeof body==='string'?body.replaceAll(localOrigin,origin):body);}
      };
      await app.handle(req,wrapped);
    }
  };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const app=createPhonePreview({origin:process.env.PREVIEW_ORIGIN,database:resolve('data/phone-preview.sqlite')});
  const server=http.createServer(app.handle);
  server.requestTimeout=120000;server.headersTimeout=10000;
  server.listen(3002,'127.0.0.1',()=>console.log('Isolated phone preview ready on loopback port 3002.'));
  const stop=()=>server.close(async()=>{await app.drainMail();app.close();process.exit(0);});
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
