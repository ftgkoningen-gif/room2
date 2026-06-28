/* ═══════════════════════════════════════════════════════════════════
   WK 2026 — knockoutfase (simulator.js)
   Ronde-voor-ronde grid: leesbaar op mobiel én laptop.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Wedstrijddata per ronde ──────────────────────────────────────── */
  const ROUNDS = [
    {
      id: 'r32', label: 'Achtste Finale', badge: '1/16 · R32',
      dates: '28 jun – 1 jul', current: true,
      matches: [
        { t1: { v: '🇩🇪', n: 'Duitsland'            }, t2: { v: '🇵🇾', n: 'Paraguay'              }, datum: '28 jun' },
        { t1: { v: '🇫🇷', n: 'Frankrijk'            }, t2: { v: '🇸🇪', n: 'Zweden'                }, datum: '28 jun' },
        { t1: { v: '🇧🇷', n: 'Brazilië'             }, t2: { v: '🇯🇵', n: 'Japan'                 }, datum: '28 jun' },
        { t1: { v: '🇨🇮', n: 'Ivoorkust'           }, t2: { v: '🇳🇴', n: 'Noorwegen'             }, datum: '28 jun' },
        { t1: { v: '🇿🇦', n: 'Zuid-Afrika'         }, t2: { v: '🇨🇦', n: 'Canada'                }, datum: '29 jun' },
        { t1: { v: '🇳🇱', n: 'Nederland'            }, t2: { v: '🇲🇦', n: 'Marokko'               }, datum: '29 jun' },
        { t1: { v: '🇲🇽', n: 'Mexico'               }, t2: { v: '🇪🇨', n: 'Ecuador'               }, datum: '29 jun' },
        { t1: { v: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', n: 'Engeland'            }, t2: { v: '🇨🇩', n: 'Congo-Kinshasa'        }, datum: '29 jun' },
        { t1: { v: '🇵🇹', n: 'Portugal'             }, t2: { v: '🇭🇷', n: 'Kroatië'               }, datum: '30 jun' },
        { t1: { v: '🇪🇸', n: 'Spanje'               }, t2: { v: '🇦🇹', n: 'Oostenrijk'            }, datum: '30 jun' },
        { t1: { v: '🇦🇷', n: 'Argentinië'          }, t2: { v: '🇨🇻', n: 'Kaapverdië'            }, datum: '30 jun' },
        { t1: { v: '🇦🇺', n: 'Australië'           }, t2: { v: '🇪🇬', n: 'Egypte'                }, datum: '30 jun' },
        { t1: { v: '🇺🇸', n: 'Verenigde Staten'   }, t2: { v: '🇧🇦', n: 'Bosnië en Herzegovina' }, datum: '1 jul'  },
        { t1: { v: '🇧🇪', n: 'België'              }, t2: { v: '🇸🇳', n: 'Senegal'               }, datum: '1 jul'  },
        { t1: { v: '🇨🇭', n: 'Zwitserland'        }, t2: { v: '🇩🇿', n: 'Algerije'              }, datum: '1 jul'  },
        { t1: { v: '🇨🇴', n: 'Colombia'            }, t2: { v: '🇬🇭', n: 'Ghana'                 }, datum: '1 jul'  },
      ],
    },
    {
      id: 'r16', label: 'Achtste Finale', badge: '1/8',
      dates: '4–7 jul',
      matches: [
        { tbd: true, datum: '4 jul' },
        { tbd: true, datum: '4 jul' },
        { tbd: true, datum: '5 jul' },
        { tbd: true, datum: '5 jul' },
        { tbd: true, datum: '6 jul' },
        { tbd: true, datum: '6 jul' },
        { tbd: true, datum: '7 jul' },
        { tbd: true, datum: '7 jul' },
      ],
    },
    {
      id: 'qf', label: 'Kwartfinale', badge: '1/4',
      dates: '9–12 jul',
      matches: [
        { tbd: true, datum: '9 jul'  },
        { tbd: true, datum: '10 jul' },
        { tbd: true, datum: '11 jul' },
        { tbd: true, datum: '12 jul' },
      ],
    },
    {
      id: 'sf', label: 'Halve Finale', badge: '1/2',
      dates: '14–15 jul',
      matches: [
        { tbd: true, datum: '14 jul' },
        { tbd: true, datum: '15 jul' },
      ],
    },
    {
      id: 'f', label: 'Finale', badge: 'Final',
      dates: '19 jul', finale: true,
      matches: [
        { tbd: true, datum: '19 jul', finale: true },
      ],
    },
  ];

  /* ── HTML builders ───────────────────────────────────────────────── */
  function teamRow(t) {
    return `<div class="ko-mcard__team">
      <span class="ko-mcard__flag">${t.v}</span>
      <span class="ko-mcard__name">${t.n}</span>
    </div>`;
  }

  function matchCard(m, roundId) {
    if (m.finale && m.tbd) {
      return `<span class="ko-finale-trophy">🏆</span>
        <div class="ko-mcard ko-mcard--tbd ko-mcard--finale">
          <div class="ko-mcard__team ko-mcard__team--tbd"><span class="ko-mcard__name">TBD</span></div>
          <div class="ko-mcard__sep"></div>
          <div class="ko-mcard__team ko-mcard__team--tbd"><span class="ko-mcard__name">TBD</span></div>
          <div class="ko-mcard__meta">19 jul 2026</div>
        </div>
        <div class="ko-finale-label">Finale</div>`;
    }
    if (m.tbd) {
      return `<div class="ko-mcard ko-mcard--tbd">
        <div class="ko-mcard__team ko-mcard__team--tbd"><span class="ko-mcard__name">TBD</span></div>
        <div class="ko-mcard__sep"></div>
        <div class="ko-mcard__team ko-mcard__team--tbd"><span class="ko-mcard__name">TBD</span></div>
        <div class="ko-mcard__meta">${m.datum}</div>
      </div>`;
    }
    const activeClass = roundId === 'r32' ? ' ko-mcard--active' : '';
    return `<div class="ko-mcard${activeClass}">
      ${teamRow(m.t1)}
      <div class="ko-mcard__sep"></div>
      ${teamRow(m.t2)}
      <div class="ko-mcard__meta">${m.datum}</div>
    </div>`;
  }

  function roundCol(r) {
    const cards = r.matches.map(m => matchCard(m, r.id)).join('');
    const cls = [
      'ko-col',
      `ko-col--${r.id}`,
      r.current ? 'ko-col--current' : '',
      r.finale  ? 'ko-col--finale'  : '',
    ].filter(Boolean).join(' ');

    return `<div class="${cls}">
      <div class="ko-col-hdr">
        <div class="ko-col-hdr__label">${r.label}</div>
        <div class="ko-col-hdr__meta">
          <span class="ko-col-hdr__badge">${r.badge}</span>
          <span class="ko-col-hdr__dates">${r.dates}</span>
        </div>${r.current ? '\n        <div class="ko-col-hdr__live">▶ Nu bezig</div>' : ''}
      </div>
      <div class="ko-col-matches">${cards}</div>
    </div>`;
  }

  function buildKnockout() {
    return `<div class="ko-wrap">
      <div class="ko-page-hdr">
        <div class="ko-page-hdr__eyebrow">WK 2026 — VS · CA · MX</div>
        <h2 class="ko-page-hdr__title">Knockoutfase</h2>
      </div>
      <div class="ko-rounds">${ROUNDS.map(roundCol).join('')}</div>
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
