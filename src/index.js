import { Hub } from './hub.js';
export { Hub };

/* ---------- helpers ---------- */
const J = (d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const E = (m, s = 400) => J({ error: m }, s);
const now = () => Date.now();
const id = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);
async function sha(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
const GENDERS = ['m', 'f', 'nb', 'c'];
const LEVELS = ['soft', 'flirt', 'x'];
const REASONS = ['minor', 'ncii', 'harass', 'unsolicited', 'scam', 'trafficking', 'fake', 'avatar', 'other'];
const LOOK = ['talk', 'friends', 'date', 'flirt', 'casual', 'sexting'];
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, max);
const MAX_IMG = 2 * 1024 * 1024;

function publicUser(u, online) {
  return {
    id: u.id, nick: u.nick, age: u.age, gender: u.gender, area: u.area, emo: u.emo, avatar: u.avatar || null, bio: u.bio,
    looking: JSON.parse(u.looking || '[]'), lvl: u.lvl,
    verified: u.verified === 2, verified_gender: u.verified === 2 ? u.verified_gender : null,
    online: online ? online.has(u.id) : false, last_seen: u.last_seen,
  };
}
function selfUser(u) {
  return {
    ...publicUser(u), show_explicit: !!u.show_explicit, incognito: !!u.incognito, role: u.role,
    verify_state: u.verified, verify_note: u.verify_note, premium_until: u.premium_until,
    premium: u.premium_until > now(), created: u.created,
  };
}

function hub(env) { return env.HUB.get(env.HUB.idFromName('global')); }
async function push(env, body) {
  try { await hub(env).fetch('https://hub/push', { method: 'POST', body: JSON.stringify(body) }); } catch (e) {}
}
async function onlineSet(env) {
  try { const r = await hub(env).fetch('https://hub/online'); const d = await r.json(); return { users: new Set(d.users), rooms: d.rooms || {} }; }
  catch (e) { return { users: new Set(), rooms: {} }; }
}
async function blockedIds(env, uid) {
  const r = await env.DB.prepare('SELECT target AS x FROM blocks WHERE user=? UNION SELECT user AS x FROM blocks WHERE target=?').bind(uid, uid).all();
  return new Set(r.results.map(x => x.x));
}
async function log(env, admin, action, target, details) {
  await env.DB.prepare('INSERT INTO admin_log (id,admin,action,target,details,created) VALUES (?,?,?,?,?,?)').bind(id(), admin, action, target || null, details ? JSON.stringify(details) : null, now()).run();
}

async function auth(req, env, url) {
  const h = req.headers.get('authorization') || '';
  const tok = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token');
  if (!tok) return null;
  const u = await env.DB.prepare('SELECT * FROM users WHERE token_hash=?').bind(await sha(tok)).first();
  if (!u) return null;
  if (now() - u.last_seen > 60000) await env.DB.prepare('UPDATE users SET last_seen=? WHERE id=?').bind(now(), u.id).run();
  return u;
}

