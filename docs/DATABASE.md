# Banco de Dados (Supabase Postgres)

Última migration aplicada: **V75** (fix RLS broken access control, 03/09/2026).

## Tabelas com 0 linhas (auditoria 04/09)

Todas ainda são **referenciadas no código** (frontend, scripts ou SQL) — ou seja, não são código morto óbvio, mas ninguém usou/preencheu ainda. Vale confirmar com o time se são features:
1. em uso mas sem dados ainda (ex: `agendamentos` pode ser preenchido só quando alguém agenda pela primeira vez), ou
2. abandonadas no meio do desenvolvimento (nesse caso, candidatas a remover).

| Tabela | Onde é referenciada | Observação |
|---|---|---|
| `pagamentos_professor_mensal` | 6 arquivos | provável cálculo de pagamento mensal de professor — checar se `Financeiro.tsx`/`PagamentoProfessores.tsx` já usa isso ou se ainda é `pagamentos` avulso |
| `disparos_publicos_alunos` / `disparos_publicos` | 3 arquivos cada | feature de "audiência manual" (V70) — pode só não ter sido usada ainda pela tela |
| `cobranca_enviada` | 1 arquivo | verificar se é usado por régua de cobrança (`regua_cobranca` tem 4 linhas, essa relacionada tem 0) |
| `horarios_disponiveis` | 11 arquivos | nome parecido com `horarios` (812 linhas) — checar se não é tabela duplicada/legada de antes da migração de disponibilidade pro Supabase direto |
| `sofia_debounce` | 3 arquivos | nome antigo "Sofia" (renomeada pra Antonia) — checar se ainda é usada ou se foi substituída por outra tabela de debounce |
| `agendamentos` | 18 arquivos | bastante referenciado, mas 0 linhas — confirmar se é tabela ativa ou se `aulas_experimentais`/`horarios` já cobrem o caso de uso |
| `conteudos` | 5 arquivos | provavelmente biblioteca de materiais — ver se `biblioteca`/`biblioteca_pastas`/`material_*` já substituíram |
| `fluxo_alunos` | 6 arquivos | ver se `vw_crm_funil` (view) já cobre isso e a tabela ficou órfã |
| `conversas` | 5 arquivos | ver se `n8n_chat_histories` (5820 linhas) já é o histórico real e essa é redundante |
| `system_logs` | 5 arquivos | log genérico — checar se algo grava nela de fato |
| `anotacoes_alunos` | 3 arquivos | feature de notas por aluno, talvez não lançada ainda |
| `trabalhos_extras` / `extras_professor` / `horarios_extras` / `propostas_horario_extra` (3 linhas) | várias | conjunto de tabelas de "aula extra" — parecem parte da mesma feature, confirmar se está ativa |
| `crm_segmentos` | 10 arquivos | segmentação de CRM — bastante referenciada, vale checar por que está vazia |
| `remarcacoes` | 4 arquivos | RPC `remarcar_aula` existe (V27) — confirmar se ninguém remarcou ainda ou se há bug |
| `juridico_encaminhamentos` | 5 arquivos | trigger `encaminhar_juridico()` (V72) grava aqui — só ainda não houve caso real |
| `ausencias_professor` | 3 arquivos | feature de professor avisar ausência — checar se está no ar |
| `mensagens_manuais_log` | 1 arquivo | só uma referência — candidata mais forte a ser código morto/incompleto |

## Tabelas quase vazias (1-5 linhas) — normal, são tabelas de configuração
`sofia_fallback_guard`, `material_pastas`, `cobranca_config`, `material_arquivos`, `lembrete_experimental_config`, `eventos_agenda`, `brindes`, `propostas_horario_extra`, `biblioteca_pastas`, `planos`, `regua_cobranca`, `lancamentos_caixa`, `salas` — linha única/poucas linhas é esperado (são tabelas de config, não de eventos).

## RLS (Row Level Security)
- Corrigido na **V75** (03/09/2026) — antes `alunos` tinha SELECT liberado pra `anon`; `agendamentos`/`reposicoes`/`remarcacoes`/`horarios`/`perfis` tinham `ALL` liberado pra qualquer `authenticated` (broken access control real).
- Helpers security-definer: `meu_role()`, `meu_email()`, `meu_professor_id()`, `professor_atende_aluno(uuid)`.
- Policies: staff (admin/recepção) full access; aluno só a própria linha (via email); professor só dados vinculados a ele.
- Trigger `perfis_bloquear_escalada` impede um usuário comum promover a si mesmo a admin.
- RPCs security-definer (`remarcar_aula`, `reposicao_propor_horario_aluno`, `reposicao_professor_confirmar`, `converter_experimental_em_aluno`) são `owner=postgres` com `BYPASSRLS=true`.
- **Lição de RLS**: se uma policy faz `EXISTS`/`JOIN` numa tabela que também tem RLS referenciando a tabela original → "infinite recursion detected in policy". Resolver sempre com função `SECURITY DEFINER` que isola a consulta.
- **Testar RLS via psql** simulando um usuário — tudo dentro da mesma transação (senão o `set_config` local se perde entre statements):
  ```sql
  begin;
  set local role authenticated;
  select set_config('request.jwt.claims', '{"sub":"<uuid>","role":"authenticated"}', true);
  -- consultas de teste aqui
  rollback;
  ```

## Histórico de migrations
Ver [CHANGELOG.md](./CHANGELOG.md).
