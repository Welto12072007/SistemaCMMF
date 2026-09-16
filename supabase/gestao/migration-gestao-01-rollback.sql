-- Desfaz migration-gestao-01-fundacao.sql por completo.
-- ATENÇÃO: apaga todas as ações e o histórico do módulo Gestão.
-- Não toca em nenhum objeto do Sistema CMMF fora do prefixo gestao_.
-- psql "$DB_URL" --single-transaction -f migration-gestao-01-rollback.sql

select cron.unschedule('gestao-sincronizar-membros')
where exists (select 1 from cron.job where jobname = 'gestao-sincronizar-membros');

drop table if exists
  public.gestao_historico,
  public.gestao_acao_areas,
  public.gestao_acoes,
  public.gestao_prioridades,
  public.gestao_status_acao,
  public.gestao_atribuicoes,
  public.gestao_perfil_permissoes,
  public.gestao_perfis_acesso,
  public.gestao_permissoes,
  public.gestao_areas,
  public.gestao_membros
cascade;

drop function if exists
  public.gestao_acoes_regras(),
  public.gestao_registrar_historico(),
  public.gestao_sincronizar_membros(),
  public.gestao_pode(text, uuid),
  public.gestao_eh_admin(),
  public.gestao_meu_membro_id(),
  public.gestao_hoje();
