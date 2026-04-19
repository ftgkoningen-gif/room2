/**
 * Lokale dry-run voor de WK 2026 scheduler-logica.
 * Gebruikt de key uit apps/voetbal-draft/.api-keys/api-football.txt.
 * Raakt Supabase NIET aan — toont alleen wat er gepland zou worden.
 *
 *   node agents/_test-wk2026.mjs
 */
import { readFileSync } from 'fs';

const KEY = readFileSync(
  'apps/voetbal-draft/.api-keys/api-football.txt',
  'utf8'
).trim();
const API_BASE = 'https://v3.football.api-sports.io';

async function apiFetch(path) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'x-apisports-key': KEY },
  });
  const j = await res.json();
  if (j.errors && Object.keys(j.errors).length) {
    console.error('API-fout:', j.errors);
    process.exit(1);
  }
  return j;
}

console.log('\n━━━ TEST 1 · Account-status ━━━');
const status = await apiFetch('/status');
const sub = status.response?.subscription;
const req = status.response?.requests;
console.log(`  Account : ${status.response?.account?.firstname} ${status.response?.account?.lastname}`);
console.log(`  Plan    : ${sub?.plan} (actief tot ${sub?.end?.slice(0,10)})`);
console.log(`  Vandaag : ${req?.current}/${req?.limit_day} requests gebruikt`);

console.log('\n━━━ TEST 2 · WK 2026 fixtures ━━━');
const fixtures = await apiFetch('/fixtures?league=1&season=2026');
const all = fixtures.response ?? [];
console.log(`  Totaal fixtures in API: ${all.length}`);

const statuses = {};
for (const f of all) {
  const s = f.fixture.status?.short || 'UNK';
  statuses[s] = (statuses[s] || 0) + 1;
}
console.log('  Status-verdeling:', statuses);

console.log('\n━━━ TEST 3 · Komende 14 dagen ━━━');
const now = new Date();
const cutoff = new Date(now.getTime() + 14 * 86400000);
const upcoming = all
  .filter(f => {
    const d = new Date(f.fixture.date);
    return d >= now && d <= cutoff;
  })
  .sort((a, b) => a.fixture.date.localeCompare(b.fixture.date));

console.log(`  Gevonden: ${upcoming.length} fixture(s) in de komende 14 dagen`);
for (const f of upcoming.slice(0, 10)) {
  const t = new Date(f.fixture.date);
  console.log(`    ${t.toISOString().slice(0,16).replace('T',' ')}  ${f.teams.home.name.padEnd(18)} vs ${f.teams.away.name}`);
}

console.log('\n━━━ TEST 4 · Scheduler-simulatie (wat zou er NU gequeued worden?) ━━━');
const FETCH_DELAY_MIN = 135;
const from = now.toISOString().slice(0, 10);
const toD = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
const {response: next48} = await apiFetch(`/fixtures?league=1&season=2026&from=${from}&to=${toD}`);
console.log(`  Fixtures in komende 48u (from=${from}, to=${toD}): ${next48?.length ?? 0}`);
if ((next48?.length ?? 0) === 0) {
  console.log('  → Scheduler zou 0 match-fetches queuen (correct: WK begint 11 juni)');
} else {
  for (const f of next48) {
    const kick = new Date(f.fixture.date);
    const fetchAt = new Date(kick.getTime() + FETCH_DELAY_MIN * 60_000);
    const delayMin = Math.round((fetchAt - now) / 60_000);
    console.log(`  → fixture ${f.fixture.id}: ${f.teams.home.name} vs ${f.teams.away.name}`);
    console.log(`      kick-off ${kick.toISOString()} → fetch at ${fetchAt.toISOString()} (in ${delayMin} min)`);
  }
}

console.log('\n━━━ TEST 5 · Squads-endpoint ━━━');
console.log('  Check of /players/squads een van de hosts squad ophaalt...');
const teamsData = await apiFetch('/teams?league=1&season=2026');
const teams = teamsData.response ?? [];
const mexico = teams.find(t => /Mexico/i.test(t.team?.name));
if (mexico) {
  const sq = await apiFetch(`/players/squads?team=${mexico.team.id}`);
  const players = sq.response?.[0]?.players ?? [];
  console.log(`  Mexico (team-id ${mexico.team.id}): ${players.length} spelers in squad`);
  if (players.length > 0) {
    console.log(`    Voorbeeld: ${players.slice(0,3).map(p => `${p.name} (${p.position})`).join(', ')}…`);
  }
} else {
  console.log('  Mexico niet gevonden in teams-lijst');
}

console.log('\n━━━ Totaal API-calls deze test: ~5 ━━━');
console.log('(gratis tier = 100/dag, nog ruimschoots speling)\n');
