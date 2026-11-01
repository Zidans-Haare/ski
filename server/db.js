// SQLite über das eingebaute node:sqlite (kein nativer Build nötig)
import {DatabaseSync} from 'node:sqlite';

export function openDb(file){
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS photos (id TEXT PRIMARY KEY, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL);
  `);
  const get = db.prepare('SELECT value, updated_at FROM kv WHERE key = ?');
  const put = db.prepare('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at');
  const addPhoto = db.prepare('INSERT INTO photos (id, mime, size, created_at) VALUES (?, ?, ?, ?)');
  const getPhoto = db.prepare('SELECT mime FROM photos WHERE id = ?');
  const STATE_KEYS = ['diary', 'trip', 'pass', 'prices'];

  return {
    getState(){
      const out = {updatedAt: 0};
      for (const k of STATE_KEYS) {
        const r = get.get(k);
        if (r) { out[k] = JSON.parse(r.value); out.updatedAt = Math.max(out.updatedAt, r.updated_at); }
      }
      return out;
    },
    putState(body){
      const now = Date.now();
      for (const k of STATE_KEYS) if (body[k] !== undefined) put.run(k, JSON.stringify(body[k]), now);
      return {updatedAt: now};
    },
    getKv(k){ const r = get.get(k); return r ? JSON.parse(r.value) : null; },
    setKv(k, v){ put.run(k, JSON.stringify(v), Date.now()); },
    delKv(k){ db.prepare('DELETE FROM kv WHERE key = ?').run(k); },
    addPhoto(id, mime, size){ addPhoto.run(id, mime, size, Date.now()); },
    getPhoto(id){ return getPhoto.get(id); },
    close(){ db.close(); }
  };
}
