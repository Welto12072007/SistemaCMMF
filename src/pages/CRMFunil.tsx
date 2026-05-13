import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  TrendingUp, RefreshCw, Search, Filter, Phone, Flame,
  CheckCircle2, Clock, AlertCircle, X, ExternalLink,
  ChevronRight, BarChart3, Trophy, ChevronLeft, PhoneForwarded, Edit2,
} from 'lucide-react'

// ─── tipos ────────────────────────────────────────────────────────────────────

interface FunilContato {
  id: string
  nome: string
  telefone?: string
  email?: string
  instrumento_interesse?: string
  status_aluno: string
  origem?: string
  tipo: 'lead' | 'aluno' | 'ex_aluno'
  etapa_funil: string
  exp_id?: string
  exp_data?: string
  exp_professor_nome?: string
  total_exp: number
  exp_concluidas: number
  score_temperatura: number
  followup_pendente: boolean
  data_ultima_interacao?: string
  data_primeiro_contato?: string
  data_lead_novo_at?: string
  data_em_atendimento_at?: string
  data_horario_aprovado_at?: string
  data_exp_confirmada_at?: string
  data_aula_realizada_at?: string
  data_perdido_at?: string
}

interface ListaQuente {
  instrumento: string
  tipo: string
  total: number
  score_medio: number
  em_negociacao: number
  precisam_followup: number
}

interface ConversaoProf {
  professor_nome: string
  exp_total: number
  exp_realizadas: number
  matriculas: number
  taxa_conversao_pct: number
}

const ETAPAS = [
  { key: '1_lead_novo',            label: 'Lead novo',             cor: 'bg-gray-100 text-gray-700 border-gray-200',         pill: 'bg-gray-500' },
  { key: '2_em_atendimento',       label: 'Em atendimento',        cor: 'bg-blue-50 text-blue-700 border-blue-200',          pill: 'bg-blue-500' },
  { key: '3_horario_pre_aprovado',     label: 'Horário pré-aprovado',      cor: 'bg-indigo-50 text-indigo-700 border-indigo-200',    pill: 'bg-indigo-500' },
  { key: '4_experimental_confirmada', label: 'Experimental confirmada',  cor: 'bg-emerald-50 text-emerald-700 border-emerald-200', pill: 'bg-emerald-500' },
  { key: '6_aula_realizada',          label: 'Aula realizada',           cor: 'bg-teal-50 text-teal-700 border-teal-200',          pill: 'bg-teal-500' },
  { key: '9_perdido',                 label: 'Perdido',                  cor: 'bg-red-50 text-red-700 border-red-200',             pill: 'bg-red-500' },
] as const

function corScore(score: number) {
  if (score >= 80) return 'text-red-600 bg-red-50'
  if (score >= 60) return 'text-orange-600 bg-orange-50'
  if (score >= 40) return 'text-amber-600 bg-amber-50'
  if (score >= 20) return 'text-blue-600 bg-blue-50'
  return 'text-gray-500 bg-gray-50'
}

// ─── component ────────────────────────────────────────────────────────────────

