(function(){
'use strict';

/* ---------- Helfer ---------- */
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = (n) => Math.round(n).toLocaleString('de-AT');
const eur = (n) => n.toLocaleString('de-AT', {minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2}) + ' €';
const day = (d) => new Date(d + 'T12:00');
const dstr = (d, o) => day(d).toLocaleDateString('de-AT', o || {weekday:'short', day:'numeric', month:'short'});
const hm = (min) => { const h = Math.floor(min / 60), m = min % 60; return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min'; };
const ICON = {
  check:'<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  wx:'<svg viewBox="0 0 24 24"><path d="M7 18h10a4 4 0 00.5-8 5.5 5.5 0 00-10.6 1.5A3.3 3.3 0 007 18z"/></svg>',
  cam:'<svg viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 11l5-3v8l-5-3"/></svg>',
  map:'<svg viewBox="0 0 24 24"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/></svg>',
  train:'<svg viewBox="0 0 24 24"><rect x="6" y="3" width="12" height="13" rx="3"/><path d="M6 11h12M9 20l1.5-4M15 20l-1.5-4"/></svg>',
  pin:'<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>'
};
let toastT;
function toast(msg, actLabel, act){
  const t = $('toast');
  t.innerHTML = esc(msg) + (actLabel ? ' <button type="button">' + esc(actLabel) + '</button>' : '');
  if (actLabel) t.querySelector('button').onclick = () => { t.classList.remove('on'); act(); };
  t.classList.add('on'); clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('on'), actLabel ? 8000 : 2200);
}

/* ---------- Speicher ---------- */
const store = {
  get(k, d){ try { const v = localStorage.getItem('ski.' + k); return v ? JSON.parse(v) : d; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem('ski.' + k, JSON.stringify(v)); } catch(e){ toast('Speichern fehlgeschlagen. Ist der Speicher voll?'); } }
};
// Fotos liegen in IndexedDB, nicht im localStorage
const photoDB = (() => {
  let dbp;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open('skisaison', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('photos');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = (mode, fn) => open().then((db) => new Promise((res, rej) => {
    const t = db.transaction('photos', mode); const q = fn(t.objectStore('photos'));
    t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
  }));
  const urls = {};
  return {
    put: (id, blob) => tx('readwrite', (s) => s.put(blob, id)),
    blob: (id) => tx('readonly', (s) => s.get(id)),
    url: async (id) => { if (urls[id]) return urls[id]; const b = await tx('readonly', (s) => s.get(id)); return b ? (urls[id] = URL.createObjectURL(b)) : null; }
  };
})();
function shrink(file){
  return new Promise((res) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => {
      const max = 1600, k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      c.toBlob((b) => res(b || file), 'image/jpeg', .82);
    };
    img.onerror = () => { URL.revokeObjectURL(u); res(file); };
    img.src = u;
  });
}

/* ---------- Daten ---------- */
const BY = {}; AREAS.forEach((a) => { BY[a.id] = a; });
const TIER_SHORT = {1:'Tagesausflug', 2:'Lange Anreise', 3:'Mit Übernachtung', 4:'Keine Öffi-Verbindung'};
// Ungefähre Höhe für die Wettervorhersage (Mittelstation)
const ELEV = {gerlitzen:1500,nassfeld:1500,dreilaendereck:1100,hrast:620,goldeck:1600,ankogel:2000,moelltaler:2200,bkk:1500,weissensee:1100,weissbriach:1000,koetschach:1000,petzen:1300,lienz:1800,katschberg:1700,emberger:1800,heiligenblut:2000,turracher:1900,hochrindl:1700,falkert:1800,simonhoehe:1200,sillian:1800,obertilliach:1700,kartitsch:1400,matrei:2000,stjakob:1800,praegraten:1300,klippitz:1600,koralpe:1700,weinebene:1700,flattnitz:1400,bodental:1050};
// Tageskarte Erwachsene, Hauptsaison. Recherche 01.11.2026
const PRICE_SRC = {
 gerlitzen:[73,'ok','2026/27'],nassfeld:[73,'ok','2026/27, Nebensaison 67,50 €'],bkk:[73,'ok','2026/27'],katschberg:[73,'ok','2026/27'],
 moelltaler:[72,'ok','2026/27'],turracher:[72.5,'ok','2026/27'],goldeck:[64.5,'ok','2026/27, inkl. 2 h Hallenbad'],
 petzen:[49,'ok','2026/27, ab 9 Uhr'],klippitz:[49,'ok','2026/27'],koralpe:[43.5,'ok','2026/27'],
 lienz:[74,'ok','2026/27'],sillian:[74,'ok','2026/27'],matrei:[74,'ok','2026/27'],stjakob:[74,'ok','2026/27'],
 obertilliach:[52,'ok','2026/27, ab 6.3. 47 €'],falkert:[34,'ok','2026/27'],
 weissensee:[52.4,'alt','bergfex, Saison unklar'],bodental:[36,'alt','bergfex, Saison unklar'],
 ankogel:[54,'alt','2025/26'],hochrindl:[52,'alt','2025/26'],simonhoehe:[47,'alt','2025/26'],weinebene:[38.5,'alt','2025/26'],
 heiligenblut:[47,'alt','dynamische Preise, ab ca. 47 €'],weissbriach:[34,'alt','Stand 2023'],hrast:[28,'alt','älterer Stand'],
 dreilaendereck:[32.5,'alt','älterer Stand, Betrieb nach Insolvenz unklar'],flattnitz:[24,'alt','älterer Stand, Betrieb nach Insolvenz unklar'],
 emberger:[42,'est','keine Quelle gefunden'],koetschach:[32,'est','keine Quelle gefunden'],kartitsch:[30,'est','keine Quelle gefunden'],praegraten:[25,'est','keine Quelle gefunden']
};
const priceOverride = store.get('prices', {});
const price = (id) => priceOverride[id] != null ? priceOverride[id] : PRICE_SRC[id][0];

const COMBOS = [
 {id:'osttirol',t:'Lienz + Sillian',base:'1 Nacht in Lienz',areas:['lienz','sillian'],nights:1,single:[240,300],trip:250,hotel:85,gain:'+3 h',
  warn:'Der Skibus Lienz–Sillian ist laut Recherche gratis. Andere Busse hinter Lienz sind nicht im Kärnten Ticket enthalten.',
  tl:[['Tag 1'],['06:42','rail','Villach Hbf → Lienz','REX · 1 h 52 min'],['08:45','bus','Lienz Bf → Zettersfeldbahn','Linie 1 · gratis in Skikleidung'],['09:00','ski','Lienz-Zettersfeld','bis ca. 16:00'],['16:30','bed','Übernachtung Lienz','ca. 85 €'],
      ['Tag 2'],['07:55','bus','Lienz Bf → Sillian','Gratis-Skibus · ca. 45 min'],['08:45','ski','Sillian-Hochpustertal','bis ca. 15:30'],['15:50','bus','Sillian → Lienz Bf','Skibus'],['16:58','rail','Lienz → Villach Hbf','an 18:50']]},
 {id:'nock',t:'Turracher Höhe + Falkert',base:'1 Nacht auf der Turracher Höhe',areas:['turracher','falkert'],nights:1,single:[240,260],trip:280,hotel:110,gain:'+2 h',
  warn:'Linie 420 fährt im Winter selten, Falkert hängt am Rufbus Nockmobil. Am Vortag reservieren.',
  tl:[['Tag 1'],['07:10','rail','Villach Hbf → Feldkirchen','S-Bahn · 25 min'],['07:45','bus','Feldkirchen → Turracher Höhe','Linie 420 · ca. 50 min'],['08:50','ski','Turracher Höhe','ganzer Tag'],['16:30','bed','Übernachtung Turracher Höhe','ca. 110 €'],
      ['Tag 2'],['08:10','bus','Turracher Höhe → Patergassen','Linie 420'],['08:40','bus','Patergassen → Falkert','Nockmobil, Vortag buchen'],['09:15','ski','Heidi-Alm / Falkert','bis 15:30'],['16:00','bus','Falkert → Feldkirchen','Nockmobil + 420'],['17:40','rail','Feldkirchen → Villach Hbf','an 18:05']]},
 {id:'spittal',t:'Bad Kleinkirchheim + Katschberg',base:'1 Nacht in Gmünd',areas:['bkk','katschberg'],nights:1,single:[210,270],trip:330,hotel:75,gain:'+1 h',warn:'',
  tl:[['Tag 1'],['07:12','rail','Villach Hbf → Spittal','RJ · 30 min'],['07:55','bus','Spittal → Bad Kleinkirchheim','Linie 180 · ca. 45 min'],['08:45','ski','Bad Kleinkirchheim','bis 16:00'],['16:20','bus','BKK → Spittal → Gmünd','180 + 120'],['17:45','bed','Übernachtung Gmünd','ca. 75 €'],
      ['Tag 2'],['07:30','bus','Gmünd → Rennweg','Linie 130'],['08:05','bus','Rennweg → Katschberghöhe','Gratis-Skibus'],['08:30','ski','Katschberg','bis 15:30'],['15:45','bus','Katschberg → Spittal','Skibus + 130 + 120'],['17:20','rail','Spittal → Villach Hbf','an 17:52']]},
 {id:'matrei',t:'Matrei-Kals, Prägraten, St. Jakob',base:'2 Nächte in Matrei',areas:['matrei','praegraten','stjakob'],nights:2,single:[380,400,390],trip:420,hotel:180,gain:'+8 h',
  warn:'Regionalbusse hinter Lienz sind nicht im Kärnten Ticket enthalten. Rechne mit 20–30 € extra.',
  tl:[['Tag 1'],['06:42','rail','Villach Hbf → Lienz','REX · 1 h 52 min'],['08:45','bus','Lienz → Matrei','Regionalbus · ca. 30 min'],['09:30','ski','Matrei-Kals','bis 16:00'],['16:30','bed','Übernachtung Matrei','2 Nächte · ca. 180 €'],
      ['Tag 2'],['08:15','bus','Matrei → Prägraten','Gratis-Skibus'],['08:45','ski','Prägraten','bis Mittag'],
      ['Tag 3'],['07:45','bus','Matrei → St. Jakob','Regionalbus'],['08:40','ski','St. Jakob i. D.','bis 15:00'],['15:20','bus','St. Jakob → Lienz','ca. 1 h'],['16:58','rail','Lienz → Villach Hbf','an 18:50']]}
];

const SEED = [
 {id:7,d:'2027-01-16',a:'bkk',hm:6840,km:58,runs:22,vmax:78,snow:'Pulver',r:5,note:'Erster richtiger Pulvertag. Abfahrt Strohsack zweimal, Mittag in der Nockalm.',travel:'RJ 7:12 nach Spittal, Bus 180 um 7:55',ph:[{g:3,c:'Pulver am Strohsack'},{g:0,c:'Blick zur Kaiserburg'},{g:1,c:'Abendlicht'}]},
 {id:6,d:'2027-01-09',a:'gerlitzen',hm:4120,km:37,runs:16,vmax:71,snow:'Griffig',r:4,note:'Nur Vormittag, ab Mittag Nebel. Die neue Kanzelbahn II ist schnell.',travel:'S-Bahn 8:04 nach Annenheim',ph:[{g:2,c:'Nebel ab Mittag'}]},
 {id:5,d:'2027-01-02',a:'nassfeld',hm:7350,km:64,runs:25,vmax:82,snow:'Kunstschnee, hart',r:4,note:'Voll wegen Ferien. Tressdorfer Almbahn ausprobiert.',travel:'SB4 8:00 ab Villach Hbf',ph:[{g:0,c:'Gartnerkofel'}]},
 {id:4,d:'2026-12-28',a:'ankogel',hm:3980,km:29,runs:12,vmax:69,snow:'Pulver',r:5,trip:'Mölltal-Wochenende, Übernachtung in Mallnitz',note:'Ruhig, kaum Leute.',travel:'Skibus 103 ab Mallnitz',ph:[]},
 {id:3,d:'2026-12-27',a:'moelltaler',hm:5210,km:41,runs:15,vmax:74,snow:'Griffig',r:4,trip:'Mölltal-Wochenende, Übernachtung in Mallnitz',note:'Windig oben, unten super.',travel:'RJ 6:48 nach Mallnitz, Skibus 5115',ph:[{g:1,c:'Gletscher am Morgen'}]},
 {id:2,d:'2026-12-20',a:'goldeck',hm:3150,km:24,runs:11,vmax:66,snow:'Kunstschnee, hart',r:3,note:'Noch wenig Schnee.',travel:'Zug nach Spittal, Bus 5112',ph:[]},
 {id:1,d:'2026-12-13',a:'dreilaendereck',hm:2280,km:18,runs:10,vmax:61,snow:'Kunstschnee, hart',r:3,note:'Saisonstart nach der Arbeit.',travel:'Bahnhofshuttle ab Villach Hbf',ph:[]}
].map((e) => Object.assign({sample:true}, e));

let diary = store.get('diary', null);
if (!diary) { diary = SEED; store.set('diary', diary); }
let trip = store.get('trip', {id:'osttirol', start:'2027-02-13'});
let passPrice = store.get('pass', 611);
const saveDiary = () => { store.set('diary', diary); sync.push(); };
const visits = (id) => diary.filter((e) => e.a === id);
const visited = () => { const v = {}; diary.forEach((e) => { v[e.a] = true; }); return v; };
const plannedDays = () => {
  const c = COMBOS.find((x) => x.id === trip.id); if (!c) return [];
  return c.areas.map((a, i) => { const d = day(trip.start); d.setDate(d.getDate() + i); return {a, d: d.toISOString().slice(0, 10)}; });
};

/* ---------- Server: Anmeldung und Abgleich ---------- */
const hosted = location.protocol !== 'file:';
async function api(path, opt = {}){
  const r = await fetch(path, {credentials:'same-origin', ...opt, headers:{...(opt.json ? {'Content-Type':'application/json'} : {}), ...(opt.headers || {})}, body: opt.json ? JSON.stringify(opt.json) : opt.body});
  const data = r.headers.get('content-type')?.includes('json') ? await r.json() : null;
  if (r.status === 401 && path !== '/api/login') { sync.authed = false; }
  if (!r.ok) throw Object.assign(new Error((data && data.error) || ('Fehler ' + r.status)), {status: r.status});
  return data;
}
const sync = {
  authed: false, me: null, timer: null,
  async boot(){
    if (!hosted) return;
    try { this.me = await api('/api/me'); } catch(e){ return; }
    this.authed = this.me.auth;
    if (!this.authed) { if (!store.get('askedLogin', false)) { store.set('askedLogin', true); $('login').showModal(); } return; }
    await this.pull();
    this.uploadPending();
    if (/strava=ok/.test(location.hash)) toast('Strava verbunden');
  },
  async pull(){
    const s = await api('/api/state');
    if (s.updatedAt && !store.get('dirty', false)) {
      if (s.diary) { diary = s.diary; store.set('diary', diary); }
      if (s.trip) { trip = s.trip; store.set('trip', trip); }
      if (s.pass) { passPrice = s.pass; store.set('pass', passPrice); }
      if (s.prices) { Object.keys(priceOverride).forEach((k) => delete priceOverride[k]); Object.assign(priceOverride, s.prices); store.set('prices', priceOverride); }
      route();
    } else await this.flush();
  },
  push(){
    store.set('dirty', true);
    clearTimeout(this.timer); this.timer = setTimeout(() => this.flush(), 800);
  },
  async flush(){
    if (!this.authed || !navigator.onLine) return;
    try { await api('/api/state', {method:'PUT', json:{diary, trip, pass:passPrice, prices:priceOverride}}); store.set('dirty', false); }
    catch(e){ /* bleibt markiert, nächster Versuch beim nächsten Speichern oder wenn wieder online */ }
  },
  async uploadPhoto(blob){
    if (!this.authed || !navigator.onLine) return null;
    try { const r = await api('/api/photos', {method:'POST', body:blob, headers:{'Content-Type': blob.type || 'image/jpeg'}}); return r.id; } catch(e){ return null; }
  },
  async uploadPending(){
    if (!this.authed || !navigator.onLine) return;
    let changed = false;
    for (const e of diary) for (const p of (e.ph || [])) {
      if (!p.pending) continue;
      const b = await photoDB.blob(p.id); if (!b) continue;
      const sid = await this.uploadPhoto(b);
      if (sid) { p.sid = sid; delete p.pending; changed = true; }
    }
    if (changed) saveDiary(); else if (store.get('dirty', false)) this.flush();
  }
};
window.addEventListener('online', () => sync.uploadPending());
async function photoUrl(key){
  if (key.startsWith('s:')) return '/api/photos/' + encodeURIComponent(key.slice(2));
  return photoDB.url(key);
}

$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('loginErr').textContent = '';
  try {
    await api('/api/login', {method:'POST', json:{password: $('loginPw').value}});
    $('login').close(); $('loginPw').value = '';
    sync.authed = true; sync.me = await api('/api/me');
    await sync.pull(); sync.uploadPending(); toast('Angemeldet');
  } catch(err){ $('loginErr').textContent = err.message; }
});

