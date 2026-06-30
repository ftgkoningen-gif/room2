/* ═══════════════════════════════════════════════════════════════════
   WK 2026 — WK Schema (simulator.js)
   Desktop: klassieke bracket met ronde-labels (≥900px)
   Mobiel:  ronde-tabs met kaartgrid (<900px)
   Automatisch bijgewerkt vanuit state.wedstrijden na Supabase-load.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Bracket definitie (top → bottom per helft) ─────────────────── */
  const LEFT_R32 = [
    { t1: { v: '🇩🇪', n: 'Duitsland'           }, t2: { v: '🇵🇾', n: 'Paraguay'              }, d: '29 jun' },
    { t1: { v: '🇫🇷', n: 'Frankrijk'           }, t2: { v: '🇸🇪', n: 'Zweden'                }, d: '30 jun' },
    { t1: { v: '🇿🇦', n: 'Zuid-Afrika'        }, t2: { v: '🇨🇦', n: 'Canada'                }, d: '28 jun' },
    { t1: { v: '🇳🇱', n: 'Nederland'           }, t2: { v: '🇲🇦', n: 'Marokko'               }, d: '30 jun' },
    { t1: { v: '🇵🇹', n: 'Portugal'            }, t2: { v: '🇭🇷', n: 'Kroatië'               }, d: '3 jul'  },
    { t1: { v: '🇪🇸', n: 'Spanje'              }, t2: { v: '🇦🇹', n: 'Oostenrijk'            }, d: '2 jul'  },
    { t1: { v: '🇺🇸', n: 'Verenigde Staten'  }, t2: { v: '🇧🇦', n: 'Bosnië en Herzegovina' }, d: '2 jul'  },
    { t1: { v: '🇧🇪', n: 'België'             }, t2: { v: '🇸🇳', n: 'Senegal'               }, d: '1 jul'  },
  ];

  const RIGHT_R32 = [
    { t1: { v: '🇧🇷', n: 'Brazilië'           }, t2: { v: '🇯🇵', n: 'Japan'                 }, d: '29 jun' },
    { t1: { v: '🇨🇮', n: 'Ivoorkust'          }, t2: { v: '🇳🇴', n: 'Noorwegen'             }, d: '30 jun' },
    { t1: { v: '🇲🇽', n: 'Mexico'              }, t2: { v: '🇪🇨', n: 'Ecuador'               }, d: '1 jul'  },
    { t1: { v: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', n: 'Engeland'           }, t2: { v: '🇨🇩', n: 'Congo-Kinshasa'        }, d: '1 jul'  },
    { t1: { v: '🇦🇷', n: 'Argentinië'         }, t2: { v: '🇨🇻', n: 'Kaapverdië'            }, d: '4 jul'  },
    { t1: { v: '🇦🇺', n: 'Australië'          }, t2: { v: '🇪🇬', n: 'Egypte'                }, d: '3 jul'  },
    { t1: { v: '🇨🇭', n: 'Zwitserland'       }, t2: { v: '🇩🇿', n: 'Algerije'              }, d: '3 jul'  },
    { t1: { v: '🇨🇴', n: 'Colombia'           }, t2: { v: '🇬🇭', n: 'Ghana'                 }, d: '4 jul'  },
  ];

  // Connector-datums (datum van de TARGET-ronde, bij het knooppunt)
  const LEFT_CONN  = { 'r32-qf': ['4 jul','4 jul','6 jul','7 jul'], 'qf-sf': ['9 jul','10 jul'], 'sf-hf': ['14 jul'] };
  const RIGHT_CONN = { 'r32-qf': ['5 jul','6 jul','7 jul','7 jul'], 'qf-sf': ['11 jul','12 jul'], 'sf-hf': ['15 jul'] };

  /* ── Team-emoji lookup ──────────────────────────────────────────── */
  const TEAM_MAP = {};
  function buildTeamMap() {
    [...LEFT_R32, ...RIGHT_R32].forEach(m => {
      TEAM_MAP[m.t1.n] = m.t1;
      TEAM_MAP[m.t2.n] = m.t2;
    });
  }
  function teamInfo(naam) { return TEAM_MAP[naam] || { v: '🏳️', n: naam }; }

  /* ── State-helpers ──────────────────────────────────────────────── */
  function findMatch(n1, n2) {
    const ws = (typeof window !== 'undefined' && window.state?.wedstrijden) || [];
    return ws.find(w =>
      (w.thuis === n1 && w.uit === n2) ||
      (w.thuis === n2 && w.uit === n1)
    ) || null;
  }

  function winnaarVan(match) {
    if (!match?.uitslag) return null;
    const gt = match.uitslag.thuis, gu = match.uitslag.uit;
    if (gt > gu) return match.thuis;
    if (gu > gt) return match.uit;
    if (match.pens) return match.pens.thuis > match.pens.uit ? match.thuis : match.uit;
    return null;
  }

  function scoreText(match, t1naam) {
    if (!match?.uitslag) return null;
    const isThuis = match.thuis === t1naam;
    const gt = isThuis ? match.uitslag.thuis : match.uitslag.uit;
    const gu = isThuis ? match.uitslag.uit   : match.uitslag.thuis;
    let s = `${gt}–${gu}`;
    if (match.pens) {
      const pt = isThuis ? match.pens.thuis : match.pens.uit;
      const pu = isThuis ? match.pens.uit   : match.pens.thuis;
      s += ` (p ${pt}–${pu})`;
    }
    return s;
  }

  /* ── Winnaar-propagatie ─────────────────────────────────────────── */
  function propagate(r32list) {
    const r32w = r32list.map(m => winnaarVan(findMatch(m.t1.n, m.t2.n)));

    function pairUp(arr) {
      const out = [];
      for (let i = 0; i < arr.length; i += 2) out.push([arr[i] || null, arr[i + 1] || null]);
      return out;
    }
    function roundW(pairs) {
      return pairs.map(([n1, n2]) => (n1 && n2) ? winnaarVan(findMatch(n1, n2)) : null);
    }

    const qfPairs = pairUp(r32w);
    const qfW     = roundW(qfPairs);
    const sfPairs = pairUp(qfW);
    const sfW     = roundW(sfPairs);
    const hfPairs = pairUp(sfW);
    const hfW     = roundW(hfPairs);

    return { r32w, qfPairs, qfW, sfPairs, sfW, hfPairs, hfW };
  }

  /* ── Desktop: kaart-bouwers ─────────────────────────────────────── */
  function tbdRow() {
    return `<div class="ko-team ko-team--tbd"><span class="ko-name">?</span></div>`;
  }

  function teamRow(info, win, lost, score) {
    return `<div class="ko-team${win ? ' ko-team--win' : lost ? ' ko-team--lost' : ''}">
      <span class="ko-flag">${info.v}</span>
      <span class="ko-name">${info.n}</span>
      ${score ? `<span class="ko-score">${score}</span>` : ''}
    </div>`;
  }

  function r32Card(m) {
    const match  = findMatch(m.t1.n, m.t2.n);
    const w      = winnaarVan(match);
    const t1win  = w === m.t1.n, t2win = w === m.t2.n;
    const score  = scoreText(match, m.t1.n);
    const played = !!(match?.uitslag);
    return `<div class="ko-slot ko-slot--r32">
      <div class="ko-card${played ? ' ko-card--played' : ''}">
        ${teamRow(m.t1, t1win, t2win, score)}
        <div class="ko-sep"></div>
        ${teamRow(m.t2, t2win, t1win, null)}
        <div class="ko-date-row">${m.d}</div>
      </div>
    </div>`;
  }

  function laterCard(round, naam1, naam2) {
    if (!naam1 && !naam2) {
      return `<div class="ko-slot ko-slot--${round}">
        <div class="ko-card ko-card--tbd">
          ${tbdRow()}<div class="ko-sep"></div>${tbdRow()}
        </div>
      </div>`;
    }
    const i1     = naam1 ? teamInfo(naam1) : null;
    const i2     = naam2 ? teamInfo(naam2) : null;
    const match  = (naam1 && naam2) ? findMatch(naam1, naam2) : null;
    const w      = winnaarVan(match);
    const t1win  = w === naam1, t2win = w === naam2;
    const score  = naam1 ? scoreText(match, naam1) : null;
    const played = !!(match?.uitslag);
    return `<div class="ko-slot ko-slot--${round}">
      <div class="ko-card ${played ? 'ko-card--played' : 'ko-card--partial'}">
        ${i1 ? teamRow(i1, t1win, t2win, score) : tbdRow()}
        <div class="ko-sep"></div>
        ${i2 ? teamRow(i2, t2win, t1win, null) : tbdRow()}
      </div>
    </div>`;
  }

  function connectors(dates, sizeCls, mirror) {
    const cls = `ko-conn${mirror ? ' ko-conn--mirror' : ''}`;
    return `<div class="ko-conn-col ko-conn-col--${sizeCls}">` +
      dates.map(d => `<div class="${cls}"><span class="ko-conn__date">${d}</span></div>`).join('') +
    `</div>`;
  }

  function buildHalf(r32list, conn, prop, mirror) {
    const { qfPairs, sfPairs, hfPairs } = prop;
    const r32col = r32list.map(r32Card).join('');
    const qfcol  = qfPairs.map(([n1, n2]) => laterCard('qf', n1, n2)).join('');
    const sfcol  = sfPairs.map(([n1, n2]) => laterCard('sf', n1, n2)).join('');
    const hfcol  = hfPairs.map(([n1, n2]) => laterCard('hf', n1, n2)).join('');

    if (mirror) {
      return `<div class="ko-half ko-half--right">
        <div class="ko-round-col ko-round-col--hf">${hfcol}</div>
        ${connectors(conn['sf-hf'], 'sf-hf', true)}
        <div class="ko-round-col ko-round-col--sf">${sfcol}</div>
        ${connectors(conn['qf-sf'], 'qf-sf', true)}
        <div class="ko-round-col ko-round-col--qf">${qfcol}</div>
        ${connectors(conn['r32-qf'], 'r32-qf', true)}
        <div class="ko-round-col ko-round-col--r32">${r32col}</div>
      </div>`;
    }
    return `<div class="ko-half ko-half--left">
      <div class="ko-round-col ko-round-col--r32">${r32col}</div>
      ${connectors(conn['r32-qf'], 'r32-qf', false)}
      <div class="ko-round-col ko-round-col--qf">${qfcol}</div>
      ${connectors(conn['qf-sf'], 'qf-sf', false)}
      <div class="ko-round-col ko-round-col--sf">${sfcol}</div>
      ${connectors(conn['sf-hf'], 'sf-hf', false)}
      <div class="ko-round-col ko-round-col--hf">${hfcol}</div>
    </div>`;
  }

  function buildFinale(leftHfW, rightHfW) {
    const n1 = leftHfW[0] || null, n2 = rightHfW[0] || null;
    const match  = (n1 && n2) ? findMatch(n1, n2) : null;
    const w      = winnaarVan(match);
    const i1 = n1 ? teamInfo(n1) : null;
    const i2 = n2 ? teamInfo(n2) : null;
    const t1win = w === n1, t2win = w === n2;
    const score = n1 ? scoreText(match, n1) : null;
    const played = !!(match?.uitslag);
    return `<div class="ko-finale">
      <div class="ko-finale__trophy">🏆</div>
      <div class="ko-finale__label">Finale</div>
      <div class="ko-finale__date">19 jul 2026</div>
      <div class="ko-card${played ? ' ko-card--played' : ' ko-card--tbd'} ko-card--finale">
        ${i1 ? teamRow(i1, t1win, t2win, score) : tbdRow()}
        <div class="ko-sep"></div>
        ${i2 ? teamRow(i2, t2win, t1win, null) : tbdRow()}
      </div>
    </div>`;
  }

  // Ronde-labels boven de bracket-kolommen
  function buildLabelsRow() {
    const L = (t, w) => `<div class="ko-lbl" style="width:${w}px">${t}</div>`;
    const G = w => `<div style="width:${w}px;flex-shrink:0"></div>`;
    return `<div class="ko-labels-row">
      ${L('R32',164)}${G(52)}${L('1/8',158)}${G(52)}${L('1/4',158)}${G(52)}${L('1/2',158)}
      ${G(184)}
      ${L('1/2',158)}${G(52)}${L('1/4',158)}${G(52)}${L('1/8',158)}${G(52)}${L('R32',164)}
    </div>`;
  }

  /* ── Mobiel: ronde-tabs + kaartgrid ─────────────────────────────── */
  function mobCard(naam1, naam2, date) {
    const i1    = naam1 ? teamInfo(naam1) : null;
    const i2    = naam2 ? teamInfo(naam2) : null;
    const match = (naam1 && naam2) ? findMatch(naam1, naam2) : null;
    const w     = winnaarVan(match);
    const t1win = w === naam1, t2win = w === naam2;
    const score = naam1 ? scoreText(match, naam1) : null;
    const played = !!(match?.uitslag);
    const tbd = `<div class="ko-mob-team ko-team--tbd"><span class="ko-name">?</span></div>`;

    function mrow(info, win, lost, sc) {
      return `<div class="ko-mob-team${win ? ' ko-team--win' : lost ? ' ko-team--lost' : ''}">
        <span class="ko-flag">${info.v}</span>
        <span class="ko-name">${info.n}</span>
        ${sc ? `<span class="ko-score">${sc}</span>` : ''}
      </div>`;
    }

    return `<div class="ko-mob-card${played ? ' ko-mob-card--played' : ''}">
      ${i1 ? mrow(i1, t1win, t2win, score) : tbd}
      <div class="ko-sep"></div>
      ${i2 ? mrow(i2, t2win, t1win, null) : tbd}
      ${date ? `<div class="ko-date-row">${date}</div>` : ''}
    </div>`;
  }

  function buildMobile(lp, rp) {
    // Actieve ronde = diepste ronde met minstens één uitslag
    const hasResult = (pairs) => pairs.some(([n1, n2]) => n1 && n2 && !!(findMatch(n1, n2)?.uitslag));
    const r32pairs = [...LEFT_R32.map(m => [m.t1.n, m.t2.n]), ...RIGHT_R32.map(m => [m.t1.n, m.t2.n])];

    const roundsInOrder = ['r32', 'qf', 'sf', 'hf', 'finale'];
    const roundHasResult = {
      r32:    hasResult(r32pairs),
      qf:     hasResult([...lp.qfPairs, ...rp.qfPairs]),
      sf:     hasResult([...lp.sfPairs, ...rp.sfPairs]),
      hf:     hasResult([...lp.hfPairs, ...rp.hfPairs]),
      finale: !!(lp.hfW[0] && rp.hfW[0] && findMatch(lp.hfW[0], rp.hfW[0])?.uitslag),
    };
    let activeRound = 'r32';
    for (const r of roundsInOrder) { if (roundHasResult[r]) activeRound = r; }

    // Kaarten per ronde
    const panels = {
      r32: LEFT_R32.map(m => mobCard(m.t1.n, m.t2.n, m.d))
             .concat(RIGHT_R32.map(m => mobCard(m.t1.n, m.t2.n, m.d))).join(''),
      qf:  lp.qfPairs.map(([n1,n2],i) => mobCard(n1, n2, LEFT_CONN['r32-qf'][i]))
             .concat(rp.qfPairs.map(([n1,n2],i) => mobCard(n1, n2, RIGHT_CONN['r32-qf'][i]))).join(''),
      sf:  lp.sfPairs.map(([n1,n2],i) => mobCard(n1, n2, LEFT_CONN['qf-sf'][i]))
             .concat(rp.sfPairs.map(([n1,n2],i) => mobCard(n1, n2, RIGHT_CONN['qf-sf'][i]))).join(''),
      hf:  lp.hfPairs.map(([n1,n2]) => mobCard(n1, n2, LEFT_CONN['sf-hf'][0]))
             .concat(rp.hfPairs.map(([n1,n2]) => mobCard(n1, n2, RIGHT_CONN['sf-hf'][0]))).join(''),
      finale: mobCard(lp.hfW[0] || null, rp.hfW[0] || null, '19 jul'),
    };

    const LABELS = { r32: 'R32', qf: '1/8', sf: '1/4', hf: '1/2', finale: 'Finale' };

    const tabs = roundsInOrder.map(r =>
      `<button class="ko-mob-tab${r === activeRound ? ' is-active' : ''}" data-ko-round="${r}">${LABELS[r]}</button>`
    ).join('');

    const panelHtml = roundsInOrder.map(r =>
      `<div class="ko-mob-grid${r === 'finale' ? ' ko-mob-grid--single' : ''}${r !== activeRound ? ' hidden' : ''}" data-ko-panel="${r}">${panels[r]}</div>`
    ).join('');

    return `<div class="ko-mobile">
      <nav class="ko-mob-nav">${tabs}</nav>
      <div class="ko-mob-panels">${panelHtml}</div>
    </div>`;
  }

  /* ── Hoofd-render ───────────────────────────────────────────────── */
  function renderBracket() {
    const panel = document.getElementById('tab-simulator');
    if (!panel) return;

    buildTeamMap();
    const lp = propagate(LEFT_R32);
    const rp = propagate(RIGHT_R32);

    panel.innerHTML = `<div class="ko-wrap">
      <div class="ko-page-hdr">
        <div class="ko-page-hdr__eyebrow">WK 2026 — VS · CA · MX</div>
        <h2 class="ko-page-hdr__title">WK <em>Schema</em></h2>
      </div>

      <div class="ko-desktop">
        ${buildLabelsRow()}
        <div class="ko-scroll-outer">
          <div class="ko-bracket">
            ${buildHalf(LEFT_R32,  LEFT_CONN,  lp, false)}
            ${buildFinale(lp.hfW, rp.hfW)}
            ${buildHalf(RIGHT_R32, RIGHT_CONN, rp, true)}
          </div>
        </div>
      </div>

      ${buildMobile(lp, rp)}
    </div>`;

    // Mobiele tab-navigatie
    panel.querySelectorAll('.ko-mob-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.ko-mob-tab').forEach(b => b.classList.remove('is-active'));
        panel.querySelectorAll('[data-ko-panel]').forEach(p => p.classList.add('hidden'));
        btn.classList.add('is-active');
        const target = panel.querySelector(`[data-ko-panel="${btn.dataset.koRound}"]`);
        if (target) {
          target.classList.remove('hidden');
          if (typeof twemoji !== 'undefined') twemoji.parse(target, { folder: 'svg', ext: '.svg' });
        }
      });
    });

    if (typeof twemoji !== 'undefined') twemoji.parse(panel, { folder: 'svg', ext: '.svg' });
  }

  window.renderKnockoutSchema = renderBracket;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderBracket);
  } else {
    renderBracket();
  }
})();
