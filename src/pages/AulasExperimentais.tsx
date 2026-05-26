import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Calendar, Music, User, X, UserPlus, CheckCircle2, List, RefreshCw, Download, Pencil, Trash2 } from 'lucide-react'
import type { AulaExperimental, Professor } from '@/types'
import ExperimentaisSemana from './ExperimentaisSemana'

const INSTRUMENTOS = ['Piano', 'Violão', 'Guitarra', 'Bateria', 'Canto', 'Ukulele', 'Baixo', 'Teclado', 'Musicalização Infantil', 'Cavaquinho', 'Contrabaixo', 'Violino', 'Percussão']

const statusColor: Record<string, string> = {
  agendada: 'bg-blue-100 text-blue-800 border-blue-200',
  confirmada: 'bg-blue-100 text-blue-800 border-blue-200',
  aguardando_professor: 'bg-amber-100 text-amber-800 border-amber-200',
  confirmado_professor: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  realizada: 'bg-green-100 text-green-800 border-green-200',
  concluida: 'bg-green-100 text-green-800 border-green-200',
  cancelada: 'bg-red-100 text-red-800 border-red-200',
  rejeitado: 'bg-red-100 text-red-800 border-red-200',
  remarcada: 'bg-yellow-100 text-yellow-800 border-yellow-200',
}

