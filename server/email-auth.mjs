import {randomBytes,createHash,scrypt} from 'node:crypto';
import {promisify} from 'node:util';
const derive=promisify(scrypt);
const hash=value=>createHash('sha256').update(value).digest('hex');
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const generic='등록된 이메일이라면 재설정 안내를 보냈습니다. 메일함을 확인해주세요.';

export function emailAuth(db,{origin,localMailbox,sendMail,now=Date.now}) {
  if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='email_verified')) db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE TABLE IF NOT EXISTS auth_tokens(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,purpose TEXT NOT NULL,credential_hash TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS auth_tokens_user ON auth_tokens(user_id,purpose);
    CREATE TABLE IF NOT EXISTS dev_mail(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,purpose TEXT NOT NULL,subject TEXT NOT NULL,link TEXT NOT NULL,created_at INTEGER NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_limits(key_hash TEXT PRIMARY KEY,attempts INTEGER NOT NULL,reset_at INTEGER NOT NULL);
    PRAGMA user_version=4;`);
  const pending=new Set();
  const takeLimit=(key,max,window=3600000)=>{
    const t=now();db.prepare('DELETE FROM auth_limits WHERE reset_at<=?').run(t);
    const k=hash(key);
    const r=db.prepare('INSERT INTO auth_limits VALUES(?,1,?) ON CONFLICT(key_hash) DO UPDATE SET attempts=attempts+1 RETURNING attempts').get(k,t+window);
    return r.attempts<=max;
  };
  function issue(account,purpose) {
    const token=randomBytes(32).toString('hex'),t=now(),expires=t+(purpose==='verify'?86400000:1800000);
    db.prepare('DELETE FROM auth_tokens WHERE expires<=? OR (user_id=? AND purpose=?)').run(t,account.id,purpose);
    db.prepare('DELETE FROM dev_mail WHERE expires<=? OR (user_id=? AND purpose=?)').run(t,account.id,purpose);
    db.prepare('INSERT INTO auth_tokens VALUES(?,?,?,?,?)').run(hash(token),account.id,purpose,account.password_hash,expires);
    const link=origin+'/#'+(purpose==='verify'?'verify/':'reset/')+token;
    const subject=purpose==='verify'?'히트 HIT 이메일 인증':'히트 HIT 비밀번호 재설정';
    if(localMailbox) {
      db.prepare('INSERT INTO dev_mail(user_id,purpose,subject,link,created_at,expires) VALUES(?,?,?,?,?,?)').run(account.id,purpose,subject,link,t,expires);
    } else {
      // No account-specific SMTP timing in API responses and no raw links in server logs.
      const task=Promise.resolve().then(()=>sendMail({to:account.email,subject,text:`${subject}\n\n아래 링크를 열어 진행해주세요.\n${link}\n\n${purpose==='verify'?'24시간':'30분'} 동안 유효하며 한 번만 사용할 수 있습니다.\n본인이 요청하지 않았다면 이 메일을 무시해주세요.`})).catch(()=>{console.error('Email delivery failed. Check mail service settings.');}).finally(()=>pending.delete(task));
      pending.add(task);
    }
  }
  const readToken=(token,purpose)=>{
    if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail(400,'링크가 올바르지 않거나 만료되었습니다. 새 링크를 요청해주세요.');
    const row=db.prepare('SELECT t.*,u.password_hash FROM auth_tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.purpose=? AND t.expires>?').get(hash(token),purpose,now());
    if(!row||row.credential_hash!==row.password_hash)fail(400,'링크가 올바르지 않거나 만료되었습니다. 새 링크를 요청해주세요.');
    return row;
  };
  async function route({path,method,body,user,req,res,send}) {
    const ip=req.clientAddress||req.socket.remoteAddress||'local';
    if(path==='/api/dev/mail'&&method==='GET') {
      if(!localMailbox)fail(404,'페이지가 없습니다.');
      if(!user)fail(401,'로그인이 필요합니다.');
      const messages=db.prepare('SELECT id,subject,link,created_at,expires FROM dev_mail WHERE user_id=? AND expires>? ORDER BY id DESC LIMIT 20').all(user.id,now());
      send(200,{messages});return true;
    }
    if(path==='/api/email/resend'&&method==='POST') {
      if(!user)fail(401,'로그인이 필요합니다.');
      if(!takeLimit('verify-ip:'+ip,20)||!takeLimit('verify-user:'+user.id,5))fail(429,'인증 요청이 많습니다. 잠시 후 다시 시도해주세요.');
      const account=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
      if(!account)fail(401,'로그인이 필요합니다.');
      if(!account.email_verified)issue(account,'verify');
      send(202,{message:'인증 안내를 확인해주세요.'});return true;
    }
    if(path==='/api/email/verify'&&method==='POST') {
      if(!takeLimit('verify-token:'+ip,100))fail(429,'요청이 많습니다. 잠시 후 다시 시도해주세요.');
      const row=readToken(body.token,'verify');
      db.exec('BEGIN IMMEDIATE');
      try {
        db.prepare('UPDATE users SET email_verified=1 WHERE id=?').run(row.user_id);
        db.prepare("DELETE FROM auth_tokens WHERE user_id=? AND purpose='verify'").run(row.user_id);
        db.prepare("DELETE FROM dev_mail WHERE user_id=? AND purpose='verify'").run(row.user_id);
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      send(200,{message:'이메일 인증을 완료했습니다.'});return true;
    }
    if(path==='/api/password/forgot'&&method==='POST') {
      const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail(400,'이메일 형식을 확인해주세요.');
      if(!takeLimit('reset-ip:'+ip,20))fail(429,'요청이 많습니다. 잠시 후 다시 시도해주세요.');
      // Account throttling deliberately has the same response as unknown addresses.
      if(takeLimit('reset-email:'+email,5)) {
        const account=db.prepare('SELECT * FROM users WHERE email=?').get(email);
        if(account)issue(account,'reset');
      }
      send(202,{message:generic});return true;
    }
    if(path==='/api/password/reset'&&method==='POST') {
      if(!takeLimit('reset-token:'+ip,30))fail(429,'요청이 많습니다. 잠시 후 다시 시도해주세요.');
      if(typeof body.password!=='string'||body.password.length<12||body.password.length>128)fail(400,'비밀번호는 12~128자로 입력해주세요.');
      const row=readToken(body.token,'reset');
      const salt=randomBytes(16).toString('hex'),passwordHash=(await derive(body.password,salt,64)).toString('hex');
      db.exec('BEGIN IMMEDIATE');
      try {
        const current=readToken(body.token,'reset');
        if(current.credential_hash!==row.credential_hash)fail(400,'이미 사용한 링크입니다.');
        db.prepare('UPDATE users SET salt=?,password_hash=?,email_verified=1 WHERE id=?').run(salt,passwordHash,row.user_id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.user_id);
        db.prepare('DELETE FROM auth_tokens WHERE user_id=?').run(row.user_id);
        db.prepare('DELETE FROM dev_mail WHERE user_id=?').run(row.user_id);
        db.exec('COMMIT');
      }catch(e){db.exec('ROLLBACK');throw e;}
      // A reset proves mailbox control, but never lifts suspension or grants a session.
      res.setHeader('Set-Cookie',`hit_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${origin.startsWith('https:')?'; Secure':''}`);
      send(200,{message:'비밀번호를 변경했습니다. 다시 로그인해주세요.'});return true;
    }
    return false;
  }
  return {issue,route,drain:()=>Promise.allSettled([...pending])};
}
