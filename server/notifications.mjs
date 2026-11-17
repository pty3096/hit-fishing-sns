export function notifications(db,mod){
  db.exec(`CREATE TABLE IF NOT EXISTS notifications(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('like','comment','follow')),
    post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
    comment_id INTEGER REFERENCES comments(id) ON DELETE CASCADE,
    is_read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE INDEX IF NOT EXISTS notifications_recipient ON notifications(recipient_id,id);
    CREATE TRIGGER IF NOT EXISTS notify_like AFTER INSERT ON likes BEGIN
      INSERT INTO notifications(recipient_id,actor_id,kind,post_id)
      SELECT user_id,NEW.user_id,'like',id FROM posts WHERE id=NEW.post_id AND user_id!=NEW.user_id;
    END;
    CREATE TRIGGER IF NOT EXISTS unnotify_like AFTER DELETE ON likes BEGIN
      DELETE FROM notifications WHERE kind='like' AND actor_id=OLD.user_id AND post_id=OLD.post_id;
    END;
    CREATE TRIGGER IF NOT EXISTS notify_comment AFTER INSERT ON comments BEGIN
      INSERT INTO notifications(recipient_id,actor_id,kind,post_id,comment_id)
      SELECT user_id,NEW.user_id,'comment',id,NEW.id FROM posts WHERE id=NEW.post_id AND user_id!=NEW.user_id;
    END;
    CREATE TRIGGER IF NOT EXISTS notify_follow AFTER INSERT ON follows WHEN NEW.follower_id!=NEW.target_id BEGIN
      INSERT INTO notifications(recipient_id,actor_id,kind) VALUES(NEW.target_id,NEW.follower_id,'follow');
    END;
    CREATE TRIGGER IF NOT EXISTS unnotify_follow AFTER DELETE ON follows BEGIN
      DELETE FROM notifications WHERE kind='follow' AND recipient_id=OLD.target_id AND actor_id=OLD.follower_id;
    END;
    PRAGMA user_version=9;`);
  const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
  const visible=id=>`n.recipient_id=${Number(id)}
    AND EXISTS(SELECT 1 FROM users a WHERE a.id=n.actor_id AND a.suspended=0)
    AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=${Number(id)} AND b.target_id=n.actor_id) OR (b.target_id=${Number(id)} AND b.blocker_id=n.actor_id))
    AND (n.post_id IS NULL OR EXISTS(SELECT 1 FROM posts p WHERE p.id=n.post_id AND ${mod.visibleSQL('p',id)}))
    AND (n.comment_id IS NULL OR EXISTS(SELECT 1 FROM comments c WHERE c.id=n.comment_id AND ${mod.visibleSQL('c',id)}))`;
  return {route({path,method,body,user,auth,send,url}){
    const single=path.match(/^\/api\/notifications\/(\d+)\/read$/);
    if(path!=='/api/notifications'&&path!=='/api/notifications/read'&&!single)return false;
    auth();const where=visible(user.id);
    if(path==='/api/notifications'&&method==='GET'){
      const unread=db.prepare(`SELECT count(*) n FROM notifications n WHERE ${where} AND n.is_read=0`).get().n;
      if(url.searchParams.get('summary')==='1'){send(200,{unread});return true;}
      const before=Number(url.searchParams.get('before'))||Number.MAX_SAFE_INTEGER;
      const rows=db.prepare(`SELECT n.id,n.kind,n.post_id,n.comment_id,n.actor_id,n.is_read,n.created_at,u.nickname FROM notifications n JOIN users u ON u.id=n.actor_id WHERE ${where} AND n.id<? ORDER BY n.id DESC LIMIT 21`).all(before);
      send(200,{unread,notifications:rows.slice(0,20).map(n=>({...n,is_read:!!n.is_read,href:n.post_id?'post/'+n.post_id:'user/'+n.actor_id})),next:rows.length>20?rows[19].id:null});return true;
    }
    if(method==='PUT'&&single){
      const row=db.prepare(`SELECT n.id FROM notifications n WHERE ${where} AND n.id=?`).get(Number(single[1]));
      if(!row)fail(404,'알림이 없습니다.');
      db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND recipient_id=?').run(row.id,user.id);
      send(200,{ok:true});return true;
    }
    if(method==='PUT'&&path==='/api/notifications/read'){
      if(!Number.isSafeInteger(body.through_id)||body.through_id<1)fail(400,'읽음 처리 범위를 확인해주세요.');
      db.prepare(`UPDATE notifications SET is_read=1 WHERE id IN (SELECT n.id FROM notifications n WHERE ${where} AND n.id<=?)`).run(body.through_id);
      send(200,{ok:true});return true;
    }
    fail(405,'지원하지 않는 요청입니다.');
  }};
}
