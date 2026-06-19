// check-verbanden.js — kruist deelnemers.json × landen.json
// Gebruik: node scripts/check-verbanden.js

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const { deelnemers } = JSON.parse(fs.readFileSync(path.join(dataDir, 'deelnemers.json'), 'utf8'));
const { landen }     = JSON.parse(fs.readFileSync(path.join(dataDir, 'landen.json'), 'utf8'));

// Identiek aan normNaam() in app.js
function normNaam(s) {
  return String(s ?? '').normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[''`]+/g, '')          // apostrofs verwijderen: O'Reilly → Oreilly
    .replace(/[.\-]+/g, ' ')         // punt/koppelteken → spatie
    .replace(/\s+/g, ' ')
    .trim();
}

// Identiek aan naammatch() in app.js
function naammatch(eventNaam, spelerNaam) {
  if (!eventNaam || !spelerNaam) return false;
  if (eventNaam === spelerNaam) return true;
  const ne = normNaam(eventNaam);
  const ns = normNaam(spelerNaam);
  if (ne === ns) return true;
  // "Edson Álvarez" → "E. Álvarez"; "Jan Paul van Hecke" → "J. van Hecke"
  const parts = eventNaam.trim().split(/\s+/);
  if (parts.length >= 2) {
    for (let i = 1; i < parts.length; i++) {
      const abbreviated = parts[0][0] + '. ' + parts.slice(i).join(' ');
      if (normNaam(abbreviated) === ns) return true;
    }
  }
  // Mononym: "Pablo Gavi" → "Gavi"
  if (!ns.includes(' ')) {
    const lastWord = normNaam(parts[parts.length - 1]);
    if (lastWord === ns) return true;
  }
  return false;
}

// Bouw een lookup: landnaam → array van spelersnamen
const selectieLookup = {};
for (const land of landen) {
  selectieLookup[land.naam] = (land.selectie || []).map(s => s.naam);
}

const NIET_GEVONDEN = [];
const GEVONDEN = [];

for (const d of deelnemers) {
  // Alle actieve spelers (na wissels)
  const actief = [...(d.spelers || [])];
  for (const w of (d.wissels || [])) {
    if (w.uit && w.land_uit) {
      const idx = actief.findIndex(s => naammatch(s.naam, w.uit) && s.land === w.land_uit);
      if (idx !== -1) actief.splice(idx, 1);
    }
    if (w.in && w.land_in) {
      actief.push({ naam: w.in, land: w.land_in, positie: w.positie_in });
    }
  }

  for (const speler of actief) {
    const kandidaten = selectieLookup[speler.land];
    if (!kandidaten) {
      NIET_GEVONDEN.push({ deelnemer: d.naam, speler: speler.naam, land: speler.land, reden: 'Land niet gevonden in landen.json' });
      continue;
    }
    // Probeer exacte naam-match (naammatch: draftNaam vs selectieNaam)
    const match = kandidaten.find(k => naammatch(k, speler.naam));
    if (match) {
      GEVONDEN.push({ deelnemer: d.naam, speler: speler.naam, land: speler.land, match });
    } else {
      // Zoek de dichtstbijzijnde naam voor diagnosedoeleinden
      const normSpeler = normNaam(speler.naam);
      const dichtbij = kandidaten
        .map(k => ({ naam: k, score: gelijkenis(normNaam(k), normSpeler) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 3)
        .map(x => `"${x.naam}" (${Math.round(x.score * 100)}%)`);
      NIET_GEVONDEN.push({
        deelnemer: d.naam,
        speler: speler.naam,
        land: speler.land,
        reden: 'Geen naammatch',
        suggesties: dichtbij
      });
    }
  }
}

// Eenvoudige Levenshtein-gelijkenis (0–1)
function gelijkenis(a, b) {
  if (a === b) return 1;
  const m = a.length, n = b.length;
  if (m === 0 || n === 0) return 0;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return 1 - dp[m][n] / Math.max(m, n);
}

// ── Rapport ─────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════');
console.log('  WK Draft 2026 — Verbandcontrole');
console.log('══════════════════════════════════════════════════\n');
console.log(`✓ Gevonden:      ${GEVONDEN.length}`);
console.log(`✗ Niet gevonden: ${NIET_GEVONDEN.length}\n`);

if (NIET_GEVONDEN.length === 0) {
  console.log('✅ Alle spelers matchen exact. Geen problemen.\n');
} else {
  console.log('── Probleemspelers ─────────────────────────────────\n');
  for (const item of NIET_GEVONDEN) {
    console.log(`  ✗ ${item.deelnemer.padEnd(12)} | ${item.land.padEnd(16)} | "${item.speler}"`);
    console.log(`     Reden: ${item.reden}`);
    if (item.suggesties) {
      console.log(`     Suggesties: ${item.suggesties.join(', ')}`);
    }
    console.log();
  }
}

// Wissels-check
console.log('── Wissels ─────────────────────────────────────────\n');
let wisselOk = true;
for (const d of deelnemers) {
  for (const w of (d.wissels || [])) {
    const uitKandidaten = selectieLookup[w.land_uit] || [];
    const inKandidaten  = selectieLookup[w.land_in]  || [];
    const uitMatch = uitKandidaten.find(k => naammatch(k, w.uit));
    const inMatch  = inKandidaten.find(k  => naammatch(k, w.in));
    if (!uitMatch) { console.log(`  ✗ ${d.naam} – wissel UIT niet gevonden: "${w.uit}" (${w.land_uit})`); wisselOk = false; }
    if (!inMatch)  { console.log(`  ✗ ${d.naam} – wissel IN niet gevonden:  "${w.in}" (${w.land_in})`);  wisselOk = false; }
  }
}
if (wisselOk) console.log('  ✓ Alle wissels kloppen.\n');

// Dubbeltellingcheck: zelfde speler bij meerdere deelnemers?
console.log('── Dubbeltellingen ─────────────────────────────────\n');
const keyMap = new Map();
let dubbelOk = true;
for (const d of deelnemers) {
  for (const s of (d.spelers || [])) {
    const key = normNaam(s.naam) + '|' + normNaam(s.land);
    if (keyMap.has(key)) {
      console.log(`  ✗ Dubbel: "${s.naam}" (${s.land}) bij ZOWEL ${keyMap.get(key)} ALS ${d.naam}`);
      dubbelOk = false;
    } else {
      keyMap.set(key, d.naam);
    }
  }
}
if (dubbelOk) console.log('  ✓ Geen dubbele picks.\n');

console.log('══════════════════════════════════════════════════\n');
