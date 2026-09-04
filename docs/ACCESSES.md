# Acessos — onde encontrar cada credencial

Este arquivo é público (vai pro GitHub) — **nunca colar chave/senha real aqui**. Só aponta onde a credencial real está guardada.

| Serviço | Onde fica a credencial real |
|---|---|
| n8n Cloud (API) | `.env` / `agenteCMMF1/CREDENCIAIS.md` (não commitado) |
| Supabase (DB, anon key, service role, Management API PAT) | `SistemaCMMF/.env`, env vars da Vercel, `agenteCMMF1/CREDENCIAIS.md` |
| Evolution API (WhatsApp) | `.env` / `agenteCMMF1/CREDENCIAIS.md` |
| Resend (SMTP) | Supabase Dashboard → Authentication → Emails → SMTP Settings; chave também em `.env` |
| Mercado Pago | `.env` |
| Asaas | env vars da Vercel / Supabase Edge Functions (não está no `.env` local do repo) |
| GitHub | conta `Welto12072007`, repo `SistemaCMMF` (push direto pra `master` → deploy automático na Vercel) |
| DNS do domínio `centrodemusicamurilofinger.com` | Squarespace (acesso do usuário, não do assistente) |

## Serviços e IDs (não sensível, útil pra referência rápida)
- **Sistema em produção**: `https://sistema.centrodemusicamurilofinger.com`
- **n8n workflows**: ver tabela em [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Supabase Project Ref**: `oykrtlkksqekvjiiqafy`
- **Evolution API Instance**: `CentroMusica`
