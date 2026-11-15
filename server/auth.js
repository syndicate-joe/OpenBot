// Multi-user mode with auth (roadmap). Off by default for a single person on
// 127.0.0.1. Turn it on in Settings → Team, with OPENBOT_AUTH=1, or automatically
// whenever OPENBOT_HOST exposes the server beyond this machine.
// Accounts share one team workspace (bots, chats, videos); admins manage
// settings, bridges and people.
import crypto from 'node:crypto';
import { db, all, get, run, now, uid, getSetting, setSetting } from './db.js';

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL COLLATE NOCASE, name TEXT,
  pass TEXT NOT NULL, role TEXT DEFAULT 'member', created_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER, expires_at INTEGER
);
`);

const COOKIE = 'ob_session';
const TTL = 30 * 86400000;
const HOST = process.env.OPENBOT_HOST || '127.0.0.1';
const exposed = !['127.0.0.1', 'localhost', '::1'].includes(HOST);

export const authForced = () => exposed || process.env.OPENBOT_AUTH === '1';
export const authEnabled = () => authForced() || !!getSetting('authEnabled', false);
const userCount = () => get('SELECT count(*) AS n FROM users').n;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
function verifyPassword(pw, stored) {
  const [, saltHex, keyHex] = String(stored).split('$');
  if (!saltHex || !keyHex) return false;
  const key = crypto.scryptSync(String(pw), Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const want = Buffer.from(keyHex, 'hex');
  return want.length === key.length && crypto.timingSafeEqual(want, key);
}
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

function cookieOf(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}
function setCookie(req, res, token, maxAgeMs) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token ? encodeURIComponent(token) : ''}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure}`);
}
const publicUser = (u) => u && { id: u.id, username: u.username, name: u.name || u.username, role: u.role, created_at: u.created_at };

export function currentUser(req) {
  const t = cookieOf(req);
  if (!t) return null;
  const s = get('SELECT * FROM sessions WHERE token = ?', sha(t));
  if (!s || s.expires_at < now()) return null;
  return get('SELECT * FROM users WHERE id = ?', s.user_id);
}

function startSession(req, res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  run('INSERT INTO sessions(token, user_id, created_at, expires_at) VALUES(?,?,?,?)', sha(token), user.id, now(), now() + TTL);
  run('DELETE FROM sessions WHERE expires_at < ?', now());
  setCookie(req, res, token, TTL);
}

// Simple brute-force brake: 10 failed logins per IP per 15 minutes.
const attempts = new Map();
const limited = (ip) => {
  const a = attempts.get(ip);
  return a && a.n >= 10 && Date.now() - a.t < 15 * 60000;
};
const fail = (ip) => {
  const a = attempts.get(ip);
  if (!a || Date.now() - a.t > 15 * 60000) attempts.set(ip, { n: 1, t: Date.now() });
  else a.n++;
};

