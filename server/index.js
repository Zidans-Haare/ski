// Skisaison-Server: liefert die PWA aus und bietet eine kleine API.
// Ein Benutzer, ein Passwort. Daten in SQLite, Fotos als Dateien.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {openDb} from './db.js';
import {journeys} from './oebb.js';
import {report} from './report.js';
import * as strava from './strava.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));

const cfg = {
  port: +(process.env.PORT || 3100),
  host: process.env.HOST || '127.0.0.1',
  dataDir: process.env.DATA_DIR || path.join(ROOT, 'data'),
  password: process.env.APP_PASSWORD || '',
  secret: process.env.SESSION_SECRET || '',
  publicUrl: (process.env.PUBLIC_URL || 'http://localhost:3100').replace(/\/$/, ''),
};
// Ohne APP_PASSWORD läuft die App offen (ohne Anmeldung)
const open = !cfg.password;
if (cfg.secret.length < 32) {
  console.error('SESSION_SECRET (mind. 32 Zeichen) muss gesetzt sein. Siehe .env.example');
  process.exit(1);
}
if (open) console.log('Hinweis: kein APP_PASSWORD gesetzt, die App ist ohne Anmeldung erreichbar.');
const secure = cfg.publicUrl.startsWith('https://');
const PUBLIC = path.join(ROOT, 'public');
// Versionskennung aus dem Inhalt der App-Dateien. Neue Version = neue Datei-URLs, so kann kein Cache (auch nicht Cloudflare) Altes liefern.
const V = crypto.createHash('sha256').update(['index.html', 'app.js', 'app.css', 'data.js', 'sw.js'].map((f) => fs.readFileSync(path.join(PUBLIC, f))).join('')).digest('hex').slice(0, 10);
const PHOTOS = path.join(cfg.dataDir, 'photos');
fs.mkdirSync(PHOTOS, {recursive: true});
const db = openDb(path.join(cfg.dataDir, 'ski.db'));
strava.init(db, cfg);

/* ---------- Sitzung ---------- */
const sign = (v) => crypto.createHmac('sha256', cfg.secret).update(v).digest('base64url');
function makeSession(){
  const exp = Date.now() + 1000 * 60 * 60 * 24 * 180;
  const v = String(exp);
  return v + '.' + sign(v);
}
function authed(req){
  if (open) return true;
  const m = /(?:^|;\s*)sid=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [v, s] = m[1].split('.');
  if (!v || !s) return false;
  const good = sign(v);
  if (s.length !== good.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good))) return false;
  return +v > Date.now();
}
const cookie = (val, maxAge) => `sid=${val}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}` + (secure ? '; Secure' : '');
const pwHash = crypto.createHash('sha256').update(cfg.password).digest();
// Bremse gegen Passwort-Raten: pro IP (von nginx gesetzt) und global, weil Header fälschbar sind
const fails = new Map();
const globalFails = [];

/* ---------- Helfer ---------- */
function send(res, status, body, headers = {}){
  const isBuf = Buffer.isBuffer(body);
  const data = isBuf ? body : JSON.stringify(body);
  res.writeHead(status, {'Content-Type': isBuf ? 'application/octet-stream' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers});
  res.end(data);
}
function readBody(req, limit){
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Zu groß'), {status: 413})); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
const readJson = async (req, limit = 2e6) => JSON.parse((await readBody(req, limit)).toString('utf8') || '{}');

const TYPES = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' blob: data:",
  "frame-src https://www.meteoblue.com",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
function serveStatic(req, res, urlPath){
  let rel = decodeURIComponent(urlPath);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 400, {error: 'Ungültiger Pfad'});
  fs.stat(file, (err, st) => {
    const target = err || !st.isFile() ? path.join(PUBLIC, 'index.html') : file;
    const ext = path.extname(target);
    // App-Dateien immer neu prüfen lassen (ETag), offline übernimmt der Service Worker
    const versioned = /[?&]v=/.test(req.url);
    const noCache = !versioned && ['.html', '.webmanifest', '.js', '.css'].includes(ext);
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': noCache ? 'no-cache' : versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    });
    if (req.method === 'HEAD') return res.end();
    if (ext === '.html' || target.endsWith('sw.js')) return fs.readFile(target, 'utf8', (e, txt) => res.end(e ? '' : txt.replaceAll('__V__', V)));
    fs.createReadStream(target).pipe(res);
  });
}