function renderAccount(){
  const box = $('account'); if (!box) return;
  if (!hosted) { box.innerHTML = '<p class="lead">Lokale Vorschau ohne Server.</p>'; return; }
  if (!sync.authed) { box.innerHTML = '<p class="lead">Nicht angemeldet. Deine Einträge liegen nur auf diesem Gerät.</p><button class="btn primary" type="button" id="accLogin">Anmelden</button>'; $('accLogin').onclick = () => { $('info').close(); $('login').showModal(); }; return; }
  const st = (sync.me && sync.me.strava) || {};
  box.innerHTML = '<p class="lead">Angemeldet. Einträge und Fotos werden mit dem Server abgeglichen.</p>' +
    '<div class="btnrow">' + (st.connected ? '<button class="btn" type="button" id="accStravaOff">Strava trennen' + (st.athlete ? ' (' + esc(st.athlete) + ')' : '') + '</button>' :
      st.configured ? '<a class="btn primary" href="/auth/strava">Mit Strava verbinden</a>' : '<span class="lead" style="margin:0">Strava ist am Server noch nicht eingerichtet.</span>') +
    '<button class="btn" type="button" id="accOut">Abmelden</button></div>';
  if ($('accStravaOff')) $('accStravaOff').onclick = async () => { await api('/api/strava/disconnect', {method:'POST'}); sync.me = await api('/api/me'); renderAccount(); };
  $('accOut').onclick = async () => { await api('/api/logout', {method:'POST'}); sync.authed = false; renderAccount(); toast('Abgemeldet'); };
}

