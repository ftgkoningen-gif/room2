/* ═══════════════════════════════════════════════════════════════════
   WK 2026 — Trigger.dev auto-sync
   ───────────────────────────────────────────────────────────────────
   Drie tasks:

   1. wk2026-scheduler     (cron, dagelijks 04:00 tijdens WK)
      → haalt alle wedstrijden van komende 48u op
      → queued per wedstrijd een one-off wk2026-fetch-match task,
        gepland 30 min na het verwachte einde van de wedstrijd
        (135 min na aftrap; houdt rekening met verlenging/pens)

   2. wk2026-fetch-match   (worker, geen eigen schedule)
      → fetch player-stats van één specifieke fixture
      → upsert naar Supabase (wk2026_wedstrijden + wk2026_events)
      → als match-status nog niet 'FT' is, re-queue zichzelf +15 min

   3. wk2026-squads-sync   (cron, dagelijks 12:00 tijdens selectie-venster)
      → haalt 26-koppige squads per land op
      → upsert naar wk2026_selecties

   Zo draait de taak-infra alleen wanneer het zin heeft i.p.v.
   elke 30 min blind te pollen.

   Env vars (Trigger.dev dashboard, Production):
     - API_FOOTBALL_KEY
     - SUPABASE_URL
     - SUPABASE_SERVICE_KEY
   ═══════════════════════════════════════════════════════════════════ */

import { schedules, task, logger } from "@trigger.dev/sdk";
import { createClient } from "@supabase/supabase-js";

const API_BASE = "https://v3.football.api-sports.io";
const LEAGUE_ID = 1;
const SEASON = 2026;

const MATCHES_WINDOW_START = new Date("2026-06-10T00:00:00Z");
const MATCHES_WINDOW_END   = new Date("2026-07-20T00:00:00Z");
const SQUADS_WINDOW_START  = new Date("2026-05-20T00:00:00Z");
const SQUADS_WINDOW_END    = new Date("2026-06-12T00:00:00Z");

// Delay-policy: 90 min match + 15 HT + 30 (eventuele ET) = 135 min na aftrap
const FETCH_DELAY_AFTER_KICKOFF_MIN = 135;

// Als fixture nog niet FT is bij fetch-moment → retry na 15 min (max 3x)
const RETRY_DELAY_MIN = 15;
const RETRY_MAX = 3;

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
  Iraq: "Irak",
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

// ─── Event-parser ────────────────────────────────────────────────────

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
      const posHint = ({ G: "K", D: "V", M: "M", F: "A" } as any)[apiPos] ?? null;

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
    thuis, uit,
    uitslag_thuis: f.goals?.home ?? null,
    uitslag_uit:   f.goals?.away ?? null,
    pens_thuis: f.score?.penalty?.home ?? null,
    pens_uit:   f.score?.penalty?.away ?? null,
    status: "verwerkt",
    updated_at: new Date().toISOString(),
  };

  const players = await apiFetch(`/fixtures/players?fixture=${id}`);
  const events = buildEventsFromPlayers(players, f, thuis);

  const { error: wErr } = await supabase
    .from("wk2026_wedstrijden")
    .upsert(wedstrijd, { onConflict: "api_fixture_id" });
  if (wErr) throw wErr;

  await supabase.from("wk2026_events").delete().eq("api_fixture_id", id);
  if (events.length) {
    const { error: eErr } = await supabase.from("wk2026_events").insert(events);
    if (eErr) throw eErr;
  }

  return { fixtureId: id, events: events.length };
}

// ─── 1. WORKER: wk2026-fetch-match ───────────────────────────────────

type FetchMatchPayload = { fixtureId: number; attempt?: number };

export const wk2026FetchMatch = task({
  id: "wk2026-fetch-match",
  maxDuration: 300,
  run: async (payload: FetchMatchPayload) => {
    const { fixtureId, attempt = 1 } = payload;
    const supabase = getSupabase();

    logger.info(`fetch-match: fixture ${fixtureId}, poging ${attempt}/${RETRY_MAX}`);

    const fixturesData = await apiFetch(`/fixtures?id=${fixtureId}`);
    const f = fixturesData.response?.[0];
    if (!f) {
      logger.warn(`Fixture ${fixtureId} niet gevonden in API`);
      return { fixtureId, status: "not-found" };
    }

    const status = f.fixture.status?.short;
    const isFinished = status === "FT" || status === "AET" || status === "PEN";

    if (!isFinished) {
      if (attempt >= RETRY_MAX) {
        logger.warn(`Fixture ${fixtureId}: ${attempt} pogingen gedaan, nog niet klaar (status=${status}). Stop.`);
        return { fixtureId, status: "gave-up", apiStatus: status };
      }
      logger.info(`Fixture ${fixtureId} nog status ${status}, re-queue +${RETRY_DELAY_MIN} min`);
      await wk2026FetchMatch.trigger(
        { fixtureId, attempt: attempt + 1 },
        { delay: `${RETRY_DELAY_MIN}m` }
      );
      return { fixtureId, status: "retry-queued", apiStatus: status };
    }

    const result = await upsertFixture(supabase, f);
    logger.info(`Fixture ${fixtureId} verwerkt: ${result.events} events`);
    return { fixtureId, status: "done", events: result.events };
  },
});

