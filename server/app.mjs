import {marketSearchError,marketFilters} from '../public/market-search.mjs';
import http from 'node:http';
import {appIcon} from './app-icons.mjs';
import {notifications} from './notifications.mjs';
import {isIP} from 'node:net';
import {emailAuth} from './email-auth.mjs';
import {readConfig} from './config.mjs';
import {moderation} from './moderation.mjs';
import { normalizePhotos, normalizeAvatar, MAX_POST_BYTES } from './photos.mjs';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const derive = promisify(scrypt);
const root = fileURLToPath(new URL('../', import.meta.url));
const digest = s => createHash('sha256').update(s).digest('hex');
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const text = (value, max, label) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) fail(400, `${label}을 확인해주세요.`);
  return value.trim();
};
const baseUser = u => u ? { id: u.id, nickname: u.nickname, bio: u.bio, is_admin: !!u.is_admin, suspended: !!u.suspended, email_verified: !!u.email_verified } : null;

export function createApp({ database = resolve(root, 'data/hit.sqlite'), origin = 'http://127.0.0.1:3000', secure = false, requireVerified = true, mail = {localMailbox:true}, now = Date.now, production = false, trustProxy = false } = {}) {
  if(mail.localMailbox&&!['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname))throw new Error('Development mail is restricted to local origins.');
  if(!mail.localMailbox&&typeof mail.sendMail!=='function')throw new Error('A mail sender is required.');
  if(production&&(!secure||!origin.startsWith('https:')||mail.localMailbox||!requireVerified))throw new Error('Production requires HTTPS, SMTP mail and verification enforcement.');
  if (database !== ':memory:') mkdirSync(dirname(database), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', salt TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, body TEXT NOT NULL, fish TEXT NOT NULL, region TEXT NOT NULL, method TEXT NOT NULL, fishing_date TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS posts_user ON posts(user_id, id);
    CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, position INTEGER NOT NULL, data BLOB NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS photos_post ON photos(post_id,position);
    CREATE TABLE IF NOT EXISTS likes (user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, PRIMARY KEY(user_id,post_id));
    CREATE INDEX IF NOT EXISTS likes_post ON likes(post_id);
    CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id,id);
    CREATE TABLE IF NOT EXISTS follows (id INTEGER PRIMARY KEY AUTOINCREMENT, follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, UNIQUE(follower_id,target_id), CHECK(follower_id != target_id));
    CREATE INDEX IF NOT EXISTS follows_target ON follows(target_id,id);
    PRAGMA user_version=2;`);
  const mod = moderation(db);
  const emailService = emailAuth(db,{origin,...mail,now});
  db.exec(`CREATE TABLE IF NOT EXISTS avatars(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,revision TEXT NOT NULL,data BLOB NOT NULL,width INTEGER NOT NULL,height INTEGER NOT NULL); PRAGMA user_version=5;`);
  db.exec(`CREATE TABLE IF NOT EXISTS post_requests(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,PRIMARY KEY(user_id,request_id)); PRAGMA user_version=6;`);
  db.exec(`CREATE TABLE IF NOT EXISTS comment_requests(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,request_id TEXT NOT NULL,fingerprint TEXT NOT NULL,comment_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,PRIMARY KEY(user_id,request_id)); PRAGMA user_version=7;`);
  db.exec(`CREATE TABLE IF NOT EXISTS saved_posts(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,PRIMARY KEY(user_id,post_id)); CREATE INDEX IF NOT EXISTS saved_posts_post ON saved_posts(post_id); PRAGMA user_version=8;`);
  const notices=notifications(db,mod);
  if(!db.prepare('PRAGMA table_info(posts)').all().some(column=>column.name==='kind'))db.exec("ALTER TABLE posts ADD COLUMN kind TEXT NOT NULL DEFAULT 'catch'");
  db.exec('CREATE INDEX IF NOT EXISTS posts_kind ON posts(kind,id); PRAGMA user_version=10;');
  for(const [name,type] of [['price','INTEGER'],['trade_status','TEXT']])if(!db.prepare('PRAGMA table_info(posts)').all().some(column=>column.name===name))db.exec('ALTER TABLE posts ADD COLUMN '+name+' '+type);
  db.exec('PRAGMA user_version=11;');
  const avatarURL=id=>{const row=db.prepare('SELECT revision FROM avatars WHERE user_id=?').get(id);return row?`/api/avatars/${id}/${row.revision}`:null;};
  const publicUser=u=>u?{...baseUser(u),avatar_url:avatarURL(u.id)}:null;
  const limits = new Map();
  const cookie = token => `hit_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? 604800 : 0}${secure ? '; Secure' : ''}`;
  const sessionUser = req => {
    const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('hit_session='))?.slice(12);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return db.prepare('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?').get(digest(token), Date.now());
  };
  async function handle(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' blob:; frame-src https://www.openstreetmap.org; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
    const send = (status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); };
    try {
      req.clientAddress=req.socket.remoteAddress||'local';
      if(trustProxy&&typeof req.headers['x-forwarded-for']==='string'){const address=req.headers['x-forwarded-for'].split(',').at(-1).trim();if(isIP(address))req.clientAddress=address;}
      const url = new URL(req.url, origin), path = url.pathname, method = req.method;
      if(mail.localMailbox && req.headers.host && req.headers.host.toLowerCase()!==new URL(origin).host.toLowerCase())fail(403,'허용되지 않은 접속 주소입니다.');
      if(path==='/api/health'&&method==='GET'){db.prepare('SELECT 1').get();return send(200,{status:'ok'});}
      if(path==='/api/meta'&&method==='GET')return send(200,{development_mail:!!mail.localMailbox,verification_required:requireVerified,production});
      if (!path.startsWith('/api/')) {
        if (method !== 'GET') fail(405, '지원하지 않는 요청입니다.');
        const iconSize={'/assets/icon-180.png':180,'/assets/icon-192.png':192,'/assets/icon-512.png':512}[path];
        if(iconSize){res.setHeader('Content-Type','image/png');res.end(await appIcon(iconSize));return;}
        const installFile={'/install.mjs':['install.mjs','text/javascript'],'/sw.js':['sw.js','text/javascript'],'/manifest.webmanifest':['manifest.webmanifest','application/manifest+json']}[path];
        if(installFile){res.setHeader('Content-Type',installFile[1]+'; charset=utf-8');res.end(readFileSync(resolve(root,'public',installFile[0])));return;}
        const file = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/ui.mjs': ['ui.mjs','text/javascript'], '/region-map.mjs':['region-map.mjs','text/javascript'], '/market-search.mjs':['market-search.mjs','text/javascript'], '/drafts.mjs':['drafts.mjs','text/javascript'], '/assets/approved-ui-v1.1.jpg':['assets/approved-ui-v1.1.jpg','image/jpeg'], '/style.css': ['style.css', 'text/css'] }[path];
        if (!file) fail(404, '페이지가 없습니다.');
        res.setHeader('Content-Type', `${file[1]}; charset=utf-8`);
        res.end(readFileSync(resolve(root, 'public', file[0]))); return;
      }
      const user = sessionUser(req);
      const auth = () => { const current=user && sessionUser(req); if (!current) fail(401, '로그인이 필요합니다.'); if(current.suspended)fail(403,'이용이 제한된 계정입니다.'); if(requireVerified&&!current.email_verified)fail(403,'이메일 인증 후 이용해주세요. 설정에서 인증 안내를 확인할 수 있습니다.'); return current; };
      let body = {};
      if (!['GET', 'HEAD'].includes(method)) {
        if (req.headers.origin !== origin) fail(403, '허용되지 않은 요청 출처입니다.');
        if (!(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'JSON 요청이 필요합니다.');
        const isPostWrite = (path === '/api/posts' && method === 'POST') || (/^\/api\/posts\/\d+$/.test(path) && method === 'PATCH');
        const isAvatarWrite=path==='/api/profile/photo'&&method==='PUT';
        if (isPostWrite||isAvatarWrite) auth();
        const maxBytes = isPostWrite ? MAX_POST_BYTES : isAvatarWrite ? 14*1024*1024 : 16384;
        if (Number(req.headers['content-length']) > maxBytes) fail(413, '입력 용량이 너무 큽니다.');
        let size = 0, chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > maxBytes) fail(413, '입력 용량이 너무 큽니다.'); chunks.push(chunk); }
        try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { fail(400, '요청 내용을 확인해주세요.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, '요청 형식이 올바르지 않습니다.');
      }
      const verifyPassword = async (account,password) => {
        if(typeof password!=='string'||password.length>128)return false;
        const candidate=await derive(password,account.salt,64);
        const current=sessionUser(req);
        if(!current||current.id!==account.id||current.password_hash!==account.password_hash)return false;
        return timingSafeEqual(candidate,Buffer.from(account.password_hash,'hex'));
      };
      if(await emailService.route({path,method,body,user,req,res,send}))return;
      if(notices.route({path,method,body,user,auth,send,url}))return;
      if(await mod.route({path,method,body,user,auth,send,req,res,verifyPassword}))return;
      if (path === '/api/me' && method === 'GET') return send(200, { user: publicUser(user) });
      if (['/api/signup', '/api/login'].includes(path) && method === 'POST') {
        const key = req.clientAddress, now = Date.now();
        for (const [k, v] of limits) if (v.until < now) limits.delete(k);
        const limit = limits.get(key) || { count: 0, until: now + 600000 };
        if (++limit.count > 20) fail(429, '잠시 후 다시 시도해주세요.'); limits.set(key, limit);
        const email = text(body.email, 254, '이메일').toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, '이메일 형식을 확인해주세요.');
        if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) fail(400, '비밀번호는 12~128자로 입력해주세요.');
        let account = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        if (path === '/api/signup') {
          const nickname = text(body.nickname, 30, '닉네임');
          if (account) fail(409, '이미 등록된 이메일입니다.');
          const salt = randomBytes(16).toString('hex'), hash = (await derive(body.password, salt, 64)).toString('hex');
          // The uniqueness constraint also guards simultaneous signup requests.
          try { const r = db.prepare('INSERT INTO users(id,email,nickname,salt,password_hash) VALUES(?,?,?,?,?)').run(mod.nextId('users'),email, nickname, salt, hash); account = db.prepare('SELECT * FROM users WHERE id=?').get(Number(r.lastInsertRowid)); }
          catch (err) { if (err.code?.startsWith('ERR_SQLITE') && db.prepare('SELECT id FROM users WHERE email=?').get(email)) fail(409, '이미 등록된 이메일입니다.'); throw err; }
        } else {
          const candidate = await derive(body.password, account?.salt || 'dummy-salt-for-missing-account', 64);
          if (!account || !timingSafeEqual(candidate, Buffer.from(account.password_hash, 'hex'))) fail(401, '이메일 또는 비밀번호를 확인해주세요.');
        }
        const checkedHash=account.password_hash;
        account=db.prepare('SELECT * FROM users WHERE id=?').get(account.id);
        if(!account||account.password_hash!==checkedHash)fail(401,'이메일 또는 비밀번호를 확인해주세요.');
        if(path==='/api/signup')emailService.issue(account,'verify');
        const token = randomBytes(32).toString('hex');
        db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
        const old = (req.headers.cookie || '').match(/(?:^|;\s*)hit_session=([a-f0-9]{64})(?:;|$)/)?.[1];
        if (old) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(old));
        db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token), account.id, Date.now() + 604800000);
        res.setHeader('Set-Cookie', cookie(token)); return send(path === '/api/signup' ? 201 : 200, { user: publicUser(account) });
      }
      if (path === '/api/logout' && method === 'POST') {
        const token = (req.headers.cookie || '').match(/(?:^|;\s*)hit_session=([a-f0-9]{64})(?:;|$)/)?.[1];
        if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token));
        res.setHeader('Set-Cookie', cookie('')); return send(200, { ok: true });
      }
      const avatarMatch=path.match(/^\/api\/avatars\/(\d+)\/([a-f0-9]{32})$/);
      if(avatarMatch&&method==='GET'){
        const id=Number(avatarMatch[1]);
        if(!mod.userVisible(id,user))fail(404,'프로필 사진이 없습니다.');
        const photo=db.prepare('SELECT data FROM avatars WHERE user_id=? AND revision=?').get(id,avatarMatch[2]);
        if(!photo)fail(404,'프로필 사진이 없습니다.');
        res.setHeader('Content-Type','image/webp');res.end(Buffer.from(photo.data));return;
      }
      if(path==='/api/profile/photo'&&['PUT','DELETE'].includes(method)){
        auth();
        if(method==='PUT'){
          const photo=await normalizeAvatar(body.photo);
          auth();
          db.prepare('INSERT INTO avatars VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,data=excluded.data,width=excluded.width,height=excluded.height').run(user.id,randomBytes(16).toString('hex'),photo.data,photo.width,photo.height);
        }else db.prepare('DELETE FROM avatars WHERE user_id=?').run(user.id);
        return send(200,{user:publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id))});
      }
      if (path === '/api/profile' && method === 'PATCH') {
        auth(); const nickname = text(body.nickname, 30, '닉네임');
        if (typeof body.bio !== 'string' || body.bio.length > 200) fail(400, '소개는 200자 이하로 입력해주세요.');
        db.prepare('UPDATE users SET nickname=?,bio=? WHERE id=?').run(nickname, body.bio.trim(), user.id);
        return send(200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) });
      }
      const decorate = p => ({ ...p, avatar_url:avatarURL(p.user_id),
        photos: db.prepare('SELECT id,width,height FROM photos WHERE post_id=? ORDER BY position').all(p.id).map(photo => ({ ...photo, url: '/api/photos/' + photo.id })),
        likes: db.prepare('SELECT count(*) n FROM likes WHERE post_id=?').get(p.id).n,
        saved: !!(user && db.prepare('SELECT 1 FROM saved_posts WHERE post_id=? AND user_id=?').get(p.id,user.id)),
        liked: !!(user && db.prepare('SELECT 1 FROM likes WHERE post_id=? AND user_id=?').get(p.id,user.id)),
        comment_count: db.prepare(`SELECT count(*) n FROM comments c WHERE c.post_id=? AND ${mod.visibleSQL('c',user?.id)}`).get(p.id).n });
      const select = 'SELECT p.*,u.nickname FROM posts p JOIN users u ON u.id=p.user_id';
      if(path==='/api/rankings'&&method==='GET'){
        const period=url.searchParams.get('period')||'7';
        if(!['7','30','all'].includes(period))fail(400,'집계 기간을 확인해주세요.');
        const timestamp=now(),generatedAt=new Date(timestamp).toISOString();
        const clauses=["p.kind='catch'",mod.visibleSQL('p',user?.id),'p.created_at<=?'],values=[generatedAt];
        if(period!=='all'){clauses.push('p.created_at>=?');values.push(new Date(timestamp-Number(period)*86400000).toISOString());}
        const rows=db.prepare('SELECT p.*,u.nickname,l.ranking_likes FROM posts p JOIN users u ON u.id=p.user_id JOIN (SELECT post_id,count(*) ranking_likes FROM likes GROUP BY post_id) l ON l.post_id=p.id WHERE '+clauses.join(' AND ')+' ORDER BY l.ranking_likes DESC,p.id DESC LIMIT 20').all(...values);
        return send(200,{period,generated_at:generatedAt,posts:rows.map(decorate)});
      }
      const photoMatch = path.match(/^\/api\/photos\/([a-f0-9]{32})$/);
      if (photoMatch && method === 'GET') {
        const photo = db.prepare('SELECT data,post_id FROM photos WHERE id=?').get(photoMatch[1]);
        if(photo && !mod.postVisible(db.prepare('SELECT * FROM posts WHERE id=?').get(photo.post_id),user))fail(404,'사진이 없습니다.');
        if (!photo) fail(404, '사진이 없습니다.');
        res.setHeader('Content-Type','image/webp'); res.end(Buffer.from(photo.data)); return;
      }
      if(path==='/api/users'&&method==='GET'){
        const query=(url.searchParams.get('q')||'').trim();
        if(query.length>30)fail(400,'닉네임은 30자 이내로 검색해주세요.');
        const rawBefore=url.searchParams.get('before'),before=rawBefore===null?Number.MAX_SAFE_INTEGER:Number(rawBefore);
        if(!Number.isSafeInteger(before)||before<1)fail(400,'다음 검색 위치를 확인해주세요.');
        if(!query)return send(200,{users:[],next:null});
        const pattern='%'+query.replace(/[\\%_]/g,'\\$&')+'%',viewer=user?.id||0;
        const rows=db.prepare("SELECT u.id,u.nickname,u.bio,EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=? AND f.target_id=u.id) AS followed FROM users u WHERE u.suspended=0 AND u.id<? AND u.nickname LIKE ? ESCAPE '\\' AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.target_id=u.id) OR (b.target_id=? AND b.blocker_id=u.id)) ORDER BY u.id DESC LIMIT 21").all(viewer,before,pattern,viewer,viewer);
        return send(200,{users:rows.slice(0,20).map(person=>({...person,followed:!!person.followed,avatar_url:avatarURL(person.id)})),next:rows.length>20?rows[19].id:null});
      }
      const userMatch = path.match(/^\/api\/users\/(\d+)(?:\/(follow|followers|following))?$/);
      if (userMatch) {
        const target = Number(userMatch[1]), action = userMatch[2];
        const person = db.prepare('SELECT id,nickname,bio FROM users WHERE id=?').get(target);
        if (!person || !mod.userVisible(target,user)) fail(404, '사용자가 없습니다.');
        if (action === 'follow' && ['PUT','DELETE'].includes(method)) {
          auth(); if (target === user.id) fail(400, '자신을 팔로우할 수 없습니다.');
          if (method === 'PUT') db.prepare('INSERT OR IGNORE INTO follows(follower_id,target_id) VALUES(?,?)').run(user.id,target);
          else db.prepare('DELETE FROM follows WHERE follower_id=? AND target_id=?').run(user.id,target);
          return send(200, { following: method === 'PUT' });
        }
        if (!action && method === 'GET') return send(200, { user: { ...person, avatar_url:avatarURL(person.id),
          followers: db.prepare('SELECT count(*) n FROM follows WHERE target_id=?').get(target).n,
          following: db.prepare('SELECT count(*) n FROM follows WHERE follower_id=?').get(target).n,
          followed: !!(user && db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND target_id=?').get(user.id,target)) } });
        if (['followers','following'].includes(action) && method === 'GET') {
          const followers = action === 'followers';
          const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
          const rows = db.prepare(`SELECT f.id AS cursor,u.id,u.nickname,u.bio FROM follows f JOIN users u ON u.id=f.${followers ? 'follower_id' : 'target_id'} WHERE f.${followers ? 'target_id' : 'follower_id'}=? AND f.id<? AND u.suspended=0 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=${Number(user?.id||0)} AND b.target_id=u.id) OR (b.target_id=${Number(user?.id||0)} AND b.blocker_id=u.id)) ORDER BY f.id DESC LIMIT 21`).all(target,before);
          return send(200, { users: rows.slice(0,20).map(u=>({...u,avatar_url:avatarURL(u.id)})), next: rows.length > 20 ? rows[19].cursor : null });
        }
      }
      const interaction = path.match(/^\/api\/posts\/(\d+)\/(like|comments|save)$/);
      if (interaction) {
        const postId = Number(interaction[1]), action = interaction[2];
        if (!mod.postVisible(db.prepare('SELECT * FROM posts WHERE id=?').get(postId),user)) fail(404, '게시물이 없습니다.');
        if(action==='save'&&['PUT','DELETE'].includes(method)){
          auth();
          if(method==='PUT')db.prepare('INSERT OR IGNORE INTO saved_posts VALUES(?,?)').run(user.id,postId);
          else db.prepare('DELETE FROM saved_posts WHERE user_id=? AND post_id=?').run(user.id,postId);
          return send(200,{saved:method==='PUT'});
        }
        if (action === 'like' && ['PUT','DELETE'].includes(method)) {
          auth(); if (method === 'PUT') db.prepare('INSERT OR IGNORE INTO likes VALUES(?,?)').run(user.id,postId);
          else db.prepare('DELETE FROM likes WHERE user_id=? AND post_id=?').run(user.id,postId);
          return send(200, { liked: method === 'PUT', likes: db.prepare('SELECT count(*) n FROM likes WHERE post_id=?').get(postId).n });
        }
        if (action === 'comments' && method === 'GET') {
          const before = Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
          const rows = db.prepare(`SELECT c.*,u.nickname FROM comments c JOIN users u ON c.user_id=u.id WHERE c.post_id=? AND c.id<? AND ${mod.visibleSQL('c',user?.id)} ORDER BY c.id DESC LIMIT 21`).all(postId,before);
          return send(200, { comments: rows.slice(0,20).map(c=>({...c,avatar_url:avatarURL(c.user_id)})), next: rows.length > 20 ? rows[19].id : null });
        }
        if (action === 'comments' && method === 'POST') {
          auth(); const content = text(body.body,300,'댓글');
          const requestId=body.request_id;
          if(requestId!==undefined&&(typeof requestId!=='string'||!/^[a-f0-9]{32}$/.test(requestId)))fail(400,'댓글 요청 정보를 확인해주세요.');
          const fingerprint=requestId?digest(JSON.stringify({postId,content})):null;
          db.exec('BEGIN IMMEDIATE');
          let commentId,replayed=false;
          try {
            const previous=requestId&&db.prepare('SELECT * FROM comment_requests WHERE user_id=? AND request_id=?').get(user.id,requestId);
            if(previous){
              if(previous.fingerprint!==fingerprint)fail(409,'댓글 내용이나 게시물이 바뀌었습니다. 새 요청으로 다시 시도해주세요.');
              const comment=previous.comment_id&&db.prepare('SELECT id,hidden FROM comments WHERE id=?').get(previous.comment_id);
              if(!comment||comment.hidden)fail(409,'이미 처리된 댓글 요청입니다. 댓글 목록을 확인해주세요.');
              commentId=comment.id;replayed=true;
            }else{
              commentId=Number(db.prepare('INSERT INTO comments(post_id,user_id,body,created_at) VALUES(?,?,?,?)').run(postId,user.id,content,new Date().toISOString()).lastInsertRowid);
              if(requestId)db.prepare('INSERT INTO comment_requests VALUES(?,?,?,?)').run(user.id,requestId,fingerprint,commentId);
            }
            db.exec('COMMIT');
          }catch(err){db.exec('ROLLBACK');throw err;}
          return send(replayed?200:201,{id:commentId,...(replayed?{replayed:true}:{})});
        }
      }
      const commentMatch = path.match(/^\/api\/comments\/(\d+)$/);
      if (commentMatch && method === 'DELETE') {
        auth(); const comment = db.prepare('SELECT user_id FROM comments WHERE id=?').get(Number(commentMatch[1]));
        if (!comment) fail(404, '댓글이 없습니다.');
        if (comment.user_id !== user.id) fail(403, '본인의 댓글만 삭제할 수 있습니다.');
        db.prepare('DELETE FROM comments WHERE id=?').run(Number(commentMatch[1])); return send(200,{ok:true});
      }
      if (path === '/api/posts' && method === 'GET') {
        const clauses = [mod.visibleSQL('p',user?.id)], values = [];
        const kind=url.searchParams.get('kind');
        if(kind&&!['catch','community','market'].includes(kind))fail(400,'게시판을 확인해주세요.');
        if(kind||url.searchParams.get('saved')!=='1'){clauses.push('p.kind=?');values.push(kind||'catch');}
        if (url.searchParams.get('mine') === '1') { auth(); clauses.push('p.user_id=?'); values.push(user.id); }
        if (url.searchParams.get('following') === '1') { auth(); clauses.push('p.user_id IN (SELECT target_id FROM follows WHERE follower_id=?)'); values.push(user.id); }
        if(url.searchParams.get('saved')==='1'){auth();clauses.push('p.id IN (SELECT post_id FROM saved_posts WHERE user_id=?)');values.push(user.id);}
        const marketSearch=marketFilters(url.searchParams),searchError=marketSearchError(marketSearch);
        if(searchError)fail(400,searchError);
        if(['min_price','max_price'].some(key=>marketSearch[key])&&kind!=='market')fail(400,'가격 조건은 장터에서만 이용해주세요.');
        if(marketSearch.q){const pattern='%'+marketSearch.q.replace(/[\\%_]/g,'\\$&')+'%';clauses.push("(p.title LIKE ? ESCAPE '\\' OR p.body LIKE ? ESCAPE '\\')");values.push(pattern,pattern);}
        if(marketSearch.min_price){clauses.push('p.price>=?');values.push(Number(marketSearch.min_price));}
        if(marketSearch.max_price){clauses.push('p.price<=?');values.push(Number(marketSearch.max_price));}
        const tradeStatus=url.searchParams.get('trade_status');
        if(tradeStatus){if(kind!=='market'||!['selling','sold'].includes(tradeStatus))fail(400,'거래 상태를 확인해주세요.');clauses.push('p.trade_status=?');values.push(tradeStatus);}
        const author = Number(url.searchParams.get('author')); if (author > 0) { clauses.push('p.user_id=?'); values.push(author); }
        for (const field of ['fish', 'region', 'method']) { const v = url.searchParams.get(field)?.trim(); if (v) { clauses.push(`p.${field} LIKE ? ESCAPE '\\'`); values.push('%'+v.slice(0,80).replace(/[\\%_]/g,'\\$&')+'%'); } }
        const from=url.searchParams.get('date_from')?.trim(),to=url.searchParams.get('date_to')?.trim();
        for(const value of [from,to])if(value&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value).toISOString().slice(0,10)!==value))fail(400,'출조 기간의 날짜를 확인해주세요.');
        if(from&&to&&from>to)fail(400,'시작일은 종료일보다 늦을 수 없습니다.');
        if(from){clauses.push('p.fishing_date>=?');values.push(from);}
        if(to){clauses.push('p.fishing_date<=?');values.push(to);}
        const before = Number(url.searchParams.get('before'));
        if (before > 0) { clauses.push('p.id<?'); values.push(before); }
        const rows = db.prepare(select + (clauses.length ? ' WHERE ' + clauses.join(' AND ') : '') + ' ORDER BY p.id DESC LIMIT 21').all(...values);
        const posts = rows.slice(0, 20).map(decorate); return send(200, { posts, next: rows.length > 20 ? posts.at(-1).id : null });
      }
      const match = path.match(/^\/api\/posts\/(\d+)$/), id = match ? Number(match[1]) : null;
      if (match && method === 'GET') { const post = db.prepare(select + ' WHERE p.id=?').get(id); if (!mod.postVisible(post,user)) fail(404, '게시물이 없습니다.'); return send(200, { post: decorate(post) }); }
      if ((path === '/api/posts' && method === 'POST') || (match && method === 'PATCH')) {
        auth();
        const requestId=!id?body.request_id:undefined;
        if(requestId!==undefined&&(typeof requestId!=='string'||!/^[a-f0-9]{32}$/.test(requestId)))fail(400,'등록 요청 정보를 확인해주세요.');
        const fingerprint=requestId?digest(JSON.stringify({...body,request_id:undefined})):null;
        const replay=()=>{
          if(!requestId)return null;
          const record=db.prepare('SELECT * FROM post_requests WHERE user_id=? AND request_id=?').get(user.id,requestId);
          if(!record)return null;
          if(record.fingerprint!==fingerprint)fail(409,'등록 내용이 바뀌었습니다. 새 요청으로 다시 시도해주세요.');
          const post=record.post_id&&db.prepare(select+' WHERE p.id=?').get(record.post_id);
          if(!post||!mod.postVisible(post,user))fail(409,'이미 처리된 요청입니다. 내 조황 목록을 확인해주세요.');
          return {post:decorate(post),replayed:true};
        };
        const completed=replay();if(completed)return send(200,completed);
        if (id) { const old = db.prepare('SELECT user_id FROM posts WHERE id=?').get(id); if (!old) fail(404, '게시물이 없습니다.'); if (old.user_id !== user.id) fail(403, '본인의 게시물만 수정할 수 있습니다.'); if(!mod.postVisible(db.prepare('SELECT * FROM posts WHERE id=?').get(id),user))fail(403,'숨김 처리된 게시물은 수정할 수 없습니다.'); }
        const postKind=id?db.prepare('SELECT kind FROM posts WHERE id=?').get(id).kind:(body.kind===undefined?'catch':body.kind);
        if(!['catch','community','market'].includes(postKind)||(id&&body.kind!==undefined&&body.kind!==postKind))fail(400,'게시물 종류를 바꿀 수 없습니다.');
        const community=postKind==='community',market=postKind==='market',discussion=community||market;
        const fields = [text(body.title,60,'제목'),text(body.body,2000,'내용'),...(discussion?['',market?text(body.region,50,'거래 지역'):'','']:[text(body.fish,30,'어종'),text(body.region,50,'지역'),text(body.method,30,'낚시 방식')])];
        const date=discussion?'':text(body.fishing_date,10,'출조일');
        if(!discussion&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))fail(400,'출조일을 확인해주세요.');
        const price=market?body.price:null;
        if(market&&(!Number.isSafeInteger(price)||price<0||price>1000000000))fail(400,'가격은 0원부터 10억원까지 정수로 입력해주세요.');
        const tradeStatus=market?(body.trade_status??(id?db.prepare('SELECT trade_status FROM posts WHERE id=?').get(id).trade_status:'selling')):null;
        if(market&&!['selling','sold'].includes(tradeStatus))fail(400,'거래 상태를 확인해주세요.');
        if(!community&&!id&&(!Array.isArray(body.photos)||!body.photos.length))fail(400,'새 조황에는 사진을 한 장 이상 선택해주세요.');
        if(body.photos!==undefined&&(!Array.isArray(body.photos)||(!community&&body.photos.length<1)))fail(400,'사진을 한 장 이상 남겨주세요.');
        if(Array.isArray(body.photos)&&body.photos.length>5)fail(400,'사진은 최대 5장까지 등록할 수 있습니다.');
        const photoInputs = body.photos?.map(photo => {
          if (!photo?.id) return photo;
          const existing = id && db.prepare('SELECT data FROM photos WHERE id=? AND post_id=?').get(String(photo.id),id);
          if (!existing) fail(400,'현재 게시물의 사진만 사용할 수 있습니다.');
          return { data: Buffer.from(existing.data).toString('base64') };
        });
        const photos = photoInputs === undefined ? null : await normalizePhotos(photoInputs);
        let savedId = id;
        db.exec('BEGIN IMMEDIATE');
        try {
          auth();
          const concurrent=replay();if(concurrent){db.exec('COMMIT');return send(200,concurrent);}
          if (id) {
            const current = db.prepare('SELECT user_id FROM posts WHERE id=?').get(id);
            if (!current) fail(404,'게시물이 없습니다.');
            if (current.user_id !== user.id) fail(403,'본인의 게시물만 수정할 수 있습니다.');
            if(!mod.postVisible(db.prepare('SELECT * FROM posts WHERE id=?').get(id),user))fail(403,'숨김 처리된 게시물은 수정할 수 없습니다.');
            db.prepare('UPDATE posts SET title=?,body=?,fish=?,region=?,method=?,fishing_date=?,price=?,trade_status=? WHERE id=?').run(...fields,date,price,tradeStatus,id);
          } else savedId = Number(db.prepare('INSERT INTO posts(id,user_id,title,body,fish,region,method,fishing_date,created_at,kind,price,trade_status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(mod.nextId('posts'),user.id,...fields,date,new Date().toISOString(),postKind,price,tradeStatus).lastInsertRowid);
          if (photos) {
            db.prepare('DELETE FROM photos WHERE post_id=?').run(savedId);
            photos.forEach((photo,position) => db.prepare('INSERT INTO photos VALUES(?,?,?,?,?,?)').run(randomBytes(16).toString('hex'),savedId,position,photo.data,photo.width,photo.height));
          }
          if(requestId)db.prepare('INSERT INTO post_requests VALUES(?,?,?,?)').run(user.id,requestId,fingerprint,savedId);
          db.exec('COMMIT');
        } catch (err) { db.exec('ROLLBACK'); throw err; }
        return send(id ? 200 : 201, { post: decorate(db.prepare(select + ' WHERE p.id=?').get(savedId)) });
      }
      if (match && method === 'DELETE') {
        auth(); const post = db.prepare('SELECT user_id FROM posts WHERE id=?').get(id);
        if (!post) fail(404, '게시물이 없습니다.'); if (post.user_id !== user.id) fail(403, '본인의 게시물만 삭제할 수 있습니다.');
        db.prepare('DELETE FROM posts WHERE id=?').run(id); return send(200, { ok: true });
      }
      fail(404, '요청한 기능이 없습니다.');
    } catch (err) { if (!err.status) console.error('Request failed:', err.code || err.name); send(err.status || 500, { error: err.status ? err.message : '처리 중 문제가 생겼습니다. 다시 시도해주세요.' }); }
  }
  return { handle, close: () => db.close(), drainMail:emailService.drain };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config=readConfig();
  const app=createApp(config);
  const server=http.createServer(app.handle);
  server.requestTimeout=120000;server.headersTimeout=10000;
  server.listen(config.port,config.host,()=>console.log(`HIT ${config.production?'production':'local development'}: ${config.origin}`));
  const stop=()=>server.close(async()=>{await app.drainMail();app.close();process.exit(0);});
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
