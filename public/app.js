/* Blush — client */
'use strict';
const AREAS = ["תל אביב והמרכז", "ירושלים", "חיפה והצפון", "השרון", "השפלה", "באר שבע והדרום", "אילת"];
const LOOK = [["talk", "💬 שיחה"], ["friends", "🤝 חברים"], ["date", "🌹 דייט"], ["flirt", "😏 פלרטוט"], ["casual", "🔥 קשר קליל"], ["sexting", "🌶️ סקסטינג"]];
const LEVELS = [["soft", "☕", "רגוע", "רק שיחה"], ["flirt", "😏", "פלרטוט", "רמזים ושובבות"], ["x", "🌶️", "מפורש", "הכול בין מבוגרים"]];
const GLBL = { m: "גבר", f: "אישה", nb: "א-בינארי", c: "זוג" };
const COLORS = ["#ff4f8b", "#9b5cff", "#ff8a5c", "#3ddc97", "#5cc8ff", "#ffc25c", "#e85cff", "#ff5d7a"];
const ICE = ["מה הדבר הכי ספונטני שעשית?", "איך נראה הערב המושלם שלך?", "חתול או כלב?", "מה תופס אותך במישהו?", "שיר שמכניס אותך למצב רוח?", "הדבר הכי מצחיק שקרה לך החודש?", "חופשת חלומות — איפה?"];
const EMOJIS = ["😎", "🦊", "🐺", "🦋", "🌙", "🔥", "🍒", "🎭", "👻", "🐱", "🌶️", "💫", "🦄", "🍑", "😈", "🌹", "🎧", "🌊", "🦁", "🌸"];
const REASONS = [["minor", "נראה/ית מתחת לגיל 18"], ["ncii", "תמונה שלי שפורסמה בלי רשותי"], ["avatar", "תמונת פרופיל לא הולמת / עירום"], ["harass", "הטרדה או איומים"], ["unsolicited", "שליחת תוכן מפורש בלי הסכמה"], ["fake", "מתחזה / פרופיל מזויף"], ["scam", "הונאה / בקשת כסף"], ["trafficking", "זנות או סחר בבני אדם"], ["other", "אחר"]];
const PLANS = [{ id: "w", name: "שבועי", price: 19, per: "לשבוע" }, { id: "m", name: "חודשי", price: 49, per: "לחודש", hot: 1 }, { id: "y", name: "שנתי", price: 299, per: "לשנה", save: "חיסכון של 49%" }];

/* ---------- state ---------- */
let TOKEN = null; try { TOKEN = localStorage.getItem('blush_token'); } catch (e) {}
let ME = null, ROOMS = [], ONLINE = 0, USERS = [], DMS = [], GAL = { gallery: [], grants: [], requests: [] };
let tab = 'rooms', view = null; // view: {t:'room'|'chat', id}
let roomMsgs = {}, dmMsgs = {}, dmInfo = {};
let filters = { g: 'all', area: -1, online: false, ver: false, lvl: 'all' };
let catchPref = { g: 'all', lvl: 'flirt' }, catching = false;
let ws = null, wsOk = false, wsRetry = 0;
const mediaCache = {};

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const color = id => COLORS[[...String(id)].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const isPrem = () => ME && ME.premium;
const ago = t => { const s = (Date.now() - t) / 1000; if (s < 60) return 'עכשיו'; if (s < 3600) return `לפני ${Math.floor(s / 60)} דק׳`; if (s < 86400) return `לפני ${Math.floor(s / 3600)} שע׳`; return `לפני ${Math.floor(s / 86400)} ימים`; };
const hhmm = t => new Date(t).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; $("#app").appendChild(d); setTimeout(() => d.remove(), 2800); }
function av(u, size = 46, dot = true) { const c = color(u.id); return `<div class="av" style="width:${size}px;height:${size}px;font-size:${size * .48}px;background:${c}33;border:2px solid ${c}">${esc(u.emo || '🙂')}${u.avatar ? `<div class="avimg" data-media="${u.avatar}"></div>` : ''}${dot && u.online ? '<i class="dot"></i>' : ''}</div>`; }
function lvlTag(l) { return l === "x" ? '<span class="tag x">🌶️ מפורש</span>' : l === "flirt" ? '<span class="tag f">😏 פלרטוט</span>' : '<span class="tag">☕ רגוע</span>'; }
function vb(u) { return u.verified ? '<span class="ver" title="מאומת/ת">✔</span>' : ''; }

/* ---------- API ---------- */
async function api(path, opt = {}) {
  const h = opt.headers || {};
  if (TOKEN) h.authorization = 'Bearer ' + TOKEN;
  let body = opt.body;
  if (body && !(body instanceof Blob) && typeof body !== 'string') { body = JSON.stringify(body); h['content-type'] = 'application/json'; }
  const r = await fetch('/api' + path, { method: opt.method || (body ? 'POST' : 'GET'), headers: h, body });
  let d = {}; try { d = await r.json(); } catch (e) {}
  if (r.status === 401 && TOKEN) { logoutLocal(); throw new Error('נותקת'); }
  if (r.status === 403 && d.banned) { showBanned(d.reason); throw new Error('banned'); }
  if (r.status === 403 && d.need_account) { accountSheet(); const e = new Error(d.error); e.handled = true; throw e; }
  if (!r.ok) throw new Error(d.error || 'שגיאה');
  return d;
}
const mediaPending = {};
async function mediaUrl(id) {
  if (!id) return null;
  if (mediaCache[id]) return mediaCache[id];
  if (mediaPending[id]) return mediaPending[id];
  return (mediaPending[id] = (async () => {
    try {
      for (let i = 0; i < 3; i++) { // a freshly uploaded image can take a moment to be readable everywhere
        const r = await fetch('/api/media/' + id, { headers: { authorization: 'Bearer ' + TOKEN } });
        if (r.ok) return (mediaCache[id] = URL.createObjectURL(await r.blob()));
        if (r.status !== 404) return null;
        await new Promise(res => setTimeout(res, 1200 * (i + 1)));
      }
      return null;
    } finally { delete mediaPending[id]; }
  })());
}
function hydrateImgs(root = document) {
  root.querySelectorAll('[data-media]:not([data-loaded])').forEach(async el => {
    el.dataset.loaded = 1;
    const u = await mediaUrl(el.dataset.media);
    if (u) el.style.backgroundImage = `url("${u}")`; else el.classList.add('gone');
  });
}
async function compress(file, max = 1280) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  URL.revokeObjectURL(img.src);
  // re-encoding through canvas strips all EXIF / GPS metadata
  return new Promise(res => c.toBlob(res, 'image/jpeg', 0.82));
}
async function upload(file, purpose) {
  const blob = await compress(file);
  const d = await api('/media?purpose=' + purpose, { method: 'POST', body: blob, headers: { 'content-type': 'image/jpeg' } });
  return d.id;
}
function pickFile(cam) {
  return new Promise(res => {
    const inp = cam ? $('#camPick') : $('#filePick');
    inp.value = ''; inp.onchange = () => res(inp.files[0] || null); inp.click();
  });
}

/* ---------- websocket ---------- */
function connectWS() {
  if (!TOKEN) return;
  try { ws && ws.close(); } catch (e) {}
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/api/ws?token=' + encodeURIComponent(TOKEN));
  ws.onopen = () => { wsOk = true; wsRetry = 0; $('.conn') && $('.conn').remove(); if (view && view.t === 'room') wsSend({ t: 'join', room: view.id }); };
  ws.onclose = e => { wsOk = false; if (e.code === 4003) return showBanned(); setTimeout(connectWS, Math.min(15000, 1000 * 2 ** wsRetry++)); };
  ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (x) { return; } onWS(m); };
}
setInterval(() => wsSend({ t: 'ping' }), 25000);
function wsSend(o) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); }

function onWS(m) {
  switch (m.t) {
    case 'room_msg':
      if (roomMsgs[m.room] && !roomMsgs[m.room].some(x => x.id === m.msg.id)) { roomMsgs[m.room].push(m.msg); if (roomMsgs[m.room].length > 200) roomMsgs[m.room].shift(); if (view && view.id === m.room) refreshRoom(); }
      break;
    case 'dm_msg': {
      const mine = m.from.id === ME.id;
      const msg = { ...m.msg, mine, media: m.msg.media };
      if (dmMsgs[m.dm] && !dmMsgs[m.dm].some(x => x.id === msg.id)) dmMsgs[m.dm].push(msg);
      if (view && view.t === 'chat' && view.id === m.dm) { refreshChat(); if (!mine) api(`/dms/${m.dm}/read`, { method: 'POST' }).catch(() => {}); }
      else if (!mine) { notify(`💬 ${m.from.nick}`, msg.kind === 'image' ? '📷 תמונה' : msg.text); }
      if (!mine) loadDms();
      break;
    }
    case 'dm_update':
      if (dmMsgs[m.dm]) dmMsgs[m.dm].push({ ...m.msg, mine: m.msg.sender === ME.id });
      api('/dms/' + m.dm).then(d => { dmInfo[m.dm] = d.dm; if (view && view.id === m.dm) openView(view, true); }).catch(() => {});
      break;
    case 'dm_cleared':
      dmMsgs[m.dm] = [];
      { const d = DMS.find(x => x.id === m.dm); if (d) { d.last = null; d.unread = 0; } }
      if (view && view.t === 'chat' && view.id === m.dm) openView(view, true); else if (tab === 'chats' && !view) $('#main').innerHTML = tabHtml();
      break;
    case 'dm_deleted':
      delete dmMsgs[m.dm]; DMS = DMS.filter(x => x.id !== m.dm);
      if (view && view.id === m.dm) { toast('השיחה נמחקה'); closeView(); } else if (tab === 'chats') render();
      break;
    case 'typing':
      if (view && view.id === m.dm) { const t = $('#typ'); if (t) { t.style.display = 'block'; clearTimeout(t._h); t._h = setTimeout(() => t.style.display = 'none', 3000); } }
      break;
    case 'gallery_req': notify('🔓 בקשת גלריה', `${m.from.nick} מבקש/ת גישה לגלריה שלך`); loadGallery(); break;
    case 'grant': notify('✨ גלריה נפתחה', `${m.from.nick} פתח/ה לך את הגלריה`); break;
    case 'verified':
      refreshMe().then(() => { toast(m.ok ? '✅ אומתת! קיבלת תג מאומת/ת' : '❌ האימות נדחה: ' + (m.note || 'נסה/י שוב')); if (tab === 'me') render(); });
      break;
    case 'catch_wait': break;
    case 'catch_match':
      catching = false;
      loadDms().then(() => { tab = 'chats'; render(); openChat(m.dm); toast(`⚡ קאץ'! התחברת ל${m.other.nick}`); });
      break;
    case 'kicked': showBanned(); break;
    case 'need_account': catching = false; if (tab === 'catch') render(); accountSheet(); break;
    case 'call_in': incomingCall(m.from); break;
    case 'call_ringing': break;
    case 'call_accepted': callAccepted(); break;
    case 'call_declined': endCall(false); toast('השיחה נדחתה'); break;
    case 'call_ended': endCall(false); toast('השיחה הסתיימה'); break;
    case 'call_error': endCall(false); callErr(m.reason); break;
    case 'rtc': onRtc(m.from, m.data); break;
  }
}
function notify(title, body) {
  toast(`${title}: ${String(body || '').slice(0, 60)}`);
  try {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker && navigator.serviceWorker.ready.then(r => r.showNotification(title, { body: String(body || '').slice(0, 80), icon: '/icons/icon-192.png', tag: 'blush' }));
    }
  } catch (e) {}
}

