import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {readConfig} from './config.mjs';
const config=readConfig();
if(!config.mail.localMailbox){console.error('개발용 메일함은 로컬 모드에서만 확인할 수 있습니다.');process.exit(1);}
const [action='list',id]=process.argv.slice(2);
if(!['list','show'].includes(action)||(action==='show'&&!/^\d+$/.test(id||''))){console.error('사용법: npm run mailbox -- list 또는 npm run mailbox -- show 메일번호');process.exit(1);}
let db;
try{
  db=new DatabaseSync(config.database||resolve('data/hit.sqlite'),{readOnly:true});
  if(action==='show'){
    const mail=db.prepare('SELECT subject,link FROM dev_mail WHERE id=? AND expires>?').get(Number(id),Date.now());
    if(!mail)throw new Error('유효한 안내가 없습니다.');console.log(mail.subject+'\n'+mail.link);
  }else{
    const rows=db.prepare('SELECT m.id,u.email,m.subject FROM dev_mail m JOIN users u ON u.id=m.user_id WHERE m.expires>? ORDER BY m.id DESC LIMIT 20').all(Date.now());
    if(!rows.length)console.log('유효한 안내가 없습니다.');
    for(const row of rows)console.log(`${row.id} | ${row.email} | ${row.subject}`);
  }
}catch(e){console.error(e.code?'먼저 앱을 실행하고 인증 또는 재설정을 요청해주세요.':e.message);process.exitCode=1;}finally{db?.close();}
