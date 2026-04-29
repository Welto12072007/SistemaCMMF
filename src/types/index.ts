// === Roles e Auth ===
export type UserRole = 'admin' | 'recepcao' | 'professor' | 'aluno'

export interface Perfil {
  id: string
  user_id: string
  nome: string
  email: string
  role: UserRole
  professor_id?: string
  telefone?: string
  avatar_url?: string
  ativo: boolean
  created_at?: string
}

// === Fluxo de Alunos ===
export interface FluxoAluno {
  id: string
  tipo: 'entrada' | 'saida'
  mes: number
  ano: number
  aluno_nome: string
  professor_nome?: string
  vendedor?: string
  tipo_aula?: string
  matricula_confirmada?: boolean
  data_evento?: string
  observacoes?: string
  created_at?: string
}

// === Biblioteca ===
export interface BibliotecaItem {
  id: string
  titulo: string
  descricao?: string
  tipo: string
  categoria?: string
  instrumento?: string
  url?: string
  arquivo_nome?: string
  visivel_para?: string[]
  autor?: string
  created_at?: string
}

// === Conteúdos (Material de Apoio + FingerTV) ===
export interface Conteudo {
  id: string
  titulo: string
  descricao?: string
  tipo: 'material_professor' | 'material_aluno' | 'fingertv'
  categoria?: string
  instrumento?: string
  url?: string
  thumbnail_url?: string
  arquivo_nome?: string
  visivel_para?: string[]
  ordem?: number
  destaque?: boolean
  created_at?: string
}

// === System Logs ===
export interface SystemLog {
  id: string
  user_id?: string
  user_nome?: string
  action: string
  entity?: string
  entity_id?: string
  details?: Record<string, unknown>
  created_at?: string
}

// Mapeia a tabela "alunos" do Supabase
export interface Contato {
  id: string
  nome: string
  telefone: string
  email?: string
  idade?: number
  instrumento_interesse?: string
  origem?: string
  data_primeiro_contato?: string
  status?: string
  observacoes?: string
  nome_responsavel?: string
  modalidade_preferida?: string
  experiencia_musical?: string
  followup_enviado?: boolean
  created_at?: string
}

export interface Professor {
  id: string
  nome: string
  instrumentos?: string[]
  telefone?: string
  ativo?: boolean
  observacoes?: string
  tipo_professor?: 'A' | 'B'
  valor_hora_aula?: number
  chave_pix?: string
  pix_tipo?: string
  created_at?: string
}

export interface Sala {
  id: string
  nome: string
  instrumentos?: string[]
  capacidade: number
  ativa: boolean
}

// Mapeia a tabela "planos" do Supabase (periodo = frequência, valor_mensal = valor)
export interface Plano {
  id: string
  nome: string
  modalidade: string
  periodo?: string
  valor_mensal: number
  descricao?: string
  ativo?: boolean
}

export interface Curso {
  id: string
  nome: string
  descricao?: string
  ativo: boolean
}

// Mapeia a tabela "aulas_experimentais" do Supabase
export interface AulaExperimental {
  id: string
  aluno_id?: string
  aluno?: Contato
  professor_id?: string
  professor?: Professor
  instrumento: string
  nome: string
  telefone: string
  data_aula: string
  hora_inicio: string
  hora_fim: string
  status: string
  observacoes?: string
  professor_nome?: string
  created_at?: string
  convertido_em?: string | null
}


