# ADR-0003: Disponibilidade de horários sem depender de Google Sheets

**Status:** Aceito (01-02/09/2026)

## Contexto
O workflow n8n "Consultar Disponibilidade - Google Sheets" usava uma planilha isolada como fonte de verdade sobre disponibilidade de professores/salas — sem nenhuma relação com a tabela `horarios` do CRM. Resultado: editar um horário no CRM não tinha efeito nenhum no que a Antonia oferecia pros leads (bug confirmado com um professor específico, todos os slots marcados indisponíveis no CRM mas a Antonia oferecendo horário com ele mesmo assim).

## Decisão
Migrar o nó "Processar Disponibilidade" pra consultar `professores` + `horarios` + `aulas_experimentais` direto via Supabase REST, dentro do próprio fluxo da Antonia. Nós de planilha (`Info Planilha`, `Encontrar Aba`, `Ler Planilha`) removidos do fluxo principal. O nó "Escrever Célula" virou um `PATCH` em `horarios`.

## Consequências
- Positivo: qualquer edição de horário no CRM reflete imediatamente no que a Antonia oferece — uma única fonte de verdade.
- Positivo: lógica de negócio preservada (limite de 4 salas simultâneas, apelido do professor, exclusão de slots com experimental já agendada), só a fonte de dados mudou.
- Pendência: o workflow n8n separado `Consultar Disponibilidade - Google Sheets` (`vyzyYkdubZ5Gar1w`) continua **ativo** no n8n mesmo não sendo mais chamado pelo fluxo principal — candidato a ser desativado/removido após confirmação (ver [ARCHITECTURE.md](../ARCHITECTURE.md)).
