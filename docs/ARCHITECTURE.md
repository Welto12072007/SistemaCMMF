# Arquitetura

## Componentes

```mermaid
graph TD
    META[WhatsApp Cloud API - Meta] -- webhook --> WH[Edge Function whatsapp-webhook]
    WH --> DB[(Supabase Postgres)]
    WH --> ANT[Edge Function antonia - IA]
    ANT <--> DB
    ANT --> SEND[_shared/whatsapp.ts enviar]
    GHA[GitHub Actions: disparos_pendentes.py / automacoes.py] --> WS[Edge Function whatsapp-send]
    CRM[SistemaCMMF - React/Vite] --> WS
    WS --> SEND
    SEND --> META
    CRM <--> DB
    CRM --> Vercel[Vercel Deploy]
    Asaas[Asaas - cobrança] <--> CRM
    Resend[Resend SMTP] --> Auth[Supabase Auth]
```

## WhatsApp oficial + IA (out/2026, substitui Evolution API + n8n)

- **Um único ponto de envio**: `supabase/functions/_shared/whatsapp.ts` (`enviar()`). Tudo que sai (IA, equipe, automações, Asaas) passa por ele e fica registrado em `wa_mensagens` com status (enviada/entregue/lida/falhou).
- **Janela de 24h**: dentro dela vai texto livre; fora dela só modelo aprovado (`wa_templates`, aba Configurações > Modelos WhatsApp). Automações passam `vars` e o modelo é escolhido pelo tipo (`uso`).
- **Recebimento**: `whatsapp-webhook` (assinatura HMAC da Meta) grava em `wa_contatos`/`wa_mensagens`, baixa mídias para o bucket privado `whatsapp-midia` e aciona a `antonia`.
- **IA**: `antonia` junta mensagens (espera configurável), transcreve áudio, passa pelo portão `ia_gate()` (professor, aluno ativo, pausa, fechamento), monta o contexto (prompt versionado em `ia_prompt_versoes` + regras fixas no código + planos/cursos/horários do banco + ficha + histórico) e usa ferramentas que são funções do banco (`ia_horarios_livres`, `criar_agendamento_experimental`, `criar_encaminhamento` etc.). Modos por contato: automático, copiloto (sugestão aprovada na Caixa de entrada) ou só humano.
- **Telas**: Caixa de entrada (`/conversas`), Configurações > IA (Antonia) e Configurações > Modelos WhatsApp.
- **Segredos (Supabase Edge Functions)**: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `OPENAI_API_KEY`, `SB_SECRET_KEY`.

## Peças principais

- **Antonia** — ver seção acima (Edge Function `antonia`). O fluxo antigo no n8n (`gOwD7CVrfFShDyRDZ8y9H`) é desligado na virada para a API oficial.
- **SistemaCMMF** — CRM em React/TypeScript/Vite/Tailwind, hospedado na Vercel, fala direto com Supabase (anon key no client, service role só em `api/*.js` serverless functions).
- **Motor de disparos programados** — GitHub Actions (`scripts/disparos_pendentes.py`, `scripts/automacoes.py`), cron a cada 15min. Decisão de 24/08: **não usar mais n8n para isso** (custo de execuções). O workflow n8n equivalente (`Disparos Pendentes - CMMF`) foi desativado.
- **Banco** — Supabase Postgres, migrations manuais numeradas em `agenteCMMF1/supabase/migration-vNN-*.sql`, aplicadas via `psql` direto (ver [DATABASE.md](./DATABASE.md)).
- **Cobrança/mensalidades** — Asaas (gateway), integrado via `SistemaCMMF/api/asaas-*.js` (Vercel serverless) e `SistemaCMMF/supabase/functions/asaas-*` (edge functions).
- **E-mails de acesso (convite, recuperação de senha)** — Supabase Auth com SMTP customizado (Resend), templates em PT-BR (ver histórico em [CHANGELOG.md](./CHANGELOG.md)).

## Workflows n8n (auditoria 04/09)

| ID | Nome | Ativo | Observação |
|---|---|---|---|
| `gOwD7CVrfFShDyRDZ8y9H` | Agente WhatsApp - Centro de Música (Antonia) | ✅ | principal, em uso |
| `tee5yBJNi0C9O1oy` | Google Forms - Avaliação Satisfação | ✅ | webhook `/webhook/google-forms-satisfacao` |
| `vyzyYkdubZ5Gar1w` | Consultar Disponibilidade - Google Sheets | ✅ | **verificar se ainda é usado** — a lógica de disponibilidade foi migrada pra dentro do próprio fluxo da Antonia (consulta direta Supabase), este workflow separado pode estar redundante/órfão |
| `7qB2ALgyQdqoMpm3` | Automações Agendadas - CMMF | ❌ | inativo — checar se faltas/reposições/lembretes ainda dependem dele ou se tudo já foi pro GitHub Actions |
| `EubhH5q3WflY5ZMQ` | Disparos Pendentes - CMMF | ❌ | inativo de propósito (substituído por GitHub Actions, decisão 24/08) |
| `eBDLegYaGpean1ku` | Webhook Pagamento - CMMF | ❌ | inativo — confirmar se Mercado Pago/Asaas ainda usam isso ou se é candidato a exclusão |
| `tgtP0rP4japW9Cqp` | Captura de Leads - WhatsApp | ❌ | inativo — confirmar se é código morto |

**Ação recomendada:** revisar os 4 workflows marcados acima com o time antes de excluir — podem estar só pausados temporariamente ou já obsoletos. Nenhum foi apagado, só documentado o estado atual.
