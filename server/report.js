// Aktueller Schneebericht und Liftstatus je Gebiet, von bergfex.at.
// Nur auf Abruf und 30 Minuten zwischengespeichert, damit wir bergfex nicht belasten.
const SLUG = {
  ankogel:'ankogel', bkk:'badkleinkirchheim', bodental:'bodental', dreilaendereck:'dreilaendereck', emberger:'embergeralm',
  flattnitz:'flattnitz', gerlitzen:'gerlitzen-alpe', goldeck:'goldeck', falkert:'falkert', hochrindl:'hochrindl',
  katschberg:'katschberg', klippitz:'klippitztoerl', koralpe:'koralpe', koetschach:'koetschach-mauthen', lienz:'lienz',
  matrei:'matrei', moelltaler:'moelltalergletscher', nassfeld:'nassfeld', obertilliach:'golzentipp-obertilliach-lesachtal',
  petzen:'petzen', sillian:'sillian', simonhoehe:'sankt-urban', stjakob:'stjakob-defereggen', turracher:'turracherhoehe',
  weinebene:'weinebene', weissbriach:'gitschtal', weissensee:'weissensee'
};
const cache = new Map();
const clean = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const none = (v) => !v || v === '-' || /keine Meldung/i.test(v) ? null : v;

export async function report(areaId){
  const slug = SLUG[areaId];
  if (!slug) return {source: null};
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.t < 30 * 60e3) return hit.v;
  const url = `https://www.bergfex.at/${slug}/schneebericht/`;
  const r = await fetch(url, {headers: {'User-Agent': 'Mozilla/5.0 (skisaison, private App)', 'Accept-Language': 'de-AT'}});
  if (!r.ok) throw new Error('bergfex antwortet mit ' + r.status);
  const html = await r.text();

  // Erstes Vorkommen jedes Feldes (der Loipenbericht weiter unten hat teils gleiche Namen)
  const f = {};
  for (const m of html.matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) {
    const k = clean(m[1]), v = clean(m[2]);
    if (k && !(k in f)) f[k] = v;
  }
  const pick = (re) => { const k = Object.keys(f).find((x) => re.test(x)); return k ? {label: k, value: f[k]} : null; };
  const berg = pick(/^Berg/), tal = pick(/^Tal/);
  const lifts = /(\d+)\s*von\s*(\d+)/.exec(f['Offene Lifte'] || '');
  const cm = (x) => { const m = x && /(\d+)\s*cm/.exec(x.value); return m ? +m[1] : null; };
  const alt = (x) => { const m = x && /([\d.]+)\s*m\)/.exec(x.label); return m ? m[1] : null; };

  const v = {
    source: url,
    reportedAt: none(f['Schneebericht']),
    status: none(f['Betrieb']),
    slopes: none(f['Pistenzustand']),
    snow: none(f['Schneezustand']),
    lastSnowfall: none(f['Letzter Schneefall Region']),
    avalanche: none((f['Lawinenwarnstufe'] || '').replace(/Lawinenwarndienst/g, '').trim()),
    mountain: {cm: cm(berg), alt: alt(berg)},
    valley: {cm: cm(tal), alt: alt(tal)},
    liftsOpen: lifts ? +lifts[1] : null,
    liftsTotal: lifts ? +lifts[2] : null,
    fetchedAt: new Date().toISOString()
  };
  cache.set(slug, {t: Date.now(), v});
  return v;
}
