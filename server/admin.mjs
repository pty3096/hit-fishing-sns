import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
const [action,email,...extra]=process.argv.slice(2);
if(!['grant','revoke'].includes(action)||!email||extra.length) {
  console.error('사용법: npm run admin -- grant 이메일 또는 npm run admin -- revoke 이메일');process.exit(1);
}
const database=process.env.HIT_DB||fileURLToPath(new URL('../data/hit.sqlite',import.meta.url));
if(!existsSync(resolve(database))){console.error('먼저 앱을 실행하고 계정을 만들어주세요.');process.exit(1);}
const db=new DatabaseSync(database);
try {
  const account=db.prepare('SELECT id FROM users WHERE email=?').get(email.trim().toLowerCase());
  if(!account)throw new Error('해당 계정이 없습니다.');
  const result=db.prepare('UPDATE users SET is_admin=? WHERE id=?').run(action==='grant'?1:0,account.id);
  console.log(`계정 ${account.id}: 운영자 권한 ${action==='grant'?'부여':'회수'} 완료 (${result.changes})`);
}catch(e){console.error(e.message);process.exitCode=1;}finally{db.close();}