/* ---------- data loads ---------- */
async function refreshMe() { const d = await api('/me'); ME = d.user; return ME; }
async function loadRooms() { const d = await api('/rooms'); ROOMS = d.rooms; ONLINE = d.online_total; }
async function loadUsers() { const d = await api('/users'); USERS = d.users; }
async function loadDms() { const d = await api('/dms'); DMS = d.dms; updateBadge(); return DMS; }
async function loadGallery() { GAL = await api('/gallery'); }
function updateBadge() {
  const n = DMS.reduce((a, d) => a + (d.unread || 0), 0) + (GAL.requests || []).length;
  document.title = (n ? `(${n}) ` : '') + 'קליק';
  const b = $('#navChatsBadge'); if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
}

/* ---------- boot ---------- */
let CONFIG = { google_client_id: null, email_login: false, accounts_required: false };
const configReady = fetch('/api/public/config').then(r => r.json()).then(c => { CONFIG = c; }).catch(() => {});
const isGuest = () => CONFIG.accounts_required && ME && !ME.account;
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (!TOKEN) return bindLanding();
  try {
    await refreshMe();
    await Promise.all([loadRooms(), loadDms(), loadGallery()]);
    connectWS(); render();
  } catch (e) { if (e.message !== 'banned') { if (!TOKEN) renderOnboarding(); else $('#app').innerHTML = `<div class="center"><div><div style="font-size:40px">📡</div><p>אין חיבור לשרת</p><button class="btn sm" onclick="location.reload()">נסה שוב</button></div></div>`; } }
}
function logoutLocal() { TOKEN = null; ME = null; try { localStorage.removeItem('blush_token'); } catch (e) {} try { ws && ws.close(); } catch (e) {} }
function showBanned(reason) {
  logoutLocal();
  $('#app').innerHTML = `<div class="center"><div><div style="font-size:54px">⛔</div><h2>החשבון הושעה</h2><p class="mut" style="margin:10px 0">${esc(reason || 'בעקבות הפרת כללי הקהילה')}</p></div></div>`;
}

/* ---------- landing / join ---------- */
const LANDING_HTML = document.getElementById('app').innerHTML;
const RANDOM_EMO = () => EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
function renderOnboarding() { $('#app').innerHTML = LANDING_HTML; bindLanding(); }
function bindLanding() {
  let g = 'm';
  document.querySelectorAll('#jG button').forEach(b => b.onclick = () => { g = b.dataset.g; document.querySelectorAll('#jG button').forEach(x => x.classList.toggle('on', x === b)); });
  $('#joinForm').onsubmit = async e => {
    e.preventDefault();
    const err = $('#jErr'); err.textContent = '';
    const nick = $('#jNick').value.trim(), age = $('#jAge').value;
    if (nick.length < 2) { err.textContent = 'בחר/י כינוי (2 תווים לפחות)'; return $('#jNick').focus(); }
    if (!age || +age < 18) { err.textContent = 'הצ׳אט מיועד לגילאי 18 ומעלה בלבד'; return $('#jAge').focus(); }
    if (!$('#jAgree').checked) { err.textContent = 'סמנ/י שאת/ה מעל 18 ומסכים/ה לכללים'; return; }
    const btn = $('#jGo'); btn.disabled = true; btn.textContent = 'נכנסים…';
    try {
      const d = await api('/register', { body: { nick, age, gender: g, looking: ['talk', 'flirt'], lvl: 'flirt', emo: RANDOM_EMO(), agree: true } });
      TOKEN = d.token; try { localStorage.setItem('blush_token', TOKEN); } catch (x) {}
      ME = d.user; await boot();
      toast('ברוך/ה הבא/ה 👋');
    } catch (x) { err.textContent = x.message; btn.disabled = false; btn.textContent = 'כניסה ⚡'; }
  };
  $('#jHasKey').onclick = e => { e.preventDefault(); accountSheet('login'); };
  fetch('/api/public/stats').then(r => r.json()).then(d => {
    const o = $('#lOnline'); if (o) o.textContent = d.online >= 5 ? `● ${d.online} מחוברים עכשיו` : '● פעיל עכשיו';
    const box = $('#lRooms'); if (box && d.rooms) box.innerHTML = d.rooms.map(r => `<div class="lroom">${esc(r.emo)} ${esc(r.name)}${r.online >= 3 ? `<i>● ${r.online}</i>` : ''}</div>`).join('');
  }).catch(() => {});
}
/* ---------- main shell ---------- */
function render() {
  if (!ME) return renderOnboarding();
  $('#app').innerHTML = `
  <div class="top">
    <div class="logo">קליק</div>
    <span class="tag g">● ${ONLINE} מחוברים</span>
    <div class="grow"></div>
  </div>
  <main id="main">${tabHtml()}</main>
  <nav>
    ${navBtn("rooms", "🏠", "חדרים")}${navBtn("people", "👀", "אנשים")}
    <button class="catch ${tab === 'catch' ? 'on' : ''}" onclick="go('catch')"><span class="i">⚡</span>קאץ'</button>
    <button class="${tab === 'chats' ? 'on' : ''}" onclick="go('chats')"><span class="i">💬</span>שיחות<span class="badge" id="navChatsBadge" style="display:none"></span></button>
    ${navBtn("me", "🙂", "אני")}
  </nav>`;
  if (!wsOk && TOKEN) $('#app').insertAdjacentHTML('afterbegin', '<div class="conn">מתחבר מחדש…</div>');
  updateBadge(); hydrateImgs();
  if (view) openView(view, true);
}
function navBtn(id, i, t) { return `<button class="${tab === id ? 'on' : ''}" onclick="go('${id}')"><span class="i">${i}</span>${t}</button>`; }
async function go(t) {
  tab = t; view = null; if (t !== 'catch' && catching) { catching = false; wsSend({ t: 'catch_cancel' }); }
  render();
  try {
    if (t === 'rooms') await loadRooms();
    if (t === 'people') await loadUsers();
    if (t === 'chats') await Promise.all([loadDms(), loadGallery()]);
    if (t === 'me') await Promise.all([refreshMe(), loadGallery()]);
    if (tab === t && !view) { $('#main').innerHTML = tabHtml(); hydrateImgs(); }
  } catch (e) {}
}
function tabHtml() { return { rooms: roomsTab, people: peopleTab, catch: catchTab, chats: chatsTab, me: meTab }[tab](); }

/* ---------- rooms ---------- */
function roomsTab() {
  const q = ICE[new Date().getDate() % ICE.length];
  return `${verifyNudge()}<div class="hero"><div class="small mut">✨ שאלת היום</div><div style="font-weight:700;font-size:18px;margin:4px 0 10px">${q}</div><button class="btn sm" onclick="openRoom('salon')">ענה/י בסלון</button></div>
  <div class="sec-title">חדרים 🔥<span class="mut small">${ROOMS.reduce((a, r) => a + r.online, 0)} בחדרים</span></div>
  ${ROOMS.map(r => `<div class="card room" onclick="openRoom('${r.id}')">
    <div class="e">${esc(r.emo)}</div>
    <div class="grow"><div style="font-weight:700">${esc(r.name)} ${r.official ? '' : '<span class="tag">משתמשים</span>'}</div><div class="mut small">${esc(r.descr)}</div></div>
    <div style="text-align:left">${lvlTag(r.lvl)}<div class="mut small" style="margin-top:5px">● ${r.online}</div></div></div>`).join("")}
  <button class="btn sec" onclick="newRoomSheet()" style="margin-top:6px">➕ פתח/י חדר משלך</button>`;
}
function verifyNudge() {
  if (!ME || ME.verified) return '';
  if (ME.verify_state === 1) return `<div class="card row small"><span style="font-size:22px">⏳</span><div class="grow">האימות שלך בבדיקה. נעדכן ברגע שיאושר.</div></div>`;
  return `<div class="card row" onclick="verifySheet()" style="border-color:#5cc8ff66;cursor:pointer"><span style="font-size:24px">✔</span><div class="grow small"><strong>קבל/י תג מאומת/ת</strong><div class="mut">סלפי של 20 שניות — כולם יידעו שאת/ה אמיתי/ת, ונפתחות לך שיחות וידאו.</div></div><span>←</span></div>`;
}
async function openRoom(id) {
  view = { t: 'room', id }; openView(view);
  try {
    const d = await api(`/rooms/${id}/messages`);
    roomMsgs[id] = d.messages; view.room = d.room;
    if (view && view.id === id) openView(view, true);
  } catch (e) { toast(e.message); closeView(); }
  wsSend({ t: 'join', room: id });
}
function roomView() {
  const r = view.room || ROOMS.find(x => x.id === view.id) || { name: '…', emo: '💬', lvl: 'soft' };
  const msgs = roomMsgs[view.id];
  return `<div class="top"><button class="icon-btn" onclick="closeView()">→</button><div style="font-size:24px">${esc(r.emo)}</div><div class="grow"><div style="font-weight:700">${esc(r.name)}</div><div class="mut small">${esc(r.descr || '')}</div></div>${lvlTag(r.lvl)}</div>
  <div class="msgs" id="msgs">${msgs ? (`<div class="m sys">כבוד הדדי. אסור לשתף פרטים מזהים של אחרים. הודעה לא נעימה? לחץ/י על ההודעה ← דיווח.</div>` + (msgs.length ? msgs.map(x => roomMsgHtml(x).trim().replace(/^<div /, `<div data-id="${x.id}" `)).join("") : '<div class="m sys empty-note">עוד אין הודעות. תהיה/י הראשון/ה 👋</div>')) : '<div class="spinner"></div>'}</div>
  <div class="composer"><input id="rin" maxlength="500" ${isGuest() ? 'readonly onclick="accountSheet()" placeholder="כדי לכתוב — שמירת חשבון ✍️"' : 'placeholder="כתוב/י לחדר…"'} onkeydown="if(event.key==='Enter')sendRoom()"><button class="send" onclick="sendRoom()">➤</button></div>`;
}
function roomMsgHtml(m) {
  const mine = m.user.id === ME.id;
  const tap = mine ? `toast('זו ההודעה שלך 🙂')` : `openProfile('${m.user.id}')`;
  return `<div class="m room-m ${mine ? 'me' : ''}" style="cursor:pointer;display:flex;gap:9px;align-items:flex-start" onclick="${tap}">${av({ id: m.user.id, emo: m.user.emo, avatar: m.user.avatar }, 34, false)}<div class="grow"><div class="who" style="color:${mine ? 'var(--pink2)' : color(m.user.id)}">${esc(m.user.nick)} ${vb(m.user)}${mine ? ' (את/ה)' : ''} <span class="mut" style="font-weight:400;font-size:11px">${hhmm(m.created)}</span></div>${esc(m.text)}</div></div>`;
}
async function sendRoom() {
  const i = $('#rin'); const t = i.value.trim(); if (!t) return; i.value = '';
  try { const d = await api(`/rooms/${view.id}/messages`, { body: { text: t } }); if (!roomMsgs[view.id].some(x => x.id === d.msg.id)) roomMsgs[view.id].push(d.msg); refreshRoom(); }
  catch (e) { toast(e.message); i.value = t; }
}
/* Update a message list in place: append only new messages (animated), replace only changed ones.
   Rebuilding the whole list re-ran the pop animation on every bubble, which made the chat "jump". */
