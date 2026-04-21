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
  gespeeld45:    { K:  3, V:  2, M:  2, A:  1 },
  poulewinst:    { K:  3, V:  3, M:  3, A:  3 },
  gelijkspel:    { K:  1, V:  1, M:  1, A:  1 },
  velddoelpunt:  { K:  6, V:  5, M:  4, A:  4 },
  assist:        { K:  4, V:  3, M:  2, A:  2 },
  strafschop:    { K:  1, V:  1, M:  1, A:  1 },
  cleanSheet45:  { K:  2, V:  2, M:  1, A:  0 },
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

const POS_LABEL = { K: "Keeper", V: "Verdediger", M: "Middenvelder", A: "Aanvaller" };

// ──────────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────────
const state = {
  landen: [],
  deelnemers: [],
  wedstrijden: [],
  fases: { landenPerFase: { "1/16": [], "1/8": [], "1/4": [], "1/2": [], "F": [], "Winnaar": [] } },
  awards: { topscorer: null, besteSpeler: null }
};

const LS_KEYS = {
  deelnemers: "wk26.deelnemers",
  wedstrijden: "wk26.wedstrijden",
  fases: "wk26.fases",
  awards: "wk26.awards"
};

// Bump bij elke data-migratie om oude localStorage te wissen
const DATA_VERSION = "wk2026.1";

const WK_START = new Date("2026-06-11T18:00:00Z");

// ──────────────────────────────────────────────────────────────────
// Init
// ──────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);