/* Strava im Formular */
$('stravaBtn').onclick = async () => {
  const box = $('stravaList');
  if (!sync.authed) { box.innerHTML = '<p class="hint">Melde dich zuerst an.</p>'; return; }
  box.innerHTML = '<p class="hint">Lade Aktivitäten …</p>';
  try {
    const list = await api('/api/strava/activities?date=' + encodeURIComponent($('fDate').value));
    if (!list.length) { box.innerHTML = '<p class="hint">An diesem Tag keine Skiaktivität auf Strava.</p>'; return; }
    box.innerHTML = list.map((a, i) => '<button type="button" class="stv" data-i="' + i + '"><b>' + esc(a.name) + '</b><span>' + fmt(a.hm) + ' Hm · ' + a.km + ' km · ' + a.vmax + ' km/h</span></button>').join('');
    box.onclick = (e) => { const b = e.target.closest('.stv'); if (!b) return; const a = list[+b.dataset.i];
      $('fHm').value = a.hm; $('fKm').value = a.km; $('fV').value = a.vmax; box.querySelectorAll('.stv').forEach((x) => x.classList.toggle('on', x === b)); };
  } catch(err){
    box.innerHTML = err.status === 409 ? '<p class="hint">Strava ist noch nicht verbunden. <a href="/auth/strava">Jetzt verbinden</a></p>' :
      err.status === 503 ? '<p class="hint">Strava ist am Server noch nicht eingerichtet.</p>' : '<p class="hint">' + esc(err.message) + '</p>';
  }
};

/* ÖBB live */
const hhmm = (iso) => iso ? new Date(iso).toLocaleTimeString('de-AT', {hour:'2-digit', minute:'2-digit'}) : '–';
async function loadLive(){
  const box = $('live'); if (!box || !sync.authed) return;
  if (!navigator.onLine) { box.innerHTML = '<p class="lead">Offline. Nutze den Scotty-Link unten, sobald du Netz hast.</p>'; return; }
  const d = $('scDate') ? $('scDate').value : '', t = $('scTime') ? $('scTime').value : '07:00';
  const when = d ? new Date(d + 'T' + (t || '07:00')) : new Date();
  try {
    const r = await api('/api/journeys?to=' + encodeURIComponent(box.dataset.to) + '&when=' + encodeURIComponent(when.toISOString()));
    if (!r.journeys.length) { box.innerHTML = '<p class="lead">Keine Verbindung gefunden.</p>'; return; }
    box.innerHTML = '<ul class="rows">' + r.journeys.map((j) => {
      const mins = Math.round((new Date(j.arr) - new Date(j.dep)) / 60000), late = j.depDelay > 60;
      return '<li><div class="row" style="grid-template-columns:auto minmax(0,1fr) auto"><span class="jt"><b>' + hhmm(j.dep) + '</b>' + (late ? '<small class="late">+' + Math.round(j.depDelay / 60) + '</small>' : '') + '</span>' +
        '<span><span class="nm">' + j.legs.map((l) => esc(l.line || 'Fußweg')).join(' → ') + '</span><span class="sub">an ' + hhmm(j.arr) + ' in ' + esc(r.to) + (j.legs[0] && j.legs[0].platform ? ', Gleis ' + esc(j.legs[0].platform) : '') + '</span></span>' +
        '<span class="rt"><b>' + hm(mins) + '</b>' + (j.legs.length > 1 ? (j.legs.length - 1) + '× umsteigen' : 'direkt') + '</span></div></li>';
    }).join('') + '</ul><p style="font-size:14px;color:var(--ink2);margin-top:8px">Villach Hbf bis ' + esc(r.to) + ', live von der ÖBB. Danach weiter wie oben beschrieben.</p>';
  } catch(err){ box.innerHTML = '<p class="lead">' + esc(err.message) + '. Der Scotty-Link unten funktioniert trotzdem.</p>'; }
}

