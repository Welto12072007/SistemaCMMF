# ADR-0001: Motor de disparos programados — GitHub Actions em vez de n8n

**Status:** Aceito (24/08/2026)

## Contexto
O n8n Cloud tem plano com limite de execuções. Scheduled triggers a cada 5min geram 288 execuções/dia só de trigger, mesmo sem dado a processar. Isso já esgotou a cota antes (Antonia ficou OFF em 27/05/2026 por causa disso).

## Decisão
Mover o processamento de filas recorrentes (`disparos_pendentes`, lembretes, cobrança) de workflows n8n para scripts Python (`scripts/disparos_pendentes.py`, `scripts/automacoes.py`) rodando via GitHub Actions cron `*/15min`.

O n8n continua responsável só pelo que precisa ser reativo em tempo real: o Agente WhatsApp (Antonia) e o webhook do Google Forms.

## Consequências
- Positivo: custo de execução drasticamente menor pra jobs de fila.
- Positivo: lógica de negócio em Python é mais fácil de testar e versionar que nodes de n8n.
- Negativo: duas plataformas de automação em paralelo (n8n + GitHub Actions) — exige documentação clara de qual motor faz o quê (ver [ARCHITECTURE.md](../ARCHITECTURE.md)).
- Necessário: `TIPOS_PERMITIDOS` como filtro de segurança em `disparos_pendentes.py`, pois a fila acumula tipos antigos/não revisados que não devem disparar sem revisão manual.
- Workflow n8n `Disparos Pendentes - CMMF` (`EubhH5q3WflY5ZMQ`) foi desativado, não removido — mantido como histórico/rollback de emergência.
