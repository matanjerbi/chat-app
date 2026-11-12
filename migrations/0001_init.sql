-- Blush schema
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nick TEXT NOT NULL,
  nick_lc TEXT NOT NULL UNIQUE,
  age INTEGER NOT NULL,
  gender TEXT NOT NULL,            -- m | f | nb | c
  area INTEGER NOT NULL DEFAULT 0,
  emo TEXT NOT NULL DEFAULT '😎',
  bio TEXT NOT NULL DEFAULT '',
  looking TEXT NOT NULL DEFAULT '[]',
  lvl TEXT NOT NULL DEFAULT 'flirt', -- soft | flirt | x
  show_explicit INTEGER NOT NULL DEFAULT 1,
  incognito INTEGER NOT NULL DEFAULT 0,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user', -- user | admin
  verified INTEGER NOT NULL DEFAULT 0, -- 0 none, 1 pending, 2 verified, 3 rejected
  verify_code TEXT,
  verify_media TEXT,
  verify_note TEXT,
  verified_gender TEXT,
  premium_until INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0,
  ban_reason TEXT,
  hidden INTEGER NOT NULL DEFAULT 0, -- hidden from lists pending review (e.g. minor report)
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_seen ON users(last_seen);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emo TEXT NOT NULL DEFAULT '✨',
  descr TEXT NOT NULL DEFAULT '',
  lvl TEXT NOT NULL DEFAULT 'flirt',
  official INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS room_messages (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  user TEXT NOT NULL,
  text TEXT NOT NULL,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rm_room ON room_messages(room, created);

CREATE TABLE IF NOT EXISTS dms (
  id TEXT PRIMARY KEY,
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  lvl TEXT NOT NULL DEFAULT 'soft',
  pending_lvl TEXT,
  pending_by TEXT,
  catch INTEGER NOT NULL DEFAULT 0,
  a_read INTEGER NOT NULL DEFAULT 0,
  b_read INTEGER NOT NULL DEFAULT 0,
  last_at INTEGER NOT NULL,
  created INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_dms_pair ON dms(a, b);
CREATE INDEX IF NOT EXISTS idx_dms_b ON dms(b);

CREATE TABLE IF NOT EXISTS dm_messages (
  id TEXT PRIMARY KEY,
  dm TEXT NOT NULL,
  sender TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'text', -- text | image | sys
  text TEXT,
  media TEXT,
  explicit INTEGER NOT NULL DEFAULT 0,
  once INTEGER NOT NULL DEFAULT 0,
  viewed INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dmm_dm ON dm_messages(dm, created);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  purpose TEXT NOT NULL, -- chat | gallery | verify
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  removed INTEGER NOT NULL DEFAULT 0,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_created ON media(created);

CREATE TABLE IF NOT EXISTS gallery (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  media TEXT NOT NULL,
  private INTEGER NOT NULL DEFAULT 1,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gallery_owner ON gallery(owner);

CREATE TABLE IF NOT EXISTS grants (
  owner TEXT NOT NULL,
  viewer TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (owner, viewer)
);

CREATE TABLE IF NOT EXISTS gallery_requests (
  requester TEXT NOT NULL,
  owner TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (requester, owner)
);

CREATE TABLE IF NOT EXISTS blocks (
  user TEXT NOT NULL,
  target TEXT NOT NULL,
  created INTEGER NOT NULL,
  PRIMARY KEY (user, target)
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter TEXT NOT NULL,
  target TEXT NOT NULL,
  reason TEXT NOT NULL, -- minor | ncii | harass | unsolicited | scam | trafficking | fake | other
  details TEXT,
  dm TEXT,
  media TEXT,
  priority INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open', -- open | resolved | dismissed
  resolution TEXT,
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, priority, created);

CREATE TABLE IF NOT EXISTS admin_log (
  id TEXT PRIMARY KEY,
  admin TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT,
  details TEXT,
  created INTEGER NOT NULL
);

INSERT OR IGNORE INTO rooms (id,name,emo,descr,lvl,official,created) VALUES
 ('salon','הסלון','🛋️','שיחה חופשית על הכול','soft',1,0),
 ('flirt','פלרטוטים','😏','שובבות, מחמאות וקריצות','flirt',1,0),
 ('hot','לילה חם 18+','🌶️','מפורש, בין מבוגרים מסכימים','x',1,0),
 ('tlv','תל אביב והמרכז','🏙️','מי פנוי הערב במרכז?','flirt',1,0),
 ('pride','קשת','🌈','להט״ב, בכל הצבעים','flirt',1,0),
 ('couples','זוגות ופתוחים','💞','זוגות, יחסים פתוחים וסקרנים','x',1,0),
 ('jlm','ירושלים','🕍','צ׳אט לאזור ירושלים','soft',1,0),
 ('north','חיפה והצפון','🌊','צ׳אט לאזור הצפון','soft',1,0),
 ('south','באר שבע והדרום','🏜️','צ׳אט לאזור הדרום','soft',1,0),
 ('night','לא נרדמים','🌙','לינשופי לילה בלבד','flirt',1,0);