/* ---------- Router ---------- */
const TABS = ['saison','karte','planen','tagebuch','rechnung'];
let lastTab = 'saison';
function route(){
  const h = location.hash.replace(/^#\/?/, '') || 'saison';
  const [view, arg] = h.split('/');
  if (view === 'neu') { show('tagebuch'); openEntry(); return; }
  if (view === 'gebiet' && BY[arg]) { show('gebiet', arg); return; }
  show(TABS.includes(view) ? view : 'saison');
}
function show(v, arg){
  document.querySelectorAll('.view').forEach((s) => s.classList.toggle('on', s.id === 'v-' + v));
  if (TABS.includes(v)) lastTab = v;
  const cur = v === 'gebiet' ? lastTab : v;
  document.querySelectorAll('.tabbar a').forEach((a) => { if (a.dataset.tab === cur) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  $('back').hidden = v !== 'gebiet';
  document.body.classList.toggle('no-fab', ['karte','planen','rechnung'].includes(v));
  if (v === 'gebiet') renderArea(arg, 'ueberblick');
  if (v === 'karte') mapShown();
  if (v === 'saison') renderSeason();
  if (v === 'tagebuch') renderDiary();
  if (v === 'rechnung') renderCalc();
  if (v === 'planen') renderPlan();
  const title = v === 'gebiet' ? '' : document.getElementById('v-' + v).dataset.title;
  $('apptitle').textContent = title || '';
  document.title = (v === 'gebiet' ? BY[arg].n : title) + ' · Skisaison';
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
$('back').onclick = () => { if (history.length > 1) history.back(); else location.hash = '#/' + lastTab; };

/* ---------- Saison ---------- */
function renderSeason(){
  const v = visited(), n = Object.keys(v).length, plan = {};
  plannedDays().forEach((p) => { plan[p.a] = true; });
  $('passN').textContent = n;
  // Reihenfolge der Striche: besucht, geplant, offen
  const order = AREAS.slice().sort((a, b) => (v[b.id] ? 2 : plan[b.id] ? 1 : 0) - (v[a.id] ? 2 : plan[a.id] ? 1 : 0));
  $('ticks').innerHTML = order.map((a) => '<i class="' + (v[a.id] ? 'done' : plan[a.id] ? 'plan' : '') + '"></i>').join('');
  const hmSum = diary.reduce((s, e) => s + (e.hm || 0), 0);
  const worth = diary.reduce((s, e) => s + price(e.a), 0);
  $('sDays').textContent = diary.length;
  $('sHm').textContent = fmt(hmSum);
  $('sPaid').textContent = Math.min(999, Math.round(worth / passPrice * 100)) + ' %';

  const c = COMBOS.find((x) => x.id === trip.id), pd = plannedDays();
  $('nextTrip').innerHTML = c ? '<h2>Nächster Trip</h2><div class="card trip"><div class="when">' + dstr(pd[0].d, {weekday:'short', day:'numeric', month:'short'}) + ' – ' + dstr(pd[pd.length - 1].d, {weekday:'short', day:'numeric', month:'short'}) + '</div>' +
    '<div class="chips">' + c.areas.map((id) => '<a class="chipx" href="#/gebiet/' + id + '" style="text-decoration:none;color:inherit"><span class="tier t' + BY[id].tier + '"></span>' + esc(BY[id].n) + '</a>').join('') + '</div>' +
    '<div style="color:var(--ink2)">' + esc(c.base) + ', ' + hm(c.trip) + ' unterwegs</div><div class="btnrow"><a class="btn primary" href="#/planen">Ablauf ansehen</a></div></div>' : '';

  const open = AREAS.filter((a) => !v[a.id] && a.tier <= 2 && a.mins).sort((a, b) => a.mins - b.mins).slice(0, 5);
  $('openList').innerHTML = open.map((a) => areaRow(a, v)).join('');
}
function areaRow(a, v){
  const nv = visits(a.id).length;
  return '<li><a class="row" href="#/gebiet/' + a.id + '">' +
    (nv ? '<span class="done-mark" title="gefahren">' + ICON.check + '</span>' : '<span class="state"><span class="tier t' + a.tier + '"></span></span>') +
    '<span><span class="nm">' + esc(a.n) + '</span><span class="sub">' + esc(a.short) + '</span></span>' +
    '<span class="rt"><b>' + (a.mins ? hm(a.mins) : '–') + '</b>' + a.km + ' km</span></a></li>';
}

/* ---------- Karte ---------- */
const SC = 500, COS = 0.684, LON0 = 12.25, LAT0 = 47.15, W0 = 960, H0 = 380, NS = 'http://www.w3.org/2000/svg';
const P = (lon, lat) => [(lon - LON0) * COS * SC, (LAT0 - lat) * SC];
const svg = $('map');
const G = {};
let vb = {x:0, y:0, w:W0, h:H0}, mapReady = false, selId = null, dragMoved = false;
function el(tag, attrs, parent){ const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
const stPt = (id) => P(STATIONS[id].lon, STATIONS[id].lat);
function linePts(line, to){
  const out = [], ids = [];
  for (const p of LINES[line]) { if (typeof p === 'string') { out.push(stPt(p)); ids.push(p); } else out.push(P(p[0], p[1])); if (p === to) break; }
  return {pts: out, ids};
}
const pstr = (pts) => pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
const rad = (a) => 4 + Math.sqrt(a.km) * 0.65;
function buildMap(){
  ['land','lakes','geo','rails','route','markers','hb'].forEach((n) => { G[n] = el('g', {}, svg); });
  el('polygon', {class:'land', points: pstr(OUTLINE.map((p) => P(p[0], p[1])))}, G.land);
  LAKES.forEach((l) => { const c = P(l.lon, l.lat); el('ellipse', {class:'lake', cx:c[0], cy:c[1], rx:l.rx, ry:l.ry}, G.lakes); });
  GEO.forEach((g) => { const c = P(g[1], g[2]); const t = el('text', {class:'geo', 'data-sx':c[0], 'data-sy':c[1]}, G.geo); t.textContent = g[0]; });
  Object.keys(LINES).forEach((k) => el('polyline', {class:'rail', points: pstr(linePts(k, null).pts)}, G.rails));
  drawMarkers();
  const vc = stPt('villach');
  const hb = el('g', {class:'hb', 'data-sx':vc[0], 'data-sy':vc[1]}, G.hb);
  el('path', {d:'M0,-8 L8,0 L0,8 L-8,0 Z'}, hb);
  const t = el('text', {x:13, y:5}, hb); t.textContent = 'Villach';
  bindPan();
  mapReady = true;
}
function drawMarkers(){
  while (G.markers.firstChild) G.markers.removeChild(G.markers.firstChild);
  const v = visited();
  AREAS.forEach((a) => {
    const c = P(a.lon, a.lat); a.x = c[0]; a.y = c[1];
    const g = el('g', {class:'mk t' + a.tier + (a.id === selId ? ' sel' : '') + (hiddenTiers[a.tier] ? ' off' : ''), id:'mk-' + a.id, 'data-sx':c[0], 'data-sy':c[1], tabindex:'0', role:'button', 'aria-label': a.n + ', ' + TIER_SHORT[a.tier]}, G.markers);
    if (v[a.id]) el('circle', {class:'v', r:(rad(a) + 3.5).toFixed(1)}, g);
    el('circle', {class:'d', r:rad(a).toFixed(1)}, g);
    const t = el('text', {class:(a.tier === 1 || a.km >= 40) ? '' : 'minor', x:(rad(a) + 6).toFixed(1), y:4}, g); t.textContent = a.n;
    g.addEventListener('click', () => { if (!dragMoved) selectOnMap(a.id, true); });
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectOnMap(a.id, true); } });
  });
}
const cw = () => svg.clientWidth || 360, ch = () => svg.clientHeight || 400;
function applyVB(){
  const k = vb.w / cw(); vb.h = ch() * k;
  let cx = Math.max(-60, Math.min(W0 + 60, vb.x + vb.w / 2)), cy = Math.max(-60, Math.min(H0 + 60, vb.y + vb.h / 2));
  vb.x = cx - vb.w / 2; vb.y = cy - vb.h / 2;
  svg.setAttribute('viewBox', [vb.x, vb.y, vb.w, vb.h].map((n) => n.toFixed(2)).join(' '));
  svg.querySelectorAll('[data-sx]').forEach((n) => n.setAttribute('transform', 'translate(' + n.getAttribute('data-sx') + ' ' + n.getAttribute('data-sy') + ') scale(' + k.toFixed(4) + ')'));
  svg.setAttribute('data-labels', cw() / vb.w >= 1.25 ? 'all' : 'major');
}
function zoomAt(f, sx, sy){
  const nw = Math.max(150, Math.min(1500, vb.w / f)), nh = nw * ch() / cw();
  vb.x = sx - (sx - vb.x) * (nw / vb.w); vb.y = sy - (sy - vb.y) * (nh / vb.h); vb.w = nw; vb.h = nh; applyVB();
}
function initView(){ const r = ch() / cw(); if (cw() < 560) { vb.w = 600; vb.x = 470 - 300; vb.y = 210 - 300 * r; } else { vb.w = W0 + 40; vb.x = -20; vb.y = H0 / 2 - vb.w * r / 2; } applyVB(); }
function centerOn(x, y, w){ const r = ch() / cw(); vb.w = w; vb.x = x - w / 2; vb.y = y - w * r / 2; applyVB(); }
function toSvg(cx, cy){ const r = svg.getBoundingClientRect(); return [vb.x + (cx - r.left) * vb.w / r.width, vb.y + (cy - r.top) * vb.h / r.height]; }
function bindPan(){
  const ptrs = {}; let pinch = 0;
  svg.addEventListener('pointerdown', (e) => { ptrs[e.pointerId] = {x:e.clientX, y:e.clientY, sx:e.clientX, sy:e.clientY}; dragMoved = false; pinch = 0; svg.classList.add('grab'); });
  window.addEventListener('pointermove', (e) => {
    const p = ptrs[e.pointerId]; if (!p) return; const ids = Object.keys(ptrs);
    if (ids.length === 1) {
      const k = vb.w / cw(); vb.x -= (e.clientX - p.x) * k; vb.y -= (e.clientY - p.y) * k; p.x = e.clientX; p.y = e.clientY;
      if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) dragMoved = true; applyVB();
    } else {
      p.x = e.clientX; p.y = e.clientY; const a = ptrs[ids[0]], b = ptrs[ids[1]];
      const d = Math.hypot(a.x - b.x, a.y - b.y), m = toSvg((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (pinch > 0 && d > 0) zoomAt(d / pinch, m[0], m[1]); pinch = d; dragMoved = true;
    }
  });
  const end = (e) => { delete ptrs[e.pointerId]; pinch = 0; if (!Object.keys(ptrs).length) svg.classList.remove('grab'); };
  window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  svg.addEventListener('wheel', (e) => { e.preventDefault(); const m = toSvg(e.clientX, e.clientY); zoomAt(Math.exp(-e.deltaY * .0015), m[0], m[1]); }, {passive:false});
  $('zin').onclick = () => zoomAt(1.5, vb.x + vb.w / 2, vb.y + vb.h / 2);
  $('zout').onclick = () => zoomAt(1 / 1.5, vb.x + vb.w / 2, vb.y + vb.h / 2);
  $('zall').onclick = initView;
  window.addEventListener('resize', () => { if (mapReady) applyVB(); });
}
function drawRoute(a){
  while (G.route.firstChild) G.route.removeChild(G.route.firstChild);
  (a.rail || []).forEach((r) => {
    const res = linePts(r[0], r[1]);
    el('polyline', {class:'r-rail', points: pstr(res.pts)}, G.route);
    el('polyline', {class:'r-ties', points: pstr(res.pts)}, G.route);
    res.ids.forEach((id) => { const s = STATIONS[id]; if (s.hid || id === 'villach') return; const c = P(s.lon, s.lat);
      const g = el('g', {class:'rst', 'data-sx':c[0], 'data-sy':c[1]}, G.route); el('circle', {r:4.5}, g); const t = el('text', {x:9, y:4}, g); t.textContent = s.n; });
  });
  if (a.from) el('polyline', {class:'r-bus', points: pstr([stPt(a.from), [a.x, a.y]])}, G.route);
  if (a.direct) el('polyline', {class:'r-bus', points: pstr([stPt('villach'), [a.x, a.y]])}, G.route);
}
function selectOnMap(id, fit){
  const a = BY[id]; selId = id;
  svg.querySelectorAll('.mk.sel').forEach((m) => m.classList.remove('sel'));
  const m = $('mk-' + id); if (m) { m.classList.add('sel'); G.markers.appendChild(m); }
  drawRoute(a);
  if (fit) {
    const pts = [stPt('villach'), [a.x, a.y]]; if (a.from) pts.push(stPt(a.from));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const w = Math.max(Math.max(...xs) - Math.min(...xs) + 150, 320, (Math.max(...ys) - Math.min(...ys) + 170) * cw() / ch());
    centerOn((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2 + 20 * w / cw(), w);
  } else applyVB();
  const nv = visits(id).length;
  $('peek').hidden = false;
  $('peek').innerHTML = '<span class="nm">' + esc(a.n) + '</span><span class="sub">' + (a.mins ? hm(a.mins) + ' ab Villach' : 'Keine Öffi-Verbindung') + (nv ? ', ' + nv + '× gefahren' : '') + '</span><a class="btn primary" href="#/gebiet/' + id + '">Öffnen</a>';
}
const hiddenTiers = {};
let listFilter = 'all';
function renderMapList(){
  const v = visited();
  const f = [['all','Alle',AREAS.length],['open','Noch offen',AREAS.filter((a) => !v[a.id]).length],[1,TIER_SHORT[1]],[2,TIER_SHORT[2]],[3,TIER_SHORT[3]],[4,TIER_SHORT[4]]];
  $('filters').innerHTML = f.map((x) => '<button class="fchip" data-f="' + x[0] + '" aria-pressed="' + (String(listFilter) === String(x[0])) + '">' +
    (typeof x[0] === 'number' ? '<span class="tier t' + x[0] + '"></span>' : '') + esc(x[1]) + (x[2] != null ? ' <span class="n">' + x[2] + '</span>' : '') + '</button>').join('');
  const list = AREAS.slice().filter((a) => listFilter === 'all' || (listFilter === 'open' ? !v[a.id] : a.tier === +listFilter))
    .sort((a, b) => a.tier - b.tier || (a.mins || 999) - (b.mins || 999));
  $('areaList').innerHTML = list.map((a) => areaRow(a, v)).join('');
  [1,2,3,4].forEach((t) => { hiddenTiers[t] = !(listFilter === 'all' || listFilter === 'open' || +listFilter === t); });
  if (mapReady) svg.querySelectorAll('.mk').forEach((m) => { const a = BY[m.id.slice(3)]; m.classList.toggle('off', hiddenTiers[a.tier] || (listFilter === 'open' && v[a.id])); });
}
$('filters').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; listFilter = b.dataset.f; renderMapList(); });
function mapShown(){
  if (!mapReady) { buildMap(); initView(); }
  else { drawMarkers(); applyVB(); }
  renderMapList();
  if (selId) selectOnMap(selId, false);
}

/* ---------- Gebiet ---------- */
// Offizielle Anreise-Infos der Gebiete (geprüft 1.11.2026). Sonst Kärnten Werbung „autofrei“.
const AUTOFREI = 'https://www.kaernten.at/autofrei-im-winter/skigebiete-autofrei/';
const NLW = 'https://www.nassfeld.at/de/Service/Anreise-Mobilitaet';
const ANREISE = {
  gerlitzen:['https://www.gerlitzen.com/de/anreise-mit-der-bahn','Gerlitzen: Anreise mit der Bahn'],
  nassfeld:[NLW,'Nassfeld: Anreise und Mobilität'], weissbriach:[NLW,'Region Nassfeld: Anreise und Mobilität'],
  koetschach:[NLW,'Region Nassfeld: Anreise und Mobilität'], weissensee:[NLW,'Region Nassfeld: Anreise und Mobilität'],
  bkk:['https://www.badkleinkirchheim.com/en/directions/','Bad Kleinkirchheim: Anreise (englisch)'],
  turracher:['https://www.turracherhoehe.at/en/information/arrival','Turracher Höhe: Anreise (englisch). Laut Gebiet fährt Linie 5234 ab Busbahnhof Feldkirchen bis zur Panoramabahn.'],
  katschberg:['https://www.katschberg.at/de/anreise','Katschberg: Anreise'],
  lienz:['https://www.tirol.at/infrastruktur/lienzer-bergbahnen-zettersfeld','Zettersfeld: Anreise mit den Öffis (Tirol Werbung)']
};
// Bahnhofsnamen, wie Scotty sie findet
const SCOTTY_NAME = {feistritz:'Feistritz an der Gail', feldkirchen:'Feldkirchen in Kärnten', spittal:'Spittal-Millstättersee'};
function scottyUrl(to, date, time){
  const d = date ? date.split('-').reverse().join('.') : '';
  return 'https://fahrplan.oebb.at/bin/query.exe/dn?S=' + encodeURIComponent('Villach Hbf') + '&Z=' + encodeURIComponent(to) +
    (d ? '&date=' + d : '') + (time ? '&time=' + time + '&timesel=depart' : '') + '&start=1';
}
function nextSaturday(){ const d = new Date(); d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7 || 7)); return d.toISOString().slice(0, 10); }
function wxCoords(a){ return a.lat.toFixed(3) + 'N' + a.lon.toFixed(3) + 'E' + (ELEV[a.id] || 1500); }

