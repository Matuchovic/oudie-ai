-- ------------------------------------------------------------------
--  Naplánování reaperu — VOLITELNÉ
--
--  Pusť až po zapnutí Supabase Cron: Dashboard → Integrations → Cron.
--  Bez toho neexistuje schéma `cron` a tenhle soubor spadne.
--
--  Není to nutné k tomu, aby appka ukazovala pravdu — o to se stará
--  expires_at v 0002. Tohle jen doklidí historii.
-- ------------------------------------------------------------------

select cron.schedule(
  'reap-stale-agent-runs',
  '* * * * *',
  $$select public.reap_stale_agent_runs()$$
);
