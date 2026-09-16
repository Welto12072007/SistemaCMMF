import { supabase } from '@/lib/supabase'

// ── Tipos (tabelas gestao_* — ver supabase/gestao/migration-gestao-01-fundacao.sql) ──

export type CategoriaStatus = 'aberta' | 'concluida' | 'cancelada'

export interface GestaoMembro {
  id: string
  nome: string
  cargo: string | null
  professor_id: string | null
  perfil_id: string | null
  ativo: boolean
}

export interface GestaoArea {
  id: string
  parent_id: string | null
  nome: string
  instrumento: string | null
  posicao: number
}

export interface GestaoStatus {
  id: string
  chave: string
  nome: string
  categoria: CategoriaStatus
  cor: string | null
  posicao: number
}

export interface GestaoPrioridade {
  id: string
  chave: string
  nome: string
  peso: number
  cor: string | null
  posicao: number
}

export interface GestaoAtribuicao {
  id: string
  membro_id: string
  escopo_tipo: 'geral' | 'area' | 'projeto'
  escopo_id: string | null
  perfil: { chave: string; nome: string } | null
}

export interface GestaoAcao {
  id: string
  titulo: string
  descricao: string | null
  motivo: string | null
  criterio_conclusao: string | null
  responsavel_id: string | null
  gerente_frente_id: string | null
  criado_por: string | null
  area_id: string | null
  origem_tipo: string
  revisar_proxima_reuniao: boolean
  status_id: string
  prioridade_id: string
  progresso: number
  exige_validacao: boolean
  motivo_bloqueio: string | null
  motivo_cancelamento: string | null
  prazo: string | null
  prazo_original: string | null
  prazo_referencia: string | null
  iniciada_em: string | null
  concluida_em: string | null
  cancelada_em: string | null
  created_at: string
  updated_at: string
}

export interface GestaoProjeto {
  id: string
  nome: string
  descricao: string | null
  area_id: string | null
  ativo: boolean
  arquivado_em: string | null
}

export interface GestaoTipoReuniao {
  id: string
  nome: string
  cor: string | null
  posicao: number
  arquivado_em: string | null
}

export interface GestaoHistorico {
  id: number
  operacao: 'INSERT' | 'UPDATE' | 'DELETE'
  alteracoes: Record<string, unknown>
  membro_id: string | null
  created_at: string
}

export interface GestaoContexto {
  membros: GestaoMembro[]
  areas: GestaoArea[]
  status: GestaoStatus[]
  prioridades: GestaoPrioridade[]
  atribuicoes: GestaoAtribuicao[]
  meuMembroId: string | null
}

// ── Carregamento ────────────────────────────────────────────────────────────

export class ModuloNaoInstaladoError extends Error {}

function naoInstalado(error: { code?: string; message?: string }) {
  return ['PGRST202', 'PGRST205', '42P01', '42883'].includes(error.code ?? '')
}

export async function carregarContexto(): Promise<GestaoContexto> {
  // Mantém as pessoas do módulo em dia com professores e perfis do sistema.
  const sync = await supabase.rpc('gestao_sincronizar_membros')
  if (sync.error) {
    if (naoInstalado(sync.error)) throw new ModuloNaoInstaladoError(sync.error.message)
    console.warn('gestao_sincronizar_membros:', sync.error.message)
  }

  const [membros, areas, status, prioridades, atribuicoes, eu] = await Promise.all([
    supabase.from('gestao_membros').select('id, nome, cargo, professor_id, perfil_id, ativo').order('nome'),
    supabase.from('gestao_areas').select('id, parent_id, nome, instrumento, posicao').is('arquivada_em', null).order('posicao'),
    supabase.from('gestao_status_acao').select('id, chave, nome, categoria, cor, posicao').order('posicao'),
    supabase.from('gestao_prioridades').select('id, chave, nome, peso, cor, posicao').order('posicao'),
    supabase.from('gestao_atribuicoes').select('id, membro_id, escopo_tipo, escopo_id, perfil:gestao_perfis_acesso(chave, nome)'),
    supabase.rpc('gestao_meu_membro_id'),
  ])

  const erro = [membros, areas, status, prioridades, atribuicoes, eu].find((r) => r.error)?.error
  if (erro) {
    if (naoInstalado(erro)) throw new ModuloNaoInstaladoError(erro.message)
    throw new Error(erro.message)
  }

  return {
    membros: (membros.data ?? []) as GestaoMembro[],
    areas: (areas.data ?? []) as GestaoArea[],
    status: (status.data ?? []) as GestaoStatus[],
    prioridades: (prioridades.data ?? []) as GestaoPrioridade[],
    atribuicoes: (atribuicoes.data ?? []) as unknown as GestaoAtribuicao[],
    meuMembroId: (eu.data as string | null) ?? null,
  }
}