let areaTab = 'ueberblick';
const AREA_TABS = [['ueberblick','Überblick'],['anreise','Anreise'],['wetter','Wetter'],['info','Info']];
function renderArea(id, tab){
  if (tab) areaTab = tab;
  const a = BY[id];
  $('v-gebiet').dataset.area = id;
  $('v-gebiet').innerHTML =
    '<div class="g-head"><div class="g-meta"><span class="tierlab"><span class="tier t' + a.tier + '"></span>' + TIER_SHORT[a.tier] + '</span><span>' + (a.r === 'O' ? 'Osttirol' : 'Kärnten') + '</span>' +
    (visits(id).length ? '<span class="visited">' + ICON.check + visits(id).length + '× gefahren</span>' : '') + '</div><h1 class="g-name">' + esc(a.n) + '</h1></div>' +
    '<div class="seg" role="tablist">' + AREA_TABS.map((t) => '<button role="tab" data-atab="' + t[0] + '" aria-selected="' + (t[0] === areaTab) + '">' + t[1] + '</button>').join('') + '</div>' +
    '<div id="areaBody"></div>';
  renderAreaBody(id);
  $('apptitle').textContent = a.n;
}
function renderAreaBody(id){
  const a = BY[id], k = KS[id] || {};
  const body = {ueberblick: areaOverview, anreise: areaTravel, wetter: areaWeather, info: areaInfo}[areaTab](a, k);
  $('areaBody').innerHTML = body;
  if (areaTab === 'anreise') loadLive();
  document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-selected', b.dataset.atab === areaTab));
}
function areaOverview(a, k){
  const pist = k.pist || {l:0, m:0, s:0}, v = visits(a.id), ps = PRICE_SRC[a.id], pr = price(a.id);
  const liftsN = (k.lifts || []).reduce((s, l) => s + l[0], 0) || a.lifts;
  return '<div class="slope" aria-label="Pisten: ' + pist.l + ' km leicht, ' + pist.m + ' km mittel, ' + pist.s + ' km schwer"><div class="slope-bar">' +
    (pist.l ? '<i class="l" style="flex:' + pist.l + '"></i>' : '') + (pist.m ? '<i class="m" style="flex:' + pist.m + '"></i>' : '') + (pist.s ? '<i class="s" style="flex:' + pist.s + '"></i>' : '') + '</div>' +
    '<div class="slope-leg"><span><i style="background:var(--p-blue)"></i>' + pist.l + ' km leicht</span><span><i style="background:var(--p-red)"></i>' + pist.m + ' km mittel</span><span><i style="background:var(--p-black)"></i>' + pist.s + ' km schwer</span></div></div>' +
    '<div class="facts"><div><b>' + a.km + '</b><span>km Piste</span></div><div><b>' + liftsN + '</b><span>Lifte</span></div><div><b>' + (a.mins ? hm(a.mins).replace(' min', '′').replace(/^(\d+)′$/, '$1 min') : '–') + '</b><span>ab Villach</span></div></div>' +
    '<div class="actions">' +
      '<button class="act" data-atab="wetter">' + ICON.wx + 'Wetter</button>' +
      '<a class="act" href="' + esc(k.cam || '#') + '" target="_blank" rel="noopener"' + (k.cam ? '' : ' aria-disabled="true"') + '>' + ICON.cam + 'Webcams</a>' +
      '<a class="act" href="' + esc(k.map || '#') + '" target="_blank" rel="noopener"' + (k.map ? '' : ' aria-disabled="true"') + '>' + ICON.map + 'Pistenplan</a>' +
      '<button class="act" data-atab="anreise">' + ICON.train + 'Anreise</button></div>' +
    (k.desc ? '<p class="desc" style="margin-top:18px">' + esc(k.desc) + '</p>' : '') +
    '<section class="sec"><h2>Tageskarte</h2><div class="price-line"><b>' + eur(pr) + '</b><span class="src ' + ps[1] + '">' + ({ok:'2026/27', alt:'älter', est:'geschätzt'}[ps[1]]) + '</span></div>' +
    '<p class="lead" style="margin-top:2px">' + esc(ps[2]) + (v.length ? '. Mit dem Pass hier schon ' + eur(pr * v.length) + ' gespart.' : '') + '</p></section>' +
    '<section class="sec"><h2>Meine Tage hier</h2>' + (v.length ? '<ul class="rows">' + v.map((e) => '<li><a class="row" href="#/tagebuch"><span class="done-mark">' + ICON.check + '</span><span><span class="nm">' + dstr(e.d, {weekday:'long', day:'numeric', month:'long'}) + '</span><span class="sub">' + (e.hm ? fmt(e.hm) + ' Hm, ' : '') + esc(e.snow) + '</span></span><span class="rt stars">' + '★'.repeat(e.r) + '</span></a></li>').join('') + '</ul>' :
    '<p class="lead">Noch nicht gefahren.</p>') + '</section>';
}
function areaTravel(a, k){
  const legs = (list) => '<ol class="legs">' + list.map((s) => '<li><span class="mode m-' + s.m + '">' + ({rail:'Bahn', bus:'Bus', walk:'Fuß'}[s.m]) + '</span><span>' + esc(s.t) + (s.d ? '<small>' + esc(s.d) + '</small>' : '') + '</span></li>').join('') + '</ol>';
  const st = a.from ? STATIONS[a.from] : null, to = st ? (SCOTTY_NAME[a.from] || st.n) : null;
  const off = ANREISE[a.id] || (a.r === 'O' ? null : [AUTOFREI, 'Kärnten Werbung: Skigebiete ohne Auto']);
  const combo = COMBOS.find((c) => c.areas.includes(a.id));
  let h = '';
  if (a.steps) {
    h += '<div class="travel-time" style="margin-top:18px"><b>' + esc(a.time) + '</b><span>ab Villach Hbf, einfach</span></div>' + legs(a.steps);
    if (a.alt) h += '<h3 style="margin:6px 0 10px">Alternative</h3>' + legs(a.alt);
  } else h += '<p class="lead" style="margin-top:18px">Für dieses Gebiet habe ich keine Winterverbindung mit Bahn oder Bus gefunden.</p>';
  if (to) h += '<section class="sec"><h2>Nächste Verbindungen</h2><div id="live" data-to="' + esc(to) + '"><p class="lead">' + (sync.authed ? 'Lade ÖBB-Verbindungen …' : 'Melde dich an, um Live-Verbindungen zu sehen.') + '</p></div>';
  if (to) h += '<h3 style="margin:18px 0 6px">Andere Zeit suchen</h3><p class="lead">ÖBB Scotty mit Villach Hbf nach ' + esc(to) + ', danach weiter wie oben.</p>' +
    '<div class="fgrid scotty"><label class="f">Tag<input type="date" id="scDate" value="' + nextSaturday() + '"></label><label class="f">Ab<input type="time" id="scTime" value="07:00"></label></div>' +
    '<a class="btn primary" id="scGo" style="margin-top:10px;width:100%" target="_blank" rel="noopener" data-to="' + esc(to) + '" href="' + scottyUrl(to, nextSaturday(), '07:00') + '">' + ICON.train + 'In ÖBB Scotty öffnen</a></section>';
  h += '<section class="sec"><h2>Gut zu wissen</h2>';
  if (a.bus) h += '<div class="note"><b>Skibus und Fahrplan</b>' + esc(a.bus) + '</div>';
  h += '<div class="note"><b>Als Tagesausflug?</b>' + esc(a.day) + (a.note ? ' ' + esc(a.note) : '') + '</div>';
  if (combo) h += '<div class="note"><b>Mit Übernachtung kombinieren</b><a href="#/planen" data-combo="' + combo.id + '">' + esc(combo.t) + '</a>, ' + esc(combo.base) + '</div>';
  if (off) h += '<div class="note"><b>Anreise laut Skigebiet</b><a href="' + esc(off[0]) + '" target="_blank" rel="noopener">' + esc(off[1]) + '</a></div>';
  return h + '</section>';
}
function areaWeather(a, k){
  const wx = wxCoords(a);
  const src = 'https://www.meteoblue.com/de/wetter/widget/meteogram/' + wx + '_Europe%2FVienna?geoloc=fixed&temperature_units=CELSIUS&windspeed_units=KILOMETER_PER_HOUR&precipitation_units=MILLIMETER&forecast_days=4&layout=bright&autowidth=auto';
  return '<p class="lead" style="margin-top:18px">meteoblue-Meteogramm für die nächsten 4 Tage, auf ca. ' + fmt(ELEV[a.id] || 1500) + ' m am Berg.</p>' +
    '<div class="wx">' + (navigator.onLine ? '<iframe loading="lazy" title="Meteogramm ' + esc(a.n) + '" src="' + src + '"></iframe>' : '<div class="wx-off">Offline. Das Wetter lädt, sobald du wieder Netz hast.</div>') + '</div>' +
    '<div class="btnrow" style="margin-top:12px">' +
    (k.cam ? '<a class="btn" href="' + esc(k.cam) + '" target="_blank" rel="noopener">' + ICON.cam + 'Webcams</a>' : '') +
    '<a class="btn" href="https://www.meteoblue.com/de/wetter/woche/' + wx + '_Europe%2FVienna" target="_blank" rel="noopener">14 Tage bei meteoblue</a></div>';
}
function areaInfo(a, k){
  const ct = k.contact || {};
  return '<section class="sec" style="margin-top:18px"><h2>Lifte</h2>' +
    (k.lifts && k.lifts.length ? '<div class="liftlist">' + k.lifts.map((l) => '<span><b>' + l[0] + '</b>' + esc(l[1]) + '</span>').join('') + '</div>' : '<p class="lead">Keine Angabe.</p>') + '</section>' +
    '<section class="sec"><h2>Ausstattung</h2><div class="kv">' + Object.entries(k.infra || {}).map(([key, val]) => '<div><span>' + esc(key === 'Funlines/Kidsslope' ? 'Funline / Kinderhang' : key) + '</span><b>' + esc(val) + '</b></div>').join('') + '</div></section>' +
    '<section class="sec contact"><h2>Kontakt</h2><div class="card">' + (ct.addr || []).map((x) => esc(x)).join('<br>') +
    (ct.tel ? '<a href="tel:' + esc(ct.tel.replace(/[^\d+]/g, '')) + '">' + esc(ct.tel) + '</a>' : '') +
    (ct.mail ? '<a href="mailto:' + esc(ct.mail) + '">' + esc(ct.mail) + '</a>' : '') +
    (ct.web ? '<a href="' + esc(ct.web.startsWith('http') ? ct.web : 'https://' + ct.web) + '" target="_blank" rel="noopener">' + esc(ct.web) + '</a>' : '') +
    '<a href="' + esc(k.loc || a.maps) + '" target="_blank" rel="noopener">Talstation in Google Maps</a></div>' +
    '<p style="font-size:14px;color:var(--ink2);margin-top:10px">Gebietsinfos von <a href="https://www.kaerntner-skipass.com/skigebiete/" target="_blank" rel="noopener">kaerntner-skipass.com</a>, Stand 1.11.2026.</p></section>';
}
$('v-gebiet').addEventListener('click', (e) => {
  const t = e.target.closest('[data-atab]');
  if (t) { areaTab = t.dataset.atab; renderAreaBody($('v-gebiet').dataset.area); if (t.classList.contains('act')) window.scrollTo(0, 0); return; }
  const c = e.target.closest('[data-combo]'); if (c) planSel = c.dataset.combo;
});
let liveT;
$('v-gebiet').addEventListener('input', () => {
  const go = $('scGo'); if (go) go.href = scottyUrl(go.dataset.to, $('scDate').value, $('scTime').value);
  clearTimeout(liveT); liveT = setTimeout(loadLive, 500);
});

