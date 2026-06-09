/* ═══════════════════════════════════════════════════════════════════
   WK 2026 — simulator.js
   Bracket-simulator: groepsfase → derden → knock-out
   Afhankelijk van: state.landen (geladen door app.js init)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────
  const SIM = {
    groepen: {},   // { A: ['Mexico', 'Zuid-Afrika', ...], ... }
    derden:  [],   // geordende lijst geselecteerde derden (max 8)
    winners: {},   // { matchId: landNaam }
    stap:    1,    // 1 | 2 | 3
  };

  let simLanden = [];   // geladen uit data/landen.json

  const LS_KEY = 'wk26.simulator';

  // ── Bracket definitie — officieel FIFA WK 2026 schema ────────────
  // Bron: Wikipedia 2026 FIFA World Cup knockout stage (wedstrijden 73-104)
  // s1/s2: 'XN' = groep X positie N (1-based)
  //        '3rd:N' = Nth geselecteerde derde (volgorde van keuze stap 2)
  //        'w:id'  = winnaar van match <id>
  //
  // 3rd:0 → m74 (vs 1E) | 3rd:1 → m77 (vs 1I) | 3rd:2 → m81 (vs 1D)
  // 3rd:3 → m82 (vs 1G) | 3rd:4 → m79 (vs 1A) | 3rd:5 → m80 (vs 1L)
  // 3rd:6 → m85 (vs 1B) | 3rd:7 → m87 (vs 1K)
  const BRACKET_DEF = [
    // ── 1/16 Finale ── gesorteerd in 8 paren zodat de visuele boom klopt
    // Paar 1 → Achtste M89 → Kwart M97 → Halve M101
    { id: 'm74', round: '1/16', s1: 'E1', s2: '3rd:0' },   // wed.74: 1E vs 3e
    { id: 'm77', round: '1/16', s1: 'I1', s2: '3rd:1' },   // wed.77: 1I vs 3e
    // Paar 2 → Achtste M90 → Kwart M97 → Halve M101
    { id: 'm73', round: '1/16', s1: 'A2', s2: 'B2'    },   // wed.73: 2A vs 2B
    { id: 'm75', round: '1/16', s1: 'F1', s2: 'C2'    },   // wed.75: 1F vs 2C
    // Paar 3 → Achtste M93 → Kwart M98 → Halve M101
    { id: 'm83', round: '1/16', s1: 'K2', s2: 'L2'    },   // wed.83: 2K vs 2L
    { id: 'm84', round: '1/16', s1: 'H1', s2: 'J2'    },   // wed.84: 1H vs 2J
    // Paar 4 → Achtste M94 → Kwart M98 → Halve M101
    { id: 'm81', round: '1/16', s1: 'D1', s2: '3rd:2' },   // wed.81: 1D vs 3e
    { id: 'm82', round: '1/16', s1: 'G1', s2: '3rd:3' },   // wed.82: 1G vs 3e
    // Paar 5 → Achtste M91 → Kwart M99 → Halve M102
    { id: 'm76', round: '1/16', s1: 'C1', s2: 'F2'    },   // wed.76: 1C vs 2F
    { id: 'm78', round: '1/16', s1: 'E2', s2: 'I2'    },   // wed.78: 2E vs 2I
    // Paar 6 → Achtste M92 → Kwart M99 → Halve M102
    { id: 'm79', round: '1/16', s1: 'A1', s2: '3rd:4' },   // wed.79: 1A vs 3e
    { id: 'm80', round: '1/16', s1: 'L1', s2: '3rd:5' },   // wed.80: 1L vs 3e
    // Paar 7 → Achtste M95 → Kwart M100 → Halve M102
    { id: 'm86', round: '1/16', s1: 'J1', s2: 'H2'    },   // wed.86: 1J vs 2H
    { id: 'm88', round: '1/16', s1: 'D2', s2: 'G2'    },   // wed.88: 2D vs 2G
    // Paar 8 → Achtste M96 → Kwart M100 → Halve M102
    { id: 'm85', round: '1/16', s1: 'B1', s2: '3rd:6' },   // wed.85: 1B vs 3e
    { id: 'm87', round: '1/16', s1: 'K1', s2: '3rd:7' },   // wed.87: 1K vs 3e

    // ── Achtste Finale
    { id: 'm89', round: '1/8', s1: 'w:m74', s2: 'w:m77' },  // W74 vs W77
    { id: 'm90', round: '1/8', s1: 'w:m73', s2: 'w:m75' },  // W73 vs W75
    { id: 'm93', round: '1/8', s1: 'w:m83', s2: 'w:m84' },  // W83 vs W84
    { id: 'm94', round: '1/8', s1: 'w:m81', s2: 'w:m82' },  // W81 vs W82
    { id: 'm91', round: '1/8', s1: 'w:m76', s2: 'w:m78' },  // W76 vs W78
    { id: 'm92', round: '1/8', s1: 'w:m79', s2: 'w:m80' },  // W79 vs W80
    { id: 'm95', round: '1/8', s1: 'w:m86', s2: 'w:m88' },  // W86 vs W88
    { id: 'm96', round: '1/8', s1: 'w:m85', s2: 'w:m87' },  // W85 vs W87

    // ── Kwartfinale
    { id: 'm97',  round: '1/4', s1: 'w:m89', s2: 'w:m90'  },
    { id: 'm98',  round: '1/4', s1: 'w:m93', s2: 'w:m94'  },
    { id: 'm99',  round: '1/4', s1: 'w:m91', s2: 'w:m92'  },
    { id: 'm100', round: '1/4', s1: 'w:m95', s2: 'w:m96'  },

    // ── Halve Finale
    { id: 'm101', round: '1/2', s1: 'w:m97',  s2: 'w:m98'  },
    { id: 'm102', round: '1/2', s1: 'w:m99',  s2: 'w:m100' },

    // ── Finale
    { id: 'm104', round: 'F',   s1: 'w:m101', s2: 'w:m102' },
  ];

  const ROUND_META = {
    '1/16': { label: '1/16 Finale',    matchCount: 16 },
    '1/8':  { label: 'Achtste Finale', matchCount: 8  },
    '1/4':  { label: 'Kwartfinale',    matchCount: 4  },
    '1/2':  { label: 'Halve Finale',   matchCount: 2  },
    'F':    { label: 'Finale',         matchCount: 1  },
  };
  const ROUND_ORDER = ['1/16', '1/8', '1/4', '1/2', 'F'];

  // ── Helpers ───────────────────────────────────────────────────────

  function resolveSlot(slot) {
    if (slot.startsWith('w:')) {
      return SIM.winners[slot.slice(2)] || null;
    }
    if (slot.startsWith('3rd:')) {
      return SIM.derden[parseInt(slot.slice(4))] || null;
    }
    const groep = slot[0];
    const pos   = parseInt(slot[1]) - 1;
    return (SIM.groepen[groep] || [])[pos] || null;
  }

  function getFlag(naam) {
    const l = simLanden.find(x => x.naam === naam);
    return l ? (l.vlag || '') : '';
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── LocalStorage ──────────────────────────────────────────────────

  function saveState() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({
        groepen: SIM.groepen,
        derden:  SIM.derden,
        winners: SIM.winners,
        stap:    SIM.stap,
      }));
    } catch (e) {}
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const d = JSON.parse(raw);
      if (d.groepen) SIM.groepen = d.groepen;
      if (d.derden)  SIM.derden  = d.derden;
      if (d.winners) SIM.winners = d.winners;
      if (d.stap)    SIM.stap    = d.stap;
      return true;
    } catch (e) { return false; }
  }

  // ── Init ──────────────────────────────────────────────────────────

  function buildDefaultGroepen() {
    SIM.groepen = {};
    for (const l of simLanden) {
      if (!SIM.groepen[l.groep]) SIM.groepen[l.groep] = [];
      SIM.groepen[l.groep].push(l.naam);
    }
  }

  // ── Render hoofdcontainer ─────────────────────────────────────────

  function renderSim() {
    const el = document.getElementById('sim-content');
    if (!el) return;
    el.innerHTML = buildStepsHeader() +
      (SIM.stap === 1 ? buildStap1() :
       SIM.stap === 2 ? buildStap2() :
                        buildStap3());
    wireSimEvents();
  }

  function buildStepsHeader() {
    const steps = [
      { n: 1, label: 'Groepsfase' },
      { n: 2, label: 'Derden'     },
      { n: 3, label: 'Bracket'    },
    ];
    let html = '<div class="sim-steps-header">';
    steps.forEach((s, i) => {
      const done   = SIM.stap > s.n;
      const active = SIM.stap === s.n;
      html += `<div class="sim-step-ind${active ? ' is-active' : ''}${done ? ' is-done' : ''}">
        <span class="sim-step-num">${done ? '✓' : s.n}</span>
        <span class="sim-step-lbl">${s.label}</span>
      </div>`;
      if (i < steps.length - 1) html += '<span class="sim-step-arrow">›</span>';
    });
    return html + '</div>';
  }

  // ── Stap 1: Groepsfase ────────────────────────────────────────────

  function buildStap1() {
    const groepen = Object.keys(SIM.groepen).sort();
    let html = `<div class="sim-stap">
      <div class="sim-stap__intro">
        <p>Sleep landen omhoog of omlaag om de eindstand per groep in te stellen. De top&nbsp;2 (groen) gaan automatisch door.</p>
      </div>
      <div class="sim-groepen-grid">`;

    for (const g of groepen) {
      const teams = SIM.groepen[g];
      html += `<div class="sim-groep-card" data-groep="${g}">
        <div class="sim-groep-header">Groep ${g}</div>`;
      teams.forEach((naam, i) => {
        const vlag = getFlag(naam);
        const posKey = i < 2 ? 'door' : i === 2 ? 'derde' : 'uit';
        html += `<div class="sim-team-row sim-team-row--${posKey}"
          draggable="true" data-g="${g}" data-i="${i}">
          <span class="sim-drag-handle" aria-hidden="true">⠿</span>
          <span class="sim-pos-badge sim-pos-badge--${posKey}">${i + 1}</span>
          <span class="sim-team-flag">${vlag}</span>
          <span class="sim-team-naam">${esc(naam)}</span>
        </div>`;
      });
      html += '</div>';
    }

    html += `</div>
      <div class="sim-footer">
        <button class="sim-btn sim-btn--primary" id="simNaarDerden">Stel derden in →</button>
      </div>
    </div>`;
    return html;
  }

  // ── Stap 2: Derden ────────────────────────────────────────────────

  function buildStap2() {
    const groepen = Object.keys(SIM.groepen).sort();
    const sel = SIM.derden.length;

    const DERDE_TEGENSTANDER = ['1E','1I','1D','1G','1A','1L','1B','1K'];

    let html = `<div class="sim-stap">
      <div class="sim-stap__intro">
        <p>Kies welke <strong>8 van de 12</strong> derde-plaatsen doorgaan naar de 1/16 Finale. De tegenstanders liggen vast per selectievolgorde:</p>
        <div class="sim-derden-slots">
          ${DERDE_TEGENSTANDER.map((t, i) => {
            const land = SIM.derden[i];
            const vlag = land ? getFlag(land) : '';
            return `<span class="sim-derde-slot${land ? ' sim-derde-slot--filled' : ''}">
              <span class="sim-derde-slot__num">${i+1}</span>
              <span class="sim-derde-slot__vs">vs ${t}</span>
              ${land ? `<span class="sim-derde-slot__land">${vlag} ${esc(land)}</span>` : ''}
            </span>`;
          }).join('')}
        </div>
        <div class="sim-derden-teller"><span id="derdenTeller">${sel}</span> / 8 geselecteerd</div>
      </div>
      <div class="sim-derden-grid">`;

    for (const g of groepen) {
      const naam = SIM.groepen[g][2];
      if (!naam) continue;
      const vlag       = getFlag(naam);
      const isSelected = SIM.derden.includes(naam);
      const isDisabled = !isSelected && sel >= 8;
      html += `<button class="sim-chip${isSelected ? ' sim-chip--selected' : ''}${isDisabled ? ' sim-chip--disabled' : ''}"
        data-land="${esc(naam)}"${isDisabled ? ' disabled' : ''}>
        <span class="sim-chip-groep">Gr.${g}</span>
        <span class="sim-chip-flag">${vlag}</span>
        <span class="sim-chip-naam">${esc(naam)}</span>
      </button>`;
    }

    html += `</div>
      <div class="sim-footer">
        <button class="sim-btn sim-btn--secondary" id="simTerug1">← Terug</button>
        <button class="sim-btn sim-btn--primary" id="simNaarBracket"${sel < 8 ? ' disabled' : ''}>Genereer bracket →</button>
      </div>
    </div>`;
    return html;
  }

  // ── Stap 3: Bracket ───────────────────────────────────────────────

  function buildStap3() {
    const winnaar = SIM.winners['final'];

    let html = `<div class="sim-stap sim-stap--bracket">
      <div class="sim-stap__intro sim-bracket-actions">
        <p>Klik op een land om het door te sturen. Klik op een winnaar (✓) om ongedaan te maken.</p>
        <div class="sim-bracket-btns">
          <button class="sim-btn sim-btn--ghost" id="simTerug2">← Derden aanpassen</button>
          <button class="sim-btn sim-btn--danger" id="simReset">↺ Reset alles</button>
        </div>
      </div>`;

    if (winnaar) {
      html += `<div class="sim-winnaar">
        <div class="sim-winnaar__trophy">🏆</div>
        <div class="sim-winnaar__naam">${getFlag(winnaar)} ${esc(winnaar)}</div>
        <div class="sim-winnaar__titel">Wereldkampioen 2026</div>
      </div>`;
    }

    html += '<div class="bracket-scroll"><div class="bracket">';

    for (const round of ROUND_ORDER) {
      const matches = BRACKET_DEF.filter(m => m.round === round);
      html += `<div class="bracket__round bracket__round--${round.replace('/', '_')}">
        <div class="bracket__round-label">${ROUND_META[round].label}</div>
        <div class="bracket__matches">`;

      for (const match of matches) {
        const t1 = resolveSlot(match.s1);
        const t2 = resolveSlot(match.s2);
        const w  = SIM.winners[match.id];
        html += buildMatch(match.id, t1, t2, w);
      }

      html += '</div></div>';
    }

    html += '</div></div></div>';
    return html;
  }

  function buildMatch(matchId, t1, t2, winner) {
    return `<div class="bracket__match">
      <div class="bracket__match-card">
        ${buildSlot(matchId, t1, winner)}
        <div class="bracket__sep"></div>
        ${buildSlot(matchId, t2, winner)}
      </div>
    </div>`;
  }

  function buildSlot(matchId, naam, winner) {
    if (!naam) {
      return `<button class="bracket__slot bracket__slot--empty" disabled>TBD</button>`;
    }
    const isWinner   = winner === naam;
    const isLoser    = !!(winner && winner !== naam);
    const isPick     = !winner;
    const cls = ['bracket__slot',
      isWinner ? 'bracket__slot--winner'   : '',
      isLoser  ? 'bracket__slot--loser'    : '',
      isPick   ? 'bracket__slot--pickable' : '',
    ].filter(Boolean).join(' ');

    return `<button class="${cls}"
      data-match="${esc(matchId)}" data-land="${esc(naam)}"
      ${isLoser ? 'disabled' : ''}>
      <span class="bracket__flag">${getFlag(naam)}</span>
      <span class="bracket__naam">${esc(naam)}</span>
      ${isWinner ? '<span class="bracket__check">✓</span>' : ''}
    </button>`;
  }

  // ── Event wiring ──────────────────────────────────────────────────

  function wireSimEvents() {
    const el = document.getElementById('sim-content');
    if (!el) return;

    // Drag-and-drop stap 1
    let dragSrc = null;

    el.querySelectorAll('.sim-team-row[draggable]').forEach(row => {
      row.addEventListener('dragstart', e => {
        dragSrc = { g: row.dataset.g, i: parseInt(row.dataset.i) };
        e.dataTransfer.effectAllowed = 'move';
        requestAnimationFrame(() => row.classList.add('is-dragging'));
      });

      row.addEventListener('dragend', () => {
        row.classList.remove('is-dragging');
        el.querySelectorAll('.sim-team-row.is-drag-over').forEach(r => r.classList.remove('is-drag-over'));
        dragSrc = null;
      });

      row.addEventListener('dragover', e => {
        e.preventDefault();
        if (!dragSrc || row.dataset.g !== dragSrc.g) return;
        e.dataTransfer.dropEffect = 'move';
        el.querySelectorAll('.sim-team-row.is-drag-over').forEach(r => r.classList.remove('is-drag-over'));
        row.classList.add('is-drag-over');
      });

      row.addEventListener('dragleave', e => {
        if (!row.contains(e.relatedTarget)) row.classList.remove('is-drag-over');
      });

      row.addEventListener('drop', e => {
        e.preventDefault();
        row.classList.remove('is-drag-over');
        if (!dragSrc || row.dataset.g !== dragSrc.g) return;
        const fromI = dragSrc.i;
        const toI   = parseInt(row.dataset.i);
        if (fromI === toI) return;
        const teams = SIM.groepen[dragSrc.g];
        const [item] = teams.splice(fromI, 1);
        teams.splice(toI, 0, item);
        clearGroupWinners(dragSrc.g);
        saveState();
        renderSim();
      });
    });

    // Stap 1 → 2
    el.querySelector('#simNaarDerden')?.addEventListener('click', () => {
      SIM.stap = 2; saveState(); renderSim();
    });

    // Derde chips stap 2
    el.querySelectorAll('.sim-chip:not([disabled])').forEach(chip => {
      chip.addEventListener('click', () => {
        const naam = chip.dataset.land;
        const idx  = SIM.derden.indexOf(naam);
        if (idx >= 0) {
          SIM.derden.splice(idx, 1);
        } else if (SIM.derden.length < 8) {
          SIM.derden.push(naam);
        }
        clearThirdWinners();
        saveState();
        renderSim();
      });
    });

    // Stap 2 terug
    el.querySelector('#simTerug1')?.addEventListener('click', () => {
      SIM.stap = 1; saveState(); renderSim();
    });

    // Stap 2 → 3
    el.querySelector('#simNaarBracket')?.addEventListener('click', () => {
      SIM.stap = 3; saveState(); renderSim();
    });

    // Bracket slot picks (stap 3)
    el.querySelectorAll('.bracket__slot--pickable').forEach(btn => {
      btn.addEventListener('click', () => {
        const matchId = btn.dataset.match;
        const land    = btn.dataset.land;
        clearDownstream(matchId);
        SIM.winners[matchId] = land;
        saveState();
        renderSim();
      });
    });

    // Annuleer winnaar
    el.querySelectorAll('.bracket__slot--winner').forEach(btn => {
      btn.addEventListener('click', () => {
        const matchId = btn.dataset.match;
        clearDownstream(matchId);
        delete SIM.winners[matchId];
        saveState();
        renderSim();
      });
    });

    // Terug naar stap 2 vanuit bracket
    el.querySelector('#simTerug2')?.addEventListener('click', () => {
      SIM.stap = 2; saveState(); renderSim();
    });

    // Reset alles
    el.querySelector('#simReset')?.addEventListener('click', () => {
      if (!confirm('Weet je zeker dat je de simulator wil resetten?')) return;
      SIM.derden  = [];
      SIM.winners = {};
      SIM.stap    = 1;
      buildDefaultGroepen();
      saveState();
      renderSim();
    });
  }

  // ── Downstream-invalidatie ────────────────────────────────────────

  function clearDownstream(matchId) {
    const affected = new Set();
    const queue = [matchId];
    while (queue.length) {
      const id = queue.shift();
      for (const m of BRACKET_DEF) {
        if ((m.s1 === `w:${id}` || m.s2 === `w:${id}`) && !affected.has(m.id)) {
          affected.add(m.id);
          queue.push(m.id);
        }
      }
    }
    affected.forEach(id => delete SIM.winners[id]);
  }

  function clearGroupWinners(groep) {
    BRACKET_DEF
      .filter(m => m.round === '1/16' && (m.s1[0] === groep || m.s2[0] === groep))
      .forEach(m => { delete SIM.winners[m.id]; clearDownstream(m.id); });
  }

  function clearThirdWinners() {
    // Alle R32-wedstrijden met een 3rd-place slot
    ['m74','m77','m81','m82','m79','m80','m85','m87'].forEach(id => {
      delete SIM.winners[id];
      clearDownstream(id);
    });
  }

  // ── Tab activatie (lazy init) ─────────────────────────────────────

  let inited = false;

  async function initSimulator() {
    try {
      const res  = await fetch('data/landen.json');
      const json = await res.json();
      simLanden  = json.landen || [];
    } catch (e) {
      simLanden = [];
    }
    if (!loadState()) buildDefaultGroepen();
    renderSim();
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelector('.nav')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (!btn || btn.dataset.tab !== 'simulator') return;
      if (inited) return;
      inited = true;
      initSimulator();
    });
  });

})();
