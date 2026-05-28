/**
 * seed-supabase.mjs — laadt selecties uit cache rechtstreeks in Supabase.
 *
 *   node scripts/seed-supabase.mjs
 *
 * Vereist:
 *   .api-keys/api-football.txt  regel 2 = Supabase service role key
 *   scripts/cache/selecties-raw.json (gegenereerd door fetch-selecties.mjs)
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');

const keyLines  = readFileSync(join(root, '.api-keys', 'api-football.txt'), 'utf8').split('\n');
const SERVICE_KEY = keyLines[1]?.trim();
if (!SERVICE_KEY) throw new Error('Supabase service role key niet gevonden op regel 2 van api-football.txt');

const SUPABASE_URL = 'https://mvwsloxbrzzjeamakfzg.supabase.co';
const ENDPOINT     = `${SUPABASE_URL}/rest/v1/wk2026_selecties?on_conflict=land,speler`;

const rawPath = join(__dirname, 'cache', 'selecties-raw.json');
if (!existsSync(rawPath)) throw new Error('selecties-raw.json niet gevonden — draai eerst fetch-selecties.mjs');

const TEAM_NL = {
  "Mexico": "Mexico", "South Africa": "Zuid-Afrika", "South Korea": "Zuid-Korea",
  "Korea Republic": "Zuid-Korea", "Czech Republic": "Tsjechië", "Czechia": "Tsjechië",
  "Canada": "Canada", "Bosnia-Herzegovina": "Bosnië en Herzegovina",
  "Bosnia and Herzegovina": "Bosnië en Herzegovina", "Bosnia & Herzegovina": "Bosnië en Herzegovina",
  "Qatar": "Qatar", "Switzerland": "Zwitserland", "Brazil": "Brazilië",
  "Morocco": "Marokko", "Haiti": "Haïti", "Scotland": "Schotland",
  "United States": "Verenigde Staten", "USA": "Verenigde Staten",
  "Paraguay": "Paraguay", "Australia": "Australië", "Turkey": "Turkije",
  "Turkiye": "Turkije", "Türkiye": "Turkije", "Germany": "Duitsland",
  "Curacao": "Curaçao", "Curaçao": "Curaçao", "Ivory Coast": "Ivoorkust",
  "Côte D'Ivoire": "Ivoorkust", "Cote D'Ivoire": "Ivoorkust",
  "Ecuador": "Ecuador", "Netherlands": "Nederland", "Japan": "Japan",
  "Sweden": "Zweden", "Tunisia": "Tunesië", "Belgium": "België",
  "Egypt": "Egypte", "Iran": "Iran", "New Zealand": "Nieuw-Zeeland",
  "Spain": "Spanje", "Cape Verde": "Kaapverdië", "Cape Verde Islands": "Kaapverdië",
  "Saudi Arabia": "Saudi-Arabië", "Uruguay": "Uruguay", "France": "Frankrijk",
  "Senegal": "Senegal", "Bolivia": "Bolivia", "Norway": "Noorwegen",
  "Argentina": "Argentinië", "Algeria": "Algerije", "Austria": "Oostenrijk",
  "Jordan": "Jordanië", "Portugal": "Portugal", "DR Congo": "Congo-Kinshasa",
  "Congo DR": "Congo-Kinshasa", "Congo": "Congo-Kinshasa",
  "Uzbekistan": "Oezbekistan", "Colombia": "Colombia", "England": "Engeland",
  "Croatia": "Kroatië", "Ghana": "Ghana", "Panama": "Panama",
};

const POS_MAP = { "Goalkeeper": "K", "Defender": "V", "Midfielder": "M", "Forward": "A", "Attacker": "A" };

const selectiesRaw = JSON.parse(readFileSync(rawPath, 'utf8'));

const rows = [];
for (const data of Object.values(selectiesRaw)) {
  const landNL = TEAM_NL[data.team.name];
  if (!landNL) continue;
  for (const p of data.players) {
    rows.push({
      land:          landNL,
      speler:        p.name,
      positie:       POS_MAP[p.position] ?? null,
      nummer:        p.number        ?? null,
      foto_url:      p.photo         ?? null,
      api_player_id: p.id            ?? null,
    });
  }
}

// Dedupliceer op (land, speler) — houd laatste voorkomende rij
const seen = new Map();
for (const r of rows) seen.set(`${r.land}||${r.speler}`, r);
const uniq = [...seen.values()];

console.log(`${uniq.length} unieke spelers voor ${new Set(uniq.map(r => r.land)).size} landen — uploaden naar Supabase…\n`);

// Upsert in batches van 200
const BATCH = 200;
let inserted = 0;
for (let i = 0; i < uniq.length; i += BATCH) {
  const batch = uniq.slice(i, i + BATCH);
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'apikey':        SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(batch),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Batch ${i}–${i + BATCH} mislukt (${res.status}): ${err}`);
  }
  inserted += batch.length;
  process.stdout.write(`\r${inserted}/${uniq.length} spelers geüpload…`);
}

console.log(`\n\n✓ Klaar! ${inserted} spelers staan nu in Supabase.`);
console.log(`  Open http://localhost:3006 → tab Selecties om te controleren.`);