/* ---------- router ---------- */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const p = url.pathname;
    if (p === '/robots.txt') return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nSitemap: ${url.origin}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } });
    if (p === '/sitemap.xml') return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${url.origin}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url></urlset>`, { headers: { 'content-type': 'application/xml' } });
    if (!p.startsWith('/api/')) {
      const res = await env.ASSETS.fetch(req);
      if (p === '/' || p === '/index.html') {
        // absolute canonical / og:url for search engines, whatever domain serves the site
        const html = (await res.text()).replace('<link rel="canonical" href="/">', `<link rel="canonical" href="${url.origin}/"><meta property="og:url" content="${url.origin}/">`).replace('content="/icons/icon-512.png"', `content="${url.origin}/icons/icon-512.png"`);
        return new Response(html, { status: res.status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
      }
      if (p.startsWith('/admin')) { const r2 = new Response(res.body, res); r2.headers.set('x-robots-tag', 'noindex'); return r2; }
      return res;
    }
    try {
      return await api(req, env, url, p, ctx);
    } catch (e) {
      console.error(e);
      return E('שגיאת שרת', 500);
    }
  },
};

async function api(req, env, url, p, ctx) {
  const m = req.method;
  const body = async () => { try { return await req.json(); } catch (e) { return {}; } };

  /* --- public --- */
  if (p === '/api/health') return J({ ok: true });
  if (p === '/api/public/stats') {
    const on = await onlineSet(env);
    const r = await env.DB.prepare('SELECT id,name,emo,lvl FROM rooms WHERE hidden=0 AND official=1 ORDER BY created LIMIT 12').all();
    return new Response(JSON.stringify({ online: on.users.size, rooms: r.results.map(x => ({ name: x.name, emo: x.emo, lvl: x.lvl, online: on.rooms[x.id] || 0 })) }), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=20' } });
  }

  if (p === '/api/register' && m === 'POST') {
    const b = await body();
    const nick = clean(b.nick, 16);
    const age = parseInt(b.age, 10);
    if (!b.agree) return E('יש לאשר את הכללים');
    if (nick.length < 2) return E('כינוי חייב להכיל לפחות 2 תווים');
    if (!age || age < 18 || age > 99) return E('השירות מיועד לגילאי 18 ומעלה בלבד');
    if (!GENDERS.includes(b.gender)) return E('מגדר לא תקין');
    const exists = await env.DB.prepare('SELECT 1 FROM users WHERE nick_lc=?').bind(nick.toLowerCase()).first();
    if (exists) return E('הכינוי תפוס, נסה/י אחר');
    const token = crypto.randomUUID() + crypto.randomUUID();
    const uid = id();
    const look = Array.isArray(b.looking) ? b.looking.filter(x => LOOK.includes(x)) : [];
    await env.DB.prepare(`INSERT INTO users (id,nick,nick_lc,age,gender,area,emo,bio,looking,lvl,token_hash,created,last_seen)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(uid, nick, nick.toLowerCase(), age, b.gender, parseInt(b.area) || 0,
      clean(b.emo, 8) || '😎', clean(b.bio, 300), JSON.stringify(look), LEVELS.includes(b.lvl) ? b.lvl : 'flirt',
      await sha(token), now(), now()).run();
    const u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(uid).first();
    return J({ token, user: selfUser(u) });
  }

  /* --- authed --- */
  const me = await auth(req, env, url);
  if (!me) return E('לא מחובר', 401);
  if (me.banned) return J({ error: 'החשבון הושעה', banned: true, reason: me.ban_reason }, 403);

  if (p === '/api/ws') {
    if (req.headers.get('upgrade') !== 'websocket') return E('expected websocket', 426);
    const h = new Headers(req.headers);
    h.set('x-uid', me.id);
    return hub(env).fetch('https://hub/ws', { headers: h });
  }

  /* me */
  if (p === '/api/me' && m === 'GET') return J({ user: selfUser(me) });
  if (p === '/api/me' && m === 'PATCH') {
    const b = await body();
    const f = {};
    if (b.nick !== undefined) {
      const n = clean(b.nick, 16);
      if (n.length < 2) return E('כינוי קצר מדי');
      if (n.toLowerCase() !== me.nick_lc) {
        if (await env.DB.prepare('SELECT 1 FROM users WHERE nick_lc=?').bind(n.toLowerCase()).first()) return E('הכינוי תפוס');
        f.nick = n; f.nick_lc = n.toLowerCase();
      }
    }
    if (b.age !== undefined) { const a = parseInt(b.age); if (!a || a < 18 || a > 99) return E('גיל לא תקין'); f.age = a; }
    if (b.gender !== undefined) {
      if (!GENDERS.includes(b.gender)) return E('מגדר לא תקין');
      if (b.gender !== me.gender) { f.gender = b.gender; if (me.verified === 2) { f.verified = 0; f.verified_gender = null; } }
    }
    if (b.area !== undefined) f.area = parseInt(b.area) || 0;
    if (b.emo !== undefined) f.emo = clean(b.emo, 8) || '😎';
    if (b.bio !== undefined) f.bio = clean(b.bio, 300);
    if (b.looking !== undefined) f.looking = JSON.stringify((b.looking || []).filter(x => LOOK.includes(x)));
    if (b.lvl !== undefined && LEVELS.includes(b.lvl)) f.lvl = b.lvl;
    if (b.show_explicit !== undefined) f.show_explicit = b.show_explicit ? 1 : 0;
    if (b.incognito !== undefined) { if (b.incognito && me.premium_until < now()) return E('אינקוגניטו זמין למנויי פרימיום'); f.incognito = b.incognito ? 1 : 0; }
    const keys = Object.keys(f);
    if (keys.length) await env.DB.prepare(`UPDATE users SET ${keys.map(k => k + '=?').join(',')} WHERE id=?`).bind(...keys.map(k => f[k]), me.id).run();
    const u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(me.id).first();
    return J({ user: selfUser(u) });
  }
  if (p === '/api/me' && m === 'DELETE') {
    await deleteUser(env, me.id);
    return J({ ok: true });
  }

  /* profile photo */
  if (p === '/api/me/avatar' && m === 'POST') {
    const b = await body();
    const md = await env.DB.prepare('SELECT * FROM media WHERE id=? AND owner=? AND purpose=? AND removed=0').bind(b.media, me.id, 'avatar').first();
    if (!md) return E('תמונה לא נמצאה');
    if (me.avatar && me.avatar !== md.id) { await env.DB.prepare('UPDATE media SET removed=1 WHERE id=?').bind(me.avatar).run(); ctx.waitUntil(env.MEDIA.delete('m:' + me.avatar)); }
    await env.DB.prepare('UPDATE users SET avatar=? WHERE id=?').bind(md.id, me.id).run();
    return J({ user: selfUser({ ...me, avatar: md.id }) });
  }
  if (p === '/api/me/avatar' && m === 'DELETE') {
    if (me.avatar) { await env.DB.prepare('UPDATE media SET removed=1 WHERE id=?').bind(me.avatar).run(); ctx.waitUntil(env.MEDIA.delete('m:' + me.avatar)); }
    await env.DB.prepare('UPDATE users SET avatar=NULL WHERE id=?').bind(me.id).run();
    return J({ user: selfUser({ ...me, avatar: null }) });
  }

  /* verification */
  if (p === '/api/verify/start' && m === 'POST') {
    const gestures = ['✌️ שתי אצבעות', '👍 אגודל למעלה', '🤙 אגודל וזרת', '✋ כף יד פתוחה', '👌 אוקיי', '☝️ אצבע אחת'];
    const code = String(Math.floor(1000 + Math.random() * 9000));
    const g = gestures[Math.floor(Math.random() * gestures.length)];
    const v = JSON.stringify({ code, g, at: now() });
    await env.DB.prepare('UPDATE users SET verify_code=? WHERE id=?').bind(v, me.id).run();
    return J({ code, gesture: g });
  }
  if (p === '/api/verify/submit' && m === 'POST') {
    const b = await body();
    const md = await env.DB.prepare('SELECT * FROM media WHERE id=? AND owner=? AND purpose=?').bind(b.media, me.id, 'verify').first();
    if (!md) return E('תמונה לא נמצאה');
    if (!me.verify_code) return E('התחל/י אימות מחדש');
    await env.DB.prepare('UPDATE users SET verified=1, verify_media=?, verify_note=NULL WHERE id=?').bind(md.id, me.id).run();
    return J({ ok: true });
  }

  /* users */
  if (p === '/api/users' && m === 'GET') {
    const on = await onlineSet(env);
    const bl = await blockedIds(env, me.id);
    const r = await env.DB.prepare(`SELECT * FROM users WHERE banned=0 AND hidden=0 AND id<>? AND (incognito=0) AND last_seen>? ORDER BY last_seen DESC LIMIT 300`)
      .bind(me.id, now() - 30 * 864e5).all();
    let list = r.results.filter(u => !bl.has(u.id)).map(u => publicUser(u, on.users));
    list.sort((a, b) => (b.online - a.online) || (b.last_seen - a.last_seen));
    return J({ users: list });
  }
  let mm;
  if ((mm = p.match(/^\/api\/users\/([\w]+)$/)) && m === 'GET') {
    const u = await env.DB.prepare('SELECT * FROM users WHERE id=? AND banned=0').bind(mm[1]).first();
    if (!u) return E('המשתמש לא נמצא', 404);
    const bl = await blockedIds(env, me.id);
    if (bl.has(u.id)) return E('המשתמש לא זמין', 404);
    const on = await onlineSet(env);
    const g = await env.DB.prepare('SELECT g.id,g.media,g.private FROM gallery g JOIN media m ON m.id=g.media WHERE g.owner=? AND m.removed=0 ORDER BY g.created DESC').bind(u.id).all();
    const granted = !!(await env.DB.prepare('SELECT 1 FROM grants WHERE owner=? AND viewer=?').bind(u.id, me.id).first());
    const requested = !!(await env.DB.prepare('SELECT 1 FROM gallery_requests WHERE requester=? AND owner=?').bind(me.id, u.id).first());
    const iGranted = !!(await env.DB.prepare('SELECT 1 FROM grants WHERE owner=? AND viewer=?').bind(me.id, u.id).first());
    return J({
      user: publicUser(u, on.users), granted, requested, i_granted: iGranted,
      gallery: g.results.map(x => ({ id: x.id, media: (x.private && !granted) ? null : x.media, private: !!x.private })),
    });
  }

  /* rooms */
  if (p === '/api/rooms' && m === 'GET') {
    const on = await onlineSet(env);
    const r = await env.DB.prepare('SELECT * FROM rooms WHERE hidden=0 ORDER BY official DESC, created DESC LIMIT 100').all();
    return J({ rooms: r.results.map(x => ({ ...x, online: on.rooms[x.id] || 0 })), online_total: on.users.size });
  }
  if (p === '/api/rooms' && m === 'POST') {
    const b = await body();
    const name = clean(b.name, 24);
    if (name.length < 2) return E('שם קצר מדי');
    const rid = id();
    await env.DB.prepare('INSERT INTO rooms (id,name,emo,descr,lvl,created_by,created) VALUES (?,?,?,?,?,?,?)')
      .bind(rid, name, clean(b.emo, 8) || '✨', clean(b.descr, 80), LEVELS.includes(b.lvl) ? b.lvl : 'flirt', me.id, now()).run();
    return J({ room: await env.DB.prepare('SELECT * FROM rooms WHERE id=?').bind(rid).first() });
  }
  if ((mm = p.match(/^\/api\/rooms\/([\w]+)\/messages$/))) {
    const room = await env.DB.prepare('SELECT * FROM rooms WHERE id=? AND hidden=0').bind(mm[1]).first();
    if (!room) return E('החדר לא קיים', 404);
    const bl = await blockedIds(env, me.id);
    if (m === 'GET') {
      const r = await env.DB.prepare(`SELECT rm.id,rm.text,rm.created,u.id uid,u.nick,u.emo,u.avatar,u.verified,u.gender FROM room_messages rm JOIN users u ON u.id=rm.user
        WHERE rm.room=? AND u.banned=0 ORDER BY rm.created DESC LIMIT 60`).bind(room.id).all();
      return J({ room, messages: r.results.filter(x => !bl.has(x.uid)).reverse().map(roomMsg) });
    }
    if (m === 'POST') {
      const b = await body();
      const text = clean(b.text, 500);
      if (!text) return E('הודעה ריקה');
      const msg = { id: id(), room: room.id, user: me.id, text, created: now() };
      await env.DB.prepare('INSERT INTO room_messages (id,room,user,text,created) VALUES (?,?,?,?,?)').bind(msg.id, msg.room, msg.user, msg.text, msg.created).run();
      const out = roomMsg({ ...msg, uid: me.id, nick: me.nick, emo: me.emo, avatar: me.avatar, verified: me.verified, gender: me.gender });
      ctx.waitUntil(push(env, { room: room.id, payload: { t: 'room_msg', room: room.id, msg: out } }));
      return J({ msg: out });
    }
  }

  /* DMs */
  if (p === '/api/dms' && m === 'GET') {
    const on = await onlineSet(env);
    const r = await env.DB.prepare(`SELECT d.*, u.id oid, u.nick, u.emo, u.avatar, u.verified, u.age, u.gender, u.banned,
      (SELECT COUNT(*) FROM dm_messages x WHERE x.dm=d.id AND x.sender<>? AND x.created > (CASE WHEN d.a=? THEN d.a_read ELSE d.b_read END)) unread,
      (SELECT json_object('kind',kind,'text',text,'sender',sender,'created',created) FROM dm_messages x WHERE x.dm=d.id ORDER BY created DESC LIMIT 1) last
      FROM dms d JOIN users u ON u.id = (CASE WHEN d.a=? THEN d.b ELSE d.a END)
      WHERE (d.a=? OR d.b=?) ORDER BY d.last_at DESC LIMIT 200`).bind(me.id, me.id, me.id, me.id, me.id).all();
    const bl = await blockedIds(env, me.id);
    return J({
      dms: r.results.filter(x => !bl.has(x.oid) && !x.banned).map(x => ({
        id: x.id, lvl: x.lvl, pending_lvl: x.pending_lvl, pending_by: x.pending_by, catch: !!x.catch, last_at: x.last_at, unread: x.unread,
        last: x.last ? JSON.parse(x.last) : null,
        other: { id: x.oid, nick: x.nick, emo: x.emo, avatar: x.avatar, verified: x.verified === 2, age: x.age, gender: x.gender, online: on.users.has(x.oid) },
      })),
    });
  }
  if (p === '/api/dms' && m === 'POST') {
    const b = await body();
    const other = await env.DB.prepare('SELECT * FROM users WHERE id=? AND banned=0').bind(b.to).first();
    if (!other || other.id === me.id) return E('המשתמש לא נמצא', 404);
    const bl = await blockedIds(env, me.id);
    if (bl.has(other.id)) return E('לא ניתן לשלוח הודעה למשתמש הזה', 403);
    const dm = await getOrCreateDm(env, me, other, !!b.catch, b.lvl);
    return J({ dm });
  }
  if ((mm = p.match(/^\/api\/dms\/([\w]+)(\/.*)?$/))) {
    const dm = await env.DB.prepare('SELECT * FROM dms WHERE id=? AND (a=? OR b=?)').bind(mm[1], me.id, me.id).first();
    if (!dm) return E('השיחה לא נמצאה', 404);
    const otherId = dm.a === me.id ? dm.b : dm.a;
    const sub = mm[2] || '';
    const bl = await blockedIds(env, me.id);
    const blocked = bl.has(otherId);

    if (sub === '' && m === 'GET') {
      const on = await onlineSet(env);
      const o = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(otherId).first();
      return J({ dm: { ...dm, other: publicUser(o, on.users) }, blocked });
    }
    if (sub === '/clear' && m === 'POST') {
      // Delete all content (both sides) but keep the conversation window
      await clearDmContent(env, ctx, dm.id);
      await env.DB.prepare('UPDATE dms SET pending_lvl=NULL, pending_by=NULL WHERE id=?').bind(dm.id).run();
      ctx.waitUntil(push(env, { to: [otherId, me.id], payload: { t: 'dm_cleared', dm: dm.id } }));
      return J({ ok: true });
    }
    if (sub === '' && m === 'DELETE') {
      // Removing the window itself is allowed only once it is empty (or for a throwaway catch chat)
      const any = await env.DB.prepare('SELECT 1 FROM dm_messages WHERE dm=? LIMIT 1').bind(dm.id).first();
      if (any && !dm.catch) return E('קודם מוחקים את תוכן השיחה, ואז אפשר למחוק את החלון');
      await clearDmContent(env, ctx, dm.id);
      await env.DB.prepare('DELETE FROM dms WHERE id=?').bind(dm.id).run();
      ctx.waitUntil(push(env, { to: [otherId], payload: { t: 'dm_deleted', dm: dm.id } }));
      return J({ ok: true });
    }
    if (sub === '/messages' && m === 'GET') {
      const r = await env.DB.prepare('SELECT * FROM dm_messages WHERE dm=? ORDER BY created DESC LIMIT 200').bind(dm.id).all();
      await env.DB.prepare(`UPDATE dms SET ${dm.a === me.id ? 'a_read' : 'b_read'}=? WHERE id=?`).bind(now(), dm.id).run();
      return J({ messages: r.results.reverse().map(x => dmMsg(x, me.id)) });
    }
    if (sub === '/read' && m === 'POST') {
      await env.DB.prepare(`UPDATE dms SET ${dm.a === me.id ? 'a_read' : 'b_read'}=? WHERE id=?`).bind(now(), dm.id).run();
      return J({ ok: true });
    }
    if (sub === '/messages' && m === 'POST') {
      if (blocked) return E('לא ניתן לשלוח הודעה', 403);
      const b = await body();
      const msg = { id: id(), dm: dm.id, sender: me.id, kind: 'text', text: null, media: null, explicit: 0, once: 0, viewed: 0, created: now() };
      if (b.media) {
        const theyWrote = await env.DB.prepare('SELECT 1 FROM dm_messages WHERE dm=? AND sender=? AND kind<>? LIMIT 1').bind(dm.id, otherId, 'sys').first();
        if (!theyWrote) return E('אפשר לשלוח תמונות רק אחרי שהצד השני ענה לך');
        const md = await env.DB.prepare('SELECT * FROM media WHERE id=? AND owner=? AND removed=0').bind(b.media, me.id).first();
        if (!md) return E('תמונה לא נמצאה');
        msg.kind = 'image'; msg.media = md.id; msg.explicit = b.explicit ? 1 : 0; msg.once = b.once ? 1 : 0;
        if (msg.explicit && dm.lvl !== 'x') msg.explicit = 1; // always blurred if flagged; level just informs
      } else {
        msg.text = clean(b.text, 2000);
        if (!msg.text) return E('הודעה ריקה');
      }
      await env.DB.batch([
        env.DB.prepare('INSERT INTO dm_messages (id,dm,sender,kind,text,media,explicit,once,viewed,created) VALUES (?,?,?,?,?,?,?,?,?,?)')
          .bind(msg.id, msg.dm, msg.sender, msg.kind, msg.text, msg.media, msg.explicit, msg.once, 0, msg.created),
        env.DB.prepare(`UPDATE dms SET last_at=?, ${dm.a === me.id ? 'a_read' : 'b_read'}=? WHERE id=?`).bind(msg.created, msg.created, dm.id),
      ]);
      ctx.waitUntil(push(env, { to: [otherId, me.id], payload: { t: 'dm_msg', dm: dm.id, from: { id: me.id, nick: me.nick, emo: me.emo }, msg: { ...msg, mine: false } } }));
      return J({ msg: dmMsg(msg, me.id) });
    }
    if (sub === '/level' && m === 'POST') {
      const b = await body();
      if (!LEVELS.includes(b.lvl)) return E('רמה לא תקינה');
      const ord = l => LEVELS.indexOf(l);
      let sys;
      if (ord(b.lvl) <= ord(dm.lvl)) {
        await env.DB.prepare('UPDATE dms SET lvl=?, pending_lvl=NULL, pending_by=NULL WHERE id=?').bind(b.lvl, dm.id).run();
        sys = `level:${b.lvl}`;
      } else {
        await env.DB.prepare('UPDATE dms SET pending_lvl=?, pending_by=? WHERE id=?').bind(b.lvl, me.id, dm.id).run();
        sys = `level_req:${b.lvl}`;
      }
      await sysMsg(env, ctx, dm, me.id, otherId, sys);
      return J({ ok: true });
    }
    if (sub === '/level/accept' && m === 'POST') {
      if (!dm.pending_lvl || dm.pending_by === me.id) return E('אין בקשה ממתינה');
      await env.DB.prepare('UPDATE dms SET lvl=pending_lvl, pending_lvl=NULL, pending_by=NULL WHERE id=?').bind(dm.id).run();
      await sysMsg(env, ctx, dm, me.id, otherId, `level:${dm.pending_lvl}`);
      return J({ ok: true });
    }
    if (sub === '/level/decline' && m === 'POST') {
      await env.DB.prepare('UPDATE dms SET pending_lvl=NULL, pending_by=NULL WHERE id=?').bind(dm.id).run();
      await sysMsg(env, ctx, dm, me.id, otherId, `level_no`);
      return J({ ok: true });
    }
    if (sub === '/keep' && m === 'POST') {
      await env.DB.prepare('UPDATE dms SET catch=0 WHERE id=?').bind(dm.id).run();
      return J({ ok: true });
    }
  }

  /* media */
  if (p === '/api/media' && m === 'POST') {
    const purpose = url.searchParams.get('purpose');
    if (!['chat', 'gallery', 'verify', 'avatar'].includes(purpose)) return E('purpose לא תקין');
    const mime = req.headers.get('content-type') || '';
    if (!/^image\/(jpeg|png|webp)$/.test(mime)) return E('פורמט תמונה לא נתמך');
    const buf = await req.arrayBuffer();
    if (buf.byteLength > MAX_IMG) return E('התמונה גדולה מדי');
    if (buf.byteLength < 100) return E('תמונה ריקה');
    const mid = id();
    await env.MEDIA.put('m:' + mid, buf, { metadata: { mime } });
    await env.DB.prepare('INSERT INTO media (id,owner,purpose,mime,size,created) VALUES (?,?,?,?,?,?)').bind(mid, me.id, purpose, mime, buf.byteLength, now()).run();
    return J({ id: mid });
  }
  if ((mm = p.match(/^\/api\/media\/([\w]+)$/)) && m === 'GET') {
    const md = await env.DB.prepare('SELECT * FROM media WHERE id=?').bind(mm[1]).first();
    if (!md || (md.removed && me.role !== 'admin')) return E('לא נמצא', 404);
    const ok = await canSeeMedia(env, me, md);
    if (!ok) return E('אין גישה', 403);
    const obj = await env.MEDIA.getWithMetadata('m:' + md.id, { type: 'arrayBuffer' });
    if (!obj.value) return E('לא נמצא', 404);
    return new Response(obj.value, { headers: { 'content-type': md.mime, 'cache-control': 'private, no-store' } });
  }

  /* gallery & grants */
  if (p === '/api/gallery' && m === 'GET') {
    const g = await env.DB.prepare('SELECT g.* FROM gallery g JOIN media m ON m.id=g.media WHERE g.owner=? AND m.removed=0 ORDER BY g.created DESC').bind(me.id).all();
    const gr = await env.DB.prepare('SELECT u.id,u.nick,u.emo,u.avatar FROM grants g JOIN users u ON u.id=g.viewer WHERE g.owner=?').bind(me.id).all();
    const rq = await env.DB.prepare('SELECT u.id,u.nick,u.emo,u.avatar FROM gallery_requests r JOIN users u ON u.id=r.requester WHERE r.owner=? AND u.banned=0').bind(me.id).all();
    return J({ gallery: g.results, grants: gr.results, requests: rq.results });
  }
  if (p === '/api/gallery' && m === 'POST') {
    const b = await body();
    const md = await env.DB.prepare('SELECT * FROM media WHERE id=? AND owner=? AND purpose=?').bind(b.media, me.id, 'gallery').first();
    if (!md) return E('תמונה לא נמצאה');
    const c = await env.DB.prepare('SELECT COUNT(*) n FROM gallery WHERE owner=?').bind(me.id).first();
    if (c.n >= 30) return E('הגעת למקסימום 30 תמונות');
    const gid = id();
    await env.DB.prepare('INSERT INTO gallery (id,owner,media,private,created) VALUES (?,?,?,?,?)').bind(gid, me.id, md.id, b.private === false ? 0 : 1, now()).run();
    return J({ id: gid });
  }
  if ((mm = p.match(/^\/api\/gallery\/([\w]+)$/))) {
    const g = await env.DB.prepare('SELECT * FROM gallery WHERE id=? AND owner=?').bind(mm[1], me.id).first();
    if (!g) return E('לא נמצא', 404);
    if (m === 'PATCH') { const b = await body(); await env.DB.prepare('UPDATE gallery SET private=? WHERE id=?').bind(b.private ? 1 : 0, g.id).run(); return J({ ok: true }); }
    if (m === 'DELETE') {
      await env.DB.prepare('DELETE FROM gallery WHERE id=?').bind(g.id).run();
      await env.DB.prepare('UPDATE media SET removed=1 WHERE id=?').bind(g.media).run();
      ctx.waitUntil(env.MEDIA.delete('m:' + g.media));
      return J({ ok: true });
    }
  }
  if (p === '/api/grants' && m === 'POST') {
    const b = await body();
    if (!b.to || b.to === me.id) return E('לא תקין');
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO grants (owner,viewer,created) VALUES (?,?,?)').bind(me.id, b.to, now()),
      env.DB.prepare('DELETE FROM gallery_requests WHERE requester=? AND owner=?').bind(b.to, me.id),
    ]);
    ctx.waitUntil(push(env, { to: [b.to], payload: { t: 'grant', from: { id: me.id, nick: me.nick } } }));
    return J({ ok: true });
  }
  if ((mm = p.match(/^\/api\/grants\/([\w]+)$/)) && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM grants WHERE owner=? AND viewer=?').bind(me.id, mm[1]).run();
    return J({ ok: true });
  }
  if (p === '/api/gallery-requests' && m === 'POST') {
    const b = await body();
    const o = await env.DB.prepare('SELECT id FROM users WHERE id=? AND banned=0').bind(b.to).first();
    if (!o || o.id === me.id) return E('לא תקין');
    await env.DB.prepare('INSERT OR IGNORE INTO gallery_requests (requester,owner,created) VALUES (?,?,?)').bind(me.id, o.id, now()).run();
    ctx.waitUntil(push(env, { to: [o.id], payload: { t: 'gallery_req', from: { id: me.id, nick: me.nick } } }));
    return J({ ok: true });
  }
  if ((mm = p.match(/^\/api\/gallery-requests\/([\w]+)$/)) && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM gallery_requests WHERE requester=? AND owner=?').bind(mm[1], me.id).run();
    return J({ ok: true });
  }

  /* blocks */
  if (p === '/api/blocks' && m === 'GET') {
    const r = await env.DB.prepare('SELECT u.id,u.nick,u.emo FROM blocks b JOIN users u ON u.id=b.target WHERE b.user=?').bind(me.id).all();
    return J({ blocks: r.results });
  }
  if (p === '/api/blocks' && m === 'POST') {
    const b = await body();
    if (!b.target || b.target === me.id) return E('לא תקין');
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO blocks (user,target,created) VALUES (?,?,?)').bind(me.id, b.target, now()),
      env.DB.prepare('DELETE FROM grants WHERE (owner=? AND viewer=?) OR (owner=? AND viewer=?)').bind(me.id, b.target, b.target, me.id),
    ]);
    return J({ ok: true });
  }
  if ((mm = p.match(/^\/api\/blocks\/([\w]+)$/)) && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM blocks WHERE user=? AND target=?').bind(me.id, mm[1]).run();
    return J({ ok: true });
  }

  /* reports */
  if (p === '/api/reports' && m === 'POST') {
    const b = await body();
    if (!REASONS.includes(b.reason)) return E('סיבה לא תקינה');
    const t = await env.DB.prepare('SELECT id FROM users WHERE id=?').bind(b.target).first();
    if (!t || t.id === me.id) return E('לא תקין');
    const prio = ['minor', 'ncii', 'trafficking'].includes(b.reason) ? 2 : ['harass', 'scam', 'avatar'].includes(b.reason) ? 1 : 0;
    await env.DB.prepare('INSERT INTO reports (id,reporter,target,reason,details,dm,media,priority,created) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(id(), me.id, t.id, b.reason, clean(b.details, 1000), b.dm || null, b.media || null, prio, now()).run();
    // Immediate protective actions, pending human review
    if (b.reason === 'ncii' && b.media) {
      await env.DB.prepare('UPDATE media SET removed=1 WHERE id=? AND owner=?').bind(b.media, t.id).run();
      await env.DB.prepare('UPDATE users SET avatar=NULL WHERE id=? AND avatar=?').bind(t.id, b.media).run();
    }
    if (b.reason === 'minor') await env.DB.prepare('UPDATE users SET hidden=1 WHERE id=?').bind(t.id).run();
    if (b.block) await env.DB.prepare('INSERT OR IGNORE INTO blocks (user,target,created) VALUES (?,?,?)').bind(me.id, t.id, now()).run();
    return J({ ok: true });
  }

  /* calls */
  if ((mm = p.match(/^\/api\/call\/([\w]+)$/)) && m === 'GET') {
    return J(await callCheck(env, me, mm[1]));
  }

  /* admin */
  if (p.startsWith('/api/admin/')) {
    if (me.role !== 'admin') return E('אין הרשאה', 403);
    return admin(req, env, url, p, m, me, body, ctx);
  }

  return E('לא נמצא', 404);
}

