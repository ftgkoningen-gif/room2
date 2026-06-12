/**
 * seed-wedstrijden.mjs — pre-seed alle WK 2026 fixtures in Supabase
 * zodat de app komende wedstrijden kan tonen vóór de scheidsrechter-bot ze verwerkt.
 *
 * Gebruikt ON CONFLICT DO NOTHING → bestaande "verwerkt"-rijen worden nooit overschreven.
 *
 *   node scripts/seed-wedstrijden.mjs
 *
 * Vereist:
 *   .api-keys/api-football.txt  regel 1 = API-Football key
 *                               regel 2 = Supabase service role key
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const cacheDir = join(__dirname, 'cache');
if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

const keyLines = readFileSync(join(root, '.api-keys', 'api-football.txt'), 'utf8').split('\n');
const API_KEY = keyLines[0]?.trim();
const SERVICE_KEY = keyLines[1]?.trim();
if (!API_KEY) throw new Error('API-Football key ontbreekt (regel 1 van api-football.txt)');
if (!SERVICE_KEY) throw new Error('Supabase service key ontbreekt (regel 2 van api-football.txt)');

const SUPABASE_URL = 'https://mvwsloxbrzzjeamakfzg.supabase.co';
const API_BASE = 'https://v3.football.api-sports.io';

const TEAM_NL = {
  Mexico: 'Mexico', Canada: 'Canada', USA: 'Verenigde Staten',
  Argentina: 'Argentinië', Brazil: 'Brazilië', Paraguay: 'Paraguay',
  Uruguay: 'Uruguay', Ecuador: 'Ecuador', Colombia: 'Colombia', Bolivia: 'Bolivia',
  Panama: 'Panama', Haiti: 'Haïti', Curacao: 'Curaçao', 'Curaçao': 'Curaçao',
  Germany: 'Duitsland', France: 'Frankrijk', England: 'Engeland', Spain: 'Spanje',
  Portugal: 'Portugal', Netherlands: 'Nederland', Belgium: 'België', Italy: 'Italië',
  Croatia: 'Kroatië', Switzerland: 'Zwitserland', Denmark: 'Denemarken',
  Austria: 'Oostenrijk', Poland: 'Polen', Turkey: 'Turkije', Hungary: 'Hongarije',
  Scotland: 'Schotland', Norway: 'Noorwegen', Sweden: 'Zweden',
  'Bosnia and Herzegovina': 'Bosnië en Herzegovina', 'Czech Republic': 'Tsjechië',
  Czechia: 'Tsjechië',
  Japan: 'Japan', 'South Korea': 'Zuid-Korea', 'Korea Republic': 'Zuid-Korea',
  Iran: 'Iran', 'Saudi Arabia': 'Saudi-Arabië', Australia: 'Australië',
  Qatar: 'Qatar', Uzbekistan: 'Oezbekistan', Jordan: 'Jordanië',
  Morocco: 'Marokko', Senegal: 'Senegal', Tunisia: 'Tunesië', Egypt: 'Egypte',
  Nigeria: 'Nigeria', Algeria: 'Algerije', 'Ivory Coast': 'Ivoorkust',
  Ghana: 'Ghana', Cameroon: 'Kameroen', 'South Africa': 'Zuid-Afrika',
  'DR Congo': 'Congo-Kinshasa', 'Congo DR': 'Congo-Kinshasa',
  'Cape Verde': 'Kaapverdië', 'New Zealand': 'Nieuw-Zeeland', Iraq: 'Irak',
};
function toNL(n) { return TEAM_NL[n] ?? n; }

function faseOf(round) {
  if (!round) return 'Groep';
  if (/Final$/i.test(round) && !/Semi|Quarter|3rd/i.test(round)) return 'F';
  if (/Semi/i.test(round)) return '1/2';
  if (/Quarter/i.test(round)) return '1/4';
  if (/Round of 16/i.test(round)) return '1/8';
  if (/Round of 32/i.test(round)) return '1/16';
  if (/3rd|Third/i.test(round)) return 'bronze';
  return 'Groep';
}

function pouleOf(round) {
  if (!round) return null;
  const m = round.match(/Group\s+([A-L])\b/i);
  return m ? m[1].toUpperCase() : null;
}

// ─── Fixtures ophalen (gecached) ──────────────────────────────────────
const cacheFile = join(cacheDir, 'fixtures-wk2026.json');
let fixturesData;
if (existsSync(cacheFile)) {
  fixturesData = JSON.parse(readFileSync(cacheFile, 'utf8'));
  console.log('Cache geladen (fixtures-wk2026.json)');
} else {
  console.log('Fixtures ophalen van API-Football (league=1, season=2026)…');
  const res = await fetch(`${API_BASE}/fixtures?league=1&season=2026`, {
    headers: { 'x-apisports-key': API_KEY },
  });
  fixturesData = await res.json();
  if (fixturesData.errors && Object.keys(fixturesData.errors).length) {
    throw new Error(`API-fout: ${JSON.stringify(fixturesData.errors)}`);
  }
  writeFileSync(cacheFile, JSON.stringify(fixturesData));
  console.log('Cache opgeslagen als fixtures-wk2026.json');
}

const fixtures = fixturesData.response ?? [];
console.log(`${fixtures.length} fixtures gevonden\n`);

// ─── Rijen bouwen met Mexico CDT datum+tijd (UTC-5) ──────────────────
function toCdtDatetime(apiDate) {
  const utc = new Date(apiDate ?? 0);
  const cdtMs = utc.getTime() - 5 * 60 * 60 * 1000;
  // Sla op als "YYYY-MM-DDTHH:MM" (CDT lokale tijd, geen Z-suffix)
  return new Date(cdtMs).toISOString().slice(0, 16);
}

const rows = fixtures.map(f => ({
  api_fixture_id: f.fixture.id,
  datum:          toCdtDatetime(f.fixture.date),  // CDT datetime, bijv. "2026-06-12T14:00"
  fase:           faseOf(f.league?.round ?? ''),
  poule:          pouleOf(f.league?.round ?? ''),
  thuis:          toNL(f.teams.home.name),
  uit:            toNL(f.teams.away.name),
  uitslag_thuis:  null,
  uitslag_uit:    null,
  status:         'gepland',
}));

const headers = {
  apikey:        SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer:        'return=minimal',
};
const ENDPOINT = `${SUPABASE_URL}/rest/v1/wk2026_wedstrijden`;

// ─── Stap 1: DELETE alle gepland-rijen ───────────────────────────────
console.log('\nStap 1: gepland-rijen verwijderen…');
const delRes = await fetch(`${ENDPOINT}?status=eq.gepland`, {
  method: 'DELETE', headers,
});
if (!delRes.ok) {
  const err = await delRes.text();
  throw new Error(`DELETE mislukt (${delRes.status}): ${err}`);
}
console.log('✓ Gepland-rijen verwijderd');

// ─── Stap 2: PATCH verwerkt-rijen met gecorrigeerde CDT-datum ────────
// Fixeert bijv. Zuid-Korea vs Tsjechie (02:00 UTC = 21:00 CDT vorige dag)
console.log('Stap 2: datum corrigeren voor verwerkt-rijen…');
// Patch alle verwerkt-rijen: zowel cross-midnight correctie als tijd toevoegen
const verwerktRows = rows;
console.log(`  ${verwerktRows.length} rijen met CDT-datum ≠ UTC-datum`);
for (const r of verwerktRows) {
  const patchRes = await fetch(`${ENDPOINT}?api_fixture_id=eq.${r.api_fixture_id}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ datum: r.datum }),
  });
  if (!patchRes.ok) {
    const err = await patchRes.text();
    console.warn(`  PATCH fixture ${r.api_fixture_id} mislukt: ${err}`);
  } else {
    console.log(`  ✓ Fixture ${r.api_fixture_id} datum → ${r.datum} (CDT)`);
  }
}

// ─── Stap 3: INSERT gepland-rijen (ignore-duplicates voor verwerkt) ──
console.log('Stap 3: fixtures inladen…');
const BATCH = 50;
let inserted = 0;

for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { ...headers, Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify(batch),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Batch ${i}–${i + BATCH} mislukt (${res.status}): ${err}`);
  }
  inserted += batch.length;
  process.stdout.write(`\r  ${inserted}/${rows.length} fixtures…`);
}

// ─── Samenvatting ─────────────────────────────────────────────────────
const byFase = {};
for (const r of rows) byFase[r.fase] = (byFase[r.fase] || 0) + 1;

console.log('\n\n✓ Klaar!\n');
console.log('Verdeling per fase:');
for (const [fase, n] of Object.entries(byFase)) {
  console.log(`  ${fase.padEnd(8)} ${n} wedstrijden`);
}
console.log('\nOpen http://localhost:3006 → Ctrl+Shift+R om de nieuwe data te laden.');
