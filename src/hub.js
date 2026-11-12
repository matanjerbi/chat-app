import { getOrCreateDm, callCheck } from './index.js';

const pairKey = (a, b) => 'call:' + [a, b].sort().join(':');

export class Hub {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }
  send(ws, o) { try { ws.send(JSON.stringify(o)); } catch (e) {} }
  toUser(uid, o) { for (const ws of this.ctx.getWebSockets(uid)) this.send(ws, o); }
  isOnline(uid) { return this.ctx.getWebSockets(uid).length > 0; }

  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname === '/ws') {
      const uid = req.headers.get('x-uid');
      if (!uid) return new Response('no uid', { status: 400 });
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server, [uid]);
      server.serializeAttachment({ uid, rooms: [], catch: null });
      this.send(server, { t: 'hello' });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (u.pathname === '/online') {
      const users = new Set(); const rooms = {};
      for (const ws of this.ctx.getWebSockets()) {
        const a = ws.deserializeAttachment(); if (!a) continue;
        users.add(a.uid);
        for (const r of a.rooms || []) rooms[r] = (rooms[r] || 0) + 1;
      }
      return Response.json({ users: [...users], rooms });
    }
    if (u.pathname === '/push') {
      const b = await req.json();
      if (b.kick) for (const ws of this.ctx.getWebSockets(b.kick)) { this.send(ws, { t: 'kicked' }); try { ws.close(4003, 'banned'); } catch (e) {} }
      if (b.to) for (const id of new Set(b.to)) this.toUser(id, b.payload);
      if (b.room) for (const ws of this.ctx.getWebSockets()) {
        const a = ws.deserializeAttachment();
        if (a && a.rooms.includes(b.room)) this.send(ws, b.payload);
      }
      return new Response('ok');
    }
    return new Response('not found', { status: 404 });
  }

  async webSocketMessage(ws, raw) {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    const a = ws.deserializeAttachment(); if (!a) return;
    const uid = a.uid;
    switch (m.t) {
      case 'ping': this.send(ws, { t: 'pong' }); break;
      case 'join':
        if (typeof m.room === 'string') { a.rooms = [...new Set([...a.rooms, m.room])].slice(-5); ws.serializeAttachment(a); }
        break;
      case 'leave':
        a.rooms = a.rooms.filter(r => r !== m.room); ws.serializeAttachment(a); break;
      case 'typing':
        if (m.to && m.dm) this.toUser(m.to, { t: 'typing', dm: m.dm, from: uid });
        break;
      case 'catch': await this.doCatch(ws, a, m); break;
      case 'catch_cancel': a.catch = null; ws.serializeAttachment(a); break;

      case 'call': {
        const me = await this.env.DB.prepare('SELECT * FROM users WHERE id=?').bind(uid).first();
        if (!me || me.banned) return;
        const chk = await callCheck(this.env, me, m.to);
        if (!chk.ok) return this.send(ws, { t: 'call_error', reason: chk.reason });
        if (!this.isOnline(m.to)) return this.send(ws, { t: 'call_error', reason: 'offline' });
        await this.ctx.storage.put(pairKey(uid, m.to), { caller: uid, at: Date.now() });
        this.toUser(m.to, { t: 'call_in', from: { id: me.id, nick: me.nick, emo: me.emo } });
        this.send(ws, { t: 'call_ringing', to: m.to });
        break;
      }
      case 'call_accept': {
        const c = await this.ctx.storage.get(pairKey(uid, m.to));
        if (c) this.toUser(m.to, { t: 'call_accepted', from: uid });
        break;
      }
      case 'call_decline':
      case 'call_end':
        await this.ctx.storage.delete(pairKey(uid, m.to));
        this.toUser(m.to, { t: m.t === 'call_end' ? 'call_ended' : 'call_declined', from: uid });
        break;
      case 'rtc': {
        const c = await this.ctx.storage.get(pairKey(uid, m.to));
        if (c) this.toUser(m.to, { t: 'rtc', from: uid, data: m.data });
        break;
      }
    }
  }

  async doCatch(ws, a, m) {
    const env = this.env;
    const me = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(a.uid).first();
    if (!me || me.banned) return;
    const want = { g: ['all', 'm', 'f', 'nb', 'c'].includes(m.g) ? m.g : 'all', lvl: ['soft', 'flirt', 'x'].includes(m.lvl) ? m.lvl : 'flirt', gender: me.gender, at: Date.now() };
    const blocks = await env.DB.prepare('SELECT target x FROM blocks WHERE user=? UNION SELECT user x FROM blocks WHERE target=?').bind(me.id, me.id).all();
    const bl = new Set(blocks.results.map(x => x.x));
    let match = null;
    for (const other of this.ctx.getWebSockets()) {
      const oa = other.deserializeAttachment();
      if (!oa || !oa.catch || oa.uid === me.id || bl.has(oa.uid)) continue;
      const c = oa.catch;
      if (c.lvl !== want.lvl) continue;
      if (want.g !== 'all' && want.g !== c.gender) continue;
      if (c.g !== 'all' && c.g !== want.gender) continue;
      if (Date.now() - c.at > 10 * 60000) continue;
      match = { ws: other, a: oa }; break;
    }
    if (!match) { a.catch = want; ws.serializeAttachment(a); this.send(ws, { t: 'catch_wait' }); return; }
    match.a.catch = null; match.ws.serializeAttachment(match.a);
    a.catch = null; ws.serializeAttachment(a);
    const other = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(match.a.uid).first();
    if (!other || other.banned) { a.catch = want; ws.serializeAttachment(a); return; }
    const dm = await getOrCreateDm(env, me, other, true, want.lvl);
    const pub = u => ({ id: u.id, nick: u.nick, emo: u.emo, age: u.age, gender: u.gender, verified: u.verified === 2 });
    this.toUser(me.id, { t: 'catch_match', dm: dm.id, other: pub(other), lvl: want.lvl });
    this.toUser(other.id, { t: 'catch_match', dm: dm.id, other: pub(me), lvl: want.lvl });
  }

  async webSocketClose(ws) {
    const a = ws.deserializeAttachment();
    try { ws.close(); } catch (e) {}
    if (!a) return;
    if (this.ctx.getWebSockets(a.uid).filter(x => x !== ws).length === 0) {
      const all = await this.ctx.storage.list({ prefix: 'call:' });
      for (const [k] of all) if (k.includes(a.uid)) {
        await this.ctx.storage.delete(k);
        const other = k.slice(5).split(':').find(x => x !== a.uid);
        if (other) this.toUser(other, { t: 'call_ended', from: a.uid });
      }
    }
  }
  async webSocketError(ws) { return this.webSocketClose(ws); }
}