async function init() {
  await loadAllData();
  renderAll();
  wireNav();
  wireEvents();
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

    const [wRes, eRes, sRes] = await Promise.all([
      client.from("wk2026_wedstrijden").select("*"),
      client.from("wk2026_events").select("*"),
      client.from("wk2026_selecties").select("*")
    ]);

    if (!wRes.error && Array.isArray(wRes.data) && wRes.data.length) {
      const eventsByFix = {};
      for (const ev of (eRes.data || [])) {
        (eventsByFix[ev.api_fixture_id] = eventsByFix[ev.api_fixture_id] || []).push({
          speler: ev.speler, type: ev.type, detail: ev.detail
        });
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
}

// ──────────────────────────────────────────────────────────────────
// Puntenberekening (de scheidsrechter in code)
// ──────────────────────────────────────────────────────────────────
function berekenSpelerPunten(spelerNaam, deelnemerSpelers) {
  const speler = deelnemerSpelers.find(s => s.naam === spelerNaam);
  if (!speler) return 0;
  return spelerPunten(speler);
}

function spelerPunten(speler) {
  const pos = speler.positie;
  let pts = 0;

  // Events per wedstrijd
  for (const w of state.wedstrijden) {
    if (w.status !== "verwerkt" || !Array.isArray(w.events)) continue;
    const evs = w.events.filter(e => e.speler === speler.naam);
    if (evs.length === 0) continue;

    // Uitslag-afhankelijke punten (gespeeld 45+, winst, gelijk, cleansheet, tegendoelpunten)
    const gespeeld45 = evs.some(e => e.type === "gespeeld45");
    const cleanSheet = evs.some(e => e.type === "cleanSheet45");
    const tegendoelpunten = evs.filter(e => e.type === "tegendoelpunt").length;

    // Bepaal winst/gelijk/verlies uit uitslag + speler's land
    if (gespeeld45 && w.uitslag) {
      pts += POINTS.gespeeld45[pos] ?? 0;
      const { poule } = w;
      const isThuis = w.thuis === speler.land;
      const isUit = w.uit === speler.land;
      if (poule && (isThuis || isUit)) {
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
  return deelnemer.spelers.reduce((sum, sp) => sum + spelerPunten(sp), 0);
}

// Detailed breakdown: per-match contributions + fase + awards
function spelerBreakdown(speler) {
  const pos = speler.positie;
  const perMatch = [];

  for (const w of state.wedstrijden) {
    if (w.status !== "verwerkt" || !Array.isArray(w.events)) continue;
    const evs = w.events.filter(e => e.speler === speler.naam);
    if (evs.length === 0) continue;

    const lines = [];
    let subtotal = 0;
    const gespeeld45 = evs.some(e => e.type === "gespeeld45");
    const cleanSheet = evs.some(e => e.type === "cleanSheet45");
    const tegenCount = evs.filter(e => e.type === "tegendoelpunt").length;

    if (gespeeld45 && w.uitslag) {
      const p = POINTS.gespeeld45[pos] ?? 0;
      lines.push({ label: `Gespeeld ≥45 min`, pts: p });
      subtotal += p;
      if (w.poule) {
        const isThuis = w.thuis === speler.land;
        const isUit = w.uit === speler.land;
        if (isThuis || isUit) {
          const eigen = isThuis ? w.uitslag.thuis : w.uitslag.uit;
          const tegen = isThuis ? w.uitslag.uit : w.uitslag.thuis;
          if (eigen > tegen) {
            const p = POINTS.poulewinst[pos] ?? 0;
            lines.push({ label: `Gewonnen poule`, pts: p });
            subtotal += p;
          } else if (eigen === tegen) {
            const p = POINTS.gelijkspel[pos] ?? 0;
            lines.push({ label: `Gelijkspel`, pts: p });
            subtotal += p;
          }
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
      perMatch.push({ wedstrijd: w, lines, subtotal });
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
    perMatch.reduce((s, m) => s + m.subtotal, 0) +
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
    let spelerActief = false;
    for (const w of state.wedstrijden) {
      if (w.status !== "verwerkt" || !Array.isArray(w.events)) continue;
      const evs = w.events.filter(e => e.speler === sp.naam);
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
  renderFooter();
}

// ──────────────────────────────────────────────────────────────────
// Overzicht (landing)
// ──────────────────────────────────────────────────────────────────
function renderOverzicht() {
  renderStats();
  renderPodium();
  renderSpeelschema();
  renderLandenGrid();
  renderSelectiesTeaser();
  renderSelecties();
  renderCountdown();
}

function renderSelectiesTeaser() {
  const el = document.getElementById("selectiesTeaser");
  if (!el) return;
  const compleet = state.landen.filter(l => (l.selectie || []).length >= 26).length;
  const totaal = state.landen.length || 48;
  const progress = Math.round((compleet / totaal) * 100);

  const status = compleet === 0
    ? `<strong>Nog geen</strong> selecties bekend`
    : `<strong>${compleet}</strong> van de ${totaal} landen heeft de selectie ingeleverd`;

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
  const stats = document.getElementById("overzichtStats");
  if (!stats) return;

  const pot = state.deelnemers.length * INLEG_PER_DEELNEMER;
  const verwerkt = state.wedstrijden.filter(w => w.status === "verwerkt").length;
  const selectiesCompleet = state.landen.filter(l => (l.selectie || []).length >= 26).length;
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
    { label: "Achtste finale",      datum: "4 – 7 juli",     aantal: "8 wedstrijden",  note: "+3 p.p. voor gedrafte spelers" },
    { label: "Kwartfinales",        datum: "9 – 11 juli",    aantal: "4 wedstrijden",  note: "+3 p.p." },
    { label: "Halve finales",       datum: "14 – 15 juli",   aantal: "2 wedstrijden",  note: "+5 p.p." },
    { label: "Strijd om derde",     datum: "18 juli",        aantal: "1 wedstrijd",    note: "" },
    { label: "Finale",              datum: "19 juli",        aantal: "MetLife, New York", note: "+5 p.p. · Winnaar +5 p.p." }
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
  const landenMetSelectie = state.landen.filter(l => (l.selectie || []).length > 0);
  const compleet = state.landen.filter(l => (l.selectie || []).length >= 26).length;
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

  const pillen = state.landen.map(l => {
    const sel = l.selectie || [];
    const isReady = sel.length >= 26;
    const cls = isReady ? "selectie-land is-ready" : (sel.length > 0 ? "selectie-land is-partial" : "selectie-land is-pending");
    const badge = isReady ? "✓" : (sel.length > 0 ? `${sel.length}/26` : "—");
    return `
      <details class="${cls}">
        <summary>
          <span class="selectie-land__flag">${l.vlag}</span>
          <span class="selectie-land__name">${escapeHtml(l.naam)}</span>
          <span class="selectie-land__group mono">${escapeHtml(l.groep || "")}</span>
          <span class="selectie-land__badge mono">${badge}</span>
        </summary>
        <ol class="selectie-list">
          ${sel.map(s => `
            <li>
              ${s.nummer ? `<span class="sel-num mono">${s.nummer}</span>` : `<span class="sel-num"></span>`}
              <span class="sel-pos">${escapeHtml(s.positie || "")}</span>
              <span class="sel-name">${escapeHtml(s.naam)}</span>
            </li>`).join("") || '<li class="italic" style="color:var(--ink-mute)">Selectie nog niet bekend</li>'}
        </ol>
      </details>
    `;
  }).join("");

  el.innerHTML = `
    <div class="selecties__header">
      <div class="selecties__progress-label">Selecties bekend: <strong>${compleet}</strong> / ${totaal} landen${updatedStr}</div>
      <div class="selecties__progress-bar"><div class="selecties__progress-fill" style="width:${progress}%"></div></div>
    </div>
    <div class="selecties__grid">${pillen}</div>
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
    const playersByPos = groupBy(d.spelers || [], s => s.positie);
    const ordered = ["K","V","M","A"].flatMap(pos => (playersByPos[pos] || []));

    const playerRows = ordered.map(sp => {
      const vlag = findVlag(sp.land);
      const spPts = spelerPunten(sp);
      const ptsStr = spPts === 0 ? "0" : (spPts > 0 ? `+${spPts}` : `${spPts}`);
      return `
        <li class="player-line" data-speler="${escapeHtml(sp.naam)}" data-land="${escapeHtml(sp.land)}" tabindex="0" role="button">
          <span class="player-line__pos player-line__pos--${sp.positie}" title="${escapeHtml(POS_LABEL[sp.positie] || sp.positie)}">${sp.positie}</span>
          <span class="player-line__flag">${vlag}</span>
          <span class="player-line__name">${escapeHtml(sp.naam)}</span>
          <span class="player-line__meta">${escapeHtml(sp.land)}</span>
          <span class="player-line__pts ${spPts < 0 ? 'is-neg' : ''}">${ptsStr}</span>
          <span class="player-line__chev" aria-hidden="true">→</span>
        </li>
      `;
    }).join("");

    return `
      <article class="team-row">
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
function renderWedstrijden() {
  const list = document.getElementById("wedstrijdenList");
  const empty = document.getElementById("wedstrijdenEmpty");

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
      lookup[sp.naam] = { ...sp, deelnemer: d.naam };
    }
  }

  list.innerHTML = sorted.map(w => {
    const datum = formatShortDate(w.datum);
    const thuisVlag = findVlag(w.thuis);
    const uitVlag = findVlag(w.uit);
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
        const vlag = findVlag(c.speler.land);
        const lineStr = c.lines.map(l => `${l.label} <b>${l.pts > 0 ? '+' : ''}${l.pts}</b>`).join(" · ");
        const ptsCls = c.subtotal < 0 ? "is-neg" : (c.subtotal > 0 ? "is-pos" : "");
        return `
          <li class="contrib">
            <span class="contrib__pos contrib__pos--${c.speler.positie}">${c.speler.positie}</span>
            <span class="contrib__flag">${vlag}</span>
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
            <span class="match-row__flag">${thuisVlag}</span>
            <span class="match-row__team">${escapeHtml(w.thuis)}</span>
            <span class="match-row__score mono">${score}${pensLabel}</span>
            <span class="match-row__team">${escapeHtml(w.uit)}</span>
            <span class="match-row__flag">${uitVlag}</span>
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

// Compute per-match contribution for every drafted player who had events
function computeMatchContribs(w, lookup) {
  if (!w.events || w.events.length === 0) return [];
  const bySpeler = {};
  for (const ev of w.events) {
    (bySpeler[ev.speler] = bySpeler[ev.speler] || []).push(ev);
  }

  const results = [];
  for (const [spelerNaam, evs] of Object.entries(bySpeler)) {
    const info = lookup[spelerNaam];
    if (!info) continue;
    const pos = info.positie;
    const lines = [];
    let subtotal = 0;

    const gespeeld45 = evs.some(e => e.type === "gespeeld45");
    const cleanSheet = evs.some(e => e.type === "cleanSheet45");
    const tegenCount = evs.filter(e => e.type === "tegendoelpunt").length;

    if (gespeeld45 && w.uitslag) {
      const p = POINTS.gespeeld45[pos] ?? 0;
      lines.push({ label: "Gespeeld", pts: p });
      subtotal += p;
      if (w.poule) {
        const isThuis = w.thuis === info.land;
        const isUit = w.uit === info.land;
        if (isThuis || isUit) {
          const eigen = isThuis ? w.uitslag.thuis : w.uitslag.uit;
          const tegen = isThuis ? w.uitslag.uit : w.uitslag.thuis;
          if (eigen > tegen) {
            const pp = POINTS.poulewinst[pos] ?? 0;
            lines.push({ label: "Winst", pts: pp });
            subtotal += pp;
          } else if (eigen === tegen) {
            const pp = POINTS.gelijkspel[pos] ?? 0;
            lines.push({ label: "Gelijk", pts: pp });
            subtotal += pp;
          }
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

  // Global click / keyboard delegate for opening player modal
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-speler]");
    if (trigger) {
      e.preventDefault();
      openSpelerModal(trigger.dataset.speler, trigger.dataset.land);
    }
    if (e.target.closest(".modal__close") || e.target.classList?.contains("modal__backdrop")) {
      closeSpelerModal();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSpelerModal();
    if ((e.key === "Enter" || e.key === " ") && document.activeElement?.matches("[data-speler]")) {
      e.preventDefault();
      const t = document.activeElement;
      openSpelerModal(t.dataset.speler, t.dataset.land);
    }
  });
}

// ──────────────────────────────────────────────────────────────────
// Speler-modal
// ──────────────────────────────────────────────────────────────────
function openSpelerModal(naam, land) {
  const speler = findSpelerInTeams(naam, land);
  if (!speler) { toast(`Speler ${naam} niet gevonden`); return; }

  const bd = spelerBreakdown(speler);
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
        return `
          <tr>
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

function findSpelerInTeams(naam, land) {
  for (const d of state.deelnemers) {
    for (const sp of (d.spelers || [])) {
      if (sp.naam === naam && (!land || sp.land === land)) {
        return { ...sp, _deelnemer: d.naam };
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

function toast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("is-visible");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("is-visible"), 2200);
}
