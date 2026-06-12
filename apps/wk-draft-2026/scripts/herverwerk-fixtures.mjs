/**
 * herverwerk-fixtures.mjs — herverwerkt al verwerkte fixtures opnieuw
 * met de juiste event-logica (incl. ingevallen <45 min).
 *
 * Gebruik: node scripts/herverwerk-fixtures.mjs [fixtureId1] [fixtureId2] ...
 * Zonder argumenten: verwerkt alle fixtures met status 'verwerkt' opnieuw.
 *
 *   node scripts/herverwerk-fixtures.mjs 1489369 1538999
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const keyLines = readFileSync(join(root, '.api-keys', 'api-football.txt'), 'utf8').split('\n');
const API_KEY = keyLines[0]?.trim();
const SERVICE_KEY = keyLines[1]?.trim();
if (!API_KEY) throw new Error('API-Football key ontbreekt (regel 1)');
if (!SERVICE_KEY) throw new Error('Supabase service key ontbreekt (regel 2)');

const SUPABASE_URL = 'https://mvwsloxbrzzjeamakfzg.supabase.co';
const API_BASE = 'https://v3.football.api-sports.io';

const TEAM_NL = {
  Mexico: 'Mexico', Canada: 'Canada', USA: 'Verenigde Staten',
  Argentina: 'Argentinië', Brazil: 'Brazilië', Paraguay: 'Paraguay',
  Uruguay: 'Uruguay', Ecuador: 'Ecuador', Colombia: 'Colombia', Bolivia: 'Bolivia',
  Panama: 'Panama', Haiti: 'Haïti', Curacao: 'Curaçao', 'Curaçao': 'Curaçao',
  Germany: 'Duitsland', France: 'Frankrijk', England: 'Engeland', Spain: 'Spanje',
  Portugal: 'Portugal', Netherlands: 'Nederland', Belgium: 'België',
  Croatia: 'Kroatië', Switzerland: 'Zwitserland', Denmark: 'Denemarken',
  Austria: 'Oostenrijk', Poland: 'Polen', Turkey: 'Turkije', Norway: 'Noorwegen',
  Sweden: 'Zweden', Scotland: 'Schotland', 'Bosnia and Herzegovina': 'Bosnië en Herzegovina',
  'Czech Republic': 'Tsjechië', Japan: 'Japan', 'South Korea': 'Zuid-Korea',
  'Korea Republic': 'Zuid-Korea', Iran: 'Iran', 'Saudi Arabia': 'Saudi-Arabië',
  Australia: 'Australië', Qatar: 'Qatar', Uzbekistan: 'Oezbekistan',
  Jordan: 'Jordanië', Morocco: 'Marokko', Senegal: 'Senegal', Tunisia: 'Tunesië',
  Egypt: 'Egypte', Nigeria: 'Nigeria', Algeria: 'Algerije', 'Ivory Coast': 'Ivoorkust',
  Ghana: 'Ghana', Cameroon: 'Kameroen', 'South Africa': 'Zuid-Afrika',
  'DR Congo': 'Congo-Kinshasa', 'Cape Verde': 'Kaapverdië', 'New Zealand': 'Nieuw-Zeeland',
  Iraq: 'Irak',
};

function toNL(name) { return TEAM_NL[name] ?? name; }

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, { headers: { 'x-apisports-key': API_KEY } });
  const json = await res.json();
  if (json.errors && Object.keys(json.errors).length) throw new Error(JSON.stringify(json.errors));
  return json;
}

async function supabase(method, table, body, query = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase ${method} ${table} mislukt (${res.status}): ${err}`);
  }
}

function buildEvents(playersData, fixtureId, thuisNL, uitslag) {
  const events = [];
  for (const teamBlok of (playersData.response ?? [])) {
    const teamNL = toNL(teamBlok.team.name);
    const isThuis = teamNL === thuisNL;
    const tegenGoals = isThuis ? uitslag.uit : uitslag.thuis;

    for (const p of (teamBlok.players ?? [])) {
      const naam = p.player?.name;
      const s = p.statistics?.[0];
      if (!naam || !s) continue;
      const minuten = s.games?.minutes ?? 0;
      if (minuten < 1) continue;

      const posHint = ({ G: 'K', D: 'V', M: 'M', F: 'A' })[s.games?.position ?? ''] ?? null;

      if (minuten >= 45) {
        events.push({ api_fixture_id: fixtureId, speler: naam, type: 'gespeeld45', detail: posHint });
        if (tegenGoals === 0) {
          events.push({ api_fixture_id: fixtureId, speler: naam, type: 'cleanSheet45', detail: posHint });
        } else {
          for (let i = 0; i < tegenGoals; i++) {
            events.push({ api_fixture_id: fixtureId, speler: naam, type: 'tegendoelpunt', detail: posHint });
          }
        }
      } else {
        // Invaller <45 min: recht op poulewinst/gelijkspel, geen gespeeld-bonus
        events.push({ api_fixture_id: fixtureId, speler: naam, type: 'ingevallen', detail: posHint });
      }

      const totalGoals = s.goals?.total ?? 0;
      const penScored  = s.penalty?.scored ?? 0;
      const veldGoals  = Math.max(0, totalGoals - penScored);
      for (let i = 0; i < veldGoals; i++) events.push({ api_fixture_id: fixtureId, speler: naam, type: 'velddoelpunt', detail: null });
      for (let i = 0; i < penScored; i++) events.push({ api_fixture_id: fixtureId, speler: naam, type: 'strafschop', detail: null });

      const assists = s.goals?.assists ?? 0;
      for (let i = 0; i < assists; i++) events.push({ api_fixture_id: fixtureId, speler: naam, type: 'assist', detail: null });

      const gele = s.cards?.yellow ?? 0;
      const rode = s.cards?.red ?? 0;
      for (let i = 0; i < gele; i++) events.push({ api_fixture_id: fixtureId, speler: naam, type: 'geleKaart', detail: null });
      for (let i = 0; i < rode; i++) events.push({ api_fixture_id: fixtureId, speler: naam, type: 'directeRood', detail: null });
    }
  }
  return events;
}

// ─── Hoofdlogica ──────────────────────────────────────────────────
const fixtureIds = process.argv.slice(2).map(Number).filter(Boolean);

// Haal te verwerken fixtures op uit Supabase
let fixtures;
if (fixtureIds.length) {
  const query = `?api_fixture_id=in.(${fixtureIds.join(',')})&select=*`;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/wk2026_wedstrijden${query}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  fixtures = await res.json();
} else {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/wk2026_wedstrijden?status=eq.verwerkt&select=*`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  fixtures = await res.json();
}

console.log(`${fixtures.length} fixture(s) te herverwerken...\n`);

for (const w of fixtures) {
  const id = w.api_fixture_id;
  console.log(`► Fixture ${id}: ${w.thuis} vs ${w.uit} (${w.datum})`);

  const playersData = await apiFetch(`/fixtures/players?fixture=${id}`);
  const uitslag = { thuis: w.uitslag_thuis, uit: w.uitslag_uit };
  const events = buildEvents(playersData, id, w.thuis, uitslag);

  // Invallerstabel afdrukken (gespeeld 1-44 min)
  const ingevallen = events.filter(e => e.type === 'ingevallen');
  if (ingevallen.length) {
    console.log(`  Ingevallen (<45 min, ${ingevallen.length} spelers):`);
    const uniq = [...new Set(ingevallen.map(e => e.speler))];
    uniq.forEach(naam => console.log(`    - ${naam}`));
  }

  // Verwijder bestaande events en herinsert
  await supabase('DELETE', 'wk2026_events', null, `?api_fixture_id=eq.${id}`);
  if (events.length) {
    // Batch van 200
    for (let i = 0; i < events.length; i += 200) {
      await supabase('POST', 'wk2026_events', events.slice(i, i + 200));
    }
  }
  console.log(`  ✓ ${events.length} events herschreven (${ingevallen.length} ingevallen)\n`);

  if (fixtures.indexOf(w) < fixtures.length - 1) {
    await new Promise(r => setTimeout(r, 1500)); // kleine pauze voor rate-limit
  }
}

console.log('Klaar! Open de app en druk Ctrl+Shift+R voor een verse herberekening.');
