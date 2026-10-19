# Runbook — Incidentes Comuns

## "Antonia não responde" (WhatsApp oficial)
1. **IA desligada ou contato pausado**: Configurações > IA (interruptor geral) e, na Caixa de entrada, o modo do contato. Professores, alunos ativos e contatos em fechamento pós-experimental vão de propósito para a equipe (`ia_gate()`).
2. **Mensagem não chegou**: se não aparece na Caixa de entrada, o problema é antes do sistema — conferir o webhook no app da Meta (URL `.../functions/v1/whatsapp-webhook`, campos `messages`, `smb_message_echoes`, `message_template_status_update`) e o `WHATSAPP_APP_SECRET` (assinatura inválida = 401).
3. **Chegou mas a IA falhou**: a mensagem de erro configurada vai pro cliente e a equipe recebe "Erro na IA" com o motivo (chave da OpenAI, limite, etc.). Logs: Supabase Dashboard > Edge Functions > `antonia`.
4. **Mensagem com status "falhou"** na Caixa de entrada: o motivo vem da Meta na própria bolha. `fora_da_janela` = falta modelo aprovado para aquele tipo.

## Virada Evolution → WhatsApp oficial (checklist)
1. `supabase secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... WHATSAPP_WABA_ID=... WHATSAPP_APP_SECRET=... OPENAI_API_KEY=...`
2. App da Meta > WhatsApp > Configuração: webhook `https://oykrtlkksqekvjiiqafy.supabase.co/functions/v1/whatsapp-webhook` + verify token (`WHATSAPP_VERIFY_TOKEN`); assinar `messages`, `smb_message_echoes`, `message_template_status_update`.
3. Configurações > Modelos WhatsApp > "Enviar rascunhos para aprovação"; aguardar aprovados.
4. Deploy das Edge Functions `asaas-webhook` e `asaas-notify-pending`; merge do branch `feature/whatsapp-cloud-api` em `master`.
5. Desligar no n8n: Antonia (`gOwD7CVrfFShDyRDZ8y9H`) e Disponibilidade (`vyzyYkdubZ5Gar1w`). Desconectar a instância `CentroMusica` da Evolution e remover os segredos `EVOLUTION_*` (Supabase, Vercel, GitHub Actions).
6. Teste real: mandar "oi" do celular pessoal, ver na Caixa de entrada, ver resposta da IA e o status "lida".

## E-mails de acesso indo pro spam / sem link clicável
- SPF/DKIM do domínio já estão corretos (Resend usa subdomínio `send.` próprio).
- Causa raiz resolvida em 01/09: templates do Supabase Auth estavam em inglês genérico — trocados via Supabase Management API (`PATCH /config/auth`, campos `mailer_subjects_*`/`mailer_templates_*_content`) para PT-BR com identidade visual.
- Se voltar a acontecer: primeiro suspeitar de template/reputação de domínio compartilhado do Supabase antes de mexer em DNS.
- Workaround sempre disponível: botão "copiar link" no CRM gera o magic link real (`generateLink`) para enviar manualmente (WhatsApp etc.), sem depender do e-mail.

## `redirectTo` ignorado no link de definir senha
- Supabase pode gerar o `action_link` apontando só pra raiz do domínio se a URL não estiver na allowlist "Redirect URLs" (Supabase Auth Dashboard).
- Não quebra o fluxo mesmo assim: `AuthContext.tsx` escuta o evento `PASSWORD_RECOVERY` globalmente e `App.tsx` força renderizar `DefinirSenha` independente do path.

## Disponibilidade de horários "errada" (Antonia oferece horário que não devia)
- Historicamente havia um workflow n8n separado (`Consultar Disponibilidade - Google Sheets`) usando uma planilha isolada como fonte de verdade — **migrado** para consulta direta a `professores`+`horarios`+`aulas_experimentais` via Supabase REST dentro do próprio fluxo da Antonia.
- Se o bug voltar: confirmar que o workflow antigo de Google Sheets não voltou a ser usado (ver [ARCHITECTURE.md](./ARCHITECTURE.md) — está marcado como possível órfão, ainda ativo no n8n).
- Regra de negócio: limite de 4 salas simultâneas; exclusão de slots com aula experimental já agendada.

## Disparos programados duplicados/errados
- `disparos_programados` com `recorrencia='unico'` + `data_unica=NULL` é convenção pra "disparo por evento" (trigger no banco), não pra campanha manual.
- Botão "Disparar agora" é bloqueado pra esses tipos (`boas_vindas`, `personalizado`, `avaliacao_google`) tanto na UI (`ehGatilhoDeEvento()`) quanto em `automacoes.py` — dupla trava.
- Tipos gerenciados fora do motor genérico (`TIPOS_GERENCIADOS_SEPARADAMENTE`): `vencimento`, `cobranca_atraso`, `cobranca_regua` — rodam via funções dedicadas em `automacoes.py`, com filtro por `ativo` na tabela.

## Custo de execuções n8n
- n8n Cloud tem limite de execuções no plano — já esgotou antes (27/05/2026).
- Jobs de fila/cron (disparos, automações) rodam via **GitHub Actions**, não n8n, desde 24/08 — bem mais barato pra jobs recorrentes de baixo volume.
- Antes de reativar qualquer cron/scheduled trigger no n8n, considerar mover pra GitHub Actions.
