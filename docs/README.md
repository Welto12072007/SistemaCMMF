# Documentação — SistemaCMMF

Índice da documentação técnica do projeto. Nada de credenciais aqui — chaves reais ficam só em `.env` / painéis (Vercel, Supabase, n8n).

- [ARCHITECTURE.md](./ARCHITECTURE.md) — visão geral dos sistemas (CRM, Antonia/n8n, banco) e como se conectam
- [DATABASE.md](./DATABASE.md) — inventário de tabelas, RLS, tabelas vazias/pouco usadas
- [ACCESSES.md](./ACCESSES.md) — onde encontrar cada credencial/acesso (sem expor a chave em si)
- [RUNBOOK.md](./RUNBOOK.md) — o que fazer quando algo quebra (Antonia parada, emails indo pro spam, etc.)
- [CHANGELOG.md](./CHANGELOG.md) — histórico resumido de migrations e features entregues, formato [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
- [adr/](./adr/) — Architecture Decision Records: por que decisões grandes foram tomadas (contexto, decisão, consequências)

## Convenções do projeto
- Migrations: `agenteCMMF1/supabase/migration-vNN-nome.sql`, aplicadas via `psql` direto (sem ferramenta de migration automática)
- Views: `ALTER VIEW ... SET (security_invoker = true)`
- RPCs: `SECURITY DEFINER`, retornam `{ok, ...}`
- Chamadas do CRM: `const { error } = await supabase...; if (error) { alert('Erro:\n'+error.message); return }`
- n8n PUT `/workflows/{id}`: só aceita `name, nodes, connections, settings` (settings só com chaves whitelist)
- Sidebar: `{title, roles, items: [{to, label, icon, roles}]}`
- Rotas: `<Guard roles={[...]}><Page /></Guard>` em `App.tsx`
- Deploy: push direto pra `master` → Vercel deploya automaticamente (sem CI/CD com testes/lint no meio ainda)
