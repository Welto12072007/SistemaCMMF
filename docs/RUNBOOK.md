# Runbook — Incidentes Comuns

## "Antonia não responde"
Duas causas independentes, sempre checar as duas:
1. **WhatsApp desconectado**: `GET /instance/connectionState/CentroMusica` (Evolution API). Se `state != "open"`, gerar novo QR via `GET /instance/connect/CentroMusica` e escanear com o celular do centro em "Aparelhos Conectados". Ação física, não dá pra resolver só por API.
2. **Workflow n8n inativo**: `GET /workflows/{id}` (id `gOwD7CVrfFShDyRDZ8y9H`) → campo `active`. Workflows do n8n podem cair sozinhos após execuções com erro ("crashed"). Reativar com `POST /workflows/{id}/activate`.

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
