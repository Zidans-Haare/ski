// Strava: OAuth und Abruf der Skitage. Garmin-Aktivitäten kommen über die Garmin-Strava-Synchronisierung.
let db, cfg;
const SKI = new Set(['AlpineSki', 'BackcountrySki', 'Snowboard', 'NordicSki']);

export function init(d, c){ db = d; cfg = c; }
export const configured = () => !!(process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET);
export function status(){
  const t = db.getKv('strava');
  return {configured: configured(), connected: !!t, athlete: t ? t.athlete : null};
}
export function disconnect(){ db.delKv('strava'); }

export function authorizeUrl(){
  const q = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID, response_type: 'code', approval_prompt: 'auto',
    redirect_uri: cfg.publicUrl + '/auth/strava/callback', scope: 'activity:read_all'
  });
  return 'https://www.strava.com/oauth/authorize?' + q;
}

async function token(body){
  const r = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({client_id: process.env.STRAVA_CLIENT_ID, client_secret: process.env.STRAVA_CLIENT_SECRET, ...body})
  });
  if (!r.ok) throw new Error('Strava-Token: ' + r.status);
  return r.json();
}

export async function callback(params){
  if (params.get('error') || !params.get('code')) return false;
  const t = await token({code: params.get('code'), grant_type: 'authorization_code'});
  db.setKv('strava', {access: t.access_token, refresh: t.refresh_token, exp: t.expires_at, athlete: t.athlete ? t.athlete.firstname : null});
  return true;
}

async function access(){
  const t = db.getKv('strava');
  if (!t) throw Object.assign(new Error('Strava ist nicht verbunden'), {status: 409});
  if (t.exp * 1000 > Date.now() + 60e3) return t.access;
  const n = await token({grant_type: 'refresh_token', refresh_token: t.refresh});
  db.setKv('strava', {...t, access: n.access_token, refresh: n.refresh_token, exp: n.expires_at});
  return n.access_token;
}

// Skiaktivitäten eines Tages (oder der letzten 14 Tage)
export async function activities(date){
  if (!configured()) throw Object.assign(new Error('Strava ist am Server noch nicht eingerichtet'), {status: 503});
  const tok = await access();
  const start = date ? new Date(date + 'T00:00:00') : new Date(Date.now() - 14 * 864e5);
  const end = date ? new Date(start.getTime() + 864e5) : new Date();
  const q = new URLSearchParams({after: Math.floor(start / 1000), before: Math.floor(end / 1000), per_page: '50'});
  const r = await fetch('https://www.strava.com/api/v3/athlete/activities?' + q, {headers: {Authorization: 'Bearer ' + tok}});
  if (!r.ok) throw Object.assign(new Error('Strava antwortet mit ' + r.status), {status: 502});
  const list = await r.json();
  return list.filter((a) => SKI.has(a.sport_type || a.type)).map((a) => ({
    id: a.id, name: a.name, start: a.start_date_local, type: a.sport_type || a.type,
    km: Math.round(a.distance / 100) / 10, hm: Math.round(a.total_elevation_gain || 0),
    vmax: Math.round((a.max_speed || 0) * 3.6), movingMin: Math.round((a.moving_time || 0) / 60),
    url: 'https://www.strava.com/activities/' + a.id
  }));
}
