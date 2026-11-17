const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function moderation(db) {
  const addColumn = (table, name, definition) => {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  };
  db.exec('BEGIN IMMEDIATE');
  try {
    addColumn('users', 'suspended', 'INTEGER NOT NULL DEFAULT 0');
    addColumn('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
    addColumn('posts', 'hidden', 'INTEGER NOT NULL DEFAULT 0');
    addColumn('comments', 'hidden', 'INTEGER NOT NULL DEFAULT 0');
    db.exec(`CREATE TABLE IF NOT EXISTS blocks(id INTEGER PRIMARY KEY AUTOINCREMENT, blocker_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, target_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, UNIQUE(blocker_id,target_id), CHECK(blocker_id!=target_id));
      CREATE INDEX IF NOT EXISTS blocks_target ON blocks(target_id,blocker_id);
      CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL, target_type TEXT NOT NULL, target_id INTEGER NOT NULL, reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS reports_open ON reports(reporter_id,target_type,target_id) WHERE status='open';
      CREATE TABLE IF NOT EXISTS moderation_actions(id INTEGER PRIMARY KEY AUTOINCREMENT, report_id INTEGER NOT NULL REFERENCES reports(id), actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL, action TEXT NOT NULL, note TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS id_counters(name TEXT PRIMARY KEY,value INTEGER NOT NULL);
      INSERT OR IGNORE INTO id_counters VALUES('users',(SELECT coalesce(max(id),0) FROM users));
      INSERT OR IGNORE INTO id_counters VALUES('posts',(SELECT coalesce(max(id),0) FROM posts));
      PRAGMA user_version=3; COMMIT;`);
  } catch (err) { db.exec('ROLLBACK'); throw err; }
  const nextId = name => db.prepare('UPDATE id_counters SET value=value+1 WHERE name=? RETURNING value').get(name).value;
  const blocked = (a, b) => !!(a && a !== b && db.prepare('SELECT 1 FROM blocks WHERE (blocker_id=? AND target_id=?) OR (blocker_id=? AND target_id=?)').get(a,b,b,a));
  const userVisible = (id, viewer) => {
    const person = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    return person && (!person.suspended || viewer?.id === id) && !blocked(viewer?.id,id);
  };
  const postVisible = (post, viewer) => post && !post.hidden && userVisible(post.user_id,viewer);
  const visibleSQL = (alias, viewerId = 0) => `${alias}.hidden=0 AND EXISTS(SELECT 1 FROM users visible_user WHERE visible_user.id=${alias}.user_id AND visible_user.suspended=0) AND NOT EXISTS(SELECT 1 FROM blocks visible_block WHERE (visible_block.blocker_id=${Number(viewerId)} AND visible_block.target_id=${alias}.user_id) OR (visible_block.target_id=${Number(viewerId)} AND visible_block.blocker_id=${alias}.user_id))`;
  const target = (type,id) => {
    if (type === 'user') { const u=db.prepare('SELECT id,nickname,bio,suspended FROM users WHERE id=?').get(id); return u ? {...u,user_id:u.id} : null; }
    if (type === 'post') return db.prepare('SELECT p.*,u.nickname FROM posts p JOIN users u ON u.id=p.user_id WHERE p.id=?').get(id);
    if (type === 'comment') return db.prepare('SELECT c.*,u.nickname FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?').get(id);
    return null;
  };
  async function route({path,method,body,user,auth,send,req,res,verifyPassword}) {
    if (path === '/api/account' && method === 'DELETE') {
      if (!user) fail(401,'로그인이 필요합니다.');
      if (body.confirm !== '탈퇴') fail(400,'확인란에 탈퇴를 입력해주세요.');
      if (!await verifyPassword(user,body.password)) fail(401,'비밀번호를 확인해주세요.');
      db.exec('BEGIN IMMEDIATE');
      try {
        // Reports authored by the departing user contain free text and are anonymized too.
        db.prepare("UPDATE reports SET reason='탈퇴한 사용자의 신고',reporter_id=NULL WHERE reporter_id=?").run(user.id);
        db.prepare('DELETE FROM users WHERE id=?').run(user.id);
        db.exec('COMMIT');
      } catch(err) {db.exec('ROLLBACK');throw err;}
      res.setHeader('Set-Cookie','hit_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
      send(200,{ok:true}); return true;
    }
    const blockMatch=path.match(/^\/api\/blocks\/(\d+)$/);
    if (blockMatch && ['PUT','DELETE'].includes(method)) {
      auth(); const id=Number(blockMatch[1]);
      if(id===user.id) fail(400,'자신은 차단할 수 없습니다.');
      if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(id)) fail(404,'사용자가 없습니다.');
      db.exec('BEGIN IMMEDIATE');
      try {
        if(method==='PUT') {
          db.prepare('INSERT OR IGNORE INTO blocks(blocker_id,target_id) VALUES(?,?)').run(user.id,id);
          db.prepare('DELETE FROM follows WHERE (follower_id=? AND target_id=?) OR (follower_id=? AND target_id=?)').run(user.id,id,id,user.id);
        } else db.prepare('DELETE FROM blocks WHERE blocker_id=? AND target_id=?').run(user.id,id);
        db.exec('COMMIT');
      } catch(err){db.exec('ROLLBACK');throw err;}
      send(200,{blocked:method==='PUT'}); return true;
    }
    if(path==='/api/blocks' && method==='GET') {
      if(!user) fail(401,'로그인이 필요합니다.');
      const before=Number(new URL(req.url,'http://local').searchParams.get('before'))||Number.MAX_SAFE_INTEGER;
      const rows=db.prepare('SELECT b.id AS cursor,u.id,u.nickname FROM blocks b JOIN users u ON u.id=b.target_id WHERE b.blocker_id=? AND b.id<? ORDER BY b.id DESC LIMIT 21').all(user.id,before);
      send(200,{users:rows.slice(0,20),next:rows.length>20?rows[19].cursor:null});return true;
    }
    if(path==='/api/reports' && method==='POST') {
      auth(); const type=body.target_type,id=Number(body.target_id);
      if(!['post','comment','user'].includes(type)||!Number.isSafeInteger(id)||id<1)fail(400,'신고 대상을 확인해주세요.');
      const item=target(type,id);
      if(!item || !userVisible(item.user_id,user) || (type==='post'&&!postVisible(item,user)) || (type==='comment' && (item.hidden || !postVisible(target('post',item.post_id),user))))fail(404,'신고 대상을 찾을 수 없습니다.');
      if(item.user_id===user.id)fail(400,'본인의 콘텐츠는 신고할 수 없습니다.');
      if(typeof body.reason!=='string'||!body.reason.trim()||body.reason.trim().length>300)fail(400,'신고 사유는 1~300자로 입력해주세요.');
      if(db.prepare("SELECT 1 FROM reports WHERE reporter_id=? AND target_type=? AND target_id=? AND status='open'").get(user.id,type,id))fail(409,'이미 접수한 신고입니다.');
      if(db.prepare('SELECT count(*) n FROM reports WHERE reporter_id=? AND created_at>?').get(user.id,Date.now()-3600000).n>=20)fail(429,'신고가 많습니다. 잠시 후 다시 시도해주세요.');
      const r=db.prepare('INSERT INTO reports(reporter_id,target_type,target_id,reason,created_at) VALUES(?,?,?,?,?)').run(user.id,type,id,body.reason.trim(),Date.now());
      send(201,{id:Number(r.lastInsertRowid),message:'신고를 접수했습니다.'});return true;
    }
    if(path.startsWith('/api/admin/')) {
      auth();if(!db.prepare('SELECT is_admin FROM users WHERE id=?').get(user.id)?.is_admin)fail(403,'운영자 권한이 필요합니다.');
      const adminPhoto=path.match(/^\/api\/admin\/photos\/([a-f0-9]{32})$/);
      if(adminPhoto&&method==='GET') {
        const photo=db.prepare('SELECT data FROM photos WHERE id=?').get(adminPhoto[1]);
        if(!photo)fail(404,'사진이 없습니다.');
        res.setHeader('Content-Type','image/webp');res.end(Buffer.from(photo.data));return true;
      }
      const adminAvatar=path.match(/^\/api\/admin\/avatars\/(\d+)\/([a-f0-9]{32})$/);
      if(adminAvatar&&method==='GET'){
        const photo=db.prepare('SELECT data FROM avatars WHERE user_id=? AND revision=?').get(Number(adminAvatar[1]),adminAvatar[2]);
        if(!photo)fail(404,'프로필 사진이 없습니다.');
        res.setHeader('Content-Type','image/webp');res.end(Buffer.from(photo.data));return true;
      }
      const detail=path.match(/^\/api\/admin\/reports\/(\d+)(?:\/(resolve))?$/);
      if(path==='/api/admin/reports' && method==='GET') {
        const url=new URL(req.url,'http://local'),status=url.searchParams.get('status')||'open';
        if(!['open','resolved'].includes(status))fail(400,'신고 상태를 확인해주세요.');
        const before=Number(url.searchParams.get('before'))||Number.MAX_SAFE_INTEGER;
        const rows=db.prepare('SELECT * FROM reports WHERE status=? AND id<? ORDER BY id DESC LIMIT 21').all(status,before);
        send(200,{reports:rows.slice(0,20),next:rows.length>20?rows[19].id:null});return true;
      }
      if(detail) {
        const report=db.prepare('SELECT * FROM reports WHERE id=?').get(Number(detail[1]));if(!report)fail(404,'신고가 없습니다.');
        if(!detail[2]&&method==='GET') {
          // Deliberately omit image data, account email, password hashes and sessions.
          const item=target(report.target_type,report.target_id);
          if(item&&report.target_type==='post')item.photos=db.prepare('SELECT id,width,height FROM photos WHERE post_id=? ORDER BY position').all(item.id).map(p=>({...p,url:'/api/admin/photos/'+p.id}));
          if(item&&report.target_type==='user'){const picture=db.prepare('SELECT revision FROM avatars WHERE user_id=?').get(item.id);item.avatar_url=picture?`/api/admin/avatars/${item.id}/${picture.revision}`:null;}
          send(200,{report,target:item,actions:db.prepare('SELECT id,action,note,created_at FROM moderation_actions WHERE report_id=? ORDER BY id DESC').all(report.id)});return true;
        }
        if(detail[2]&&method==='POST') {
          const action=body.action;
          if(!['dismiss','hide','restore','suspend','unsuspend'].includes(action))fail(400,'조치를 선택해주세요.');
          if(typeof body.note!=='string'||!body.note.trim()||body.note.trim().length>500)fail(400,'조치 사유는 1~500자로 입력해주세요.');
          db.exec('BEGIN IMMEDIATE');
          try {
            const item=target(report.target_type,report.target_id);
            if(action!=='dismiss'&&!item)fail(404,'대상이 삭제되었습니다. 종결만 가능합니다.');
            if(['hide','restore'].includes(action)) {
              if(!['post','comment'].includes(report.target_type))fail(400,'글과 댓글에만 적용할 수 있습니다.');
              const table=report.target_type==='post'?'posts':'comments';
              db.prepare(`UPDATE ${table} SET hidden=? WHERE id=?`).run(action==='hide'?1:0,report.target_id);
            }
            if(['suspend','unsuspend'].includes(action)) {
              const person=db.prepare('SELECT is_admin FROM users WHERE id=?').get(item.user_id);
              if(person?.is_admin)fail(400,'운영자 계정은 이 화면에서 제한할 수 없습니다.');
              db.prepare('UPDATE users SET suspended=? WHERE id=?').run(action==='suspend'?1:0,item.user_id);
              if(action==='suspend') db.prepare('DELETE FROM sessions WHERE user_id=?').run(item.user_id);
            }
            db.prepare("UPDATE reports SET status='resolved' WHERE id=?").run(report.id);
            db.prepare('INSERT INTO moderation_actions(report_id,actor_id,action,note,created_at) VALUES(?,?,?,?,?)').run(report.id,user.id,action,body.note.trim(),Date.now());
            db.exec('COMMIT');
          }catch(err){db.exec('ROLLBACK');throw err;}
          send(200,{ok:true});return true;
        }
      }
      fail(404,'운영 기능을 찾을 수 없습니다.');
    }
    return false;
  }
  return {nextId,blocked,userVisible,postVisible,visibleSQL,route};
}