function roomMsg(x) {
  return { id: x.id, text: x.text, created: x.created, user: { id: x.uid, nick: x.nick, emo: x.emo, avatar: x.avatar || null, verified: x.verified === 2, gender: x.gender } };
}
function dmMsg(x, uid) {
  return { id: x.id, kind: x.kind, text: x.text, media: (x.once && x.viewed && x.sender !== uid) ? null : x.media, explicit: !!x.explicit, once: !!x.once, viewed: !!x.viewed, created: x.created, mine: x.sender === uid, sender: x.sender };
}
async function sysMsg(env, ctx, dm, from, to, text) {
  const msg = { id: id(), dm: dm.id, sender: from, kind: 'sys', text, created: now() };
  await env.DB.prepare('INSERT INTO dm_messages (id,dm,sender,kind,text,created) VALUES (?,?,?,?,?,?)').bind(msg.id, dm.id, from, 'sys', text, msg.created).run();
  ctx.waitUntil(push(env, { to: [from, to], payload: { t: 'dm_update', dm: dm.id, msg } }));
}
export async function getOrCreateDm(env, me, other, isCatch, lvl) {
  const [a, b] = [me.id, other.id].sort();
  let dm = await env.DB.prepare('SELECT * FROM dms WHERE a=? AND b=?').bind(a, b).first();
  if (dm) return dm;
  const ord = l => LEVELS.indexOf(l);
  const start = LEVELS.includes(lvl) ? lvl : LEVELS[Math.min(ord(me.lvl), ord(other.lvl), 1)];
  const did = id();
  await env.DB.prepare('INSERT INTO dms (id,a,b,lvl,catch,last_at,created) VALUES (?,?,?,?,?,?,?)').bind(did, a, b, start, isCatch ? 1 : 0, now(), now()).run();
  return env.DB.prepare('SELECT * FROM dms WHERE id=?').bind(did).first();
}
async function clearDmContent(env, ctx, dmId) {
  const media = await env.DB.prepare('SELECT media FROM dm_messages WHERE dm=? AND media IS NOT NULL').bind(dmId).all();
  const st = [env.DB.prepare('DELETE FROM dm_messages WHERE dm=?').bind(dmId)];
  for (const x of media.results) st.push(env.DB.prepare('UPDATE media SET removed=1 WHERE id=?').bind(x.media));
  await env.DB.batch(st);
  ctx.waitUntil(Promise.all(media.results.map(x => env.MEDIA.delete('m:' + x.media))));
}
async function canSeeMedia(env, me, md) {
  if (md.owner === me.id || me.role === 'admin') return true;
  if (md.purpose === 'verify') return false;
  if (md.purpose === 'avatar') {
    const blk = await env.DB.prepare('SELECT 1 FROM blocks WHERE (user=? AND target=?) OR (user=? AND target=?)').bind(me.id, md.owner, md.owner, me.id).first();
    return !blk;
  }
  if (md.purpose === 'gallery') {
    const g = await env.DB.prepare('SELECT * FROM gallery WHERE media=?').bind(md.id).first();
    if (!g) return false;
    if (await env.DB.prepare('SELECT 1 FROM blocks WHERE (user=? AND target=?) OR (user=? AND target=?)').bind(me.id, g.owner, g.owner, me.id).first()) return false;
    if (!g.private) return true;
    return !!(await env.DB.prepare('SELECT 1 FROM grants WHERE owner=? AND viewer=?').bind(g.owner, me.id).first());
  }
  // chat: must be the receiving participant
  const msg = await env.DB.prepare('SELECT m.*, d.a, d.b FROM dm_messages m JOIN dms d ON d.id=m.dm WHERE m.media=?').bind(md.id).first();
  if (!msg || (msg.a !== me.id && msg.b !== me.id)) return false;
  if (msg.once) {
    if (msg.viewed) return false;
    await env.DB.prepare('UPDATE dm_messages SET viewed=1 WHERE id=?').bind(msg.id).run();
  }
  return true;
}
export async function callCheck(env, me, otherId) {
  if (me.premium_until < now()) return { ok: false, reason: 'premium' };
  if (me.verified !== 2) return { ok: false, reason: 'verify' };
  const o = await env.DB.prepare('SELECT * FROM users WHERE id=? AND banned=0').bind(otherId).first();
  if (!o) return { ok: false, reason: 'notfound' };
  if (o.verified !== 2) return { ok: false, reason: 'other_unverified' };
  const bl = await env.DB.prepare('SELECT 1 FROM blocks WHERE (user=? AND target=?) OR (user=? AND target=?)').bind(me.id, o.id, o.id, me.id).first();
  if (bl) return { ok: false, reason: 'blocked' };
  return { ok: true, other: { id: o.id, nick: o.nick, emo: o.emo } };
}
async function deleteUser(env, uid) {
  const media = await env.DB.prepare('SELECT id FROM media WHERE owner=?').bind(uid).all();
  const dms = await env.DB.prepare('SELECT id FROM dms WHERE a=? OR b=?').bind(uid, uid).all();
  const st = [
    env.DB.prepare('DELETE FROM room_messages WHERE user=?').bind(uid),
    env.DB.prepare('DELETE FROM gallery WHERE owner=?').bind(uid),
    env.DB.prepare('DELETE FROM grants WHERE owner=? OR viewer=?').bind(uid, uid),
    env.DB.prepare('DELETE FROM gallery_requests WHERE owner=? OR requester=?').bind(uid, uid),
    env.DB.prepare('DELETE FROM blocks WHERE user=? OR target=?').bind(uid, uid),
    env.DB.prepare('DELETE FROM media WHERE owner=?').bind(uid),
    env.DB.prepare('DELETE FROM users WHERE id=?').bind(uid),
  ];
  for (const d of dms.results) { st.push(env.DB.prepare('DELETE FROM dm_messages WHERE dm=?').bind(d.id)); st.push(env.DB.prepare('DELETE FROM dms WHERE id=?').bind(d.id)); }
  await env.DB.batch(st);
  for (const x of media.results) await env.MEDIA.delete('m:' + x.id);
}

