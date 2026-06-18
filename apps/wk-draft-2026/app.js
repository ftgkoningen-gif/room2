/* ═══════════════════════════════════════════════════════════════════
   WK draft 2026 — app.js
   ═══════════════════════════════════════════════════════════════════ */

// ──────────────────────────────────────────────────────────────────
// Constanten (puntenmodel)
// ──────────────────────────────────────────────────────────────────
const POINTS = {
  geleKaart:     { K: -2, V: -2, M: -2, A: -2 },
  directeRood:   { K: -5, V: -5, M: -5, A: -5 },
  eigenGoal:     { K: -2, V: -2, M: -2, A: -2 },
  gespeeld45:    { K:  2, V:  2, M:  2, A:  1 },
  poulewinst:    { K:  3, V:  3, M:  3, A:  3 },
  gelijkspel:    { K:  1, V:  1, M:  1, A:  1 },
  velddoelpunt:  { K:  6, V:  5, M:  4, A:  4 },
  assist:        { K:  4, V:  3, M:  2, A:  2 },
  strafschop:    { K:  1, V:  1, M:  1, A:  1 },
  cleanSheet45:  { K:  3, V:  2, M:  2, A:  0 },
  tegendoelpunt: { K: -1, V: -1, M:  0, A:  0 }
};

const FASEBONUS = {
  "1/16": 0,   // voorronde 48-team format, telt niet
  "1/8":  3,   // achtste finale
  "1/4":  3,   // kwartfinale
  "1/2":  5,   // halve finale
  "F":    5,   // finale
  "Winnaar": 5
};

const AWARD_BONUS = 10;
const INLEG_PER_DEELNEMER = 20;
const GB_CACHE_KEY = 'wk26.glazenbol';
// KO-wedstrijden per ronde: als een team de halve finale haalt, heeft het 4 KO-matches gespeeld
const GB_KO_MATCHES = { '1/16': 1, '1/8': 2, '1/4': 3, '1/2': 4, 'F': 5, 'Winnaar': 5 };

// ──────────────────────────────────────────────────────────────────
// De Glazen Bol — teamsterkte op basis van pre-toernooi bettingmarkt
// ──────────────────────────────────────────────────────────────────
const TEAM_KRACHT = {
  "Argentinië": 92, "Brazilië": 88, "Frankrijk": 87, "Engeland": 84,
  "Spanje": 83, "Portugal": 79, "Duitsland": 77, "Nederland": 73,
  "België": 70, "Uruguay": 70, "Colombia": 67, "Kroatië": 65,
  "Marokko": 63, "Senegal": 62, "Japan": 60, "Zweden": 59,
  "Noorwegen": 58, "Zwitserland": 56, "Turkije": 55, "Mexico": 54,
  "Australië": 53, "Ivoorkust": 53, "Ecuador": 52, "Verenigde Staten": 52,
  "Schotland": 51, "Zuid-Korea": 51, "Tsjechië": 50, "Oostenrijk": 51,
  "Canada": 49, "Paraguay": 46, "Egypte": 47, "Tunesië": 45,
  "Ghana": 44, "Algerije": 45, "Saudi-Arabië": 43, "Iran": 42,
  "Bosnië en Herzegovina": 41, "Irak": 38, "Congo-Kinshasa": 38,
  "Zuid-Afrika": 38, "Panama": 34, "Qatar": 35, "Haïti": 29,
  "Curaçao": 29, "Oezbekistan": 32, "Nieuw-Zeeland": 29,
  "Kaapverdië": 36, "Jordanië": 33
};

// Bracket definitie (WK 2026, officieel FIFA-schema)
const GLAZENBOL_BRACKET = [
  { id: 'm74',  round: '1/16', s1: 'E1',     s2: '3rd:0'  },
  { id: 'm77',  round: '1/16', s1: 'I1',     s2: '3rd:1'  },
  { id: 'm73',  round: '1/16', s1: 'A2',     s2: 'B2'     },
  { id: 'm75',  round: '1/16', s1: 'F1',     s2: 'C2'     },
  { id: 'm83',  round: '1/16', s1: 'K2',     s2: 'L2'     },
  { id: 'm84',  round: '1/16', s1: 'H1',     s2: 'J2'     },
  { id: 'm81',  round: '1/16', s1: 'D1',     s2: '3rd:2'  },
  { id: 'm82',  round: '1/16', s1: 'G1',     s2: '3rd:3'  },
  { id: 'm76',  round: '1/16', s1: 'C1',     s2: 'F2'     },
  { id: 'm78',  round: '1/16', s1: 'E2',     s2: 'I2'     },
  { id: 'm79',  round: '1/16', s1: 'A1',     s2: '3rd:4'  },
  { id: 'm80',  round: '1/16', s1: 'L1',     s2: '3rd:5'  },
  { id: 'm86',  round: '1/16', s1: 'J1',     s2: 'H2'     },
  { id: 'm88',  round: '1/16', s1: 'D2',     s2: 'G2'     },
  { id: 'm85',  round: '1/16', s1: 'B1',     s2: '3rd:6'  },
  { id: 'm87',  round: '1/16', s1: 'K1',     s2: '3rd:7'  },
  { id: 'm89',  round: '1/8',  s1: 'w:m74',  s2: 'w:m77'  },
  { id: 'm90',  round: '1/8',  s1: 'w:m73',  s2: 'w:m75'  },
  { id: 'm93',  round: '1/8',  s1: 'w:m83',  s2: 'w:m84'  },
  { id: 'm94',  round: '1/8',  s1: 'w:m81',  s2: 'w:m82'  },
  { id: 'm91',  round: '1/8',  s1: 'w:m76',  s2: 'w:m78'  },
  { id: 'm92',  round: '1/8',  s1: 'w:m79',  s2: 'w:m80'  },
  { id: 'm95',  round: '1/8',  s1: 'w:m86',  s2: 'w:m88'  },
  { id: 'm96',  round: '1/8',  s1: 'w:m85',  s2: 'w:m87'  },
  { id: 'm97',  round: '1/4',  s1: 'w:m89',  s2: 'w:m90'  },
  { id: 'm98',  round: '1/4',  s1: 'w:m93',  s2: 'w:m94'  },
  { id: 'm99',  round: '1/4',  s1: 'w:m91',  s2: 'w:m92'  },
  { id: 'm100', round: '1/4',  s1: 'w:m95',  s2: 'w:m96'  },
  { id: 'm101', round: '1/2',  s1: 'w:m97',  s2: 'w:m98'  },
  { id: 'm102', round: '1/2',  s1: 'w:m99',  s2: 'w:m100' },
  { id: 'm104', round: 'F',    s1: 'w:m101', s2: 'w:m102' },
];

const POS_LABEL = { K: "Keeper", V: "Verdediger", M: "Middenvelder", A: "Aanvaller" };

const VENUE = {
  1489369: { stadion: "Estadio Azteca", stad: "Mexico City" },
  1538999: { stadion: "Estadio Akron", stad: "Guadalajara" },
  1539000: { stadion: "BMO Field", stad: "Toronto" },
  1489370: { stadion: "SoFi Stadium", stad: "Los Angeles" },
  1489373: { stadion: "Levi's Stadium", stad: "San Francisco Bay Area" },
  1489371: { stadion: "MetLife Stadium", stad: "New York New Jersey" },
  1489372: { stadion: "Gillette Stadium", stad: "Boston" },
  1539001: { stadion: "BC Place", stad: "Vancouver" },
  1489374: { stadion: "NRG Stadium", stad: "Houston" },
  1489376: { stadion: "AT&T Stadium", stad: "Dallas" },
  1489375: { stadion: "Lincoln Financial Field", stad: "Philadelphia" },
  1539002: { stadion: "Estadio BBVA", stad: "Monterrey" },
  1489380: { stadion: "Mercedes-Benz Stadium", stad: "Atlanta" },
  1489377: { stadion: "Lumen Field", stad: "Seattle" },
  1489379: { stadion: "Hard Rock Stadium", stad: "Miami" },
  1489378: { stadion: "SoFi Stadium", stad: "Los Angeles" },
  1489383: { stadion: "MetLife Stadium", stad: "New York New Jersey" },
  1539016: { stadion: "Gillette Stadium", stad: "Boston" },
  1489381: { stadion: "Arrowhead Stadium", stad: "Kansas City" },
  1489382: { stadion: "Levi's Stadium", stad: "San Francisco Bay Area" },
  1539003: { stadion: "NRG Stadium", stad: "Houston" },
  1489384: { stadion: "AT&T Stadium", stad: "Dallas" },
  1489385: { stadion: "BMO Field", stad: "Toronto" },
  1489386: { stadion: "Estadio Azteca", stad: "Mexico City" },
  1539004: { stadion: "Mercedes-Benz Stadium", stad: "Atlanta" },
  1539005: { stadion: "SoFi Stadium", stad: "Los Angeles" },
  1489387: { stadion: "BC Place", stad: "Vancouver" },
  1489388: { stadion: "Estadio Akron", stad: "Guadalajara" },
  1489391: { stadion: "Lumen Field", stad: "Seattle" },
  1489390: { stadion: "Gillette Stadium", stad: "Boston" },
  1489389: { stadion: "Lincoln Financial Field", stad: "Philadelphia" },
  1539006: { stadion: "Levi's Stadium", stad: "San Francisco Bay Area" },
  1539007: { stadion: "NRG Stadium", stad: "Houston" },
  1489393: { stadion: "BMO Field", stad: "Toronto" },
  1489392: { stadion: "Arrowhead Stadium", stad: "Kansas City" },
  1489394: { stadion: "Estadio BBVA", stad: "Monterrey" },
  1489397: { stadion: "Mercedes-Benz Stadium", stad: "Atlanta" },
  1489395: { stadion: "SoFi Stadium", stad: "Los Angeles" },
  1489398: { stadion: "Hard Rock Stadium", stad: "Miami" },
  1489396: { stadion: "BC Place", stad: "Vancouver" },
  1489399: { stadion: "AT&T Stadium", stad: "Dallas" },
  1539017: { stadion: "Lincoln Financial Field", stad: "Philadelphia" },
  1489401: { stadion: "MetLife Stadium", stad: "New York New Jersey" },
  1489400: { stadion: "Levi's Stadium", stad: "San Francisco Bay Area" },
  1489404: { stadion: "NRG Stadium", stad: "Houston" },
  1489402: { stadion: "Gillette Stadium", stad: "Boston" },
  1489403: { stadion: "BMO Field", stad: "Toronto" },
  1539008: { stadion: "Estadio Akron", stad: "Guadalajara" },
  1489408: { stadion: "BC Place", stad: "Vancouver" },
  1539009: { stadion: "Lumen Field", stad: "Seattle" },
  1489405: { stadion: "Mercedes-Benz Stadium", stad: "Atlanta" },
  1489406: { stadion: "Hard Rock Stadium", stad: "Miami" },
  1539010: { stadion: "Estadio Azteca", stad: "Mexico City" },
  1489407: { stadion: "Estadio BBVA", stad: "Monterrey" },
  1489410: { stadion: "MetLife Stadium", stad: "New York New Jersey" },
  1489409: { stadion: "Lincoln Financial Field", stad: "Philadelphia" },
  1539011: { stadion: "AT&T Stadium", stad: "Dallas" },
  1489412: { stadion: "Arrowhead Stadium", stad: "Kansas City" },
  1539012: { stadion: "SoFi Stadium", stad: "Los Angeles" },
  1489411: { stadion: "Levi's Stadium", stad: "San Francisco Bay Area" },
  1539074: { stadion: "BMO Field", stad: "Toronto" },
  1489416: { stadion: "Gillette Stadium", stad: "Boston" },
  1489417: { stadion: "Estadio Akron", stad: "Guadalajara" },
  1489413: { stadion: "NRG Stadium", stad: "Houston" },
  1489414: { stadion: "Lumen Field", stad: "Seattle" },
  1489415: { stadion: "BC Place", stad: "Vancouver" },
  1489420: { stadion: "Lincoln Financial Field", stad: "Philadelphia" },
  1489422: { stadion: "MetLife Stadium", stad: "New York New Jersey" },
  1489419: { stadion: "Hard Rock Stadium", stad: "Miami" },
  1539013: { stadion: "Mercedes-Benz Stadium", stad: "Atlanta" },
  1489418: { stadion: "Arrowhead Stadium", stad: "Kansas City" },
  1489421: { stadion: "AT&T Stadium", stad: "Dallas" }
};