function syncList(box, items, fn, anchor) {
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 150;
  const have = new Map([...box.querySelectorAll(':scope > [data-id]')].map(e => [e.dataset.id, e]));
  const want = new Set(items.map(x => x.id));
  have.forEach((e, id) => { if (!want.has(id)) e.remove(); });
  let lastMine = false, added = false;
  for (const it of items) {
    const h = fn(it).trim().replace(/^<div /, `<div data-id="${it.id}" `);
    const cur = have.get(it.id);
    if (cur && cur._h === h) continue;
    const t = document.createElement('template'); t.innerHTML = h;
    const el = t.content.firstElementChild; el._h = h;
    if (cur) cur.replaceWith(el);
    else { el.classList.add('new'); anchor && anchor.parentNode === box ? box.insertBefore(el, anchor) : box.appendChild(el); added = true; lastMine = !!(it.mine || (it.user && ME && it.user.id === ME.id)); }
  }
  if (added) { const n = box.querySelector('.empty-note'); n && n.remove(); }
  if (added && (atBottom || lastMine)) box.scrollTop = box.scrollHeight;
}
function refreshRoom() { const m = $("#msgs"); if (!m || !view || view.t !== 'room' || !roomMsgs[view.id]) return; syncList(m, roomMsgs[view.id], roomMsgHtml); }
function newRoomSheet() {
  sheet(`<h2>חדר חדש</h2><p class="mut small" style="margin-bottom:12px">כל נושא שעולה לך בראש</p>
  <input id="nrName" placeholder="שם החדר" maxlength="24"><input id="nrDesc" placeholder="תיאור קצר (לא חובה)" maxlength="80" style="margin-top:8px">
  <div class="lvl" style="margin:12px 0" id="nrL">${LEVELS.map(([k, e, n]) => `<button data-k="${k}" class="${k === 'flirt' ? 'on' : ''}" onclick="document.querySelectorAll('#nrL button').forEach(b=>b.classList.remove('on'));this.classList.add('on')"><b>${e}</b>${n}</button>`).join("")}</div>
  <button class="btn" onclick="createRoom()">צור חדר</button>`);
}
async function createRoom() {
  try { const d = await api('/rooms', { body: { name: $('#nrName').value, descr: $('#nrDesc').value, lvl: document.querySelector('#nrL .on').dataset.k } }); closeSheet(); ROOMS.unshift({ ...d.room, online: 0 }); openRoom(d.room.id); }
  catch (e) { toast(e.message); }
}

/* ---------- people ---------- */
function peopleTab() {
  const list = USERS.filter(u => (filters.g === "all" || u.gender === filters.g) && (filters.area < 0 || u.area === filters.area) && (!filters.online || u.online) && (!filters.ver || u.verified) && (filters.lvl === "all" || u.lvl === filters.lvl));
  const f = (k, v, l) => `<span class="chip ${filters[k] === v ? 'on' : ''}" onclick="filters.${k}=${typeof v === 'string' ? `'${v}'` : v};$('#main').innerHTML=tabHtml()">${l}</span>`;
  return `<div class="filters">${f("g", "all", "הכול")}${f("g", "f", "נשים")}${f("g", "m", "גברים")}${f("g", "c", "זוגות")}${f("g", "nb", "א-בינארי")}</div>
  <div class="filters"><span class="chip ${filters.online ? 'on' : ''}" onclick="filters.online=!filters.online;$('#main').innerHTML=tabHtml()">🟢 מחוברים</span><span class="chip ${filters.ver ? 'on' : ''}" onclick="filters.ver=!filters.ver;$('#main').innerHTML=tabHtml()">✔ מאומתים</span>${f("lvl", "x", "🌶️ מפורש")}${f("lvl", "flirt", "😏 פלרטוט")}${f("lvl", "soft", "☕ רגוע")}
  <select style="width:auto;padding:6px 10px;border-radius:999px;font-size:13px" onchange="filters.area=+this.value;$('#main').innerHTML=tabHtml()"><option value="-1">📍 כל הארץ</option>${AREAS.map((a, i) => `<option value="${i}" ${filters.area === i ? 'selected' : ''}>${a}</option>`).join("")}</select></div>
  <div class="grid">${list.map(u => `<div class="pcard" onclick="openProfile('${u.id}')">
    <div class="ph" style="background:linear-gradient(160deg,${color(u.id)}55,${color(u.id)}11)">${esc(u.emo)}${u.avatar ? `<div class="phimg" data-media="${u.avatar}"></div>` : ''}${u.online ? '<span class="on"><i></i>מחובר/ת</span>' : ''}</div>
    <div class="b"><div style="font-weight:700;font-size:14px">${esc(u.nick)} ${vb(u)}</div><div class="mut small">${u.age} · ${GLBL[u.gender]} · ${AREAS[u.area] ? AREAS[u.area].split(" ").slice(0, 2).join(" ") : ''}</div><div style="margin-top:6px">${lvlTag(u.lvl)}</div></div></div>`).join("") || `<div class="empty" style="grid-column:span 2"><div class="e">🔍</div>${USERS.length ? 'אין תוצאות. נסה/י לשנות סינון.' : 'עוד אין כאן אנשים — הזמן/י חברים!'}</div>`}</div>`;
}
async function openProfile(id) {
  sheet('<div class="spinner"></div>');
  let d; try { d = await api('/users/' + id); } catch (e) { closeSheet(); return toast(e.message); }
  const u = d.user;
  sheet(`<div class="row" style="gap:14px"><div ${u.avatar ? `onclick="viewImg('${u.avatar}')" style="cursor:zoom-in"` : ''}>${av(u, 72)}</div><div class="grow"><h2>${esc(u.nick)}</h2>
    ${u.verified ? `<span class="vbadge">✔ מאומת/ת · ${GLBL[u.verified_gender] || ''} אמיתי/ת</span>` : '<span class="tag">לא מאומת/ת</span>'}
    <div class="mut small" style="margin-top:4px">${u.age} · ${GLBL[u.gender]} · ${AREAS[u.area] || ''}</div><div class="small" style="margin-top:4px;color:${u.online ? 'var(--ok)' : 'var(--mut)'}">${u.online ? '● מחובר/ת עכשיו' : 'נראה/תה ' + ago(u.last_seen)}</div></div></div>
  ${u.bio ? `<p style="margin:14px 0;line-height:1.5">${esc(u.bio)}</p>` : '<div style="height:12px"></div>'}
  <div style="margin-bottom:10px">${lvlTag(u.lvl)} ${u.looking.map(k => `<span class="tag">${(LOOK.find(l => l[0] === k) || [0, k])[1]}</span>`).join(" ")}</div>
  ${d.gallery.length ? `<div class="sec-title" style="margin-top:10px">📷 גלריה</div>
  <div class="gal">${d.gallery.map(g => g.media ? `<div class="g" data-media="${g.media}" onclick="viewImg('${g.media}')"></div>` : `<div class="g" style="display:grid;place-items:center;font-size:24px">🔒</div>`).join("")}</div>
  ${d.gallery.some(g => !g.media) ? `<button class="btn sec" style="margin-top:8px" onclick="askGallery('${id}')" ${d.requested ? 'disabled' : ''}>${d.requested ? '⏳ הבקשה נשלחה' : '🔓 בקש/י גישה לגלריה הפרטית'}</button>` : ''}` : ''}
  <div class="row" style="margin-top:14px"><button class="btn" onclick="closeSheet();startDm('${id}')">💬 הודעה</button><button class="btn sec" style="width:auto;padding:14px 18px" onclick="closeSheet();startCall('${id}')">📹</button></div>
  <div class="row" style="margin-top:10px"><button class="btn sec sm grow" onclick="toggleGrant('${id}',${d.i_granted})">${d.i_granted ? '🔒 בטל/י גישה לגלריה שלי' : '🔑 פתח/י לו/ה את הגלריה שלי'}</button></div>
  <div class="row" style="margin-top:12px;justify-content:center;gap:24px"><button class="mut small" onclick="blockUser('${id}')">🚫 חסימה</button><button class="small" style="color:var(--bad)" onclick='reportSheet("${id}",${JSON.stringify(u.avatar ? { media: u.avatar } : {})})'>⚠️ דיווח</button></div>`);
  hydrateImgs($('.sheet'));
}
async function viewImg(mid) { const u = await mediaUrl(mid); if (!u) return; sheet(`<div style="background:url('${u}') center/contain no-repeat;height:70vh;border-radius:14px"></div>`); }
async function askGallery(id) { try { await api('/gallery-requests', { body: { to: id } }); toast('הבקשה נשלחה 🔓'); openProfile(id); } catch (e) { toast(e.message); } }
async function toggleGrant(id, granted) {
  try { if (granted) { await api('/grants/' + id, { method: 'DELETE' }); toast('הגישה בוטלה — התמונות ננעלו'); } else { await api('/grants', { body: { to: id } }); toast('הגלריה שלך נפתחה ✨'); } openProfile(id); } catch (e) { toast(e.message); }
}
async function blockUser(id) {
  try { await api('/blocks', { body: { target: id } }); closeSheet(); USERS = USERS.filter(u => u.id !== id); DMS = DMS.filter(d => d.other.id !== id); if (view && view.t === 'chat') closeView(); else render(); toast('נחסם/ה. לא תראו זה את זה יותר.'); } catch (e) { toast(e.message); }
}

