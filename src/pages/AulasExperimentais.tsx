import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Calendar, Music, User } from 'lucide-react'
import type { AulaExperimental } from '@/types'

const statusColor: Record<string, string> = {
  agendada: 'bg-blue-100 text-blue-800 border-blue-200',
  confirmada: 'bg-blue-100 text-blue-800 border-blue-200',
  realizada: 'bg-green-100 text-green-800 border-green-200',
  concluida: 'bg-green-100 text-green-800 border-green-200',
  cancelada: 'bg-red-100 text-red-800 border-red-200',
  remarcada: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  Agendada: 'bg-blue-100 text-blue-800 border-blue-200',
  Realizada: 'bg-green-100 text-green-800 border-green-200',
  Cancelada: 'bg-red-100 text-red-800 border-red-200',
  Remarcada: 'bg-yellow-100 text-yellow-800 border-yellow-200',
}

export default function AulasExperimentais() {
  const [aulas, setAulas] = useState<AulaExperimental[]>([])
  const [filtro, setFiltro] = useState('Todos os status')

  useEffect(() => {
    loadAulas()
  }, [])

  async function loadAulas() {
    const { data } = await supabase
      .from('aulas_experimentais')
      .select('*, professor:professores(*)')
      .order('data_aula', { ascending: true })
    if (data) setAulas(data)
  }

  const filtered = aulas.filter((a) => {
    if (filtro === 'Todos os status') return true
    return a.status?.toLowerCase() === filtro.toLowerCase()
  })

  const agendadas = filtered.filter((a) => ['agendada', 'confirmada'].includes(a.status?.toLowerCase())).length
  const realizadas = filtered.filter((a) => ['realizada', 'concluida'].includes(a.status?.toLowerCase())).length
  const canceladas = filtered.filter((a) => ['cancelada', 'remarcada'].includes(a.status?.toLowerCase())).length

  async function marcarRealizada(id: string) {
    await supabase.from('aulas_experimentais').update({ status: 'concluida' }).eq('id', id)
    loadAulas()
  }

  async function remarcar(id: string) {
    await supabase.from('aulas_experimentais').update({ status: 'remarcada' }).eq('id', id)
    loadAulas()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Aulas Experimentais</h1>
          <p className="text-gray-500">Gerencie as aulas experimentais agendadas</p>
        </div>
        <button className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 transition-colors">
          <Plus className="w-4 h-4" />
          Nova Aula Experimental
        </button>
      </div>

      {/* Filters */}
      <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm">
        <option>Todos os status</option>
        <option>agendada</option>
        <option>confirmada</option>
        <option>concluida</option>
        <option>cancelada</option>
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
    </div>
  )
}
