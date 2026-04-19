/* ═══════════════════════════════════════════════════════════════════
   WK draft 2026 — config.js

   Supabase connection (public anon key — RLS beschermt; alleen SELECT
   is toegestaan voor anon-role).

   Vul de waarden hieronder in met je Supabase-project:
     1. https://supabase.com/dashboard/project/<id>/settings/api
     2. Kopieer "Project URL"  → SUPABASE_URL
     3. Kopieer "anon / public" → SUPABASE_ANON_KEY
   ═══════════════════════════════════════════════════════════════════ */

window.WK_CONFIG = {
  SUPABASE_URL:      "",   // bv. "https://xxxx.supabase.co"
  SUPABASE_ANON_KEY: "",   // bv. "eyJhbGciOi..."
};