/* ---------- report ---------- */
function reportSheet(id, ctx = {}) {
  sheet(`<h2>דיווח</h2><p class="mut small" style="margin-bottom:12px">הדיווח אנונימי. דיווחים על קטינים ותמונות ללא הסכמה מטופלים מיד ובעדיפות עליונה.</p>
  ${REASONS.map(([k, r]) => `<label class="setrow" style="cursor:pointer"><input type="radio" name="rr" value="${k}" style="width:auto"><span class="grow">${r}</span></label>`).join("")}
  <textarea id="rtxt" rows="2" maxlength="1000" placeholder="פרטים נוספים (לא חובה)" style="margin-top:10px"></textarea>
  <label class="setrow"><input type="checkbox" id="rblock" checked style="width:auto"><span>לחסום גם את המשתמש/ת</span></label>
  <button class="btn" onclick='sendReport("${id}",${JSON.stringify(ctx)})' style="background:var(--bad);box-shadow:none">שלח/י דיווח</button>`);
}
async function sendReport(id, ctx) {
  const c = document.querySelector('input[name=rr]:checked'); if (!c) return toast("בחר/י סיבה");
  const block = $('#rblock').checked;
  try {
    await api('/reports', { body: { target: id, reason: c.value, details: $('#rtxt').value, dm: ctx.dm, media: ctx.media, block } });
    closeSheet(); toast(c.value === 'ncii' ? 'התמונה הוסרה מיד. תודה 🙏' : 'תודה. הדיווח התקבל ✔');
    if (block) { USERS = USERS.filter(u => u.id !== id); DMS = DMS.filter(d => d.other.id !== id); if (view && view.t === 'chat') closeView(); else render(); }
  } catch (e) { toast(e.message); }
}

/* ---------- catch ---------- */
function catchTab() {
  if (catching) return `<div style="text-align:center"><div class="radar"><div class="c">⚡</div></div><h2>מחפש לך מישהו…</h2><p class="mut">ברגע שמישהו מתאים יחפש גם — תחוברו אוטומטית</p><p class="mut small">${ONLINE} מחוברים עכשיו</p><button class="btn sec" style="margin-top:20px" onclick="catching=false;wsSend({t:'catch_cancel'});render()">ביטול</button></div>`;
  return `<div style="text-align:center;padding:10px 0 4px"><div style="font-size:64px">⚡</div><h2 style="font-size:26px">קאץ' מהיר</h2><p class="mut">שיחה אקראית 1 על 1 עם מישהו שמחפש בדיוק מה שאת/ה מחפש/ת. לא מתאים? "הבא" בלחיצה.</p></div>
  <div class="lbl">עם מי?</div><div style="margin:12px 0">${[["all", "כולם"], ["f", "נשים"], ["m", "גברים"], ["c", "זוגות"], ["nb", "א-בינארי"]].map(([k, v]) => `<span class="chip ${catchPref.g === k ? 'on' : ''}" onclick="catchPref.g='${k}';render()">${v}</span>`).join("")}</div>
  <div class="lbl">איזה וייב?</div><div class="lvl" style="margin:14px 0">${LEVELS.map(([k, e, n]) => `<button class="${catchPref.lvl === k ? 'on' : ''}" onclick="catchPref.lvl='${k}';render()"><b>${e}</b>${n}</button>`).join("")}</div>
  <button class="btn" onclick="doCatch()" style="font-size:18px;padding:18px">מצא/י לי מישהו ⚡</button>`;
}
function doCatch() { if (!wsOk) return toast('אין חיבור כרגע, נסה/י שוב בעוד רגע'); catching = true; wsSend({ t: 'catch', g: catchPref.g, lvl: catchPref.lvl }); render(); }

