/* ═══════════════════════════════════════════════════════════════════
   WK 2026 — Trigger.dev auto-sync

   Eén cron-task die twee sub-jobs draait:
     1. Matches-sync  — na elke gespeelde wedstrijd: fetch events,
        upsert naar Supabase (wk2026_wedstrijden + wk2026_events)
     2. Squads-sync   — vanaf mei 2026: fetch 26-koppige selectie per
        land, upsert naar wk2026_selecties

   Cron: elke 30 min; de task kiest zelf welke sub-job relevant is
   op basis van de huidige datum.

   Env vars (in Trigger.dev dashboard):
     - API_FOOTBALL_KEY     (api-sports.io key)
     - SUPABASE_URL
     - SUPABASE_SERVICE_KEY
   ═══════════════════════════════════════════════════════════════════ */

import { schedules, logger } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://v3.football.api-sports.io";
const LEAGUE_ID = 1;       // FIFA World Cup
const SEASON = 2026;

// Windows waarin elke sub-job actief is (UTC-dates)
const MATCHES_WINDOW_START = new Date("2026-06-11T00:00:00Z");
const MATCHES_WINDOW_END   = new Date("2026-07-20T00:00:00Z");
const SQUADS_WINDOW_START  = new Date("2026-05-20T00:00:00Z");
const SQUADS_WINDOW_END    = new Date("2026-06-12T00:00:00Z");

// ─── Helpers ─────────────────────────────────────────────────────────

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_KEY ontbreken");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function apiFetch(path: string) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error("API_FOOTBALL_KEY ontbreekt");
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "x-apisports-key": key },
  });
  const json: any = await res.json();
  if (json.errors && Object.keys(json.errors).length) {
    throw new Error(`API-Football: ${JSON.stringify(json.errors)}`);
  }
  return json;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Land-naam mapping (API → Nederlands) ────────────────────────────
const TEAM_NL: Record<string, string> = {
  Mexico: "Mexico", Canada: "Canada", USA: "Verenigde Staten",
  Argentina: "Argentinië", Brazil: "Brazilië", Paraguay: "Paraguay",
  Uruguay: "Uruguay", Ecuador: "Ecuador", Colombia: "Colombia", Bolivia: "Bolivia",
  Panama: "Panama", Haiti: "Haïti", Curacao: "Curaçao", "Curaçao": "Curaçao",
  Germany: "Duitsland", France: "Frankrijk", England: "Engeland", Spain: "Spanje",
  Portugal: "Portugal", Netherlands: "Nederland", Belgium: "België", Italy: "Italië",
  Croatia: "Kroatië", Switzerland: "Zwitserland", Denmark: "Denemarken",
  Austria: "Oostenrijk", Poland: "Polen", Turkey: "Turkije", Hungary: "Hongarije",
  Scotland: "Schotland", Norway: "Noorwegen", Sweden: "Zweden",
  "Bosnia and Herzegovina": "Bosnië en Herzegovina", "Czech Republic": "Tsjechië",
  Japan: "Japan", "South Korea": "Zuid-Korea", "Korea Republic": "Zuid-Korea",
  Iran: "Iran", "Saudi Arabia": "Saudi-Arabië", Australia: "Australië",
  Qatar: "Qatar", Uzbekistan: "Oezbekistan", Jordan: "Jordanië",
  Morocco: "Marokko", Senegal: "Senegal", Tunisia: "Tunesië", Egypt: "Egypte",
  Nigeria: "Nigeria", Algeria: "Algerije", "Ivory Coast": "Ivoorkust",
  Ghana: "Ghana", Cameroon: "Kameroen", "South Africa": "Zuid-Afrika",
  "DR Congo": "Congo-Kinshasa", "Congo DR": "Congo-Kinshasa",
  "Cape Verde": "Kaapverdië", "New Zealand": "Nieuw-Zeeland",
  Wales: "Wales",
};

function toNL(apiName: string): string {
  return TEAM_NL[apiName] ?? apiName;
}

function faseOf(round: string): string {
  if (/Final$/.test(round)) return "F";
  if (/Semi/.test(round)) return "1/2";
  if (/Quarter/.test(round)) return "1/4";
  if (/Round of 16/i.test(round)) return "1/8";
  if (/Round of 32/i.test(round)) return "1/16";
  if (/3rd Place/i.test(round)) return "bronze";
  return "groep";
}

// ─── Matches-sync ────────────────────────────────────────────────────

