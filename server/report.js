// Aktueller Lift- und Pistenstatus je Gebiet, von Intermaps (die interaktiven Pistenpläne der Gebiete).
// bergfex sperrt Server-Abrufe (403), deshalb Intermaps. Nur auf Abruf, 15 Minuten zwischengespeichert.
const SLUG = {
  ankogel:'ankogel', bkk:'bad_kleinkirchheim', dreilaendereck:'dreilaendereck', emberger:'emberger_alm',
  falkert:'falkert', flattnitz:'flattnitz', gerlitzen:'gerlitzen', goldeck:'goldeck', heiligenblut:'heiligenblut',
  hochrindl:'hochrindl', katschberg:'katschberg', klippitz:'klippitztoerl', koetschach:'koetschach', koralpe:'koralpe',
  lienz:'lienz_zettersfeld', matrei:'kals_matrei', moelltaler:'moelltaler_gletscher', nassfeld:'nassfeld', petzen:'petzen',
  sillian:'sillian', simonhoehe:'simonhoehe', stjakob:'st_jakob', turracher:'turracher_hoehe', weinebene:'weinebene',
  weissbriach:'gitschtal', weissensee:'weissensee'
};
const cache = new Map();

export async function report(areaId){
  const slug = SLUG[areaId];
  if (!slug) return {source: null};
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.t < 15 * 60e3) return hit.v;
  const r = await fetch(`https://winter.intermaps.com/${slug}/data?lang=de`, {headers: {'User-Agent': 'skisaison-private (ski.olomek.com)', 'Accept': 'application/json'}});
  if (!r.ok) throw new Error('Intermaps antwortet mit ' + r.status);
  const d = await r.json();

  const item = (x) => {
    const p = x.popup || {}, info = p['additional-info'] || {};
    return {n: p.title || x.title || '', s: x.status || p.status || 'unknown', type: p.subtitle || '', len: info.length || null, diff: p.difficulty || null};
  };
  const lifts = (d.lifts || []).map(item).filter((x) => x.n);
  const slopes = (d.slopes || []).map(item).filter((x) => x.n);
  const known = [...lifts, ...slopes].some((x) => x.s === 'open' || x.s === 'closed');
  const count = (list) => known ? list.filter((x) => x.s === 'open').length : null;
  const km = (list) => Math.round(list.reduce((s, x) => s + (x.len || 0), 0) / 100) / 10;

  const v = {
    source: `https://winter.intermaps.com/${slug}`,
    reportedAt: d.lastUpdate || null,
    liftsOpen: count(lifts), liftsTotal: lifts.length,
    slopesOpen: count(slopes), slopesTotal: slopes.length,
    slopesKmOpen: known ? km(slopes.filter((x) => x.s === 'open')) : null, slopesKm: km(slopes),
    lifts: lifts.map(({n, s, type}) => ({n, s, type})),
    slopes: slopes.map(({n, s, diff, len}) => ({n, s, diff, len})),
    fetchedAt: new Date().toISOString()
  };
  cache.set(slug, {t: Date.now(), v});
  return v;
}
