/**
 * fetch-wk2026.mjs — haalt alle WK 2026 player-stats op van API-Football en
 * slaat ze cache-gewijs op. Rate-limit vriendelijk (sequentieel).
 * Handmatige fallback; in productie draait dit via Trigger.dev (wk2026-sync).
 *
 * Gebruikt: API-Football v3, /fixtures + /fixtures/players
 *
 *   node scripts/fetch-wk2026.mjs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = join(__dirname, '..');
const cacheDir  = join(__dirname, 'cache');
const keyPath   = join(root, '.api-keys', 'api-football.txt');

if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

const KEY = readFileSync(keyPath, 'utf8').trim();
const BASE = 'https://v3.football.api-sports.io';

async function api(path) {
  const r = await fetch(`${BASE}${path}`, { headers: { 'x-apisports-key': KEY } });
  const j = await r.json();
  if (j.errors && Object.keys(j.errors).length) {
    throw new Error(JSON.stringify(j.errors));
  }
  return j;
}

async function getFixtures() {
  const fp = join(cacheDir, 'fixtures.json');
  if (existsSync(fp)) return JSON.parse(readFileSync(fp, 'utf8'));
  console.log('Fetching fixtures list…');
  const j = await api('/fixtures?league=1&season=2026');
  writeFileSync(fp, JSON.stringify(j));
  return j;
}

async function getPlayers(fixtureId) {
  const fp = join(cacheDir, `players-${fixtureId}.json`);
  if (existsSync(fp)) return JSON.parse(readFileSync(fp, 'utf8'));
  const j = await api(`/fixtures/players?fixture=${fixtureId}`);
  writeFileSync(fp, JSON.stringify(j));
  return j;
}

const fixturesData = await getFixtures();
const fixtures = fixturesData.response;
console.log(`${fixtures.length} fixtures in WK 2026`);

let done = 0;
for (const f of fixtures) {
  const id = f.fixture.id;
  process.stdout.write(`\r[${++done}/${fixtures.length}] fixture ${id}  `);
  try {
    await getPlayers(id);
  } catch (e) {
    console.error(`\nError on ${id}: ${e.message}`);
    break;
  }
  // Free-tier rate-limit: 10 req/min → 7s pauze tussen calls
  await new Promise(r => setTimeout(r, 7000));
}
console.log('\nDone fetching.');
