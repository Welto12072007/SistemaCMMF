import type { UserRole } from '@/contexts/AuthContext'

// Chave de cada módulo "de equipe" que pode ser liberado/bloqueado individualmente por usuário.
// Mantém o mesmo valor do segmento de rota (App.tsx) pra facilitar o Guard.
export interface ModuloInfo {
  key: string
  label: string
  grupo: string
}

export const MODULOS: ModuloInfo[] = [
  { key: 'contatos', label: 'Contatos', grupo: 'Comunicação' },
  { key: 'crm-funil', label: 'CRM — Funil', grupo: 'Comunicação' },
  { key: 'disparos', label: 'Disparos', grupo: 'Comunicação' },
  { key: 'avaliacoes', label: 'Avaliações', grupo: 'Comunicação' },
  { key: 'aulas-experimentais', label: 'Aulas Experimentais', grupo: 'Gestão de Alunos' },
  { key: 'usuarios', label: 'Usuários (alunos/professores)', grupo: 'Gestão de Alunos' },
  { key: 'horarios', label: 'Horários', grupo: 'Gestão de Alunos' },
  { key: 'presencas', label: 'Presenças & Faltas', grupo: 'Gestão de Alunos' },
  { key: 'mensalidades', label: 'Mensalidades', grupo: 'Financeiro' },
  { key: 'cobranca', label: 'Cobrança & Jurídico', grupo: 'Financeiro' },
  { key: 'pos-venda', label: 'Brindes & Marcos', grupo: 'Outros' },
  { key: 'gestao-acoes', label: 'Ações (Gestão)', grupo: 'Outros' },
]

// Papéis cujo acesso pode ser customizado módulo a módulo na tela de Acessos.
// Admin sempre tem tudo (bypassa qualquer checagem). Professor/Aluno têm portal próprio fixo (não entram aqui).
export const ROLES_CUSTOMIZAVEIS: UserRole[] = ['recepcao']

// Padrão de módulos liberados por papel quando `permissoes` está NULL no banco (comportamento histórico, inalterado).
export const PERMISSOES_PADRAO_POR_ROLE: Record<UserRole, string[]> = {
  admin: MODULOS.map((m) => m.key),
  recepcao: MODULOS.map((m) => m.key),
  professor: [],
  aluno: [],
}
