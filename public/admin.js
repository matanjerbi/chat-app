'use strict';
let TOKEN = null; try { TOKEN = localStorage.getItem('blush_token'); } catch (e) {}
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const GL = { m: 'גבר', f: 'אישה', nb: 'א-בינארי', c: 'זוג' };
const AREAS = ["תל אביב והמרכז", "ירושלים", "חיפה והצפון", "השרון", "השפלה", "באר שבע והדרום", "אילת"];
const RS = { avatar: 'תמונת פרופיל לא הולמת', minor: '🚨 קטין/ה', ncii: '🚨 תמונה ללא הסכמה', trafficking: '🚨 זנות/סחר', harass: 'הטרדה', unsolicited: 'תוכן לא רצוי', fake: 'מתחזה', scam: 'הונאה', other: 'אחר' };
const VS = ['—', '⏳ ממתין', '✔ מאומת', '✖ נדחה'];
const dt = t => t ? new Date(t).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
let tab = 'dash', STATS = {};
const mc = {};
function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; d.style.position = 'fixed'; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }

async function api(path, opt = {}) {
  const h = { authorization: 'Bearer ' + TOKEN };
  let body = opt.body; if (body) { body = JSON.stringify(body); h['content-type'] = 'application/json'; }
  const r = await fetch('/api' + path, { method: opt.method || (body ? 'POST' : 'GET'), headers: h, body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'שגיאה');
  return d;
}
async function img(id) {
  if (mc[id]) return mc[id];
  const r = await fetch('/api/media/' + id, { headers: { authorization: 'Bearer ' + TOKEN } });
  if (!r.ok) return null; return (mc[id] = URL.createObjectURL(await r.blob()));
}
function hydrate() { document.querySelectorAll('[data-media]:not([data-l])').forEach(async el => { el.dataset.l = 1; const u = await img(el.dataset.media); if (u) el.style.backgroundImage = `url("${u}")`; }); }

async function boot() {
  if (!TOKEN) return deny('יש להתחבר קודם באפליקציה');
  try { const d = await api('/me'); if (d.user.role !== 'admin') return deny('אין לך הרשאת אדמין'); } catch (e) { return deny(e.message); }
  go('dash'); setInterval(() => { if (tab === 'dash') go('dash', true); }, 20000);
}
function deny(m) { $('#app').innerHTML = `<div class="center"><div><div style="font-size:50px">🛡️</div><h2>${esc(m)}</h2><p class="mut" style="margin:10px 0"><a href="/" style="color:var(--pink2)">חזרה לאפליקציה</a></p></div></div>`; }

function shell(content) {
  const T = [['dash', '📊 לוח בקרה'], ['reports', '⚠️ דיווחים', STATS.open_reports], ['verify', '🤳 אימותים', STATS.pending_verifications], ['users', '👥 משתמשים'], ['media', '🖼️ תמונות'], ['rooms', '🏠 חדרים'], ['log', '📜 יומן']];
  $('#app').innerHTML = `<div class="adm"><div class="atop"><div class="logo">קליק</div><span class="tag f">🛡️ אדמין</span><div class="grow"></div><a href="/" class="btn sec sm" style="text-decoration:none">לאפליקציה ←</a></div>
  <div class="tabs">${T.map(([k, l, n]) => `<button class="${tab === k ? 'on' : ''}" onclick="go('${k}')">${l}${n ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>
  <div id="c">${content}</div></div>`;
  hydrate();
}
async function go(t, silent) {
  tab = t; if (!silent) shell('<div class="spinner"></div>');
  try {
    STATS = await api('/admin/stats');
    const html = await ({ dash, reports, verify, users, media, rooms, log })[t]();
    shell(html);
  } catch (e) { shell(`<p class="err">${esc(e.message)}</p>`); }
}

async function dash() {
  const s = STATS;
  const st = (l, v, w) => `<div class="stat ${w ? 'warn' : ''}"><span class="mut small">${l}</span><b>${v}</b></div>`;
  return `<div class="stats">${st('מחוברים עכשיו', s.online)}${st('משתמשים', s.users)}${st('חדשים ב-24 שעות', s.new_users)}${st('מאומתים', s.verified)}${st('ממתינים לאימות', s.pending_verifications, s.pending_verifications)}
  ${st('דיווחים פתוחים', s.open_reports, s.open_reports)}${st('🚨 דחופים', s.urgent_reports, s.urgent_reports)}${st('פרימיום', s.premium)}${st('הודעות בחדרים (24ש)', s.room_msgs_24h)}${st('הודעות פרטיות (24ש)', s.dm_msgs_24h)}${st('תמונות (24ש)', s.media_24h)}${st('מושעים', s.banned)}</div>
  <div class="card" style="margin-top:14px"><strong>📌 לפני השקה</strong><ul class="mut small" style="margin:8px 18px 0;line-height:1.9">
  <li>חיבור דומיין משלך ב-Cloudflare והפעלת <b>CSAM Scanning Tool</b> (Caching → Configuration) לסריקת תמונות</li>
  <li>תנאי שימוש ומדיניות פרטיות שנכתבו עם עו״ד</li><li>ספק סליקה שמאשר את התחום (Grow / PayPlus / סולק בינלאומי)</li><li>מענה לדיווחים דחופים (קטינים / ללא הסכמה) תוך שעות</li></ul></div>`;
}

async function reports() {
  const d = await api('/admin/reports?status=open');
  if (!d.reports.length) return `<div class="empty"><div class="e">✅</div>אין דיווחים פתוחים</div>`;
  return `<table><tr><th>עדיפות</th><th>סיבה</th><th>מדווח/ת על</th><th>מדווח/ת</th><th>פרטים</th><th>זמן</th><th></th></tr>
  ${d.reports.map(r => `<tr><td class="pr${r.priority}">${['רגיל', 'גבוה', 'דחוף'][r.priority]}</td><td>${RS[r.reason] || r.reason}</td>
  <td>${esc(r.t_emo)} ${esc(r.t_nick)} ${r.t_banned ? '<span class="tag x">מושעה</span>' : ''}${r.t_hidden ? '<span class="tag">מוסתר</span>' : ''}<div class="mut small">${r.t_reports} דיווחים סה״כ</div></td>
  <td class="mut">${esc(r.r_nick || '—')}</td><td class="small">${esc(r.details || '')}</td><td class="mut small">${dt(r.created)}</td>
  <td><div class="acts"><button onclick="reportDetail('${r.id}')">פרטים</button><button class="bad" onclick="repAct('${r.id}','ban')">השעיה</button>${r.media ? `<button onclick="repAct('${r.id}','remove_media')">הסרת תמונה</button>` : ''}<button class="ok" onclick="repAct('${r.id}','dismiss')">סגירה</button></div></td></tr>`).join('')}</table>`;
}
async function reportDetail(id) {
  const d = await api('/admin/reports/' + id);
  const r = d.report;
  modal(`<h2>${RS[r.reason]}</h2><p class="mut small">${esc(r.details || 'אין פרטים')}</p>
  ${d.context.length ? `<div class="sec-title">הקשר מהשיחה (30 אחרונות)</div><div class="ctx">${d.context.map(m => `<div><b style="color:${m.sender === r.target ? 'var(--pink2)' : 'var(--mut)'}">${m.sender === r.target ? 'המדווח/ת' : 'המדווח/ת על'}</b>${m.sender === r.target ? '' : ''}: ${m.kind === 'image' ? `📷 <a href="#" onclick="event.preventDefault();peek('${m.media}')">תמונה</a>${m.explicit ? ' 🔞' : ''}` : esc(m.text)} <span class="mut">${dt(m.created)}</span></div>`).join('')}</div>` : ''}
  ${r.media ? `<div class="sec-title">התמונה המדווחת</div><div class="mgrid"><div class="it"><div class="ph" data-media="${r.media}" onclick="this.classList.toggle('show')"></div></div></div>` : ''}
  <div class="sec-title">תמונות אחרונות של המדווח/ת עליו</div><div class="mgrid">${d.media.map(m => `<div class="it"><div class="ph" data-media="${m.id}" onclick="this.classList.toggle('show')"></div><div class="b">${m.purpose}${m.removed ? ' · הוסרה' : ''}</div></div>`).join('') || '<span class="mut small">אין</span>'}</div>
  <div class="acts" style="margin-top:14px"><button class="bad" onclick="repAct('${r.id}','ban')">השעיה</button>${r.media ? `<button onclick="repAct('${r.id}','remove_media')">הסרת תמונה</button>` : ''}<button class="ok" onclick="repAct('${r.id}','dismiss')">סגירה ללא פעולה</button></div>`);
  hydrate();
}
function peek(mid) { modal(`<div class="ph" data-media="${mid}" style="height:70vh;background:#000 center/contain no-repeat;border-radius:12px"></div>`); hydrate(); }
async function repAct(id, action) {
  let note = '';
  if (action === 'ban') { note = await ask('סיבת השעיה (תוצג למשתמש):', 'הפרת כללי הקהילה'); if (note === null) return; }
  try { await api('/admin/reports/' + id, { body: { action, note } }); closeModal(); toast('בוצע ✔'); go('reports', true); } catch (e) { toast(e.message); }
}

async function verify() {
  const d = await api('/admin/verifications');
  if (!d.verifications.length) return `<div class="empty"><div class="e">✅</div>אין אימותים ממתינים</div>`;
  return `<p class="mut small" style="margin-bottom:10px">בדוק/י: (1) אדם אמיתי ולא תמונה ממסך, (2) הקוד והתנועה מופיעים, (3) נראה/ית מעל 18 בבירור, (4) המגדר תואם להצהרה.</p>
  <div class="vgrid">${d.verifications.map(v => `<div class="vcard"><div class="ph" data-media="${v.verify_media}"></div><div class="b">
  <div class="row">${v.avatar ? `<div data-media="${v.avatar}" style="width:52px;height:52px;border-radius:50%;background:#000 center/cover" title="תמונת הפרופיל"></div>` : ''}<div><div style="font-weight:700">${esc(v.emo)} ${esc(v.nick)}</div>${v.avatar ? '<div class="mut small">👈 בדוק/י שתמונת הפרופיל תואמת לסלפי</div>' : ''}</div></div><div class="mut small">${v.age} · הצהיר/ה: <b style="color:#fff">${GL[v.gender]}</b> · ${AREAS[v.area] || ''}</div>
  ${v.verify_code ? `<div class="small" style="margin:6px 0">קוד: <b style="font-size:18px;color:var(--pink2)">${v.verify_code.code}</b> · ${esc(v.verify_code.g)}</div>` : ''}
  <div class="lbl">מגדר מאומת</div><select id="vg_${v.id}" style="margin:8px 0">${Object.entries(GL).map(([k, l]) => `<option value="${k}" ${k === v.gender ? 'selected' : ''}>${l}</option>`).join('')}</select>
  <div class="acts"><button class="ok" onclick="vAct('${v.id}',true)">✔ אישור</button><button onclick="vAct('${v.id}',false)">✖ דחייה</button><button class="bad" onclick="vAct('${v.id}',false,true)">🚨 קטין/ה</button></div></div></div>`).join('')}</div>`;
}
async function vAct(uid, approve, underage) {
  let note = '';
  if (!approve && !underage) { note = await ask('סיבת הדחייה (תוצג למשתמש):', 'הקוד או התנועה לא נראים בתמונה'); if (note === null) return; }
  if (underage) note = 'נראה/ית מתחת לגיל 18';
  try { await api('/admin/verifications/' + uid, { body: { approve, gender: approve ? $('#vg_' + uid).value : undefined, note, underage } }); toast('בוצע ✔'); go('verify', true); } catch (e) { toast(e.message); }
}

let uq = '', uf = '';
async function users() {
  const d = await api(`/admin/users?q=${encodeURIComponent(uq)}&filter=${uf}`);
  return `<div class="row" style="margin-bottom:10px;flex-wrap:wrap"><input id="uq" placeholder="חיפוש לפי כינוי" value="${esc(uq)}" style="max-width:260px" onkeydown="if(event.key==='Enter'){uq=this.value;go('users')}">
  ${[['', 'הכול'], ['banned', 'מושעים'], ['premium', 'פרימיום'], ['hidden', 'מוסתרים'], ['admin', 'אדמינים']].map(([k, l]) => `<span class="chip ${uf === k ? 'on' : ''}" onclick="uf='${k}';go('users')">${l}</span>`).join('')}</div>
  <table><tr><th>משתמש</th><th>פרטים</th><th>אימות</th><th>פרימיום</th><th>דיווחים</th><th>נראה</th><th></th></tr>
  ${d.users.map(u => `<tr><td>${u.online ? '🟢' : '⚪'} ${esc(u.emo)} <b>${esc(u.nick)}</b> ${u.role === 'admin' ? '<span class="tag f">אדמין</span>' : ''} ${u.banned ? `<span class="tag x" title="${esc(u.ban_reason)}">מושעה</span>` : ''} ${u.hidden ? '<span class="tag">מוסתר</span>' : ''}</td>
  <td class="mut small">${u.age} · ${GL[u.gender]}</td><td class="small">${VS[u.verified]}</td><td class="small">${u.premium_until > Date.now() ? 'עד ' + new Date(u.premium_until).toLocaleDateString('he-IL') : '—'}</td>
  <td>${u.reports || ''}</td><td class="mut small">${dt(u.last_seen)}</td>
  <td><div class="acts">${u.banned ? `<button class="ok" onclick="uAct('${u.id}','unban')">ביטול השעיה</button>` : `<button class="bad" onclick="uAct('${u.id}','ban')">השעיה</button>`}
  <button onclick="uAct('${u.id}','premium')">👑 פרימיום</button>${u.hidden ? `<button onclick="uAct('${u.id}','unhide')">הצגה</button>` : ''}${u.verified === 2 ? `<button onclick="uAct('${u.id}','unverify')">ביטול אימות</button>` : ''}
  <button onclick="uAct('${u.id}','${u.role === 'admin' ? 'unadmin' : 'admin'}')">${u.role === 'admin' ? 'הסר אדמין' : 'הפוך לאדמין'}</button><button class="bad" onclick="uAct('${u.id}','delete')">🗑️</button></div></td></tr>`).join('')}</table>`;
}
async function uAct(id, action) {
  const b = { action };
  if (action === 'ban') { b.note = await ask('סיבת השעיה:', 'הפרת כללי הקהילה'); if (b.note === null) return; }
  if (action === 'premium') { b.days = await ask('כמה ימים להוסיף? (0 = ביטול)', '30'); if (b.days === null) return; }
  if (action === 'delete') { const c = await ask('הקלד/י "מחק" לאישור מחיקה לצמיתות', ''); if (c !== 'מחק') return; }
  try { await api('/admin/users/' + id, { body: b }); toast('בוצע ✔'); go('users', true); } catch (e) { toast(e.message); }
}

async function media() {
  const d = await api('/admin/media');
  return `<p class="mut small" style="margin-bottom:10px">תמונות אחרונות (מטושטשות — לחיצה לחשיפה).</p><div class="mgrid">${d.media.map(m => `<div class="it"><div class="ph" data-media="${m.id}" onclick="this.classList.toggle('show')"></div><div class="b">${esc(m.nick)} · ${{ chat: 'צ׳אט', gallery: 'גלריה', avatar: 'פרופיל' }[m.purpose] || m.purpose}<br><span class="mut">${dt(m.created)}</span><div class="acts" style="margin-top:4px"><button class="bad" onclick="mAct('${m.id}')">הסרה</button></div></div></div>`).join('') || '<span class="mut">אין תמונות</span>'}</div>`;
}
async function mAct(id) { try { await api('/admin/media/' + id, { body: {} }); toast('הוסרה'); go('media', true); } catch (e) { toast(e.message); } }

async function rooms() {
  const d = await api('/admin/rooms');
  return `<div class="card"><strong>חדר רשמי חדש</strong><div class="row" style="margin-top:8px;flex-wrap:wrap"><input id="rn" placeholder="שם" style="max-width:200px"><input id="re" placeholder="אימוג׳י" style="max-width:90px"><input id="rd" placeholder="תיאור" style="max-width:260px"><select id="rl" style="max-width:120px"><option value="soft">רגוע</option><option value="flirt" selected>פלרטוט</option><option value="x">מפורש</option></select><button class="btn sm" onclick="newRoom()">יצירה</button></div></div>
  <table><tr><th>חדר</th><th>רמה</th><th>מחוברים</th><th>הודעות 24ש</th><th>יוצר</th><th></th></tr>
  ${d.rooms.map(r => `<tr style="${r.hidden ? 'opacity:.5' : ''}"><td>${esc(r.emo)} <b>${esc(r.name)}</b> ${r.official ? '<span class="tag g">רשמי</span>' : ''}<div class="mut small">${esc(r.descr)}</div></td><td>${r.lvl}</td><td>${r.online}</td><td>${r.msgs_24h}</td><td class="mut small">${esc(r.creator || 'מערכת')}</td>
  <td><div class="acts"><button onclick="rAct('${r.id}','${r.hidden ? 'unhide' : 'hide'}')">${r.hidden ? 'הצגה' : 'הסתרה'}</button><button onclick="rAct('${r.id}','official')">${r.official ? 'בטל רשמי' : 'הפוך לרשמי'}</button><button onclick="rAct('${r.id}','clear')">ניקוי הודעות</button><button class="bad" onclick="rAct('${r.id}','delete')">מחיקה</button></div></td></tr>`).join('')}</table>`;
}
async function newRoom() { try { await api('/admin/rooms', { body: { name: $('#rn').value, emo: $('#re').value, descr: $('#rd').value, lvl: $('#rl').value } }); go('rooms', true); } catch (e) { toast(e.message); } }
async function rAct(id, action) { try { await api('/admin/rooms/' + id, { body: { action } }); go('rooms', true); } catch (e) { toast(e.message); } }

async function log() {
  const d = await api('/admin/log');
  return `<table><tr><th>זמן</th><th>אדמין</th><th>פעולה</th><th>יעד</th><th>פרטים</th></tr>${d.log.map(l => `<tr><td class="mut small">${dt(l.created)}</td><td>${esc(l.admin_nick || '')}</td><td>${esc(l.action)}</td><td class="mut small">${esc(l.target || '')}</td><td class="mut small">${esc(l.details || '')}</td></tr>`).join('')}</table>`;
}

/* modal + prompt (no native dialogs) */
function modal(h) { closeModal(); const s = document.createElement('div'); s.className = 'scrim'; s.style.position = 'fixed'; s.style.alignItems = 'center'; s.style.justifyContent = 'center'; s.onclick = e => { if (e.target === s) closeModal(); }; s.innerHTML = `<div class="sheet" style="max-width:760px;border-radius:22px;max-height:90vh"><button class="sheet-x" onclick="closeModal()" aria-label="סגירה">✕</button>${h}</div>`; document.body.appendChild(s); }
function closeModal() { document.querySelectorAll('.scrim').forEach(s => s.remove()); }
function ask(q, def) {
  return new Promise(res => {
    modal(`<h2 style="font-size:17px">${esc(q)}</h2><input id="askIn" value="${esc(def)}" style="margin:12px 0"><div class="row"><button class="btn sm" id="askOk">אישור</button><button class="btn sec sm" id="askNo">ביטול</button></div>`);
    $('#askIn').focus();
    $('#askOk').onclick = () => { const v = $('#askIn').value; closeModal(); res(v); };
    $('#askNo').onclick = () => { closeModal(); res(null); };
    $('#askIn').onkeydown = e => { if (e.key === 'Enter') $('#askOk').click(); };
  });
}
boot();
