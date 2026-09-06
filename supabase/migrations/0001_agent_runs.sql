-- ------------------------------------------------------------------
--  agent_runs
--
--  Jediný zdroj pravdy o tom, co který agent dělá. Uzel v konstelaci
--  svítí zlatě právě tehdy, když tady leží řádek se stavem 'queued'
--  nebo 'running' — ne proto, že to je napsané v roster.js.
--
--  Tabulka je přírůstková. Zrušení běhu je změna stavu, ne delete,
--  protože otázka zní „kdo co kdy udělal", a smazaný řádek na ni
--  neodpoví. Delete politika proto záměrně chybí.
--
--  Zápis běží pod session přihlášeného uživatele, ne pod service role
--  klíčem. RLS tedy platí i pro server. Držíme tím pravidlo z
--  .env.local.example: service role klíč v tomhle projektu není.
-- ------------------------------------------------------------------

create table public.agent_runs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid()
                  references auth.users (id) on delete cascade,

  -- Shodné s AGENTS[].id v components/constellation/roster.js.
  -- Cizí klíč sem nevede: roster žije v souboru, ne v databázi.
  agent_id      text not null,

  -- Delegační řetěz. NULL znamená, že úkol přišel hlasem; cokoli
  -- jiného je skok po hraně, kterou konstelace kreslí.
  parent_run_id uuid references public.agent_runs (id) on delete set null,

  -- Co bylo zadáno, tvými slovy. Ne přeformulované modelem.
  intent        text not null,

  status        text not null default 'queued',

  -- Živá relace Gemini, ze které úkol přišel. Text, protože to je
  -- handle od Googlu, ne náš identifikátor.
  session_id    text,

  created_at    timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,

  -- Do kdy má běh doběhnout. Po téhle značce ho sklidí reaper.
  -- Per-běh, ne globální konstanta: rešerše smí trvat déle než
  -- přepsání odstavce.
  expires_at    timestamptz not null default now() + interval '5 minutes',

  result        jsonb,
  error         text,

  constraint agent_runs_status_check check (
    status in ('queued', 'running', 'done', 'failed', 'cancelled')
  ),

  -- Textový check místo enumu schválně: 'alter type ... add value'
  -- neběží v transakci, a migrace v transakci běží. Přidat stav
  -- později by pak znamenalo migraci, která spadne.
  constraint agent_runs_agent_id_check check (
    agent_id ~ '^[a-z][a-z0-9-]{1,31}$'
  ),

  constraint agent_runs_intent_length check (
    char_length(intent) between 1 and 2000
  ),

  -- Doběhlý běh musí říct kdy, nedoběhlý nesmí. Bez tohohle se dá
  -- omylem zapsat 'done' bez času a historie tiše zlhostejní.
  constraint agent_runs_finished_consistency check (
    (status in ('done', 'failed', 'cancelled')) = (finished_at is not null)
  ),

  constraint agent_runs_no_self_parent check (
    parent_run_id is null or parent_run_id <> id
  )
);

-- ---- indexy -------------------------------------------------------

-- Horký dotaz konstelace: kdo má rozdělanou práci. Částečný index,
-- protože doběhlé běhy tvoří drtivou většinu tabulky a tenhle dotaz
-- se na ně nikdy neptá.
create index agent_runs_open_idx
  on public.agent_runs (user_id, agent_id)
  where status in ('queued', 'running');

-- Chůze po delegačním řetězu, když se rozsvěcí hrana.
create index agent_runs_parent_idx
  on public.agent_runs (parent_run_id)
  where parent_run_id is not null;

-- Historie: „co jsi dneska dělal".
create index agent_runs_history_idx
  on public.agent_runs (user_id, created_at desc);

-- Sken reaperu.
create index agent_runs_expiry_idx
  on public.agent_runs (expires_at)
  where status in ('queued', 'running');

-- ---- row level security -------------------------------------------

alter table public.agent_runs enable row level security;

create policy "vlastní běhy jsou vidět"
  on public.agent_runs for select
  using (auth.uid() = user_id);

create policy "vlastní běhy lze zakládat"
  on public.agent_runs for insert
  with check (auth.uid() = user_id);

create policy "vlastní běhy lze posouvat"
  on public.agent_runs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Delete politika chybí schválně, viz hlavička.

-- ---- realtime -----------------------------------------------------

-- Konstelace se nedotazuje v cyklu, poslouchá změny.
alter publication supabase_realtime add table public.agent_runs;

-- ---- přehled ------------------------------------------------------

-- Podklad pro hlasový nástroj status(). security_invoker je tu
-- podstatné: bez něj view běží pod svým vlastníkem, obejde RLS a
-- ukáže cizí běhy.
create view public.agent_activity
  with (security_invoker = on)
  as
select
  agent_id,
  count(*) filter (where status in ('queued', 'running')) as open_runs,
  min(created_at) filter (where status in ('queued', 'running')) as oldest_open,
  count(*) filter (where status = 'done')      as done_runs,
  count(*) filter (where status = 'failed')    as failed_runs,
  max(finished_at)                             as last_finished
from public.agent_runs
group by agent_id;
