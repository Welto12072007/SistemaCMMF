import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Calendar, Music, User, X } from 'lucide-react'
import type { AulaExperimental, Professor } from '@/types'

const INSTRUMENTOS = ['Piano', 'Violão', 'Guitarra', 'Bateria', 'Canto', 'Ukulele', 'Baixo', 'Teclado', 'Musicalização Infantil', 'Cavaquinho', 'Contrabaixo', 'Violino', 'Percussão']

const statusColor: Record<string, string> = {
  agendada: 'bg-blue-100 text-blue-800 border-blue-200',
  confirmada: 'bg-blue-100 text-blue-800 border-blue-200',
  aguardando_professor: 'bg-amber-100 text-amber-800 border-amber-200',
  confirmado_professor: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  aguardando_pagamento: 'bg-orange-100 text-orange-800 border-orange-200',
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

  const agendadas = aulas.filter((a) => ['agendada', 'confirmada', 'aguardando_professor', 'confirmado_professor', 'aguardando_pagamento'].includes(a.status?.toLowerCase())).length
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

  async function handleSaveAula(form: { nome: string; telefone: string; instrumento: string; professor_id: string; data_aula: string; hora_inicio: string; observacoes: string }) {
    const prof = professores.find(p => p.id === form.professor_id)
    await supabase.from('aulas_experimentais').insert({
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
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Nova Aula Experimental
        </button>
      </div>

      {/* Filters */}
      <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm">
        <option>Todos os status</option>
        <option>agendada</option>
        <option>confirmada</option>
        <option>aguardando_professor</option>
        <option>confirmado_professor</option>
        <option>aguardando_pagamento</option>
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
                  {a.data_aula ? new Date(a.data_aula).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'} — {a.hora_inicio}
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

            {['agendada', 'confirmada'].includes(a.status?.toLowerCase()) && (
              <div className="flex gap-2">
                <button onClick={() => remarcar(a.id)} className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50 transition-colors">
                  Remarcar
                </button>
                <button onClick={() => marcarRealizada(a.id)} className="text-xs px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                  Marcar como Realizada
                </button>
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

      {showForm && (
        <NovaAulaForm
          professores={professores}
          onSave={handleSaveAula}
          onClose={() => setShowForm(false)}
        />
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