export default function CRMFunil() {
  const [loading, setLoading] = useState(true)
  const [contatos, setContatos] = useState<FunilContato[]>([])
  const [listas, setListas] = useState<ListaQuente[]>([])
  const [conversao, setConversao] = useState<ConversaoProf[]>([])

  const [tab, setTab] = useState<'funil' | 'gargalos' | 'instrumento' | 'conversao' | 'semanal' | 'followup'>('funil')
  const [busca, setBusca] = useState('')
  const [filtroInstr, setFiltroInstr] = useState('')
  const [filtroEtapa, setFiltroEtapa] = useState<string>('')
  const [apenasFollowup, setApenasFollowup] = useState(false)

  // Semana offset (0 = semana atual, -1 = semana passada, etc.)
  const [semanaOffset, setSemanaOffset] = useState(0)

  // Filtros lista quente segmentada
  const [filtroListaInstr, setFiltroListaInstr] = useState('')
  const [filtroListaTipo, setFiltroListaTipo] = useState('')

  // Modal lead perdido
  const [modalPerdido, setModalPerdido] = useState<FunilContato | null>(null)
  const [motivoPerdido, setMotivoPerdido] = useState('')

  // Modal edição de contato
  const [modalEditar, setModalEditar] = useState<FunilContato | null>(null)
  const [formEditar, setFormEditar] = useState({ nome: '', telefone: '', instrumento: '', etapa: '' })

  // Mapeamento etapa_funil → status na tabela alunos
  const ETAPA_PARA_STATUS: Record<string, string> = {
    '1_lead_novo': 'lead',
    '2_em_atendimento': 'Em Follow-up',
    '3_horario_pre_aprovado': 'agendado',
    '9_perdido': 'perdido',
  }

  function abrirEditar(c: FunilContato) {
    setFormEditar({
      nome: c.nome,
      telefone: c.telefone ?? '',
      instrumento: c.instrumento_interesse ?? '',
      etapa: c.etapa_funil,
    })
    setModalEditar(c)
  }

  async function salvarEdicao() {
    if (!modalEditar) return
    const novoStatus = ETAPA_PARA_STATUS[formEditar.etapa] ?? modalEditar.status_aluno
    await supabase.from('alunos').update({
      nome: formEditar.nome.trim() || modalEditar.nome,
      telefone: formEditar.telefone.trim() || null,
      instrumento_interesse: formEditar.instrumento.trim() || null,
      status: novoStatus,
    }).eq('id', modalEditar.id)
    setModalEditar(null)
    load()
  }

  async function load() {
    setLoading(true)
    const [funilRes, listasRes, convRes] = await Promise.all([
      supabase.from('vw_crm_funil').select('*').limit(1500),
      supabase.from('vw_listas_quentes_instrumento').select('*'),
      supabase.from('vw_conversao_professor').select('*'),
    ])
    setContatos(funilRes.data ?? [])
    setListas(listasRes.data ?? [])
    setConversao(convRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()

    // Realtime: recarrega funil quando Sofia capta lead novo ou atualiza status
    const channel = supabase
      .channel('crm-funil-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alunos' }, () => {
        load()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'aulas_experimentais' }, () => {
        load()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // ─── derived ──────────────────────────────────────────────────────────────

  const instrumentosUnicos = useMemo(() => {
    const set = new Set<string>()
    contatos.forEach(c => c.instrumento_interesse && set.add(c.instrumento_interesse))
    return Array.from(set).sort()
  }, [contatos])

  const ETAPAS_FUNIL = ['1_lead_novo','2_em_atendimento','3_horario_pre_aprovado','4_experimental_confirmada','6_aula_realizada','9_perdido']

  const filtrados = useMemo(() => {
    return contatos.filter(c => {
      if (!ETAPAS_FUNIL.includes(c.etapa_funil)) return false
      if (busca) {
        const q = busca.toLowerCase()
        if (!c.nome.toLowerCase().includes(q)
          && !(c.telefone ?? '').includes(q)
          && !(c.instrumento_interesse ?? '').toLowerCase().includes(q)) return false
      }
      if (filtroInstr && c.instrumento_interesse !== filtroInstr) return false
      if (filtroEtapa && c.etapa_funil !== filtroEtapa) return false
      if (apenasFollowup && !c.followup_pendente) return false
      return true
    })
  }, [contatos, busca, filtroInstr, filtroEtapa, apenasFollowup])

  const porEtapa = useMemo(() => {
    const map: Record<string, FunilContato[]> = {}
    ETAPAS.forEach(e => { map[e.key] = [] })
    filtrados.forEach(c => {
      const arr = map[c.etapa_funil]
      if (arr) arr.push(c)
    })
    return map
  }, [filtrados])

  // Gargalos: leads travados em etapas comerciais
  const gargalos = useMemo(() => {
    const etapasGargalo = ['3_horario_pre_aprovado', '4_experimental_confirmada', '6_aula_realizada']
    return filtrados
      .filter(c => etapasGargalo.includes(c.etapa_funil))
      .sort((a, b) => b.score_temperatura - a.score_temperatura)
  }, [filtrados])

  // Follow-ups pendentes (todos os contatos, não só leads do funil)
  const followupsPendentes = useMemo(() => {
    return contatos
      .filter(c => c.followup_pendente)
      .sort((a, b) => b.score_temperatura - a.score_temperatura)
  }, [contatos])

  // Listas quentes ordenadas e filtradas
  const listasOrdenadas = useMemo(() => {
    return [...listas]
      .filter(l => l.tipo !== 'aluno' || l.total >= 5)
      .filter(l => !filtroListaInstr || l.instrumento === filtroListaInstr)
      .filter(l => !filtroListaTipo || l.tipo === filtroListaTipo)
      .sort((a, b) => (b.em_negociacao - a.em_negociacao) || (b.score_medio - a.score_medio))
  }, [listas, filtroListaInstr, filtroListaTipo])

  // ─── dados semanais ───────────────────────────────────────────────────────
  const { semanaInicio, semanaFim, contatosSemana, entradosSemana, porEtapaSemana } = useMemo(() => {
    const hoje = new Date()
    const diaSemana = hoje.getDay() // 0=dom
    const inicioSemanaAtual = new Date(hoje)
    inicioSemanaAtual.setDate(hoje.getDate() - diaSemana + (diaSemana === 0 ? -6 : 1)) // segunda
    inicioSemanaAtual.setHours(0, 0, 0, 0)
    const semanaInicio = new Date(inicioSemanaAtual)
    semanaInicio.setDate(inicioSemanaAtual.getDate() + semanaOffset * 7)
    const semanaFim = new Date(semanaInicio)
    semanaFim.setDate(semanaInicio.getDate() + 6)
    semanaFim.setHours(23, 59, 59, 999)

    const contatosSemana = contatos.filter(c => {
      if (!c.data_ultima_interacao) return false
      const d = new Date(c.data_ultima_interacao)
      return d >= semanaInicio && d <= semanaFim
    })

    const entradosSemana = contatos.filter(c => {
      if (!c.data_primeiro_contato) return false
      const d = new Date(c.data_primeiro_contato)
      return d >= semanaInicio && d <= semanaFim
    })

    const porEtapaSemana: Record<string, number> = {}
    ETAPAS.forEach(e => { porEtapaSemana[e.key] = 0 })
    contatosSemana.forEach(c => {
      if (c.etapa_funil in porEtapaSemana) porEtapaSemana[c.etapa_funil] = (porEtapaSemana[c.etapa_funil] ?? 0) + 1
      else porEtapaSemana[c.etapa_funil] = 1
    })

    return { semanaInicio, semanaFim, contatosSemana, entradosSemana, porEtapaSemana }
  }, [contatos, semanaOffset])

  // ─── ações ────────────────────────────────────────────────────────────────

  async function toggleFollowup(c: FunilContato) {
    await supabase.rpc('marcar_followup_manual', {
      p_aluno_id: c.id,
      p_pendente: !c.followup_pendente,
    })
    load()
  }

  async function confirmarPerdido() {
    if (!modalPerdido) return
    await supabase.rpc('marcar_lead_perdido', {
      p_aluno_id: modalPerdido.id,
      p_motivo: motivoPerdido || 'sem motivo informado',
    })
    setModalPerdido(null)
    setMotivoPerdido('')
    load()
  }

  function abrirWhats(tel?: string) {
    if (!tel) return
    const num = tel.replace(/\D/g, '')
    window.open(`https://wa.me/${num}`, '_blank')
  }

  // ─── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-6 h-6 text-brand-600" />
          <h1 className="text-2xl font-bold text-gray-900">CRM — Funil Comercial</h1>
        </div>
        <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { k: 'funil', l: 'Funil', i: TrendingUp },
          { k: 'gargalos', l: 'Gargalos', i: AlertCircle },          { k: 'followup', l: 'Follow-up', i: PhoneForwarded, badge: followupsPendentes.length },          { k: 'instrumento', l: 'Listas Quentes', i: Flame },
          { k: 'conversao', l: 'Conversão Professor', i: Trophy },
          { k: 'semanal', l: 'Relatório Semanal', i: BarChart3 },
        ] as const).map(t => {
          const Icon = t.i
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.k ? 'border-brand-600 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <Icon className="w-4 h-4" />
              {t.l}
              {'badge' in t && t.badge > 0 && (
                <span className="ml-1 bg-amber-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                  {t.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Filtros (compartilhados) */}
      {(tab === 'funil' || tab === 'gargalos') && (
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome, telefone, instrumento..."
              className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <select
            value={filtroInstr}
            onChange={e => setFiltroInstr(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Todos os instrumentos</option>
            {instrumentosUnicos.map(i => <option key={i} value={i}>{i}</option>)}
          </select>
          {tab === 'funil' && (
            <select
              value={filtroEtapa}
              onChange={e => setFiltroEtapa(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todas as etapas</option>
              {ETAPAS.map(e => <option key={e.key} value={e.key}>{e.label}</option>)}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 cursor-pointer">
            <input
              type="checkbox"
              checked={apenasFollowup}
              onChange={e => setApenasFollowup(e.target.checked)}
              className="rounded"
            />
            Só follow-up pendente
          </label>
        </div>
      )}

      {/* TAB FUNIL */}
      {tab === 'funil' && (
        <div className="space-y-3">
          {/* Faixa visual do funil */}
          <div className="grid grid-cols-6 gap-2">
            {ETAPAS.map(e => {
              const n = porEtapa[e.key]?.length ?? 0
              return (
                <button
                  key={e.key}
                  onClick={() => setFiltroEtapa(filtroEtapa === e.key ? '' : e.key)}
                  className={`text-xs p-2 rounded-lg border transition-all text-center ${e.cor} ${filtroEtapa === e.key ? 'ring-2 ring-brand-500' : 'hover:opacity-80'}`}
                >
                  <div className="font-bold text-lg">{n}</div>
                  <div className="text-[10px] leading-tight mt-0.5">{e.label}</div>
                </button>
              )
            })}
          </div>

          {/* Lista de contatos */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {filtrados.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-sm">Nenhum contato.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-8">🔥</th>
                    <th className="px-3 py-2 text-left font-medium">Nome</th>
                    <th className="px-3 py-2 text-left font-medium">Etapa</th>
                    <th className="px-3 py-2 text-left font-medium">Instrumento</th>
                    <th className="px-3 py-2 text-left font-medium">Na etapa desde</th>
                    <th className="px-3 py-2 text-left font-medium">Professor</th>
                    <th className="px-3 py-2 text-center font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtrados.slice(0, 200).map(c => {
                    const etapa = ETAPAS.find(e => e.key === c.etapa_funil)
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${corScore(c.score_temperatura)}`}>
                            {c.score_temperatura}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800">{c.nome}</div>
                          {c.telefone && <div className="text-xs text-gray-400">{c.telefone}</div>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${etapa?.cor ?? 'bg-gray-100'}`}>
                            {etapa?.label ?? c.etapa_funil}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{c.instrumento_interesse ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {(() => {
                            const d = c.etapa_funil === '9_perdido' ? c.data_perdido_at
                              : c.etapa_funil === '6_aula_realizada' ? c.data_aula_realizada_at
                              : c.etapa_funil === '4_experimental_confirmada' ? c.data_exp_confirmada_at
                              : c.etapa_funil === '3_horario_pre_aprovado' ? c.data_horario_aprovado_at
                              : c.etapa_funil === '2_em_atendimento' ? c.data_em_atendimento_at
                              : c.data_lead_novo_at
                            return d ? new Date(d).toLocaleDateString('pt-BR') : '—'
                          })()}
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{c.exp_professor_nome ?? '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-center gap-1">
                            {c.telefone && (
                              <button onClick={() => abrirWhats(c.telefone)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded" title="WhatsApp">
                                <Phone className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button onClick={() => abrirEditar(c)}
                              className="p-1.5 text-blue-500 hover:bg-blue-50 rounded" title="Editar">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => toggleFollowup(c)}
                              className={`p-1.5 rounded ${c.followup_pendente ? 'text-amber-600 bg-amber-50' : 'text-gray-400 hover:bg-gray-100'}`}
                              title="Follow-up">
                              <Clock className="w-3.5 h-3.5" />
                            </button>
                            {c.tipo === 'lead' && c.etapa_funil !== '9_perdido' && (
                              <button onClick={() => setModalPerdido(c)}
                                className="p-1.5 text-red-500 hover:bg-red-50 rounded" title="Marcar como perdido">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {filtrados.length > 200 && (
              <div className="px-4 py-2 text-xs text-gray-400 text-center bg-gray-50">
                Exibindo 200 de {filtrados.length} contatos. Use os filtros para refinar.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB GARGALOS */}
      {tab === 'gargalos' && (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <strong>{gargalos.length} contatos</strong> travados nas etapas comerciais (pré-aprovado, experimental confirmada, realizada).
            Estes são os <strong>leads quentes</strong> que precisam de ação imediata para fechar matrícula.
          </div>
          <div className="grid gap-2">
            {gargalos.slice(0, 50).map(c => {
              const etapa = ETAPAS.find(e => e.key === c.etapa_funil)
              return (
                <div key={c.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3 hover:shadow-sm">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${corScore(c.score_temperatura)}`}>
                    {c.score_temperatura}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-800">{c.nome}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${etapa?.cor}`}>{etapa?.label}</span>
                      {c.followup_pendente && (
                        <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Follow-up pendente</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {c.instrumento_interesse ?? 'Sem instrumento'} • {c.telefone ?? 'sem telefone'} • Prof: {c.exp_professor_nome ?? '—'}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {c.telefone && (
                      <button onClick={() => abrirWhats(c.telefone)}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Contatar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {gargalos.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
                <p className="text-sm">Nenhum gargalo no momento. 🎉</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB LISTAS QUENTES POR INSTRUMENTO */}
      {tab === 'instrumento' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            Use estas listas para <strong>abrir novas turmas</strong> ou fazer <strong>disparos segmentados</strong>.
            "Em negociação" = leads com aula experimental ativa.
          </div>

          {/* Filtros de segmentação */}
          <div className="flex flex-wrap gap-3">
            <select
              value={filtroListaInstr}
              onChange={e => setFiltroListaInstr(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos os instrumentos</option>
              {[...new Set(listas.map(l => l.instrumento))].sort().map(i => (
                <option key={i} value={i}>{i}</option>
              ))}
            </select>
            <select
              value={filtroListaTipo}
              onChange={e => setFiltroListaTipo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos os tipos</option>
              <option value="lead">Leads</option>
              <option value="aluno">Alunos ativos</option>
              <option value="ex_aluno">Ex-alunos</option>
            </select>
            {(filtroListaInstr || filtroListaTipo) && (
              <button
                onClick={() => { setFiltroListaInstr(''); setFiltroListaTipo('') }}
                className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2 border border-gray-200 rounded-lg"
              >
                Limpar filtros
              </button>
            )}
            <span className="self-center text-xs text-gray-500">{listasOrdenadas.length} segmento(s)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {listasOrdenadas.map((l, i) => (
              <div key={`${l.instrumento}-${l.tipo}-${i}`}
                className={`bg-white rounded-xl border p-4 ${l.em_negociacao > 3 ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-200'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-gray-800">{l.instrumento}</div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    l.tipo === 'aluno' ? 'bg-green-100 text-green-700' :
                    l.tipo === 'lead' ? 'bg-blue-100 text-blue-700' :
                    'bg-rose-100 text-rose-700'
                  }`}>
                    {l.tipo === 'aluno' ? 'Alunos ativos' : l.tipo === 'lead' ? 'Leads' : 'Ex-alunos'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-2xl font-bold text-gray-800">{l.total}</div>
                    <div className="text-[10px] text-gray-500">Total</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-amber-600">{l.em_negociacao}</div>
                    <div className="text-[10px] text-gray-500">Negociando</div>
                  </div>
                  <div>
                    <div className={`text-2xl font-bold ${l.score_medio >= 60 ? 'text-red-600' : l.score_medio >= 30 ? 'text-orange-600' : 'text-gray-400'}`}>
                      {l.score_medio}
                    </div>
                    <div className="text-[10px] text-gray-500">Score médio</div>
                  </div>
                </div>
                {l.precisam_followup > 0 && (
                  <div className="mt-3 text-xs bg-amber-50 text-amber-700 px-2 py-1 rounded text-center">
                    {l.precisam_followup} precisam de follow-up
                  </div>
                )}
                <button
                  onClick={() => { setTab('funil'); setFiltroInstr(l.instrumento === 'Não definido' ? '' : l.instrumento); setApenasFollowup(false); setFiltroEtapa('') }}
                  className="mt-3 w-full text-xs text-brand-600 hover:bg-brand-50 py-1.5 rounded-lg flex items-center justify-center gap-1"
                >
                  Ver no funil <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB CONVERSÃO PROFESSOR */}
      {tab === 'conversao' && (
        <div className="space-y-3">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800">
            Taxa de conversão = <strong>matrículas / experimentais realizadas</strong> nos últimos 6 meses.
            Use para identificar boas práticas e ajustar a alocação de aulas experimentais.
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 border-b">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Professor</th>
                  <th className="px-4 py-2 text-center font-medium">Exp. agendadas</th>
                  <th className="px-4 py-2 text-center font-medium">Realizadas</th>
                  <th className="px-4 py-2 text-center font-medium">Matrículas</th>
                  <th className="px-4 py-2 text-center font-medium">Conversão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {conversao.map(c => (
                  <tr key={c.professor_nome} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-800">{c.professor_nome}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{c.exp_total}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{c.exp_realizadas}</td>
                    <td className="px-4 py-2 text-center text-gray-600">{c.matriculas}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={`text-sm font-bold ${
                        c.taxa_conversao_pct >= 60 ? 'text-emerald-600' :
                        c.taxa_conversao_pct >= 30 ? 'text-amber-600' :
                        'text-red-500'
                      }`}>
                        {c.taxa_conversao_pct}%
                      </span>
                      {/* Barra visual */}
                      <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden max-w-[100px] mx-auto">
                        <div className={`h-full ${c.taxa_conversao_pct >= 60 ? 'bg-emerald-500' : c.taxa_conversao_pct >= 30 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(100, c.taxa_conversao_pct)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
                {conversao.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-gray-400">Sem dados de conversão nos últimos 6 meses.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── aba: Relatório Semanal ─────────────────────────────────────── */}
      {tab === 'semanal' && (
        <div className="space-y-5">
          {/* Navegação de semana */}
          <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl px-4 py-3">
            <button
              onClick={() => setSemanaOffset(o => o - 1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div className="text-center">
              <div className="font-semibold text-gray-900 text-sm">
                {semanaInicio.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                {' — '}
                {semanaFim.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {semanaOffset === 0 ? 'Semana atual' : semanaOffset === -1 ? 'Semana passada' : `${Math.abs(semanaOffset)} semanas atrás`}
              </div>
            </div>
            <button
              onClick={() => setSemanaOffset(o => Math.min(0, o + 1))}
              disabled={semanaOffset >= 0}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* KPIs da semana */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-brand-600">{entradosSemana.length}</div>
              <div className="text-xs text-gray-500 mt-1">Novos leads</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{contatosSemana.length}</div>
              <div className="text-xs text-gray-500 mt-1">Com interação</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-emerald-600">
                {contatosSemana.filter(c => c.etapa_funil === '7_matriculado').length}
              </div>
              <div className="text-xs text-gray-500 mt-1">Matriculados</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-red-500">
                {contatosSemana.filter(c => c.etapa_funil === '9_perdido').length}
              </div>
              <div className="text-xs text-gray-500 mt-1">Perdidos</div>
            </div>
          </div>

          {/* Tabela por etapa */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-sm">Distribuição por etapa</h3>
              <p className="text-xs text-gray-400 mt-0.5">Contatos com última interação nesta semana</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Etapa</th>
                  <th className="px-4 py-2 text-right font-medium">Contatos</th>
                  <th className="px-4 py-2 text-right font-medium">% do total da semana</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {ETAPAS.map(e => {
                  const count = porEtapaSemana[e.key] ?? 0
                  const pct = contatosSemana.length > 0 ? Math.round((count / contatosSemana.length) * 100) : 0
                  return (
                    <tr key={e.key} className={count === 0 ? 'opacity-40' : ''}>
                      <td className="px-4 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${e.cor}`}>{e.label}</span>
                      </td>
                      <td className="px-4 py-2 text-right font-semibold text-gray-800">{count}</td>
                      <td className="px-4 py-2 text-right text-gray-500">
                        {pct > 0 && (
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                              <div className={`h-full ${e.pill} rounded-full`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs w-8 text-right">{pct}%</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Lista de contatos da semana */}
          {contatosSemana.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="font-semibold text-gray-800 text-sm">Contatos ativos nesta semana</h3>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Nome</th>
                    <th className="px-3 py-2 text-left font-medium">Etapa</th>
                    <th className="px-3 py-2 text-left font-medium">Instrumento</th>
                    <th className="px-3 py-2 text-center font-medium">🔥</th>
                    <th className="px-3 py-2 text-center font-medium">WhatsApp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {contatosSemana.slice(0, 100).map(c => {
                    const etapa = ETAPAS.find(e => e.key === c.etapa_funil)
                    return (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800">{c.nome}</div>
                          {c.telefone && <div className="text-xs text-gray-400">{c.telefone}</div>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${etapa?.cor ?? 'bg-gray-100'}`}>
                            {etapa?.label ?? c.etapa_funil}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{c.instrumento_interesse ?? '—'}</td>
                        <td className="px-3 py-2 text-center">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${corScore(c.score_temperatura)}`}>
                            {c.score_temperatura}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {c.telefone && (
                            <button onClick={() => abrirWhats(c.telefone)} className="p-1 hover:bg-green-50 rounded text-gray-400 hover:text-green-600">
                              <Phone className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {contatosSemana.length === 0 && (
            <div className="text-center py-10 text-gray-400 bg-white rounded-xl border">
              Nenhuma interação registrada nesta semana.
            </div>
          )}
        </div>
      )}

      {/* TAB FOLLOW-UP */}
      {tab === 'followup' && (
        <div className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <PhoneForwarded className="w-4 h-4 text-amber-500" />
                <span className="text-xs text-gray-500">Pendentes agora</span>
              </div>
              <div className="text-3xl font-bold text-amber-600">{followupsPendentes.length}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-gray-500">Em atendimento</span>
              </div>
              <div className="text-3xl font-bold text-blue-600">
                {contatos.filter(c => c.etapa_funil === '2_em_atendimento').length}
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <AlertCircle className="w-4 h-4 text-indigo-500" />
                <span className="text-xs text-gray-500">Horário pré-aprovado</span>
              </div>
              <div className="text-3xl font-bold text-indigo-600">
                {contatos.filter(c => c.etapa_funil === '3_horario_pre_aprovado').length}
              </div>
            </div>
          </div>

          {followupsPendentes.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
              <p className="text-sm text-gray-400">Nenhum follow-up pendente. 🎉</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-semibold text-gray-800 text-sm">{followupsPendentes.length} contatos precisam de retorno</h3>
                <span className="text-xs text-gray-400">Ordenado por temperatura</span>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium w-8">🔥</th>
                    <th className="px-3 py-2 text-left font-medium">Contato</th>
                    <th className="px-3 py-2 text-left font-medium">Etapa</th>
                    <th className="px-3 py-2 text-left font-medium">Instrumento</th>
                    <th className="px-3 py-2 text-left font-medium">Última interação</th>
                    <th className="px-3 py-2 text-center font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {followupsPendentes.map(c => {
                    const etapa = ETAPAS.find(e => e.key === c.etapa_funil)
                    return (
                      <tr key={c.id} className="hover:bg-amber-50/50">
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold ${corScore(c.score_temperatura)}`}>
                            {c.score_temperatura}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-800">{c.nome}</div>
                          {c.telefone && <div className="text-xs text-gray-400">{c.telefone}</div>}
                        </td>
                        <td className="px-3 py-2">
                          {etapa ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${etapa.cor}`}>{etapa.label}</span>
                          ) : (
                            <span className="text-xs text-gray-400">{c.etapa_funil}</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-xs">{c.instrumento_interesse ?? '—'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {c.data_ultima_interacao
                            ? new Date(c.data_ultima_interacao).toLocaleDateString('pt-BR')
                            : '—'}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-center gap-1">
                            {c.telefone && (
                              <button
                                onClick={() => abrirWhats(c.telefone)}
                                className="px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 flex items-center gap-1"
                                title="Abrir WhatsApp"
                              >
                                <Phone className="w-3 h-3" /> Contatar
                              </button>
                            )}
                            <button
                              onClick={() => toggleFollowup(c)}
                              className="px-3 py-1.5 bg-amber-100 text-amber-700 text-xs rounded-lg hover:bg-amber-200 flex items-center gap-1"
                              title="Marcar follow-up como feito"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Feito
                            </button>
                            {c.tipo === 'lead' && c.etapa_funil !== '9_perdido' && (
                              <button
                                onClick={() => setModalPerdido(c)}
                                className="p-1.5 text-red-400 hover:bg-red-50 rounded"
                                title="Marcar como perdido"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal edição de contato */}
      {modalEditar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-gray-900">Editar contato</h2>
              <button onClick={() => setModalEditar(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Nome</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={formEditar.nome}
                  onChange={e => setFormEditar(f => ({ ...f, nome: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Telefone</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={formEditar.telefone}
                  onChange={e => setFormEditar(f => ({ ...f, telefone: e.target.value }))}
                  placeholder="5551999999999"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Instrumento</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={formEditar.instrumento}
                  onChange={e => setFormEditar(f => ({ ...f, instrumento: e.target.value }))}
                >
                  <option value="">— Não definido —</option>
                  {['Piano','Violão','Guitarra','Bateria','Canto','Ukulele','Baixo','Teclado','Musicalização Infantil','Cavaquinho','Contrabaixo','Violino','Percussão'].map(i => (
                    <option key={i} value={i}>{i}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Etapa no funil</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  value={formEditar.etapa}
                  onChange={e => setFormEditar(f => ({ ...f, etapa: e.target.value }))}
                >
                  <option value="1_lead_novo">Lead novo</option>
                  <option value="2_em_atendimento">Em atendimento</option>
                  <option value="3_horario_pre_aprovado">Horário pré-aprovado</option>
                  <option value="9_perdido">Perdido</option>
                </select>
                {(formEditar.etapa === '4_experimental_confirmada' || formEditar.etapa === '6_aula_realizada') && (
                  <p className="text-xs text-amber-600 mt-1">
                    Esta etapa é controlada pela aula experimental. Você pode mover para uma etapa anterior.
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setModalEditar(null)} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
              <button
                onClick={salvarEdicao}
                disabled={!formEditar.nome.trim()}
                className="text-sm bg-brand-600 text-white px-4 py-2 rounded-lg disabled:opacity-50 hover:bg-brand-700"
              >
                Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal lead perdido */}
      {modalPerdido && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <h2 className="text-base font-bold text-gray-900">Marcar como perdido</h2>
            <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
              {modalPerdido.nome} {modalPerdido.telefone && <span className="text-gray-400">• {modalPerdido.telefone}</span>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
              <select
                value={motivoPerdido}
                onChange={e => setMotivoPerdido(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Selecione...</option>
                <option value="preço">Preço</option>
                <option value="horário">Horário</option>
                <option value="distância">Distância</option>
                <option value="desistiu_antes_da_experimental">Desistiu antes da experimental</option>
                <option value="não_compareceu">Não compareceu</option>
                <option value="não_gostou">Não gostou</option>
                <option value="sumiu">Sumiu (sem resposta)</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setModalPerdido(null)} className="text-sm text-gray-500 px-4 py-2">Cancelar</button>
              <button onClick={confirmarPerdido} disabled={!motivoPerdido}
                className="text-sm bg-red-600 text-white px-4 py-2 rounded-lg disabled:opacity-50 hover:bg-red-700">
                Marcar perdido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