// ── Áreas ───────────────────────────────────────────────────────────────────

export function rotuloArea(areaId: string | null, areas: GestaoArea[]): string {
  if (!areaId) return 'Sem área'
  const area = areas.find((a) => a.id === areaId)
  if (!area) return 'Área arquivada'
  const pai = area.parent_id ? areas.find((a) => a.id === area.parent_id) : undefined
  return pai ? `${pai.nome} › ${area.nome}` : area.nome
}

/** Pais seguidos dos filhos, na ordem de "posicao". */
export function areasOrdenadas(areas: GestaoArea[]): GestaoArea[] {
  const raizes = areas.filter((a) => !a.parent_id || !areas.some((p) => p.id === a.parent_id))
  return raizes.flatMap((r) => [r, ...areas.filter((a) => a.parent_id === r.id)])
}

export function comDescendentes(areaId: string, areas: GestaoArea[]): Set<string> {
  const ids = new Set([areaId])
  let cresceu = true
  while (cresceu) {
    cresceu = false
    for (const a of areas) {
      if (a.parent_id && ids.has(a.parent_id) && !ids.has(a.id)) {
        ids.add(a.id)
        cresceu = true
      }
    }
  }
  return ids
}

/** Áreas em que o usuário é gerente (com subáreas). Só para a interface — o banco decide de fato. */
export function areasGerenciadas(ctx: GestaoContexto, ehAdmin: boolean): Set<string> {
  if (ehAdmin) return new Set(ctx.areas.map((a) => a.id))
  const minhas = ctx.atribuicoes.filter((at) => at.membro_id === ctx.meuMembroId && at.perfil?.chave === 'gerente')
  if (minhas.some((at) => at.escopo_tipo === 'geral')) return new Set(ctx.areas.map((a) => a.id))
  const ids = new Set<string>()
  for (const at of minhas) {
    if (at.escopo_tipo === 'area' && at.escopo_id) comDescendentes(at.escopo_id, ctx.areas).forEach((id) => ids.add(id))
  }
  return ids
}

/** Gerente mais próximo da área (a própria ou a área-mãe). */
export function gerenteDaArea(areaId: string | null, ctx: GestaoContexto): GestaoMembro | undefined {
  let atual = areaId ? ctx.areas.find((a) => a.id === areaId) : undefined
  while (atual) {
    const at = ctx.atribuicoes.find((x) => x.escopo_tipo === 'area' && x.escopo_id === atual!.id && x.perfil?.chave === 'gerente')
    if (at) return ctx.membros.find((m) => m.id === at.membro_id)
    atual = atual.parent_id ? ctx.areas.find((a) => a.id === atual!.parent_id) : undefined
  }
  return undefined
}

// ── Datas (sempre no fuso de Brasília) ──────────────────────────────────────

const FORMATO_DIA_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' })

export function hojeSP(): string {
  return FORMATO_DIA_SP.format(new Date())
}

export function diaSP(timestamp: string): string {
  return FORMATO_DIA_SP.format(new Date(timestamp))
}

export function somarDias(dia: string, dias: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000)
}

export function proximaSexta(hoje: string): string {
  const diaSemana = new Date(`${hoje}T12:00:00Z`).getUTCDay()
  return somarDias(hoje, (5 - diaSemana + 7) % 7 || 7)
}

export function fmtData(dia: string | null): string {
  if (!dia) return '—'
  const [y, m, d] = dia.split('-')
  return `${d}/${m}/${y}`
}

export function fmtDataCurta(dia: string | null): string {
  if (!dia) return '—'
  const [, m, d] = dia.split('-')
  return `${d}/${m}`
}

