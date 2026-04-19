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
  SUPABASE_URL:      "https://mvwsloxbrzzjeamakfzg.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12d3Nsb3hicnp6amVhbWFrZnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzOTQxNjAsImV4cCI6MjA4Nzk3MDE2MH0.98WKwNtkUsjBncuoPtsWTINOHh1KYvjkKY33zrf5MZc"
};
