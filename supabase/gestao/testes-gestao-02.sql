-- Módulo Gestão · testes da migration 02 (projetos e tipos de reunião)
-- Cria dados de teste e desfaz tudo no final (mesmo padrão do testes-gestao-01.sql).
-- Todas as linhas devem vir com ok = true.

create or replace function pg_temp.testes_gestao_02()
returns table (teste text, esperado text, obtido text, ok boolean)
language plpgsql as $$
declare
  t_nome text[] := '{}';
  t_esp  text[] := '{}';
  t_obt  text[] := '{}';
  u_admin  uuid := gen_random_uuid();
  u_will   uuid := gen_random_uuid();
  pr_will uuid;
  m_admin uuid; m_will uuid;
  ar_violao uuid;
  proj uuid;
  v_txt text;
  v_n int;
  zero_instance constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  begin
    select id into ar_violao from public.gestao_areas where nome = 'Violão' and arquivada_em is null limit 1;

    insert into auth.users (id, instance_id, aud, role, email) values
      (u_admin, zero_instance, 'authenticated', 'authenticated', 'admin@teste-gestao02.invalid'),
      (u_will,  zero_instance, 'authenticated', 'authenticated', 'willian@teste-gestao02.invalid');

    insert into public.professores (nome, email, instrumentos) values
      ('Teste Willian 02', 'willian@teste-gestao02.invalid', array['Violão']) returning id into pr_will;

    insert into public.perfis (user_id, nome, email, role, professor_id) values
      (u_admin, 'Teste Admin 02', 'admin@teste-gestao02.invalid', 'admin', null),
      (u_will,  'Teste Willian 02', 'willian@teste-gestao02.invalid', 'professor', pr_will);

    perform public.gestao_sincronizar_membros();
    select m.id into m_admin from public.gestao_membros m join public.perfis pf on pf.id = m.perfil_id where pf.user_id = u_admin;
    select id into m_will from public.gestao_membros where professor_id = pr_will;

    -- ── Admin cria projeto e tipo de reunião ────────────────────────────────
    perform set_config('request.jwt.claims', json_build_object('sub', u_admin, 'role', 'authenticated')::text, true);
    set local role authenticated;

    insert into public.gestao_projetos (nome, descricao, area_id) values ('Teste 6º Recital', 'projeto de teste', ar_violao)
      returning id into proj;
    t_nome := t_nome || 'Admin cria projeto'::text; t_esp := t_esp || 'permitido'::text; t_obt := t_obt || 'permitido'::text;

    insert into public.gestao_tipos_reuniao (nome, cor) values ('Teste Reunião Semanal', 'blue');
    t_nome := t_nome || 'Admin cria tipo de reunião'::text; t_esp := t_esp || 'permitido'::text; t_obt := t_obt || 'permitido'::text;

    update public.gestao_acoes set projeto_id = proj where id in (select id from public.gestao_acoes limit 1);
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- ── Willian (professor comum, sem escopo de gerência) ───────────────────
    perform set_config('request.jwt.claims', json_build_object('sub', u_will, 'role', 'authenticated')::text, true);
    set local role authenticated;

    select count(*) into v_n from public.gestao_projetos where id = proj;
    t_nome := t_nome || 'Professor comum lê o projeto'::text; t_esp := t_esp || '1'::text; t_obt := t_obt || v_n::text;

    begin
      insert into public.gestao_projetos (nome) values ('Projeto que Willian não pode criar');
      v_txt := 'permitido';
    exception when others then v_txt := 'bloqueado';
    end;
    t_nome := t_nome || 'Professor comum não cria projeto'::text; t_esp := t_esp || 'bloqueado'::text; t_obt := t_obt || v_txt;

    begin
      insert into public.gestao_tipos_reuniao (nome) values ('Tipo que Willian não pode criar');
      v_txt := 'permitido';
    exception when others then v_txt := 'bloqueado';
    end;
    t_nome := t_nome || 'Professor comum não cria tipo de reunião'::text; t_esp := t_esp || 'bloqueado'::text; t_obt := t_obt || v_txt;

    reset role;
    perform set_config('request.jwt.claims', '', true);

    raise exception 'fim_do_teste';
  exception when others then
    if sqlerrm <> 'fim_do_teste' then
      t_nome := t_nome || 'ERRO INESPERADO'::text; t_esp := t_esp || '—'::text; t_obt := t_obt || sqlerrm::text;
    end if;
  end;

  return query
    select n, e, o, n <> 'ERRO INESPERADO' and e = o
    from unnest(t_nome, t_esp, t_obt) as x(n, e, o);
end $$;

select * from pg_temp.testes_gestao_02();
