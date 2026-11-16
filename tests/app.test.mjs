import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server/app.mjs';

const origin = 'http://127.0.0.1:3000';
async function request(app, method, path, data, cookie, overrides = {}) {
  const req = Readable.from(data === undefined ? [] : [Buffer.from(JSON.stringify(data))]);
  Object.assign(req, { method, url: path, headers: { origin, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...overrides }, socket: { remoteAddress: 'test' } });
  const headers = {}; let raw = '';
  const res = { statusCode: 200, setHeader(k, v) { headers[k.toLowerCase()] = v; }, end(s) { raw = s; } };
  await app.handle(req, res);
  return { status: res.statusCode, body: headers['content-type']?.includes('application/json') ? JSON.parse(raw) : raw.toString(), headers, cookie: headers['set-cookie']?.split(';')[0] };
}
const credentials = email => ({ email, password: 'a-long-test-password-123', nickname: '테스트 낚시인' });
const post = { title: '첫 농어', body: '강릉에서 만난 한 수', fish: '농어', region: '강원 강릉시', method: '루어', fishing_date: '2026-11-17' };

test('two-account authentication, owner permissions, validation and logout revocation', async t => {
  const app = createApp({ database: ':memory:' }); t.after(app.close);
  assert.equal((await request(app, 'POST', '/api/posts', post)).status, 401);
  assert.equal((await request(app, 'POST', '/api/signup', { ...credentials('a@example.test'), password: 'short' })).status, 400);
  const a = await request(app, 'POST', '/api/signup', credentials('a@example.test'));
  assert.equal(a.status, 201); assert.ok(a.cookie);
  assert.match(a.headers['set-cookie'], /HttpOnly; SameSite=Lax/);
  assert.deepEqual(Object.keys(a.body.user).sort(), ['bio', 'id', 'nickname']);
  assert.equal((await request(app, 'POST', '/api/signup', credentials('A@example.test'))).status, 409);
  assert.equal((await request(app, 'POST', '/api/login', { email: 'a@example.test', password: 'wrong-password-value' })).status, 401);
  const b = await request(app, 'POST', '/api/signup', credentials('b@example.test'));
  const created = await request(app, 'POST', '/api/posts', post, a.cookie);
  assert.equal(created.status, 201); const id = created.body.post.id;
  assert.equal((await request(app, 'GET', '/api/posts?mine=1', undefined, b.cookie)).body.posts.length, 0);
  assert.equal((await request(app, 'PATCH', '/api/posts/' + id, post, b.cookie)).status, 403);
  assert.equal((await request(app, 'DELETE', '/api/posts/' + id, {}, b.cookie)).status, 403);
  assert.equal((await request(app, 'PATCH', '/api/posts/' + id, { ...post, fishing_date: '2026-02-30' }, a.cookie)).status, 400);
  assert.equal((await request(app, 'PATCH', '/api/posts/' + id, { ...post, title: '수정한 기록' }, a.cookie)).body.post.title, '수정한 기록');
  assert.equal((await request(app, 'PATCH', '/api/profile', { nickname: '변경한 이름', bio: '소개' }, a.cookie)).status, 200);
  assert.equal((await request(app, 'GET', '/api/posts/' + id)).body.post.nickname, '변경한 이름');
  assert.equal((await request(app, 'GET', '/api/posts?fish=농어&region=' + encodeURIComponent('강원 강릉시'))).body.posts.length, 1);
  assert.equal((await request(app, 'GET', '/api/posts?fish=광어')).body.posts.length, 0);
  assert.equal((await request(app, 'POST', '/api/posts', post, a.cookie, { origin: 'https://other.example' })).status, 403);
  assert.equal((await request(app, 'POST', '/api/posts', post, a.cookie, { origin: undefined })).status, 403);
  assert.equal((await request(app, 'POST', '/api/posts', post, a.cookie, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await request(app, 'POST', '/api/posts', { ...post, body: 'x'.repeat(20000) }, a.cookie)).status, 413);
  assert.equal((await request(app, 'POST', '/api/logout', {}, a.cookie)).status, 200);
  assert.equal((await request(app, 'GET', '/api/me', undefined, a.cookie)).body.user, null);
  const login = await request(app, 'POST', '/api/login', credentials('a@example.test'));
  assert.equal(login.status, 200); assert.notEqual(login.cookie, a.cookie);
  assert.equal((await request(app, 'DELETE', '/api/posts/' + id, {}, login.cookie)).status, 200);
  assert.equal((await request(app, 'GET', '/api/posts/' + id)).status, 404);
});

test('records and hashed sessions survive restart; expired sessions cannot authorize', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'hit-test-')), database = join(dir, 'hit.sqlite');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let app = createApp({ database });
  const account = await request(app, 'POST', '/api/signup', credentials('persist@example.test'));
  const { body } = await request(app, 'POST', '/api/posts', post, account.cookie);
  app.close(); app = createApp({ database }); t.after(() => app.close());
  assert.equal((await request(app, 'GET', '/api/me', undefined, account.cookie)).body.user.nickname, '테스트 낚시인');
  assert.equal((await request(app, 'GET', '/api/posts/' + body.post.id)).body.post.title, post.title);
  const db = new DatabaseSync(database);
  const user = db.prepare('SELECT * FROM users').get(); assert.notEqual(user.password_hash, credentials('').password);
  assert.equal(user.password_hash.length, 128);
  const session = db.prepare('SELECT * FROM sessions').get(); assert.notEqual(session.token_hash, account.cookie.split('=')[1]);
  db.prepare('UPDATE sessions SET expires=0').run(); db.close();
  assert.equal((await request(app, 'POST', '/api/posts', post, account.cookie)).status, 401);
});

test('pagination is bounded without overlap and authentication is rate limited', async t => {
  const app = createApp({ database: ':memory:' }); t.after(app.close);
  const a = await request(app, 'POST', '/api/signup', credentials('pages@example.test'));
  for (let i = 0; i < 23; i++) assert.equal((await request(app, 'POST', '/api/posts', { ...post, title: '조황 ' + i }, a.cookie)).status, 201);
  const first = (await request(app, 'GET', '/api/posts')).body;
  assert.equal(first.posts.length, 20); assert.ok(first.next);
  const second = (await request(app, 'GET', '/api/posts?before=' + first.next)).body;
  assert.equal(second.posts.length, 3); assert.equal(second.next, null);
  assert.equal(new Set([...first.posts, ...second.posts].map(p => p.id)).size, 23);
  for (let i = 0; i < 20; i++) await request(app, 'POST', '/api/login', { email: 'not-valid', password: 'invalid' });
  assert.equal((await request(app, 'POST', '/api/login', credentials('pages@example.test'))).status, 429);
  const page = await request(app, 'GET', '/'); assert.equal(page.status, 200);
  assert.ok(page.headers['content-security-policy'].includes("script-src 'self'"));
  assert.equal((await request(app, 'GET', '/data/hit.sqlite')).status, 404);
});
