// ÖBB-Verbindungen über hafas-client (inoffizielle Schnittstelle der ÖBB-App).
// Wenige Abfragen, mit Cache. Kann jederzeit ausfallen, die App fällt dann auf den Scotty-Link zurück.
import {createClient} from 'hafas-client';
import {profile} from 'hafas-client/p/oebb/index.js';

const client = createClient(profile, 'skisaison-private (ski.olomek.com)');
const stations = new Map();
const cache = new Map();

async function station(name){
  if (stations.has(name)) return stations.get(name);
  const [s] = await client.locations(name, {results: 1, poi: false, addresses: false});
  if (!s) throw new Error('Station nicht gefunden: ' + name);
  stations.set(name, {id: s.id, name: s.name});
  return stations.get(name);
}

export async function journeys(toName, when){
  const key = toName + '|' + Math.floor(when.getTime() / 300e3);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < 60e3) return hit.v;
  const [from, to] = await Promise.all([station('Villach Hbf'), station(toName)]);
  const r = await client.journeys(from.id, to.id, {results: 4, departure: when, stopovers: false, remarks: false});
  const v = {
    from: from.name, to: to.name,
    journeys: r.journeys.map((j) => ({
      dep: j.legs[0].departure, depPlanned: j.legs[0].plannedDeparture, depDelay: j.legs[0].departureDelay,
      arr: j.legs.at(-1).arrival, arrDelay: j.legs.at(-1).arrivalDelay,
      legs: j.legs.filter((l) => !l.walking).map((l) => ({
        line: l.line ? l.line.name.replace(/\s*\(Zug-Nr\.[^)]*\)/, '') : null, mode: l.line ? l.line.mode : null,
        from: l.origin.name, to: l.destination.name, dep: l.departure, arr: l.arrival,
        platform: l.departurePlatform || null, cancelled: !!l.cancelled
      }))
    }))
  };
  cache.set(key, {t: Date.now(), v});
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return v;
}
