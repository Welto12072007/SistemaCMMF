-- Módulo Gestão · Testes da migration 01 · Permissões (RLS) e regras das ações
-- Cria professores, logins e ações de teste, simula cada usuário e confere o que
-- ele vê e pode fazer. TUDO É DESFEITO no final (bloco que termina em exceção):
-- nada fica gravado, nem nas tabelas do sistema principal.
-- Rodar inteiro no SQL Editor ou via psql. Todas as linhas devem ter ok = true.

create or replace function pg_temp.testes_gestao_01()
returns table (teste text, esperado text, obtido text, ok boolean)
language plpgsql as $$
declare
  t_nome text[] := '{}';
  t_esp  text[] := '{}';
  t_obt  text[] := '{}';
  u_admin  uuid := gen_random_uuid();
  u_will   uuid := gen_random_uuid();
  u_carlos uuid := gen_random_uuid();
  u_ana    uuid := gen_random_uuid();
  u_aluno  uuid := gen_random_uuid();
  pr_will uuid; pr_carlos uuid; pr_ana uuid; pr_temp uuid;
  m_admin uuid; m_will uuid; m_carlos uuid; m_ana uuid; m_temp uuid;
  ar_violao uuid; ar_canto uuid;
  st_concluida uuid;
  a1 uuid; a2 uuid; a3 uuid;
  ids uuid[];
  v_n int;
  v_txt text;
  zero_instance constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  begin
    -- ── Cenário ─────────────────────────────────────────────────────────────
    select id into ar_violao from public.gestao_areas where nome = 'Violão' and arquivada_em is null limit 1;
    select id into ar_canto  from public.gestao_areas where nome = 'Canto'  and arquivada_em is null limit 1;
    select id into st_concluida from public.gestao_status_acao where chave = 'concluida';

    insert into auth.users (id, instance_id, aud, role, email) values
      (u_admin,  zero_instance, 'authenticated', 'authenticated', 'admin@teste-gestao.invalid'),
      (u_will,   zero_instance, 'authenticated', 'authenticated', 'willian@teste-gestao.invalid'),
      (u_carlos, zero_instance, 'authenticated', 'authenticated', 'carlos@teste-gestao.invalid'),
      (u_ana,    zero_instance, 'authenticated', 'authenticated', 'ana@teste-gestao.invalid'),
      (u_aluno,  zero_instance, 'authenticated', 'authenticated', 'aluno@teste-gestao.invalid');

    insert into public.professores (nome, email, instrumentos) values
      ('Teste Willian', 'willian@teste-gestao.invalid', array['Violão']) returning id into pr_will;
    insert into public.professores (nome, email, instrumentos) values
      ('Teste Carlos', 'carlos@teste-gestao.invalid', array['Violão']) returning id into pr_carlos;
    insert into public.professores (nome, email, instrumentos) values
      ('Teste Ana', 'ana@teste-gestao.invalid', array['Canto']) returning id into pr_ana;
    insert into public.professores (nome, instrumentos) values
      ('Teste Sem Login', array['Piano']) returning id into pr_temp;

    insert into public.perfis (user_id, nome, email, role, professor_id) values
      (u_admin,  'Teste Admin',  'admin@teste-gestao.invalid',   'admin',     null),
      (u_will,   'Teste Willian','willian@teste-gestao.invalid', 'professor', pr_will),
      (u_carlos, 'Teste Carlos', 'carlos@teste-gestao.invalid',  'professor', pr_carlos),
      (u_ana,    'Teste Ana',    'ana@teste-gestao.invalid',     'professor', pr_ana),
      (u_aluno,  'Teste Aluno',  'aluno@teste-gestao.invalid',   'aluno',     null);

    perform public.gestao_sincronizar_membros();
    select m.id into m_admin from public.gestao_membros m join public.perfis pf on pf.id = m.perfil_id where pf.user_id = u_admin;
    select id into m_will   from public.gestao_membros where professor_id = pr_will;
    select id into m_carlos from public.gestao_membros where professor_id = pr_carlos;
    select id into m_ana    from public.gestao_membros where professor_id = pr_ana;
    select id into m_temp   from public.gestao_membros where professor_id = pr_temp;

    insert into public.gestao_atribuicoes (membro_id, perfil_acesso_id, escopo_tipo, escopo_id)
    select m_will, p.id, 'area', ar_violao from public.gestao_perfis_acesso p where p.chave = 'gerente';

    insert into public.gestao_acoes (titulo, responsavel_id, area_id, prazo, exige_validacao)
      values ('Revisar apostila de violão nível 2', m_carlos, ar_violao, public.gestao_hoje() + 10, true)
      returning id into a1;
    insert into public.gestao_acoes (titulo, responsavel_id, area_id, prazo)
      values ('Preparar aquecimento vocal do recital', m_ana, ar_canto, public.gestao_hoje() + 10)
      returning id into a2;
    insert into public.gestao_acoes (titulo, responsavel_id, area_id, prazo)
      values ('Definir repertório de violão', m_will, ar_violao, public.gestao_hoje() + 10)
      returning id into a3;
    ids := array[a1, a2, a3];

    -- ── Sincronização com o sistema principal ───────────────────────────────
    select case when m_will is not null and m_carlos is not null and m_ana is not null and m_admin is not null
                then 'sim' else 'não' end into v_txt;
    t_nome := t_nome || 'Professores e admin viram membros automaticamente'; t_esp := t_esp || 'sim'; t_obt := t_obt || v_txt;

    select case when exists (select 1 from public.gestao_membros m join public.perfis pf on pf.id = m.perfil_id where pf.user_id = u_aluno)
                then 'sim' else 'não' end into v_txt;
    t_nome := t_nome || 'Aluno vira membro'; t_esp := t_esp || 'não'; t_obt := t_obt || v_txt;

    select count(*) into v_n from public.gestao_membros where professor_id = pr_carlos;
    perform public.gestao_sincronizar_membros();
    select count(*) into v_n from public.gestao_membros where professor_id = pr_carlos;
    t_nome := t_nome || 'Sincronizar de novo não duplica'; t_esp := t_esp || '1'; t_obt := t_obt || v_n::text;

    -- ── Carlos (professor) ──────────────────────────────────────────────────
    perform set_config('request.jwt.claims', json_build_object('sub', u_carlos, 'role', 'authenticated')::text, true);
    set local role authenticated;

    select count(*) into v_n from public.gestao_acoes where id = any(ids);
    t_nome := t_nome || 'Carlos vê só a própria ação'; t_esp := t_esp || '1'; t_obt := t_obt || v_n::text;

    update public.gestao_acoes set progresso = 40 where id = a1;
    get diagnostics v_n = row_count;
    t_nome := t_nome || 'Carlos atualiza o progresso da própria ação'; t_esp := t_esp || '1'; t_obt := t_obt || v_n::text;

    begin
      update public.gestao_acoes set prazo = prazo + 5 where id = a1;
      v_txt := 'permitido';
    exception when others then v_txt := 'bloqueado';
    end;
    t_nome := t_nome || 'Carlos muda o próprio prazo'; t_esp := t_esp || 'bloqueado'; t_obt := t_obt || v_txt;

    begin
      update public.gestao_acoes set status_id = st_concluida where id = a1;
      v_txt := 'permitido';
    exception when others then v_txt := 'bloqueado';
    end;
    t_nome := t_nome || 'Carlos conclui ação que exige validação'; t_esp := t_esp || 'bloqueado'; t_obt := t_obt || v_txt;

    update public.gestao_acoes set progresso = 90 where id = a2;
    get diagnostics v_n = row_count;
    t_nome := t_nome || 'Carlos altera ação da Ana'; t_esp := t_esp || '0'; t_obt := t_obt || v_n::text;

    begin
      insert into public.gestao_acoes (titulo, responsavel_id, area_id) values ('Ação para a Ana', m_ana, ar_violao);
      v_txt := 'permitido';
    exception when others then v_txt := 'bloqueado';
    end;
    t_nome := t_nome || 'Carlos cria ação para outra pessoa'; t_esp := t_esp || 'bloqueado'; t_obt := t_obt || v_txt;

    begin
      insert into public.gestao_acoes (titulo, responsavel_id, area_id) values ('Estudar novo método', m_carlos, ar_violao);
      v_txt := 'permitido';
    exception when others then v_txt := 'bloqueado: ' || sqlerrm;
    end;
    t_nome := t_nome || 'Carlos cria ação para si mesmo'; t_esp := t_esp || 'permitido'; t_obt := t_obt || v_txt;

    select case when count(*) > 0 then 'sim' else 'não' end into v_txt from public.gestao_areas;
    t_nome := t_nome || 'Carlos enxerga as áreas da escola'; t_esp := t_esp || 'sim'; t_obt := t_obt || v_txt;

    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- ── Ana (professora de outra área) ──────────────────────────────────────
    perform set_config('request.jwt.claims', json_build_object('sub', u_ana, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.gestao_acoes where id = any(ids);
    t_nome := t_nome || 'Ana vê só a própria ação'; t_esp := t_esp || '1'; t_obt := t_obt || v_n::text;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- ── Willian (gerente de Violão) ─────────────────────────────────────────
    perform set_config('request.jwt.claims', json_build_object('sub', u_will, 'role', 'authenticated')::text, true);
    set local role authenticated;

    select count(*) into v_n from public.gestao_acoes where area_id = ar_violao and id = any(ids || array(select id from public.gestao_acoes where criado_por = m_carlos));
    t_nome := t_nome || 'Willian vê todas as ações de Violão'; t_esp := t_esp || '3'; t_obt := t_obt || v_n::text;

    select count(*) into v_n from public.gestao_acoes where id = a2;
    t_nome := t_nome || 'Willian não vê ações de Canto'; t_esp := t_esp || '0'; t_obt := t_obt || v_n::text;

    begin
      update public.gestao_acoes set prazo = prazo + 7 where id = a1;
      v_txt := 'permitido';
    exception when others then v_txt := 'bloqueado: ' || sqlerrm;
    end;
    t_nome := t_nome || 'Willian muda o prazo de ação de Violão'; t_esp := t_esp || 'permitido'; t_obt := t_obt || v_txt;

    begin
      update public.gestao_acoes set status_id = st_concluida where id = a1;
      v_txt := 'permitido';
    exception when others then v_txt := 'bloqueado: ' || sqlerrm;
    end;
    t_nome := t_nome || 'Willian conclui a ação que exige validação'; t_esp := t_esp || 'permitido'; t_obt := t_obt || v_txt;

    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- ── Histórico ───────────────────────────────────────────────────────────
    select format('%s → %s', alteracoes -> 'prazo' ->> 'antes', alteracoes -> 'prazo' ->> 'depois') into v_txt
    from public.gestao_historico where registro_id = a1 and operacao = 'UPDATE' and alteracoes ? 'prazo'
    order by id desc limit 1;
    t_nome := t_nome || 'Histórico registra o prazo anterior e o novo';
    t_esp := t_esp || format('%s → %s', public.gestao_hoje() + 10, public.gestao_hoje() + 17);
    t_obt := t_obt || coalesce(v_txt, 'nada registrado');

    select case when membro_id = m_will then 'Willian' else coalesce(membro_id::text, 'ninguém') end into v_txt
    from public.gestao_historico where registro_id = a1 and operacao = 'UPDATE' and alteracoes ? 'prazo'
    order by id desc limit 1;
    t_nome := t_nome || 'Histórico registra quem alterou'; t_esp := t_esp || 'Willian'; t_obt := t_obt || coalesce(v_txt, 'nada');

    select progresso::text into v_txt from public.gestao_acoes where id = a1;
    t_nome := t_nome || 'Concluir leva o progresso a 100%'; t_esp := t_esp || '100'; t_obt := t_obt || v_txt;

    perform set_config('request.jwt.claims', json_build_object('sub', u_carlos, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select case when count(*) > 0 then 'sim' else 'não' end into v_txt from public.gestao_historico where registro_id = a1;
    t_nome := t_nome || 'Carlos lê o histórico da própria ação'; t_esp := t_esp || 'sim'; t_obt := t_obt || v_txt;
    select count(*) into v_n from public.gestao_historico where registro_id = a2;
    t_nome := t_nome || 'Carlos lê o histórico da ação da Ana'; t_esp := t_esp || '0'; t_obt := t_obt || v_n::text;
    select count(*) into v_n from public.gestao_historico where tabela = 'gestao_atribuicoes';
    t_nome := t_nome || 'Carlos lê o histórico de atribuições'; t_esp := t_esp || '0'; t_obt := t_obt || v_n::text;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- ── Administrador do sistema ────────────────────────────────────────────
    perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select count(*) into v_n from public.gestao_acoes where id = any(ids);
    t_nome := t_nome || 'Admin do sistema vê todas as ações'; t_esp := t_esp || '3'; t_obt := t_obt || v_n::text;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- ── Aluno logado ────────────────────────────────────────────────────────
    perform set_config('request.jwt.claims', json_build_object('sub', u_aluno, 'role', 'authenticated')::text, true);
    set local role authenticated;
    select (select count(*) from public.gestao_acoes) + (select count(*) from public.gestao_membros)
         + (select count(*) from public.gestao_areas) into v_n;
    t_nome := t_nome || 'Aluno logado vê algo do módulo'; t_esp := t_esp || '0'; t_obt := t_obt || v_n::text;
    begin
      insert into public.gestao_acoes (titulo) values ('Tentativa de aluno');
      v_txt := 'permitido';
    exception when others then v_txt := 'bloqueado';
    end;
    t_nome := t_nome || 'Aluno cria ação'; t_esp := t_esp || 'bloqueado'; t_obt := t_obt || v_txt;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- ── Visitante sem login ─────────────────────────────────────────────────
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    set local role anon;
    begin
      select count(*) into v_n from public.gestao_acoes;
      v_txt := v_n::text || ' linhas';
    exception when others then v_txt := 'sem acesso';
    end;
    t_nome := t_nome || 'Visitante sem login lê ações'; t_esp := t_esp || 'sem acesso'; t_obt := t_obt || v_txt;
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- ── Convivência com o sistema principal ─────────────────────────────────
    begin
      delete from public.professores where id = pr_temp;
      v_txt := 'permitido';
    exception when others then v_txt := 'bloqueado: ' || sqlerrm;
    end;
    t_nome := t_nome || 'Excluir professor no Sistema CMMF continua funcionando'; t_esp := t_esp || 'permitido'; t_obt := t_obt || v_txt;

    select case when nome = 'Teste Sem Login' then 'mantido' else coalesce(nome, 'perdido') end into v_txt
    from public.gestao_membros where id = m_temp;
    t_nome := t_nome || 'Nome do membro fica no histórico após a exclusão'; t_esp := t_esp || 'mantido'; t_obt := t_obt || coalesce(v_txt, 'perdido');

    raise exception 'fim_do_teste';
  exception when others then
    if sqlerrm <> 'fim_do_teste' then
      t_nome := t_nome || 'ERRO INESPERADO'; t_esp := t_esp || '—'; t_obt := t_obt || sqlerrm;
    end if;
  end;

  return query
    select n, e, o, n <> 'ERRO INESPERADO' and e = o
    from unnest(t_nome, t_esp, t_obt) as x(n, e, o);
end $$;

select * from pg_temp.testes_gestao_01();