// ─── 2. SCHEDULER: wk2026-scheduler ──────────────────────────────────

export const wk2026Scheduler = schedules.task({
  id: "wk2026-scheduler",
  cron: {
    pattern: "0 4 * * *",               // elke dag 04:00
    timezone: "Europe/Amsterdam",
  },
  maxDuration: 180,
  run: async () => {
    const now = new Date();

    if (now < MATCHES_WINDOW_START || now > MATCHES_WINDOW_END) {
      logger.info(`Buiten WK-venster (${now.toISOString()}), scheduler slaat over`);
      return { scheduled: [], skipped: "outside-window" };
    }

    const from = now.toISOString().slice(0, 10);
    const toD = new Date(now.getTime() + 2 * 86400000).toISOString().slice(0, 10);
    const { response } = await apiFetch(
      `/fixtures?league=${LEAGUE_ID}&season=${SEASON}&from=${from}&to=${toD}`
    );
    const fixtures = response ?? [];
    logger.info(`Scheduler: ${fixtures.length} fixtures in venster ${from}..${toD}`);

    const supabase = getSupabase();
    const { data: verwerkt } = await supabase
      .from("wk2026_wedstrijden")
      .select("api_fixture_id")
      .eq("status", "verwerkt");
    const verwerktIds = new Set((verwerkt ?? []).map((r: any) => r.api_fixture_id));

    const scheduled: any[] = [];
    for (const f of fixtures) {
      const id = f.fixture.id;
      if (verwerktIds.has(id)) continue;

      const kickoff = new Date(f.fixture.date);
      const fetchAt = new Date(kickoff.getTime() + FETCH_DELAY_AFTER_KICKOFF_MIN * 60_000);
      const delaySec = Math.floor((fetchAt.getTime() - Date.now()) / 1000);

      if (delaySec < -60 * 60) {
        // match eindigde >1u geleden en is nog niet verwerkt — queue nu
        await wk2026FetchMatch.trigger({ fixtureId: id });
        scheduled.push({ fixtureId: id, fetchAt: "now", note: "match already past" });
      } else if (delaySec > 0) {
        await wk2026FetchMatch.trigger(
          { fixtureId: id },
          { delay: `${delaySec}s` }
        );
        scheduled.push({ fixtureId: id, fetchAt: fetchAt.toISOString() });
      }
      await sleep(100);
    }

    logger.info(`Scheduler klaar: ${scheduled.length} match-fetches gequeued`);
    return { scheduled, totalFixtures: fixtures.length };
  },
});

// ─── 3. SQUADS-SYNC: wk2026-squads-sync ──────────────────────────────

export const wk2026SquadsSync = schedules.task({
  id: "wk2026-squads-sync",
  cron: {
    pattern: "0 12 * * *",              // dagelijks 12:00
    timezone: "Europe/Amsterdam",
  },
  maxDuration: 1200,
  run: async () => {
    const now = new Date();

    if (now < SQUADS_WINDOW_START || now > SQUADS_WINDOW_END) {
      logger.info(`Buiten selectie-venster (${now.toISOString()}), skip`);
      return { skipped: "outside-window" };
    }

    const supabase = getSupabase();

    const teamsData = await apiFetch(`/teams?league=${LEAGUE_ID}&season=${SEASON}`);
    const teams = teamsData.response ?? [];
    logger.info(`squads-sync: ${teams.length} teams`);

    const { data: existing } = await supabase
      .from("wk2026_selecties")
      .select("land");
    const countsPerLand: Record<string, number> = {};
    for (const r of (existing ?? [])) {
      countsPerLand[r.land] = (countsPerLand[r.land] ?? 0) + 1;
    }

    let nieuw = 0, skip = 0, fouten = 0;
    for (const t of teams) {
      const teamId = t.team?.id;
      const landNL = toNL(t.team?.name);
      if (!teamId) continue;
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
  },
});