// Video shares and embeds stay viewable without an account unless the video is private.
const SHAREABLE = [
  /^\/embed\/([\w-]+)/, /^\/media\/([\w-]+)\//,
  /^\/api\/videos\/([\w-]+)$/, /^\/api\/videos\/([\w-]+)\/(view|captions\.\w+)$/,
];
const OPEN = [/^\/login(\.html)?$/, /^\/api\/auth\//, /^\/img\//, /^\/manifest\.webmanifest$/, /^\/favicon/];

export function authMiddleware(req, res, next) {
  if (!authEnabled()) { req.user = null; return next(); }
  const p = req.path;
  const user = currentUser(req);
  req.user = user;
  if (user || OPEN.some((re) => re.test(p))) return next();
  for (const re of SHAREABLE) {
    const m = p.match(re);
    if (m && (req.method === 'GET' || p.endsWith('/view'))) {
      const v = get('SELECT visibility FROM videos WHERE id = ?', m[1]);
      if (v && v.visibility !== 'private') return next();
    }
  }
  if (p.startsWith('/api/')) return res.status(401).json({ error: 'Sign in required', auth: true });
  return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
}

export const requireAdmin = (req, res, next) => {
  if (!authEnabled() || req.user?.role === 'admin') return next();
  res.status(403).json({ error: 'Only admins can change this' });
};

const validName = (s) => /^[\w.@-]{2,40}$/.test(String(s || ''));
const validPass = (s) => String(s || '').length >= 8;

export function mountAuth(app) {
  app.get('/api/auth/me', (req, res) => {
    const u = currentUser(req);
    res.json({ enabled: authEnabled(), forced: authForced(), needsSetup: userCount() === 0, user: publicUser(u) });
  });

  // First account becomes the admin. Only possible while there are no users.
  app.post('/api/auth/setup', (req, res) => {
    if (userCount() > 0) return res.status(409).json({ error: 'Already set up. Sign in instead.' });
    const ip = String(req.ip || req.socket.remoteAddress || '');
    if (exposed && !/^(::1|127\.|::ffff:127\.)/.test(ip)) return res.status(403).json({ error: 'Create the first admin from the computer running OpenBot (http://localhost).' });
    const { username, password, name } = req.body || {};
    if (!validName(username)) return res.status(400).json({ error: 'Username: 2-40 letters, numbers, . _ @ or -' });
    if (!validPass(password)) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const id = uid();
    run('INSERT INTO users(id, username, name, pass, role, created_at) VALUES(?,?,?,?,?,?)', id, username, name || username, hashPassword(password), 'admin', now());
    setSetting('authEnabled', true);
    const u = get('SELECT * FROM users WHERE id = ?', id);
    startSession(req, res, u);
    res.json({ user: publicUser(u) });
  });

  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || req.socket.remoteAddress;
    if (limited(ip)) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    const { username, password } = req.body || {};
    const u = get('SELECT * FROM users WHERE username = ?', String(username || ''));
    if (!u || !verifyPassword(password, u.pass)) { fail(ip); return res.status(401).json({ error: 'Wrong username or password' }); }
    attempts.delete(ip);
    startSession(req, res, u);
    res.json({ user: publicUser(u) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const t = cookieOf(req);
    if (t) run('DELETE FROM sessions WHERE token = ?', sha(t));
    setCookie(req, res, '', 0);
    res.json({ ok: true });
  });

  app.post('/api/auth/password', (req, res) => {
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: 'Sign in required' });
    const { current, next } = req.body || {};
    if (!verifyPassword(current, u.pass)) return res.status(400).json({ error: 'Current password is wrong' });
    if (!validPass(next)) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    run('UPDATE users SET pass = ? WHERE id = ?', hashPassword(next), u.id);
    run('DELETE FROM sessions WHERE user_id = ?', u.id);
    startSession(req, res, u);
    res.json({ ok: true });
  });

  // ----- team management (admins) -----
  app.get('/api/users', requireAdmin, (req, res) => res.json(all('SELECT * FROM users ORDER BY created_at').map(publicUser)));
  app.post('/api/users', requireAdmin, (req, res) => {
    const { username, password, name, role = 'member' } = req.body || {};
    if (!validName(username)) return res.status(400).json({ error: 'Username: 2-40 letters, numbers, . _ @ or -' });
    if (!validPass(password)) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (get('SELECT id FROM users WHERE username = ?', username)) return res.status(409).json({ error: 'That username is taken' });
    const id = uid();
    run('INSERT INTO users(id, username, name, pass, role, created_at) VALUES(?,?,?,?,?,?)', id, username, name || username, hashPassword(password), role === 'admin' ? 'admin' : 'member', now());
    res.json(publicUser(get('SELECT * FROM users WHERE id = ?', id)));
  });
  app.patch('/api/users/:id', requireAdmin, (req, res) => {
    const u = get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!u) return res.status(404).end();
    const role = req.body.role === 'admin' ? 'admin' : req.body.role === 'member' ? 'member' : u.role;
    if (u.role === 'admin' && role !== 'admin' && get("SELECT count(*) AS n FROM users WHERE role = 'admin'").n <= 1) return res.status(400).json({ error: 'Keep at least one admin' });
    run('UPDATE users SET role = ?, name = ? WHERE id = ?', role, req.body.name ?? u.name, u.id);
    if (req.body.password) {
      if (!validPass(req.body.password)) return res.status(400).json({ error: 'Password must be at least 8 characters' });
      run('UPDATE users SET pass = ? WHERE id = ?', hashPassword(req.body.password), u.id);
      run('DELETE FROM sessions WHERE user_id = ?', u.id);
    }
    res.json(publicUser(get('SELECT * FROM users WHERE id = ?', u.id)));
  });
  app.delete('/api/users/:id', requireAdmin, (req, res) => {
    const u = get('SELECT * FROM users WHERE id = ?', req.params.id);
    if (!u) return res.status(404).end();
    if (u.role === 'admin' && get("SELECT count(*) AS n FROM users WHERE role = 'admin'").n <= 1) return res.status(400).json({ error: 'Keep at least one admin' });
    if (req.user?.id === u.id) return res.status(400).json({ error: "You can't remove yourself" });
    run('DELETE FROM users WHERE id = ?', u.id);
    res.json({ ok: true });
  });

  // Turn team mode on/off. Turning it on needs an admin account first.
  app.put('/api/auth/config', requireAdmin, (req, res) => {
    const enabled = !!req.body.enabled;
    if (enabled && userCount() === 0) return res.status(400).json({ error: 'Create the admin account first', needsSetup: true });
    if (!enabled && authForced()) return res.status(400).json({ error: 'Sign-in is required while OpenBot is shared on the network' });
    setSetting('authEnabled', enabled);
    res.json({ enabled: authEnabled() });
  });
}
