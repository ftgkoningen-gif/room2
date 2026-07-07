/* ═══════════════════════════════════════════════════════════════════
   WK 2026 — Trigger.dev auto-sync
   ───────────────────────────────────────────────────────────────────
   Drie tasks:

   1. wk2026-scheduler     (cron, dagelijks 04:00 tijdens WK)
      → haalt alle wedstrijden van komende 48u op
      → queued per wedstrijd een one-off wk2026-fetch-match task,
        gepland 135 min na aftrap (30 min na verwacht einde 90 min);
        voor KO-wedstrijden ook een backup-trigger op T+200 min
        zodat verlenging + strafschoppen altijd worden gevangen

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

// KO-backup: extra trigger voor KO-wedstrijden die naar verlenging + strafschoppen gaan.
// 200 min = 90 regulier + 15 HT + 30 ET + ~15 ET-pauze + ~15 strafschoppen + 35 marge.
const KO_BACKUP_DELAY_MIN = 200;

// Als fixture nog niet FT is bij fetch-moment → retry na 15 min (max 3x)
const RETRY_DELAY_MIN = 15;
const RETRY_MAX = 5;

// Na de eerste verwerking nog één keer herbevestigen: API-Football's discipline-data
// (kaarten) komt soms pas enkele minuten na de uitslag binnen, waardoor een match die
// vlak na affluiten wordt opgehaald met onvolledige stats wordt vastgelegd.
const FINAL_CHECK_DELAY_MIN = 60;

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
  Mexico: "Mexico", Canada: "Canada", USA: "Verenigde Staten", "United States": "Verenigde Staten",
  Argentina: "Argentinië", Brazil: "Brazilië", Paraguay: "Paraguay",
  Uruguay: "Uruguay", Ecuador: "Ecuador", Colombia: "Colombia", Bolivia: "Bolivia",
  Panama: "Panama", Haiti: "Haïti", Curacao: "Curaçao", "Curaçao": "Curaçao",
  Germany: "Duitsland", France: "Frankrijk", England: "Engeland", Spain: "Spanje",
  Portugal: "Portugal", Netherlands: "Nederland", Belgium: "België", Italy: "Italië",
  Croatia: "Kroatië", Switzerland: "Zwitserland", Denmark: "Denemarken",
  Austria: "Oostenrijk", Poland: "Polen", Turkey: "Turkije", Hungary: "Hongarije",
  Scotland: "Schotland", Norway: "Noorwegen", Sweden: "Zweden",
  "Bosnia and Herzegovina": "Bosnië en Herzegovina", "Bosnia & Herzegovina": "Bosnië en Herzegovina",
  "Czech Republic": "Tsjechië", Czechia: "Tsjechië",
  Turkey: "Turkije", "Türkiye": "Turkije",
  Japan: "Japan", "South Korea": "Zuid-Korea", "Korea Republic": "Zuid-Korea",
  Iran: "Iran", "Saudi Arabia": "Saudi-Arabië", Australia: "Australië",
  Qatar: "Qatar", Uzbekistan: "Oezbekistan", Jordan: "Jordanië",
  Morocco: "Marokko", Senegal: "Senegal", Tunisia: "Tunesië", Egypt: "Egypte",
  Nigeria: "Nigeria", Algeria: "Algerije", "Ivory Coast": "Ivoorkust",
  Ghana: "Ghana", Cameroon: "Kameroen", "South Africa": "Zuid-Afrika",
  "DR Congo": "Congo-Kinshasa", "Congo DR": "Congo-Kinshasa",
  "Cape Verde": "Kaapverdië", "Cape Verde Islands": "Kaapverdië", "New Zealand": "Nieuw-Zeeland",
  Iraq: "Irak",
};

function toNL(apiName: string): string {
  return TEAM_NL[apiName] ?? apiName;
}

// Spelersnamen die de API inconsistent schrijft → gestandaardiseerde naam voor DB
const SPELER_NORM: Record<string, string> = {
  "Bono":    "Y. Bounou",         // Yassine Bounou (Marokko) — API gebruikt soms "Bono"
  "Alisson": "Alisson Becker",    // Brazilië keepersnaam varieert per fixture
};

function normSpeler(apiNaam: string): string {
  return SPELER_NORM[apiNaam] ?? apiNaam;
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
  // Voorkom dubbele verwerking als de API dezelfde speler in meerdere blokken teruggeeft
  const gezien = new Set<string>();

  for (const teamBlok of (playersData.response ?? [])) {
    const teamNL = toNL(teamBlok.team.name);
    const isThuis = teamNL === thuisNL;
    const tegenGoals = isThuis ? eigen.uit : eigen.thuis;

    for (const p of (teamBlok.players ?? [])) {
      const naam = normSpeler(p.player?.name ?? "");
      const s = p.statistics?.[0];
      if (!naam || !s) continue;
      if (gezien.has(naam)) continue;
      gezien.add(naam);
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
      } else if (minuten >= 1) {
        // Invaller <45 min: geen gespeeld-bonus, maar wel recht op poulewinst/gelijkspel
        events.push({ api_fixture_id: f.fixture.id, speler: naam, type: "ingevallen", detail: posHint });
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

  const cestDatum = (() => {
    const utc = new Date(f.fixture.date ?? 0);
    const cestMs = utc.getTime() + 2 * 60 * 60 * 1000; // CEST = UTC+2
    return new Date(cestMs).toISOString().slice(0, 10);
  })();

  const wedstrijd = {
    api_fixture_id: id,
    datum: cestDatum || null,
    fase,
    poule: null,
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

  // Verwijder handmatig ingevoerde placeholder-rijen (200.000 <= ID < 1.000.000) voor
  // hetzelfde duel. Bovengrens is cruciaal: echte API-fixtures zitten in de miljoenen en
  // zouden zonder deze grens hun eigen zojuist geschreven rij weer verwijderen.
  // Beide thuis/uit-richtingen worden gecheckt voor het geval de API ze anders sorteert.
  await supabase.from("wk2026_wedstrijden").delete()
    .gte("api_fixture_id", 200000).lt("api_fixture_id", 1_000_000)
    .eq("fase", fase).eq("thuis", thuis).eq("uit", uit);
  await supabase.from("wk2026_wedstrijden").delete()
    .gte("api_fixture_id", 200000).lt("api_fixture_id", 1_000_000)
    .eq("fase", fase).eq("thuis", uit).eq("uit", thuis);

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

    // Early-exit als de match al verwerkt is (bv. door de primaire trigger of een eerdere retry)
    const { data: bestaand } = await supabase
      .from("wk2026_wedstrijden")
      .select("status")
      .eq("api_fixture_id", fixtureId)
      .maybeSingle();
    if (bestaand?.status === "verwerkt") {
      logger.info(`Fixture ${fixtureId} al verwerkt door eerdere trigger, skip`);
      return { fixtureId, status: "already-done" };
    }

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

    // Kaarten/discipline-data komt bij API-Football soms pas na de uitslag binnen —
    // 60 min later nog één keer verifiëren en eventueel corrigeren.
    await wk2026FinalCheck.trigger({ fixtureId }, { delay: `${FINAL_CHECK_DELAY_MIN}m` });

    return { fixtureId, status: "done", events: result.events };
  },
});

// ─── 1b. WORKER: wk2026-final-check ──────────────────────────────────
// Draait eenmalig, 60 min na de eerste verwerking van een wedstrijd. Haalt de
// spelersstats opnieuw op en overschrijft de events — vangt late correcties op
// (met name kaarten, die bij API-Football soms vertraagd binnenkomen).

type FinalCheckPayload = { fixtureId: number };

export const wk2026FinalCheck = task({
  id: "wk2026-final-check",
  maxDuration: 120,
  run: async (payload: FinalCheckPayload) => {
    const { fixtureId } = payload;
    const supabase = getSupabase();

    const fixturesData = await apiFetch(`/fixtures?id=${fixtureId}`);
    const f = fixturesData.response?.[0];
    if (!f) {
      logger.warn(`final-check: fixture ${fixtureId} niet gevonden`);
      return { fixtureId, status: "not-found" };
    }

    const status = f.fixture.status?.short;
    const isFinished = status === "FT" || status === "AET" || status === "PEN";
    if (!isFinished) {
      // Zou niet moeten voorkomen (match was al verwerkt), maar veiligheidscheck
      logger.warn(`final-check: fixture ${fixtureId} onverwacht nog niet FT (status=${status})`);
      return { fixtureId, status: "not-finished", apiStatus: status };
    }

    const result = await upsertFixture(supabase, f);
    logger.info(`final-check: fixture ${fixtureId} herbevestigd — ${result.events} events`);
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

    // Venster: gisteren t/m overmorgen — vangt ook gemiste matches van de nacht op
    const from = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
    const toD  = new Date(now.getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
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

      const fase = faseOf(f.league.round ?? "");
      const isKO = ["1/16", "1/8", "1/4", "1/2", "F", "bronze"].includes(fase);

      // Zorg dat de fixture in de DB staat als "gepland" zodat de app hem kan tonen.
      // upsert met ignoreDuplicates=false maar zonder "verwerkt" te overschrijven.
      const cestDatum = (() => {
        const utcMs = new Date(f.fixture.date ?? 0).getTime();
        return new Date(utcMs + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
      })();
      await supabase.from("wk2026_wedstrijden").upsert(
        {
          api_fixture_id: id,
          datum: cestDatum,
          fase,
          poule: null,
          thuis: toNL(f.teams.home.name),
          uit:   toNL(f.teams.away.name),
          uitslag_thuis: null,
          uitslag_uit:   null,
          pens_thuis: null,
          pens_uit:   null,
          status: "gepland",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "api_fixture_id", ignoreDuplicates: true }  // bestaande rijen niet overschrijven
      );

      const kickoff = new Date(f.fixture.date);
      const fetchAt = new Date(kickoff.getTime() + FETCH_DELAY_AFTER_KICKOFF_MIN * 60_000);
      const delaySec = Math.floor((fetchAt.getTime() - Date.now()) / 1000);

      if (delaySec <= 0) {
        // fetch-moment is verstreken en match nog niet verwerkt — queue nu
        await wk2026FetchMatch.trigger({ fixtureId: id });
        scheduled.push({ fixtureId: id, fetchAt: "now", note: "match already past" });
      } else {
        await wk2026FetchMatch.trigger(
          { fixtureId: id },
          { delay: `${delaySec}s` }
        );
        scheduled.push({ fixtureId: id, fetchAt: fetchAt.toISOString() });

        // KO-backup: extra trigger 65 min later voor wedstrijden die naar verlenging gaan
        if (isKO) {
          const fetchAt2 = new Date(kickoff.getTime() + KO_BACKUP_DELAY_MIN * 60_000);
          const delaySec2 = Math.floor((fetchAt2.getTime() - Date.now()) / 1000);
          if (delaySec2 > 0) {
            await wk2026FetchMatch.trigger(
              { fixtureId: id },
              { delay: `${delaySec2}s` }
            );
            scheduled.push({ fixtureId: id, fetchAt: fetchAt2.toISOString(), note: "KO-backup (ET+pen)" });
          }
        }
      }
      await sleep(100);
    }

    logger.info(`Scheduler klaar: ${scheduled.length} match-fetches gequeued`);
    return { scheduled, totalFixtures: fixtures.length };
  },
});

// ─── 3. ODDS-SYNC: wk2026-odds-sync ──────────────────────────────────

export const wk2026OddsSync = schedules.task({
  id: "wk2026-odds-sync",
  cron: {
    pattern: "30 5 * * *",              // dagelijks 05:30 Amsterdam
    timezone: "Europe/Amsterdam",
  },
  maxDuration: 600,
  run: async () => {
    const now = new Date();
    if (now < MATCHES_WINDOW_START || now > MATCHES_WINDOW_END) {
      logger.info(`Buiten WK-venster, odds-sync slaat over`);
      return { skipped: "outside-window" };
    }

    const supabase = getSupabase();

    // Haal ongespeelde fixtures op binnen het komende 7-dagenvenster.
    // Odds voor wedstrijden ver in de toekomst zijn weinig liquide en nauwelijks
    // informatief; de simulatie valt dan terug op TEAM_KRACHT. Zo blijven we
    // ruim binnen de API-Football free tier van 100 calls/dag.
    const todayStr = now.toISOString().slice(0, 10);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const { data: openFixtures, error: dbErr } = await supabase
      .from("wk2026_wedstrijden")
      .select("api_fixture_id")
      .neq("status", "verwerkt")
      .gte("datum", todayStr)
      .lte("datum", in7Days);
    if (dbErr) throw dbErr;
    const fixtureIds: number[] = (openFixtures ?? []).map((r: any) => r.api_fixture_id);
    logger.info(`odds-sync: ${fixtureIds.length} ongespeelde fixtures (venster ${todayStr}..${in7Days})`);

    let verwerkt = 0, overgeslagen = 0, fouten = 0;

    for (const fixtureId of fixtureIds) {
      try {
        const kansen = await fetchOddsVoorFixture(fixtureId);
        if (!kansen) { overgeslagen++; await sleep(200); continue; }

        const { error } = await supabase
          .from("wk2026_kansen")
          .upsert({ api_fixture_id: fixtureId, ...kansen, bijgewerkt: new Date().toISOString() },
                   { onConflict: "api_fixture_id" });
        if (error) throw error;

        verwerkt++;
        logger.info(`odds: fixture ${fixtureId} → thuis ${kansen.kans_thuis.toFixed(3)} gelijk ${kansen.kans_gelijk.toFixed(3)} uit ${kansen.kans_uit.toFixed(3)}`);
      } catch (err) {
        logger.error(`odds: fixture ${fixtureId} mislukt`, { err: String(err) });
        fouten++;
      }
      await sleep(200);
    }

    logger.info(`odds-sync klaar: ${verwerkt} verwerkt, ${overgeslagen} overgeslagen, ${fouten} fouten`);
    return { verwerkt, overgeslagen, fouten };
  },
});

// Haal odds op voor één fixture — Pinnacle (8) met Bet365 (1) als fallback.
// Geeft genormaliseerde kansen (som = 1.0) of null als er geen data is.
async function fetchOddsVoorFixture(fixtureId: number): Promise<{
  kans_thuis: number; kans_gelijk: number; kans_uit: number
} | null> {
  for (const bookmakerId of [8, 1]) {
    try {
      const data = await apiFetch(`/odds?fixture=${fixtureId}&bookmaker=${bookmakerId}`);
      const bets = data.response?.[0]?.bookmakers?.[0]?.bets ?? [];
      const matchWinner = bets.find((b: any) => b.name === "Match Winner");
      if (!matchWinner) continue;

      const home = matchWinner.values?.find((v: any) => v.value === "Home");
      const draw = matchWinner.values?.find((v: any) => v.value === "Draw");
      const away = matchWinner.values?.find((v: any) => v.value === "Away");
      if (!home || !draw || !away) continue;

      const oddH = parseFloat(home.odd);
      const oddD = parseFloat(draw.odd);
      const oddA = parseFloat(away.odd);
      if (!oddH || !oddD || !oddA) continue;

      // Normaliseer: verwijder bookmaker-marge (vig)
      const rawH = 1 / oddH, rawD = 1 / oddD, rawA = 1 / oddA;
      const tot = rawH + rawD + rawA;
      return {
        kans_thuis:  rawH / tot,
        kans_gelijk: rawD / tot,
        kans_uit:    rawA / tot,
      };
    } catch {
      continue;
    }
  }
  return null;
}

// ─── 4. RECONCILE: wk2026-reconcile ─────────────────────────────────
// Draait elk uur en verwerkt gespeelde matches van gisteren/vandaag die
// om welke reden dan ook nog op "gepland" staan (API-vertraging, mislukte
// retries, etc.). Vangnet bovenop de primaire fetch-tasks.

export const wk2026Reconcile = schedules.task({
  id: "wk2026-reconcile",
  cron: {
    pattern: "5 * * * *",          // elke dag elk uur op :05
    timezone: "Europe/Amsterdam",
  },
  maxDuration: 300,
  run: async () => {
    const now = new Date();
    if (now < MATCHES_WINDOW_START || now > MATCHES_WINDOW_END) {
      logger.info("reconcile: buiten WK-venster, skip");
      return { skipped: "outside-window" };
    }

    const supabase = getSupabase();
    // Alle echte gepland-matches (geen datum-filter — vangt ook vergeten nachtmatches op)
    const { data: kandidaten } = await supabase
      .from("wk2026_wedstrijden")
      .select("api_fixture_id, thuis, uit, datum")
      .eq("status", "gepland")
      .gte("api_fixture_id", 1_000_000)   // Sla handmatige placeholder-IDs (<200k) over; echte API-fixtures zitten in de miljoenen
      .lte("datum", now.toISOString().slice(0, 10));

    if (!kandidaten?.length) {
      logger.info("reconcile: geen open matches, klaar");
      return { kandidaten: 0, verwerkt: 0 };
    }

    logger.info(`reconcile: ${kandidaten.length} open match(es) controleren`);
    let verwerkt = 0;

    for (const w of kandidaten) {
      try {
        const fd = await apiFetch(`/fixtures?id=${w.api_fixture_id}`);
        const f = fd.response?.[0];
        if (!f) { await sleep(500); continue; }

        const apiStatus = f.fixture.status?.short;
        if (!["FT", "AET", "PEN"].includes(apiStatus)) {
          logger.info(`reconcile: ${w.thuis} vs ${w.uit} → ${apiStatus}, nog bezig`);
          await sleep(500);
          continue;
        }

        const result = await upsertFixture(supabase, f);
        logger.info(`reconcile: ${w.thuis} vs ${w.uit} verwerkt (${result.events} events)`);
        verwerkt++;

        // Reconcile draait vaak vlak na affluiten — discipline-data kan dan nog
        // onvolledig zijn. 60 min later nog één keer herbevestigen.
        await wk2026FinalCheck.trigger({ fixtureId: w.api_fixture_id }, { delay: `${FINAL_CHECK_DELAY_MIN}m` });
      } catch (err) {
        logger.error(`reconcile: fixture ${w.api_fixture_id} fout`, { err: String(err) });
      }
      await sleep(1_200);
    }

    logger.info(`reconcile klaar: ${verwerkt}/${kandidaten.length} verwerkt`);
    return { kandidaten: kandidaten.length, verwerkt };
  },
});

// ─── 5. REPAIR: wk2026-repair-missing-events ─────────────────────────
// Handmatig triggeren via Trigger.dev dashboard wanneer events ontbreken.
// Zonder payload: detecteert automatisch alle verwerkte matches zonder events.
// Met payload { fixtureIds: [123, 456] }: herhaalt alleen die fixtures.

type RepairPayload = { fixtureIds?: number[] };

export const wk2026RepairMissingEvents = task({
  id: "wk2026-repair-missing-events",
  maxDuration: 600,
  run: async (payload: RepairPayload = {}) => {
    const supabase = getSupabase();

    let fixtureIds = payload.fixtureIds;

    if (!fixtureIds) {
      // Drempel: 2 uur na verwachte aftrap (wedstrijden duren ~2 uur)
      const drempel = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
      const [{ data: verwerkt }, { data: gepland }, { data: events }] = await Promise.all([
        supabase.from("wk2026_wedstrijden").select("api_fixture_id").eq("status", "verwerkt"),
        // "gepland" matches waarvan de datum >2 uur geleden is → waarschijnlijk al gespeeld
        supabase.from("wk2026_wedstrijden").select("api_fixture_id").eq("status", "gepland").lt("datum", drempel),
        supabase.from("wk2026_events").select("api_fixture_id"),
      ]);
      const metEvents = new Set((events ?? []).map((e: any) => e.api_fixture_id));
      const kandidaten = [...(verwerkt ?? []), ...(gepland ?? [])];
      fixtureIds = kandidaten
        .map((w: any) => w.api_fixture_id)
        // Sla handmatig ingevoerde placeholders over (ID >= 200000 — geen echte API-fixtures)
        .filter((id: number) => id < 200000 && !metEvents.has(id));
    }

    logger.info(`repair: ${fixtureIds.length} fixtures zonder events`);

    const results: any[] = [];
    for (const fixtureId of fixtureIds) {
      try {
        const fixturesData = await apiFetch(`/fixtures?id=${fixtureId}`);
        const f = fixturesData.response?.[0];
        if (!f) {
          results.push({ fixtureId, status: "not-found" });
          logger.warn(`repair: fixture ${fixtureId} niet gevonden`);
          await sleep(1500);
          continue;
        }
        const result = await upsertFixture(supabase, f);
        results.push({ fixtureId, status: "done", events: result.events });
        logger.info(`repair: fixture ${fixtureId} → ${result.events} events`);
      } catch (err) {
        logger.error(`repair: fixture ${fixtureId} mislukt`, { err: String(err) });
        results.push({ fixtureId, status: "error", err: String(err) });
      }
      await sleep(1500); // 1.5s pauze om API-limiet te respecteren
    }

    const ok = results.filter(r => r.status === "done").length;
    const fail = results.filter(r => r.status !== "done").length;
    logger.info(`repair klaar: ${ok} ok, ${fail} mislukt`);
    return { results, ok, fail };
  },
});

// ─── 5. BACKFILL: wk2026-backfill ────────────────────────────────────
// Haalt ALLE WK 2026 fixtures op uit de API en verwerkt die welke
// al gespeeld zijn (status FT/AET/PEN) maar nog niet in Supabase staan.
// Gebruik dit om gemiste R32/R16/KO-wedstrijden in één keer bij te werken.
// Triggeren via Trigger.dev dashboard: geen payload nodig.
// Optioneel payload: { from: "2026-06-27", to: "2026-07-02" } om te filteren.

type BackfillPayload = { from?: string; to?: string };

export const wk2026Backfill = task({
  id: "wk2026-backfill",
  maxDuration: 600,
  run: async (payload: BackfillPayload = {}) => {
    const supabase = getSupabase();

    const from = payload.from ?? "2026-06-27";
    const to   = payload.to   ?? new Date().toISOString().slice(0, 10);

    logger.info(`backfill: fixtures ophalen van ${from} t/m ${to}`);

    const { response: fixtures } = await apiFetch(
      `/fixtures?league=${LEAGUE_ID}&season=${SEASON}&from=${from}&to=${to}`
    );
    if (!fixtures?.length) {
      logger.info("backfill: geen fixtures gevonden");
      return { verwerkt: 0, overgeslagen: 0 };
    }

    logger.info(`backfill: ${fixtures.length} fixtures gevonden`);

    // Welke zijn al verwerkt?
    const { data: bestaand } = await supabase
      .from("wk2026_wedstrijden")
      .select("api_fixture_id, status");
    const verwerktIds = new Set(
      (bestaand ?? []).filter((r: any) => r.status === "verwerkt").map((r: any) => r.api_fixture_id)
    );

    let verwerkt = 0, overgeslagen = 0, fouten = 0;

    for (const f of fixtures) {
      const id: number = f.fixture.id;
      const apiStatus = f.fixture.status?.short;
      const isFinished = ["FT", "AET", "PEN"].includes(apiStatus);

      if (verwerktIds.has(id)) { overgeslagen++; continue; }
      if (!isFinished) {
        logger.info(`backfill: fixture ${id} nog niet gespeeld (${apiStatus}), sla over`);
        overgeslagen++;
        continue;
      }

      try {
        const result = await upsertFixture(supabase, f);
        logger.info(`backfill: fixture ${id} (${toNL(f.teams.home.name)} vs ${toNL(f.teams.away.name)}) → ${result.events} events`);
        verwerkt++;
      } catch (err) {
        logger.error(`backfill: fixture ${id} mislukt`, { err: String(err) });
        fouten++;
      }
      await sleep(1200); // API-limiet respecteren
    }

    logger.info(`backfill klaar: ${verwerkt} verwerkt, ${overgeslagen} overgeslagen, ${fouten} fouten`);
    return { verwerkt, overgeslagen, fouten };
  },
});

// ─── 6. SQUADS-SYNC: wk2026-squads-sync ──────────────────────────────

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