export function fmtDataHora(timestamp: string): string {
  return new Date(timestamp).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

// ── Situação do prazo (calculada, nunca digitada) ───────────────────────────

export type SituacaoPrazo =
  | 'atrasada' | 'vence_hoje' | 'vence_amanha' | 'vence_7_dias' | 'prazo_distante'
  | 'sem_prazo' | 'concluida_no_prazo' | 'concluida_atrasada' | 'cancelada'

export const SITUACAO: Record<SituacaoPrazo, { label: string; classe: string; ordem: number }> = {
  atrasada:           { label: 'Atrasada',             classe: 'bg-red-100 text-red-700',        ordem: 0 },
  vence_hoje:         { label: 'Vence hoje',           classe: 'bg-amber-100 text-amber-800',    ordem: 1 },
  vence_amanha:       { label: 'Vence amanhã',         classe: 'bg-amber-50 text-amber-700',     ordem: 2 },
  vence_7_dias:       { label: 'Vence em 7 dias',      classe: 'bg-brand-50 text-brand-700',     ordem: 3 },
  prazo_distante:     { label: 'No prazo',             classe: 'bg-gray-100 text-gray-600',      ordem: 4 },
  sem_prazo:          { label: 'Sem prazo',            classe: 'bg-white text-gray-500 border border-dashed border-gray-300', ordem: 5 },
  concluida_no_prazo: { label: 'Concluída no prazo',   classe: 'bg-emerald-100 text-emerald-700', ordem: 6 },
  concluida_atrasada: { label: 'Concluída com atraso', classe: 'bg-orange-100 text-orange-700',  ordem: 7 },
  cancelada:          { label: 'Cancelada',            classe: 'bg-gray-100 text-gray-400',      ordem: 8 },
}

export function situacaoPrazo(acao: GestaoAcao, categoria: CategoriaStatus | undefined, hoje: string): SituacaoPrazo {
  if (categoria === 'cancelada') return 'cancelada'
  if (categoria === 'concluida') {
    const referencia = acao.prazo_referencia ?? acao.prazo
    if (!referencia || !acao.concluida_em) return 'concluida_no_prazo'
    return diaSP(acao.concluida_em) <= referencia ? 'concluida_no_prazo' : 'concluida_atrasada'
  }
  if (!acao.prazo) return 'sem_prazo'
  const dias = diasEntre(hoje, acao.prazo)
  if (dias < 0) return 'atrasada'
  if (dias === 0) return 'vence_hoje'
  if (dias === 1) return 'vence_amanha'
  if (dias <= 7) return 'vence_7_dias'
  return 'prazo_distante'
}

// ── Aparência dos catálogos ─────────────────────────────────────────────────

export const COR_CHIP: Record<string, string> = {
  slate:  'bg-slate-100 text-slate-700',
  blue:   'bg-blue-100 text-blue-700',
  violet: 'bg-violet-100 text-violet-700',
  red:    'bg-red-100 text-red-700',
  amber:  'bg-amber-100 text-amber-800',
  green:  'bg-emerald-100 text-emerald-700',
  gray:   'bg-gray-100 text-gray-500',
}

/** Exige motivo ao entrar neste status. */
export function statusExigeMotivo(status: GestaoStatus | undefined): 'motivo_bloqueio' | 'motivo_cancelamento' | null {
  if (!status) return null
  if (status.chave === 'bloqueada') return 'motivo_bloqueio'
  if (status.categoria === 'cancelada') return 'motivo_cancelamento'
  return null
}

// ── Histórico legível ───────────────────────────────────────────────────────

const CAMPOS_HISTORICO: Record<string, string> = {
  titulo: 'Título',
  descricao: 'Descrição',
  motivo: 'Por quê',
  criterio_conclusao: 'Como saberemos que foi concluída',
  responsavel_id: 'Responsável',
  gerente_frente_id: 'Gerente da frente',
  area_id: 'Área',
  status_id: 'Status',
  prioridade_id: 'Prioridade',
  progresso: 'Progresso',
  prazo: 'Prazo',
  exige_validacao: 'Exige validação',
  revisar_proxima_reuniao: 'Revisar na próxima reunião',
  motivo_bloqueio: 'Motivo do bloqueio',
  motivo_cancelamento: 'Motivo do cancelamento',
}

function valorLegivel(campo: string, valor: unknown, ctx: GestaoContexto): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  switch (campo) {
    case 'status_id': return ctx.status.find((s) => s.id === valor)?.nome ?? '—'
    case 'prioridade_id': return ctx.prioridades.find((p) => p.id === valor)?.nome ?? '—'
    case 'responsavel_id':
    case 'gerente_frente_id': return ctx.membros.find((m) => m.id === valor)?.nome ?? '—'
    case 'area_id': return rotuloArea(valor as string, ctx.areas)
    case 'prazo': return fmtData(valor as string)
    case 'progresso': return `${valor}%`
    case 'exige_validacao':
    case 'revisar_proxima_reuniao': return valor ? 'Sim' : 'Não'
    default: {
      const texto = String(valor)
      return texto.length > 80 ? `${texto.slice(0, 80)}…` : texto
    }
  }
}

export function descreverHistorico(h: GestaoHistorico, ctx: GestaoContexto): string[] {
  if (h.operacao === 'INSERT') return ['Criou a ação']
  if (h.operacao === 'DELETE') return ['Removeu a ação']
  return Object.entries(h.alteracoes)
    .filter(([campo]) => campo in CAMPOS_HISTORICO)
    .map(([campo, mudanca]) => {
      const { antes, depois } = (mudanca ?? {}) as { antes?: unknown; depois?: unknown }
      return `${CAMPOS_HISTORICO[campo]}: ${valorLegivel(campo, antes, ctx)} → ${valorLegivel(campo, depois, ctx)}`
    })
}

export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
