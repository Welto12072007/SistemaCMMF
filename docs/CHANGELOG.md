# Changelog

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/). Datas no formato dd/mm/aaaa.

## [Não lançado]
### Pendente
- Página **Presenças & Faltas** usando `horarios.aluno_ids`
- Teste ponta a ponta: e-mail de acesso → definir senha → portal do aluno → professor confirma reposição
- Decisão pendente do chefe: pagamento de professor quando aluno falta em aula individual
- Migrar os 122 alunos ativos restantes pro portal (2 sem e-mail cadastrado)

## [03/09/2026]
### Added
- `disparos_programados` ganhou colunas `dias_antes`/`horas_antes` editáveis pro lembrete de aula experimental
- Vencimento e Cobrança Atrasada: mensagem, regra de dias e ativo/inativo migrados pra `disparos_programados` (antes hardcoded em Python)
- Disparos ativados: Aniversário de alunos ativos, Avaliação Google
- **V75**: fix RLS broken access control — ver [ADR-0002](./adr/0002-fix-rls-broken-access-control.md)
- **V74**: fluxo de reposição com confirmação do professor (status `aguardando_confirmacao`)
### Fixed
- **V73**: `vw_crm_funil` — normalização de telefone no join com `sofia_pausada_manual`

## [01-02/09/2026]
### Changed
- Consulta de disponibilidade de horários migrada de planilha Google Sheets pra Supabase direto — ver [ADR-0003](./adr/0003-disponibilidade-sem-google-sheets.md)
- Templates de e-mail do Supabase Auth traduzidos pra PT-BR com identidade visual (causa raiz do problema de spam)
### Added
- **V72**: `encaminhar_juridico()` agora notifica por WhatsApp via `disparos_pendentes`

## [24/08/2026]
### Changed
- Motor de disparos programados migrado de n8n pra GitHub Actions — ver [ADR-0001](./adr/0001-motor-disparos-github-actions.md)
- Escopo ativo reduzido a "Boas-vindas" e "Manual do Aluno" (demais tipos desativados até revisão)
### Fixed
- Bug: `recorrencia='unico'+sem data_unica` bloqueava "Disparar agora" pra campanhas ad-hoc também — corrigido pra só bloquear tipos event-trigger reais

## Migrations anteriores (histórico condensado)
| Versão | Resumo |
|---|---|
| V71 | `trg_boas_vindas_manual()` lê `dia_disparo` editável |
| V70 | `disparos_publicos` + `disparos_publicos_alunos` (audiência manual) |
| V69 | `lembrete_experimental_config` com mensagem editável |
| V68 | fix debounce Antonia (`debounce_add_msg` retorna `msg_id`) |
| V67 | RLS habilitado em 10 tabelas públicas sem proteção |
| V66/V66b | fix triggers de `presencas` (`IF NOT FOUND`) |
| V51 | `trg_boas_vindas_manual()` lê `disparos_programados` |
| V50 | `horarios.aluno_ids uuid[]`, `horarios.capacidade` |
| V49/V49b | fix `processar_resposta_professor` / `cancelar_agendamento` |
| V48 | `vw_crm_funil` + `chatbot_pausado` + bloqueio de professores |
| V47 | tabela `avaliacoes_satisfacao` (Google Forms) |
| V44 | pausar aluno ativo |
| V41 | CRM funil consolidado |
| V40 | `sofia_pausada_manual` + RPC `toggle_sofia_pausada` |
| V34 | colunas `data_*_at` em `alunos` (etapas do funil) |
| V33 | tabela `reposicoes` + trigger automático em `presencas` |
| V32 | `disparos_programados` expandido (recorrência, dia_semana, disparar_agora) |
| V31 | `professores.chave_pix` + `pix_tipo` |
| V30 | `aulas_experimentais.convertido_em` + RPC `converter_experimental_em_aluno` |
| V29 | `alunos` (motivo_saida, data_saida, desconto_matricula, dia_inicio_aulas) |
| V28 | `alertas_faltas_fila` + RPC `detectar_alertas_faltas` |
| V27 | tabela `remarcacoes` + RPC `remarcar_aula` |
| V26 | tabela `mensalidades` + RPCs |

## Features entregues (histórico condensado)
| Feature | Commit |
|---|---|
| Horários V50 (seletor de alunos, Individual/Grupo) | `3161acc` |
| Fluxo Alunos (SaidaModal, `vw_crescimento_evasao`) | `e3ec23e` |
| Pagamento Professores (`Financeiro.tsx`, `ReciboModal`) | `a2bfc63` |
| Mensalidades (`Mensalidades.tsx`) | `0ed9505` |
| Disparos Programados (12 tipos, aba Histórico) | `9bd6106`, `43846c1` |
| Remarcação Portal Aluno | `03dccbd` |
| Controle de Faltas (`Faltas.tsx`) | `9a96a65` |
| Converter Experimental→Aluno | `a80ff75` |
| Reposições (aba em `Faltas.tsx`) | `b39797d` |
| Dashboard Financeiro (Recharts) | `1297d36` |
| Pausar Antonia no CRM Funil | `b2ba4da` |

## Bugs resolvidos (histórico)
- Antonia se apresentava como "Sofia" → corrigido (system message v24)
- Antonia respondia mensagens de professores → `verificar_sofia_pausada` com bloqueio (V48)
- CRM Funil: tela branca ao buscar (`c.nome` null) → fix com `c.nome ?? ''`

