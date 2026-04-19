/**
 * build-wedstrijden.mjs — leest API-Football cache + deelnemers.json,
 * genereert data/wedstrijden.json met events per drafted speler.
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root     = join(__dirname, '..');
const cacheDir = join(__dirname, 'cache');

// ─── 1. Load inputs ───────────────────────────────────────────────
const fixturesData = JSON.parse(readFileSync(join(cacheDir, 'fixtures.json'), 'utf8'));
const deelnemersData = JSON.parse(readFileSync(join(root, 'data', 'deelnemers.json'), 'utf8'));

// API team-naam → Nederlandse landnaam (zoals in landen.json + deelnemers.json)
const TEAM_NL = {
  "Qatar": "Qatar",
  "Ecuador": "Ecuador",
  "Senegal": "Senegal",
  "Netherlands": "Nederland",
  "England": "Engeland",
  "Iran": "Iran",
  "USA": "Verenigde Staten",
  "Wales": "Wales",
  "Argentina": "Argentinië",
  "Saudi Arabia": "Saudi-Arabië",
  "Mexico": "Mexico",
  "Poland": "Polen",
  "France": "Frankrijk",
  "Australia": "Australië",
  "Denmark": "Denemarken",
  "Tunisia": "Tunesië",
  "Spain": "Spanje",
  "Costa Rica": "Costa Rica",
  "Germany": "Duitsland",
  "Japan": "Japan",
  "Belgium": "België",
  "Canada": "Canada",
  "Morocco": "Marokko",
  "Croatia": "Kroatië",
  "Brazil": "Brazilië",
  "Serbia": "Servië",
  "Switzerland": "Zwitserland",
  "Cameroon": "Kameroen",
  "Portugal": "Portugal",
  "Ghana": "Ghana",
  "Uruguay": "Uruguay",
  "South Korea": "Zuid-Korea",
  "Korea Republic": "Zuid-Korea"
};

// ─── 2. Build drafted-player index: {normNaam → {naam, land, positie}} ───
const stripAccents = s => s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
function norm(s) {
  let n = stripAccents(String(s ?? '').toLowerCase());
  n = n.replace(/\bjunior\b/g, 'jr');
  n = n.replace(/\bjr\.?\b/g, 'jr');
  n = n.replace(/[.'\-\s]+/g, ' ').trim();
  return n;
}

const draftedByName = new Map();  // norm(naam) → speler obj
const draftedByLastName = new Map(); // norm(achternaam) → [speler objs]
for (const d of deelnemersData.deelnemers) {
  for (const sp of d.spelers) {
    draftedByName.set(norm(sp.naam), { ...sp, deelnemer: d.naam });
    const last = sp.naam.split(/\s+/).slice(-1)[0];
    if (last) {
      const key = norm(last);
      if (!draftedByLastName.has(key)) draftedByLastName.set(key, []);
      draftedByLastName.get(key).push({ ...sp, deelnemer: d.naam });
    }
  }
}

function matchDrafted(apiName, apiTeamNL) {
  const n = norm(apiName);
  // exact
  if (draftedByName.has(n)) return draftedByName.get(n);
  // last-name fallback, filter on land
  const last = apiName.split(/\s+/).slice(-1)[0];
  const candidates = draftedByLastName.get(norm(last)) || [];
  const inLand = candidates.filter(c => c.land === apiTeamNL);
  if (inLand.length === 1) return inLand[0];
  // try "first last" vs "shortened" forms like "E. Martinez"
  const parts = apiName.split(/\s+/);
  if (parts.length >= 2) {
    const initialLast = norm(parts[0][0] + '. ' + parts.slice(1).join(' '));
    if (draftedByName.has(initialLast)) return draftedByName.get(initialLast);
  }
  return null;
}

// ─── 3. Fase-mapping ──────────────────────────────────────────────
function faseOf(round) {
  if (/Final$/.test(round)) return 'F';
  if (/Semi/.test(round))   return '1/2';
  if (/Quarter/.test(round))return '1/4';
  if (/Round of 16/i.test(round)) return '1/8';
  if (/3rd Place/i.test(round)) return 'bronze';
  return 'groep';
}

// ─── 4. Walk each fixture ─────────────────────────────────────────
const wedstrijden = [];
const unmatched = new Set();

for (const f of fixturesData.response) {
  const id = f.fixture.id;
  const pd = JSON.parse(readFileSync(join(cacheDir, `players-${id}.json`), 'utf8'));

  const thuisTeamApi = f.teams.home.name;
  const uitTeamApi   = f.teams.away.name;
  const thuis = TEAM_NL[thuisTeamApi] || thuisTeamApi;
  const uit   = TEAM_NL[uitTeamApi]   || uitTeamApi;
  const fase  = faseOf(f.league.round || '');
  const poule = fase === 'groep';
  const uitslag = {
    thuis: f.goals.home ?? 0,
    uit:   f.goals.away ?? 0
  };
  const pens = f.score?.penalty?.home != null ? {
    thuis: f.score.penalty.home, uit: f.score.penalty.away
  } : null;

  // Per-speler events
  const events = [];
  for (const teamBlok of pd.response) {
    const teamApi = teamBlok.team.name;
    const teamNL  = TEAM_NL[teamApi] || teamApi;
    const isThuis = teamNL === thuis;
    const tegenGoals = isThuis ? uitslag.uit : uitslag.thuis;
    const eigenGoals = isThuis ? uitslag.thuis : uitslag.uit;

    for (const p of teamBlok.players) {
      const apiName = p.player.name;
      const s = p.statistics[0];
      if (!s) continue;
      const minuten = s.games.minutes ?? 0;
      if (minuten < 1) continue;

      const drafted = matchDrafted(apiName, teamNL);
      if (!drafted) {
        // Only track unmatched for drafted countries to reduce noise
        if ([...draftedByName.values()].some(d => d.land === teamNL)) {
          unmatched.add(`${teamNL} · ${apiName}`);
        }
        continue;
      }

      const naam = drafted.naam;
      const pos  = drafted.positie;
      const apiPos = s.games.position; // G, D, M, F

      // Gespeeld ≥ 45 min
      if (minuten >= 45) {
        events.push({ speler: naam, type: 'gespeeld45' });

        // Clean sheet: team hield de nul en speler ≥45 min (alleen K/V/M per reglement)
        if (tegenGoals === 0 && (pos === 'K' || pos === 'V' || pos === 'M')) {
          events.push({ speler: naam, type: 'cleanSheet45' });
        }
        // Tegendoelpunten (K en V krijgen −1 per tegengoal; per reglement)
        if (tegenGoals > 0 && (pos === 'K' || pos === 'V')) {
          for (let i = 0; i < tegenGoals; i++) {
            events.push({ speler: naam, type: 'tegendoelpunt' });
          }
        }
      }

      // Goals (API: goals.total = alle doelpunten incl. strafschoppen)
      const totalGoals   = s.goals?.total   ?? 0;
      const penScored    = s.penalty?.scored ?? 0;
      const veldGoals    = Math.max(0, totalGoals - penScored);
      for (let i = 0; i < veldGoals; i++) events.push({ speler: naam, type: 'velddoelpunt' });
      for (let i = 0; i < penScored; i++) events.push({ speler: naam, type: 'strafschop' });

      // Assists
      const assists = s.goals?.assists ?? 0;
      for (let i = 0; i < assists; i++) events.push({ speler: naam, type: 'assist' });

      // Kaarten
      const gele = s.cards?.yellow ?? 0;
      const rode = s.cards?.red ?? 0;
      for (let i = 0; i < gele; i++) events.push({ speler: naam, type: 'geleKaart' });
      for (let i = 0; i < rode; i++) events.push({ speler: naam, type: 'directeRood' });
    }
  }

  wedstrijden.push({
    id: `wk26-${id}`,
    apiFixtureId: id,
    datum: (f.fixture.date || '').slice(0, 10),
    fase,
    poule,
    thuis, uit,
    uitslag,
    pens,
    status: 'verwerkt',
    events
  });
}

// Sort by datum
wedstrijden.sort((a, b) => a.datum.localeCompare(b.datum) || a.apiFixtureId - b.apiFixtureId);

writeFileSync(
  join(root, 'data', 'wedstrijden.json'),
  JSON.stringify({ _info: 'WK 2026 — events uit API-Football', wedstrijden }, null, 2)
);

console.log(`wedstrijden.json geschreven — ${wedstrijden.length} wedstrijden, ${wedstrijden.reduce((n, w) => n + w.events.length, 0)} events.`);
if (unmatched.size) {
  console.log(`\nOngemappte API-namen (mogelijk typo / niet in draft, check handmatig):`);
  for (const u of [...unmatched].sort()) console.log('  -', u);
}
