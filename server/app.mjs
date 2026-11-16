import http from 'node:http';
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
const publicUser = u => u ? { id: u.id, nickname: u.nickname, bio: u.bio } : null;

export function createApp({ database = resolve(root, 'data/hit.sqlite'), origin = 'http://127.0.0.1:3000', secure = false } = {}) {
  if (database !== ':memory:') mkdirSync(dirname(database), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(database);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', salt TEXT NOT NULL, password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS posts (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, body TEXT NOT NULL, fish TEXT NOT NULL, region TEXT NOT NULL, method TEXT NOT NULL, fishing_date TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS posts_user ON posts(user_id, id);
    PRAGMA user_version=1;`);
  const limits = new Map();
  const cookie = token => `hit_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${token ? 604800 : 0}${secure ? '; Secure' : ''}`;
  const sessionUser = req => {
    const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('hit_session='))?.slice(12);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return db.prepare('SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?').get(digest(token), Date.now());
  };
  async function handle(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    const send = (status, data) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); };
    try {
      const url = new URL(req.url, origin), path = url.pathname, method = req.method;
      if (!path.startsWith('/api/')) {
        if (method !== 'GET') fail(405, '지원하지 않는 요청입니다.');
        const file = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] }[path];
        if (!file) fail(404, '페이지가 없습니다.');
        res.setHeader('Content-Type', `${file[1]}; charset=utf-8`);
        res.end(readFileSync(resolve(root, 'public', file[0]))); return;
      }
      let body = {};
      if (!['GET', 'HEAD'].includes(method)) {
        if (req.headers.origin !== origin) fail(403, '허용되지 않은 요청 출처입니다.');
        if (!(req.headers['content-type'] || '').startsWith('application/json')) fail(415, 'JSON 요청이 필요합니다.');
        let size = 0, chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 16384) fail(413, '입력 용량이 너무 큽니다.'); chunks.push(chunk); }
        try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { fail(400, '요청 내용을 확인해주세요.'); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, '요청 형식이 올바르지 않습니다.');
      }
      const user = sessionUser(req);
      const auth = () => { if (!user) fail(401, '로그인이 필요합니다.'); return user; };
      if (path === '/api/me' && method === 'GET') return send(200, { user: publicUser(user) });
      if (['/api/signup', '/api/login'].includes(path) && method === 'POST') {
        const key = req.socket.remoteAddress || 'local', now = Date.now();
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
          try { const r = db.prepare('INSERT INTO users(email,nickname,salt,password_hash) VALUES(?,?,?,?)').run(email, nickname, salt, hash); account = db.prepare('SELECT * FROM users WHERE id=?').get(Number(r.lastInsertRowid)); }
          catch (err) { if (err.code?.startsWith('ERR_SQLITE') && db.prepare('SELECT id FROM users WHERE email=?').get(email)) fail(409, '이미 등록된 이메일입니다.'); throw err; }
        } else {
          const candidate = await derive(body.password, account?.salt || 'dummy-salt-for-missing-account', 64);
          if (!account || !timingSafeEqual(candidate, Buffer.from(account.password_hash, 'hex'))) fail(401, '이메일 또는 비밀번호를 확인해주세요.');
        }
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
      if (path === '/api/profile' && method === 'PATCH') {
        auth(); const nickname = text(body.nickname, 30, '닉네임');
        if (typeof body.bio !== 'string' || body.bio.length > 200) fail(400, '소개는 200자 이하로 입력해주세요.');
        db.prepare('UPDATE users SET nickname=?,bio=? WHERE id=?').run(nickname, body.bio.trim(), user.id);
        return send(200, { user: publicUser(db.prepare('SELECT * FROM users WHERE id=?').get(user.id)) });
      }
      const select = 'SELECT p.*,u.nickname FROM posts p JOIN users u ON u.id=p.user_id';
      if (path === '/api/posts' && method === 'GET') {
        const clauses = [], values = [];
        if (url.searchParams.get('mine') === '1') { auth(); clauses.push('p.user_id=?'); values.push(user.id); }
        for (const field of ['fish', 'region']) { const v = url.searchParams.get(field); if (v) { clauses.push(`p.${field}=?`); values.push(v.slice(0, 80)); } }
        const before = Number(url.searchParams.get('before'));
        if (before > 0) { clauses.push('p.id<?'); values.push(before); }
        const rows = db.prepare(select + (clauses.length ? ' WHERE ' + clauses.join(' AND ') : '') + ' ORDER BY p.id DESC LIMIT 21').all(...values);
        const posts = rows.slice(0, 20); return send(200, { posts, next: rows.length > 20 ? posts.at(-1).id : null });
      }
      const match = path.match(/^\/api\/posts\/(\d+)$/), id = match ? Number(match[1]) : null;
      if (match && method === 'GET') { const post = db.prepare(select + ' WHERE p.id=?').get(id); if (!post) fail(404, '게시물이 없습니다.'); return send(200, { post }); }
      if ((path === '/api/posts' && method === 'POST') || (match && method === 'PATCH')) {
        auth();
        if (id) { const old = db.prepare('SELECT user_id FROM posts WHERE id=?').get(id); if (!old) fail(404, '게시물이 없습니다.'); if (old.user_id !== user.id) fail(403, '본인의 게시물만 수정할 수 있습니다.'); }
        const fields = [text(body.title, 60, '제목'), text(body.body, 2000, '내용'), text(body.fish, 30, '어종'), text(body.region, 50, '지역'), text(body.method, 30, '낚시 방식')];
        const date = text(body.fishing_date, 10, '출조일');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail(400, '출조일을 확인해주세요.');
        let savedId = id;
        if (id) db.prepare('UPDATE posts SET title=?,body=?,fish=?,region=?,method=?,fishing_date=? WHERE id=?').run(...fields, date, id);
        else savedId = Number(db.prepare('INSERT INTO posts(user_id,title,body,fish,region,method,fishing_date,created_at) VALUES(?,?,?,?,?,?,?,?)').run(user.id, ...fields, date, new Date().toISOString()).lastInsertRowid);
        return send(id ? 200 : 201, { post: db.prepare(select + ' WHERE p.id=?').get(savedId) });
      }
      if (match && method === 'DELETE') {
        auth(); const post = db.prepare('SELECT user_id FROM posts WHERE id=?').get(id);
        if (!post) fail(404, '게시물이 없습니다.'); if (post.user_id !== user.id) fail(403, '본인의 게시물만 삭제할 수 있습니다.');
        db.prepare('DELETE FROM posts WHERE id=?').run(id); return send(200, { ok: true });
      }
      fail(404, '요청한 기능이 없습니다.');
    } catch (err) { if (!err.status) console.error('Request failed:', err.code || err.name); send(err.status || 500, { error: err.status ? err.message : '처리 중 문제가 생겼습니다. 다시 시도해주세요.' }); }
  }
  return { handle, close: () => db.close() };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000), origin = `http://127.0.0.1:${port}`;
  const app = createApp({ database: process.env.HIT_DB || resolve(root, 'data/hit.sqlite'), origin });
  const server = http.createServer(app.handle);
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  server.listen(port, '127.0.0.1', () => console.log(`HIT local development: ${origin}`));
  const stop = () => server.close(() => { app.close(); process.exit(0); });
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