async function syncMatches(supabase: any) {
  logger.info("matches-sync: fixtures ophalen");
  const fixturesData = await apiFetch(`/fixtures?league=${LEAGUE_ID}&season=${SEASON}`);
  const fixtures = fixturesData.response ?? [];
  logger.info(`matches-sync: ${fixtures.length} fixtures in API`);

  // Welke zijn al 'verwerkt' in Supabase?
  const { data: verwerkt } = await supabase
    .from("wk2026_wedstrijden")
    .select("api_fixture_id, status")
    .eq("status", "verwerkt");
  const verwerktIds = new Set((verwerkt ?? []).map((r: any) => r.api_fixture_id));

  let nieuw = 0;
  let overgeslagen = 0;
  let fouten = 0;

  for (const f of fixtures) {
    const id: number = f.fixture.id;
    const status: string = f.fixture.status?.short;
    const isFinished = status === "FT" || status === "AET" || status === "PEN";

    if (!isFinished) { overgeslagen++; continue; }
    if (verwerktIds.has(id)) { overgeslagen++; continue; }

    try {
      await upsertFixture(supabase, f);
      nieuw++;
      await sleep(7000); // rate-limit 10/min
    } catch (err) {
      logger.error(`matches-sync: fixture ${id} faalde`, { err: String(err) });
      fouten++;
      if (fouten >= 3) break; // stop bij herhaalde API-fouten
    }
  }

  logger.info(`matches-sync klaar: ${nieuw} nieuw, ${overgeslagen} skip, ${fouten} fout`);
  return { nieuw, overgeslagen, fouten };
}

async function upsertFixture(supabase: any, f: any) {
  const id: number = f.fixture.id;
  const fase = faseOf(f.league.round ?? "");
  const thuis = toNL(f.teams.home.name);
  const uit   = toNL(f.teams.away.name);

  const wedstrijd = {
    api_fixture_id: id,
    datum: (f.fixture.date ?? "").slice(0, 10) || null,
    fase,
    poule: fase === "groep",
    thuis,
    uit,
    uitslag_thuis: f.goals?.home ?? null,
    uitslag_uit:   f.goals?.away ?? null,
    pens_thuis: f.score?.penalty?.home ?? null,
    pens_uit:   f.score?.penalty?.away ?? null,
    status: "verwerkt",
    updated_at: new Date().toISOString(),
  };

  // Fetch player-stats voor events
  const players = await apiFetch(`/fixtures/players?fixture=${id}`);
  const events = buildEventsFromPlayers(players, f, thuis);

  // Upsert wedstrijd
  const { error: wErr } = await supabase
    .from("wk2026_wedstrijden")
    .upsert(wedstrijd, { onConflict: "api_fixture_id" });
  if (wErr) throw wErr;

  // Replace events voor deze fixture (delete-then-insert)
  await supabase.from("wk2026_events").delete().eq("api_fixture_id", id);
  if (events.length) {
    const { error: eErr } = await supabase.from("wk2026_events").insert(events);
    if (eErr) throw eErr;
  }
}

function buildEventsFromPlayers(playersData: any, f: any, thuisNL: string) {
  const eigen = { thuis: f.goals?.home ?? 0, uit: f.goals?.away ?? 0 };
  const events: any[] = [];

  for (const teamBlok of (playersData.response ?? [])) {
    const teamNL = toNL(teamBlok.team.name);
    const isThuis = teamNL === thuisNL;
    const tegenGoals = isThuis ? eigen.uit : eigen.thuis;

    for (const p of (teamBlok.players ?? [])) {
      const naam = p.player?.name;
      const s = p.statistics?.[0];
      if (!naam || !s) continue;
      const minuten = s.games?.minutes ?? 0;
      if (minuten < 1) continue;

      const apiPos = s.games?.position ?? "";
      // Positie afleiden: K/V/M/A — mag later door scheidsrechter overschreven
      // (we gebruiken API-positie als hint; frontend matcht met deelnemer-positie)
      const posHint = ({ G: "K", D: "V", M: "M", F: "A" } as any)[apiPos] ?? null;

      // Gespeeld ≥ 45 min
      if (minuten >= 45) {
        events.push({ api_fixture_id: f.fixture.id, speler: naam, type: "gespeeld45", detail: posHint });
        if (tegenGoals === 0) {
          events.push({ api_fixture_id: f.fixture.id, speler: naam, type: "cleanSheet45", detail: posHint });
        } else {
          for (let i = 0; i < tegenGoals; i++) {
            events.push({ api_fixture_id: f.fixture.id, speler: naam, type: "tegendoelpunt", detail: posHint });
          }
        }
      }

      const total = s.goals?.total ?? 0;
      const pens  = s.penalty?.scored ?? 0;
      const veld  = Math.max(0, total - pens);
      for (let i = 0; i < veld; i++) events.push({ api_fixture_id: f.fixture.id, speler: naam, type: "velddoelpunt", detail: null });
      for (let i = 0; i < pens; i++) events.push({ api_fixture_id: f.fixture.id, speler: naam, type: "strafschop", detail: null });

      const assists = s.goals?.assists ?? 0;
      for (let i = 0; i < assists; i++) events.push({ api_fixture_id: f.fixture.id, speler: naam, type: "assist", detail: null });

      const gele = s.cards?.yellow ?? 0;
      const rode = s.cards?.red ?? 0;
      for (let i = 0; i < gele; i++) events.push({ api_fixture_id: f.fixture.id, speler: naam, type: "geleKaart", detail: null });
      for (let i = 0; i < rode; i++) events.push({ api_fixture_id: f.fixture.id, speler: naam, type: "directeRood", detail: null });
    }
  }
  return events;
}

