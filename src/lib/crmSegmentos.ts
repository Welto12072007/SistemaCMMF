export type GrupoBaseSegmento = 'todos' | 'alunos_ativos' | 'leads' | 'ex_alunos'

export interface CRMSegmento {
  id: string
  nome: string
  descricao: string
  grupoBase: GrupoBaseSegmento
  instrumento: string
  apenasComTelefone: boolean
  ativo: boolean
  createdAt: string
}

const STORAGE_KEY = 'cmmf.crm.segmentos.v1'

export function loadCRMSegmentos(): CRMSegmento[] {
  if (typeof window === 'undefined') return []

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((s) => s && typeof s.id === 'string' && typeof s.nome === 'string')
      .map((s) => ({
        id: s.id,
        nome: s.nome,
        descricao: s.descricao || '',
        grupoBase: (s.grupoBase || 'alunos_ativos') as GrupoBaseSegmento,
        instrumento: s.instrumento || '',
        apenasComTelefone: Boolean(s.apenasComTelefone),
        ativo: s.ativo !== false,
        createdAt: s.createdAt || new Date().toISOString(),
      }))
  } catch {
    return []
  }
}

export function saveCRMSegmentos(segmentos: CRMSegmento[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(segmentos))
  window.dispatchEvent(new CustomEvent('crm-segmentos-atualizados'))
}

export function getLabelGrupoBase(grupo: GrupoBaseSegmento) {
  if (grupo === 'todos') return 'Todos os contatos'
  if (grupo === 'alunos_ativos') return 'Alunos ativos'
  if (grupo === 'leads') return 'Leads'
  return 'Ex-alunos'
}