/* ---------- chats ---------- */
function chatsTab() {
  const reqs = GAL.requests || [];
  return `${reqs.map(u => `<div class="card row">${av(u, 40, false)}<div class="grow small"><strong>${esc(u.nick)}</strong> מבקש/ת גישה לגלריה שלך</div><button class="btn sm" onclick="acceptReq('${u.id}')">אישור</button><button class="btn sec sm" onclick="declineReq('${u.id}')">✕</button></div>`).join("")}
  ${DMS.length ? DMS.map(d => {
    const l = d.last; const prev = !l ? 'התחילו לדבר…' : l.kind === 'image' ? '📷 תמונה' : l.kind === 'sys' ? '⚙️ עדכון' : esc(l.text);
    return `<div class="card row" onclick="openChat('${d.id}')">${av(d.other)}<div class="grow"><div style="font-weight:700">${esc(d.other.nick)} ${vb(d.other)} ${d.catch ? '<span class="tag f">⚡</span>' : ''}</div><div class="mut small" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${l && l.sender === ME.id ? 'את/ה: ' : ''}${prev}</div></div><div style="text-align:left"><div class="mut" style="font-size:11px">${ago(d.last_at)}</div>${d.unread ? `<span class="unread">${d.unread}</span>` : ''}</div></div>`;
  }).join("") : '<div class="empty"><div class="e">💬</div>עדיין אין שיחות.<br>כנס/י לחדר, דפדף/י באנשים, או נסה/י קאץ\'!</div>'}`;
}
async function acceptReq(id) { await api('/grants', { body: { to: id } }).catch(e => toast(e.message)); await loadGallery(); render(); toast('אושר ✔'); }
async function declineReq(id) { await api('/gallery-requests/' + id, { method: 'DELETE' }).catch(() => {}); await loadGallery(); render(); }
async function startDm(uid) { try { const d = await api('/dms', { body: { to: uid } }); await loadDms(); tab = 'chats'; render(); openChat(d.dm.id); } catch (e) { toast(e.message); } }
async function openChat(id) {
  view = { t: 'chat', id }; openView(view);
  try {
    const [info, msgs] = await Promise.all([api('/dms/' + id), api(`/dms/${id}/messages`)]);
    dmInfo[id] = info.dm; dmMsgs[id] = msgs.messages;
    const d = DMS.find(x => x.id === id); if (d) d.unread = 0; updateBadge();
    if (view && view.id === id) openView(view, true);
  } catch (e) { toast(e.message); closeView(); }
}
function chatView() {
  const info = dmInfo[view.id]; const msgs = dmMsgs[view.id];
  if (!info || !msgs) { const d = DMS.find(x => x.id === view.id); return `<div class="top"><button class="icon-btn" onclick="closeView()">→</button><div class="grow" style="font-weight:700">${d ? esc(d.other.nick) : ''}</div></div><div class="msgs"><div class="spinner"></div></div>`; }
  const u = info.other;
  const theyWrote = msgs.some(m => !m.mine && m.kind !== 'sys');
  const pend = info.pending_lvl;
  return `<div class="top"><button class="icon-btn" onclick="closeView()">→</button><div onclick="openProfile('${u.id}')" class="row grow" style="cursor:pointer">${av(u, 40)}<div class="grow"><div style="font-weight:700">${esc(u.nick)} ${vb(u)}</div><div class="small" style="color:var(--ok)">${u.online ? 'מחובר/ת' : ''}</div></div></div>
    <button class="icon-btn" onclick="startCall('${u.id}')">📹</button><button class="icon-btn" onclick="chatMenu()">⋮</button></div>
  <div class="row small" style="padding:7px 14px;background:var(--bg2);border-bottom:1px solid var(--line);cursor:pointer" onclick="levelSheet()"><span class="mut">רמת השיחה:</span>${lvlTag(info.lvl)}<span class="mut grow" style="text-align:left">שינוי ←</span></div>
  ${pend && info.pending_by !== ME.id ? `<div class="pend"><span class="grow">${esc(u.nick)} מבקש/ת לעבור לרמה <strong>${LEVELS.find(l => l[0] === pend)[2]}</strong></span><button class="btn sm" onclick="lvlAnswer(true)">אישור</button><button class="btn sec sm" onclick="lvlAnswer(false)">לא</button></div>` : ''}
  ${pend && info.pending_by === ME.id ? `<div class="pend">⏳ ממתין לאישור מעבר לרמה ${LEVELS.find(l => l[0] === pend)[2]}</div>` : ''}
  <div class="msgs" id="msgs">${!msgs.length ? `<div class="m sys empty-note">אין הודעות בשיחה. <a href="#" style="color:var(--pink2)" onclick="event.preventDefault();deleteDm()">למחוק את השיחה מהרשימה?</a></div>` : ''}${msgs.map(x => msgHtml(x).trim().replace(/^<div /, `<div data-id="${x.id}" `)).join("")}<div class="typing" id="typ" style="display:none">${esc(u.nick)} מקליד/ה…</div></div>
  ${!msgs.some(m => m.mine) ? `<div class="icebreak">${ICE.slice(0, 5).map(q => `<span class="chip" onclick="$('#cin').value=this.textContent;sendChat()">${q}</span>`).join("")}</div>` : ''}
  <div class="composer"><button class="att" ${theyWrote ? '' : 'style="opacity:.35"'} onclick="${theyWrote ? 'pickImg()' : `toast('אפשר לשלוח תמונות אחרי שהצד השני עונה לך — כדי שאף אחד לא יקבל תמונה בהפתעה')`}">📷</button><input id="cin" maxlength="2000" ${isGuest() ? 'readonly onclick="accountSheet()" placeholder="כדי לכתוב — שמירת חשבון ✍️"' : 'placeholder="הודעה…"'} oninput="typingPing()" onkeydown="if(event.key==='Enter')sendChat()"><button class="send" onclick="sendChat()">➤</button></div>
  ${info.catch ? `<div style="display:flex;gap:8px;padding:0 10px 10px;background:var(--bg2)"><button class="btn sec sm grow" onclick="nextCatch()">⏭️ הבא</button><button class="btn sm grow" onclick="keepCatch()">💾 שמור שיחה</button></div>` : ''}`;
}
function sysText(t) {
  if (t.startsWith('level:')) return `השיחה עברה לרמה: ${(LEVELS.find(l => l[0] === t.slice(6)) || [0, 0, ''])[2]}`;
  if (t.startsWith('level_req:')) return `התבקש מעבר לרמה: ${(LEVELS.find(l => l[0] === t.slice(10)) || [0, 0, ''])[2]}`;
  if (t === 'level_no') return 'בקשת שינוי הרמה נדחתה';
  return esc(t);
}
function msgHtml(m) {
  if (m.kind === 'sys') return `<div class="m sys">${sysText(m.text)}</div>`;
  if (m.kind === 'image') {
    const hideAll = !m.mine && m.explicit && !ME.show_explicit;
    if (hideAll) return `<div class="m them"><span class="mut">🔞 תמונה מפורשת הוסתרה (לפי ההגדרות שלך)</span></div>`;
    if (!m.mine && m.once && (m.viewed || !m.media)) return `<div class="m them img-m"><div class="imgph">👁️ תמונה חד-פעמית — נצפתה</div></div>`;
    const blurred = m.explicit && !m.mine && !m._open;
    const loadNow = m.mine || !m.once || m._open;
    return `<div class="m ${m.mine ? 'me' : 'them'} img-m"><div class="pic ${blurred ? 'blur' : ''}" onclick="tapImg('${m.id}')">
      ${loadNow && (!blurred || !m.once) ? `<div class="inner" data-media="${m.media}"></div>` : '<div class="inner" style="background:linear-gradient(135deg,#ff4f8b66,#9b5cff66)"></div>'}
      ${blurred ? `<div class="ov">🔞 ${m.once ? 'חד-פעמית · ' : ''}תוכן מפורש<br><strong>הקש/י לפתיחה</strong></div>` : (!m.mine && m.once && !m._open ? `<div class="ov">👁️ תמונה חד-פעמית<br><strong>הקש/י לצפייה</strong></div>` : '')}
    </div><div class="small" style="padding:3px 6px;opacity:.75">${m.mine ? (m.explicit ? '🔞 נשלחה מטושטשת ' : '') + (m.once ? '· 👁️ חד-פעמית' : '') : ''} ${hhmm(m.created)}</div></div>`;
  }
  return `<div class="m ${m.mine ? 'me' : 'them'}">${esc(m.text)}<div style="font-size:10px;opacity:.6;margin-top:2px">${hhmm(m.created)}</div></div>`;
}
function tapImg(mid) {
  const m = (dmMsgs[view.id] || []).find(x => x.id === mid); if (!m || m.mine) return m && viewImg(m.media);
  if (m._open) return viewImg(m.media);
  if (!m.explicit && !m.once) return viewImg(m.media);
  sheet(`<h2>לפתוח את התמונה?</h2><p class="mut" style="margin:8px 0 16px">${m.explicit ? 'התמונה סומנה כמפורשת. ' : ''}${m.once ? 'זו תמונה חד-פעמית — היא תיעלם 8 שניות אחרי הפתיחה.' : ''}</p>
  <button class="btn" onclick="openImg('${mid}')">פתח/י 🔓</button><button class="btn sec" style="margin-top:8px" onclick="closeSheet()">לא עכשיו</button>`);
}
function openImg(mid) {
  closeSheet(); const m = dmMsgs[view.id].find(x => x.id === mid); m._open = true; refreshChat();
  if (m.once) setTimeout(() => { m._open = false; m.viewed = true; m.media = null; refreshChat(); }, 8000);
}
function refreshChat() {
  const box = $("#msgs"); if (!box || !view || view.t !== 'chat') return;
  const msgs = dmMsgs[view.id] || [];
  syncList(box, msgs, msgHtml, $('#typ'));
  const theyWrote = msgs.some(m => !m.mine && m.kind !== 'sys');
  const att = document.querySelector('.composer .att'); if (att && theyWrote && att.style.opacity) openView(view, true);
}
let lastTyping = 0;
function typingPing() { if (Date.now() - lastTyping < 2500) return; lastTyping = Date.now(); const info = dmInfo[view.id]; if (info) wsSend({ t: 'typing', to: info.other.id, dm: view.id }); }
async function sendChat() {
  const i = $('#cin'); const t = i.value.trim(); if (!t) return; i.value = '';
  const first = !(dmMsgs[view.id] || []).some(m => m.mine);
  try { const d = await api(`/dms/${view.id}/messages`, { body: { text: t } }); if (!dmMsgs[view.id].some(x => x.id === d.msg.id)) dmMsgs[view.id].push(d.msg); first ? openView(view, true) : refreshChat(); }
  catch (e) { toast(e.message); i.value = t; }
}
function pickImg() {
  sheet(`<h2>שליחת תמונה</h2><p class="mut small" style="margin-bottom:10px">מיקום ומטא-דאטה נמחקים אוטומטית.</p>
  <label class="setrow"><span class="grow">🔞 תוכן מפורש <div class="mut small">יגיע מטושטש — המקבל/ת יחליט/תחליט אם לפתוח</div></span><span class="switch ${dmInfo[view.id].lvl === 'x' ? 'on' : ''}" id="swX" onclick="this.classList.toggle('on')"></span></label>
  <label class="setrow"><span class="grow">👁️ צפייה חד-פעמית <div class="mut small">נעלמת אחרי צפייה אחת</div></span><span class="switch" id="swO" onclick="this.classList.toggle('on')"></span></label>
  <button class="btn" id="imgGo" onclick="sendImg()">בחר/י תמונה מהמכשיר</button>
  <p class="mut small" style="margin-top:10px;text-align:center">שליחת תמונה של אדם אחר בלי רשותו = הרחקה לצמיתות</p>`);
}
async function sendImg() {
  const x = $('#swX').classList.contains('on'), once = $('#swO').classList.contains('on');
  const f = await pickFile(); if (!f) return;
  $('#imgGo').disabled = true; $('#imgGo').textContent = 'שולח…';
  try {
    const mid = await upload(f, 'chat');
    const d = await api(`/dms/${view.id}/messages`, { body: { media: mid, explicit: x, once } });
    closeSheet(); if (!dmMsgs[view.id].some(m => m.id === d.msg.id)) dmMsgs[view.id].push(d.msg); refreshChat();
  } catch (e) { toast(e.message); closeSheet(); }
}
function chatMenu() {
  const info = dmInfo[view.id]; const u = info.other;
  const lastImg = [...(dmMsgs[view.id] || [])].reverse().find(m => !m.mine && m.kind === 'image');
  sheet(`<h2>${esc(u.nick)}</h2>
  <div class="setrow" onclick="closeSheet();openProfile('${u.id}')">👤 <span class="grow">צפייה בפרופיל</span></div>
  <div class="setrow" onclick="closeSheet();levelSheet()">🎚️ <span class="grow">שינוי רמת השיחה</span></div>
  ${(dmMsgs[view.id] || []).length
    ? `<div class="setrow" onclick="clearDmAsk()">🧹 <span class="grow">מחיקת תוכן השיחה<div class="mut small">כל ההודעות והתמונות יימחקו אצל שני הצדדים</div></span></div>`
    : `<div class="setrow" onclick="deleteDm()">🗑️ <span class="grow">מחיקת השיחה מהרשימה<div class="mut small">החלון עם ${esc(u.nick)} ייעלם</div></span></div>`}
  <div class="setrow" onclick="blockUser('${u.id}')">🚫 <span class="grow">חסימה</span></div>
  <div class="setrow" style="color:var(--bad)" onclick='reportSheet("${u.id}",${JSON.stringify({ dm: view.id, media: lastImg ? lastImg.media : undefined })})'>⚠️ <span class="grow">דיווח</span></div>`);
}
function clearDmAsk() {
  sheet(`<h2>למחוק את תוכן השיחה?</h2><p class="mut" style="margin:8px 0 16px">כל ההודעות והתמונות יימחקו לצמיתות — אצלך ואצל הצד השני. החלון עצמו יישאר, ואחר כך אפשר למחוק גם אותו.</p>
  <button class="btn" style="background:var(--bad);box-shadow:none" onclick="clearDm()">🧹 מחיקת התוכן</button><button class="btn sec" style="margin-top:8px" onclick="closeSheet()">ביטול</button>`);
}
async function clearDm() {
  try { await api(`/dms/${view.id}/clear`, { method: 'POST' }); closeSheet(); dmMsgs[view.id] = []; openView(view, true); toast('תוכן השיחה נמחק 🧹'); } catch (e) { toast(e.message); }
}
async function deleteDm() { try { await api('/dms/' + view.id, { method: 'DELETE' }); closeSheet(); DMS = DMS.filter(d => d.id !== view.id); closeView(); toast('השיחה נמחקה'); } catch (e) { toast(e.message); } }
function levelSheet() {
  const info = dmInfo[view.id];
  sheet(`<h2>רמת השיחה</h2><p class="mut small" style="margin-bottom:14px">עלייה ברמה דורשת אישור של הצד השני. ירידה — מיידית.</p>
  <div class="lvl">${LEVELS.map(([k, e, n, d]) => `<button class="${info.lvl === k ? 'on' : ''}" onclick="setLvl('${k}')"><b>${e}</b>${n}<div class="mut" style="font-size:11px">${d}</div></button>`).join("")}</div>`);
}
async function setLvl(k) { closeSheet(); try { await api(`/dms/${view.id}/level`, { body: { lvl: k } }); } catch (e) { toast(e.message); } }
async function lvlAnswer(ok) { try { await api(`/dms/${view.id}/level/${ok ? 'accept' : 'decline'}`, { method: 'POST' }); } catch (e) { toast(e.message); } }
async function nextCatch() { const id = view.id; try { await api('/dms/' + id, { method: 'DELETE' }); } catch (e) {} DMS = DMS.filter(d => d.id !== id); view = null; tab = 'catch'; render(); doCatch(); }
async function keepCatch() { await api(`/dms/${view.id}/keep`, { method: 'POST' }).catch(() => {}); dmInfo[view.id].catch = 0; openView(view, true); toast('נשמר בשיחות שלך 💾'); }