/* ---------- admin ---------- */
async function admin(req, env, url, p, m, me, body, ctx) {
  let mm;
  if (p === '/api/admin/stats') {
    const on = await onlineSet(env);
    const day = now() - 864e5;
    const q = s => env.DB.prepare(s).first();
    const [users, newUsers, premium, verified, pendingV, openR, urgentR, msgs, dmsg, media, banned] = await Promise.all([
      q('SELECT COUNT(*) n FROM users'), q(`SELECT COUNT(*) n FROM users WHERE created>${day}`), q(`SELECT COUNT(*) n FROM users WHERE premium_until>${now()}`),
      q('SELECT COUNT(*) n FROM users WHERE verified=2'), q('SELECT COUNT(*) n FROM users WHERE verified=1'),
      q(`SELECT COUNT(*) n FROM reports WHERE status='open'`), q(`SELECT COUNT(*) n FROM reports WHERE status='open' AND priority=2`),
      q(`SELECT COUNT(*) n FROM room_messages WHERE created>${day}`), q(`SELECT COUNT(*) n FROM dm_messages WHERE created>${day}`),
      q(`SELECT COUNT(*) n FROM media WHERE created>${day}`), q('SELECT COUNT(*) n FROM users WHERE banned=1'),
    ]);
    return J({ online: on.users.size, users: users.n, new_users: newUsers.n, premium: premium.n, verified: verified.n, pending_verifications: pendingV.n,
      open_reports: openR.n, urgent_reports: urgentR.n, room_msgs_24h: msgs.n, dm_msgs_24h: dmsg.n, media_24h: media.n, banned: banned.n, rooms_online: on.rooms });
  }
  if (p === '/api/admin/reports' && m === 'GET') {
    const st = url.searchParams.get('status') || 'open';
    const r = await env.DB.prepare(`SELECT r.*, t.nick t_nick, t.emo t_emo, t.banned t_banned, t.hidden t_hidden, rp.nick r_nick,
      (SELECT COUNT(*) FROM reports x WHERE x.target=r.target) t_reports
      FROM reports r JOIN users t ON t.id=r.target LEFT JOIN users rp ON rp.id=r.reporter WHERE r.status=? ORDER BY r.priority DESC, r.created DESC LIMIT 200`).bind(st).all();
    return J({ reports: r.results });
  }
  if ((mm = p.match(/^\/api\/admin\/reports\/([\w]+)$/)) && m === 'GET') {
    const r = await env.DB.prepare('SELECT * FROM reports WHERE id=?').bind(mm[1]).first();
    if (!r) return E('לא נמצא', 404);
    let context = [];
    if (r.dm) {
      const x = await env.DB.prepare('SELECT * FROM dm_messages WHERE dm=? ORDER BY created DESC LIMIT 30').bind(r.dm).all();
      context = x.results.reverse();
    }
    const media = (await env.DB.prepare('SELECT id,purpose,removed,created FROM media WHERE owner=? ORDER BY created DESC LIMIT 24').bind(r.target).all()).results;
    return J({ report: r, context, media });
  }
  if ((mm = p.match(/^\/api\/admin\/reports\/([\w]+)$/)) && m === 'POST') {
    const b = await body();
    const r = await env.DB.prepare('SELECT * FROM reports WHERE id=?').bind(mm[1]).first();
    if (!r) return E('לא נמצא', 404);
    const st = [];
    if (b.action === 'ban') {
      st.push(env.DB.prepare('UPDATE users SET banned=1, ban_reason=? WHERE id=?').bind(clean(b.note, 200) || r.reason, r.target));
      st.push(env.DB.prepare(`UPDATE reports SET status='resolved', resolution='ban' WHERE target=? AND status='open'`).bind(r.target));
      ctx.waitUntil(push(env, { kick: r.target }));
    } else if (b.action === 'remove_media') {
      if (r.media) st.push(env.DB.prepare('UPDATE media SET removed=1 WHERE id=?').bind(r.media));
      st.push(env.DB.prepare(`UPDATE reports SET status='resolved', resolution='remove_media' WHERE id=?`).bind(r.id));
    } else if (b.action === 'dismiss') {
      st.push(env.DB.prepare(`UPDATE reports SET status='dismissed', resolution=? WHERE id=?`).bind(clean(b.note, 200) || 'dismiss', r.id));
      if (r.reason === 'minor') st.push(env.DB.prepare('UPDATE users SET hidden=0 WHERE id=?').bind(r.target));
      if (r.reason === 'ncii' && r.media && b.restore) st.push(env.DB.prepare('UPDATE media SET removed=0 WHERE id=?').bind(r.media));
    } else return E('פעולה לא תקינה');
    await env.DB.batch(st);
    await log(env, me.id, 'report_' + b.action, r.target, { report: r.id, note: b.note });
    return J({ ok: true });
  }
  if (p === '/api/admin/verifications' && m === 'GET') {
    const r = await env.DB.prepare('SELECT id,nick,emo,avatar,age,gender,area,bio,verify_code,verify_media,created FROM users WHERE verified=1 ORDER BY created ASC LIMIT 100').all();
    return J({ verifications: r.results.map(x => ({ ...x, verify_code: x.verify_code ? JSON.parse(x.verify_code) : null })) });
  }
  if ((mm = p.match(/^\/api\/admin\/verifications\/([\w]+)$/)) && m === 'POST') {
    const b = await body();
    const u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(mm[1]).first();
    if (!u) return E('לא נמצא', 404);
    if (b.approve) {
      const g = GENDERS.includes(b.gender) ? b.gender : u.gender;
      await env.DB.prepare('UPDATE users SET verified=2, verified_gender=?, gender=?, verify_note=NULL, verify_code=NULL WHERE id=?').bind(g, g, u.id).run();
      ctx.waitUntil(push(env, { to: [u.id], payload: { t: 'verified', ok: true } }));
    } else {
      await env.DB.prepare('UPDATE users SET verified=3, verify_note=?, verify_code=NULL WHERE id=?').bind(clean(b.note, 200) || 'התמונה לא עמדה בדרישות', u.id).run();
      ctx.waitUntil(push(env, { to: [u.id], payload: { t: 'verified', ok: false, note: b.note } }));
      if (b.underage) {
        await env.DB.prepare('UPDATE users SET banned=1, ban_reason=? WHERE id=?').bind('נראה מתחת לגיל 18', u.id).run();
        ctx.waitUntil(push(env, { kick: u.id }));
      }
    }
    await log(env, me.id, b.approve ? 'verify_approve' : 'verify_reject', u.id, { note: b.note, underage: !!b.underage });
    return J({ ok: true });
  }
  if (p === '/api/admin/users' && m === 'GET') {
    const q = clean(url.searchParams.get('q'), 30).toLowerCase();
    const f = url.searchParams.get('filter') || '';
    let where = '1=1';
    if (f === 'banned') where = 'banned=1'; else if (f === 'premium') where = `premium_until>${now()}`; else if (f === 'hidden') where = 'hidden=1'; else if (f === 'admin') where = `role='admin'`;
    const r = await env.DB.prepare(`SELECT id,nick,emo,avatar,age,gender,area,role,verified,premium_until,banned,ban_reason,hidden,created,last_seen,
      (SELECT COUNT(*) FROM reports x WHERE x.target=users.id) reports FROM users WHERE ${where} AND nick_lc LIKE ? ORDER BY last_seen DESC LIMIT 200`).bind('%' + q + '%').all();
    const on = await onlineSet(env);
    return J({ users: r.results.map(u => ({ ...u, online: on.users.has(u.id) })) });
  }
  if ((mm = p.match(/^\/api\/admin\/users\/([\w]+)$/)) && m === 'POST') {
    const b = await body();
    const u = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(mm[1]).first();
    if (!u) return E('לא נמצא', 404);
    const a = b.action;
    if (a === 'ban') { await env.DB.prepare('UPDATE users SET banned=1, ban_reason=? WHERE id=?').bind(clean(b.note, 200) || 'הפרת כללים', u.id).run(); ctx.waitUntil(push(env, { kick: u.id })); }
    else if (a === 'unban') await env.DB.prepare('UPDATE users SET banned=0, ban_reason=NULL WHERE id=?').bind(u.id).run();
    else if (a === 'premium') { const days = Math.max(0, Math.min(3650, parseInt(b.days) || 0)); const base = Math.max(now(), u.premium_until); await env.DB.prepare('UPDATE users SET premium_until=? WHERE id=?').bind(days ? base + days * 864e5 : 0, u.id).run(); }
    else if (a === 'admin' || a === 'unadmin') { if (u.id === me.id) return E('לא ניתן לשנות לעצמך'); await env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(a === 'admin' ? 'admin' : 'user', u.id).run(); }
    else if (a === 'unhide') await env.DB.prepare('UPDATE users SET hidden=0 WHERE id=?').bind(u.id).run();
    else if (a === 'unverify') await env.DB.prepare('UPDATE users SET verified=0, verified_gender=NULL WHERE id=?').bind(u.id).run();
    else if (a === 'delete') { if (u.id === me.id) return E('לא ניתן למחוק את עצמך מכאן'); await deleteUser(env, u.id); ctx.waitUntil(push(env, { kick: u.id })); }
    else return E('פעולה לא תקינה');
    await log(env, me.id, 'user_' + a, u.id, b);
    return J({ ok: true });
  }
  if (p === '/api/admin/media' && m === 'GET') {
    const r = await env.DB.prepare(`SELECT m.*, u.nick FROM media m JOIN users u ON u.id=m.owner WHERE m.removed=0 AND m.purpose<>'verify' ORDER BY m.created DESC LIMIT 120`).all();
    return J({ media: r.results });
  }
  if ((mm = p.match(/^\/api\/admin\/media\/([\w]+)$/)) && m === 'POST') {
    const b = await body();
    await env.DB.prepare('UPDATE media SET removed=? WHERE id=?').bind(b.restore ? 0 : 1, mm[1]).run();
    if (!b.restore) await env.DB.prepare('UPDATE users SET avatar=NULL WHERE avatar=?').bind(mm[1]).run();
    await log(env, me.id, b.restore ? 'media_restore' : 'media_remove', mm[1]);
    return J({ ok: true });
  }
  if (p === '/api/admin/rooms' && m === 'GET') {
    const on = await onlineSet(env);
    const r = await env.DB.prepare(`SELECT r.*, (SELECT COUNT(*) FROM room_messages x WHERE x.room=r.id AND x.created>${now() - 864e5}) msgs_24h, u.nick creator FROM rooms r LEFT JOIN users u ON u.id=r.created_by ORDER BY r.official DESC, r.created DESC`).all();
    return J({ rooms: r.results.map(x => ({ ...x, online: on.rooms[x.id] || 0 })) });
  }
  if (p === '/api/admin/rooms' && m === 'POST') {
    const b = await body();
    const name = clean(b.name, 24);
    if (name.length < 2) return E('שם קצר מדי');
    const rid = id();
    await env.DB.prepare('INSERT INTO rooms (id,name,emo,descr,lvl,official,created_by,created) VALUES (?,?,?,?,?,1,?,?)').bind(rid, name, clean(b.emo, 8) || '✨', clean(b.descr, 80), LEVELS.includes(b.lvl) ? b.lvl : 'flirt', me.id, now()).run();
    return J({ ok: true });
  }
  if ((mm = p.match(/^\/api\/admin\/rooms\/([\w]+)$/)) && m === 'POST') {
    const b = await body();
    const rid = mm[1];
    if (b.action === 'hide') await env.DB.prepare('UPDATE rooms SET hidden=1 WHERE id=?').bind(rid).run();
    else if (b.action === 'unhide') await env.DB.prepare('UPDATE rooms SET hidden=0 WHERE id=?').bind(rid).run();
    else if (b.action === 'official') await env.DB.prepare('UPDATE rooms SET official=1-official WHERE id=?').bind(rid).run();
    else if (b.action === 'clear') await env.DB.prepare('DELETE FROM room_messages WHERE room=?').bind(rid).run();
    else if (b.action === 'delete') await env.DB.batch([env.DB.prepare('DELETE FROM room_messages WHERE room=?').bind(rid), env.DB.prepare('DELETE FROM rooms WHERE id=?').bind(rid)]);
    else return E('פעולה לא תקינה');
    await log(env, me.id, 'room_' + b.action, rid);
    return J({ ok: true });
  }
  if ((mm = p.match(/^\/api\/admin\/room-messages\/([\w]+)$/)) && m === 'DELETE') {
    await env.DB.prepare('DELETE FROM room_messages WHERE id=?').bind(mm[1]).run();
    return J({ ok: true });
  }
  if (p === '/api/admin/log' && m === 'GET') {
    const r = await env.DB.prepare('SELECT l.*, u.nick admin_nick FROM admin_log l LEFT JOIN users u ON u.id=l.admin ORDER BY l.created DESC LIMIT 200').all();
    return J({ log: r.results });
  }
  return E('לא נמצא', 404);
}
