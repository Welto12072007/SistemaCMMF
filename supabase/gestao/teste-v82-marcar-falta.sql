-- Fix V82 · Professores não conseguiam marcar falta (RLS bloqueava trigger)
-- Simula um professor autenticado marcando falta de um aluno real. Antes da
-- V82 isso dava "new row violates row-level security policy for table
-- reposicoes"; depois da V82 deve funcionar. TUDO É DESFEITO no final (rollback).
-- Rodar via psql -f (begin/rollback precisam estar na MESMA sessão do do-block).

begin;

do $$
declare
  v_professor_user_id uuid;
  v_professor_id uuid;
  v_aluno_id uuid;
begin
  select user_id, professor_id into v_professor_user_id, v_professor_id
    from perfis where role = 'professor' and professor_id is not null limit 1;
  select id into v_aluno_id from alunos where status = 'ativo' limit 1;

  if v_professor_user_id is null or v_aluno_id is null then
    raise notice 'Sem professor/aluno de teste disponível — pulei o teste.';
    return;
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_professor_user_id, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into presencas (aluno_id, professor_id, data, presente, tipo_falta, aluno_nome, instrumento)
  values (v_aluno_id, v_professor_id, current_date, false, 'falta_injustificada', 'Teste V82', 'Teste');

  raise notice 'ok = true — professor conseguiu marcar falta sem erro de RLS';
end $$;

rollback;
