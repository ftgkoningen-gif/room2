-- WK draft 2026 schema

create table if not exists wk2026_wedstrijden (
  api_fixture_id bigint primary key,
  datum          date,
  fase           text,
  poule          boolean default false,
  thuis          text,
  uit            text,
  uitslag_thuis  int,
  uitslag_uit    int,
  pens_thuis     int,
  pens_uit       int,
  status         text,
  updated_at     timestamptz default now()
);

create table if not exists wk2026_events (
  id              uuid primary key default gen_random_uuid(),
  api_fixture_id  bigint references wk2026_wedstrijden(api_fixture_id) on delete cascade,
  speler          text not null,
  type            text not null,
  detail          text
);
create index if not exists idx_wk2026_events_fixture on wk2026_events(api_fixture_id);

create table if not exists wk2026_selecties (
  id              uuid primary key default gen_random_uuid(),
  land            text not null,
  speler          text not null,
  positie         text,
  nummer          int,
  foto_url        text,
  api_player_id   bigint,
  updated_at      timestamptz default now(),
  unique (land, speler)
);
create index if not exists idx_wk2026_selecties_land on wk2026_selecties(land);

alter table wk2026_wedstrijden enable row level security;
alter table wk2026_events      enable row level security;
alter table wk2026_selecties   enable row level security;

drop policy if exists "Public read wedstrijden" on wk2026_wedstrijden;
create policy "Public read wedstrijden" on wk2026_wedstrijden for select using (true);

drop policy if exists "Public read events" on wk2026_events;
create policy "Public read events" on wk2026_events for select using (true);

drop policy if exists "Public read selecties" on wk2026_selecties;
create policy "Public read selecties" on wk2026_selecties for select using (true);

drop policy if exists "Service write wedstrijden" on wk2026_wedstrijden;
create policy "Service write wedstrijden" on wk2026_wedstrijden for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service write events" on wk2026_events;
create policy "Service write events" on wk2026_events for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists "Service write selecties" on wk2026_selecties;
create policy "Service write selecties" on wk2026_selecties for all
  using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS wk2026_kansen (
  api_fixture_id  bigint PRIMARY KEY,
  kans_thuis      numeric NOT NULL,
  kans_gelijk     numeric NOT NULL,
  kans_uit        numeric NOT NULL,
  bijgewerkt      timestamptz DEFAULT now()
);
ALTER TABLE wk2026_kansen ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read kansen" ON wk2026_kansen FOR SELECT USING (true);
CREATE POLICY "Service write kansen" ON wk2026_kansen FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