/* ---------- Planen ---------- */
let planSel = null;
function renderPlan(){
  if (!planSel) planSel = trip.id;
  const v = visited();
  $('combos').innerHTML = COMBOS.map((c) => {
    const nn = c.areas.filter((id) => !v[id]).length;
    return '<button class="combo" data-cmb="' + c.id + '" aria-pressed="' + (c.id === planSel) + '"><h3>' + esc(c.t) + '</h3><span class="base">' + esc(c.base) + '</span>' +
      '<span class="dots">' + c.areas.map((id) => '<span class="tier t' + BY[id].tier + '"></span>').join('') + '&nbsp;' + (nn === 1 ? '1 neues Gebiet' : nn + ' neue Gebiete') + ', ' + c.gain + ' Skizeit</span></button>';
  }).join('');
  const c = COMBOS.find((x) => x.id === planSel);
  let tl = '', open = false;
  c.tl.forEach((s) => {
    if (s.length === 1) { if (open) tl += '</ol>'; tl += '<div class="dayhead">' + esc(s[0]) + '</div><ol class="legs timed">'; open = true; return; }
    tl += '<li><span class="t">' + s[0] + '</span><span class="mode m-' + s[1] + '">' + ({rail:'Bahn', bus:'Bus', walk:'Fuß', ski:'Ski', bed:'Nacht'}[s[1]]) + '</span><span>' + esc(s[2]) + '<small>' + esc(s[3]) + '</small></span></li>';
  });
  if (open) tl += '</ol>';
  const single = c.single.reduce((a, b) => a + b, 0), saved = single - c.trip;
  const isSaved = trip.id === c.id;
  $('plan').innerHTML =
    '<div class="card"><h2 style="margin-bottom:12px">' + esc(c.t) + '</h2>' + tl +
    '<p style="font-size:14px;color:var(--ink2)">Beispielzeiten. Echte Verbindungen kommen später aus der ÖBB-Fahrplanauskunft.</p>' +
    '<div class="fgrid" style="margin-top:8px;align-items:end"><label class="f">Erster Tag<input type="date" id="tripStart" value="' + (isSaved ? trip.start : '') + '"></label>' +
    '<button class="btn primary" id="tripSave">' + (isSaved ? 'Trip aktualisieren' : 'Trip speichern') + '</button></div></div>' +
    '<div class="card"><h2>Lohnt sich die Übernachtung?</h2><p class="lead">Verglichen mit ' + c.areas.length + ' einzelnen Tagesausflügen ab Villach.</p>' +
    '<div class="cmp"><div><span>' + c.areas.length + ' Tagesausflüge</span><b>' + hm(single) + '</b><span>unterwegs, 0 € Unterkunft</span></div>' +
    '<div class="win"><span>Trip mit ' + c.nights + (c.nights > 1 ? ' Nächten' : ' Nacht') + '</span><b>' + hm(c.trip) + '</b><span>unterwegs, ca. ' + c.hotel + ' € Unterkunft</span></div></div>' +
    '<p class="verdict"><b>' + (saved > 60 ? 'Lohnt sich.' : 'Knapp.') + '</b> Du sparst ' + hm(Math.max(saved, 0)) + ' im Zug und Bus, das sind ca. ' + Math.round(c.hotel / Math.max(saved / 60, 1)) + ' € pro gewonnener Stunde.</p>' +
    (c.warn ? '<div class="warn">' + esc(c.warn) + '</div>' : '') + '</div>';
  $('tripSave').onclick = () => {
    const d = $('tripStart').value; if (!d) { toast('Wähle zuerst den ersten Tag.'); return; }
    trip = {id:c.id, start:d}; store.set('trip', trip); sync.push(); renderPlan(); toast('Trip gespeichert');
  };
}
$('combos').addEventListener('click', (e) => { const b = e.target.closest('[data-cmb]'); if (b) { planSel = b.dataset.cmb; renderPlan(); } });