// ─── Squads-sync ─────────────────────────────────────────────────────

async function syncSquads(supabase: any) {
  logger.info("squads-sync: teams ophalen");
  const teamsData = await apiFetch(`/teams?league=${LEAGUE_ID}&season=${SEASON}`);
  const teams = teamsData.response ?? [];
  logger.info(`squads-sync: ${teams.length} teams gevonden`);

  const { data: existing } = await supabase
    .from("wk2026_selecties")
    .select("land");
  const countsPerLand: Record<string, number> = {};
  for (const r of (existing ?? [])) {
    countsPerLand[r.land] = (countsPerLand[r.land] ?? 0) + 1;
  }

  let nieuw = 0;
  let skip = 0;
  let fouten = 0;

  for (const t of teams) {
    const teamId = t.team?.id;
    const apiNaam = t.team?.name;
    const landNL = toNL(apiNaam);
    if (!teamId || !landNL) continue;

    // Al volledig → skip
    if ((countsPerLand[landNL] ?? 0) >= 26) { skip++; continue; }

    try {
      const squadData = await apiFetch(`/players/squads?team=${teamId}`);
      const squad = squadData.response?.[0]?.players ?? [];
      if (squad.length === 0) { skip++; await sleep(7000); continue; }

      const rows = squad.map((p: any) => ({
        land: landNL,
        speler: p.name,
        positie: ({ Goalkeeper: "K", Defender: "V", Midfielder: "M", Attacker: "A" } as any)[p.position] ?? null,
        nummer: p.number ?? null,
        foto_url: p.photo ?? null,
        api_player_id: p.id ?? null,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("wk2026_selecties")
        .upsert(rows, { onConflict: "land,speler" });
      if (error) throw error;

      nieuw += rows.length;
      logger.info(`squads-sync: ${landNL} — ${rows.length} spelers`);
      await sleep(7000);
    } catch (err) {
      logger.error(`squads-sync: ${landNL} faalde`, { err: String(err) });
      fouten++;
      if (fouten >= 3) break;
    }
  }

  logger.info(`squads-sync klaar: ${nieuw} rows, ${skip} skip, ${fouten} fout`);
  return { nieuw, skip, fouten };
}

// ─── Scheduled task ──────────────────────────────────────────────────

export const wk2026Sync = schedules.task({
  id: "wk2026-sync",
  cron: {
    pattern: "*/30 * * * *", // elke 30 min
    timezone: "Europe/Amsterdam",
  },
  maxDuration: 1200,
  run: async () => {
    const now = new Date();
    const supabase = getSupabase();

    const inMatchesWindow = now >= MATCHES_WINDOW_START && now <= MATCHES_WINDOW_END;
    const inSquadsWindow  = now >= SQUADS_WINDOW_START  && now <= SQUADS_WINDOW_END;

    logger.info("wk2026-sync start", {
      now: now.toISOString(),
      inMatchesWindow,
      inSquadsWindow,
    });

    const result: any = { matches: null, squads: null };

    if (inMatchesWindow) {
      result.matches = await syncMatches(supabase);
    }
    if (inSquadsWindow) {
      result.squads = await syncSquads(supabase);
    }

    if (!inMatchesWindow && !inSquadsWindow) {
      logger.info("Buiten beide vensters — niets te doen.");
    }

    return result;
  },
});
