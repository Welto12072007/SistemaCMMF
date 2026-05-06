import { useEffect, useState, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  UserX, CalendarPlus, Clock, CheckCircle2, XCircle, AlertCircle,
  RefreshCw, Plus, Trash2, ChevronDown, ChevronUp, Check, X, User,
  BookOpen, Search,
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

interface Reposicao {
  id: string
  aluno_id?: string
  aluno_nome: string
  professor_id?: string
  professor_nome?: string
  instrumento?: string
  mes_referencia: string
  data_falta?: string
  data_reposicao?: string
  hora_reposicao?: string
  status: string
  motivo_falta?: string
  observacoes?: string
  criado_por?: string
  professor_confirmou_at?: string
  created_at?: string
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

type Tab = 'ausencias' | 'futuras' | 'horarios_extras' | 'reposicoes'

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

  // Reposições
  const [reposicoes, setReposicoes] = useState<Reposicao[]>([])
  const [filtroStatusReposicao, setFiltroStatusReposicao] = useState('')
  const [showModalReposicao, setShowModalReposicao] = useState(false)
  const [formReposicao, setFormReposicao] = useState({
    aluno_id: '', aluno_nome: '', professor_id: '', instrumento: '',
    data_reposicao: '', hora_reposicao: '', data_falta: '', motivo_falta: '', observacoes: '',
  })
  const [alunoQuery, setAlunoQuery] = useState('')
  const [alunoResultados, setAlunoResultados] = useState<{ id: string; nome: string; instrumento_interesse: string }[]>([])
  const [agendandoReposicao, setAgendandoReposicao] = useState<Reposicao | null>(null)
  const [formAgendar, setFormAgendar] = useState({ data_reposicao: '', hora_reposicao: '' })

  const [saving, setSaving] = useState(false)

  // ─── load ────────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true)

    const [profRes, ausRes, extRes, gridRes, reposRes] = await Promise.all([
      supabase.from('professores').select('id, nome, instrumentos, ativo').eq('ativo', true).order('nome'),
      supabase.from('ausencias_professor').select('*').order('data_ausencia', { ascending: false }),
      supabase.from('horarios_extras').select('*').order('data_proposta', { ascending: false }),
      supabase.from('horarios').select('id, professor_id, dia_semana, hora_inicio, aluno_nome, status').eq('status', 'ocupado'),
      supabase.from('reposicoes').select('*').order('created_at', { ascending: false }),
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
    if (reposRes.data) {
      setReposicoes(reposRes.data.map(r => ({
        ...r,
        professor_nome: r.professor_id ? (profMap[r.professor_id] ?? r.professor_nome ?? '-') : (r.professor_nome ?? '-'),
      })))
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
    if (!error) {
      // Marcar aulas do professor nesse dia como "a_remarcar"
      await supabase
        .from('presencas')
        .update({ status_aula: 'a_remarcar' })
        .eq('professor_id', formAusencia.professor_id)
        .eq('data', formAusencia.data_ausencia)
        .neq('status_aula', 'remarcada')
    }
    setSaving(false)
    if (error) { alert(`Erro ao registrar ausência:\n${error.message}`); return }
    setShowModalAusencia(false)
    setFormAusencia({ professor_id: '', data_ausencia: '', periodo: 'dia', motivo: '', observacoes: '' })
    load()
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
    if (error) { alert(`Erro ao propor horário extra:\n${error.message}`); return }
    setShowModalExtra(false)
    setFormExtra({ professor_id: '', data_proposta: '', hora_inicio: '', hora_fim: '', aluno_nome: '', motivo: 'reposicao', observacoes: '' })
    load()
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
    const { error } = await supabase.from('ausencias_professor').delete().eq('id', id)
    if (error) { alert(`Erro ao excluir:\n${error.message}`); return }
    load()
  }

  // ─── reposições ──────────────────────────────────────────────────────────

  const reposicoesFiltradas = reposicoes.filter(r => {
    const mesMatch = r.mes_referencia?.startsWith(filtroMes)
    const profMatch = !filtroProfessor || r.professor_id === filtroProfessor
    const statusMatch = !filtroStatusReposicao || r.status === filtroStatusReposicao
    if (isProfessor && perfil?.professor_id) return r.professor_id === perfil.professor_id && mesMatch && statusMatch
    return mesMatch && profMatch && statusMatch
  })

  async function buscarAlunos(q: string) {
    if (q.length < 2) { setAlunoResultados([]); return }
    const { data } = await supabase
      .from('alunos')
      .select('id, nome, instrumento_interesse')
      .ilike('nome', `%${q}%`)
      .in('status', ['ativo', 'matriculado'])
      .limit(8)
    setAlunoResultados(data ?? [])
  }

  async function salvarReposicao() {
    if (!formReposicao.aluno_nome || !formReposicao.data_reposicao || !formReposicao.hora_reposicao) return
    setSaving(true)
    const mesRef = formReposicao.data_reposicao.slice(0, 7) + '-01'
    const prof = professores.find(p => p.id === formReposicao.professor_id)
    const { error } = await supabase.from('reposicoes').insert({
      aluno_id: formReposicao.aluno_id || null,
      aluno_nome: formReposicao.aluno_nome,
      professor_id: formReposicao.professor_id || null,
      professor_nome: prof?.nome ?? null,
      instrumento: formReposicao.instrumento || null,
      mes_referencia: mesRef,
      data_falta: formReposicao.data_falta || null,
      data_reposicao: formReposicao.data_reposicao,
      hora_reposicao: formReposicao.hora_reposicao,
      motivo_falta: formReposicao.motivo_falta || null,
      observacoes: formReposicao.observacoes || null,
      criado_por: isAdmin ? 'admin' : 'professor',
      status: 'agendada',
    })
    setSaving(false)
    if (error) { alert(`Erro: ${error.message}`); return }
    setShowModalReposicao(false)
    setFormReposicao({ aluno_id: '', aluno_nome: '', professor_id: '', instrumento: '', data_reposicao: '', hora_reposicao: '', data_falta: '', motivo_falta: '', observacoes: '' })
    setAlunoQuery('')
    load()
  }

  async function confirmarReposicao(id: string) {
    const { error } = await supabase.from('reposicoes').update({ professor_confirmou_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert(`Erro ao confirmar:\n${error.message}`); return }
    load()
  }

  async function marcarRealizada(id: string) {
    const { error } = await supabase.from('reposicoes').update({ status: 'realizada' }).eq('id', id)
    if (error) { alert(`Erro ao marcar realizada:\n${error.message}`); return }
    load()
  }

  async function cancelarReposicao(id: string) {
    if (!confirm('Cancelar esta reposição?')) return
    const { error } = await supabase.from('reposicoes').update({ status: 'cancelada' }).eq('id', id)
    if (error) { alert(`Erro ao cancelar:\n${error.message}`); return }
    load()
  }

  async function salvarAgendamento() {
    if (!agendandoReposicao || !formAgendar.data_reposicao || !formAgendar.hora_reposicao) return
    setSaving(true)
    const { error } = await supabase.from('reposicoes').update({
      data_reposicao: formAgendar.data_reposicao,
      hora_reposicao: formAgendar.hora_reposicao,
      status: 'agendada',
    }).eq('id', agendandoReposicao.id)
    setSaving(false)
    if (error) { alert(`Erro ao agendar:\n${error.message}`); return }
    setAgendandoReposicao(null)
    load()
  }

  // ─── contadores ──────────────────────────────────────────────────────────

  const totalAusencias = ausenciasFiltradas().length
  const pendentesExtra = extras.filter(e => e.status === 'pendente').length
  const aprovadosExtra = extras.filter(e => e.status === 'aprovado' && e.data_proposta.startsWith(filtroMes)).length
  const pendentesReposicao = reposicoes.filter(r => r.status === 'pendente' || (r.status === 'agendada' && !r.professor_confirmou_at)).length

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
          {isAdmin && (
            <button
              onClick={() => setShowModalReposicao(true)}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <BookOpen className="w-4 h-4" /> Nova Reposição
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
        {(['ausencias', 'futuras', 'horarios_extras', 'reposicoes'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-brand-500 text-brand-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'ausencias' ? 'Ausências' : t === 'futuras' ? 'Próximas Ausências' : t === 'horarios_extras' ? 'Horários Extras' : 'Reposições'}
            {t === 'horarios_extras' && pendentesExtra > 0 && (
              <span className="ml-2 bg-yellow-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {pendentesExtra}
              </span>
            )}
            {t === 'reposicoes' && pendentesReposicao > 0 && (
              <span className="ml-2 bg-teal-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {pendentesReposicao}
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
                    <Fragment key={a.id}>
                      <tr className="hover:bg-gray-50">
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
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab Próximas Ausências */}
      {tab === 'futuras' && (() => {
        const hoje = new Date().toISOString().slice(0, 10)
        const futuras = ausencias
          .filter(a => a.data_ausencia >= hoje)
          .sort((a, b) => a.data_ausencia.localeCompare(b.data_ausencia))

        // Agrupar por professor
        const porProfessor: Record<string, typeof futuras> = {}
        futuras.forEach(a => {
          const nome = a.professor_nome ?? '—'
          if (!porProfessor[nome]) porProfessor[nome] = []
          porProfessor[nome].push(a)
        })

        return (
          <div className="space-y-4">
            {futuras.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 text-gray-400">
                <UserX className="w-10 h-10 mb-3" />
                <p className="text-sm">Nenhuma ausência programada a partir de hoje.</p>
              </div>
            ) : (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                  <strong>{futuras.length}</strong> ausência{futuras.length > 1 ? 's' : ''} programada{futuras.length > 1 ? 's' : ''} a partir de hoje.
                </div>
                {Object.entries(porProfessor).map(([profNome, lista]) => (
                  <div key={profNome} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                      <User className="w-4 h-4 text-brand-500" />
                      <span className="font-medium text-gray-800 text-sm">{profNome}</span>
                      <span className="ml-auto text-xs text-gray-400">{lista.length} ausência{lista.length > 1 ? 's' : ''}</span>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Data</th>
                          <th className="px-4 py-2 text-left font-medium">Dia</th>
                          <th className="px-4 py-2 text-left font-medium">Período</th>
                          <th className="px-4 py-2 text-left font-medium">Motivo</th>
                          <th className="px-4 py-2 text-left font-medium">Dias restantes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {lista.map(a => {
                          const diff = Math.ceil((new Date(a.data_ausencia + 'T12:00:00').getTime() - Date.now()) / 86400000)
                          return (
                            <tr key={a.id} className={diff <= 3 ? 'bg-red-50/40' : diff <= 7 ? 'bg-amber-50/30' : ''}>
                              <td className="px-4 py-2 font-medium">{fmtDate(a.data_ausencia)}</td>
                              <td className="px-4 py-2 text-gray-600">{dataParaDiaSemana(a.data_ausencia)}</td>
                              <td className="px-4 py-2 text-gray-600">{PERIODO_LABEL[a.periodo] ?? a.periodo}</td>
                              <td className="px-4 py-2 text-gray-500">{a.motivo || '—'}</td>
                              <td className="px-4 py-2">
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                                  diff <= 3 ? 'bg-red-100 text-red-700' :
                                  diff <= 7 ? 'bg-amber-100 text-amber-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>
                                  {diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : `em ${diff} dias`}
                                </span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </>
            )}
          </div>
        )
      })()}

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

      {/* Tab Reposições */}
      {tab === 'reposicoes' && (
        <div className="space-y-4">
          {/* Filtro status */}
          <div className="flex items-center gap-3">
            <select
              value={filtroStatusReposicao}
              onChange={e => setFiltroStatusReposicao(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Todos os status</option>
              <option value="pendente">Pendente</option>
              <option value="agendada">Agendada</option>
              <option value="realizada">Realizada</option>
              <option value="cancelada">Cancelada</option>
              <option value="expirada">Expirada</option>
            </select>
            <span className="text-sm text-gray-500">{reposicoesFiltradas.length} reposição(ões)</span>
          </div>

          {reposicoesFiltradas.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col items-center justify-center py-16 text-gray-400">
              <BookOpen className="w-10 h-10 mb-3" />
              <p className="text-sm">Nenhuma reposição neste período.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reposicoesFiltradas.map(r => (
                <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{r.aluno_nome}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          r.status === 'realizada' ? 'bg-green-100 text-green-800 border-green-200' :
                          r.status === 'agendada' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                          r.status === 'pendente' ? 'bg-yellow-100 text-yellow-800 border-yellow-200' :
                          r.status === 'cancelada' ? 'bg-red-100 text-red-800 border-red-200' :
                          'bg-gray-100 text-gray-600 border-gray-200'
                        }`}>
                          {r.status}
                        </span>
                        {r.professor_confirmou_at && r.status === 'agendada' && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                            ✓ Professor confirmou
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                        {r.instrumento && <span className="flex items-center gap-1"><BookOpen className="w-3.5 h-3.5" />{r.instrumento}</span>}
                        {r.professor_nome && r.professor_nome !== '-' && <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" />{r.professor_nome}</span>}
                        {r.data_falta && <span className="text-gray-500">Falta: {fmtDate(r.data_falta)}</span>}
                        {r.data_reposicao && (
                          <span className="flex items-center gap-1 font-medium text-teal-700">
                            <CalendarPlus className="w-3.5 h-3.5" />
                            Reposição: {fmtDate(r.data_reposicao)} às {fmtTime(r.hora_reposicao ?? '')}
                          </span>
                        )}
                      </div>
                      {r.observacoes && <p className="text-xs text-gray-400 italic">{r.observacoes}</p>}
                    </div>

                    <div className="flex gap-2 flex-wrap justify-end">
                      {/* Professor confirma horário proposto */}
                      {isProfessor && r.status === 'agendada' && !r.professor_confirmou_at && (
                        <button
                          onClick={() => confirmarReposicao(r.id)}
                          className="text-xs px-3 py-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" /> Confirmar horário
                        </button>
                      )}
                      {/* Admin agenda reposição pendente */}
                      {isAdmin && r.status === 'pendente' && (
                        <button
                          onClick={() => { setAgendandoReposicao(r); setFormAgendar({ data_reposicao: '', hora_reposicao: '' }) }}
                          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
                        >
                          <CalendarPlus className="w-3.5 h-3.5" /> Agendar
                        </button>
                      )}
                      {/* Marcar realizada */}
                      {(isAdmin || isProfessor) && r.status === 'agendada' && (
                        <button
                          onClick={() => marcarRealizada(r.id)}
                          className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Realizada
                        </button>
                      )}
                      {/* Cancelar */}
                      {isAdmin && ['pendente', 'agendada'].includes(r.status) && (
                        <button
                          onClick={() => cancelarReposicao(r.id)}
                          className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Nova Reposição */}
      {showModalReposicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-teal-600" /> Nova Reposição
              </h2>
              <button onClick={() => { setShowModalReposicao(false); setAlunoQuery(''); setAlunoResultados([]) }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              {/* Busca aluno */}
              <div className="relative">
                <label className="block text-sm font-medium text-gray-700 mb-1">Aluno <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={alunoQuery}
                    onChange={e => { setAlunoQuery(e.target.value); buscarAlunos(e.target.value) }}
                    placeholder="Buscar aluno ativo..."
                    className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm"
                  />
                </div>
                {formReposicao.aluno_nome && !alunoQuery.length && (
                  <p className="text-xs text-teal-700 mt-1 font-medium">✓ {formReposicao.aluno_nome}</p>
                )}
                {alunoResultados.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                    {alunoResultados.map(a => (
                      <button
                        key={a.id}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b last:border-0"
                        onClick={() => {
                          setFormReposicao(f => ({ ...f, aluno_id: a.id, aluno_nome: a.nome, instrumento: a.instrumento_interesse || f.instrumento }))
                          setAlunoQuery('')
                          setAlunoResultados([])
                        }}
                      >
                        <span className="font-medium">{a.nome}</span>
                        {a.instrumento_interesse && <span className="text-gray-400 ml-2 text-xs">{a.instrumento_interesse}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Professor */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Professor</label>
                <select
                  value={formReposicao.professor_id}
                  onChange={e => setFormReposicao(f => ({ ...f, professor_id: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Selecione...</option>
                  {professores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              {/* Instrumento */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Instrumento</label>
                <input
                  type="text"
                  value={formReposicao.instrumento}
                  onChange={e => setFormReposicao(f => ({ ...f, instrumento: e.target.value }))}
                  placeholder="Ex: Violão"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              {/* Data e hora reposição */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data da Reposição <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={formReposicao.data_reposicao}
                    onChange={e => setFormReposicao(f => ({ ...f, data_reposicao: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Horário <span className="text-red-500">*</span></label>
                  <input
                    type="time"
                    value={formReposicao.hora_reposicao}
                    onChange={e => setFormReposicao(f => ({ ...f, hora_reposicao: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              {/* Data falta (opcional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data da falta (opcional)</label>
                <input
                  type="date"
                  value={formReposicao.data_falta}
                  onChange={e => setFormReposicao(f => ({ ...f, data_falta: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              {/* Observações */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
                <textarea
                  value={formReposicao.observacoes}
                  onChange={e => setFormReposicao(f => ({ ...f, observacoes: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => { setShowModalReposicao(false); setAlunoQuery(''); setAlunoResultados([]) }} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={salvarReposicao}
                disabled={saving || !formReposicao.aluno_nome || !formReposicao.data_reposicao || !formReposicao.hora_reposicao}
                className="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Criar Reposição'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Agendar Reposição Pendente */}
      {agendandoReposicao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Agendar Reposição</h2>
              <button onClick={() => setAgendandoReposicao(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-gray-600">Aluno: <strong>{agendandoReposicao.aluno_nome}</strong></p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data <span className="text-red-500">*</span></label>
                <input type="date" value={formAgendar.data_reposicao} onChange={e => setFormAgendar(f => ({...f, data_reposicao: e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Horário <span className="text-red-500">*</span></label>
                <input type="time" value={formAgendar.hora_reposicao} onChange={e => setFormAgendar(f => ({...f, hora_reposicao: e.target.value}))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setAgendandoReposicao(null)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancelar</button>
              <button
                onClick={salvarAgendamento}
                disabled={saving || !formAgendar.data_reposicao || !formAgendar.hora_reposicao}
                className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Confirmar'}
              </button>
            </div>
          </div>
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