/* ---------- Tagebuch ---------- */
const PH_G = [['#3E86D6','#BFE0F7'],['#F2A65A','#8E6FB0'],['#9FB4C2','#DCE4E9'],['#1F5FA8','#86B9E6']];
function phSvg(g){
  const c = PH_G[g % 4];
  return '<svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="pg' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c[0] + '"/><stop offset="1" stop-color="' + c[1] + '"/></linearGradient></defs>' +
    '<rect width="100" height="100" fill="url(#pg' + g + ')"/><polygon points="0,70 24,40 38,55 60,26 82,50 100,38 100,100 0,100" fill="#F4F8FA"/><polygon points="0,82 30,66 55,76 80,62 100,72 100,100 0,100" fill="#DDE7EC"/></svg>';
}
function renderDiary(){
  const list = diary.slice().sort((a, b) => a.d < b.d ? 1 : -1);
  const hasSample = list.some((e) => e.sample);
  if (!list.length) { $('diary').innerHTML = '<div class="empty"><p>Noch kein Skitag eingetragen.</p><button class="btn primary" data-new>Ersten Skitag eintragen</button></div>'; return; }
  let h = hasSample ? '<div class="note" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;gap:12px"><span>Das sind Beispieldaten, damit du siehst, wie es aussieht.</span><button class="btn" id="clearSample">Entfernen</button></div>' : '';
  let lastTrip = null;
  list.forEach((e) => {
    const a = BY[e.a];
    if (e.trip && e.trip !== lastTrip) h += '<div class="tripband">' + esc(e.trip) + '</div>';
    lastTrip = e.trip || null;
    h += '<article class="entry"><div class="eh"><div class="edate"><b>' + day(e.d).getDate() + '</b><span>' + dstr(e.d, {month:'short'}) + '</span></div>' +
      '<h3><a href="#/gebiet/' + e.a + '">' + esc(a.n) + '</a></h3><span class="stars" aria-label="' + e.r + ' von 5">' + '★'.repeat(e.r) + '<span class="off">' + '★'.repeat(5 - e.r) + '</span></span></div>' +
      (e.hm || e.km ? '<div class="estats"><div><b>' + fmt(e.hm || 0) + '</b>Hm</div><div><b>' + (e.km || 0) + '</b>km</div>' + (e.runs ? '<div><b>' + e.runs + '</b>Abfahrten</div>' : '') + (e.vmax ? '<div><b>' + e.vmax + '</b>km/h</div>' : '') + '</div>' : '') +
      (e.note ? '<p>' + esc(e.note) + '</p>' : '') +
      (e.ph && e.ph.length ? '<div class="photos">' + e.ph.map((p, i) => '<button class="ph" data-e="' + e.id + '" data-i="' + i + '"' + (p.sid || p.id ? ' data-pid="' + esc(p.sid ? 's:' + p.sid : p.id) + '"' : '') + ' aria-label="' + esc(p.c || 'Foto') + '">' + (p.sid || p.id ? '' : phSvg(p.g)) + '</button>').join('') + '</div>' : '') +
      '<div class="etags"><span class="tag">' + esc(e.snow) + '</span>' + (e.travel ? '<span class="tag">' + esc(e.travel) + '</span>' : '') + '<span class="tag">Tageskarte ' + eur(price(e.a)) + '</span>' + (e.sample ? '<span class="tag sample">Beispiel</span>' : '') + '</div></article>';
  });
  $('diary').innerHTML = h;
  $('diary').querySelectorAll('[data-pid]').forEach(async (b) => { const u = await photoUrl(b.dataset.pid); if (u) b.style.backgroundImage = 'url("' + u + '")'; });
  const cs = $('clearSample');
  if (cs) cs.onclick = () => { const old = diary; diary = diary.filter((e) => !e.sample); saveDiary(); renderDiary(); toast('Beispieldaten entfernt', 'Rückgängig', () => { diary = old; saveDiary(); renderDiary(); }); };
}
$('diary').addEventListener('click', async (ev) => {
  if (ev.target.closest('[data-new]')) { openEntry(); return; }
  const b = ev.target.closest('.ph'); if (!b) return;
  const e = diary.find((x) => String(x.id) === b.dataset.e), p = e.ph[+b.dataset.i];
  const img = $('lbImg');
  if (p.sid || p.id) img.src = await photoUrl(p.sid ? 's:' + p.sid : p.id) || '';
  else img.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(phSvg(p.g).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));
  img.alt = p.c || '';
  $('lbCap').textContent = BY[e.a].n + ', ' + dstr(e.d) + (p.c ? ': ' + p.c : '');
  $('lightbox').showModal();
});
$('lbClose').onclick = () => $('lightbox').close();

