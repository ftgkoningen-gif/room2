-- ═══════════════════════════════════════════════════════════════
-- WK 2026 — Achtste Finale (Round of 32 / 1/16)
-- 16 wedstrijden invoeren in wk2026_wedstrijden
--
-- HOE GEBRUIKEN:
--   1. Ga naar https://supabase.com/dashboard/project/mvwsloxbrzzjeamakfzg
--   2. Klik links op "SQL Editor"
--   3. Plak deze hele query en klik "Run"
--
-- Na afloop:
--   • datum: pas aan als de echte datum anders is
--   • uitslag_thuis / uitslag_uit: vul in als de wedstrijd gespeeld is
--   • status: zet op 'verwerkt' als de wedstrijd gespeeld + punten verwerkt zijn
-- ═══════════════════════════════════════════════════════════════

INSERT INTO wk2026_wedstrijden
  (api_fixture_id, datum, fase, poule, thuis, uit, uitslag_thuis, uitslag_uit, pens_thuis, pens_uit, status)
VALUES
-- ── Linker helft bracket ─────────────────────────────────────
  (200001, '2026-06-28', '1/16', NULL, 'Duitsland',          'Paraguay',              NULL, NULL, NULL, NULL, 'gepland'),
  (200002, '2026-06-28', '1/16', NULL, 'Frankrijk',           'Zweden',                NULL, NULL, NULL, NULL, 'gepland'),
  (200003, '2026-06-29', '1/16', NULL, 'Zuid-Afrika',         'Canada',                NULL, NULL, NULL, NULL, 'gepland'),
  (200004, '2026-06-29', '1/16', NULL, 'Nederland',           'Marokko',               NULL, NULL, NULL, NULL, 'gepland'),
  (200005, '2026-06-30', '1/16', NULL, 'Portugal',            'Kroatië',               NULL, NULL, NULL, NULL, 'gepland'),
  (200006, '2026-06-30', '1/16', NULL, 'Spanje',              'Oostenrijk',            NULL, NULL, NULL, NULL, 'gepland'),
  (200007, '2026-07-01', '1/16', NULL, 'Verenigde Staten',    'Bosnië en Herzegovina', NULL, NULL, NULL, NULL, 'gepland'),
  (200008, '2026-07-01', '1/16', NULL, 'België',              'Senegal',               NULL, NULL, NULL, NULL, 'gepland'),

-- ── Rechter helft bracket ────────────────────────────────────
  (200009, '2026-06-28', '1/16', NULL, 'Brazilië',            'Japan',                 NULL, NULL, NULL, NULL, 'gepland'),
  (200010, '2026-06-28', '1/16', NULL, 'Ivoorkust',           'Noorwegen',             NULL, NULL, NULL, NULL, 'gepland'),
  (200011, '2026-06-29', '1/16', NULL, 'Mexico',              'Ecuador',               NULL, NULL, NULL, NULL, 'gepland'),
  (200012, '2026-06-29', '1/16', NULL, 'Engeland',            'Congo-Kinshasa',        NULL, NULL, NULL, NULL, 'gepland'),
  (200013, '2026-06-30', '1/16', NULL, 'Argentinië',          'Kaapverdië',            NULL, NULL, NULL, NULL, 'gepland'),
  (200014, '2026-06-30', '1/16', NULL, 'Australië',           'Egypte',                NULL, NULL, NULL, NULL, 'gepland'),
  (200015, '2026-07-01', '1/16', NULL, 'Zwitserland',         'Algerije',              NULL, NULL, NULL, NULL, 'gepland'),
  (200016, '2026-07-01', '1/16', NULL, 'Colombia',            'Ghana',                 NULL, NULL, NULL, NULL, 'gepland')

ON CONFLICT (api_fixture_id) DO NOTHING;
