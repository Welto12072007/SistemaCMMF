# ADR-0002: Fix de RLS — broken access control

**Status:** Aceito (03/09/2026, migration V75)

## Contexto
Auditoria encontrou controle de acesso quebrado no Supabase:
- `alunos` tinha `SELECT` liberado pra role `anon` — qualquer pessoa na internet conseguia ler todo o cadastro de alunos usando só a anon key pública (que é exposta no frontend por design).
- `agendamentos`, `reposicoes`, `remarcacoes`, `horarios` e `perfis` tinham `ALL` liberado pra qualquer usuário `authenticated` — um aluno logado conseguia ler/editar/apagar dados de qualquer outro aluno, ou trocar o próprio `role` pra admin em `perfis`.

Isso é uma falha clássica de OWASP Top 10 (Broken Access Control).

## Decisão
1. Criar funções `SECURITY DEFINER` (`meu_role()`, `meu_email()`, `meu_professor_id()`, `professor_atende_aluno(uuid)`) para servirem de base das policies sem causar recursão de RLS.
2. Reescrever as policies por papel: staff (admin/recepção) tem acesso completo; aluno só enxerga a própria linha (via e-mail); professor só enxerga dados vinculados a ele.
3. Trigger `perfis_bloquear_escalada` impede que um usuário comum promova a si mesmo a admin (só `service_role` pode alterar `role`).
4. RPCs que precisam bypassar RLS de propósito (ex: `remarcar_aula`) seguem `SECURITY DEFINER` com `owner=postgres`/`BYPASSRLS=true`, mas validam a autorização dentro da própria função.

## Consequências
- Positivo: fecha o vazamento de dados pessoais (LGPD) e a escalada de privilégio.
- Positivo: testável de forma isolada via `psql` simulando JWT claims (ver [DATABASE.md](../DATABASE.md)).
- Atenção: qualquer nova tabela criada a partir de agora **precisa nascer com RLS habilitado e policy explícita** — o padrão do Supabase é `ALL` liberado se ninguém configurar nada.
- Lição registrada: policy que faz `EXISTS`/`JOIN` numa tabela que também tem RLS referenciando a tabela original causa "infinite recursion detected in policy" — sempre isolar via função `SECURITY DEFINER`.