/* ---------- Eintragen ---------- */
let rate = 4, pending = [];
$('fArea').innerHTML = AREAS.slice().sort((a, b) => a.n.localeCompare(b.n, 'de')).map((a) => '<option value="' + a.id + '">' + esc(a.n) + '</option>').join('');
function renderRate(){ $('fRate').innerHTML = [1,2,3,4,5].map((i) => '<button type="button" data-r="' + i + '" class="' + (i <= rate ? 'on' : '') + '" aria-label="' + i + ' Sterne">★</button>').join(''); }
$('fRate').onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) { rate = +b.dataset.r; renderRate(); } };
function renderPending(){
  const box = $('fPhotos'); box.querySelectorAll('.ph').forEach((n) => n.remove());
  pending.forEach((p) => { const d = document.createElement('div'); d.className = 'ph'; d.style.backgroundImage = 'url("' + p.url + '")'; box.appendChild(d); });
}
$('fFile').onchange = function(){ Array.from(this.files).forEach((f) => pending.push({file:f, url:URL.createObjectURL(f), c:f.name})); this.value = ''; renderPending(); };
function openEntry(area){
  const form = $('entryForm'); form.reset(); pending = []; renderPending(); rate = 4; renderRate(); $('stravaList').innerHTML = '';
  $('fDate').value = new Date().toISOString().slice(0, 10);
  $('fArea').value = area || (location.hash.startsWith('#/gebiet/') ? location.hash.split('/')[2] : 'gerlitzen');
  $('entry').showModal();
}
$('fab').onclick = () => openEntry();
$('entry').addEventListener('close', async function(){
  if (location.hash === '#/neu') history.replaceState(null, '', '#/tagebuch');
  if (this.returnValue !== 'ok') return;
  const id = Date.now(), area = $('fArea').value, isNew = !visits(area).length;
  const ph = [];
  for (let i = 0; i < pending.length; i++) {
    const pid = id + '-' + i;
    try {
      const blob = await shrink(pending[i].file);
      const sid = await sync.uploadPhoto(blob);
      if (sid) ph.push({sid, c:''}); else { await photoDB.put(pid, blob); ph.push({id:pid, c:'', pending:true}); }
    } catch(e){ toast('Ein Foto konnte nicht gespeichert werden.'); }
  }
  diary.push({id, d:$('fDate').value, a:area, hm:+$('fHm').value || 0, km:+$('fKm').value || 0, runs:+$('fRuns').value || 0, vmax:+$('fV').value || 0,
    snow:$('fSnow').value, r:rate, note:$('fNote').value.trim(), travel:$('fTravel').value.trim(), ph});
  saveDiary();
  toast(isNew ? BY[area].n + ' abgehakt' : 'Skitag gespeichert');
  if (location.hash === '#/tagebuch') renderDiary(); else location.hash = '#/tagebuch';
});

/* ---------- Rechnung ---------- */
function renderCalc(){
  const days = diary.slice().sort((a, b) => a.d < b.d ? -1 : 1);
  let sum = 0, cross = null, rows = '';
  days.forEach((e) => {
    const p = price(e.a); sum += p; const c = !cross && sum >= passPrice; if (c) cross = e;
    rows += '<li class="' + (c ? 'cross' : '') + '"><span class="d">' + dstr(e.d, {day:'numeric', month:'short'}) + '</span><span class="n">' + esc(BY[e.a].n) + '</span><span class="p">' + eur(p) + '</span><span class="s">' + eur(sum) + '</span></li>';
  });
  const done = sum; let psum = sum;
  plannedDays().forEach((e) => {
    const p = price(e.a); psum += p; const c = !cross && psum >= passPrice; if (c) cross = e;
    rows += '<li class="planned' + (c ? ' cross' : '') + '"><span class="d">' + dstr(e.d, {day:'numeric', month:'short'}) + '</span><span class="n">' + esc(BY[e.a].n) + ' (geplant)</span><span class="p">' + eur(p) + '</span><span class="s">' + eur(psum) + '</span></li>';
  });
  $('ledger').innerHTML = rows || '<li><span></span><span>Noch keine Skitage.</span></li>';
  const rest = passPrice - done, avg = days.length ? done / days.length : 60, max = Math.max(passPrice, psum) * 1.06 || 1;
  const after = passPrice - psum;
  $('calcHero').innerHTML =
    (rest > 0 ? '<div class="big">' + eur(Math.round(rest)) + '</div><p>fehlen noch, bis sich der Pass gerechnet hat. Das sind etwa <b>' + Math.ceil(rest / avg) + ' Skitage</b> zu je ' + eur(Math.round(avg)) + '. ' +
      (plannedDays().length ? (after <= 0 ? 'Mit deinem geplanten Trip bist du drüber.' : 'Nach dem geplanten Trip fehlen noch ' + eur(Math.round(after)) + '.') : '') + '</p>'
    : '<div class="big pos">+' + eur(Math.round(-rest)) + '</div><p>gespart. Der Pass ist drin seit ' + dstr(cross.d, {day:'numeric', month:'long'}) + ' am ' + esc(BY[cross.a].n) + '.</p>') +
    '<div class="meter" aria-hidden="true"><div class="fill" style="width:' + (done / max * 100) + '%"></div><div class="planned" style="left:' + (done / max * 100) + '%;width:' + ((psum - done) / max * 100) + '%"></div><div class="goal" style="left:' + (passPrice / max * 100) + '%"></div></div>' +
    '<div class="meter-lab"><span>' + eur(Math.round(done)) + ' gefahren</span><span>Pass ' + eur(passPrice) + '</span></div>' +
    '<div class="sumgrid"><label><span>Passpreis</span><input type="number" id="passIn" inputmode="decimal" min="0" value="' + passPrice + '"></label>' +
    '<div><span>Kosten pro Skitag</span><b>' + (days.length ? eur(Math.round(passPrice / days.length)) : '–') + '</b></div>' +
    '<div><span>Skitage</span><b>' + days.length + '</b></div><div><span>Ø Tageskarte</span><b>' + (days.length ? eur(Math.round(avg)) : '–') + '</b></div></div>';
  $('passIn').onchange = function(){ passPrice = Math.max(0, +this.value || 0); store.set('pass', passPrice); sync.push(); renderCalc(); };
  const v = visited();
  $('prices').innerHTML = AREAS.slice().sort((a, b) => a.n.localeCompare(b.n, 'de')).map((a) => {
    const s = PRICE_SRC[a.id], n = visits(a.id).length;
    return '<li><span><span style="font-weight:600">' + esc(a.n) + '</span><small>' + (n ? n + '× gefahren · ' : '') + esc(s[2]) + '</small></span><span class="src ' + s[1] + '">' + ({ok:'2026/27', alt:'älter', est:'geschätzt'}[s[1]]) + '</span>' +
      '<input type="number" inputmode="decimal" step="0.5" min="0" data-price="' + a.id + '" value="' + price(a.id) + '" aria-label="Tageskarte ' + esc(a.n) + '"></li>';
  }).join('');
}
$('prices').addEventListener('change', (e) => {
  const id = e.target.dataset.price; if (!id) return;
  const val = +e.target.value; if (val === PRICE_SRC[id][0]) delete priceOverride[id]; else priceOverride[id] = val;
  store.set('prices', priceOverride); sync.push(); renderCalc();
});

/* ---------- PWA ---------- */
const setOnline = () => { $('offline').hidden = navigator.onLine; };
window.addEventListener('online', () => { setOnline(); if (location.hash.startsWith('#/gebiet/')) route(); });
window.addEventListener('offline', setOnline);
setOnline();

let deferred = null;
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; $('install').hidden = false; });
if (isIOS && !standalone) $('install').hidden = false;
$('install').onclick = async () => {
  if (deferred) { deferred.prompt(); const r = await deferred.userChoice; deferred = null; if (r.outcome === 'accepted') $('install').hidden = true; }
  else if (isIOS) $('iosHint').showModal();
};
window.addEventListener('appinstalled', () => { $('install').hidden = true; toast('App installiert'); });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').then((reg) => {
    const ask = (w) => toast('Neue Version da', 'Neu laden', () => w.postMessage('skipWaiting'));
    if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w); });
    });
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded) { reloaded = true; location.reload(); } });
}

$('infoBtn').onclick = () => { renderAccount(); $('info').showModal(); };
document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = () => b.closest('dialog').close(); });
sync.boot();
renderRate();
route();
})();
