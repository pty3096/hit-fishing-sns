import nodemailer from 'nodemailer';
import {resolve} from 'node:path';

export function readConfig(env=process.env) {
  const production=env.NODE_ENV==='production';
  const port=Number(env.PORT||3000);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT must be an integer from 1 to 65535.');
  const origin=env.APP_ORIGIN||`http://127.0.0.1:${port}`;
  let url;try{url=new URL(origin);}catch{throw new Error('APP_ORIGIN must be an absolute origin.');}
  if(url.origin!==origin||!['http:','https:'].includes(url.protocol))throw new Error('APP_ORIGIN must contain only a scheme, hostname and optional port.');
  const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
  if(production&&(url.protocol!=='https:'||local))throw new Error('Production requires a public HTTPS APP_ORIGIN.');
  const mode=env.MAIL_MODE||'local';
  if(!['local','smtp'].includes(mode))throw new Error('MAIL_MODE must be local or smtp.');
  if(mode==='local'&&(production||!local))throw new Error('The development mailbox is allowed only on a local origin outside production.');
  if(production&&!env.HIT_DB)throw new Error('Production requires HIT_DB on a persistent volume.');
  let mail={localMailbox:true};
  if(mode==='smtp') {
    for(const key of ['SMTP_HOST','SMTP_USER','SMTP_PASS','MAIL_FROM'])if(!env[key])throw new Error(`${key} is required in SMTP mode.`);
    const smtpPort=Number(env.SMTP_PORT||587);
    if(!Number.isInteger(smtpPort)||smtpPort<1||smtpPort>65535)throw new Error('SMTP_PORT is invalid.');
    const transport=nodemailer.createTransport({host:env.SMTP_HOST,port:smtpPort,secure:smtpPort===465,requireTLS:true,auth:{user:env.SMTP_USER,pass:env.SMTP_PASS},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000});
    mail={localMailbox:false,sendMail:message=>transport.sendMail({...message,from:env.MAIL_FROM,disableFileAccess:true,disableUrlAccess:true})};
  }
  if(env.TRUST_PROXY&&!['0','1'].includes(env.TRUST_PROXY))throw new Error('TRUST_PROXY must be 0 or 1.');
  const host=env.HOST||(production?'0.0.0.0':'127.0.0.1');
  if(mode==='local'&&!['127.0.0.1','::1'].includes(host))throw new Error('The development mailbox server must bind to loopback.');
  return {port,host,origin,secure:url.protocol==='https:',production,trustProxy:env.TRUST_PROXY==='1',mail,...(env.HIT_DB?{database:resolve(env.HIT_DB)}:{})};
}
