-- ════════════════════════════════════════════════════════════════════════════
-- Módulo Gestão · migration 02 · Estrutura da escola (E1): projetos e tipos de reunião
-- ════════════════════════════════════════════════════════════════════════════
-- ADITIVA: só cria objetos novos e uma coluna nullable em gestao_acoes. Não altera
-- nenhuma tabela/policy/função já existente da migration 01.
--
-- Aplicar numa transação:   psql "$DB_URL" --single-transaction -f migration-gestao-02-configuracao.sql
-- Desfazer:                 migration-gestao-02-rollback.sql
-- ════════════════════════════════════════════════════════════════════════════

-- ── Projetos ────────────────────────────────────────────────────────────────
create table public.gestao_projetos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) > 0),
  descricao text,
  area_id uuid references public.gestao_areas(id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  arquivado_em timestamptz
);
comment on table public.gestao_projetos is
  'Módulo Gestão: projetos que agrupam ações além da área (ex.: "6º Recital", "Campanha de Matrículas").';
create unique index gestao_projetos_nome_unico on public.gestao_projetos (lower(nome)) where arquivado_em is null;
create index gestao_projetos_area_idx on public.gestao_projetos (area_id);

create trigger gestao_projetos_updated_at before update on public.gestao_projetos
  for each row execute function public.update_updated_at_column();

-- ── Tipos de reunião (catálogo, preparação para a etapa de Reuniões) ────────
create table public.gestao_tipos_reuniao (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) > 0),
  cor text,
  posicao int not null default 0,
  arquivado_em timestamptz
);
comment on table public.gestao_tipos_reuniao is
  'Módulo Gestão: catálogo de tipos de reunião (ex.: "Gestão semanal", "Alinhamento de área"). Usado pela etapa de Reuniões.';
create unique index gestao_tipos_reuniao_nome_unico on public.gestao_tipos_reuniao (lower(nome)) where arquivado_em is null;

-- ── Ações passam a poder pertencer a um projeto ─────────────────────────────
-- A coluna gestao_acoes.projeto_id já existia (reservada desde a migration 01,
-- inclusive nas regras de gestao_acoes_regras()); só falta a referência agora
-- que a tabela de projetos existe.
alter table public.gestao_acoes add constraint gestao_acoes_projeto_id_fkey
  foreign key (projeto_id) references public.gestao_projetos(id) on delete set null;
create index gestao_acoes_projeto_idx on public.gestao_acoes (projeto_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.gestao_projetos enable row level security;
alter table public.gestao_tipos_reuniao enable row level security;
revoke all on public.gestao_projetos from anon;
revoke all on public.gestao_tipos_reuniao from anon;

-- Leitura: qualquer membro do módulo. Escrita: quem gerencia áreas ou configurações.
create policy gestao_projetos_select on public.gestao_projetos for select to authenticated
  using ((select public.gestao_meu_membro_id()) is not null);
create policy gestao_projetos_write on public.gestao_projetos for all to authenticated
  using (public.gestao_pode('areas.gerenciar') or public.gestao_pode('config.gerenciar'))
  with check (public.gestao_pode('areas.gerenciar') or public.gestao_pode('config.gerenciar'));

create policy gestao_tipos_reuniao_select on public.gestao_tipos_reuniao for select to authenticated
  using ((select public.gestao_meu_membro_id()) is not null);
create policy gestao_tipos_reuniao_write on public.gestao_tipos_reuniao for all to authenticated
  using (public.gestao_pode('config.gerenciar'))
  with check (public.gestao_pode('config.gerenciar'));
