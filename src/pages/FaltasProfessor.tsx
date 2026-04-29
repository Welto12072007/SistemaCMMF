import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  UserX, CalendarPlus, Clock, CheckCircle2, XCircle, AlertCircle,
  RefreshCw, Plus, Trash2, ChevronDown, ChevronUp, Check, X,
} from 'lucide-react'

// ─── types ────────────────────────────────────────────────────────────────────

interface Professor {
  id: string
  nome: string
  instrumentos?: string[]
  ativo?: boolean
}

interface Ausencia {
  id: string
  professor_id: string
  professor_nome?: string
  data_ausencia: string
  periodo: string
  motivo?: string
  observacoes?: string
  created_at: string
}

interface HorarioExtra {
  id: string
  professor_id: string
  professor_nome?: string
  data_proposta: string
  hora_inicio: string
  hora_fim: string
  aluno_nome?: string
  motivo: string
  status: string
  motivo_recusa?: string
  observacoes?: string
  created_at: string
}

interface HorarioGrid {
  id: string
  professor_id: string
  dia_semana: string
  hora_inicio: string
  aluno_nome?: string | null
  status: string
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const PERIODO_LABEL: Record<string, string> = {
  dia: 'Dia todo',
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
}

const MOTIVO_EXTRA_LABEL: Record<string, string> = {
  reposicao: 'Reposição',
  antecipacao: 'Antecipação',
  evento: 'Evento',
  outro: 'Outro',
}

const STATUS_BADGE: Record<string, string> = {
  pendente: 'bg-yellow-100 text-yellow-800',
  aprovado: 'bg-green-100 text-green-800',
  recusado: 'bg-red-100 text-red-800',
}

const DIA_MAP: Record<number, string> = {
  1: 'Segunda', 2: 'Terça', 3: 'Quarta', 4: 'Quinta', 5: 'Sexta', 6: 'Sábado',
}

function dataParaDiaSemana(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return DIA_MAP[d.getDay()] ?? ''
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

function fmtTime(t: string) { return t?.slice(0, 5) ?? '' }

// ─── component ────────────────────────────────────────────────────────────────

type Tab = 'ausencias' | 'horarios_extras'

export default function FaltasProfessor() {
  const { hasRole, perfil } = useAuth()
  const isAdmin = hasRole('admin', 'recepcao')
  const isProfessor = hasRole('professor')

  const [tab, setTab] = useState<Tab>('ausencias')
  const [loading, setLoading] = useState(true)

  const [professores, setProfessores] = useState<Professor[]>([])
  const [ausencias, setAusencias] = useState<Ausencia[]>([])
  const [extras, setExtras] = useState<HorarioExtra[]>([])
  const [horarioGrid, setHorarioGrid] = useState<HorarioGrid[]>([])

  // Filtros
  const [filtroProfessor, setFiltroProfessor] = useState('')
  const [filtroMes, setFiltroMes] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // Modal ausência
  const [showModalAusencia, setShowModalAusencia] = useState(false)
  const [formAusencia, setFormAusencia] = useState({
    professor_id: '',
    data_ausencia: '',
    periodo: 'dia',
    motivo: '',
    observacoes: '',
  })

  // Modal horário extra
  const [showModalExtra, setShowModalExtra] = useState(false)
  const [formExtra, setFormExtra] = useState({
    professor_id: '',
    data_proposta: '',
    hora_inicio: '',
    hora_fim: '',
    aluno_nome: '',
    motivo: 'reposicao',
    observacoes: '',
  })

  // Detalhe ausência (alunos impactados)
  const [ausenciaAberta, setAusenciaAberta] = useState<string | null>(null)
  const [impactados, setImpactados] = useState<HorarioGrid[]>([])

  const [saving, setSaving] = useState(false)

  // ─── load ────────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true)

    const [profRes, ausRes, extRes, gridRes] = await Promise.all([
      supabase.from('professores').select('id, nome, instrumentos, ativo').eq('ativo', true).order('nome'),
      supabase.from('ausencias_professor').select('*').order('data_ausencia', { ascending: false }),
      supabase.from('horarios_extras').select('*').order('data_proposta', { ascending: false }),
      supabase.from('horarios').select('id, professor_id, dia_semana, hora_inicio, aluno_nome, status').eq('status', 'ocupado'),
    ])

    if (profRes.data) setProfessores(profRes.data)
    if (gridRes.data) setHorarioGrid(gridRes.data)

    // Enriquece com nome do professor
    const profMap: Record<string, string> = {}
    ;(profRes.data ?? []).forEach(p => { profMap[p.id] = p.nome })

    if (ausRes.data) {
      setAusencias(ausRes.data.map(a => ({ ...a, professor_nome: profMap[a.professor_id] ?? '-' })))
    }
    if (extRes.data) {
      setExtras(extRes.data.map(e => ({ ...e, professor_nome: profMap[e.professor_id] ?? '-' })))
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ─── filtros ─────────────────────────────────────────────────────────────

  function ausenciasFiltradas() {
    return ausencias.filter(a => {
      const mesMatch = a.data_ausencia.startsWith(filtroMes)
      const profMatch = !filtroProfessor || a.professor_id === filtroProfessor
      return mesMatch && profMatch
    })
  }

  function extrasFiltrados() {
    return extras.filter(e => {
      const mesMatch = e.data_proposta.startsWith(filtroMes)
      const profMatch = !filtroProfessor || e.professor_id === filtroProfessor
      return mesMatch && profMatch
    })
  }

  // ─── alunos impactados por ausência ──────────────────────────────────────

  function abrirImpactados(ausencia: Ausencia) {
    if (ausenciaAberta === ausencia.id) {
      setAusenciaAberta(null)
      return
    }
    const dia = dataParaDiaSemana(ausencia.data_ausencia)
    const afetados = horarioGrid.filter(
      h => h.professor_id === ausencia.professor_id && h.dia_semana === dia
    )
    setImpactados(afetados)
    setAusenciaAberta(ausencia.id)
  }

  // ─── salvar ausência ─────────────────────────────────────────────────────

  async function salvarAusencia() {
    if (!formAusencia.professor_id || !formAusencia.data_ausencia) return
    setSaving(true)
    const { error } = await supabase.from('ausencias_professor').insert({
      professor_id: formAusencia.professor_id,
      data_ausencia: formAusencia.data_ausencia,
      periodo: formAusencia.periodo,
      motivo: formAusencia.motivo || null,
      observacoes: formAusencia.observacoes || null,
      registrado_por: perfil?.user_id ?? null,
    })
    setSaving(false)
    if (!error) {
      setShowModalAusencia(false)
      setFormAusencia({ professor_id: '', data_ausencia: '', periodo: 'dia', motivo: '', observacoes: '' })
      load()
    }
  }

  // ─── salvar horário extra ─────────────────────────────────────────────────

  async function salvarExtra() {
    if (!formExtra.professor_id || !formExtra.data_proposta || !formExtra.hora_inicio || !formExtra.hora_fim) return
    setSaving(true)

    // Se professor logado, usa o professor_id do perfil
    let profId = formExtra.professor_id
    if (isProfessor && perfil?.professor_id) profId = perfil.professor_id

    const { error } = await supabase.from('horarios_extras').insert({
      professor_id: profId,
      data_proposta: formExtra.data_proposta,
      hora_inicio: formExtra.hora_inicio,
      hora_fim: formExtra.hora_fim,
      aluno_nome: formExtra.aluno_nome || null,
      motivo: formExtra.motivo,
      observacoes: formExtra.observacoes || null,
      status: 'pendente',
    })
    setSaving(false)
    if (!error) {
      setShowModalExtra(false)
      setFormExtra({ professor_id: '', data_proposta: '', hora_inicio: '', hora_fim: '', aluno_nome: '', motivo: 'reposicao', observacoes: '' })
      load()
    }
  }

  // ─── aprovar / recusar horário extra ─────────────────────────────────────

  async function atualizarStatusExtra(id: string, status: 'aprovado' | 'recusado', motivo_recusa?: string) {
    await supabase.from('horarios_extras').update({
      status,
      aprovado_por: perfil?.user_id ?? null,
      aprovado_em: new Date().toISOString(),
      motivo_recusa: motivo_recusa ?? null,
    }).eq('id', id)
    load()
  }

  // ─── excluir ausência ────────────────────────────────────────────────────

  async function excluirAusencia(id: string) {
    if (!confirm('Excluir esta ausência?')) return
    await supabase.from('ausencias_professor').delete().eq('id', id)
    load()
  }

  // ─── contadores ──────────────────────────────────────────────────────────

  const totalAusencias = ausenciasFiltradas().length
  const pendentesExtra = extras.filter(e => e.status === 'pendente').length
  const aprovadosExtra = extras.filter(e => e.status === 'aprovado' && e.data_proposta.startsWith(filtroMes)).length

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
          <UserX className="w-6 h-6 text-orange-500" />
          <h1 className="text-2xl font-bold text-gray-900">Faltas de Professor</h1>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <button
              onClick={() => setShowModalAusencia(true)}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Registrar Ausência
            </button>
          )}
          <button
            onClick={() => setShowModalExtra(true)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <CalendarPlus className="w-4 h-4" /> Propor Horário Extra
          </button>
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
          <div className="p-3 bg-orange-100 rounded-xl"><UserX className="w-5 h-5 text-orange-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Ausências no mês</p>
            <p className="text-2xl font-bold text-gray-900">{totalAusencias}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
          <div className="p-3 bg-yellow-100 rounded-xl"><Clock className="w-5 h-5 text-yellow-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Extras pendentes</p>
            <p className="text-2xl font-bold text-gray-900">{pendentesExtra}</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-xl"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
          <div>
            <p className="text-xs text-gray-500">Extras aprovados (mês)</p>
            <p className="text-2xl font-bold text-gray-900">{aprovadosExtra}</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 bg-white rounded-xl border border-gray-200 p-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Mês</label>
          <input
            type="month"
            value={filtroMes}
            onChange={e => setFiltroMes(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
          />
        </div>
        {isAdmin && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Professor</label>
            <select
              value={filtroProfessor}
              onChange={e => setFiltroProfessor(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm min-w-[180px]"
            >
              <option value="">Todos</option>
              {professores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['ausencias', 'horarios_extras'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'ausencias' ? 'Ausências' : 'Horários Extras'}
            {t === 'horarios_extras' && pendentesExtra > 0 && (
              <span className="ml-2 bg-yellow-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {pendentesExtra}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Ausências */}
      {tab === 'ausencias' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {ausenciasFiltradas().length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <UserX className="w-10 h-10 mb-3" />
              <p className="text-sm">Nenhuma ausência registrada para este período.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Professor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Período</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Motivo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Alunos afetados</th>
                  {isAdmin && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {ausenciasFiltradas().map(a => {
                  const isOpen = ausenciaAberta === a.id
                  return (
                    <>
                      <tr key={a.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{a.professor_nome}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {fmtDate(a.data_ausencia)}
                          <span className="ml-2 text-xs text-gray-400">({dataParaDiaSemana(a.data_ausencia)})</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">{PERIODO_LABEL[a.periodo] ?? a.periodo}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{a.motivo || '—'}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => abrirImpactados(a)}
                            className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-800"
                          >
                            Ver {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-right">
                            <button onClick={() => excluirAusencia(a.id)} className="text-gray-300 hover:text-red-500">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                      {isOpen && (
                        <tr key={`${a.id}-imp`} className="bg-orange-50">
                          <td colSpan={isAdmin ? 6 : 5} className="px-6 py-3">
                            {impactados.length === 0 ? (
                              <p className="text-sm text-gray-500 italic">Nenhum aluno com aula agendada neste dia da semana.</p>
                            ) : (
                              <div>
                                <p className="text-xs font-semibold text-orange-700 mb-2">
                                  {impactados.length} aluno{impactados.length > 1 ? 's' : ''} com aula às {dataParaDiaSemana(a.data_ausencia)}:
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {impactados.map(h => (
                                    <span key={h.id} className="bg-white border border-orange-200 rounded-full px-3 py-1 text-xs text-orange-800">
                                      {h.aluno_nome ?? '—'} • {fmtTime(h.hora_inicio)}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab Horários Extras */}
      {tab === 'horarios_extras' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {extrasFiltrados().length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <CalendarPlus className="w-10 h-10 mb-3" />
              <p className="text-sm">Nenhum horário extra proposto neste período.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Professor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Data</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Horário</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Aluno</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Motivo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                  {isAdmin && <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {extrasFiltrados().map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{e.professor_nome}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{fmtDate(e.data_proposta)}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {fmtTime(e.hora_inicio)} – {fmtTime(e.hora_fim)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{e.aluno_nome || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{MOTIVO_EXTRA_LABEL[e.motivo] ?? e.motivo}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${STATUS_BADGE[e.status]}`}>
                        {e.status === 'pendente' && <Clock className="w-3 h-3" />}
                        {e.status === 'aprovado' && <Check className="w-3 h-3" />}
                        {e.status === 'recusado' && <X className="w-3 h-3" />}
                        {e.status.charAt(0).toUpperCase() + e.status.slice(1)}
                      </span>
                      {e.motivo_recusa && (
                        <p className="text-xs text-red-500 mt-0.5">{e.motivo_recusa}</p>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        {e.status === 'pendente' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => atualizarStatusExtra(e.id, 'aprovado')}
                              className="flex items-center gap-1 text-xs bg-green-100 hover:bg-green-200 text-green-800 px-2 py-1 rounded"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Aprovar
                            </button>
                            <button
                              onClick={() => {
                                const motivo = prompt('Motivo da recusa (opcional):') ?? ''
                                atualizarStatusExtra(e.id, 'recusado', motivo)
                              }}
                              className="flex items-center gap-1 text-xs bg-red-100 hover:bg-red-200 text-red-800 px-2 py-1 rounded"
                            >
                              <XCircle className="w-3 h-3" /> Recusar
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Modal Registrar Ausência */}
      {showModalAusencia && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <UserX className="w-5 h-5 text-orange-500" /> Registrar Ausência
              </h2>
              <button onClick={() => setShowModalAusencia(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Professor *</label>
                <select
                  value={formAusencia.professor_id}
                  onChange={e => setFormAusencia(f => ({ ...f, professor_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Selecione...</option>
                  {professores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                <input
                  type="date"
                  value={formAusencia.data_ausencia}
                  onChange={e => setFormAusencia(f => ({ ...f, data_ausencia: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Período</label>
                <select
                  value={formAusencia.periodo}
                  onChange={e => setFormAusencia(f => ({ ...f, periodo: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="dia">Dia todo</option>
                  <option value="manha">Manhã</option>
                  <option value="tarde">Tarde</option>
                  <option value="noite">Noite</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                <input
                  type="text"
                  value={formAusencia.motivo}
                  onChange={e => setFormAusencia(f => ({ ...f, motivo: e.target.value }))}
                  placeholder="Ex: Problema de saúde, compromisso pessoal..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  value={formAusencia.observacoes}
                  onChange={e => setFormAusencia(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowModalAusencia(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={salvarAusencia}
                disabled={saving || !formAusencia.professor_id || !formAusencia.data_ausencia}
                className="px-4 py-2 text-sm bg-orange-600 hover:bg-orange-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Horário Extra */}
      {showModalExtra && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-brand-500" /> Propor Horário Extra
              </h2>
              <button onClick={() => setShowModalExtra(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-gray-500">
              Aguarda aprovação da administração antes de entrar na agenda oficial.
            </p>

            <div className="space-y-3">
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Professor *</label>
                  <select
                    value={formExtra.professor_id}
                    onChange={e => setFormExtra(f => ({ ...f, professor_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Selecione...</option>
                    {professores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                  <input
                    type="date"
                    value={formExtra.data_proposta}
                    onChange={e => setFormExtra(f => ({ ...f, data_proposta: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                  <select
                    value={formExtra.motivo}
                    onChange={e => setFormExtra(f => ({ ...f, motivo: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="reposicao">Reposição</option>
                    <option value="antecipacao">Antecipação</option>
                    <option value="evento">Evento</option>
                    <option value="outro">Outro</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Início *</label>
                  <input
                    type="time"
                    value={formExtra.hora_inicio}
                    onChange={e => setFormExtra(f => ({ ...f, hora_inicio: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Fim *</label>
                  <input
                    type="time"
                    value={formExtra.hora_fim}
                    onChange={e => setFormExtra(f => ({ ...f, hora_fim: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Aluno</label>
                <input
                  type="text"
                  value={formExtra.aluno_nome}
                  onChange={e => setFormExtra(f => ({ ...f, aluno_nome: e.target.value }))}
                  placeholder="Nome do aluno (opcional)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  value={formExtra.observacoes}
                  onChange={e => setFormExtra(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowModalExtra(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={salvarExtra}
                disabled={saving || !formExtra.data_proposta || !formExtra.hora_inicio || !formExtra.hora_fim || (isAdmin && !formExtra.professor_id)}
                className="px-4 py-2 text-sm bg-brand-600 hover:bg-brand-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Propor'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