/* ---------- Routen ---------- */
async function api(req, res, url){
  const p = url.pathname, m = req.method;

  if (p === '/api/health') return send(res, 200, {ok: true});

  const rm = /^\/api\/report\/([a-z]+)$/.exec(p);
  if (rm && m === 'GET') {
    try { return send(res, 200, await report(rm[1]), {'Cache-Control': 'public, max-age=600'}); }
    catch (e) { console.error('bergfex', e.message); return send(res, 502, {error: 'Schneebericht gerade nicht erreichbar'}); }
  }

  if (p === '/api/login' && m === 'POST') {
    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
    const f = fails.get(ip) || {n: 0, t: 0};
    while (globalFails.length && Date.now() - globalFails[0] > 15 * 60e3) globalFails.shift();
    if ((f.n >= 5 && Date.now() - f.t < 15 * 60e3) || globalFails.length >= 20) return send(res, 429, {error: 'Zu viele Versuche. Warte 15 Minuten.'});
    // Versuch sofort zählen (vor jedem await), damit parallele Anfragen die Bremse nicht umgehen
    const stamp = Date.now();
    fails.set(ip, {n: f.n + 1, t: stamp}); globalFails.push(stamp);
    if (fails.size > 1000) fails.clear();
    const {password} = await readJson(req, 1e4);
    const ok = !open && typeof password === 'string' && crypto.timingSafeEqual(crypto.createHash('sha256').update(password).digest(), pwHash);
    if (!ok) { await new Promise((r) => setTimeout(r, 400)); return send(res, 401, {error: 'Falsches Passwort'}); }
    fails.delete(ip);
    const gi = globalFails.indexOf(stamp); if (gi >= 0) globalFails.splice(gi, 1);
    return send(res, 200, {ok: true}, {'Set-Cookie': cookie(makeSession(), 60 * 60 * 24 * 180)});
  }
  if (p === '/api/logout' && m === 'POST') return send(res, 200, {ok: true}, {'Set-Cookie': cookie('', 0)});

  const isAuthed = authed(req);
  if (p === '/api/me') return send(res, 200, {auth: isAuthed, open, strava: isAuthed ? strava.status() : null});
  if (!isAuthed) return send(res, 401, {error: 'Nicht angemeldet'});

  if (p === '/api/state' && m === 'GET') return send(res, 200, db.getState());
  if (p === '/api/state' && m === 'PUT') {
    const body = await readJson(req, 4e6);
    return send(res, 200, db.putState(body));
  }

  if (p === '/api/photos' && m === 'POST') {
    const type = req.headers['content-type'] || '';
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(type)) return send(res, 415, {error: 'Nur Bilder'});
    const buf = await readBody(req, 20e6);
    const id = crypto.randomBytes(12).toString('base64url');
    await fs.promises.writeFile(path.join(PHOTOS, id), buf);
    db.addPhoto(id, type, buf.length);
    return send(res, 201, {id});
  }
  const pm = /^\/api\/photos\/([\w-]{8,40})$/.exec(p);
  if (pm && m === 'GET') {
    const meta = db.getPhoto(pm[1]);
    if (!meta) return send(res, 404, {error: 'Foto nicht gefunden'});
    const buf = await fs.promises.readFile(path.join(PHOTOS, pm[1]));
    return send(res, 200, buf, {'Content-Type': meta.mime, 'Cache-Control': 'private, max-age=31536000, immutable'});
  }

  if (p === '/api/journeys' && m === 'GET') {
    const to = url.searchParams.get('to'), when = url.searchParams.get('when');
    if (!to) return send(res, 400, {error: 'Ziel fehlt'});
    try { return send(res, 200, await journeys(to, when ? new Date(when) : new Date())); }
    catch (e) { console.error('ÖBB', e.message); return send(res, 502, {error: 'ÖBB-Auskunft gerade nicht erreichbar'}); }
  }

  if (p === '/api/strava/activities' && m === 'GET') {
    try { return send(res, 200, await strava.activities(url.searchParams.get('date'))); }
    catch (e) { return send(res, e.status || 502, {error: e.message}); }
  }
  if (p === '/api/strava/disconnect' && m === 'POST') { strava.disconnect(); return send(res, 200, {ok: true}); }

  return send(res, 404, {error: 'Unbekannt'});
}

async function auth(req, res, url){
  if (!authed(req)) { res.writeHead(302, {Location: '/#/saison'}); return res.end(); }
  if (url.pathname === '/auth/strava') {
    if (!strava.configured()) return send(res, 503, {error: 'Strava ist auf dem Server noch nicht eingerichtet'});
    const state = crypto.randomBytes(16).toString('base64url');
    res.writeHead(302, {Location: strava.authorizeUrl(state), 'Set-Cookie': `stv=${state}.${sign(state)}; Path=/auth/strava; HttpOnly; SameSite=Lax; Max-Age=600` + (secure ? '; Secure' : '')});
    return res.end();
  }
  if (url.pathname === '/auth/strava/callback') {
    const m = /(?:^|;\s*)stv=([^;.]+)\.([^;]+)/.exec(req.headers.cookie || '');
    const st = url.searchParams.get('state') || '';
    const valid = m && m[1].length === st.length && crypto.timingSafeEqual(Buffer.from(m[1]), Buffer.from(st)) && sign(m[1]) === m[2];
    const clear = `stv=; Path=/auth/strava; HttpOnly; SameSite=Lax; Max-Age=0` + (secure ? '; Secure' : '');
    if (!valid) { res.writeHead(302, {Location: '/#/saison?strava=fehler', 'Set-Cookie': clear}); return res.end(); }
    const ok = await strava.callback(url.searchParams).catch((e) => { console.error('Strava', e.message); return false; });
    res.setHeader('Set-Cookie', clear);
    res.writeHead(302, {Location: '/#/saison?strava=' + (ok ? 'ok' : 'fehler')}); return res.end();
  }
  send(res, 404, {error: 'Unbekannt'});
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (url.pathname.startsWith('/auth/')) return await auth(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, {error: 'Methode nicht erlaubt'});
    serveStatic(req, res, url.pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e.status || 500, {error: e.status === 413 ? 'Datei zu groß' : 'Serverfehler'});
  }
});
server.listen(cfg.port, cfg.host, () => console.log(`Skisaison läuft auf http://${cfg.host}:${cfg.port}`));
const stop = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGTERM', stop); process.on('SIGINT', stop);