export default function AulasExperimentais() {
  const [aulas, setAulas] = useState<AulaExperimental[]>([])
  const [professores, setProfessores] = useState<Professor[]>([])
  const [filtro, setFiltro] = useState('Todos os status')
  const [showForm, setShowForm] = useState(false)
  const [converterAula, setConverterAula] = useState<AulaExperimental | null>(null)
  const [aba, setAba] = useState<'lista' | 'semana'>('lista')
  const [trocarProfModal, setTrocarProfModal] = useState<AulaExperimental | null>(null)
  const [novoProfId, setNovoProfId] = useState('')
  const [salvandoProf, setSalvandoProf] = useState(false)
  const [editarAula, setEditarAula] = useState<AulaExperimental | null>(null)
  const [confirmarExcluirId, setConfirmarExcluirId] = useState<string | null>(null)

  useEffect(() => {
    loadAulas()
    loadProfessores()
  }, [])

  async function loadAulas() {
    const { data } = await supabase
      .from('aulas_experimentais')
      .select('*, professor:professores(*)')
      .order('data_aula', { ascending: false })
    if (data) setAulas(data)
  }

  async function loadProfessores() {
    const { data } = await supabase.from('professores').select('*').eq('ativo', true).order('nome')
    if (data) setProfessores(data)
  }

  const filtered = aulas.filter((a) => {
    if (filtro === 'Todos os status') return true
    return a.status?.toLowerCase() === filtro.toLowerCase()
  })

  const agendadas = aulas.filter((a) => ['agendada', 'confirmada', 'aguardando_professor', 'confirmado_professor'].includes(a.status?.toLowerCase())).length
  const realizadas = aulas.filter((a) => ['realizada', 'concluida'].includes(a.status?.toLowerCase())).length
  const canceladas = aulas.filter((a) => ['cancelada', 'remarcada', 'rejeitado'].includes(a.status?.toLowerCase())).length

  async function marcarRealizada(id: string) {
    await supabase.from('aulas_experimentais').update({ status: 'concluida' }).eq('id', id)
    loadAulas()
  }

  async function remarcar(id: string) {
    await supabase.from('aulas_experimentais').update({ status: 'remarcada' }).eq('id', id)
    loadAulas()
  }

  async function excluirAula(id: string) {
    await supabase.from('aulas_experimentais').delete().eq('id', id)
    setConfirmarExcluirId(null)
    loadAulas()
  }

  async function salvarTrocaProfessor() {
    if (!trocarProfModal || !novoProfId) return
    setSalvandoProf(true)
    const prof = professores.find(p => p.id === novoProfId)
    await supabase.from('aulas_experimentais').update({
      professor_id: novoProfId,
      professor_nome: prof?.nome ?? null,
      professor_telefone: prof?.telefone ?? null,
      notificacao_professor_enviada: false,
    }).eq('id', trocarProfModal.id)
    setSalvandoProf(false)
    setTrocarProfModal(null)
    setNovoProfId('')
    loadAulas()
  }

  function exportarICS() {
    const aulasParaExportar = aulas.filter(a =>
      ['agendada', 'confirmada', 'confirmado_professor'].includes(a.status?.toLowerCase() ?? '')
    )
    if (aulasParaExportar.length === 0) {
      alert('Nenhuma aula experimental agendada/confirmada para exportar.')
      return
    }
    const lines: string[] = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CMMF//Aulas Experimentais//PT',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
    ]
    aulasParaExportar.forEach(a => {
      const dtStart = a.data_aula && a.hora_inicio
        ? a.data_aula.replace(/-/g, '') + 'T' + a.hora_inicio.replace(/:/g, '').slice(0, 6) + '00'
        : null
      const dtEnd = a.data_aula && a.hora_fim
        ? a.data_aula.replace(/-/g, '') + 'T' + a.hora_fim.replace(/:/g, '').slice(0, 6) + '00'
        : dtStart
      if (!dtStart) return
      const summary = `Experimental: ${a.nome} — ${a.instrumento}`
      const desc = [
        a.professor_nome ? `Professor: ${a.professor_nome}` : '',
        a.telefone ? `Telefone: ${a.telefone}` : '',
        `Status: ${a.status}`,
      ].filter(Boolean).join('\\n')
      lines.push('BEGIN:VEVENT')
      lines.push(`UID:cmmf-exp-${a.id}`)
      lines.push(`DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`)
      lines.push(`DTSTART;TZID=America/Sao_Paulo:${dtStart}`)
      if (dtEnd) lines.push(`DTEND;TZID=America/Sao_Paulo:${dtEnd}`)
      lines.push(`SUMMARY:${summary}`)
      if (desc) lines.push(`DESCRIPTION:${desc}`)
      lines.push('END:VEVENT')
    })
    lines.push('END:VCALENDAR')

    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `experimentais-cmmf-${new Date().toISOString().slice(0, 10)}.ics`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleUpdateAula(form: { nome: string; telefone: string; instrumento: string; professor_id: string; data_aula: string; hora_inicio: string; observacoes: string; status: string }) {
    if (!editarAula) return
    const prof = professores.find(p => p.id === form.professor_id)
    const horaFim = form.hora_inicio
      ? (() => { const parts = form.hora_inicio.split(':').map(Number); const d = new Date(2000, 0, 1, parts[0] ?? 0, (parts[1] ?? 0) + 45); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` })()
      : null
    const { error } = await supabase.from('aulas_experimentais').update({
      nome: form.nome,
      telefone: form.telefone,
      instrumento: form.instrumento,
      professor_id: form.professor_id || null,
      professor_nome: prof?.nome || null,
      professor_telefone: prof?.telefone || null,
      data_aula: form.data_aula,
      hora_inicio: form.hora_inicio,
      hora_fim: horaFim,
      status: form.status,
      observacoes: form.observacoes || null,
    }).eq('id', editarAula.id)
    if (error) { alert(`Erro ao atualizar:\n${error.message}`); return }
    setEditarAula(null)
    loadAulas()
  }

  async function handleSaveAula(form: { nome: string; telefone: string; instrumento: string; professor_id: string; data_aula: string; hora_inicio: string; observacoes: string }) {
    const prof = professores.find(p => p.id === form.professor_id)
    const { error } = await supabase.from('aulas_experimentais').insert({
      nome: form.nome,
      telefone: form.telefone,
      instrumento: form.instrumento,
      professor_id: form.professor_id || null,
      professor_nome: prof?.nome || null,
      professor_telefone: prof?.telefone || null,
      data_aula: form.data_aula,
      hora_inicio: form.hora_inicio,
      hora_fim: form.hora_inicio ? (() => { const parts = form.hora_inicio.split(':').map(Number); const d = new Date(2000, 0, 1, parts[0] ?? 0, (parts[1] ?? 0) + 45); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; })() : null,
      status: 'agendada',
      observacoes: form.observacoes || null,
    })
    if (error) {
      console.error('[AulasExperimentais] save error:', error)
      alert(`Erro ao salvar aula experimental:\n${error.message}`)
      return
    }
    setShowForm(false)
    loadAulas()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Aulas Experimentais</h1>
          <p className="text-gray-500">Gerencie as aulas experimentais agendadas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportarICS}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 px-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            <Download className="w-4 h-4" />
            Exportar .ics
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nova Aula Experimental
          </button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setAba('lista')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === 'lista' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <List className="w-4 h-4" /> Lista
        </button>
        <button
          onClick={() => setAba('semana')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${aba === 'semana' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          <Calendar className="w-4 h-4" /> Semana
        </button>
      </div>

      {aba === 'semana' ? (
        <ExperimentaisSemana />
      ) : (
        <>

      {/* Filters */}
      <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm">
        <option>Todos os status</option>
        <option>agendada</option>
        <option>confirmada</option>
        <option>aguardando_professor</option>
        <option>confirmado_professor</option>
        <option>concluida</option>
        <option>cancelada</option>
        <option>rejeitado</option>
        <option>remarcada</option>
      </select>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5 text-center">
          <p className="text-sm text-gray-500">Agendadas</p>
          <p className="text-3xl font-bold text-blue-600">{agendadas}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5 text-center">
          <p className="text-sm text-gray-500">Realizadas</p>
          <p className="text-3xl font-bold text-green-600">{realizadas}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5 text-center">
          <p className="text-sm text-gray-500">Canceladas/Remarcadas</p>
          <p className="text-3xl font-bold text-red-600">{canceladas}</p>
        </div>
      </div>

      {/* Cards */}
      <div className="space-y-4">
        {filtered.map((a) => (
          <div key={a.id} className={`bg-white rounded-xl shadow-sm border p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4`}>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <p className="font-semibold text-gray-900">{a.nome || '—'}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${statusColor[a.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                  {a.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {a.data_aula ? new Date(a.data_aula + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'} — {a.hora_inicio}
                </span>
                <span className="flex items-center gap-1">
                  <Music className="w-3.5 h-3.5" />
                  {a.instrumento}
                </span>
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" />
                  {a.professor_nome || a.professor?.nome || '—'}
                </span>
              </div>
              {a.observacoes && <p className="text-xs text-gray-500 mt-2 italic">{a.observacoes}</p>}
            </div>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setEditarAula(a)}
                className="text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1"
              >
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
              {confirmarExcluirId === a.id ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-red-600">Confirmar exclusão?</span>
                  <button onClick={() => excluirAula(a.id)} className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700">Sim</button>
                  <button onClick={() => setConfirmarExcluirId(null)} className="text-xs px-2 py-1 border rounded hover:bg-gray-50">Não</button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmarExcluirId(a.id)}
                  className="text-xs px-3 py-1.5 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                </button>
              )}
              {['agendada', 'confirmada'].includes(a.status?.toLowerCase()) && (
                <>
                  <button
                    onClick={() => { setTrocarProfModal(a); setNovoProfId(a.professor_id ?? '') }}
                    className="text-xs px-3 py-1.5 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors flex items-center gap-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Trocar professor
                  </button>
                  <button onClick={() => remarcar(a.id)} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 transition-colors">
                    Remarcar
                  </button>
                  <button onClick={() => marcarRealizada(a.id)} className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                    Marcar como Realizada
                  </button>
                </>
              )}
            </div>

            {['concluida', 'realizada'].includes(a.status?.toLowerCase()) && (
              <div className="flex gap-2">
                {a.convertido_em ? (
                  <span className="text-xs px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Convertido em aluno
                  </span>
                ) : (
                  <button
                    onClick={() => setConverterAula(a)}
                    className="text-xs px-3 py-1.5 bg-brand-500 text-white rounded-lg hover:bg-brand-600 transition-colors flex items-center gap-1"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Converter em aluno
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-10 text-gray-400 bg-white rounded-xl border">
            Nenhuma aula experimental encontrada
          </div>
        )}
      </div>
        </>
      )}

      {showForm && (
        <NovaAulaForm
          professores={professores}
          onSave={handleSaveAula}
          onClose={() => setShowForm(false)}
        />
      )}

      {editarAula && (
        <EditarAulaForm
          aula={editarAula}
          professores={professores}
          onSave={handleUpdateAula}
          onClose={() => setEditarAula(null)}
        />
      )}

      {converterAula && (
        <ConverterModal
          aula={converterAula}
          onClose={() => setConverterAula(null)}
          onDone={() => { setConverterAula(null); loadAulas() }}
        />
      )}

      {/* Modal: Trocar Professor */}
      {trocarProfModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">Trocar Professor</h2>
              <button onClick={() => setTrocarProfModal(null)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-gray-600">
                Aula de <strong>{trocarProfModal.instrumento}</strong> para <strong>{trocarProfModal.nome}</strong>
                {' '} em {trocarProfModal.data_aula ? new Date(trocarProfModal.data_aula).toLocaleDateString('pt-BR') : '—'}
              </p>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Professor atual: <strong>{trocarProfModal.professor_nome || '(nenhum)'}</strong></label>
                <label className="text-xs text-gray-500 mb-1 block">Novo professor *</label>
                <select
                  value={novoProfId}
                  onChange={e => setNovoProfId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione...</option>
                  {professores
                    .filter(p => !trocarProfModal.instrumento || p.instrumentos?.some(i => i.toLowerCase() === trocarProfModal.instrumento?.toLowerCase()))
                    .map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  <option disabled>──────</option>
                  {professores
                    .filter(p => !p.instrumentos?.some(i => i.toLowerCase() === trocarProfModal.instrumento?.toLowerCase()))
                    .map(p => (
                      <option key={p.id + '_outro'} value={p.id}>{p.nome} (outro instrumento)</option>
                    ))}
                </select>
              </div>
              <p className="text-xs text-amber-600">⚠️ A notificação ao professor será redefinida para reenvio.</p>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button onClick={() => setTrocarProfModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button
                onClick={salvarTrocaProfessor}
                disabled={salvandoProf || !novoProfId || novoProfId === (trocarProfModal.professor_id ?? '')}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {salvandoProf ? 'Salvando...' : 'Confirmar troca'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NovaAulaForm({ professores, onSave, onClose }: {
  professores: Professor[]
  onSave: (form: { nome: string; telefone: string; instrumento: string; professor_id: string; data_aula: string; hora_inicio: string; observacoes: string }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    nome: '', telefone: '', instrumento: '', professor_id: '', data_aula: '', hora_inicio: '', observacoes: '',
  })

  const profsFiltrados = form.instrumento
    ? professores.filter(p => p.instrumentos?.some(i => i.toLowerCase() === form.instrumento.toLowerCase()))
    : professores

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Nova Aula Experimental</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nome do Aluno <span className="text-red-500">*</span></label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} placeholder="Nome completo" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Telefone <span className="text-red-500">*</span></label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})} placeholder="5551999999999" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Instrumento <span className="text-red-500">*</span></label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.instrumento} onChange={e => setForm({...form, instrumento: e.target.value, professor_id: ''})}>
              <option value="">Selecione...</option>
              {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Professor</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.professor_id} onChange={e => setForm({...form, professor_id: e.target.value})}>
              <option value="">Selecione...</option>
              {profsFiltrados.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
            {form.instrumento && profsFiltrados.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">Nenhum professor ativo para {form.instrumento}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Data <span className="text-red-500">*</span></label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.data_aula} onChange={e => setForm({...form, data_aula: e.target.value})} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Horário <span className="text-red-500">*</span></label>
              <input type="time" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.hora_inicio} onChange={e => setForm({...form, hora_inicio: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Observações</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.nome || !form.telefone || !form.instrumento || !form.data_aula || !form.hora_inicio}
            className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// EditarAulaForm — edita qualquer aula experimental (manual ou gerada pela IA)
// ---------------------------------------------------------------------------
const STATUS_OPTIONS = ['agendada', 'confirmada', 'aguardando_professor', 'confirmado_professor', 'realizada', 'concluida', 'remarcada', 'cancelada']

function EditarAulaForm({ aula, professores, onSave, onClose }: {
  aula: AulaExperimental
  professores: Professor[]
  onSave: (form: { nome: string; telefone: string; instrumento: string; professor_id: string; data_aula: string; hora_inicio: string; observacoes: string; status: string }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    nome: aula.nome ?? '',
    telefone: aula.telefone ?? '',
    instrumento: aula.instrumento ?? '',
    professor_id: aula.professor_id ?? '',
    data_aula: aula.data_aula ?? '',
    hora_inicio: aula.hora_inicio ?? '',
    observacoes: aula.observacoes ?? '',
    status: aula.status ?? 'agendada',
  })

  const profsFiltrados = form.instrumento
    ? professores.filter(p => p.instrumentos?.some(i => i.toLowerCase() === form.instrumento.toLowerCase()))
    : professores

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Editar Aula Experimental</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Nome do Aluno <span className="text-red-500">*</span></label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Telefone <span className="text-red-500">*</span></label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Instrumento <span className="text-red-500">*</span></label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.instrumento} onChange={e => setForm({...form, instrumento: e.target.value, professor_id: ''})}>
                <option value="">Selecione...</option>
                {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Status</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Professor</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.professor_id} onChange={e => setForm({...form, professor_id: e.target.value})}>
              <option value="">Sem professor</option>
              {profsFiltrados.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Data <span className="text-red-500">*</span></label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.data_aula} onChange={e => setForm({...form, data_aula: e.target.value})} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Horário <span className="text-red-500">*</span></label>
              <input type="time" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.hora_inicio} onChange={e => setForm({...form, hora_inicio: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Observações</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button
            onClick={() => onSave(form)}
            disabled={!form.nome || !form.telefone || !form.instrumento || !form.data_aula || !form.hora_inicio}
            className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
          >
            Salvar alterações
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ConverterModal — converte aula experimental concluída em aluno matriculado
// ---------------------------------------------------------------------------
function ConverterModal({ aula, onClose, onDone }: {
  aula: AulaExperimental
  onClose: () => void
  onDone: () => void
}) {
  const hoje = new Date().toISOString().slice(0, 10)
  const diaHoje = new Date().getDate()
  const [form, setForm] = useState({
    modalidade: 'individual_mensal',
    valor_plano: 320,
    taxa_matricula: 0,
    desconto_matricula: 0,
    dia_inicio_aulas: diaHoje,
    data_matricula: hoje,
    observacao: '',
  })
  const [existente, setExistente] = useState<{ id: string; nome: string; status: string } | null>(null)
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)

  // Busca aluno existente pelo telefone normalizado
  useEffect(() => {
    (async () => {
      const tel = (aula.telefone || '').replace(/\D/g, '')
      if (!tel) { setChecking(false); return }
      const { data } = await supabase
        .from('alunos')
        .select('id,nome,status')
        .eq('telefone', tel)
        .maybeSingle()
      setExistente(data ?? null)
      setChecking(false)
    })()
  }, [aula.telefone])

  const presets: Record<string, number> = {
    individual_mensal: 320,
    individual_semestral: 280,
    grupo: 180,
  }

  function setModalidade(m: string) {
    setForm(f => ({ ...f, modalidade: m, valor_plano: presets[m] ?? f.valor_plano }))
  }

  const jaAtivo = existente && existente.status?.toLowerCase() === 'ativo'
  const isReativacao = existente && !jaAtivo

  async function handleVincularExistente() {
    if (!existente) return
    setSaving(true)
    const { error } = await supabase
      .from('aulas_experimentais')
      .update({ aluno_id: existente.id, convertido_em: new Date().toISOString(), status: 'concluida' })
      .eq('id', aula.id)
    setSaving(false)
    if (error) { alert(`Erro ao vincular:\n${error.message}`); return }
    alert(`Aula vinculada ao aluno "${existente.nome}" com sucesso!`)
    onDone()
  }

  async function handleConverter() {
    if (jaAtivo) return
    setSaving(true)
    const { data, error } = await supabase.rpc('converter_experimental_em_aluno', {
      p_experimental_id: aula.id,
      p_modalidade: form.modalidade,
      p_valor_plano: form.valor_plano,
      p_taxa_matricula: form.taxa_matricula,
      p_desconto_matricula: form.desconto_matricula,
      p_dia_inicio_aulas: form.dia_inicio_aulas,
      p_data_matricula: form.data_matricula,
      p_observacao: form.observacao || null,
    })
    setSaving(false)

    if (error) {
      console.error('[ConverterModal] rpc error:', error)
      alert(`Erro ao converter:\n${error.message}`)
      return
    }
    const res = data as { ok: boolean; motivo?: string; action?: string; mensalidade_valor?: number; mensalidade_proporcional?: boolean }
    if (!res?.ok) {
      alert(`Não foi possível converter:\n${res?.motivo ?? 'erro desconhecido'}`)
      return
    }
    const acao = res.action === 'reativado' ? 'Aluno reativado' : 'Aluno criado'
    const prop = res.mensalidade_proporcional ? ' (proporcional)' : ''
    alert(`${acao} com sucesso!\n1ª mensalidade: R$ ${res.mensalidade_valor}${prop}`)
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">
            {isReativacao ? 'Reativar Aluno' : 'Converter em Aluno'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
          <p><strong>{aula.nome}</strong> — {aula.telefone}</p>
          <p className="text-gray-600 text-xs mt-1">{aula.instrumento} · Aula em {aula.data_aula ? new Date(aula.data_aula).toLocaleDateString('pt-BR') : '—'}</p>
        </div>

        {checking ? (
          <div className="text-sm text-gray-500 py-6 text-center">Verificando duplicidade...</div>
        ) : jaAtivo ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
            <p className="font-semibold text-amber-800">⚠️ Já existe aluno ativo com este telefone</p>
            <p className="text-amber-700 mt-1">{existente?.nome}</p>
            <p className="text-amber-600 text-xs mt-2">
              Este contato já é um aluno ativo. Você pode vincular a aula experimental ao cadastro existente, sem alterar os dados do aluno.
            </p>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-200 rounded-lg">Cancelar</button>
              <button
                onClick={handleVincularExistente}
                disabled={saving}
                className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? 'Vinculando...' : 'Vincular ao aluno existente'}
              </button>
            </div>
          </div>
        ) : (
          <>
            {isReativacao && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm">
                <p className="font-semibold text-amber-800">⚠️ Aluno inativo encontrado: {existente?.nome}</p>
                <p className="text-amber-700 text-xs mt-1">Será reativado e os dados do plano serão atualizados.</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">Modalidade <span className="text-red-500">*</span></label>
                <select className="w-full border rounded-lg px-3 py-2 text-sm" value={form.modalidade} onChange={e => setModalidade(e.target.value)}>
                  <option value="individual_mensal">Individual Mensal — R$ 320</option>
                  <option value="individual_semestral">Individual Semestral — R$ 280</option>
                  <option value="grupo">Grupo — R$ 180</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Valor mensal (R$) <span className="text-red-500">*</span></label>
                  <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.valor_plano} onChange={e => setForm({ ...form, valor_plano: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Taxa matrícula (R$)</label>
                  <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.taxa_matricula} onChange={e => setForm({ ...form, taxa_matricula: Number(e.target.value) })} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Desconto matrícula (R$)</label>
                  <input type="number" step="0.01" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.desconto_matricula} onChange={e => setForm({ ...form, desconto_matricula: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">Dia início aulas <span className="text-red-500">*</span></label>
                  <input type="number" min={1} max={31} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.dia_inicio_aulas} onChange={e => setForm({ ...form, dia_inicio_aulas: Number(e.target.value) })} />
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Data da matrícula</label>
                <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={form.data_matricula} onChange={e => setForm({ ...form, data_matricula: e.target.value })} />
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-1">Observação (opcional)</label>
                <textarea rows={2} className="w-full border rounded-lg px-3 py-2 text-sm" value={form.observacao} onChange={e => setForm({ ...form, observacao: e.target.value })} placeholder="Ex: aluno preferiu pacote semestral, virá com responsável..." />
              </div>

              <p className="text-xs text-gray-500 italic">
                A 1ª mensalidade será criada automaticamente, proporcional ao dia de início.
              </p>
            </div>

            <div className="flex justify-end gap-3 mt-5">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
              <button
                onClick={handleConverter}
                disabled={saving || !form.modalidade || !form.valor_plano || !form.dia_inicio_aulas}
                className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
              >
                {saving ? 'Convertendo...' : (isReativacao ? 'Reativar aluno' : 'Converter em aluno')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
