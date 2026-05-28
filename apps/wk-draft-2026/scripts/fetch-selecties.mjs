/**
 * fetch-selecties.mjs — haalt officiële WK 2026 selecties op van API-Football
 * en genereert een SQL-seed voor de Supabase wk2026_selecties tabel.
 *
 *   node scripts/fetch-selecties.mjs
 *
 * Output:
 *   scripts/cache/teams-wk2026.json    (API-team-lijst, cache)
 *   scripts/cache/selecties-raw.json   (ruwe selecties per team, cache)
 *   scripts/selecties-seed.sql         (INSERT statements voor Supabase)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');
const cacheDir  = join(__dirname, 'cache');
const keyPath   = join(root, '.api-keys', 'api-football.txt');

if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

const KEY  = readFileSync(keyPath, 'utf8').trim();
const BASE = 'https://v3.football.api-sports.io';

async function api(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { 'x-apisports-key': KEY } });
  const j = await r.json();
  if (j.errors && Object.keys(j.errors).length) {
    throw new Error(JSON.stringify(j.errors));
  }
  return j;
}

// API-naam (Engels) → Nederlandse naam (exact match met landen.json)
const TEAM_NL = {
  "Mexico":                     "Mexico",
  "South Africa":                "Zuid-Afrika",
  "South Korea":                 "Zuid-Korea",
  "Korea Republic":              "Zuid-Korea",
  "Czech Republic":              "Tsjechië",
  "Czechia":                     "Tsjechië",
  "Canada":                      "Canada",
  "Bosnia-Herzegovina":          "Bosnië en Herzegovina",
  "Bosnia and Herzegovina":      "Bosnië en Herzegovina",
  "Bosnia & Herzegovina":        "Bosnië en Herzegovina",
  "Qatar":                       "Qatar",
  "Switzerland":                 "Zwitserland",
  "Brazil":                      "Brazilië",
  "Morocco":                     "Marokko",
  "Haiti":                       "Haïti",
  "Scotland":                    "Schotland",
  "United States":               "Verenigde Staten",
  "USA":                         "Verenigde Staten",
  "Paraguay":                    "Paraguay",
  "Australia":                   "Australië",
  "Turkey":                      "Turkije",
  "Turkiye":                     "Turkije",
  "Türkiye":                     "Turkije",
  "Germany":                     "Duitsland",
  "Curacao":                     "Curaçao",
  "Curaçao":                     "Curaçao",
  "Ivory Coast":                 "Ivoorkust",
  "Côte D'Ivoire":               "Ivoorkust",
  "Cote D'Ivoire":               "Ivoorkust",
  "Ecuador":                     "Ecuador",
  "Netherlands":                 "Nederland",
  "Japan":                       "Japan",
  "Sweden":                      "Zweden",
  "Tunisia":                     "Tunesië",
  "Belgium":                     "België",
  "Egypt":                       "Egypte",
  "Iran":                        "Iran",
  "New Zealand":                 "Nieuw-Zeeland",
  "Spain":                       "Spanje",
  "Cape Verde":                  "Kaapverdië",
  "Cape Verde Islands":          "Kaapverdië",
  "Saudi Arabia":                "Saudi-Arabië",
  "Uruguay":                     "Uruguay",
  "France":                      "Frankrijk",
  "Senegal":                     "Senegal",
  "Bolivia":                     "Bolivia",
  "Norway":                      "Noorwegen",
  "Argentina":                   "Argentinië",
  "Algeria":                     "Algerije",
  "Austria":                     "Oostenrijk",
  "Jordan":                      "Jordanië",
  "Portugal":                    "Portugal",
  "DR Congo":                    "Congo-Kinshasa",
  "Congo DR":                    "Congo-Kinshasa",
  "Congo":                       "Congo-Kinshasa",
  "Uzbekistan":                  "Oezbekistan",
  "Colombia":                    "Colombia",
  "England":                     "Engeland",
  "Croatia":                     "Kroatië",
  "Ghana":                       "Ghana",
  "Panama":                      "Panama",
};

// API-positie → app-positie
const POS_MAP = {
  "Goalkeeper": "K",
  "Defender":   "V",
  "Midfielder": "M",
  "Forward":    "A",
  "Attacker":   "A",
};

function esc(s) {
  return String(s ?? '').replace(/'/g, "''");
}

// ─── 1. Teams ophalen ─────────────────────────────────────────────
const teamsPath = join(cacheDir, 'teams-wk2026.json');
let teamsData;
if (existsSync(teamsPath)) {
  console.log('Teams uit cache geladen.');
  teamsData = JSON.parse(readFileSync(teamsPath, 'utf8'));
} else {
  console.log('Teams ophalen van API-Football…');
  teamsData = await api('/teams?league=1&season=2026');
  writeFileSync(teamsPath, JSON.stringify(teamsData, null, 2));
}

const teams = teamsData.response ?? [];
console.log(`${teams.length} teams gevonden.\n`);

// ─── 2. Selecties ophalen per team ────────────────────────────────
const rawPath = join(cacheDir, 'selecties-raw.json');
let selectiesRaw;

if (existsSync(rawPath)) {
  console.log('Selecties uit cache geladen (verwijder cache/selecties-raw.json om opnieuw op te halen).\n');
  selectiesRaw = JSON.parse(readFileSync(rawPath, 'utf8'));
} else {
  selectiesRaw = {};
  let i = 0;
  for (const t of teams) {
    const id   = t.team.id;
    const naam = t.team.name;
    process.stdout.write(`[${++i}/${teams.length}] ${naam}… `);
    try {
      // Gebruik league=1&season=2026 voor de definitieve WK-selectie (26 spelers).
      // Vóór aanvang toernooi: fallback naar /players/squads als resultaat leeg is.
      let players = [];
      const wkRes = await api(`/players/squads?team=${id}&league=1&season=2026`);
      players = wkRes.response?.[0]?.players ?? [];

      if (players.length === 0) {
        // Fallback: algemene squad (markeert als voorselectie bij >26 spelers)
        const fbRes = await api(`/players/squads?team=${id}`);
        players = fbRes.response?.[0]?.players ?? [];
        if (players.length > 0) {
          console.log(`${players.length} spelers (voorselectie-fallback)`);
        } else {
          console.log(`geen spelers`);
        }
      } else {
        console.log(`${players.length} spelers (definitief WK)`);
      }

      selectiesRaw[id] = { team: t.team, players };
    } catch (e) {
      console.error(`FOUT: ${e.message}`);
      selectiesRaw[id] = { team: t.team, players: [] };
    }
    // Free-tier: 10 req/min → 7s pauze
    await new Promise(r => setTimeout(r, 7000));
  }
  writeFileSync(rawPath, JSON.stringify(selectiesRaw, null, 2));
  console.log('\nSelecties gecached.\n');
}

// ─── 3. SQL genereren ─────────────────────────────────────────────
const ongemapte = [];
const rows = [];

for (const data of Object.values(selectiesRaw)) {
  const apiNaam = data.team.name;
  const landNL  = TEAM_NL[apiNaam];

  if (!landNL) {
    ongemapte.push(apiNaam);
    continue;
  }

  for (const p of data.players) {
    rows.push({
      land:          landNL,
      speler:        p.name,
      positie:       POS_MAP[p.position] ?? null,
      nummer:        p.number   ?? null,
      foto_url:      p.photo    ?? null,
      api_player_id: p.id       ?? null,
    });
  }
}

// Sorteer op land + rugnummer
rows.sort((a, b) => a.land.localeCompare(b.land) || (a.nummer ?? 99) - (b.nummer ?? 99));

const aantalLanden = new Set(rows.map(r => r.land)).size;

const values = rows.map(r =>
  `  ('${esc(r.land)}', '${esc(r.speler)}', ` +
  `${r.positie    ? `'${r.positie}'`            : 'NULL'}, ` +
  `${r.nummer     !== null ? r.nummer           : 'NULL'}, ` +
  `${r.foto_url   ? `'${esc(r.foto_url)}'`      : 'NULL'}, ` +
  `${r.api_player_id !== null ? r.api_player_id : 'NULL'})`
).join(',\n');

const sql =
`-- WK 2026 selecties — gegenereerd door fetch-selecties.mjs op ${new Date().toISOString().slice(0, 10)}
-- ${rows.length} spelers | ${aantalLanden} landen
-- Plak dit in de Supabase SQL-editor en voer uit.

INSERT INTO wk2026_selecties (land, speler, positie, nummer, foto_url, api_player_id)
VALUES
${values}
ON CONFLICT (land, speler) DO UPDATE SET
  positie        = EXCLUDED.positie,
  nummer         = EXCLUDED.nummer,
  foto_url       = EXCLUDED.foto_url,
  api_player_id  = EXCLUDED.api_player_id,
  updated_at     = now();
`;

const sqlPath = join(__dirname, 'selecties-seed.sql');
writeFileSync(sqlPath, sql, 'utf8');

console.log(`✓ ${rows.length} spelers voor ${aantalLanden} landen geschreven naar:`);
console.log(`  scripts/selecties-seed.sql\n`);

if (ongemapte.length) {
  console.log(`⚠  Ongemapte API-teamnamen — voeg toe aan TEAM_NL in dit script:`);
  for (const n of [...new Set(ongemapte)].sort()) console.log(`  "${n}": "???",`);
}
