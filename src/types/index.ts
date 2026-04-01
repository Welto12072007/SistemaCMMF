export interface Contato {
  id: string
  nome: string
  telefone: string
  email?: string
  tipo_pessoa?: 'Adulto' | 'Criança' | 'Adolescente'
  instrumento: string
  canal_origem: 'WhatsApp' | 'Instagram' | 'Indicação' | 'Google'
  data_contato: string
  status: 'Primeiro Contato' | 'Aguardando Experimental' | 'Aula Experimental Marcada' | 'Em Follow-up' | 'Matriculado' | 'Perdido'
  observacoes?: string
  created_at: string
}

export interface Professor {
  id: string
  nome: string
  instrumentos: string[]
  modalidades: ('Individual' | 'Grupo')[]
  ativo: boolean
  created_at: string
}

export interface Sala {
  id: string
  nome: string
  instrumentos: string[]
  capacidade: number
  ativa: boolean
}

export interface Plano {
  id: string
  nome: string
  modalidade: 'Individual' | 'Grupo'
  frequencia: 'Mensal' | 'Trimestral' | 'Semestral'
  valor: number
  ativo: boolean
}

export interface Curso {
  id: string
  nome: string
  descricao?: string
  ativo: boolean
}

export interface AulaExperimental {
  id: string
  contato_id: string
  contato?: Contato
  professor_id: string
  professor?: Professor
  sala_id?: string
  sala?: Sala
  instrumento: string
  modalidade: 'Individual' | 'Grupo'
  data: string
  horario: string
  status: 'Agendada' | 'Realizada' | 'Cancelada' | 'Remarcada'
  observacoes?: string
  created_at: string
}

export interface Matricula {
  id: string
  contato_id: string
  contato?: Contato
  professor_id: string
  professor?: Professor
  plano_id: string
  plano?: Plano
  instrumento: string
  data_matricula: string
  taxa_matricula: number
  valor_plano: number
  forma_pagamento: 'Pix' | 'Cartão de Crédito' | 'Boleto' | 'Dinheiro'
  created_at: string
}

export interface Followup {
  id: string
  contato_id: string
  contato?: Contato
  tentativas: number
  ultimo_contato?: string
  proxima_acao?: string
  observacoes?: string
  created_at: string
}
