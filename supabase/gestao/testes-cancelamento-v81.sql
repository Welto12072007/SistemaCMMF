-- Módulo Cancelamento de Matrícula (V81) · Teste da regra de cálculo
-- Cria aluno de teste e confere multa/aviso prévio/saldo em 3 cenários. TUDO É
-- DESFEITO no final (bloco que termina em exceção): nada fica gravado.
-- Rodar inteiro no SQL Editor ou via psql. Todas as linhas devem ter ok = true.

create or replace function pg_temp.teste_v81_cancelamento()
returns table (teste text, esperado text, obtido text, ok boolean)
language plpgsql as $$
declare
  t_nome text[] := '{}';
  t_esp  text[] := '{}';
  t_obt  text[] := '{}';
  a_semestral uuid;
  a_mensal uuid;
  v_calc jsonb;
begin
  begin
    insert into public.alunos (nome, telefone, status, modalidade_preferida, valor_plano, plano_frequencia, data_matricula)
      values ('Teste Cancelamento Semestral', '00000000000', 'ativo', 'Individual Semestral', 280, 1, current_date - interval '2 months')
      returning id into a_semestral;
    insert into public.alunos (nome, telefone, status, modalidade_preferida, valor_plano, plano_frequencia, data_matricula)
      values ('Teste Cancelamento Mensal', '00000000001', 'ativo', 'Individual Mensal', 320, 1, current_date - interval '2 months')
      returning id into a_mensal;

    -- Semestral, dentro dos 6 meses, aviso de 5 dias (< 15) → multa + aviso
    v_calc := public.calcular_cancelamento_matricula(a_semestral, current_date, current_date + 5, 0);
    t_nome := t_nome || 'Semestral dentro do período: multa = 1 mensalidade'::text;
    t_esp := t_esp || '280'::text; t_obt := t_obt || (v_calc->>'multa');
    t_nome := t_nome || 'Semestral, aviso de 5 dias: cobra aviso prévio (2 aulas)'::text;
    t_esp := t_esp || '140.00'::text; t_obt := t_obt || (v_calc->>'aviso_previo');
    t_nome := t_nome || 'Saldo final = multa + aviso'::text;
    t_esp := t_esp || '420.00'::text; t_obt := t_obt || (v_calc->>'saldo_final');

    -- Semestral, aviso de 20 dias (>= 15) → não cobra aviso prévio
    v_calc := public.calcular_cancelamento_matricula(a_semestral, current_date, current_date + 20, 0);
    t_nome := t_nome || 'Semestral, aviso de 20 dias: não cobra aviso prévio'::text;
    t_esp := t_esp || '0'::text; t_obt := t_obt || (v_calc->>'aviso_previo');

    -- Mensal (não semestral) → nunca cobra multa, mesmo dentro do período
    v_calc := public.calcular_cancelamento_matricula(a_mensal, current_date, current_date + 20, 0);
    t_nome := t_nome || 'Modalidade mensal nunca gera multa'::text;
    t_esp := t_esp || '0'::text; t_obt := t_obt || (v_calc->>'multa');

    -- Semestral fora dos 6 meses iniciais → sem multa
    update public.alunos set data_matricula = current_date - interval '8 months' where id = a_semestral;
    v_calc := public.calcular_cancelamento_matricula(a_semestral, current_date, current_date + 20, 0);
    t_nome := t_nome || 'Semestral após 6 meses: sem multa'::text;
    t_esp := t_esp || '0'::text; t_obt := t_obt || (v_calc->>'multa');

    -- Créditos/descontos abatem o saldo final
    v_calc := public.calcular_cancelamento_matricula(a_semestral, current_date, current_date + 5, 50);
    t_nome := t_nome || 'Créditos de R$50 abatem o saldo final (aviso 140 - 50)'::text;
    t_esp := t_esp || '90.00'::text; t_obt := t_obt || (v_calc->>'saldo_final');

    raise exception 'fim_do_teste';
  exception when others then
    if sqlerrm <> 'fim_do_teste' then
      t_nome := t_nome || 'ERRO INESPERADO'::text; t_esp := t_esp || '—'::text; t_obt := t_obt || sqlerrm;
    end if;
  end;

  return query
    select n, e, o, n <> 'ERRO INESPERADO' and e = o
    from unnest(t_nome, t_esp, t_obt) as x(n, e, o);
end $$;

select * from pg_temp.teste_v81_cancelamento();
