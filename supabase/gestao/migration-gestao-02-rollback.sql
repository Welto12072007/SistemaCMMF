-- Módulo Gestão · rollback da migration 02 (Estrutura da escola: projetos e tipos de reunião)
-- Remove só os objetos criados nesta migration. Não afeta a migration 01.

alter table public.gestao_acoes drop constraint if exists gestao_acoes_projeto_id_fkey;
drop index if exists public.gestao_acoes_projeto_idx;
drop table if exists public.gestao_projetos cascade;
drop table if exists public.gestao_tipos_reuniao cascade;