/* ---------- verification ---------- */
async function verifySheet(firstTime) {
  if (ME.verified) return sheet(`<div style="text-align:center"><div style="font-size:50px">✅</div><h2>את/ה מאומת/ת</h2><p class="mut">יש לך תג ✔ — כולם יודעים שאת/ה אמיתי/ת.</p></div>`);
  if (ME.verify_state === 1) return sheet(`<div style="text-align:center"><div style="font-size:50px">⏳</div><h2>האימות בבדיקה</h2><p class="mut">נעדכן אותך ברגע שיאושר. בדרך כלל תוך זמן קצר.</p></div>`);
  sheet(`<div style="text-align:center"><div style="font-size:50px">🤳</div><h2>${firstTime ? 'עוד צעד אחד: ' : ''}אימות סלפי</h2></div>
  <p class="mut small" style="margin:8px 0 12px">כדי שלא יהיו מתחזים: אנחנו מוודאים שאת/ה אדם אמיתי, מעל 18, ושהמגדר בפרופיל (${GLBL[ME.gender]}) נכון. הסלפי נבדק ע״י צוות הבטיחות בלבד ולא מוצג לאף אחד.</p>
  ${ME.verify_state === 3 ? `<div class="pend" style="margin:0 0 10px">❌ האימות הקודם נדחה: ${esc(ME.verify_note || '')}</div>` : ''}
  <div class="card" style="text-align:center" id="vbox"><button class="btn" onclick="verifyStart()">התחל/י אימות</button></div>
  ${firstTime ? '<button class="btn sec" onclick="closeSheet()">אחר כך</button>' : ''}`);
}
async function verifyStart() {
  try {
    const d = await api('/verify/start', { method: 'POST' });
    $('#vbox').innerHTML = `<p class="small mut">צלם/י סלפי עכשיו, כשאת/ה:</p>
      <div style="font-size:22px;font-weight:800;margin:10px 0">${d.gesture}</div>
      <p class="small mut">ומחזיק/ה דף (או מסך) עם הקוד:</p><div style="font-size:38px;font-weight:800;letter-spacing:6px;margin:6px 0 14px;color:var(--pink2)">${d.code}</div>
      <button class="btn" id="vGo" onclick="verifyShoot()">📸 צלם/י סלפי</button><p class="mut small" style="margin-top:8px">פנים ברורות, תאורה טובה</p>`;
  } catch (e) { toast(e.message); }
}
async function verifyShoot() {
  const f = await pickFile(true); if (!f) return;
  $('#vGo').disabled = true; $('#vGo').textContent = 'שולח…';
  try { const mid = await upload(f, 'verify'); await api('/verify/submit', { body: { media: mid } }); await refreshMe(); closeSheet(); toast('📨 נשלח לבדיקה!'); render(); }
  catch (e) { toast(e.message); $('#vGo').disabled = false; $('#vGo').textContent = '📸 צלם/י סלפי'; }
}

/* ---------- video calls (WebRTC) ---------- */
const ICE_SERVERS = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];
let call = null; // {peer, pc, local, role, timer}
function callErr(r) {
  const msg = { premium: null, verify: 'שיחות וידאו פתוחות רק למשתמשים מאומתים — כדי שלא יהיו מתחזים', other_unverified: 'הצד השני עוד לא מאומת/ת — וידאו רק בין מאומתים', offline: 'המשתמש/ת לא מחובר/ת כרגע', blocked: 'לא ניתן להתקשר', notfound: 'המשתמש לא נמצא' }[r];
  if (r === 'verify') return verifySheet();
  toast(msg || 'לא ניתן להתקשר');
}
async function startCall(uid) {
  try { const c = await api('/call/' + uid); if (!c.ok) return callErr(c.reason); } catch (e) { return toast(e.message); }
  const u = USERS.find(x => x.id === uid) || (dmInfo[view && view.id] || {}).other || { id: uid, nick: '', emo: '🙂' };
  try { await setupCallUI(u, 'caller'); } catch (e) { return; }
  wsSend({ t: 'call', to: uid });
}
async function setupCallUI(u, role) {
  let local;
  try { local = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true }); }
  catch (e) { toast('צריך לאשר גישה למצלמה ולמיקרופון'); throw e; }
  call = { peer: u, role, local, pc: null, timer: null, pendingIce: [] };
  const d = document.createElement("div"); d.className = "vid"; d.id = "vid";
  d.innerHTML = `<div class="vtop">${av(u, 40, false)}<div class="grow"><div style="font-weight:700">${esc(u.nick)}</div><div class="small mut" id="vst">${role === 'caller' ? 'מתקשר…' : 'מתחבר…'}</div></div><button class="icon-btn" onclick='endCall(true);reportSheet("${u.id}")'>⚠️</button></div>
  <div class="remote"><div class="big ring" id="vph">${esc(u.emo)}</div><video class="r" id="rv" autoplay playsinline></video></div>
  <div class="self"><video class="s" id="lv" autoplay playsinline muted></video></div>
  <div class="ctrls"><button id="bMic" onclick="toggleTrack('audio',this)">🎤</button><button id="bCam" onclick="toggleTrack('video',this)">📷</button><button class="end" onclick="endCall(true)">📞</button></div>`;
  $("#app").appendChild(d);
  $('#lv').srcObject = local;
}
function toggleTrack(kind, b) { if (!call) return; call.local.getTracks().filter(t => t.kind === kind).forEach(t => { t.enabled = !t.enabled; b.style.opacity = t.enabled ? '' : '.4'; }); }
function makePc() {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  call.local.getTracks().forEach(t => pc.addTrack(t, call.local));
  pc.onicecandidate = e => { if (e.candidate) wsSend({ t: 'rtc', to: call.peer.id, data: { ice: e.candidate } }); };
  pc.ontrack = e => { const v = $('#rv'); if (v && v.srcObject !== e.streams[0]) { v.srcObject = e.streams[0]; $('#vph') && ($('#vph').style.display = 'none'); } };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected' && !call.timer) { let s = 0; call.timer = setInterval(() => { s++; const e = $("#vst"); if (e) e.textContent = "🔴 " + String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0") + " · מוצפן"; }, 1000); }
    if (['failed', 'disconnected'].includes(pc.connectionState)) { const e = $('#vst'); if (e) e.textContent = 'החיבור נחלש…'; }
  };
  return pc;
}
async function callAccepted() {
  if (!call || call.role !== 'caller') return;
  call.pc = makePc();
  const offer = await call.pc.createOffer();
  await call.pc.setLocalDescription(offer);
  wsSend({ t: 'rtc', to: call.peer.id, data: { sdp: call.pc.localDescription } });
}
async function onRtc(from, data) {
  if (!call || call.peer.id !== from) return;
  if (data.sdp) {
    if (data.sdp.type === 'offer') {
      call.pc = makePc();
      await call.pc.setRemoteDescription(data.sdp);
      const ans = await call.pc.createAnswer(); await call.pc.setLocalDescription(ans);
      wsSend({ t: 'rtc', to: from, data: { sdp: call.pc.localDescription } });
    } else await call.pc.setRemoteDescription(data.sdp);
    for (const c of call.pendingIce) await call.pc.addIceCandidate(c).catch(() => {});
    call.pendingIce = [];
  } else if (data.ice) {
    if (call.pc && call.pc.remoteDescription) await call.pc.addIceCandidate(data.ice).catch(() => {}); else call.pendingIce.push(data.ice);
  }
}
function incomingCall(from) {
  if (call) { wsSend({ t: 'call_decline', to: from.id }); return; }
  notify('📹 שיחת וידאו', `${from.nick} מתקשר/ת`);
  sheet(`<div style="text-align:center"><div class="ring" style="font-size:70px">${esc(from.emo)}</div><h2>${esc(from.nick)}</h2><p class="mut">מתקשר/ת אליך בווידאו</p>
  <div class="row" style="margin-top:18px"><button class="btn" style="background:var(--ok)" onclick='acceptCall(${JSON.stringify(from)})'>📹 ענה/י</button><button class="btn" style="background:var(--bad)" onclick="closeSheet();wsSend({t:'call_decline',to:'${from.id}'})">דחה/י</button></div></div>`);
}
async function acceptCall(from) {
  closeSheet();
  try { await setupCallUI(from, 'callee'); } catch (e) { wsSend({ t: 'call_decline', to: from.id }); return; }
  wsSend({ t: 'call_accept', to: from.id });
}
function endCall(notifyPeer) {
  if (!call) return;
  if (notifyPeer) wsSend({ t: 'call_end', to: call.peer.id });
  clearInterval(call.timer);
  try { call.pc && call.pc.close(); } catch (e) {}
  call.local && call.local.getTracks().forEach(t => t.stop());
  call = null; $('#vid') && $('#vid').remove();
}

/* ---------- premium ---------- */
let selPlan = "m";
function openPremium(reason) {
  sheet(`<div style="text-align:center"><div style="font-size:48px">👑</div><h2 style="font-size:24px">קליק פרימיום</h2><p class="mut small">${reason === 'video' ? 'שיחות וידאו פתוחות למנויים מאומתים — ככה אנחנו שומרים עליהן נקיות ממתחזים' : 'יותר חיבור, יותר שליטה'}</p></div>
  <div style="margin:14px 0">${[["📹", "שיחות וידאו ללא הגבלה (בין מאומתים)"], ["🕶️", "מצב אינקוגניטו — רק מי שאת/ה פונה אליו רואה אותך"], ["🚀", "בוסט — הופעה ראשונה בתוצאות (בקרוב)"], ["👀", "מי צפה בפרופיל שלך (בקרוב)"]].map(([e, t]) => `<div class="feat"><span style="font-size:20px">${e}</span>${t}</div>`).join("")}
  <div class="feat mut small">💬 הודעות, חדרים ותמונות — תמיד חינם לכולם</div></div>
  ${PLANS.map(p => `<div class="plan ${selPlan === p.id ? 'on' : ''}" onclick="selPlan='${p.id}';openPremium('${reason || ''}')"><div class="grow"><strong>${p.name}</strong> ${p.hot ? '<span class="tag x">הכי פופולרי</span>' : ''}${p.save ? `<div class="small" style="color:var(--ok)">${p.save}</div>` : ''}</div><div style="text-align:left"><span class="pr">₪${p.price}</span><div class="mut small">${p.per}</div></div></div>`).join("")}
  <button class="btn" style="background:linear-gradient(135deg,#ffc25c,#ff8a5c);color:#2a1300" onclick="toast('התשלום ייפתח בקרוב 🙏')">בקרוב — תשלום בביט ואשראי</button>
  <p class="mut small" style="text-align:center;margin-top:10px">ביטול בלחיצה. בחיוב יופיע שם ניטרלי ודיסקרטי.</p>`);
}

