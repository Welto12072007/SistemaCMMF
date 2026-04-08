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
}

export interface Matricula {
  id: string
  aluno_id: string
  aluno?: Contato
  professor_id: string
  professor?: Professor
  plano_id: string
  plano?: Plano
  instrumento: string
  data_matricula: string
  taxa_matricula: number
  valor_plano: number
  forma_pagamento: string
  created_at?: string
}
