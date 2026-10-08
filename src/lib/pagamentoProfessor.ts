// Regras de pagamento do professor compartilhadas entre Pagamento Prof. e o extrato.

export interface ProfValores {
  valor_hora_aula: number
  bonificacao_grupo: Record<string, number> | null
}

// Valor de uma aula (slot) conforme o tamanho real da turma.
export function valorDoSlot(p: ProfValores, totalAlunos: number): number {
  if (totalAlunos <= 1) return p.valor_hora_aula
  const bonif = p.bonificacao_grupo ?? { '2': 20, '3': 25, '4': 30 }
  const key = String(totalAlunos)
  if (bonif[key] != null) return bonif[key] as number
  const chaves = Object.keys(bonif).map(Number).filter(n => !isNaN(n)).sort((a, b) => b - a)
  const maiorKey = chaves.find(k => k <= totalAlunos) ?? chaves[0]
  return maiorKey != null ? (bonif[String(maiorKey)] as number) : p.valor_hora_aula
}

// Professor esteve na aula: aluno veio ou faltou sem avisar.
export function professorCompareceu(presente: boolean, tipoFalta: string | null): boolean {
  return presente || tipoFalta === 'falta_injustificada'
}

export const ROTULO_TIPO_FALTA: Record<string, string> = {
  falta_injustificada: 'Faltou sem avisar',
  falta_justificada: 'Faltou com aviso',
  cancelou_avisou: 'Cancelada (aluno avisou)',
  cancelou_professor: 'Cancelada pelo professor',
}
