/* ═══════════════════════════════════════════════════════════════════
   WK 2026 — knockoutfase.js (vervangt simulator.js)
   Toont een statisch knockout-bracket voor WK 2026.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Bracket data ─────────────────────────────────────────────── */
  const LEFT = {
    r16: [
      { thuis: { v: '🇩🇪', n: 'Duitsland'  }, uit: { v: '🇵🇾', n: 'Paraguay'   } },
      { thuis: { v: '🇫🇷', n: 'Frankrijk'  }, uit: { v: '🇸🇪', n: 'Zweden'     } },
      { thuis: { v: '🇿🇦', n: 'Zuid-Afrika'}, uit: { v: '🇨🇦', n: 'Canada'     } },
      { thuis: { v: '🇳🇱', n: 'Nederland'  }, uit: { v: '🇲🇦', n: 'Marokko'    } },
      { thuis: { v: '🇵🇹', n: 'Portugal'   }, uit: { v: '🇭🇷', n: 'Kroatië'    } },
      { thuis: { v: '🇪🇸', n: 'Spanje'     }, uit: { v: '🇦🇹', n: 'Oostenrijk' } },
      { thuis: { v: '🇺🇸', n: 'VS'         }, uit: { v: '🇧🇦', n: 'Bosnië-H.'  } },
      { thuis: { v: '🇧🇪', n: 'België'     }, uit: { v: '🇸🇳', n: 'Senegal'    } },
    ],
    qfData: ['4 jul', '4 jul', '6 jul', '7 jul'],
    sfData: ['9 jul', '10 jul'],
    hfDate: '14 jul',
  };

  const RIGHT = {
    r16: [
      { thuis: { v: '🇧🇷', n: 'Brazilië'    }, uit: { v: '🇯🇵', n: 'Japan'       } },
      { thuis: { v: '🇨🇮', n: 'Ivoorkust'   }, uit: { v: '🇳🇴', n: 'Noorwegen'  } },
      { thuis: { v: '🇲🇽', n: 'Mexico'      }, uit: { v: '🇪🇨', n: 'Ecuador'     } },
      { thuis: { v: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', n: 'Engeland'   }, uit: { v: '🇨🇩', n: 'DR Congo'    } },
      { thuis: { v: '🇦🇷', n: 'Argentinië'  }, uit: { v: '🇨🇻', n: 'Kaapverdië'  } },
      { thuis: { v: '🇦🇺', n: 'Australië'   }, uit: { v: '🇪🇬', n: 'Egypte'      } },
      { thuis: { v: '🇨🇭', n: 'Zwitserland' }, uit: { v: '🇩🇿', n: 'Algerije'    } },
      { thuis: { v: '🇨🇴', n: 'Colombia'    }, uit: { v: '🇬🇭', n: 'Ghana'       } },
    ],
    qfData: ['5 jul', '6 jul', '7 jul', '7 jul'],
    sfData: ['11 jul', '12 jul'],
    hfDate: '15 jul',
  };

  /* ── HTML builders ─────────────────────────────────────────────── */
  function r16Card(m) {
    return `<div class="ko-match">
      <div class="ko-card">
        <div class="ko-team"><span class="ko-flag">${m.thuis.v}</span><span>${m.thuis.n}</span></div>
        <div class="ko-sep"></div>
        <div class="ko-team"><span class="ko-flag">${m.uit.v}</span><span>${m.uit.n}</span></div>
      </div>
    </div>`;
  }

  function tbdCard(date) {
    return `<div class="ko-match">
      <div class="ko-card ko-card--tbd">
        <div class="ko-card__date">${date}</div>
        <div class="ko-team ko-team--tbd"><span>TBD</span></div>
        <div class="ko-sep"></div>
        <div class="ko-team ko-team--tbd"><span>TBD</span></div>
      </div>
    </div>`;
  }

  function connectors(cls, n) {
    return `<div class="ko-connectors ${cls}">${'<div class="ko-connector"></div>'.repeat(n)}</div>`;
  }

  function buildLeft() {
    return `
      <div class="ko-half ko-half--left">
        <div class="ko-round ko-round--r16">${LEFT.r16.map(r16Card).join('')}</div>
        ${connectors('ko-connectors--r16-qf', 4)}
        <div class="ko-round ko-round--qf">${LEFT.qfData.map(tbdCard).join('')}</div>
        ${connectors('ko-connectors--qf-sf', 2)}
        <div class="ko-round ko-round--sf">${LEFT.sfData.map(tbdCard).join('')}</div>
        ${connectors('ko-connectors--sf-hf', 1)}
        <div class="ko-round ko-round--hf">${tbdCard(LEFT.hfDate)}</div>
      </div>`;
  }

  function buildRight() {
    return `
      <div class="ko-half ko-half--right">
        <div class="ko-round ko-round--hf">${tbdCard(RIGHT.hfDate)}</div>
        ${connectors('ko-connectors--sf-hf ko-connectors--mirror', 1)}
        <div class="ko-round ko-round--sf">${RIGHT.sfData.map(tbdCard).join('')}</div>
        ${connectors('ko-connectors--qf-sf ko-connectors--mirror', 2)}
        <div class="ko-round ko-round--qf">${RIGHT.qfData.map(tbdCard).join('')}</div>
        ${connectors('ko-connectors--r16-qf ko-connectors--mirror', 4)}
        <div class="ko-round ko-round--r16">${RIGHT.r16.map(r16Card).join('')}</div>
      </div>`;
  }

  function buildFinale() {
    return `
      <div class="ko-finale-col">
        <div class="ko-finale-trophy">🏆</div>
        <div class="ko-finale-round">Finale</div>
        <div class="ko-finale-date">19 juli 2026</div>
        <div class="ko-card ko-card--tbd ko-card--finale">
          <div class="ko-team ko-team--tbd"><span>TBD</span></div>
          <div class="ko-sep"></div>
          <div class="ko-team ko-team--tbd"><span>TBD</span></div>
        </div>
      </div>`;
  }

  /* Round-name header row, columns must match bracket column widths */
  function buildHeader() {
    const LEFT_ROUNDS  = ['Achtste Finale', 'Kwartfinale', 'Halve Finale', 'Halve Finale'];
    const RIGHT_ROUNDS = ['Halve Finale', 'Kwartfinale', 'Achtste Finale'];
    const conn = '<div class="ko-hdr-cell ko-hdr-cell--conn"></div>';

    const leftCols = LEFT_ROUNDS.map((r, i) => {
      const extra = i < LEFT_ROUNDS.length - 1 ? conn : '';
      return `<div class="ko-hdr-cell ko-hdr-cell--round">${r}</div>${extra}`;
    }).join('');

    const rightCols = RIGHT_ROUNDS.map(r =>
      `${conn}<div class="ko-hdr-cell ko-hdr-cell--round">${r}</div>`
    ).join('');

    return `<div class="ko-hdr-row">
      ${leftCols}
      <div class="ko-hdr-cell ko-hdr-cell--fin">Finale</div>
      ${rightCols}
    </div>`;
  }

  function buildKnockout() {
    return `
      <div class="ko-wrap">
        <div class="ko-page-hdr">
          <div class="ko-page-hdr__eyebrow">WK 2026 — Verenigde Staten, Canada & Mexico</div>
          <h2 class="ko-page-hdr__title">Knockoutfase</h2>
        </div>
        <div class="ko-scroll-outer">
          ${buildHeader()}
          <div class="ko-bracket">
            ${buildLeft()}
            ${buildFinale()}
            ${buildRight()}
          </div>
        </div>
      </div>`;
  }

  /* ── Tab init ──────────────────────────────────────────────────── */
  function init() {
    const panel = document.getElementById('tab-simulator');
    if (!panel || panel.dataset.koinit) return;
    panel.dataset.koinit = '1';
    panel.innerHTML = buildKnockout();
  }

  /* Render when tab becomes visible */
  document.addEventListener('DOMContentLoaded', () => {
    /* If tab is already active on load */
    const panel = document.getElementById('tab-simulator');
    if (panel && !panel.classList.contains('hidden')) init();

    /* On tab-click */
    document.querySelector('.nav')?.addEventListener('click', e => {
      const btn = e.target.closest('[data-tab]');
      if (btn?.dataset.tab === 'simulator') setTimeout(init, 0);
    });
  });
})();
