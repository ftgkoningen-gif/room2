/* ═══════════════════════════════════════════════════════════════════
   WK 2026 — knockoutfase (simulator.js)
   Klassieke bracket-boom: R32 links → Finale midden → R32 rechts.
   Datums staan bij de verbindingsknooppunten, zoals de referentie.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Data ────────────────────────────────────────────────────────── */
  const LEFT = {
    r32: [
      { t1: { v: '🇩🇪', n: 'Duitsland'           }, t2: { v: '🇵🇾', n: 'Paraguay'              }, d: '28 jun' },
      { t1: { v: '🇫🇷', n: 'Frankrijk'           }, t2: { v: '🇸🇪', n: 'Zweden'                }, d: '28 jun' },
      { t1: { v: '🇿🇦', n: 'Zuid-Afrika'        }, t2: { v: '🇨🇦', n: 'Canada'                }, d: '29 jun' },
      { t1: { v: '🇳🇱', n: 'Nederland'           }, t2: { v: '🇲🇦', n: 'Marokko'               }, d: '29 jun' },
      { t1: { v: '🇵🇹', n: 'Portugal'            }, t2: { v: '🇭🇷', n: 'Kroatië'               }, d: '30 jun' },
      { t1: { v: '🇪🇸', n: 'Spanje'              }, t2: { v: '🇦🇹', n: 'Oostenrijk'            }, d: '30 jun' },
      { t1: { v: '🇺🇸', n: 'Verenigde Staten'  }, t2: { v: '🇧🇦', n: 'Bosnië en Herzegovina' }, d: '1 jul'  },
      { t1: { v: '🇧🇪', n: 'België'             }, t2: { v: '🇸🇳', n: 'Senegal'               }, d: '1 jul'  },
    ],
    qf: ['4 jul', '4 jul', '6 jul', '7 jul'],
    sf: ['9 jul', '10 jul'],
    hf: ['14 jul'],
  };

  const RIGHT = {
    r32: [
      { t1: { v: '🇧🇷', n: 'Brazilië'           }, t2: { v: '🇯🇵', n: 'Japan'                 }, d: '28 jun' },
      { t1: { v: '🇨🇮', n: 'Ivoorkust'          }, t2: { v: '🇳🇴', n: 'Noorwegen'             }, d: '28 jun' },
      { t1: { v: '🇲🇽', n: 'Mexico'              }, t2: { v: '🇪🇨', n: 'Ecuador'               }, d: '29 jun' },
      { t1: { v: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', n: 'Engeland'           }, t2: { v: '🇨🇩', n: 'Congo-Kinshasa'        }, d: '29 jun' },
      { t1: { v: '🇦🇷', n: 'Argentinië'         }, t2: { v: '🇨🇻', n: 'Kaapverdië'            }, d: '30 jun' },
      { t1: { v: '🇦🇺', n: 'Australië'          }, t2: { v: '🇪🇬', n: 'Egypte'                }, d: '30 jun' },
      { t1: { v: '🇨🇭', n: 'Zwitserland'       }, t2: { v: '🇩🇿', n: 'Algerije'              }, d: '1 jul'  },
      { t1: { v: '🇨🇴', n: 'Colombia'           }, t2: { v: '🇬🇭', n: 'Ghana'                 }, d: '1 jul'  },
    ],
    qf: ['5 jul', '6 jul', '7 jul', '7 jul'],
    sf: ['11 jul', '12 jul'],
    hf: ['15 jul'],
  };

  /* ── HTML builders ───────────────────────────────────────────────── */
  function teamRow(t) {
    return `<div class="ko-team">
      <span class="ko-flag">${t.v}</span>
      <span class="ko-name">${t.n}</span>
    </div>`;
  }

  function r32Card(m) {
    return `<div class="ko-slot ko-slot--r32">
      <div class="ko-card">
        ${teamRow(m.t1)}
        <div class="ko-sep"></div>
        ${teamRow(m.t2)}
        <div class="ko-date-row">${m.d}</div>
      </div>
    </div>`;
  }

  function tbdCard(round) {
    return `<div class="ko-slot ko-slot--${round}">
      <div class="ko-card ko-card--tbd">
        <div class="ko-team ko-team--tbd"><span class="ko-name">TBD</span></div>
        <div class="ko-sep"></div>
        <div class="ko-team ko-team--tbd"><span class="ko-name">TBD</span></div>
      </div>
    </div>`;
  }

  function connectors(dates, sizeCls, mirror) {
    const cls = ['ko-conn', mirror ? 'ko-conn--mirror' : ''].filter(Boolean).join(' ');
    const items = dates.map(d =>
      `<div class="${cls}"><span class="ko-conn__date">${d}</span></div>`
    ).join('');
    return `<div class="ko-conn-col ko-conn-col--${sizeCls}">${items}</div>`;
  }

  function buildLeft() {
    return `<div class="ko-half ko-half--left">
      <div class="ko-round-col ko-round-col--r32">${LEFT.r32.map(r32Card).join('')}</div>
      ${connectors(LEFT.qf, 'r32-qf', false)}
      <div class="ko-round-col ko-round-col--qf">${LEFT.qf.map(() => tbdCard('qf')).join('')}</div>
      ${connectors(LEFT.sf, 'qf-sf', false)}
      <div class="ko-round-col ko-round-col--sf">${LEFT.sf.map(() => tbdCard('sf')).join('')}</div>
      ${connectors(LEFT.hf, 'sf-hf', false)}
      <div class="ko-round-col ko-round-col--hf">${tbdCard('hf')}</div>
    </div>`;
  }

  function buildRight() {
    return `<div class="ko-half ko-half--right">
      <div class="ko-round-col ko-round-col--hf">${tbdCard('hf')}</div>
      ${connectors(RIGHT.hf, 'sf-hf', true)}
      <div class="ko-round-col ko-round-col--sf">${RIGHT.sf.map(() => tbdCard('sf')).join('')}</div>
      ${connectors(RIGHT.sf, 'qf-sf', true)}
      <div class="ko-round-col ko-round-col--qf">${RIGHT.qf.map(() => tbdCard('qf')).join('')}</div>
      ${connectors(RIGHT.qf, 'r32-qf', true)}
      <div class="ko-round-col ko-round-col--r32">${RIGHT.r32.map(r32Card).join('')}</div>
    </div>`;
  }

  function buildFinale() {
    return `<div class="ko-finale">
      <div class="ko-finale__trophy">🏆</div>
      <div class="ko-finale__label">Finale</div>
      <div class="ko-finale__date">19 jul 2026</div>
      <div class="ko-card ko-card--tbd ko-card--finale">
        <div class="ko-team ko-team--tbd"><span class="ko-name">TBD</span></div>
        <div class="ko-sep"></div>
        <div class="ko-team ko-team--tbd"><span class="ko-name">TBD</span></div>
      </div>
    </div>`;
  }

  function buildKnockout() {
    return `<div class="ko-wrap">
      <div class="ko-page-hdr">
        <div class="ko-page-hdr__eyebrow">WK 2026 — VS · CA · MX</div>
        <h2 class="ko-page-hdr__title">Knockoutfase</h2>
      </div>
      <div class="ko-scroll-outer">
        <div class="ko-bracket">
          ${buildLeft()}
          ${buildFinale()}
          ${buildRight()}
        </div>
      </div>
    </div>`;
  }

  /* ── Init ────────────────────────────────────────────────────────── */
  function init() {
    const panel = document.getElementById('tab-simulator');
    if (!panel) return;
    panel.innerHTML = buildKnockout();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