// Nederlandse aanvangstijden (CEST = UTC+2) — statisch uit API cache
const KICKOFF = {
  1489369: "21:00", 1538999: "04:00", 1539000: "21:00", 1489370: "03:00",
  1489373: "21:00", 1489371: "00:00", 1489372: "03:00", 1539001: "06:00",
  1489374: "19:00", 1489376: "22:00", 1489375: "01:00", 1539002: "04:00",
  1489380: "18:00", 1489377: "21:00", 1489379: "00:00", 1489378: "03:00",
  1489383: "21:00", 1539016: "00:00", 1489381: "03:00", 1489382: "06:00",
  1539003: "19:00", 1489384: "22:00", 1489385: "01:00", 1489386: "04:00",
  1539004: "18:00", 1539005: "21:00", 1489387: "00:00", 1489388: "03:00",
  1489391: "21:00", 1489390: "00:00", 1489389: "02:30", 1539006: "05:00",
  1539007: "19:00", 1489393: "22:00", 1489392: "02:00", 1489394: "06:00",
  1489397: "18:00", 1489395: "21:00", 1489398: "00:00", 1489396: "03:00",
  1489399: "19:00", 1539017: "23:00", 1489401: "02:00", 1489400: "05:00",
  1489404: "19:00", 1489402: "22:00", 1489403: "01:00", 1539008: "04:00",
  1489408: "21:00", 1539009: "21:00", 1489405: "00:00", 1489406: "00:00",
  1539010: "03:00", 1489407: "03:00", 1489410: "22:00", 1489409: "22:00",
  1539011: "01:00", 1489412: "01:00", 1539012: "04:00", 1489411: "04:00",
  1539074: "21:00", 1489416: "21:00", 1489417: "02:00", 1489413: "02:00",
  1489414: "05:00", 1489415: "05:00", 1489420: "23:00", 1489422: "23:00",
  1489419: "01:30", 1539013: "01:30", 1489418: "04:00", 1489421: "04:00"
};

// ──────────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────────
const state = {
  landen: [],
  deelnemers: [],
  wedstrijden: [],
  fases: { landenPerFase: { "1/16": [], "1/8": [], "1/4": [], "1/2": [], "F": [], "Winnaar": [] } },
  awards: { topscorer: null, besteSpeler: null },
  kansen: {}   // { [apiFixtureId]: { kans_thuis, kans_gelijk, kans_uit } }
};

// Stack voor modal-terug-navigatie: elk item = { type: "team"|"speler", ... }
let _modalStack = [];

const LS_KEYS = {
  deelnemers: "wk26.deelnemers",
  wedstrijden: "wk26.wedstrijden",
  fases: "wk26.fases",
  awards: "wk26.awards"
};

// Bump bij elke data-migratie om oude localStorage te wissen
const DATA_VERSION = "wk2026.1";

const WK_START = new Date("2026-06-11T18:00:00Z");

// Wisselwindows (zie reglement):
// Window 1: vrij te gebruiken tot vlak vóór de knockoutfase — iedereen 1×
// Window 2: alleen de onderste helft van het klassement ná de groepsfase — 1×
const KNOCKOUT_START = "2026-06-27"; // exclusief — groepsfase eindigt ~26 juni

// ──────────────────────────────────────────────────────────────────
// Init
// ──────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);

async function init() {
  await loadAllData();
  renderAll();
  valideerWissels();
  wireNav();
  wireEvents();

  // Countdown ververst zichzelf elk uur zodat een tab die de hele dag
  // open staat ook de juiste dag toont.
  setInterval(renderCountdown, 60 * 60 * 1000);
}

async function loadAllData() {
  // Cache-invalidatie: wis oude localStorage wanneer data-versie bumpt
  if (localStorage.getItem("vd.version") !== DATA_VERSION) {
    for (const k of Object.values(LS_KEYS)) localStorage.removeItem(k);
    localStorage.setItem("vd.version", DATA_VERSION);
  }

  const [landen, deelnemers, wedstrijden, fases, awards] = await Promise.all([
    fetchJSON("data/landen.json"),
    fetchJSON("data/deelnemers.json"),
    fetchJSON("data/wedstrijden.json"),
    fetchJSON("data/fases.json"),
    fetchJSON("data/awards.json")
  ]);
  state.landen = landen.landen || [];
  state.deelnemers = deelnemers.deelnemers || [];
  state.wedstrijden = wedstrijden.wedstrijden || [];
  state.fases = fases || state.fases;
  state.awards = awards || state.awards;

  // Supabase-overlay (primaire bron voor wedstrijden + selecties)
  await loadFromSupabase();

  // LocalStorage overlays (alleen lokale mutaties zoals fase-toggle of award-save)
  try {
    const lsFases = JSON.parse(localStorage.getItem(LS_KEYS.fases) || "null");
    if (lsFases) state.fases = lsFases;
    const lsAwards = JSON.parse(localStorage.getItem(LS_KEYS.awards) || "null");
    if (lsAwards) state.awards = lsAwards;
  } catch (e) { /* ignore */ }
}

// ──────────────────────────────────────────────────────────────────
// Supabase read (wedstrijden + events + selecties per land)
// ──────────────────────────────────────────────────────────────────
async function loadFromSupabase() {
  const cfg = window.WK_CONFIG;
  if (!cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase) {
    console.info("Supabase niet geconfigureerd — vallen terug op statische JSON.");
    return;
  }
  try {
    const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);

    const [wRes, eRes, sRes, kRes] = await Promise.all([
      client.from("wk2026_wedstrijden").select("*"),
      (async () => {
        const [e1, e2, e3, e4, e5] = await Promise.all([
          client.from("wk2026_events").select("*").range(0, 999),
          client.from("wk2026_events").select("*").range(1000, 1999),
          client.from("wk2026_events").select("*").range(2000, 2999),
          client.from("wk2026_events").select("*").range(3000, 3999),
          client.from("wk2026_events").select("*").range(4000, 4999),
        ]);
        return { data: [...(e1.data||[]), ...(e2.data||[]), ...(e3.data||[]), ...(e4.data||[]), ...(e5.data||[])], error: e1.error || e2.error || e3.error || e4.error || e5.error };
      })(),
      (async () => {
        const [p1, p2] = await Promise.all([
          client.from("wk2026_selecties").select("*").range(0, 999),
          client.from("wk2026_selecties").select("*").range(1000, 1999),
        ]);
        return { data: [...(p1.data||[]), ...(p2.data||[])], error: p1.error || p2.error };
      })(),
      client.from("wk2026_kansen").select("*"),
    ]);

    if (!wRes.error && Array.isArray(wRes.data) && wRes.data.length) {
      const eventsByFix = {};
      for (const ev of (eRes.data || [])) {
        (eventsByFix[ev.api_fixture_id] = eventsByFix[ev.api_fixture_id] || []).push({
          speler: ev.speler, type: ev.type, detail: ev.detail
        });
      }
      // Dedupliceer events per fixture: als de sync meerdere keren liep of de API
      // meerdere teamblokken teruggeeft, zitten events er 2x/3x/Nx in.
      // Multiplier wordt afgeleid uit gespeeld45 (per speler altijd 1 per wedstrijd).
      for (const fixId of Object.keys(eventsByFix)) {
        const evs = eventsByFix[fixId];
        const groups = {};
        for (const ev of evs) {
          const k = ev.speler + '|' + ev.type;
          (groups[k] = groups[k] || []).push(ev);
        }
        const g45counts = Object.entries(groups)
          .filter(([k]) => k.endsWith('|gespeeld45'))
          .map(([, g]) => g.length);
        if (!g45counts.length) continue;
        const freq = {};
        g45counts.forEach(n => freq[n] = (freq[n] || 0) + 1);
        const multiplier = parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
        if (multiplier <= 1) continue;
        const deduped = [];
        for (const [, g] of Object.entries(groups)) {
          const keep = Math.max(1, Math.round(g.length / multiplier));
          deduped.push(...g.slice(0, keep));
        }
        eventsByFix[fixId] = deduped;
      }
      state.wedstrijden = wRes.data.map(w => ({
        id: `wk26-${w.api_fixture_id}`,
        apiFixtureId: w.api_fixture_id,
        datum: w.datum,
        fase: w.fase,
        poule: w.poule,
        thuis: w.thuis,
        uit: w.uit,
        uitslag: (w.uitslag_thuis != null && w.uitslag_uit != null)
          ? { thuis: w.uitslag_thuis, uit: w.uitslag_uit } : null,
        pens: (w.pens_thuis != null && w.pens_uit != null)
          ? { thuis: w.pens_thuis, uit: w.pens_uit } : null,
        status: w.status,
        events: eventsByFix[w.api_fixture_id] || []
      }));
    }

    if (!kRes.error && Array.isArray(kRes.data)) {
      state.kansen = {};
      kRes.data.forEach(k => {
        state.kansen[k.api_fixture_id] = {
          kans_thuis:  k.kans_thuis,
          kans_gelijk: k.kans_gelijk,
          kans_uit:    k.kans_uit
        };
      });
    }

    if (!sRes.error && Array.isArray(sRes.data)) {
      const byLand = {};
      for (const sp of sRes.data) {
        (byLand[sp.land] = byLand[sp.land] || []).push({
          naam: sp.speler, positie: sp.positie, nummer: sp.nummer, foto: sp.foto_url
        });
      }
      state.landen = state.landen.map(l => ({
        ...l,
        selectie: byLand[l.naam] || l.selectie || []
      }));
      state.selectiesUpdated = sRes.data.length
        ? new Date(Math.max(...sRes.data.map(r => +new Date(r.updated_at || 0))))
        : null;
    }
  } catch (e) {
    console.warn("Supabase-fetch mislukt:", e);
  }
}

async function fetchJSON(path) {
  try {
    const r = await fetch(path, { cache: "no-cache" });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    console.warn(`Kon ${path} niet laden`, e);
    return {};
  }
}

function saveLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ──────────────────────────────────────────────────────────────────
// Navigatie
// ──────────────────────────────────────────────────────────────────
function wireNav() {
  document.querySelectorAll(".nav__tab").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function switchTab(name) {
  document.querySelectorAll(".nav__tab").forEach(t => t.classList.toggle("is-active", t.dataset.tab === name));
  document.querySelectorAll("[data-tab-panel]").forEach(p => {
    p.classList.toggle("hidden", p.dataset.tabPanel !== name);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (name === 'glazenbol') {
    const r = document.getElementById("glazenbolResult");
    if (r && !r.querySelector('.glazenbol__list')) runGlazenBol(false);
  }
}

// ──────────────────────────────────────────────────────────────────
// Naam-normalisatie: matcht API-namen ("Tomáš Souček") met draft-namen
// ("T. Soucek") en varianten in hoofdlettergebruik ("Son Heung-min").
// ──────────────────────────────────────────────────────────────────
function normNaam(s) {
  return String(s ?? '').normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[.''`\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function naammatch(eventNaam, spelerNaam) {
  if (!eventNaam || !spelerNaam) return false;
  if (eventNaam === spelerNaam) return true;
  const ne = normNaam(eventNaam);
  const ns = normNaam(spelerNaam);
  if (ne === ns) return true;
  // "Edson Álvarez" → "E. Álvarez"; "Jan Paul van Hecke" → "J. van Hecke" etc.
  // Probeer initiaal + elk mogelijk suffix (slaat tussenvoegsel/middelste namen over)
  const parts = eventNaam.trim().split(/\s+/);
  if (parts.length >= 2) {
    for (let i = 1; i < parts.length; i++) {
      const abbreviated = parts[0][0] + '. ' + parts.slice(i).join(' ');
      if (normNaam(abbreviated) === ns) return true;
    }
  }
  return false;
}

// ──────────────────────────────────────────────────────────────────
// Puntenberekening (de scheidsrechter in code)
// ──────────────────────────────────────────────────────────────────
function berekenSpelerPunten(spelerNaam, deelnemerSpelers) {
  const speler = deelnemerSpelers.find(s => s.naam === spelerNaam);
  if (!speler) return 0;
  return spelerPunten(speler);
}

function spelerPunten(speler, opts = {}) {
  const pos = speler.positie;
  let pts = 0;

  // Events per wedstrijd
  for (const w of state.wedstrijden) {
    if (w.status !== "verwerkt" || !Array.isArray(w.events)) continue;
    if (opts.voor && w.datum >= opts.voor) continue;
    if (opts.vanaf && w.datum < opts.vanaf) continue;
    const evs = w.events.filter(e => naammatch(e.speler, speler.naam));
    if (evs.length === 0) continue;

    const gespeeld45  = evs.some(e => e.type === "gespeeld45");
    const ingevallen  = evs.some(e => e.type === "ingevallen");  // invaller <45 min
    const cleanSheet  = evs.some(e => e.type === "cleanSheet45");
    const tegendoelpunten = evs.filter(e => e.type === "tegendoelpunt").length;

    // Gespeeld ≥45 min bonus (+2 K/V/M, +1 A)
    if (gespeeld45 && w.uitslag) pts += POINTS.gespeeld45[pos] ?? 0;

    // Poulewinst/gelijkspel: geldt voor iedereen die deelnam (ook invaller <45 min)
    if ((gespeeld45 || ingevallen) && w.uitslag) {
      const isGroep = w.poule || w.fase === "groep";
      const isThuis = w.thuis === speler.land;
      const isUit = w.uit === speler.land;
      if (isGroep && (isThuis || isUit)) {
        const eigen = isThuis ? w.uitslag.thuis : w.uitslag.uit;
        const tegen = isThuis ? w.uitslag.uit : w.uitslag.thuis;
        if (eigen > tegen) pts += POINTS.poulewinst[pos] ?? 0;
        else if (eigen === tegen) pts += POINTS.gelijkspel[pos] ?? 0;
      }
    }

    if (cleanSheet) pts += POINTS.cleanSheet45[pos] ?? 0;
    pts += tegendoelpunten * (POINTS.tegendoelpunt[pos] ?? 0);

    // Per-event punten
    for (const ev of evs) {
      switch (ev.type) {
        case "velddoelpunt": pts += POINTS.velddoelpunt[pos]; break;
        case "assist":       pts += POINTS.assist[pos];       break;
        case "strafschop":   pts += POINTS.strafschop[pos];   break;
        case "geleKaart":    pts += POINTS.geleKaart[pos];    break;
        case "directeRood":  pts += POINTS.directeRood[pos];  break;
        case "eigenGoal":    pts += POINTS.eigenGoal[pos];    break;
        // gespeeld45, cleanSheet45, tegendoelpunt al afgehandeld boven
      }
    }
  }

  // Fase-bonussen: speler's land bereikt fase X
  const land = speler.land;
  for (const [fase, landen] of Object.entries(state.fases.landenPerFase || {})) {
    if (landen.includes(land)) pts += FASEBONUS[fase] ?? 0;
  }

  // Award-bonussen
  if (state.awards.topscorer &&
      state.awards.topscorer.naam === speler.naam &&
      state.awards.topscorer.land === speler.land) pts += AWARD_BONUS;
  if (state.awards.besteSpeler &&
      state.awards.besteSpeler.naam === speler.naam &&
      state.awards.besteSpeler.land === speler.land) pts += AWARD_BONUS;

  return pts;
}

function deelnemerPunten(deelnemer) {
  if (!deelnemer.spelers) return 0;
  let total = deelnemer.spelers.reduce((sum, sp) => {
    const wissel = (deelnemer.wissels || []).find(w => w.uit === sp.naam);
    return sum + spelerPunten(sp, wissel ? { voor: wissel.vanaf } : {});
  }, 0);
  for (const wissel of (deelnemer.wissels || [])) {
    const sp = { naam: wissel.in, land: wissel.land_in, positie: wissel.positie_in };
    total += spelerPunten(sp, { vanaf: wissel.vanaf });
  }
  return total;
}

// Detailed breakdown: per-match contributions + fase + awards
// opts.voor / opts.vanaf: zelfde datumfilter als spelerPunten — matches buiten het
// venster krijgen teltMee:false en worden doorstreept in de modal.
function spelerBreakdown(speler, opts = {}) {
  const pos = speler.positie;
  const perMatch = [];

  for (const w of state.wedstrijden) {
    if (w.status !== "verwerkt" || !Array.isArray(w.events)) continue;
    const evs = w.events.filter(e => naammatch(e.speler, speler.naam));
    if (evs.length === 0) continue;
    const teltMee = !(opts.voor && w.datum >= opts.voor) && !(opts.vanaf && w.datum < opts.vanaf);

    const lines = [];
    let subtotal = 0;
    const gespeeld45 = evs.some(e => e.type === "gespeeld45");
    const ingevallen  = evs.some(e => e.type === "ingevallen");
    const cleanSheet = evs.some(e => e.type === "cleanSheet45");
    const tegenCount = evs.filter(e => e.type === "tegendoelpunt").length;

    if (gespeeld45 && w.uitslag) {
      const p = POINTS.gespeeld45[pos] ?? 0;
      lines.push({ label: `Gespeeld ≥45 min`, pts: p });
      subtotal += p;
    }
    if ((gespeeld45 || ingevallen) && w.uitslag && (w.poule || w.fase === "groep")) {
      const isThuis = w.thuis === speler.land;
      const isUit = w.uit === speler.land;
      if (isThuis || isUit) {
        const eigen = isThuis ? w.uitslag.thuis : w.uitslag.uit;
        const tegen = isThuis ? w.uitslag.uit : w.uitslag.thuis;
        if (eigen > tegen) {
          const p = POINTS.poulewinst[pos] ?? 0;
          lines.push({ label: ingevallen && !gespeeld45 ? `Gewonnen poule (invaller)` : `Gewonnen poule`, pts: p });
          subtotal += p;
        } else if (eigen === tegen) {
          const p = POINTS.gelijkspel[pos] ?? 0;
          lines.push({ label: ingevallen && !gespeeld45 ? `Gelijkspel (invaller)` : `Gelijkspel`, pts: p });
          subtotal += p;
        }
      }
    }
    if (cleanSheet) {
      const p = POINTS.cleanSheet45[pos] ?? 0;
      lines.push({ label: `Clean sheet`, pts: p });
      subtotal += p;
    }
    if (tegenCount > 0) {
      const p = tegenCount * (POINTS.tegendoelpunt[pos] ?? 0);
      if (p !== 0) {
        lines.push({ label: `Tegendoelpunten (${tegenCount})`, pts: p });
        subtotal += p;
      }
    }

    const counts = {};
    for (const ev of evs) counts[ev.type] = (counts[ev.type] || 0) + 1;
    const eventLabels = {
      velddoelpunt: "Velddoelpunt",
      assist: "Assist",
      strafschop: "Strafschop",
      geleKaart: "Gele kaart",
      directeRood: "Rode kaart",
      eigenGoal: "Eigen goal"
    };
    for (const [type, count] of Object.entries(counts)) {
      if (!eventLabels[type]) continue;
      const p = (POINTS[type]?.[pos] ?? 0) * count;
      if (p === 0 && count === 0) continue;
      lines.push({
        label: count > 1 ? `${eventLabels[type]} ×${count}` : eventLabels[type],
        pts: p
      });
      subtotal += p;
    }

    if (lines.length > 0) {
      perMatch.push({ wedstrijd: w, lines, subtotal, teltMee });
    }
  }

  // Fase bonussen
  const fase = [];
  for (const [f, landen] of Object.entries(state.fases.landenPerFase || {})) {
    if (landen.includes(speler.land) && (FASEBONUS[f] ?? 0) !== 0) {
      fase.push({ label: `${faseLabel(f)}`, pts: FASEBONUS[f] });
    }
  }

  // Awards
  const awardLines = [];
  if (state.awards.topscorer &&
      state.awards.topscorer.naam === speler.naam &&
      state.awards.topscorer.land === speler.land) {
    awardLines.push({ label: `Topscorer WK`, pts: AWARD_BONUS });
  }
  if (state.awards.besteSpeler &&
      state.awards.besteSpeler.naam === speler.naam &&
      state.awards.besteSpeler.land === speler.land) {
    awardLines.push({ label: `Beste speler WK`, pts: AWARD_BONUS });
  }

  const total =
    perMatch.filter(m => m.teltMee).reduce((s, m) => s + m.subtotal, 0) +
    fase.reduce((s, f) => s + f.pts, 0) +
    awardLines.reduce((s, a) => s + a.pts, 0);

  return { perMatch, fase, awards: awardLines, total };
}

function faseLabel(f) {
  return ({
    "1/16": "Voorronde (1/16)",
    "1/8":  "Achtste finale",
    "1/4":  "Kwartfinale",
    "1/2":  "Halve finale",
    "F":    "Finale",
    "Winnaar": "Winnaar WK"
  })[f] || f;
}

function deelnemerStats(deelnemer) {
  let goals = 0, assists = 0, kaarten = 0, actief = 0;
  if (!deelnemer.spelers) return { goals, assists, kaarten, actief };

  for (const sp of deelnemer.spelers) {
    const wissel = (deelnemer.wissels || []).find(w => w.uit === sp.naam);
    let spelerActief = false;
    for (const w of state.wedstrijden) {
      if (w.status !== "verwerkt" || !Array.isArray(w.events)) continue;
      if (wissel && w.datum >= wissel.vanaf) continue;
      const evs = w.events.filter(e => naammatch(e.speler, sp.naam));
      if (evs.length > 0) spelerActief = true;
      goals   += evs.filter(e => e.type === "velddoelpunt" || e.type === "strafschop").length;
      assists += evs.filter(e => e.type === "assist").length;
      kaarten += evs.filter(e => e.type === "geleKaart" || e.type === "directeRood").length;
    }
    if (spelerActief) actief += 1;
  }
  for (const wissel of (deelnemer.wissels || [])) {
    const sp = { naam: wissel.in, land: wissel.land_in, positie: wissel.positie_in };
    let spelerActief = false;
    for (const w of state.wedstrijden) {
      if (w.status !== "verwerkt" || !Array.isArray(w.events)) continue;
      if (w.datum < wissel.vanaf) continue;
      const evs = w.events.filter(e => naammatch(e.speler, sp.naam));
      if (evs.length > 0) spelerActief = true;
      goals   += evs.filter(e => e.type === "velddoelpunt" || e.type === "strafschop").length;
      assists += evs.filter(e => e.type === "assist").length;
      kaarten += evs.filter(e => e.type === "geleKaart" || e.type === "directeRood").length;
    }
    if (spelerActief) actief += 1;
  }
  return { goals, assists, kaarten, actief };
}

// ──────────────────────────────────────────────────────────────────
// Render: main orchestrator
// ──────────────────────────────────────────────────────────────────
function renderAll() {
  renderOverzicht();
  renderTeams();
  renderWedstrijden();
  renderGlazenBol();
  renderFooter();
  if (typeof twemoji !== "undefined") twemoji.parse(document.body, { folder: "svg", ext: ".svg" });
}

// ──────────────────────────────────────────────────────────────────
// De Glazen Bol — UI
// ──────────────────────────────────────────────────────────────────
function renderGlazenBol() {
  const container = document.getElementById("glazenbolBlock");
  if (!container) return;

  if (!state.deelnemers.length) {
    container.innerHTML = '<p class="overzicht__sub italic">Geen deelnemers gevonden.</p>';
    return;
  }

  container.innerHTML = `
    <div class="glazenbol__intro">
      <p class="glazenbol__tekst">Simuleert het resterende toernooi 1.000× met actuele marktodds (Pinnacle/Bet365, dagelijks 05:30). Houdt rekening met het volledige knockout-bracket — als twee sterke landen tegenover elkaar komen, schakelen ze elkaar uit.</p>
      <button class="btn glazenbol__btn" id="glazenbolBtn">🔮 Herbereken</button>
    </div>
    <div id="glazenbolResult"></div>
    <p class="glazenbol__disclaimer">1.000 simulaties · actuele marktodds per wedstrijd · knockout-bracket met wederzijdse uitschakeling</p>
  `;

  document.getElementById("glazenbolBtn").addEventListener("click", () => runGlazenBol(true));

  // Toon gecachede stand van vandaag direct zonder herberekening
  const today = new Date().toISOString().slice(0, 10);
  try {
    const cached = JSON.parse(localStorage.getItem(GB_CACHE_KEY) || 'null');
    if (cached?.datum === today && Array.isArray(cached.kansen)) {
      renderGlazenBolResult(cached.kansen);
      return;
    }
  } catch {}
  // Geen cache: auto-run zodra de tab geopend wordt (via switchTab)
}

function runGlazenBol(forceFresh = false) {
  const btn    = document.getElementById("glazenbolBtn");
  const result = document.getElementById("glazenbolResult");
  if (!result) return;

  if (btn) { btn.disabled = true; btn.textContent = "Simuleren..."; }
  if (forceFresh) result.innerHTML = '<p class="glazenbol__loading" style="color:var(--ink-mute);padding:12px 0">Berekenen…</p>';

  setTimeout(() => {
    const kansen = berekenGlazenBol(1000);

    // Sla op in localStorage voor de rest van de dag
    const today = new Date().toISOString().slice(0, 10);
    try { localStorage.setItem(GB_CACHE_KEY, JSON.stringify({ datum: today, kansen })); } catch {}

    renderGlazenBolResult(kansen);
    if (btn) { btn.disabled = false; btn.textContent = "🔮 Herbereken"; }
  }, 10);
}

function renderGlazenBolResult(kansen) {
  const result = document.getElementById("glazenbolResult");
  if (!result) return;
  const maxKans = Math.max(...kansen.map(k => k.kans));

  result.innerHTML = `<div class="glazenbol__list">${kansen.map((k, i) => {
    const breedte = maxKans > 0 ? (k.kans / maxKans * 100) : 0;
    let label = '';
    if (i === 0 && k.kans > 0)      label = '<span class="glazenbol__badge glazenbol__badge--goud">🏆 Topfavoriet</span>';
    else if (k.kans === 0)           label = '<span class="glazenbol__badge glazenbol__badge--grijs">Kansloos</span>';
    else if (k.kans < 3)             label = '<span class="glazenbol__badge glazenbol__badge--paars">🐴 Dark horse</span>';

    const hue = Math.round(40 * (k.kans / (maxKans || 1)));
    const balkKleur = k.kans === 0
      ? 'var(--paper-deep)'
      : `hsl(${35 + hue}, ${40 + hue}%, ${30 + Math.round(10 * (1 - k.kans / (maxKans || 1)))}%)`;

    const comp = gbTeamComp(k.naam);

    return `<div class="glazenbol__item">
      <div class="glazenbol__rij-top">
        <span class="glazenbol__rank">${i + 1}</span>
        <span class="glazenbol__naam">${escapeHtml(k.naam)}</span>
        <span class="glazenbol__score mono">${k.huidigePunten} pt nu</span>
        <span class="glazenbol__gem mono" title="Gemiddeld verwachte eindstand over 1.000 simulaties">~${k.gemPunten} pt</span>
        <span class="glazenbol__kans">${k.kans}%</span>
      </div>
      <div class="glazenbol__bar-wrap">
        <div class="glazenbol__bar" style="width:${breedte.toFixed(1)}%;background:${balkKleur}"></div>
      </div>
      <div class="glazenbol__comp">${comp}</div>
      ${label ? `<div class="glazenbol__label-wrap">${label}</div>` : ''}
    </div>`;
  }).join('')}</div>`;
}

// ──────────────────────────────────────────────────────────────────
// Overzicht (landing)
// ──────────────────────────────────────────────────────────────────
function renderOverzicht() {
  renderVandaag();
  renderRanglijst();
  renderWedstrijden("overzichtWedstrijdenList", "overzichtWedstrijdenEmpty");
  renderCountdown();
}

function formatNlTijd(datum) {
  // datum opgeslagen als CDT datetime "2026-06-12T14:00" (CDT = UTC-5)
  // CEST = CDT + 7h
  if (!datum || datum.length <= 10) return null;
  const [h, m] = datum.slice(11, 16).split(":").map(Number);
  const cestH = (h + 7) % 24;
  return `${String(cestH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function getActiveSpeeldagDate() {
  // Mexico City CDT = UTC-5.
  // Speeldag wisselt om 00:00 CDMX = 05:00 UTC = 07:00 Amsterdam CEST.
  const cdtMs = Date.now() - 5 * 60 * 60 * 1000;
  return new Date(cdtMs).toISOString().slice(0, 10);
}

function renderVandaag() {
  const el = document.getElementById("vandaagBlock");
  if (!el) return;
  if (!state.wedstrijden.length) { el.innerHTML = ""; return; }

  const normDatum = iso => (iso || "").slice(0, 10);
  const activeDatum = getActiveSpeeldagDate();

  // Huidige speeldag — toon ook al gespeelde matches van vandaag
  let toonMatches = state.wedstrijden.filter(w => normDatum(w.datum) === activeDatum);
  let kicker = "Vandaag";

  if (!toonMatches.length) {
    // Eerstvolgende speeldag met ongeplande matches
    const komend = state.wedstrijden
      .filter(w => !w.uitslag && normDatum(w.datum) > activeDatum)
      .sort((a, b) => normDatum(a.datum).localeCompare(normDatum(b.datum)));
    if (!komend.length) { el.innerHTML = ""; return; }
    const eersteDag = normDatum(komend[0].datum);
    toonMatches = komend.filter(w => normDatum(w.datum) === eersteDag);
    kicker = "Eerstvolgende speeldag";
  }

  // Sorteer: vroegste wedstrijd bovenaan
  toonMatches = [...toonMatches].sort((a, b) => (a.datum || "").localeCompare(b.datum || ""));

  const dagLabel = (() => {
    if (kicker === "Vandaag") return "Vandaag";
    const displayDatum = toonMatches[0].datum;
    const d = new Date(normDatum(displayDatum) + "T12:00:00Z");
    return d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
  })();

  el.innerHTML = `
    <div class="vandaag-blok">
      <div class="vandaag-blok__kicker">${kicker}</div>
      <h3 class="vandaag-blok__dag">${dagLabel}</h3>
      ${toonMatches.map(w => {
        const scoreStr = w.uitslag ? `<span class="vandaag-score">${w.uitslag.thuis}–${w.uitslag.uit}</span>` : `<span class="vs">vs</span>`;
        const tijdStr = KICKOFF[w.apiFixtureId] ?? null;
        const venue = VENUE[w.apiFixtureId] ?? null;
        const bijdragen = state.deelnemers
          .map(d => ({
            naam: d.naam,
            spelers: (d.spelers || []).filter(sp => sp.land === w.thuis || sp.land === w.uit)
          }))
          .filter(x => x.spelers.length > 0);
        const spelerHtml = bijdragen.length
          ? bijdragen.map(b =>
              `<div class="vandaag-deelnemer">
                <span class="vandaag-deelnemer__naam" data-goto-team="${escapeHtml(b.naam)}" tabindex="0" role="button">${escapeHtml(b.naam)}</span>
                <span class="vandaag-deelnemer__spelers">${b.spelers.map(sp =>
                  `<span class="vandaag-speler" data-speler="${escapeHtml(sp.naam)}" data-land="${escapeHtml(sp.land)}" tabindex="0" role="button">${escapeHtml(sp.naam)}</span> <span class="player-line__pos player-line__pos--${sp.positie}" style="display:inline-block;padding:1px 5px;border-radius:3px;font-size:0.65rem;font-weight:700;color:#fff;vertical-align:middle;">${sp.positie}</span>`
                ).join(" &middot; ")}</span>
              </div>`
            ).join("")
          : `<div class="vandaag-deelnemer vandaag-deelnemer--leeg">Geen gedraftte spelers actief</div>`;
        return `
          <div class="vandaag-wedstrijd">
            <div class="vandaag-wedstrijd__header">
              ${tijdStr ? `<span class="vandaag-wedstrijd__tijd">${tijdStr}</span>` : ""}
              <span class="vandaag-wedstrijd__teams">${escapeHtml(w.thuis)} ${scoreStr} ${escapeHtml(w.uit)}</span>
              ${typeof w.poule === 'string' ? `<span class="vandaag-wedstrijd__groep">Groep ${w.poule}</span>` : ""}
            </div>
            ${venue ? `<div class="vandaag-wedstrijd__venue">${escapeHtml(venue.stadion)} · ${escapeHtml(venue.stad)}</div>` : ""}
            <div class="vandaag-wedstrijd__spelers">${spelerHtml}</div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderRanglijst() {
  const el = document.getElementById("ranglijstBlock");
  if (!el) return;
  if (!state.deelnemers.length) { el.innerHTML = ""; return; }
  const ranked = [...state.deelnemers]
    .map(d => ({ ...d, _pts: deelnemerPunten(d) }))
    .sort((a, b) => b._pts - a._pts);
  const top = ranked[0]?._pts ?? 0;
  el.innerHTML = `<ol class="ranglijst">` +
    ranked.map((d, i) => {
      const achter = d._pts - top;
      return `<li class="ranglijst__rij ${i === 0 ? 'ranglijst__rij--1' : i === 1 ? 'ranglijst__rij--2' : i === 2 ? 'ranglijst__rij--3' : ''}">
        <span class="ranglijst__rank">${i + 1}</span>
        <span class="ranglijst__naam" data-goto-team="${escapeHtml(d.naam)}" tabindex="0" role="button">${escapeHtml(d.naam)}</span>
        <span class="ranglijst__pts mono">${d._pts}</span>
        <span class="ranglijst__achter mono">${achter === 0 ? "—" : achter}</span>
      </li>`;
    }).join("") + `</ol>`;
}

function renderAlleWedstrijden() {
  const el = document.getElementById("alleWedstrijdenBlock");
  if (!el) return;
  if (!state.wedstrijden.length) { el.innerHTML = ""; return; }
  const sorted = [...state.wedstrijden].sort((a, b) =>
    (a.datum || "").localeCompare(b.datum || "") || (a.apiFixtureId || 0) - (b.apiFixtureId || 0)
  );
  // Groepeer op datum
  const perDag = {};
  for (const w of sorted) {
    const d = w.datum || "?";
    (perDag[d] = perDag[d] || []).push(w);
  }
  el.innerHTML = Object.entries(perDag).map(([datum, wedstrijden]) => {
    const dagStr = (() => {
      const d = new Date(datum);
      return isNaN(d) ? datum : d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
    })();
    return `
      <div class="aw-dag">
        <div class="aw-dag__label">${dagStr}</div>
        <ol class="aw-lijst">
          ${wedstrijden.map(w => {
            const gespeeld = !!w.uitslag;
            const score = gespeeld ? `<b class="aw-score">${w.uitslag.thuis}–${w.uitslag.uit}</b>` : `<span class="aw-vs">vs</span>`;
            return `<li class="aw-rij${gespeeld ? " is-gespeeld" : ""}">
              <span class="aw-rij__icon">${gespeeld ? "✓" : "·"}</span>
              <span class="aw-rij__teams">${findVlag(w.thuis)} ${escapeHtml(w.thuis)} ${score} ${escapeHtml(w.uit)} ${findVlag(w.uit)}</span>
              ${typeof w.poule === 'string' ? `<span class="aw-rij__groep">Gr. ${w.poule}</span>` : ""}
            </li>`;
          }).join("")}
        </ol>
      </div>
    `;
  }).join("");
}

function renderSelectiesTeaser() {
  const el = document.getElementById("selectiesTeaser");
  if (!el) return;
  const definitief = state.landen.filter(l => { const n = (l.selectie||[]).length; return n >= 23 && n <= 26; }).length;
  const totaal = state.landen.length || 48;
  const progress = Math.round((definitief / totaal) * 100);

  const status = definitief === 0
    ? `<strong>Nog geen</strong> selecties bekend`
    : `<strong>${definitief}</strong> van de ${totaal} landen heeft de definitieve selectie ingeleverd`;

  el.innerHTML = `
    <div class="selecties-teaser__row">
      <div class="selecties-teaser__progress">
        <div class="selecties-teaser__bar"><div class="selecties-teaser__fill" style="width:${progress}%"></div></div>
        <div class="selecties-teaser__label">${status}</div>
      </div>
      <button class="btn btn--primary" type="button" data-goto="selecties">Bekijk selecties →</button>
    </div>
  `;
}

function renderCountdown() {
  const el = document.getElementById("headerCountdown");
  if (!el) return;
  const ms = WK_START - new Date();
  if (ms <= 0) { el.textContent = "Het WK is begonnen"; return; }
  const days = Math.floor(ms / 86400000);
  el.textContent = `Nog ${days} dagen tot de aftrap`;
}

function renderStats() {
  const stats = document.getElementById("statsBlock");
  if (!stats) return;

  const pot = state.deelnemers.length * INLEG_PER_DEELNEMER;
  const verwerkt = state.wedstrijden.filter(w => w.status === "verwerkt").length;
  const selectiesCompleet = state.landen.filter(l => { const n = (l.selectie||[]).length; return n >= 23 && n <= 26; }).length;
  const beforeWK = (WK_START - new Date()) > 0;

  // Tegel 1: landen (altijd 48)
  // Tegel 2: deelnemers (— tot draft)
  // Tegel 3: vóór WK = selecties compleet; tijdens/na WK = wedstrijden verwerkt
  // Tegel 4: vóór WK = prijzenpot placeholder; tijdens/na = events
  const tegel3Num = beforeWK
    ? `${selectiesCompleet}<span class="stat__subnum">/48</span>`
    : `${verwerkt}<span class="stat__subnum">/${state.wedstrijden.length || '?'}</span>`;
  const tegel3Label = beforeWK ? "Selecties compleet" : "Wedstrijden verwerkt";

  const tegel4Num = state.deelnemers.length
    ? `€${pot}`
    : `€20`;
  const tegel4Label = state.deelnemers.length ? "Prijzenpot" : "Inleg p.p.";

  stats.innerHTML = `
    <div class="stat">
      <div class="stat__num">48</div>
      <div class="stat__label">Deelnemende landen</div>
    </div>
    <div class="stat">
      <div class="stat__num">${state.deelnemers.length || "—"}</div>
      <div class="stat__label">Draft-deelnemers</div>
    </div>
    <div class="stat">
      <div class="stat__num">${tegel3Num}</div>
      <div class="stat__label">${tegel3Label}</div>
    </div>
    <div class="stat">
      <div class="stat__num">${tegel4Num}</div>
      <div class="stat__label">${tegel4Label}</div>
    </div>
  `;
}

function renderPodium() {
  const podium = document.getElementById("overzichtPodium");
  if (!podium) return;

  if (!state.deelnemers.length) {
    podium.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1">
        <div class="empty-state__num">00</div>
        <h3 class="empty-state__title">Stand verschijnt na de eerste wedstrijd</h3>
        <p class="empty-state__body">Zodra de draft is geweest en het WK begint, verschijnt hier de top-3 met actuele punten en prijzengeld.</p>
      </div>`;
    return;
  }

  const pot = state.deelnemers.length * INLEG_PER_DEELNEMER;
  const prijzen = { 1: Math.round(pot * 0.6), 2: Math.round(pot * 0.3), 3: Math.round(pot * 0.1) };

  const ranked = [...state.deelnemers]
    .map(d => ({ ...d, _pts: deelnemerPunten(d) }))
    .sort((a, b) => b._pts - a._pts);

  const renderSpot = (entry, rank, klass) => {
    if (!entry) return `<div class="podium-spot podium-spot--${klass}"><div class="podium-rank">${rank}</div><div class="podium-name">—</div></div>`;
    return `
      <div class="podium-spot podium-spot--${klass}">
        <div class="podium-rank">${rank}</div>
        <div class="podium-name">${escapeHtml(entry.naam)}</div>
        <div class="podium-pts mono">${entry._pts} punten</div>
        <div class="podium-prize">Prijs<strong>€${prijzen[rank]}</strong></div>
      </div>
    `;
  };

  podium.innerHTML = `
    ${renderSpot(ranked[1], 2, "2nd")}
    ${renderSpot(ranked[0], 1, "1st")}
    ${renderSpot(ranked[2], 3, "3rd")}
  `;
}

function renderSpeelschema() {
  const el = document.getElementById("speelschema");
  if (!el) return;
  const fases = [
    { label: "Groepsfase",          datum: "11 – 27 juni",   aantal: "48 wedstrijden", note: "12 groepen × 4 landen" },
    { label: "Ronde van 32",        datum: "28 juni – 3 juli", aantal: "16 wedstrijden", note: "Top 2 per groep + 8 beste derden" },
    { label: "Achtste finale",      datum: "4 – 7 juli",     aantal: "8 wedstrijden",  note: "+3 per speler" },
    { label: "Kwartfinales",        datum: "9 – 11 juli",    aantal: "4 wedstrijden",  note: "+3 per speler" },
    { label: "Halve finales",       datum: "14 – 15 juli",   aantal: "2 wedstrijden",  note: "+5 per speler" },
    { label: "Strijd om derde",     datum: "18 juli",        aantal: "Hard Rock, Miami", note: "" },
    { label: "Finale",              datum: "19 juli",        aantal: "MetLife, New York", note: "+5 per speler · Winnaar +5 per speler" }
  ];
  el.innerHTML = fases.map((f, i) => `
    <div class="schema-row">
      <div class="schema-row__num">${String(i+1).padStart(2,"0")}</div>
      <div class="schema-row__main">
        <div class="schema-row__label">${escapeHtml(f.label)}</div>
        <div class="schema-row__datum">${escapeHtml(f.datum)}</div>
      </div>
      <div class="schema-row__aantal mono">${escapeHtml(f.aantal)}</div>
      <div class="schema-row__note">${escapeHtml(f.note)}</div>
    </div>
  `).join("");
}

function renderLandenGrid() {
  const el = document.getElementById("landenGrid");
  if (!el) return;

  const volgorde = ["A","B","C","D","E","F","G","H","I","J","K","L"];
  const grouped = {};
  const zonderGroep = [];
  for (const l of state.landen) {
    if (l.groep && volgorde.includes(l.groep)) {
      (grouped[l.groep] = grouped[l.groep] || []).push(l);
    } else {
      zonderGroep.push(l);
    }
  }

  const groepsBlokken = volgorde
    .filter(g => grouped[g])
    .map(g => {
      const items = grouped[g]
        .slice()
        .sort((a,b) => a.naam.localeCompare(b.naam))
        .map(l => `
          <div class="land-pill ${l.host ? "is-host" : ""}" title="${l.host ? "Gastland · " : ""}${escapeHtml(l.confederatie || "")}">
            <span class="land-pill__flag">${l.vlag}</span>
            <span class="land-pill__name">${escapeHtml(l.naam)}</span>
            <span class="land-pill__conf">${escapeHtml(l.confederatie || "")}</span>
          </div>
        `).join("");
      return `
        <section class="poule">
          <header class="poule__head">
            <span class="poule__letter">${g}</span>
            <h4 class="poule__title">Groep ${g}</h4>
            <span class="poule__count mono">${grouped[g].length} landen</span>
          </header>
          <div class="poule__grid">${items}</div>
        </section>
      `;
    }).join("");

  const rest = zonderGroep.length
    ? `<section class="poule poule--tbd">
         <header class="poule__head">
           <span class="poule__letter">?</span>
           <h4 class="poule__title">Nog niet ingedeeld</h4>
           <span class="poule__count mono">${zonderGroep.length} landen</span>
         </header>
         <div class="poule__grid">
           ${zonderGroep.map(l => `
             <div class="land-pill">
               <span class="land-pill__flag">${l.vlag}</span>
               <span class="land-pill__name">${escapeHtml(l.naam)}</span>
               <span class="land-pill__conf">${escapeHtml(l.confederatie || "")}</span>
             </div>`).join("")}
         </div>
       </section>`
    : "";

  el.innerHTML = groepsBlokken + rest;
}

function renderSelecties() {
  const el = document.getElementById("selectiesBlock");
  if (!el) return;
  const landenMetSelectie = state.landen.filter(l => { const n = (l.selectie||[]).length; return n >= 1 && n <= 26; });
  const compleet = state.landen.filter(l => { const n = (l.selectie||[]).length; return n >= 23 && n <= 26; }).length;
  const totaal = state.landen.length || 48;
  const progress = Math.round((compleet / totaal) * 100);

  const updatedStr = state.selectiesUpdated
    ? ` · Laatste update ${formatDateTimeNL(state.selectiesUpdated)}`
    : "";

  if (landenMetSelectie.length === 0) {
    el.innerHTML = `
      <div class="selecties__header">
        <div class="selecties__progress-label">Selecties bekend: <strong>0</strong> / ${totaal} landen${updatedStr}</div>
        <div class="selecties__progress-bar"><div class="selecties__progress-fill" style="width:0%"></div></div>
      </div>
      <div class="empty-state" style="margin-top:18px">
        <div class="empty-state__num">—</div>
        <h3 class="empty-state__title">Selecties volgen vanaf mei 2026</h3>
        <p class="empty-state__body">FIFA's deadline voor definitieve 26-koppige selecties is 4 juni 2026. Zodra een land zijn selectie indient, wordt die binnen een dag automatisch geladen via Trigger.dev + API-Football.</p>
      </div>`;
    return;
  }

  function renderLandKaart(l) {
    const raw = l.selectie || [];
    const sel = raw.length <= 26 ? raw : []; // voorselecties negeren
    const isReady = sel.length >= 23;
    const cls = isReady        ? "selectie-land is-ready"
              : sel.length > 0 ? "selectie-land is-partial"
              :                  "selectie-land is-pending";
    const badge = isReady ? "✓" : (sel.length > 0 ? `${sel.length}/26` : "—");
    return `
      <details class="${cls}">
        <summary>
          <span class="selectie-land__flag">${l.vlag}</span>
          <span class="selectie-land__name">${escapeHtml(l.naam)}</span>
          <span class="selectie-land__badge mono">${badge}</span>
        </summary>
        <ol class="selectie-list">
          ${[...sel].sort((a,b) => {
            const o = {K:0,V:1,M:2,A:3};
            return (o[a.positie]??4) - (o[b.positie]??4);
          }).map(s => `<li>
              <span class="sel-pos">${escapeHtml(s.positie || "")}</span>
              <span class="sel-name">${escapeHtml(s.naam)}</span>
            </li>`).join("") || '<li class="italic" style="color:var(--ink-mute)">Selectie nog niet bekend</li>'}
        </ol>
      </details>`;
  }

  const groepen = {};
  for (const l of state.landen) {
    const g = l.groep || '?';
    if (!groepen[g]) groepen[g] = [];
    groepen[g].push(l);
  }

  const groepSections = Object.keys(groepen).sort().map(groep => `
    <div class="selecties__groep">
      <h3 class="selecties__groep-titel">Groep ${escapeHtml(groep)}</h3>
      <div class="selecties__grid">${groepen[groep].map(renderLandKaart).join("")}</div>
    </div>
  `).join("");

  el.innerHTML = `
    <div class="selecties__header">
      <div class="selecties__progress-label">Definitieve selecties: <strong>${compleet}</strong> / ${totaal} landen${updatedStr}</div>
      <div class="selecties__progress-bar"><div class="selecties__progress-fill" style="width:${progress}%"></div></div>
    </div>
    ${groepSections}
  `;
}

function formatDateTimeNL(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${dd}-${mm} ${hh}:${mi}`;
}

// ──────────────────────────────────────────────────────────────────
// Teams
// ──────────────────────────────────────────────────────────────────
function renderTeams() {
  const grid = document.getElementById("teamsGrid");
  const empty = document.getElementById("teamsEmpty");
  const countEl = document.getElementById("teamsCountNum");

  countEl.textContent = String(state.deelnemers.length).padStart(2, "0");

  if (!state.deelnemers.length) {
    grid.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const ranked = [...state.deelnemers]
    .map(d => ({ ...d, _pts: deelnemerPunten(d) }))
    .sort((a, b) => b._pts - a._pts);

  grid.innerHTML = ranked.map((d, i) => {
    const rank = i + 1;
    const posOrder = { K: 0, V: 1, M: 2, A: 3 };

    // Build combined player list: regular spelers + incoming wissels spelers
    const wisselUitNamen = new Set((d.wissels || []).map(w => w.uit));
    const inkomendSpelers = (d.wissels || []).map(w => ({
      naam: w.in, land: w.land_in, positie: w.positie_in, _wisselVanaf: w.vanaf
    }));
    const alleSpelers = [
      ...(d.spelers || []).map(sp => ({
        ...sp,
        _wisselVoor: wisselUitNamen.has(sp.naam)
          ? (d.wissels || []).find(w => w.uit === sp.naam).vanaf
          : null
      })),
      ...inkomendSpelers
    ].sort((a, b) =>
      a.land.localeCompare(b.land, "nl") || (posOrder[a.positie] ?? 9) - (posOrder[b.positie] ?? 9)
    );

    const playerRows = alleSpelers.map(sp => {
      const vlag = findVlag(sp.land);
      const code = findCode(sp.land);
      const opts = sp._wisselVoor ? { voor: sp._wisselVoor } : sp._wisselVanaf ? { vanaf: sp._wisselVanaf } : {};
      const spPts = spelerPunten(sp, opts);
      const ptsStr = spPts === 0 ? "0" : (spPts > 0 ? `+${spPts}` : `${spPts}`);
      const isUit = !!sp._wisselVoor;
      const isIn  = !!sp._wisselVanaf;
      const wisselBadge = isUit
        ? `<span class="player-line__wissel-badge player-line__wissel-badge--uit">↓ uit</span>`
        : isIn
        ? `<span class="player-line__wissel-badge player-line__wissel-badge--in">↑ in</span>`
        : '';
      return `
        <li class="player-line${isUit ? ' player-line--wissel-uit' : isIn ? ' player-line--wissel-in' : ''}" data-speler="${escapeHtml(sp.naam)}" data-land="${escapeHtml(sp.land)}" tabindex="0" role="button">
          <span class="player-line__flag">${vlag}</span>
          <span class="player-line__pos player-line__pos--${sp.positie}" title="${escapeHtml(POS_LABEL[sp.positie] || sp.positie)}">${sp.positie}</span>
          <span class="player-line__name">${escapeHtml(sp.naam)}${wisselBadge}</span>
          <span class="player-line__meta">${code}</span>
          <span class="player-line__pts ${spPts < 0 ? 'is-neg' : ''}">${ptsStr}</span>
          <span class="player-line__chev" aria-hidden="true">→</span>
        </li>
      `;
    }).join("");

    const teamId = "team-" + d.naam.toLowerCase().replace(/[^a-z0-9]/g, "-");
    return `
      <article class="team-row" id="${teamId}">
        <header class="team-row__head">
          <div class="team-row__rank">${rank}</div>
          <div class="team-row__name">
            <div class="team-row__kicker">Deelnemer</div>
            <h3>${escapeHtml(d.naam)}</h3>
          </div>
          <div class="team-row__pts">
            <div class="team-row__pts-num">${d._pts}</div>
            <div class="team-row__pts-label">Punten</div>
          </div>
        </header>
        <ol class="player-list">
          ${playerRows || '<li class="empty italic">Geen spelers ingevoerd</li>'}
        </ol>
      </article>
    `;
  }).join("");
}

// ──────────────────────────────────────────────────────────────────
// Wedstrijden
// ──────────────────────────────────────────────────────────────────
function renderWedstrijden(listId = "wedstrijdenList", emptyId = "wedstrijdenEmpty") {
  const list = document.getElementById(listId);
  const empty = document.getElementById(emptyId);

  if (!state.wedstrijden.length) {
    list.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  const sorted = [...state.wedstrijden].sort((a, b) =>
    (a.datum || "").localeCompare(b.datum || "")
  );

  // Pre-bouw speler-lookup: naam → {speler obj, deelnemer naam}
  const lookup = {};
  for (const d of state.deelnemers) {
    for (const sp of d.spelers) {
      const wissel = (d.wissels || []).find(w => w.uit === sp.naam);
      lookup[sp.naam] = { ...sp, deelnemer: d.naam, ...(wissel ? { wisselVoor: wissel.vanaf } : {}) };
    }
    for (const wissel of (d.wissels || [])) {
      lookup[wissel.in] = { naam: wissel.in, land: wissel.land_in, positie: wissel.positie_in, deelnemer: d.naam, wisselVanaf: wissel.vanaf };
    }
  }

  list.innerHTML = sorted.map(w => {
    const datum = formatShortDate(w.datum);
    const score = w.uitslag ? `${w.uitslag.thuis}–${w.uitslag.uit}` : "";
    const pensLabel = w.pens ? ` (${w.pens.thuis}–${w.pens.uit} pen)` : "";
    const faseLabelStr = {
      "groep": "Groep",
      "1/8": "1/8 finale",
      "1/4": "Kwart",
      "1/2": "Halve",
      "F": "Finale",
      "bronze": "Brons"
    }[w.fase] || w.fase || "—";

    // Bereken per speler in deze wedstrijd de punten
    const matchPts = computeMatchContribs(w, lookup);
    const totalPts = matchPts.reduce((s, x) => s + x.subtotal, 0);

    const rows = matchPts
      .sort((a, b) => b.subtotal - a.subtotal)
      .map(c => {
        const lineStr = c.lines.map(l => `${l.label} <b>${l.pts > 0 ? '+' : ''}${l.pts}</b>`).join(" · ");
        const ptsCls = c.subtotal < 0 ? "is-neg" : (c.subtotal > 0 ? "is-pos" : "");
        return `
          <li class="contrib">
            <span class="contrib__pos contrib__pos--${c.speler.positie}">${c.speler.positie}</span>
            <span class="contrib__name" data-speler="${escapeHtml(c.speler.naam)}" data-land="${escapeHtml(c.speler.land)}" tabindex="0" role="button">${escapeHtml(c.speler.naam)}</span>
            <span class="contrib__owner">— ${escapeHtml(c.deelnemer)}</span>
            <span class="contrib__lines">${lineStr}</span>
            <span class="contrib__total ${ptsCls}">${c.subtotal > 0 ? '+' : ''}${c.subtotal}</span>
          </li>
        `;
      }).join("");

    return `
      <details class="match-row" ${matchPts.length ? "" : ""}>
        <summary class="match-row__head">
          <span class="match-row__date">${datum}</span>
          <span class="match-row__fase">${faseLabelStr}</span>
          <span class="match-row__teams">
            <span class="match-row__team">${escapeHtml(w.thuis)}</span>
            <span class="match-row__score mono">${score}${pensLabel}</span>
            <span class="match-row__team">${escapeHtml(w.uit)}</span>
          </span>
          <span class="match-row__dpts mono">${totalPts >= 0 ? '+' : ''}${totalPts} pt</span>
          <span class="match-row__chev" aria-hidden="true">▾</span>
        </summary>
        <div class="match-row__body">
          ${matchPts.length
            ? `<ul class="contribs">${rows}</ul>`
            : `<p class="match-row__empty italic">Geen gedrafte spelers actief in deze wedstrijd.</p>`
          }
        </div>
      </details>
    `;
  }).join("");
}

// Compute per-match contribution for every drafted player who had events.
// Iterates over drafted players and uses naammatch() to handle API-naam ↔ draft-naam
// verschillen (bijv. "Tomáš Souček" ↔ "T. Soucek", "Son Heung-min" ↔ "Son Heung-Min").
function computeMatchContribs(w, lookup) {
  if (!w.events || w.events.length === 0) return [];

  const results = [];
  for (const [draftNaam, info] of Object.entries(lookup)) {
    if (info.wisselVoor && w.datum >= info.wisselVoor) continue;
    if (info.wisselVanaf && w.datum < info.wisselVanaf) continue;
    const evs = w.events.filter(e => naammatch(e.speler, draftNaam));
    if (evs.length === 0) continue;

    const pos = info.positie;
    const lines = [];
    let subtotal = 0;

    const gespeeld45 = evs.some(e => e.type === "gespeeld45");
    const ingevallen = evs.some(e => e.type === "ingevallen");
    const cleanSheet = evs.some(e => e.type === "cleanSheet45");
    const tegenCount = evs.filter(e => e.type === "tegendoelpunt").length;

    if (gespeeld45 && w.uitslag) {
      const p = POINTS.gespeeld45[pos] ?? 0;
      lines.push({ label: "Gespeeld", pts: p });
      subtotal += p;
    }
    if ((gespeeld45 || ingevallen) && w.uitslag && (w.poule || w.fase === "groep")) {
      const isThuis = w.thuis === info.land;
      const isUit = w.uit === info.land;
      if (isThuis || isUit) {
        const eigen = isThuis ? w.uitslag.thuis : w.uitslag.uit;
        const tegen = isThuis ? w.uitslag.uit : w.uitslag.thuis;
        if (eigen > tegen) {
          const pp = POINTS.poulewinst[pos] ?? 0;
          lines.push({ label: ingevallen && !gespeeld45 ? "Winst (inv)" : "Winst", pts: pp });
          subtotal += pp;
        } else if (eigen === tegen) {
          const pp = POINTS.gelijkspel[pos] ?? 0;
          lines.push({ label: ingevallen && !gespeeld45 ? "Gelijk (inv)" : "Gelijk", pts: pp });
          subtotal += pp;
        }
      }
    }
    if (cleanSheet) {
      const p = POINTS.cleanSheet45[pos] ?? 0;
      lines.push({ label: "Clean sheet", pts: p });
      subtotal += p;
    }
    if (tegenCount > 0) {
      const p = tegenCount * (POINTS.tegendoelpunt[pos] ?? 0);
      if (p !== 0) {
        lines.push({ label: `Tegen ×${tegenCount}`, pts: p });
        subtotal += p;
      }
    }

    const counts = {};
    for (const ev of evs) counts[ev.type] = (counts[ev.type] || 0) + 1;
    const eventLabels = {
      velddoelpunt: "Goal",
      assist: "Assist",
      strafschop: "Strafschop",
      geleKaart: "Geel",
      directeRood: "Rood",
      eigenGoal: "Eigen goal"
    };
    for (const [type, count] of Object.entries(counts)) {
      if (!eventLabels[type]) continue;
      const p = (POINTS[type]?.[pos] ?? 0) * count;
      if (p === 0) continue;
      lines.push({
        label: count > 1 ? `${eventLabels[type]} ×${count}` : eventLabels[type],
        pts: p
      });
      subtotal += p;
    }

    if (lines.length > 0) {
      results.push({ speler: info, deelnemer: info.deelnemer, lines, subtotal });
    }
  }
  return results;
}

// ──────────────────────────────────────────────────────────────────
// Events wiring
// ──────────────────────────────────────────────────────────────────
function wireEvents() {
  document.getElementById("loadSampleBtn")?.addEventListener("click", loadSampleDeelnemers);

  // Howto-kaartjes op Overzicht → switchTab
  document.querySelectorAll("[data-goto]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.goto));
  });

  // Global click / keyboard delegate for opening player modal + team nav
  document.addEventListener("click", (e) => {
    const teamTrigger = e.target.closest("[data-goto-team]");
    if (teamTrigger) {
      e.preventDefault();
      openTeamModal(teamTrigger.dataset.gotoTeam);
      return;
    }
    const trigger = e.target.closest("[data-speler]");
    if (trigger) {
      e.preventDefault();
      if (trigger.closest("#spelerModal")) {
        // Geopend vanuit team-modal — sla team op voor terug-navigatie
        const teamNaam = document.querySelector("#modalContent .modal__title")?.textContent;
        if (teamNaam) _modalStack.push({ type: "team", naam: teamNaam });
      }
      openSpelerModal(trigger.dataset.speler, trigger.dataset.land);
    }
    if (e.target.closest(".modal__close") || e.target.classList?.contains("modal__backdrop")) {
      if (_modalStack.length > 0) {
        const back = _modalStack.pop();
        if (back.type === "team") openTeamModal(back.naam);
      } else {
        closeSpelerModal();
      }
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { _modalStack = []; closeSpelerModal(); }
    if (e.key === "Enter" || e.key === " ") {
      const active = document.activeElement;
      if (active?.matches("[data-speler]")) {
        e.preventDefault();
        openSpelerModal(active.dataset.speler, active.dataset.land);
      }
      if (active?.matches("[data-goto-team]")) {
        e.preventDefault();
        openTeamModal(active.dataset.gotoTeam);
      }
    }
  });
}

// ──────────────────────────────────────────────────────────────────
// Speler-modal
// ──────────────────────────────────────────────────────────────────
function openSpelerModal(naam, land) {
  const speler = findSpelerInTeams(naam, land);
  if (!speler) { toast(`Speler ${naam} niet gevonden`); return; }

  // Bepaal wissel-opts zodat irrelevante wedstrijden worden doorstreept
  const wisselOpts = (() => {
    if (!speler._deelnemer) return {};
    const d = state.deelnemers.find(x => x.naam === speler._deelnemer);
    if (!d) return {};
    const uitWissel = (d.wissels || []).find(w => w.uit === naam);
    if (uitWissel) return { voor: uitWissel.vanaf };
    const inWissel  = (d.wissels || []).find(w => w.in  === naam);
    if (inWissel)  return { vanaf: inWissel.vanaf };
    return {};
  })();

  const bd = spelerBreakdown(speler, wisselOpts);
  const vlag = findVlag(speler.land);
  const posLbl = POS_LABEL[speler.positie] || speler.positie;
  const deelnemer = speler._deelnemer;
  const totStr = bd.total > 0 ? `+${bd.total}` : `${bd.total}`;

  const matchRows = bd.perMatch.length
    ? bd.perMatch.map(m => {
        const datum = formatShortDate(m.wedstrijd.datum);
        const thuis = m.wedstrijd.thuis, uit = m.wedstrijd.uit;
        const score = m.wedstrijd.uitslag ? `${m.wedstrijd.uitslag.thuis}–${m.wedstrijd.uitslag.uit}` : "";
        const vs = speler.land === thuis
          ? `<b>${escapeHtml(thuis)}</b> ${score} ${escapeHtml(uit)}`
          : `${escapeHtml(thuis)} ${score} <b>${escapeHtml(uit)}</b>`;
        const linesHtml = m.lines.map(l =>
          `<span class="bd-line__label">${escapeHtml(l.label)}</span><span class="bd-line__pts ${l.pts < 0 ? 'is-neg' : ''}">${l.pts > 0 ? '+' : ''}${l.pts}</span>`
        ).join("");
        const rowCls = m.teltMee ? '' : ' class="bd-row--niet-relevant"';
        return `
          <tr${rowCls}>
            <td class="bd-date mono">${datum}</td>
            <td class="bd-match">${vs}</td>
            <td class="bd-lines">${linesHtml}</td>
            <td class="bd-sub mono ${m.subtotal < 0 ? 'is-neg' : ''}">${m.subtotal > 0 ? '+' : ''}${m.subtotal}</td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="4" class="italic bd-empty">Deze speler heeft geen events gehad in verwerkte wedstrijden.</td></tr>`;

  const faseRows = bd.fase.length
    ? bd.fase.map(f => `<li><span>${escapeHtml(f.label)}</span><span class="mono">+${f.pts}</span></li>`).join("")
    : `<li class="italic">Geen fase-bonussen (land ging niet voorbij groepsfase, of nog niet toegekend).</li>`;

  const awardRows = bd.awards.length
    ? bd.awards.map(a => `<li><span>${escapeHtml(a.label)}</span><span class="mono">+${a.pts}</span></li>`).join("")
    : `<li class="italic">Geen award-bonussen.</li>`;

  document.getElementById("modalContent").innerHTML = `
    <button class="modal__close" type="button" aria-label="Sluiten">✕</button>
    <header class="modal__header">
      <div class="modal__flag">${vlag}</div>
      <div class="modal__titleblock">
        <div class="modal__kicker">${escapeHtml(posLbl)} · ${escapeHtml(speler.land)} · Team ${escapeHtml(deelnemer || "—")}</div>
        <h2 class="modal__title">${escapeHtml(speler.naam)}</h2>
      </div>
      <div class="modal__total">
        <div class="modal__total-num">${totStr}</div>
        <div class="modal__total-label">Punten</div>
      </div>
    </header>
    <div class="modal__body">
      <h3 class="modal__subtitle">Per wedstrijd</h3>
      <div class="bd-table-wrap">
        <table class="bd-table">
          <thead><tr><th>Datum</th><th>Wedstrijd</th><th>Berekening</th><th class="mono">pt</th></tr></thead>
          <tbody>${matchRows}</tbody>
        </table>
      </div>
      <div class="bd-grid">
        <div>
          <h3 class="modal__subtitle">Fase-bonussen</h3>
          <ul class="bd-list">${faseRows}</ul>
        </div>
        <div>
          <h3 class="modal__subtitle">Awards</h3>
          <ul class="bd-list">${awardRows}</ul>
        </div>
      </div>
    </div>
  `;
  document.getElementById("spelerModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

function closeSpelerModal() {
  document.getElementById("spelerModal")?.classList.add("hidden");
  document.body.style.overflow = "";
}

// ──────────────────────────────────────────────────────────────────
// Team-modal
// ──────────────────────────────────────────────────────────────────
function openTeamModal(naam) {
  _modalStack = [];
  const deelnemer = state.deelnemers.find(d => d.naam === naam);
  if (!deelnemer) return;

  const ranked = [...state.deelnemers]
    .map(d => ({ naam: d.naam, pts: deelnemerPunten(d) }))
    .sort((a, b) => b.pts - a.pts);
  const rank = ranked.findIndex(d => d.naam === naam) + 1;
  const totPts = deelnemerPunten(deelnemer);
  const totStr = totPts > 0 ? `+${totPts}` : `${totPts}`;

  const posOrder = { K: 0, V: 1, M: 2, A: 3 };
  const spelers = [...(deelnemer.spelers || [])]
    .map(sp => ({ ...sp, _pts: spelerPunten(sp) }))
    .sort((a, b) => b._pts - a._pts || (posOrder[a.positie] ?? 9) - (posOrder[b.positie] ?? 9));

  const spelerRows = spelers.map(sp => {
    const ptsStr = sp._pts > 0 ? `+${sp._pts}` : `${sp._pts}`;
    return `
      <li class="tm-row" data-speler="${escapeHtml(sp.naam)}" data-land="${escapeHtml(sp.land)}" tabindex="0" role="button">
        <span class="player-line__pos player-line__pos--${sp.positie}">${sp.positie}</span>
        <span class="tm-row__name">${escapeHtml(sp.naam)}</span>
        <span class="tm-row__land">${escapeHtml(sp.land)}</span>
        <span class="tm-row__pts ${sp._pts < 0 ? 'is-neg' : ''}">${ptsStr}</span>
        <span class="tm-row__chev" aria-hidden="true">→</span>
      </li>`;
  }).join("");

  document.getElementById("modalContent").innerHTML = `
    <button class="modal__close" type="button" aria-label="Sluiten">✕</button>
    <header class="modal__header">
      <div class="modal__flag modal__flag--rank">#${rank}</div>
      <div class="modal__titleblock">
        <div class="modal__kicker">Team · ${spelers.length} spelers</div>
        <h2 class="modal__title">${escapeHtml(deelnemer.naam)}</h2>
      </div>
      <div class="modal__total">
        <div class="modal__total-num">${totStr}</div>
        <div class="modal__total-label">Punten</div>
      </div>
    </header>
    <div class="modal__body">
      <h3 class="modal__subtitle">Spelers — klik voor puntenbreakdown</h3>
      <ol class="tm-list">${spelerRows}</ol>
    </div>
  `;
  document.getElementById("spelerModal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
}

// ──────────────────────────────────────────────────────────────────
// Wissel-validatie
// Controleert of alle wissels in deelnemers.json voldoen aan het reglement.
// Resultaat wordt gelogd in de console + getoond als toast bij overtredingen.
// ──────────────────────────────────────────────────────────────────
function valideerWissels() {
  const overtredingen = [];

  // Ranglijst NA de groepsfase: tel alleen punten van wedstrijden vóór de knockout.
  // Dit is de maatstaf voor wie window 2 mag gebruiken.
  const gesorteerd = [...state.deelnemers]
    .map(d => {
      const ptsGroepsfase = (d.spelers || []).reduce((sum, sp) => {
        const wissel = (d.wissels || []).find(w => w.uit === sp.naam);
        return sum + spelerPunten(sp, { voor: KNOCKOUT_START, ...(wissel ? { voor: wissel.vanaf < KNOCKOUT_START ? wissel.vanaf : KNOCKOUT_START } : {}) });
      }, 0) + (d.wissels || []).reduce((sum, w) => {
        const sp = { naam: w.in, land: w.land_in, positie: w.positie_in };
        return sum + spelerPunten(sp, { vanaf: w.vanaf, voor: KNOCKOUT_START });
      }, 0);
      return { naam: d.naam, pts: ptsGroepsfase };
    })
    .sort((a, b) => b.pts - a.pts);
  const totaal = gesorteerd.length;
  // Onderste helft = posities vanaf Math.ceil(totaal/2) + 1
  const onderstHelft = new Set(
    gesorteerd.slice(Math.ceil(totaal / 2)).map(d => d.naam)
  );

  for (const d of state.deelnemers) {
    const wissels = d.wissels || [];
    const gebruiktW1 = wissels.filter(w => w.window === 1);
    const gebruiktW2 = wissels.filter(w => w.window === 2);

    for (const w of wissels) {
      const prefix = `[Wissel] ${d.naam}: ${w.uit} → ${w.in}`;

      // Ontbrekend window-veld
      if (!w.window) {
        overtredingen.push(`${prefix} — ontbreekt 'window' veld (1 of 2)`);
        continue;
      }

      // Window 1: wissel moet ingaan vóór start knockoutfase
      if (w.window === 1 && w.vanaf >= KNOCKOUT_START) {
        overtredingen.push(`${prefix} — window 1 maar datum ${w.vanaf} valt ná de groepsfase (knockoutfase start ${KNOCKOUT_START})`);
      }

      // Window 2: wissel moet ingaan ná start knockoutfase
      if (w.window === 2 && w.vanaf < KNOCKOUT_START) {
        overtredingen.push(`${prefix} — window 2 maar datum ${w.vanaf} valt nog in de groepsfase (knockoutfase start ${KNOCKOUT_START})`);
      }

      // Window 2: alleen toegestaan voor onderste helft na groepsfase
      if (w.window === 2 && !onderstHelft.has(d.naam)) {
        const positie = gesorteerd.findIndex(x => x.naam === d.naam) + 1;
        overtredingen.push(`${prefix} — window 2 niet toegestaan: ${d.naam} staat ${positie}e na de groepsfase (alleen onderste helft mag window 2 gebruiken)`);
      }
    }

    // Max 1× per window
    if (gebruiktW1.length > 1) {
      overtredingen.push(`[Wissel] ${d.naam} — heeft ${gebruiktW1.length}× window 1 gebruikt (max 1×)`);
    }
    if (gebruiktW2.length > 1) {
      overtredingen.push(`[Wissel] ${d.naam} — heeft ${gebruiktW2.length}× window 2 gebruikt (max 1×)`);
    }
  }

  if (overtredingen.length === 0) {
    console.log("[Wissels] ✓ Alle wissels zijn geldig volgens het reglement.");
  } else {
    overtredingen.forEach(o => console.warn(o));
    toast(`⚠ ${overtredingen.length} wissel-overtreding(en) — zie console`, 6000);
  }

  return overtredingen;
}

function findSpelerInTeams(naam, land) {
  for (const d of state.deelnemers) {
    for (const sp of (d.spelers || [])) {
      if (sp.naam === naam && (!land || sp.land === land)) {
        return { ...sp, _deelnemer: d.naam };
      }
    }
    for (const w of (d.wissels || [])) {
      if (w.in === naam && (!land || w.land_in === land)) {
        return { naam: w.in, land: w.land_in, positie: w.positie_in, _deelnemer: d.naam };
      }
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────
// Voorbeeldteams
// ──────────────────────────────────────────────────────────────────
function loadSampleDeelnemers() {
  if (state.deelnemers.length > 0) {
    if (!confirm("Er zijn al deelnemers geladen. Vervangen door voorbeeld?")) return;
  }
  state.deelnemers = [
    {
      naam: "Richard",
      spelers: [
        { naam: "Vinícius Jr", land: "Brazilië", positie: "A" },
        { naam: "Rodrygo", land: "Brazilië", positie: "A" },
        { naam: "Jude Bellingham", land: "Engeland", positie: "M" },
        { naam: "Pedri", land: "Spanje", positie: "M" },
        { naam: "Florian Wirtz", land: "Duitsland", positie: "M" },
        { naam: "Virgil van Dijk", land: "Nederland", positie: "V" },
        { naam: "Dani Carvajal", land: "Spanje", positie: "V" },
        { naam: "Kyle Walker", land: "Engeland", positie: "V" },
        { naam: "Alphonso Davies", land: "Canada", positie: "V" },
        { naam: "Thibaut Courtois", land: "België", positie: "K" },
        { naam: "Harry Kane", land: "Engeland", positie: "A" }
      ]
    },
    {
      naam: "Frank",
      spelers: [
        { naam: "Lamine Yamal", land: "Spanje", positie: "A" },
        { naam: "Erling Haaland", land: "Noorwegen", positie: "A" },
        { naam: "Kylian Mbappé", land: "Frankrijk", positie: "A" },
        { naam: "Phil Foden", land: "Engeland", positie: "M" },
        { naam: "Kevin De Bruyne", land: "België", positie: "M" },
        { naam: "Antoine Griezmann", land: "Frankrijk", positie: "M" },
        { naam: "William Saliba", land: "Frankrijk", positie: "V" },
        { naam: "Matthijs de Ligt", land: "Nederland", positie: "V" },
        { naam: "Achraf Hakimi", land: "Marokko", positie: "V" },
        { naam: "Mike Maignan", land: "Frankrijk", positie: "K" },
        { naam: "Mohammed Kudus", land: "Ghana", positie: "A" }
      ]
    },
    {
      naam: "Ferdi",
      spelers: [
        { naam: "Bukayo Saka", land: "Engeland", positie: "A" },
        { naam: "Cody Gakpo", land: "Nederland", positie: "A" },
        { naam: "Rafael Leão", land: "Portugal", positie: "A" },
        { naam: "Frenkie de Jong", land: "Nederland", positie: "M" },
        { naam: "Nicolo Barella", land: "Italië", positie: "M" },
        { naam: "Rodri", land: "Spanje", positie: "M" },
        { naam: "Ronald Araújo", land: "Uruguay", positie: "V" },
        { naam: "Antonio Rüdiger", land: "Duitsland", positie: "V" },
        { naam: "Josko Gvardiol", land: "Kroatië", positie: "V" },
        { naam: "Gianluigi Donnarumma", land: "Italië", positie: "K" },
        { naam: "Lautaro Martínez", land: "Argentinië", positie: "A" }
      ]
    }
  ];
  saveLS(LS_KEYS.deelnemers, state.deelnemers);
  renderAll();
  toast("Voorbeeldteams geladen");
}

// ──────────────────────────────────────────────────────────────────
// De Glazen Bol — Monte Carlo simulatie
// ──────────────────────────────────────────────────────────────────

// Simuleer één wedstrijd. Als odds beschikbaar zijn (van bettingmarkt) → gebruik die.
// Fallback: relatieve TEAM_KRACHT (pre-toernooi bettingmarkt).
function gbSimMatch(team1, team2, allowDraw, odds = null) {
  const r = Math.random();
  if (odds) {
    if (!allowDraw) {
      const tot = odds.kans_thuis + odds.kans_uit;
      return r < odds.kans_thuis / tot ? team1 : team2;
    }
    if (r < odds.kans_thuis) return team1;
    if (r < odds.kans_thuis + odds.kans_gelijk) return 'draw';
    return team2;
  }
  // Fallback: TEAM_KRACHT
  const k1 = TEAM_KRACHT[team1] || 50;
  const k2 = TEAM_KRACHT[team2] || 50;
  const rv = Math.random() * (k1 + k2);
  if (!allowDraw) return rv < k1 ? team1 : team2;
  if (rv < 0.75 * k1) return team1;
  if (rv < 0.75 * k1 + 0.25 * (k1 + k2)) return 'draw';
  return team2;
}

// Huidige groepsstanden op basis van gespeelde wedstrijden
function gbGroepStanden() {
  const standen = {};
  state.landen.forEach(l => {
    if (!standen[l.groep]) standen[l.groep] = {};
    standen[l.groep][l.naam] = { pts: 0, gd: 0, gs: 0 };
  });
  state.wedstrijden.filter(w => w.uitslag && w.poule).forEach(w => {
    const g = standen[w.poule];
    if (!g) return;
    const th = w.uitslag.thuis, tu = w.uitslag.uit;
    if (g[w.thuis]) { g[w.thuis].gs += th; g[w.thuis].gd += th - tu; }
    if (g[w.uit])   { g[w.uit].gs   += tu; g[w.uit].gd   += tu - th; }
    if      (th > tu) { if (g[w.thuis]) g[w.thuis].pts += 3; }
    else if (th < tu) { if (g[w.uit])   g[w.uit].pts   += 3; }
    else              { if (g[w.thuis]) g[w.thuis].pts += 1; if (g[w.uit]) g[w.uit].pts += 1; }
  });
  return standen;
}

// Simuleer resterende groepswedstrijden — gebruik marktodds als beschikbaar
function gbSimRestGroepsfase(basisStanden) {
  const standen = JSON.parse(JSON.stringify(basisStanden));
  state.wedstrijden.filter(w => !w.uitslag && w.poule && w.thuis && w.uit).forEach(w => {
    const g = standen[w.poule];
    if (!g || !g[w.thuis] || !g[w.uit]) return;
    const odds = w.apiFixtureId ? (state.kansen[w.apiFixtureId] || null) : null;
    const res = gbSimMatch(w.thuis, w.uit, true, odds);
    if      (res === w.thuis) { g[w.thuis].pts += 3; g[w.thuis].gd += 1; g[w.uit].gd   -= 1; }
    else if (res === 'draw')  { g[w.thuis].pts += 1; g[w.uit].pts  += 1; }
    else                      { g[w.uit].pts   += 3; g[w.uit].gd   += 1; g[w.thuis].gd -= 1; }
  });
  return standen;
}

// Sorteer een groep op punten → doelsaldo → goals
function gbSortGroep(groepData) {
  return Object.entries(groepData)
    .sort(([, a], [, b]) => b.pts - a.pts || b.gd - a.gd || b.gs - a.gs)
    .map(([naam]) => naam);
}

// Bepaal bracket-slots na groepsfase (A1, A2, 3rd:0..7)
function gbBepaalSlots(standen) {
  const slots = {};
  const thirds = [];
  for (const [groep, data] of Object.entries(standen)) {
    const sorted = gbSortGroep(data);
    slots[groep + '1'] = sorted[0];
    slots[groep + '2'] = sorted[1];
    const t = data[sorted[2]];
    thirds.push({ naam: sorted[2], pts: t?.pts || 0, gd: t?.gd || 0, gs: t?.gs || 0 });
  }
  // Beste 8 derden
  thirds.sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gs - a.gs);
  thirds.slice(0, 8).forEach((t, i) => { slots['3rd:' + i] = t.naam; });
  return slots;
}

// Simuleer knockout-rondes; geeft terug hoe ver elk land komt
function gbSimKnockout(slots) {
  const faseGehaald = {};
  const winners = {};
  const nextFase = { '1/16': '1/8', '1/8': '1/4', '1/4': '1/2', '1/2': 'F', 'F': 'Winnaar' };

  Object.values(slots).forEach(naam => { if (naam) faseGehaald[naam] = '1/16'; });

  for (const match of GLAZENBOL_BRACKET) {
    const resolve = s => s.startsWith('w:') ? winners[s.slice(2)] : slots[s];
    const team1 = resolve(match.s1);
    const team2 = resolve(match.s2);
    if (!team1 || !team2) continue;
    const winner = gbSimMatch(team1, team2, false);
    winners[match.id] = winner;
    const next = nextFase[match.round];
    if (next) faseGehaald[winner] = next;
  }
  return faseGehaald;
}

// Speelkans van een speler op basis van gespeelde WK-wedstrijden.
// Fallback: keeper #1 = vrijwel zekere basisspeler; veldspelers: team-kracht-afhankelijk.
function gbSpeelkans(speler) {
  // 1. Historische match-data (meest accuraat zodra wedstrijden gespeeld zijn)
  const gespeeld = state.wedstrijden.filter(w =>
    w.uitslag && (w.thuis === speler.land || w.uit === speler.land)
  );
  if (gespeeld.length) {
    const norm = normNaam(speler.naam);
    const g45 = gespeeld.filter(w =>
      w.events?.some(e => e.type === 'gespeeld45' && normNaam(e.speler) === norm)
    ).length;
    return g45 / gespeeld.length;
  }

  // 2. Selectie-shirtnummer als proxy (shirt #1 = basiskeeper, hoge nummers = bankzitter)
  const land = state.landen.find(l => l.naam === speler.land);
  const sel = (land?.selectie || []).find(s => normNaam(s.naam) === normNaam(speler.naam));
  if (sel?.nummer != null) {
    if (speler.positie === 'K') {
      return sel.nummer === 1 ? 0.90 : 0.08;
    }
    // Veldspeler: shirtnummer 2-11 = waarschijnlijk basisspeler (klassieke WK-nummering)
    if (sel.nummer <= 11) return 0.82;
    if (sel.nummer <= 18) return 0.62;
    return 0.42;
  }

  // 3. Teamsterkte-gebaseerd: topteams (kracht ≥ 80) roteren minder in cruciale wedstrijden
  const k = TEAM_KRACHT[speler.land] || 50;
  if (k >= 80) return 0.75;
  if (k >= 65) return 0.70;
  return 0.62;
}

// Gemiddelde event-punten per wedstrijd dat de speler speelde.
// Fallback: basispunten per positie + verwachte resultaatpunten op basis van teamsterkte.
// Argentijnse middenvelder (~75% winrate) verwacht structureel meer poulewinst-punten
// dan een Belgische middenvelder (~47% winrate), zelfs als we geen matchdata hebben.
function gbGemEventPts(speler) {
  const norm = normNaam(speler.naam);
  const pos  = speler.positie;
  const gespeeldeMatches = state.wedstrijden.filter(w =>
    w.uitslag &&
    (w.thuis === speler.land || w.uit === speler.land) &&
    w.events?.some(e => e.type === 'gespeeld45' && normNaam(e.speler) === norm)
  );
  if (!gespeeldeMatches.length) {
    const k = TEAM_KRACHT[speler.land] || 50;
    // Puur event-bijdrage (goals, assists, cards) — positie-afhankelijk
    const baseEvt = { K: 1.5, V: 1.8, M: 2.0, A: 2.5 }[pos] || 2.0;
    // Verwachte resultaatpunten: teamsterkte → geschatte winrate → poulewinst + gelijkspel
    const winRate  = Math.min(0.78, Math.max(0.15, (k - 28) / 88));
    const drawRate = 0.22;
    const resultPts = winRate * (POINTS.poulewinst[pos] || 3)
                    + drawRate * (POINTS.gelijkspel[pos] || 1);
    return baseEvt + resultPts;
  }
  const totaal = gespeeldeMatches.reduce((sum, w) => {
    let pts = 0;
    (w.events || []).filter(e => normNaam(e.speler) === norm).forEach(e => {
      if (POINTS[e.type]) pts += POINTS[e.type][pos] || 0;
    });
    const thuis = w.thuis === speler.land;
    const won  = thuis ? w.uitslag.thuis > w.uitslag.uit : w.uitslag.uit > w.uitslag.thuis;
    const draw = w.uitslag.thuis === w.uitslag.uit;
    if (won)  pts += POINTS.poulewinst[pos]  || 0;
    if (draw) pts += POINTS.gelijkspel[pos]  || 0;
    return sum + pts;
  }, 0);
  return totaal / gespeeldeMatches.length;
}

// Simuleer awards als ze nog niet zijn vastgesteld
function gbSimAward() {
  const spelers = state.deelnemers.flatMap(d => d.spelers);
  function pick(weightFn) {
    const ws = spelers.map(weightFn);
    const tot = ws.reduce((a, b) => a + b, 0);
    let r = Math.random() * tot;
    for (let i = 0; i < spelers.length; i++) { r -= ws[i]; if (r <= 0) return spelers[i]; }
    return spelers[spelers.length - 1];
  }
  const goalCount = {};
  spelers.forEach(sp => {
    const n = normNaam(sp.naam);
    goalCount[n] = state.wedstrijden.reduce((cnt, w) =>
      cnt + (w.events?.filter(e => e.type === 'velddoelpunt' && normNaam(e.speler) === n).length || 0), 0);
  });
  return {
    topscorer:   state.awards.topscorer   || pick(sp => (goalCount[normNaam(sp.naam)] || 0) + 1),
    besteSpeler: state.awards.besteSpeler || pick(sp => Math.max(1, spelerPunten(sp)))
  };
}

// Bereken gesimuleerde totaalpunten per deelnemer
function gbPuntenDeelnemer(deelnemer, faseGehaald, simAward) {
  const faseVolgorde = ['1/16', '1/8', '1/4', '1/2', 'F', 'Winnaar'];
  return deelnemer.spelers.reduce((total, speler) => {
    // 1. Huidige punten (inclusief al verdiende bonussen)
    let pts = spelerPunten(speler);

    const speelkans = gbSpeelkans(speler);
    const gemEvt    = gbGemEventPts(speler);

    // 2a. Verwachte event-punten voor resterende groepswedstrijden
    const resterend = state.wedstrijden.filter(w =>
      !w.uitslag && (w.thuis === speler.land || w.uit === speler.land)
    ).length;
    // Rotatiekorting: bij sterke teams (kracht ≥ 65) hun laatste groepsmatch
    let effectiefKans = speelkans;
    const isLaatsteGroep = resterend === 1 &&
      state.wedstrijden.some(w => !w.uitslag && w.poule &&
        (w.thuis === speler.land || w.uit === speler.land));
    if (isLaatsteGroep && speelkans > 0.60 && (TEAM_KRACHT[speler.land] || 0) >= 65) {
      effectiefKans = Math.max(0.40, speelkans - 0.15);
    }
    pts += effectiefKans * gemEvt * resterend;

    // 2b. Verwachte event-punten voor knockout-wedstrijden
    // Elk team speelt 1 wedstrijd per KO-ronde. faseGehaald bepaalt hoeveel rondes.
    // Al verwerkte KO-rondes zijn al meegenomen in spelerPunten() — die tellen we NIET opnieuw.
    const gesimFase = faseGehaald[speler.land];
    if (gesimFase) {
      let vastKO = 0;
      let vastIdx = -1;
      for (const [fase, teams] of Object.entries(state.fases.landenPerFase)) {
        if (teams.includes(speler.land)) {
          vastKO = Math.max(vastKO, GB_KO_MATCHES[fase] || 0);
          const idx = faseVolgorde.indexOf(fase);
          if (idx > vastIdx) vastIdx = idx;
        }
      }
      const restKO = Math.max(0, (GB_KO_MATCHES[gesimFase] || 0) - vastKO);
      pts += speelkans * gemEvt * restKO;

      // 3. Toekomstige fase-bonussen (boven al verdiend niveau)
      const gesimIdx = faseVolgorde.indexOf(gesimFase);
      for (let i = Math.max(0, vastIdx + 1); i <= gesimIdx; i++) {
        pts += FASEBONUS[faseVolgorde[i]] || 0;
      }
    }

    // 4. Award-bonus (alleen als nog niet vastgesteld)
    const normSp = normNaam(speler.naam);
    if (!state.awards.topscorer &&
        simAward.topscorer?.land === speler.land &&
        normNaam(simAward.topscorer.naam) === normSp) {
      pts += AWARD_BONUS;
    }
    if (!state.awards.besteSpeler &&
        simAward.besteSpeler?.land === speler.land &&
        normNaam(simAward.besteSpeler.naam) === normSp) {
      pts += AWARD_BONUS;
    }

    return total + pts;
  }, 0);
}

// Hoofd-functie: berekenGlazenBol(nSims) → gesorteerde kansen per deelnemer
function berekenGlazenBol(nSims = 1000) {
  const winTeller = {};
  const totaalPts = {};
  state.deelnemers.forEach(d => { winTeller[d.naam] = 0; totaalPts[d.naam] = 0; });

  const basisStanden = gbGroepStanden();
  const faseVolgorde = ['1/16', '1/8', '1/4', '1/2', 'F', 'Winnaar'];

  for (let i = 0; i < nSims; i++) {
    const standen     = gbSimRestGroepsfase(basisStanden);
    const slots       = gbBepaalSlots(standen);
    const faseGehaald = gbSimKnockout(slots);

    // Zeker vastgestelde fases overschrijven de simulatie (al bevestigd)
    for (const [fase, teams] of Object.entries(state.fases.landenPerFase)) {
      teams.forEach(naam => {
        const huidig = faseGehaald[naam];
        if (!huidig || faseVolgorde.indexOf(fase) > faseVolgorde.indexOf(huidig)) {
          faseGehaald[naam] = fase;
        }
      });
    }

    const simAward = gbSimAward();
    const scores   = state.deelnemers.map(d => ({
      naam:   d.naam,
      punten: gbPuntenDeelnemer(d, faseGehaald, simAward)
    }));
    scores.forEach(s => { totaalPts[s.naam] += s.punten; });
    const max    = Math.max(...scores.map(s => s.punten));
    const gewin  = scores.filter(s => s.punten === max);
    gewin.forEach(w => { winTeller[w.naam] += 1 / gewin.length; });
  }

  return state.deelnemers.map(d => ({
    naam:          d.naam,
    huidigePunten: deelnemerPunten(d),
    gemPunten:     Math.round(totaalPts[d.naam] / nSims),
    kans:          +(winTeller[d.naam] / nSims * 100).toFixed(1)
  })).sort((a, b) => b.kans - a.kans);
}

// Teamsamenstelling per deelnemer: gesorteerd op kracht, voor toelichting
function gbTeamComp(deelnemerNaam) {
  const d = state.deelnemers.find(x => x.naam === deelnemerNaam);
  if (!d) return '';
  const byLand = {};
  for (const sp of d.spelers) {
    byLand[sp.land] = (byLand[sp.land] || 0) + 1;
  }
  return Object.entries(byLand)
    .sort(([la], [lb]) => (TEAM_KRACHT[lb] || 50) - (TEAM_KRACHT[la] || 50))
    .map(([land, n]) => {
      const k = TEAM_KRACHT[land] || 50;
      const vlag = findVlag(land);
      const kleur = k >= 80 ? '#b49222' : k >= 65 ? '#888' : '#555';
      return `<span class="gb-land" title="${land} (kracht ${k})">${vlag}&nbsp;<span style="color:${kleur};font-size:0.7rem;font-weight:600">${k}</span>&thinsp;<span style="opacity:.7">×${n}</span></span>`;
    }).join('<span style="opacity:.3;padding:0 3px">·</span>');
}

// ──────────────────────────────────────────────────────────────────
// Footer
// ──────────────────────────────────────────────────────────────────
function renderFooter() {
  const pot = state.deelnemers.length * INLEG_PER_DEELNEMER;
  document.getElementById("prizePotFooter").textContent = state.deelnemers.length
    ? `€${pot} verdeeld over ${state.deelnemers.length} deelnemers. 1e €${Math.round(pot*0.6)} · 2e €${Math.round(pot*0.3)} · 3e €${Math.round(pot*0.1)}.`
    : "Pot wordt berekend zodra deelnemers zijn ingeschreven.";
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────
function findVlag(landNaam) {
  const l = state.landen.find(x => x.naam === landNaam);
  return l ? l.vlag : "🏳️";
}

function findCode(landNaam) {
  const l = state.landen.find(x => x.naam === landNaam);
  return l ? l.code : landNaam.slice(0, 3).toUpperCase();
}


function groupBy(arr, fn) {
  return arr.reduce((acc, x) => {
    const k = fn(x);
    (acc[k] = acc[k] || []).push(x);
    return acc;
  }, {});
}

function formatShortDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function toast(msg, duur = 2200) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("is-visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("is-visible"), duur);
}