/* ---------- me ---------- */
function meTab() {
  const me = ME;
  const vs = me.verified ? `<span class="vbadge">✔ מאומת/ת</span>` : me.verify_state === 1 ? '<span class="tag">⏳ אימות בבדיקה</span>' : `<button class="tag" style="background:#5cc8ff22;color:#5cc8ff" onclick="verifySheet()">✔ לאימות</button>`;
  return `<div class="card row" style="gap:14px"><div style="position:relative;cursor:pointer" onclick="avatarSheet()">${av(me, 64, false)}<span style="position:absolute;bottom:-2px;left:-2px;background:var(--pink);border-radius:50%;width:22px;height:22px;display:grid;place-items:center;font-size:12px">📷</span></div><div class="grow"><div style="font-weight:800;font-size:19px">${esc(me.nick)}</div><div class="mut small">${me.age} · ${GLBL[me.gender]} · ${AREAS[me.area]}</div><div style="margin-top:5px">${lvlTag(me.lvl)} ${vs}</div></div><button class="btn sec sm" onclick="editMe()">עריכה</button></div>
  ${me.role === 'admin' ? `<a href="/admin" class="card row" style="text-decoration:none;color:inherit;border-color:var(--vio)"><span style="font-size:24px">🛡️</span><div class="grow"><strong>אזור אדמין</strong></div><span>←</span></a>` : ''}
  <div class="sec-title">📷 הגלריה שלי <span class="mut small">${GAL.gallery.length}/30</span></div>
  <div class="gal">${GAL.gallery.map(g => `<div class="g" data-media="${g.media}" onclick="galItem('${g.id}',${g.private})"><span>${g.private ? '🔒 פרטית' : '🌐 ציבורית'}</span></div>`).join("")}<div class="g add" onclick="addGallery()">＋</div></div>
  <div class="sec-title">🔑 מי רואה את הגלריה הפרטית שלי</div>
  <div class="card">${GAL.grants.length ? GAL.grants.map(u => `<div class="setrow">${av(u, 34, false)}<span class="grow">${esc(u.nick)}</span><button class="btn sec sm" onclick="revoke('${u.id}')">בטל גישה</button></div>`).join("") : '<div class="mut small">אף אחד עדיין. את/ה מחליט/ה למי לפתוח — ואפשר לבטל בכל רגע.</div>'}</div>
  <div class="sec-title">⚙️ הגדרות</div>
  <div class="card">
    <div class="setrow"><span class="grow">🕶️ מצב אינקוגניטו<div class="mut small">לא מופיע/ה ברשימת האנשים</div></span><span class="switch ${me.incognito ? 'on' : ''}" onclick="patchMe({incognito:${!me.incognito}})"></span></div>
    <div class="setrow"><span class="grow">🔞 להציג תמונות מפורשות<div class="mut small">כשכבוי — הן מוסתרות לגמרי</div></span><span class="switch ${me.show_explicit ? 'on' : ''}" onclick="patchMe({show_explicit:${!me.show_explicit}})"></span></div>
    <div class="setrow" onclick="enableNotifs()"><span class="grow">🔔 התראות על הודעות</span>←</div>
    <div class="setrow" onclick="installSheet()"><span class="grow">📲 התקנה על המכשיר</span>←</div>
    <div class="setrow" onclick="safetySheet()"><span class="grow">🛡️ מרכז בטיחות וכללים</span>←</div>
    <div class="setrow" onclick="blocksSheet()"><span class="grow">🚫 משתמשים חסומים</span>←</div>
    ${me.account
      ? `<div class="setrow"><span class="grow">✔ ${me.account.google ? 'מחובר/ת עם Google' : 'מחובר/ת עם מייל'}<div class="mut small" style="direction:ltr;text-align:right">${esc(me.account.email || '')}</div></span><button class="btn sec sm" onclick="logout()">התנתקות</button></div>`
      : `<div class="setrow" onclick="accountSheet()"><span class="grow">🔐 שמירת החשבון (Google / מייל)<div class="mut small">כרגע זה חשבון אורח — כדי לכתוב ולא לאבד אותו</div></span>←</div>`}
    <div class="setrow" style="color:var(--bad)" onclick="sheet('<h2>מחיקת חשבון</h2><p class=mut style=margin:10px\\ 0\\ 16px>כל השיחות, התמונות והפרופיל יימחקו לצמיתות.</p><button class=btn style=background:var(--bad) onclick=wipe()>מחק/י הכול</button>')"><span class="grow">🗑️ מחיקת החשבון וכל המידע</span></div>
  </div>`;
}
async function patchMe(b) { try { const d = await api('/me', { method: 'PATCH', body: b }); ME = d.user; render(); } catch (e) { toast(e.message); if (/פרימיום/.test(e.message)) openPremium(); } }
function avatarSheet() {
  sheet(`<h2>תמונת פרופיל</h2>
  <div style="display:flex;justify-content:center;margin:14px 0">${av(ME, 110, false)}</div>
  <p class="mut small" style="margin-bottom:12px;text-align:center">התמונה גלויה לכל המשתמשים — <strong>בלי עירום</strong>. לתמונות חושפניות יש את הגלריה הנעולה 🔒</p>
  <button class="btn" id="avUp" onclick="uploadAvatar()">📷 ${ME.avatar ? 'החלפת תמונה' : 'העלאת תמונה'}</button>
  <button class="btn sec" style="margin-top:8px" onclick="pickEmo()">😎 בחירת אימוג׳י</button>
  ${ME.avatar ? '<button class="btn sec" style="margin-top:8px;color:var(--bad)" onclick="removeAvatar()">הסרת התמונה</button>' : ''}`);
  hydrateImgs($('.sheet'));
}
async function uploadAvatar() {
  const f = await pickFile(); if (!f) return;
  const b = $('#avUp'); if (b) { b.disabled = true; b.textContent = 'מעלה…'; }
  try {
    const blob = await compress(f, 640);
    const up = await api('/media?purpose=avatar', { method: 'POST', body: blob, headers: { 'content-type': 'image/jpeg' } });
    const d = await api('/me/avatar', { body: { media: up.id } });
    ME = d.user; closeSheet(); render(); toast('תמונת הפרופיל עודכנה ✨');
  } catch (e) { toast(e.message); if (b) { b.disabled = false; b.textContent = '📷 העלאת תמונה'; } }
}
async function removeAvatar() { try { const d = await api('/me/avatar', { method: 'DELETE' }); ME = d.user; closeSheet(); render(); } catch (e) { toast(e.message); } }
function pickEmo() { sheet(`<h2>אווטאר</h2><div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:14px;justify-content:center">${EMOJIS.map(e => `<button style="font-size:34px;width:58px;height:58px;border-radius:16px;background:var(--card)" onclick="closeSheet();patchMe({emo:'${e}'})">${e}</button>`).join("")}</div>`); }
function editMe() {
  sheet(`<h2>עריכת פרופיל</h2>
  <div class="lbl">כינוי</div><input id="eNick" maxlength="16" value="${esc(ME.nick)}">
  <div class="row"><div class="grow"><div class="lbl">גיל</div><input id="eAge" type="number" min="18" value="${ME.age}"></div><div class="grow"><div class="lbl">אזור</div><select id="eArea">${AREAS.map((a, i) => `<option value="${i}" ${ME.area === i ? 'selected' : ''}>${a}</option>`).join("")}</select></div></div>
  <div class="lbl">מגדר ${ME.verified ? '(שינוי יבטל את האימות)' : ''}</div><select id="eG">${Object.entries(GLBL).map(([k, v]) => `<option value="${k}" ${ME.gender === k ? 'selected' : ''}>${v}</option>`).join("")}</select>
  <div class="lbl">קצת עליי</div><textarea id="eBio" rows="3" maxlength="300">${esc(ME.bio)}</textarea>
  <div class="lbl">מחפש/ת</div><div id="eLook">${LOOK.map(([k, v]) => `<span class="chip ${ME.looking.includes(k) ? 'on' : ''}" data-k="${k}" onclick="this.classList.toggle('on')">${v}</span>`).join("")}</div>
  <div class="lbl">רמת תוכן</div><div class="lvl" id="eLvl" style="margin:12px 0">${LEVELS.map(([k, e, n]) => `<button data-k="${k}" class="${ME.lvl === k ? 'on' : ''}" onclick="document.querySelectorAll('#eLvl button').forEach(b=>b.classList.remove('on'));this.classList.add('on')"><b>${e}</b>${n}</button>`).join("")}</div>
  <button class="btn" onclick="saveMe()">שמירה</button>`);
}
async function saveMe() {
  await patchMe({ nick: $('#eNick').value, age: $('#eAge').value, area: +$('#eArea').value, gender: $('#eG').value, bio: $('#eBio').value, looking: [...document.querySelectorAll('#eLook .on')].map(x => x.dataset.k), lvl: document.querySelector('#eLvl .on').dataset.k });
  closeSheet();
}
async function addGallery() {
  const f = await pickFile(); if (!f) return;
  toast('מעלה…');
  try { const mid = await upload(f, 'gallery'); await api('/gallery', { body: { media: mid, private: true } }); await loadGallery(); render(); toast('נוספה לגלריה 🔒'); } catch (e) { toast(e.message); }
}
function galItem(gid, priv) {
  sheet(`<h2>תמונה</h2><div class="setrow"><span class="grow">🔒 פרטית (רק למי שאישרת)</span><span class="switch ${priv ? 'on' : ''}" onclick="galPriv('${gid}',${!priv})"></span></div>
  <button class="btn sec" style="margin-top:10px;color:var(--bad)" onclick="galDel('${gid}')">מחיקה</button>`);
}
async function galPriv(gid, p) { await api('/gallery/' + gid, { method: 'PATCH', body: { private: p } }).catch(e => toast(e.message)); closeSheet(); await loadGallery(); render(); }
async function galDel(gid) { await api('/gallery/' + gid, { method: 'DELETE' }).catch(e => toast(e.message)); closeSheet(); await loadGallery(); render(); }
async function revoke(id) { await api('/grants/' + id, { method: 'DELETE' }).catch(() => {}); await loadGallery(); render(); toast('הגישה בוטלה'); }
async function blocksSheet() {
  const d = await api('/blocks');
  sheet('<h2>חסומים</h2>' + (d.blocks.length ? d.blocks.map(u => `<div class="setrow"><span class="grow">${esc(u.emo)} ${esc(u.nick)}</span><button class="btn sec sm" onclick="unblock('${u.id}')">שחרור</button></div>`).join('') : '<p class="mut">אין משתמשים חסומים</p>'));
}
async function unblock(id) { await api('/blocks/' + id, { method: 'DELETE' }).catch(() => {}); blocksSheet(); }
/* ---------- permanent account (Google / email code) ---------- */
// mode: 'create' (guest -> permanent, default) | 'login' (from the landing page / another device)
async function accountSheet(mode = 'create') {
  await configReady;
  const login = mode === 'login';
  const none = !CONFIG.google_client_id && !CONFIG.email_login;
  sheet(`<div style="text-align:center"><div style="font-size:44px">${login ? '👋' : '✍️'}</div>
    <h2>${login ? 'התחברות לחשבון' : 'עוד צעד קטן וכותבים'}</h2>
    <p class="mut small" style="margin:6px 0 16px">${login ? 'התחבר/י עם מה שקישרת לחשבון.' : 'חשבון קבוע מאפשר לשלוח הודעות ולחזור אליו מכל מכשיר. המייל לא מוצג לאף אחד.'}</p></div>
    ${none ? '<p class="mut" style="text-align:center">ההתחברות תיפתח בקרוב.</p>' : ''}
    ${CONFIG.google_client_id ? '<div id="gbtn" style="display:flex;justify-content:center;min-height:44px"></div>' : ''}
    ${CONFIG.google_client_id && CONFIG.email_login ? '<div class="mut small" style="text-align:center;margin:14px 0">או עם מייל</div>' : ''}
    ${CONFIG.email_login ? `<div id="emBox"><input id="emIn" type="email" inputmode="email" autocomplete="email" placeholder="כתובת מייל" style="direction:ltr;text-align:right">
      <button class="btn" id="emGo" style="margin-top:8px" onclick="emailStart()">שליחת קוד למייל</button></div>` : ''}
    <div class="err" id="accErr" style="text-align:center;margin-top:8px"></div>`);
  if (CONFIG.google_client_id) renderGoogle();
}
function loadGis() {
  if (window.google && google.accounts) return Promise.resolve();
  return new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://accounts.google.com/gsi/client'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
}
async function renderGoogle() {
  try {
    await loadGis();
    google.accounts.id.initialize({ client_id: CONFIG.google_client_id, callback: r => authDone(api('/auth/google', { body: { credential: r.credential } })) });
    const el = $('#gbtn'); if (el) google.accounts.id.renderButton(el, { theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: 'he', width: Math.min(320, el.clientWidth || 300) });
  } catch (e) { const el = $('#gbtn'); if (el) el.innerHTML = '<span class="mut small">לא הצלחנו לטעון את Google</span>'; }
}
let emailPending = '';
async function emailStart() {
  const email = $('#emIn').value.trim(); const err = $('#accErr'); err.textContent = '';
  if (!/^\S+@\S+\.\S+$/.test(email)) { err.textContent = 'כתובת מייל לא תקינה'; return; }
  const b = $('#emGo'); b.disabled = true; b.textContent = 'שולח…';
  try {
    await api('/auth/email/start', { body: { email } });
    emailPending = email;
    $('#emBox').innerHTML = `<p class="small" style="text-align:center;margin-bottom:8px">שלחנו קוד בן 6 ספרות אל<br><b style="direction:ltr;display:inline-block">${esc(email)}</b></p>
      <input id="codeIn" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" style="text-align:center;font-size:26px;letter-spacing:10px;direction:ltr">
      <button class="btn" id="codeGo" style="margin-top:8px" onclick="emailVerify()">אישור</button>
      <button class="mut small" style="display:block;margin:10px auto 0" onclick="accountSheet()">שינוי מייל / שליחה מחדש</button>`;
    const ci = $('#codeIn'); ci.focus(); ci.oninput = () => { if (ci.value.replace(/\D/g, '').length === 6) emailVerify(); };
  } catch (e) { err.textContent = e.message; b.disabled = false; b.textContent = 'שליחת קוד למייל'; }
}
function emailVerify() {
  const c = $('#codeIn').value.replace(/\D/g, ''); if (c.length !== 6) return;
  $('#codeGo').disabled = true;
  authDone(api('/auth/email/verify', { body: { email: emailPending, code: c } }), () => { const b = $('#codeGo'); if (b) b.disabled = false; });
}
async function authDone(promise, onFail) {
  try {
    const d = await promise;
    if (d.token) { // logged into an existing permanent account (maybe from another device)
      TOKEN = d.token; try { localStorage.setItem('blush_token', TOKEN); } catch (e) {}
      closeSheet(); toast(`שלום ${d.user.nick} 👋`); ME = d.user; view = null; await boot(); return;
    }
    ME = d.user; closeSheet(); if (view) openView(view, true); else render(); toast('החשבון נשמר ✔ עכשיו אפשר לכתוב');
  } catch (e) {
    if (e.handled) return;
    const err = $('#accErr'); if (err) err.textContent = e.message; else toast(e.message);
    onFail && onFail();
  }
}
async function logout() {
  try { await api('/logout', { method: 'POST' }); } catch (e) {}
  logoutLocal(); location.reload();
}

