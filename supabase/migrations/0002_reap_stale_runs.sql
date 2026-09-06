-- ------------------------------------------------------------------
--  Prošlé běhy
--
--  Původní verze tohohle souboru spoléhala na pg_cron: spadlý běh
--  zůstal 'running' a teprve plánovač ho po minutě překlopil na
--  'failed'. To znamenalo, že správnost zlaté barvy visela na tom,
--  jestli ti běží cron. Když ne, uzel svítil donekonečna.
--
--  Tady je to obráceně. Otevřený běh je ten, který je 'queued' nebo
--  'running' A ZÁROVEŇ nepřekročil expires_at. Prošlý běh přestane
--  být zlatý sám od sebe, v okamžiku dotazu, bez čehokoli na pozadí.
--
--  Reaper zůstává, ale je z něj účetnictví, ne správnost: dopíše
--  'failed' a důvod, aby historie odpovídala na „kdo co kdy udělal".
--  Když se nikdy nespustí, obrazovka je pořád pravdivá.
--
--  Tenhle soubor nemá na pg_cron žádnou závislost a projde i bez něj.
-- ------------------------------------------------------------------

-- Ne 'create or replace': to neumí vložit sloupec doprostřed a spadlo
-- by to na 'cannot change name of view column'. View zatím nic
-- nepoužívá, takže ho lze zahodit.
drop view if exists public.agent_activity;

create view public.agent_activity
  with (security_invoker = on)
  as
select
  agent_id,
  count(*) filter (
    where status in ('queued', 'running') and expires_at > now()
  ) as open_runs,
  min(created_at) filter (
    where status in ('queued', 'running') and expires_at > now()
  ) as oldest_open,
  count(*) filter (
    where status in ('queued', 'running') and expires_at <= now()
  ) as stale_runs,
  count(*) filter (where status = 'done')   as done_runs,
  count(*) filter (where status = 'failed') as failed_runs,
  max(finished_at)                          as last_finished
from public.agent_runs
group by agent_id;

-- ---- reaper -------------------------------------------------------

create or replace function public.reap_stale_agent_runs()
  returns integer
  language sql
  security definer
  set search_path = public, pg_temp
as $$
  with reaped as (
    update public.agent_runs
       set status      = 'failed',
           error       = 'timeout: běh nedoběhl do expires_at',
           finished_at = now()
     where status in ('queued', 'running')
       and expires_at < now()
    returning 1
  )
  select count(*)::int from reaped;
$$;

-- security definer funkce obchází RLS a sklidila by cizí běhy.
-- Z prohlížeče ji volat nesmí nikdo.
revoke all on function public.reap_stale_agent_runs() from public;
revoke all on function public.reap_stale_agent_runs() from anon, authenticated;

-- ---- oprávnění ----------------------------------------------------

-- Zahození view s sebou vzalo i granty, které na něm visely. Supabase
-- má pro schéma public nastavené default privileges, takže by se to
-- nejspíš doplnilo samo — ale „nejspíš" je málo, a explicitní grant
-- nic nestojí. RLS tím neobcházíme: view je security_invoker.
grant select on public.agent_activity to authenticated;
