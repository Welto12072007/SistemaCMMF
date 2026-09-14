import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Calendar,
  Music,
  PartyPopper,
  AlertCircle,
  Trash2,
  Edit3,
  Loader2,
  MousePointerClick,
  CheckSquare,
} from 'lucide-react'

interface Evento {
  id: string
  titulo: string
  descricao: string | null
  data_inicio: string
  data_fim: string | null
  hora_inicio: string | null
  hora_fim: string | null
  tipo: 'evento' | 'feriado' | 'recesso' | 'aviso'
  cor: string
  visivel_aluno: boolean
}

const TIPO_CONFIG: Record<string, { label: string; icon: typeof Calendar; defaultCor: string }> = {
  evento: { label: 'Evento', icon: PartyPopper, defaultCor: '#6366f1' },
  feriado: { label: 'Feriado', icon: Calendar, defaultCor: '#ef4444' },
  recesso: { label: 'Recesso', icon: Calendar, defaultCor: '#f59e0b' },
  aviso: { label: 'Aviso', icon: AlertCircle, defaultCor: '#3b82f6' },
}

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

function fmtHora(h: string | null) {
  if (!h) return ''
  return h.slice(0, 5)
}

export default function Agenda() {
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin', 'recepcao')

  const [eventos, setEventos] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)
  const [mes, setMes] = useState(() => new Date().getMonth())
  const [ano, setAno] = useState(() => new Date().getFullYear())
  const [showModal, setShowModal] = useState(false)
  const [editEvento, setEditEvento] = useState<Evento | null>(null)
  const [saving, setSaving] = useState(false)

  // Seleção de múltiplos dias (feriados/férias em lote)
  const [modoSelecao, setModoSelecao] = useState(false)
  const [diasSelecionados, setDiasSelecionados] = useState<Set<string>>(new Set())
  const [showBulkModal, setShowBulkModal] = useState(false)
  const [bulkTipo, setBulkTipo] = useState<'feriado' | 'recesso'>('feriado')
  const [bulkTitulo, setBulkTitulo] = useState('')
  const [bulkVisivelAluno, setBulkVisivelAluno] = useState(true)
  const [bulkAvisarWhatsapp, setBulkAvisarWhatsapp] = useState(true)
  const [bulkSaving, setBulkSaving] = useState(false)

  // Form state
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    data_inicio: '',
    data_fim: '',
    hora_inicio: '',
    hora_fim: '',
    tipo: 'evento' as string,
    cor: '#6366f1',
    visivel_aluno: true,
  })

  const loadEventos = useCallback(async () => {
    setLoading(true)
    const primeiroDia = `${ano}-${String(mes + 1).padStart(2, '0')}-01`
    const ultimoDia = new Date(ano, mes + 1, 0)
    const ultimoDiaStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(ultimoDia.getDate()).padStart(2, '0')}`

    let query = supabase
      .from('eventos_agenda')
      .select('*')
      .or(`data_inicio.lte.${ultimoDiaStr},data_fim.gte.${primeiroDia},data_fim.is.null`)
      .lte('data_inicio', ultimoDiaStr)
      .order('data_inicio')

    // Aluno só vê eventos marcados como visíveis
    if (!isAdmin) {
      query = query.eq('visivel_aluno', true)
    }

    const { data } = await query

    setEventos(data || [])
    setLoading(false)
  }, [ano, mes, isAdmin])

  useEffect(() => {
    void loadEventos()
  }, [loadEventos])

  // Build calendar grid
  const grid = useMemo(() => {
    const primeiroDia = new Date(ano, mes, 1)
    const ultimoDia = new Date(ano, mes + 1, 0)
    const startOffset = primeiroDia.getDay()
    const totalDias = ultimoDia.getDate()
    const hoje = new Date()
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`

    const cells: { dia: number; dateStr: string; isToday: boolean; eventos: Evento[] }[] = []

    // Empty cells before month start
    for (let i = 0; i < startOffset; i++) {
      cells.push({ dia: 0, dateStr: '', isToday: false, eventos: [] })
    }

    for (let d = 1; d <= totalDias; d++) {
      const dateStr = `${ano}-${String(mes + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      const dayEvents = eventos.filter((e) => {
        const ini = e.data_inicio
        const fim = e.data_fim || e.data_inicio
        return dateStr >= ini && dateStr <= fim
      })
      cells.push({ dia: d, dateStr, isToday: dateStr === hojeStr, eventos: dayEvents })
    }

    return cells
  }, [ano, mes, eventos])

  function openCreate(dateStr?: string) {
    setEditEvento(null)
    setForm({
      titulo: '',
      descricao: '',
      data_inicio: dateStr || '',
      data_fim: '',
      hora_inicio: '',
      hora_fim: '',
      tipo: 'evento',
      cor: '#6366f1',
      visivel_aluno: true,
    })
    setShowModal(true)
  }

  function openEdit(ev: Evento) {
    setEditEvento(ev)
    setForm({
      titulo: ev.titulo,
      descricao: ev.descricao || '',
      data_inicio: ev.data_inicio,
      data_fim: ev.data_fim || '',
      hora_inicio: ev.hora_inicio ? ev.hora_inicio.slice(0, 5) : '',
      hora_fim: ev.hora_fim ? ev.hora_fim.slice(0, 5) : '',
      tipo: ev.tipo,
      cor: ev.cor || '#6366f1',
      visivel_aluno: ev.visivel_aluno,
    })
    setShowModal(true)
  }

  async function handleSave() {
    if (!form.titulo.trim() || !form.data_inicio) return
    setSaving(true)

    const payload = {
      titulo: form.titulo.trim(),
      descricao: form.descricao.trim() || null,
      data_inicio: form.data_inicio,
      data_fim: form.data_fim || null,
      hora_inicio: form.hora_inicio || null,
      hora_fim: form.hora_fim || null,
      tipo: form.tipo,
      cor: form.cor,
      visivel_aluno: form.visivel_aluno,
    }

    if (editEvento) {
      const { error } = await supabase.from('eventos_agenda').update(payload).eq('id', editEvento.id)
      if (error) { alert('Erro:\n' + error.message); setSaving(false); return }
    } else {
      const { error } = await supabase.from('eventos_agenda').insert(payload)
      if (error) { alert('Erro:\n' + error.message); setSaving(false); return }
    }

    setSaving(false)
    setShowModal(false)
    void loadEventos()
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este evento?')) return
    await supabase.from('eventos_agenda').delete().eq('id', id)
    void loadEventos()
  }

  function toggleDiaSelecionado(dateStr: string) {
    setDiasSelecionados((prev) => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
  }

  function toggleModoSelecao() {
    setModoSelecao((prev) => !prev)
    setDiasSelecionados(new Set())
  }

  function openBulkModal(tipo: 'feriado' | 'recesso') {
    setBulkTipo(tipo)
    setBulkTitulo(tipo === 'feriado' ? 'Feriado' : 'Recesso / Férias')
    setBulkVisivelAluno(true)
    setShowBulkModal(true)
  }

  // Nome do dia da semana igual à convenção usada em horarios.dia_semana (Segunda..Sábado, sem Domingo)
  const DIA_SEMANA_HORARIOS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

  async function avisarAlunosEProfessores(datas: string[], titulo: string) {
    const porDiaSemana = new Map<string, string[]>() // dia_semana -> datas (dd/mm) daquele dia
    for (const dateStr of datas) {
      const diaSemana = DIA_SEMANA_HORARIOS[new Date(dateStr + 'T12:00:00').getDay()]!
      const [, m, d] = dateStr.split('-')
      const lista = porDiaSemana.get(diaSemana) || []
      lista.push(`${d}/${m}`)
      porDiaSemana.set(diaSemana, lista)
    }

    const diasSemana = Array.from(porDiaSemana.keys())
    if (diasSemana.length === 0) return { enviados: 0, erros: 0 }

    const { data: horarios } = await supabase
      .from('horarios')
      .select('dia_semana, aluno_ids, professor_id, professores(telefone)')
      .eq('status', 'ocupado')
      .in('dia_semana', diasSemana)

    // destinatário -> lista de datas (dd/mm) afetadas
    const destinatarios = new Map<string, Set<string>>()
    for (const h of horarios || []) {
      const datasStr = porDiaSemana.get((h as any).dia_semana) || []
      const telProf = (h as any).professores?.telefone as string | undefined
      if (telProf) {
        const s = destinatarios.get(telProf) || new Set<string>()
        datasStr.forEach((ds) => s.add(ds))
        destinatarios.set(telProf, s)
      }
    }

    // Alunos vinculados via aluno_ids
    const alunoIds = Array.from(new Set((horarios || []).flatMap((h: any) => h.aluno_ids || [])))
    let alunoTelPorId = new Map<string, string>()
    if (alunoIds.length > 0) {
      const { data: alunosData } = await supabase.from('alunos').select('id, telefone').in('id', alunoIds)
      alunoTelPorId = new Map((alunosData || []).map((a: any) => [a.id, a.telefone]))
    }
    for (const h of horarios || []) {
      const datasStr = porDiaSemana.get((h as any).dia_semana) || []
      for (const aid of (h as any).aluno_ids || []) {
        const tel = alunoTelPorId.get(aid)
        if (!tel) continue
        const s = destinatarios.get(tel) || new Set<string>()
        datasStr.forEach((ds) => s.add(ds))
        destinatarios.set(tel, s)
      }
    }

    let enviados = 0
    let erros = 0
    const baseUrl = import.meta.env.VITE_EVOLUTION_URL || 'https://api.centrodemusicamurilofinger.com'
    const apiKey = import.meta.env.VITE_EVOLUTION_KEY || 'CentroMusica2026ApiKey'
    for (const [telefone, datasSet] of destinatarios) {
      const datasTxt = Array.from(datasSet).join(', ')
      const texto = `Olá! 🎵 Aviso do Centro de Música Murilo Finger: não haverá aula em ${datasTxt} (${titulo}). Qualquer dúvida, estamos à disposição!`
      try {
        const resp = await fetch(`${baseUrl}/message/sendText/CentroMusica`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: apiKey },
          body: JSON.stringify({ number: telefone, text: texto }),
        })
        if (resp.ok) enviados++
        else erros++
      } catch {
        erros++
      }
    }
    return { enviados, erros }
  }

  async function handleBulkSave() {
    if (!bulkTitulo.trim() || diasSelecionados.size === 0) return
    setBulkSaving(true)
    const cor = TIPO_CONFIG[bulkTipo]!.defaultCor
    const datas = Array.from(diasSelecionados)
    const payload = datas.map((dateStr) => ({
      titulo: bulkTitulo.trim(),
      data_inicio: dateStr,
      tipo: bulkTipo,
      cor,
      visivel_aluno: bulkVisivelAluno,
    }))
    const { error } = await supabase.from('eventos_agenda').insert(payload)
    if (error) { setBulkSaving(false); alert('Erro:\n' + error.message); return }

    if (bulkAvisarWhatsapp) {
      const { enviados, erros } = await avisarAlunosEProfessores(datas, bulkTitulo.trim())
      alert(`Evento(s) criado(s)!\n\nAvisos por WhatsApp: ${enviados} enviado(s)${erros ? `, ${erros} com erro` : ''}.`)
    }

    setBulkSaving(false)
    setShowBulkModal(false)
    setDiasSelecionados(new Set())
    setModoSelecao(false)
    void loadEventos()
  }

  function prevMonth() {
    if (mes === 0) { setMes(11); setAno(ano - 1) } else setMes(mes - 1)
  }
  function nextMonth() {
    if (mes === 11) { setMes(0); setAno(ano + 1) } else setMes(mes + 1)
  }
  function goToday() {
    const hoje = new Date()
    setMes(hoje.getMonth())
    setAno(hoje.getFullYear())
  }

  // Upcoming events (next 30 days)
  const upcoming = useMemo(() => {
    const hoje = new Date()
    const hojeStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`
    const futuro = new Date(hoje.getTime() + 60 * 86400000)
    const futuroStr = `${futuro.getFullYear()}-${String(futuro.getMonth() + 1).padStart(2, '0')}-${String(futuro.getDate()).padStart(2, '0')}`
    return eventos
      .filter((e) => e.data_inicio >= hojeStr && e.data_inicio <= futuroStr)
      .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
  }, [eventos])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-brand-500" />
            Agenda CMMF
          </h1>
          <p className="text-gray-500">Eventos, feriados e datas importantes</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <button
              onClick={toggleModoSelecao}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                modoSelecao
                  ? 'bg-brand-500 text-white hover:bg-brand-600'
                  : 'bg-white border text-gray-700 hover:bg-gray-50'
              }`}
            >
              {modoSelecao ? <CheckSquare className="w-4 h-4" /> : <MousePointerClick className="w-4 h-4" />}
              {modoSelecao ? 'Selecionando dias...' : 'Selecionar vários dias'}
            </button>
            <button
              onClick={() => openCreate()}
              className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Novo evento
            </button>
          </div>
        )}
      </div>

      {modoSelecao && (
        <div className="flex flex-wrap items-center gap-3 bg-brand-50 border border-brand-200 rounded-xl px-4 py-3">
          <span className="text-sm text-brand-700 font-medium">
            {diasSelecionados.size === 0
              ? 'Clique nos dias do calendário para selecionar (ex: todos os dias das férias)'
              : `${diasSelecionados.size} dia(s) selecionado(s)`}
          </span>
          {diasSelecionados.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <button
                onClick={() => openBulkModal('feriado')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-500 text-white hover:bg-red-600"
              >
                Marcar como Feriado
              </button>
              <button
                onClick={() => openBulkModal('recesso')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500 text-white hover:bg-amber-600"
              >
                Marcar como Recesso/Férias
              </button>
              <button
                onClick={() => setDiasSelecionados(new Set())}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border text-gray-600 hover:bg-gray-50"
              >
                Limpar seleção
              </button>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Calendar */}
        <div className="xl:col-span-3 bg-white rounded-xl shadow-sm border p-4">
          {/* Month navigation */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-bold text-gray-800">
                {MESES[mes]} {ano}
              </h2>
              <button onClick={goToday} className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-600">
                Hoje
              </button>
            </div>
            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 gap-px mb-1">
            {DIAS_SEMANA.map((d) => (
              <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
              {grid.map((cell, i) => {
                const selecionado = cell.dia > 0 && diasSelecionados.has(cell.dateStr)
                return (
                <div
                  key={i}
                  className={`min-h-[90px] bg-white p-1.5 ${
                    cell.dia === 0 ? 'bg-gray-50' : 'cursor-pointer hover:bg-gray-50'
                  } ${cell.isToday ? 'ring-2 ring-inset ring-brand-500' : ''} ${
                    selecionado ? 'bg-brand-50 ring-2 ring-inset ring-brand-400' : ''
                  }`}
                  onClick={() => {
                    if (cell.dia === 0 || !isAdmin) return
                    if (modoSelecao) toggleDiaSelecionado(cell.dateStr)
                    else openCreate(cell.dateStr)
                  }}
                >
                  {cell.dia > 0 && (
                    <>
                      <span
                        className={`text-sm font-medium ${
                          cell.isToday
                            ? 'bg-brand-500 text-white w-7 h-7 rounded-full flex items-center justify-center'
                            : 'text-gray-700'
                        }`}
                      >
                        {cell.dia}
                      </span>
                      <div className="mt-0.5 space-y-0.5">
                        {cell.eventos.slice(0, 3).map((ev) => (
                          <button
                            key={ev.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              if (isAdmin) openEdit(ev)
                            }}
                            className="w-full text-left text-[10px] px-1.5 py-0.5 rounded truncate font-medium transition-colors hover:opacity-80"
                            style={{ backgroundColor: ev.cor + '20', color: ev.cor, borderLeft: `3px solid ${ev.cor}` }}
                            title={`${ev.titulo}${ev.hora_inicio ? ` • ${fmtHora(ev.hora_inicio)}` : ''}`}
                          >
                            {ev.titulo}
                          </button>
                        ))}
                        {cell.eventos.length > 3 && (
                          <span className="text-[10px] text-gray-400 pl-1">+{cell.eventos.length - 3}</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Upcoming sidebar */}
        <div className="bg-white rounded-xl shadow-sm border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Próximos eventos</h3>
          {upcoming.length === 0 ? (
            <p className="text-xs text-gray-400">Nenhum evento próximo</p>
          ) : (
            <div className="space-y-3">
              {upcoming.slice(0, 10).map((ev) => {
                const cfg = TIPO_CONFIG[ev.tipo] ?? TIPO_CONFIG.evento!
                const Icon = cfg!.icon
                const d = new Date(ev.data_inicio + 'T12:00:00')
                return (
                  <div key={ev.id} className="flex gap-3 group">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: ev.cor + '15' }}
                    >
                      <Icon className="w-4 h-4" style={{ color: ev.cor }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{ev.titulo}</p>
                      <p className="text-xs text-gray-500">
                        {d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                        {ev.hora_inicio && ` • ${fmtHora(ev.hora_inicio)}`}
                      </p>
                      {ev.descricao && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{ev.descricao}</p>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(ev)} className="p-1 text-gray-400 hover:text-brand-500">
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDelete(ev.id)} className="p-1 text-gray-400 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal criar/editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                {editEvento ? 'Editar evento' : 'Novo evento'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input
                  value={form.titulo}
                  onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  placeholder="Ex: Recital de Final de Semestre"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
                <textarea
                  value={form.descricao}
                  onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 resize-none"
                  placeholder="Detalhes do evento..."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data início *</label>
                  <input
                    type="date"
                    value={form.data_inicio}
                    onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data fim</label>
                  <input
                    type="date"
                    value={form.data_fim}
                    onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora início</label>
                  <input
                    type="time"
                    value={form.hora_inicio}
                    onChange={(e) => setForm({ ...form, hora_inicio: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Hora fim</label>
                  <input
                    type="time"
                    value={form.hora_fim}
                    onChange={(e) => setForm({ ...form, hora_fim: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => {
                      const t = e.target.value
                      setForm({ ...form, tipo: t, cor: TIPO_CONFIG[t]?.defaultCor || '#6366f1' })
                    }}
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  >
                    {Object.entries(TIPO_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.cor}
                      onChange={(e) => setForm({ ...form, cor: e.target.value })}
                      className="w-10 h-10 rounded border cursor-pointer"
                    />
                    <span className="text-xs text-gray-400">{form.cor}</span>
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.visivel_aluno}
                  onChange={(e) => setForm({ ...form, visivel_aluno: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Visível para alunos
              </label>
            </div>

            <div className="flex justify-between mt-6">
              {editEvento && (
                <button
                  onClick={() => { handleDelete(editEvento.id); setShowModal(false) }}
                  className="text-sm text-red-500 hover:text-red-700 flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.titulo.trim() || !form.data_inicio}
                  className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editEvento ? 'Salvar' : 'Criar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal criar em lote (feriados/férias em vários dias de uma vez) */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">
                Marcar {diasSelecionados.size} dia(s) selecionado(s)
              </h3>
              <button onClick={() => setShowBulkModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título *</label>
                <input
                  value={bulkTitulo}
                  onChange={(e) => setBulkTitulo(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                  placeholder="Ex: Feriado Nacional / Férias de Verão"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  value={bulkTipo}
                  onChange={(e) => setBulkTipo(e.target.value as 'feriado' | 'recesso')}
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                >
                  <option value="feriado">Feriado</option>
                  <option value="recesso">Recesso / Férias</option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={bulkVisivelAluno}
                  onChange={(e) => setBulkVisivelAluno(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Visível para alunos
              </label>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={bulkAvisarWhatsapp}
                  onChange={(e) => setBulkAvisarWhatsapp(e.target.checked)}
                  className="rounded border-gray-300"
                />
                Avisar alunos e professores por WhatsApp (das aulas afetadas nesses dias)
              </label>

              <p className="text-xs text-gray-400">
                Será criado um evento independente em cada um dos {diasSelecionados.size} dia(s) selecionado(s).
              </p>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowBulkModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkSave}
                disabled={bulkSaving || !bulkTitulo.trim()}
                className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2"
              >
                {bulkSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                Criar {diasSelecionados.size} evento(s)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