function tokenSheet() {
  sheet(`<h2>🔐 גישה ממכשיר אחר</h2><p class="mut small" style="margin:8px 0 12px">אין סיסמה ואין מייל — זה מה שמשאיר אותך אנונימי/ת. כדי להתחבר ממכשיר אחר, העתק/י את מפתח הגישה ושמור/י אותו במקום בטוח. מי שיש לו את המפתח — נכנס לחשבון שלך.</p>
  <textarea readonly rows="3" style="font-size:12px;direction:ltr" onclick="this.select()">${TOKEN}</textarea>
  <button class="btn sec" style="margin-top:8px" onclick="navigator.clipboard.writeText(TOKEN).then(()=>toast('הועתק')).catch(()=>toast('סמן/י והעתק/י ידנית'))">העתקה</button>
  <div class="lbl" style="margin-top:14px">התחברות עם מפתח קיים</div><input id="tkIn" placeholder="הדבק/י מפתח" style="direction:ltr;margin-top:12px"><button class="btn" style="margin-top:8px" onclick="useToken()">התחברות</button>`);
}
function useToken() { const t = $('#tkIn').value.trim(); if (!t) return; try { localStorage.setItem('blush_token', t); } catch (e) {} location.reload(); }
async function enableNotifs() {
  if (!('Notification' in window)) return toast('הדפדפן לא תומך בהתראות');
  const p = await Notification.requestPermission();
  toast(p === 'granted' ? '🔔 התראות הופעלו' : 'ההתראות לא אושרו');
}
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
function installSheet() {
  sheet(`<h2>📲 התקנה על המכשיר</h2><p class="mut" style="margin:8px 0 14px">קליק עובד כאפליקציה מלאה — בלי חנות.</p>
  ${deferredInstall ? '<button class="btn" onclick="deferredInstall.prompt();closeSheet()">התקן/י עכשיו</button>' : ''}
  <div class="card" style="margin-top:10px"><strong>אנדרואיד (Chrome)</strong><p class="mut small">⋮ ← "הוסף למסך הבית" / "התקן אפליקציה"</p></div><div class="card"><strong>אייפון (Safari)</strong><p class="mut small">⬆️ שיתוף ← "הוסף למסך הבית"</p></div>`);
}
function safetySheet() {
  sheet(`<h2>🛡️ מרכז בטיחות</h2>
  ${[["🔞", "18+ ואימות סלפי", "כל משתמש מאומת נבדק ידנית: אדם אמיתי, בגיר, ומגדר נכון. בלי מתחזים."], ["🤝", "הסכמה לפני תוכן", "רמות שיחה הדדיות. תמונות מפורשות מטושטשות עד שבוחרים לפתוח. אי אפשר לשלוח תמונה למי שלא ענה."], ["📷", "התמונות שלך — שלך", "גלריה נעולה, גישה לפי אישור, ביטול בכל רגע, תמונות חד-פעמיות, מחיקת מטא-דאטה ומיקום."], ["🧯", "תמונה שלך פורסמה בלי רשות?", "דיווח ← הסרה מיידית. עזרה נוספת: StopNCII.org"], ["💸", "לעולם אל תשלח/י כסף", "בקשת כסף, 'ספונסר' או 'מתנה' = הונאה. דווח/י."], ["🚪", "מחיקה מלאה", "מחיקת שיחה — אצל שני הצדדים. מחיקת חשבון — הכול נעלם."]].map(([e, t, d]) => `<div class="rule" style="margin:12px 0"><b>${e}</b><div><strong>${t}</strong><div class="mut small">${d}</div></div></div>`).join("")}`);
}
async function wipe() { try { await api('/me', { method: 'DELETE' }); } catch (e) {} logoutLocal(); closeSheet(); renderOnboarding(); }

/* ---------- views / sheets ---------- */
function openView(v, silent) {
  if (!v) return;
  const old = $("#full"); const keepInput = old && $('#cin, #rin') ? $('#cin, #rin').value : '';
  old && old.remove();
  const d = document.createElement("div"); d.className = "full"; d.id = "full"; if (silent) d.style.animation = "none";
  if (!silent && !histView) { history.pushState({ klik: 'view' }, ''); histView = true; }
  d.innerHTML = `<div class="chatwrap">${v.t === 'room' ? roomView() : chatView()}</div>`;
  $("#app").appendChild(d);
  const inp = $('#cin, #rin'); if (inp && keepInput) inp.value = keepInput;
  const m = $("#msgs"); if (m) {
    const list = v.t === 'room' ? roomMsgs[v.id] : dmMsgs[v.id], fn = v.t === 'room' ? roomMsgHtml : msgHtml;
    if (list) m.querySelectorAll(':scope > [data-id]').forEach(e => { const it = list.find(x => x.id === e.dataset.id); if (it) e._h = fn(it).trim().replace(/^<div /, `<div data-id="${it.id}" `); });
    m.scrollTop = m.scrollHeight; hydrateImgs(m);
  }
}
/* Navigation: every open window has an ✕, and the phone's back button closes the top-most window. */
let histSheet = false, histView = false, ignorePop = 0;
let pendingBack = 0;
function histBack() { // batch several closes (e.g. sheet + view) into one history jump
  if (pendingBack++ === 0) setTimeout(() => { const n = pendingBack; pendingBack = 0; ignorePop++; history.go(-n); }, 0);
}
function closeView(fromPop) {
  if (view && view.t === 'room') wsSend({ t: 'leave', room: view.id });
  view = null; $("#full") && $("#full").remove();
  if (histView && !fromPop) { histView = false; histBack(); } else histView = false;
  go(tab);
}
function sheet(h) {
  document.querySelectorAll(".scrim").forEach(s => s.remove());
  const s = document.createElement("div"); s.className = "scrim"; s.onclick = e => { if (e.target === s) closeSheet(); };
  s.innerHTML = `<div class="sheet"><button class="sheet-x" onclick="closeSheet()" aria-label="סגירה">✕</button><div class="grab"></div>${h}</div>`;
  $("#app").appendChild(s);
  if (!histSheet) { history.pushState({ klik: 'sheet' }, ''); histSheet = true; }
}
function closeSheet(fromPop) {
  document.querySelectorAll(".scrim").forEach(s => s.remove());
  if (histSheet && !fromPop) { histSheet = false; histBack(); } else histSheet = false;
}
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop--; return; }
  if (histSheet) return closeSheet(true);
  if (histView && view) return closeView(true);
  if (call) return; // never drop a live call on back
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && ME) { loadDms().then(() => { if (tab === 'chats' && !view) $('#main').innerHTML = tabHtml(); }).catch(() => {}); if (!wsOk) connectWS(); } });
setInterval(() => { if (ME && tab === 'rooms' && !view) loadRooms().then(() => { if (tab === 'rooms' && !view) $('#main').innerHTML = tabHtml(); }).catch(() => {}); }, 30000);

boot();
// load any private image (avatars, gallery, chat) as soon as it appears on screen
new MutationObserver(() => hydrateImgs()).observe(document.getElementById('app'), { childList: true, subtree: true });
