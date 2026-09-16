-- ════════════════════════════════════════════════════════════════════════════
-- Módulo Gestão (Reuniões, Ações & PDCA) · migration 01 · Fundação e ações
-- ════════════════════════════════════════════════════════════════════════════
-- ADITIVA: só cria objetos com prefixo gestao_. Não altera nenhuma tabela,
-- policy, função ou gatilho já existente no Sistema CMMF.
--
-- Reusa do sistema: perfis (login e papel base), professores (pessoas e
-- instrumentos) e update_updated_at_column().
--
-- Aplicar numa transação:   psql "$DB_URL" --single-transaction -f migration-gestao-01-fundacao.sql
-- Desfazer:                 migration-gestao-01-rollback.sql
-- Testar (não grava nada):  testes-gestao-01.sql
-- Número de versão (Vnn) a definir pelo desenvolvedor ao registrar no CHANGELOG.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Membros ─────────────────────────────────────────────────────────────────
-- Quem participa de reuniões e ações. Liga-se a professores/perfis em vez de
-- duplicar o cadastro. "nome" é copiado da origem pela sincronização e fica
-- como registro histórico se o cadastro de origem for removido.
create table public.gestao_membros (
  id uuid primary key default gen_random_uuid(),
  professor_id uuid unique references public.professores(id) on delete set null,
  perfil_id uuid unique references public.perfis(id) on delete set null,
  origem text not null default 'sistema' check (origem in ('sistema', 'avulso')),
  nome text not null check (length(btrim(nome)) > 0),
  cargo text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.gestao_membros is
  'Módulo Gestão: pessoas do módulo, ligadas a professores/perfis (origem=sistema) ou cadastradas à parte (origem=avulso).';

-- ── Áreas ───────────────────────────────────────────────────────────────────
-- Hierárquicas (Pedagógico › Violão). "instrumento" casa com professores.instrumentos
-- para listar automaticamente os professores de uma área.
create table public.gestao_areas (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.gestao_areas(id) on delete restrict,
  nome text not null check (length(btrim(nome)) > 0),
  instrumento text,
  cor text,
  posicao int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  arquivada_em timestamptz,
  constraint gestao_areas_sem_autorreferencia check (parent_id is distinct from id)
);
create unique index gestao_areas_nome_unico on public.gestao_areas
  (coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(nome))
  where arquivada_em is null;
create index gestao_areas_parent_idx on public.gestao_areas (parent_id);

-- ── Perfil + Escopo + Permissões ────────────────────────────────────────────
-- O papel base vem de perfis.role: admin = acesso total no módulo;
-- professor e recepção = criar e atualizar as próprias ações.
-- Aqui ficam só os papéis COM ESCOPO (ex.: gerente de Violão).
create table public.gestao_permissoes (
  chave text primary key,
  descricao text not null
);

create table public.gestao_perfis_acesso (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  nome text not null,
  descricao text,
  sistema boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.gestao_perfil_permissoes (
  perfil_acesso_id uuid not null references public.gestao_perfis_acesso(id) on delete cascade,
  permissao_chave text not null references public.gestao_permissoes(chave) on delete cascade,
  primary key (perfil_acesso_id, permissao_chave)
);

create table public.gestao_atribuicoes (
  id uuid primary key default gen_random_uuid(),
  membro_id uuid not null references public.gestao_membros(id) on delete cascade,
  perfil_acesso_id uuid not null references public.gestao_perfis_acesso(id) on delete cascade,
  escopo_tipo text not null check (escopo_tipo in ('geral', 'area', 'projeto')),
  escopo_id uuid,
  created_at timestamptz not null default now(),
  criado_por uuid references public.gestao_membros(id) on delete set null,
  constraint gestao_atribuicoes_escopo check ((escopo_tipo = 'geral') = (escopo_id is null))
);
create unique index gestao_atribuicoes_unica on public.gestao_atribuicoes
  (membro_id, perfil_acesso_id, escopo_tipo, coalesce(escopo_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index gestao_atribuicoes_membro_idx on public.gestao_atribuicoes (membro_id);

-- ── Catálogos das ações ─────────────────────────────────────────────────────
create table public.gestao_status_acao (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  nome text not null,
  categoria text not null check (categoria in ('aberta', 'concluida', 'cancelada')),
  cor text,
  posicao int not null default 0,
  sistema boolean not null default false
);

create table public.gestao_prioridades (
  id uuid primary key default gen_random_uuid(),
  chave text not null unique,
  nome text not null,
  peso int not null check (peso > 0),
  cor text,
  posicao int not null default 0
);

-- ── Ações ───────────────────────────────────────────────────────────────────
create table public.gestao_acoes (
  id uuid primary key default gen_random_uuid(),

  -- O quê? Por quê? Como saberemos que foi concluído?
  titulo text not null check (length(btrim(titulo)) > 0),
  descricao text,
  motivo text,
  criterio_conclusao text,

  -- Quem?
  responsavel_id uuid references public.gestao_membros(id) on delete set null,
  gerente_frente_id uuid references public.gestao_membros(id) on delete set null,
  criado_por uuid references public.gestao_membros(id) on delete set null,
  area_id uuid references public.gestao_areas(id) on delete set null,
  projeto_id uuid,

  -- De onde veio e quando revisar? (chaves estrangeiras entram com reuniões/PDCA)
  origem_tipo text not null default 'manual'
    check (origem_tipo in ('manual', 'reuniao', 'decisao', 'problema', 'pdca')),
  reuniao_origem_id uuid,
  item_origem_id uuid,
  reuniao_revisao_id uuid,
  revisar_proxima_reuniao boolean not null default false,
  pdca_ciclo_id uuid,

  status_id uuid not null references public.gestao_status_acao(id),
  prioridade_id uuid not null references public.gestao_prioridades(id),
  progresso smallint not null default 0 check (progresso between 0 and 100),
  exige_validacao boolean not null default false,
  motivo_bloqueio text,
  motivo_cancelamento text,

  -- Quando? prazo = atual; prazo_original = o primeiro definido;
  -- prazo_referencia = o que vale para medir atraso (ver gestao_acoes_regras).
  prazo date,
  prazo_original date,
  prazo_referencia date,

  iniciada_em timestamptz,
  concluida_em timestamptz,
  cancelada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index gestao_acoes_status_idx on public.gestao_acoes (status_id);
create index gestao_acoes_responsavel_idx on public.gestao_acoes (responsavel_id);
create index gestao_acoes_area_idx on public.gestao_acoes (area_id);
create index gestao_acoes_prazo_idx on public.gestao_acoes (prazo);

create table public.gestao_acao_areas (
  acao_id uuid not null references public.gestao_acoes(id) on delete cascade,
  area_id uuid not null references public.gestao_areas(id) on delete cascade,
  primary key (acao_id, area_id)
);

-- ── Histórico ───────────────────────────────────────────────────────────────
-- Próprio do módulo (system_logs aceita escrita de qualquer usuário logado, o
-- que não serve para histórico confiável).
create table public.gestao_historico (
  id bigint generated always as identity primary key,
  tabela text not null,
  registro_id uuid not null,
  operacao text not null check (operacao in ('INSERT', 'UPDATE', 'DELETE')),
  alteracoes jsonb not null default '{}'::jsonb,
  membro_id uuid,
  user_id uuid,
  created_at timestamptz not null default now()
);
create index gestao_historico_registro_idx on public.gestao_historico (tabela, registro_id, created_at desc);
create index gestao_historico_data_idx on public.gestao_historico (created_at desc);

-- ── Funções de acesso ───────────────────────────────────────────────────────
create or replace function public.gestao_hoje() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

-- Membro do usuário logado. Alunos (e quem não tem perfil) não têm membro.
create or replace function public.gestao_meu_membro_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select m.id
  from public.perfis pf
  join public.gestao_membros m
    on m.perfil_id = pf.id
    or (pf.professor_id is not null and m.professor_id = pf.professor_id)
  where pf.user_id = auth.uid()
    and pf.ativo is not false
    and pf.role in ('admin', 'recepcao', 'professor')
    and m.ativo
  order by (m.perfil_id = pf.id) desc
  limit 1
$$;

create or replace function public.gestao_eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfis pf
    where pf.user_id = auth.uid() and pf.role = 'admin' and pf.ativo is not false
  )
$$;

-- Tem a permissão no escopo geral ou num escopo de área que contém p_area_id?
-- UNION (e não UNION ALL) garante que a subida na hierarquia termina mesmo com ciclo.
create or replace function public.gestao_pode(p_permissao text, p_area_id uuid default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  with recursive acima as (
    select a.id, a.parent_id from public.gestao_areas a where a.id = p_area_id
    union
    select a.id, a.parent_id from public.gestao_areas a join acima on a.id = acima.parent_id
  )
  select public.gestao_eh_admin()
    or (p_permissao = 'acoes.criar_proprias' and public.gestao_meu_membro_id() is not null)
    or exists (
      select 1 from public.gestao_atribuicoes at
      join public.gestao_perfil_permissoes pp on pp.perfil_acesso_id = at.perfil_acesso_id
      where at.membro_id = public.gestao_meu_membro_id()
        and pp.permissao_chave = p_permissao
        and (at.escopo_tipo = 'geral'
             or (at.escopo_tipo = 'area' and at.escopo_id in (select id from acima)))
    )
$$;

-- ── Sincronização de membros com professores e perfis ───────────────────────
-- Idempotente. Roda pelo pg_cron e sempre que o módulo abre. Não escreve em
-- nenhuma tabela do sistema principal.
create or replace function public.gestao_sincronizar_membros() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_novos int := 0;
  v_n int;
begin
  -- Professores ainda sem membro
  insert into public.gestao_membros (professor_id, perfil_id, nome, cargo)
  select pr.id,
         (select pf.id from public.perfis pf
          where pf.professor_id = pr.id
            and not exists (select 1 from public.gestao_membros x where x.perfil_id = pf.id)
          order by pf.created_at limit 1),
         pr.nome, 'Professor'
  from public.professores pr
  where not exists (select 1 from public.gestao_membros m where m.professor_id = pr.id);
  get diagnostics v_n = row_count; v_novos := v_novos + v_n;

  -- Professor que ganhou login depois
  update public.gestao_membros m set perfil_id = pf.id
  from public.perfis pf
  where pf.professor_id = m.professor_id and m.perfil_id is null
    and not exists (select 1 from public.gestao_membros x where x.perfil_id = pf.id);

  -- Equipe (admin e recepção) sem vínculo com professor
  insert into public.gestao_membros (perfil_id, nome, cargo)
  select pf.id, pf.nome, case pf.role when 'admin' then 'Administração' else 'Recepção' end
  from public.perfis pf
  where pf.role in ('admin', 'recepcao') and pf.professor_id is null
    and not exists (select 1 from public.gestao_membros m where m.perfil_id = pf.id);
  get diagnostics v_n = row_count; v_novos := v_novos + v_n;

  -- Nome e situação acompanham a origem
  update public.gestao_membros m set
    nome = coalesce(pr.nome, pf.nome, m.nome),
    ativo = case
      when m.professor_id is null and m.perfil_id is null then false
      else coalesce(pr.ativo, true) and coalesce(pf.ativo, true)
           and coalesce(pf.role, 'professor') <> 'aluno'
    end
  from public.gestao_membros m2
  left join public.professores pr on pr.id = m2.professor_id
  left join public.perfis pf on pf.id = m2.perfil_id
  where m.id = m2.id and m.origem = 'sistema'
    and (m.nome is distinct from coalesce(pr.nome, pf.nome, m.nome)
         or m.ativo is distinct from case
              when m.professor_id is null and m.perfil_id is null then false
              else coalesce(pr.ativo, true) and coalesce(pf.ativo, true)
                   and coalesce(pf.role, 'professor') <> 'aluno'
            end);

  return jsonb_build_object('ok', true, 'novos', v_novos);
end $$;

-- ── Histórico automático ────────────────────────────────────────────────────
-- UPDATE grava só os campos alterados: {"prazo": {"antes": ..., "depois": ...}}.
create or replace function public.gestao_registrar_historico() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_alt jsonb := '{}'::jsonb;
  k text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_alt := v_new - 'created_at' - 'updated_at';
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    for k in select jsonb_object_keys(v_new) loop
      if k <> 'updated_at' and (v_old -> k) is distinct from (v_new -> k) then
        v_alt := v_alt || jsonb_build_object(k, jsonb_build_object('antes', v_old -> k, 'depois', v_new -> k));
      end if;
    end loop;
    if v_alt = '{}'::jsonb then
      return new;
    end if;
  else
    v_old := to_jsonb(old);
    v_alt := v_old;
  end if;

  insert into public.gestao_historico (tabela, registro_id, operacao, alteracoes, membro_id, user_id)
  values (tg_table_name, coalesce(v_new ->> 'id', v_old ->> 'id')::uuid, tg_op, v_alt,
          public.gestao_meu_membro_id(), auth.uid());
  return coalesce(new, old);
end $$;

-- ── Regras da ação ──────────────────────────────────────────────────────────
-- Valem em qualquer tela. auth.uid() nulo = contexto do sistema (migrations, jobs).
create or replace function public.gestao_acoes_regras() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_cat_nova text;
  v_chave_nova text;
  v_cat_antiga text;
  v_gerencia boolean;
begin
  -- Padrões: "Não iniciada" e "Média"
  if new.status_id is null then
    select s.id into new.status_id from public.gestao_status_acao s where s.chave = 'nao_iniciada';
  end if;
  if new.prioridade_id is null then
    select p.id into new.prioridade_id from public.gestao_prioridades p where p.chave = 'media';
  end if;

  select s.categoria, s.chave into v_cat_nova, v_chave_nova
  from public.gestao_status_acao s where s.id = new.status_id;

  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, public.gestao_meu_membro_id());
    new.prazo_original := coalesce(new.prazo_original, new.prazo);
    new.prazo_referencia := coalesce(new.prazo_referencia, new.prazo);
  else
    select s.categoria into v_cat_antiga from public.gestao_status_acao s where s.id = old.status_id;

    -- Quem não gerencia a área só atualiza a execução: status, progresso,
    -- descrição, critério e motivos.
    if auth.uid() is not null then
      v_gerencia := public.gestao_pode('acoes.gerenciar', old.area_id)
        and (new.area_id is not distinct from old.area_id
             or public.gestao_pode('acoes.gerenciar', new.area_id));
      if not v_gerencia then
        if new.responsavel_id is distinct from old.responsavel_id
           or new.prazo is distinct from old.prazo
           or new.area_id is distinct from old.area_id
           or new.projeto_id is distinct from old.projeto_id
           or new.prioridade_id is distinct from old.prioridade_id
           or new.exige_validacao is distinct from old.exige_validacao
           or new.gerente_frente_id is distinct from old.gerente_frente_id
           or new.prazo_original is distinct from old.prazo_original
           or new.prazo_referencia is distinct from old.prazo_referencia
           or new.criado_por is distinct from old.criado_por then
          raise exception 'Só o gerente da área pode alterar responsável, prazo, área, projeto ou prioridade. Use "Pedir novo prazo".'
            using errcode = '42501';
        end if;
        if v_cat_nova = 'concluida' and v_cat_antiga <> 'concluida' and new.exige_validacao then
          raise exception 'Esta ação exige validação: mova para "Em revisão" e o gerente conclui.'
            using errcode = '42501';
        end if;
      end if;
    end if;

    -- Prazo de referência: renegociar antes de vencer vale o novo prazo;
    -- mudar depois de já atrasada mantém a referência anterior.
    if new.prazo is distinct from old.prazo then
      if old.prazo_referencia is null or old.prazo_referencia >= public.gestao_hoje() then
        new.prazo_referencia := new.prazo;
      end if;
      new.prazo_original := coalesce(old.prazo_original, new.prazo);
    end if;
  end if;

  if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
    if v_chave_nova = 'bloqueada' and coalesce(btrim(new.motivo_bloqueio), '') = '' then
      raise exception 'Informe o motivo do bloqueio.' using errcode = '23514';
    end if;
    if v_cat_nova = 'cancelada' and coalesce(btrim(new.motivo_cancelamento), '') = '' then
      raise exception 'Informe o motivo do cancelamento.' using errcode = '23514';
    end if;
    if v_cat_nova = 'concluida' then
      new.concluida_em := coalesce(new.concluida_em, now());
      new.progresso := 100;
    else
      new.concluida_em := null;
    end if;
    if v_cat_nova = 'cancelada' then
      new.cancelada_em := coalesce(new.cancelada_em, now());
    else
      new.cancelada_em := null;
    end if;
    if v_chave_nova = 'em_andamento' and new.iniciada_em is null then
      new.iniciada_em := now();
    end if;
  end if;

  return new;
end $$;

-- ── Gatilhos ────────────────────────────────────────────────────────────────
create trigger gestao_membros_updated_at before update on public.gestao_membros
  for each row execute function public.update_updated_at_column();
create trigger gestao_areas_updated_at before update on public.gestao_areas
  for each row execute function public.update_updated_at_column();
create trigger gestao_acoes_updated_at before update on public.gestao_acoes
  for each row execute function public.update_updated_at_column();

create trigger gestao_acoes_regras before insert or update on public.gestao_acoes
  for each row execute function public.gestao_acoes_regras();

create trigger gestao_acoes_historico after insert or update or delete on public.gestao_acoes
  for each row execute function public.gestao_registrar_historico();
create trigger gestao_atribuicoes_historico after insert or update or delete on public.gestao_atribuicoes
  for each row execute function public.gestao_registrar_historico();
create trigger gestao_areas_historico after insert or update or delete on public.gestao_areas
  for each row execute function public.gestao_registrar_historico();

-- ── RLS (ADR-0002: toda tabela nova nasce com RLS e policy explícita) ────────
alter table public.gestao_membros            enable row level security;
alter table public.gestao_areas              enable row level security;
alter table public.gestao_permissoes         enable row level security;
alter table public.gestao_perfis_acesso      enable row level security;
alter table public.gestao_perfil_permissoes  enable row level security;
alter table public.gestao_atribuicoes        enable row level security;
alter table public.gestao_status_acao        enable row level security;
alter table public.gestao_prioridades        enable row level security;
alter table public.gestao_acoes              enable row level security;
alter table public.gestao_acao_areas         enable row level security;
alter table public.gestao_historico          enable row level security;

-- Os privilégios padrão do schema dão tudo ao anon; o módulo não é público.
revoke all on public.gestao_membros, public.gestao_areas, public.gestao_permissoes,
  public.gestao_perfis_acesso, public.gestao_perfil_permissoes, public.gestao_atribuicoes,
  public.gestao_status_acao, public.gestao_prioridades, public.gestao_acoes,
  public.gestao_acao_areas, public.gestao_historico from anon;
revoke execute on function public.gestao_sincronizar_membros() from anon;

-- Leitura dos cadastros: qualquer membro (professor, recepção, admin). Aluno não.
create policy gestao_membros_select on public.gestao_membros for select to authenticated
  using ((select public.gestao_meu_membro_id()) is not null);
create policy gestao_membros_write on public.gestao_membros for all to authenticated
  using (public.gestao_pode('membros.gerenciar'))
  with check (public.gestao_pode('membros.gerenciar'));

create policy gestao_areas_select on public.gestao_areas for select to authenticated
  using ((select public.gestao_meu_membro_id()) is not null);
create policy gestao_areas_insert on public.gestao_areas for insert to authenticated
  with check (public.gestao_pode('areas.gerenciar'));
create policy gestao_areas_update on public.gestao_areas for update to authenticated
  using (public.gestao_pode('areas.gerenciar'))
  with check (public.gestao_pode('areas.gerenciar'));

create policy gestao_permissoes_select on public.gestao_permissoes for select to authenticated
  using ((select public.gestao_meu_membro_id()) is not null);

create policy gestao_perfis_acesso_select on public.gestao_perfis_acesso for select to authenticated
  using ((select public.gestao_meu_membro_id()) is not null);
create policy gestao_perfis_acesso_write on public.gestao_perfis_acesso for all to authenticated
  using (public.gestao_pode('config.gerenciar'))
  with check (public.gestao_pode('config.gerenciar'));

create policy gestao_perfil_permissoes_select on public.gestao_perfil_permissoes for select to authenticated
  using ((select public.gestao_meu_membro_id()) is not null);
create policy gestao_perfil_permissoes_write on public.gestao_perfil_permissoes for all to authenticated
  using (public.gestao_pode('config.gerenciar'))
  with check (public.gestao_pode('config.gerenciar'));

-- Todos os membros veem quem gerencia o quê ("quem coordena cada frente").
create policy gestao_atribuicoes_select on public.gestao_atribuicoes for select to authenticated
  using ((select public.gestao_meu_membro_id()) is not null);
create policy gestao_atribuicoes_write on public.gestao_atribuicoes for all to authenticated
  using (public.gestao_pode('config.gerenciar'))
  with check (public.gestao_pode('config.gerenciar'));

create policy gestao_status_acao_select on public.gestao_status_acao for select to authenticated
  using ((select public.gestao_meu_membro_id()) is not null);
create policy gestao_status_acao_write on public.gestao_status_acao for all to authenticated
  using (public.gestao_pode('config.gerenciar'))
  with check (public.gestao_pode('config.gerenciar'));

create policy gestao_prioridades_select on public.gestao_prioridades for select to authenticated
  using ((select public.gestao_meu_membro_id()) is not null);
create policy gestao_prioridades_write on public.gestao_prioridades for all to authenticated
  using (public.gestao_pode('config.gerenciar'))
  with check (public.gestao_pode('config.gerenciar'));

-- Ações: vê as próprias, as que criou, as que coordena e as do escopo que gerencia.
-- (Ações das reuniões em que a pessoa participa entram com o módulo de reuniões.)
create policy gestao_acoes_select on public.gestao_acoes for select to authenticated
  using ((select public.gestao_meu_membro_id()) is not null
         and (responsavel_id = (select public.gestao_meu_membro_id())
              or criado_por = (select public.gestao_meu_membro_id())
              or gerente_frente_id = (select public.gestao_meu_membro_id())
              or public.gestao_pode('acoes.ver_escopo', area_id)));

-- Cria: gerente para o escopo; os demais só para si mesmos.
create policy gestao_acoes_insert on public.gestao_acoes for insert to authenticated
  with check (public.gestao_pode('acoes.gerenciar', area_id)
              or (responsavel_id = (select public.gestao_meu_membro_id())
                  and public.gestao_pode('acoes.criar_proprias')));

-- Atualiza: o responsável ou o gerente do escopo. Quais campos, decide gestao_acoes_regras.
create policy gestao_acoes_update on public.gestao_acoes for update to authenticated
  using (responsavel_id = (select public.gestao_meu_membro_id())
         or public.gestao_pode('acoes.gerenciar', area_id))
  with check (responsavel_id = (select public.gestao_meu_membro_id())
              or public.gestao_pode('acoes.gerenciar', area_id));
-- Sem policy de DELETE: ações são canceladas, nunca apagadas.

create policy gestao_acao_areas_select on public.gestao_acao_areas for select to authenticated
  using (exists (select 1 from public.gestao_acoes a where a.id = acao_id));
create policy gestao_acao_areas_write on public.gestao_acao_areas for all to authenticated
  using (exists (select 1 from public.gestao_acoes a
                 where a.id = acao_id and public.gestao_pode('acoes.gerenciar', a.area_id)))
  with check (exists (select 1 from public.gestao_acoes a
                      where a.id = acao_id and public.gestao_pode('acoes.gerenciar', a.area_id)));

-- Histórico: o admin vê tudo; os demais, o das ações que já podem ver.
create policy gestao_historico_select on public.gestao_historico for select to authenticated
  using (public.gestao_pode('config.gerenciar')
         or (tabela = 'gestao_acoes'
             and exists (select 1 from public.gestao_acoes a where a.id = gestao_historico.registro_id)));

-- ── Dados iniciais ──────────────────────────────────────────────────────────
insert into public.gestao_permissoes (chave, descricao) values
  ('config.gerenciar',        'Configurações do módulo, perfis de acesso e atribuições'),
  ('membros.gerenciar',       'Cadastrar membros avulsos e editar cargos'),
  ('areas.gerenciar',         'Cadastrar e editar áreas'),
  ('reunioes.ver_escopo',     'Ver reuniões do escopo'),
  ('reunioes.gerenciar',      'Criar e editar reuniões do escopo'),
  ('acoes.ver_escopo',        'Ver ações do escopo'),
  ('acoes.gerenciar',         'Criar, atribuir e editar ações do escopo'),
  ('acoes.criar_proprias',    'Criar ações para si'),
  ('performance.ver_escopo',  'Ver performance do escopo');

with g as (
  insert into public.gestao_perfis_acesso (chave, nome, descricao, sistema)
  values ('gerente', 'Gerente', 'Visualiza e gerencia a sua área', true)
  returning id
)
insert into public.gestao_perfil_permissoes (perfil_acesso_id, permissao_chave)
select g.id, k from g, unnest(array['reunioes.ver_escopo', 'reunioes.gerenciar', 'acoes.ver_escopo',
                                    'acoes.gerenciar', 'acoes.criar_proprias', 'performance.ver_escopo']) as k;

insert into public.gestao_status_acao (chave, nome, categoria, cor, posicao, sistema) values
  ('nao_iniciada', 'Não iniciada', 'aberta',    'slate',  1, true),
  ('em_andamento', 'Em andamento', 'aberta',    'blue',   2, true),
  ('em_revisao',   'Em revisão',   'aberta',    'violet', 3, true),
  ('bloqueada',    'Bloqueada',    'aberta',    'red',    4, true),
  ('adiada',       'Adiada',       'aberta',    'amber',  5, true),
  ('concluida',    'Concluída',    'concluida', 'green',  6, true),
  ('cancelada',    'Cancelada',    'cancelada', 'gray',   7, true);

insert into public.gestao_prioridades (chave, nome, peso, cor, posicao) values
  ('baixa',   'Baixa',   1, 'slate', 1),
  ('media',   'Média',   2, 'blue',  2),
  ('alta',    'Alta',    3, 'amber', 3),
  ('critica', 'Crítica', 5, 'red',   4);

-- Áreas: Pedagógico com os instrumentos que os professores ativos realmente dão aula.
with ped as (
  insert into public.gestao_areas (nome, posicao) values ('Pedagógico', 10) returning id
)
insert into public.gestao_areas (parent_id, nome, instrumento, posicao)
select ped.id, i.instrumento, i.instrumento, (row_number() over (order by i.instrumento))::int
from ped, (select distinct btrim(x) as instrumento
           from public.professores, unnest(instrumentos) as x
           where ativo is not false and btrim(x) <> '') i;

with ev as (
  insert into public.gestao_areas (nome, posicao) values ('Eventos', 20) returning id
)
insert into public.gestao_areas (parent_id, nome, posicao) select ev.id, 'Recital', 1 from ev;

insert into public.gestao_areas (nome, posicao)
select n, 20 + i::int
from unnest(array['Marketing', 'Comercial', 'Atendimento', 'Financeiro', 'Administrativo',
                  'Estrutura', 'Tecnologia', 'Experiência do aluno', 'Pessoas',
                  'Capacitação']) with ordinality as t(n, i);

-- Primeira sincronização e agendamento (a cada 15 min)
select public.gestao_sincronizar_membros();
select cron.schedule('gestao-sincronizar-membros', '*/15 * * * *',
                     'select public.gestao_sincronizar_membros()');
