/* Analyse: levert elke positie (K/V/M/A) gemiddeld evenveel punten op
 * in de WK 2022-simulatie onder het huidige reglement?
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(__dirname, "..", "data");

const deelnemers  = JSON.parse(readFileSync(resolve(DATA, "deelnemers.json"), "utf8")).deelnemers;
const wedstrijden = JSON.parse(readFileSync(resolve(DATA, "wedstrijden.json"), "utf8")).wedstrijden;
const fases       = JSON.parse(readFileSync(resolve(DATA, "fases.json"), "utf8"));
const awards      = JSON.parse(readFileSync(resolve(DATA, "awards.json"), "utf8"));

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
const FASEBONUS = { "1/16": 0, "1/8": 3, "1/4": 3, "1/2": 5, "F": 5, "Winnaar": 5 };
const AWARD_BONUS = 10;

function breakdownSpeler(speler) {
  const pos = speler.positie;
  const b = {
    gespeeld45: 0, poulewinst: 0, gelijkspel: 0,
    velddoelpunt: 0, assist: 0, strafschop: 0,
    cleanSheet45: 0, tegendoelpunt: 0,
    geleKaart: 0, directeRood: 0, eigenGoal: 0,
    fase: 0, award: 0
  };

  for (const w of wedstrijden) {
    if (w.status !== "verwerkt" || !Array.isArray(w.events)) continue;
    const evs = w.events.filter(e => e.speler === speler.naam);
    if (evs.length === 0) continue;

    const gespeeld45 = evs.some(e => e.type === "gespeeld45");
    const cleanSheet = evs.some(e => e.type === "cleanSheet45");
    const tegenCount = evs.filter(e => e.type === "tegendoelpunt").length;

    if (gespeeld45 && w.uitslag) {
      b.gespeeld45 += POINTS.gespeeld45[pos] ?? 0;
      if (w.poule) {
        const isThuis = w.thuis === speler.land;
        const isUit   = w.uit   === speler.land;
        if (isThuis || isUit) {
          const eigen = isThuis ? w.uitslag.thuis : w.uitslag.uit;
          const tegen = isThuis ? w.uitslag.uit   : w.uitslag.thuis;
          if (eigen > tegen)       b.poulewinst += POINTS.poulewinst[pos] ?? 0;
          else if (eigen === tegen) b.gelijkspel += POINTS.gelijkspel[pos] ?? 0;
        }
      }
    }
    if (cleanSheet)    b.cleanSheet45  += POINTS.cleanSheet45[pos]  ?? 0;
    if (tegenCount>0)  b.tegendoelpunt += tegenCount * (POINTS.tegendoelpunt[pos] ?? 0);

    for (const ev of evs) {
      if (ev.type === "velddoelpunt") b.velddoelpunt += POINTS.velddoelpunt[pos];
      if (ev.type === "assist")       b.assist       += POINTS.assist[pos];
      if (ev.type === "strafschop")   b.strafschop   += POINTS.strafschop[pos];
      if (ev.type === "geleKaart")    b.geleKaart    += POINTS.geleKaart[pos];
      if (ev.type === "directeRood")  b.directeRood  += POINTS.directeRood[pos];
      if (ev.type === "eigenGoal")    b.eigenGoal    += POINTS.eigenGoal[pos];
    }
  }

  for (const [fase, landen] of Object.entries(fases.landenPerFase || {})) {
    if (landen.includes(speler.land)) b.fase += FASEBONUS[fase] ?? 0;
  }
  if (awards.topscorer   && awards.topscorer.naam   === speler.naam && awards.topscorer.land   === speler.land) b.award += AWARD_BONUS;
  if (awards.besteSpeler && awards.besteSpeler.naam === speler.naam && awards.besteSpeler.land === speler.land) b.award += AWARD_BONUS;

  return b;
}

const alleSpelers = deelnemers.flatMap(d => d.spelers);

const perPositie = { K: [], V: [], M: [], A: [] };
for (const sp of alleSpelers) {
  const b = breakdownSpeler(sp);
  const totaal = Object.values(b).reduce((a,c)=>a+c, 0);
  perPositie[sp.positie].push({ speler: sp, totaal, b });
}

function stats(arr) {
  const n = arr.length;
  const sum = arr.reduce((a,c)=>a+c.totaal, 0);
  const mean = sum / n;
  const sorted = [...arr].map(x=>x.totaal).sort((a,b)=>a-b);
  const median = n%2 ? sorted[(n-1)/2] : (sorted[n/2-1] + sorted[n/2]) / 2;
  return { n, sum, mean, median, min: sorted[0], max: sorted[n-1] };
}

function meanOfField(arr, key) {
  return arr.reduce((a,c)=>a+c.b[key], 0) / arr.length;
}

console.log("\n═════ WK 2022-simulatie · balans-analyse per positie ═════\n");

const order = ["K","V","M","A"];
console.log("Positie   n    totaal   gem     median   min   max");
for (const p of order) {
  const s = stats(perPositie[p]);
  console.log(
    `  ${p}     ${String(s.n).padStart(2)}  ${String(s.sum).padStart(6)}   ` +
    `${s.mean.toFixed(1).padStart(5)}   ${String(s.median).padStart(5)}   ` +
    `${String(s.min).padStart(3)}   ${String(s.max).padStart(3)}`
  );
}

console.log("\n─── Gemiddelde bijdrage per puntencategorie (per speler) ───\n");
const cats = ["gespeeld45","poulewinst","gelijkspel","velddoelpunt","assist","strafschop","cleanSheet45","tegendoelpunt","geleKaart","directeRood","eigenGoal","fase","award"];
console.log("Categorie         K       V       M       A");
for (const c of cats) {
  const row = order.map(p => meanOfField(perPositie[p], c).toFixed(2).padStart(6));
  console.log(`  ${c.padEnd(16)} ${row.join("  ")}`);
}

console.log("\n─── Top-5 per positie ───\n");
for (const p of order) {
  console.log(`  ${p}:`);
  [...perPositie[p]].sort((a,b)=>b.totaal-a.totaal).slice(0,5).forEach(x => {
    console.log(`    ${String(x.totaal).padStart(4)}  ${x.speler.naam}  (${x.speler.land})`);
  });
}

console.log("\n─── Spreiding: aantal spelers onder 0 / 0-15 / 15-30 / 30+ ───\n");
for (const p of order) {
  const arr = perPositie[p].map(x=>x.totaal);
  const neg = arr.filter(v=>v<0).length;
  const laag = arr.filter(v=>v>=0 && v<15).length;
  const mid  = arr.filter(v=>v>=15 && v<30).length;
  const hoog = arr.filter(v=>v>=30).length;
  console.log(`  ${p}   <0: ${neg}   0–15: ${laag}   15–30: ${mid}   30+: ${hoog}`);
}
