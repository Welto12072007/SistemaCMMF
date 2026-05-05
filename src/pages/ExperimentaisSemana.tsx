import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, Calendar, RefreshCw, GraduationCap, Phone, CheckCircle2, XCircle, Clock } from 'lucide-react'
import type { AulaExperimental, Professor } from '@/types'

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function startOfWeek(d: Date): Date {
  const day = d.getDay()
  const diff = day // domingo=0
  const r = new Date(d)
  r.setDate(d.getDate() - diff)
  r.setHours(0, 0, 0, 0)
  return r
}
function fmtBR(d: Date) { return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) }
function fmtISO(d: Date) { return d.toISOString().slice(0, 10) }

const statusInfo: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  agendada: { label: 'Agendada', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: <Clock className="w-3 h-3" /> },
  confirmada: { label: 'Confirmada', color: 'bg-cyan-100 text-cyan-800 border-cyan-200', icon: <CheckCircle2 className="w-3 h-3" /> },
  aguardando_professor: { label: 'Ag. Professor', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: <Clock className="w-3 h-3" /> },
  confirmado_professor: { label: 'Conf. Prof.', color: 'bg-cyan-100 text-cyan-800 border-cyan-200', icon: <CheckCircle2 className="w-3 h-3" /> },
  realizada: { label: 'Realizada', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: <CheckCircle2 className="w-3 h-3" /> },
  concluida: { label: 'Concluída', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: <CheckCircle2 className="w-3 h-3" /> },
  cancelada: { label: 'Cancelada', color: 'bg-red-100 text-red-800 border-red-200', icon: <XCircle className="w-3 h-3" /> },
  rejeitado: { label: 'Rejeitada', color: 'bg-red-100 text-red-800 border-red-200', icon: <XCircle className="w-3 h-3" /> },
  remarcada: { label: 'Remarcada', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: <Clock className="w-3 h-3" /> },
  nao_compareceu: { label: 'Não compareceu', color: 'bg-orange-100 text-orange-800 border-orange-200', icon: <XCircle className="w-3 h-3" /> },
}

export default function ExperimentaisSemana() {
  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()))
  const [aulas, setAulas] = useState<AulaExperimental[]>([])
  const [professores, setProfessores] = useState<Professor[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroProf, setFiltroProf] = useState('')
  const [filtroInstr, setFiltroInstr] = useState('')

  const weekEnd = useMemo(() => {
    const e = new Date(weekStart); e.setDate(weekStart.getDate() + 7); return e
  }, [weekStart])

  useEffect(() => { load() }, [weekStart])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('aulas_experimentais')
      .select('*, professor:professores(id,nome)')
      .gte('data_aula', fmtISO(weekStart))
      .lt('data_aula', fmtISO(weekEnd))
      .order('data_aula', { ascending: true })
      .order('hora_inicio', { ascending: true })
    if (data) setAulas(data as AulaExperimental[])
    if (professores.length === 0) {
      const { data: p } = await supabase.from('professores').select('id,nome').eq('ativo', true).order('nome')
      if (p) setProfessores(p as Professor[])
    }
    setLoading(false)
  }

  const filtradas = useMemo(() => {
    return aulas.filter(a => {
      if (filtroProf && a.professor_id !== filtroProf) return false
      if (filtroInstr && (a.instrumento || '').toLowerCase() !== filtroInstr.toLowerCase()) return false
      return true
    })
  }, [aulas, filtroProf, filtroInstr])

  const kpis = useMemo(() => {
    const total = filtradas.length
    const realizadas = filtradas.filter(a => ['realizada', 'concluida'].includes((a.status || '').toLowerCase())).length
    const canceladas = filtradas.filter(a => ['cancelada', 'rejeitado', 'nao_compareceu'].includes((a.status || '').toLowerCase())).length
    const matriculadas = filtradas.filter(a => !!a.convertido_em).length
    return { total, realizadas, canceladas, matriculadas, taxaPresenca: total ? Math.round((realizadas / total) * 100) : 0, taxaConv: realizadas ? Math.round((matriculadas / realizadas) * 100) : 0 }
  }, [filtradas])

  const instrumentosDisponiveis = useMemo(() => {
    const s = new Set(aulas.map(a => a.instrumento).filter(Boolean) as string[])
    return Array.from(s).sort()
  }, [aulas])

  function ajustarSemana(delta: number) {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + delta * 7); setWeekStart(d)
  }
  function semanaAtual() { setWeekStart(startOfWeek(new Date())) }

  // Agrupar por dia
  const porDia = useMemo(() => {
    const map: Record<string, AulaExperimental[]> = {}
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(weekStart.getDate() + i)
      map[fmtISO(d)] = []
    }
    for (const a of filtradas) {
      const k = (a.data_aula || '').slice(0, 10)
      const arr = map[k]; if (arr) arr.push(a)
    }
    return map
  }, [filtradas, weekStart])

  const labelSemana = `${fmtBR(weekStart)} – ${fmtBR(new Date(weekEnd.getTime() - 86400000))}`

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Calendar className="w-6 h-6 text-brand-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Experimentais — Semana</h1>
            <p className="text-gray-500 text-sm">Visão semanal das aulas experimentais agendadas e realizadas</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-white border rounded-lg p-1">
          <button onClick={() => ajustarSemana(-1)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded" title="Semana anterior"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={semanaAtual} className="px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded">{labelSemana}</button>
          <button onClick={() => ajustarSemana(1)} className="p-1.5 text-gray-600 hover:bg-gray-100 rounded" title="Próxima semana"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={load} className="p-1.5 text-gray-500 hover:bg-gray-100 rounded ml-1" title="Atualizar"><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KPI label="Total na semana" value={kpis.total} color="text-brand-600" />
        <KPI label="Realizadas" value={kpis.realizadas} color="text-emerald-600" />
        <KPI label="Canceladas / NC" value={kpis.canceladas} color="text-red-600" />
        <KPI label="Taxa presença" value={`${kpis.taxaPresenca}%`} color="text-cyan-600" />
        <KPI label="Conversão" value={`${kpis.taxaConv}%`} color="text-purple-600" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <select value={filtroProf} onChange={e => setFiltroProf(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
          <option value="">Todos os professores</option>
          {professores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <select value={filtroInstr} onChange={e => setFiltroInstr(e.target.value)} className="px-3 py-2 border rounded-lg text-sm">
          <option value="">Todos os instrumentos</option>
          {instrumentosDisponiveis.map(i => <option key={i} value={i}>{i}</option>)}
        </select>
        {(filtroProf || filtroInstr) && (
          <button onClick={() => { setFiltroProf(''); setFiltroInstr('') }} className="text-sm text-gray-500 underline">limpar</button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><RefreshCw className="w-6 h-6 animate-spin text-brand-500" /></div>
      ) : (
        <>
          {/* Tabela detalhada */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr className="text-left text-xs font-medium text-gray-500 uppercase">
                  <th className="px-4 py-3">Aluno</th>
                  <th className="px-4 py-3">Dia</th>
                  <th className="px-4 py-3">Horário</th>
                  <th className="px-4 py-3">Instrumento</th>
                  <th className="px-4 py-3">Professor</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Conversão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtradas.map(a => {
                  const st = statusInfo[(a.status || '').toLowerCase()] || { label: a.status || '—', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: null }
                  const dt = a.data_aula ? new Date(a.data_aula + 'T00:00') : null
                  return (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="font-medium">{a.nome || '—'}</p>
                        {a.telefone && (
                          <a href={`https://wa.me/${(a.telefone || '').replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-xs text-emerald-600 hover:underline flex items-center gap-1"><Phone className="w-3 h-3" />{a.telefone}</a>
                        )}
                      </td>
                      <td className="px-4 py-3">{dt ? `${DIAS[dt.getDay()]} ${fmtBR(dt)}` : '—'}</td>
                      <td className="px-4 py-3 font-mono">{a.hora_inicio?.slice(0, 5) || '—'}</td>
                      <td className="px-4 py-3">{a.instrumento || '—'}</td>
                      <td className="px-4 py-3">{a.professor_nome || a.professor?.nome || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${st.color}`}>{st.icon}{st.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        {a.convertido_em ? <span className="text-xs text-emerald-700 font-medium">✓ Matriculou</span> : <span className="text-xs text-gray-400">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtradas.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                <GraduationCap className="w-8 h-8 mx-auto mb-2 opacity-50" />
                Nenhuma aula experimental nesta semana.
              </div>
            )}
          </div>

          {/* Mini-grid por dia */}
          <div className="grid grid-cols-7 gap-2">
            {Object.entries(porDia).map(([iso, arr]) => {
              const d = new Date(iso + 'T00:00')
              const isHoje = fmtISO(new Date()) === iso
              return (
                <div key={iso} className={`bg-white rounded-lg border p-2 ${isHoje ? 'border-brand-400 ring-1 ring-brand-100' : 'border-gray-200'}`}>
                  <p className="text-xs font-medium text-gray-500 mb-1">{DIAS[d.getDay()]} {fmtBR(d)}</p>
                  <p className="text-2xl font-bold">{arr.length}</p>
                  <p className="text-[10px] text-gray-400">{arr.length === 1 ? 'aula' : 'aulas'}</p>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

function KPI({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
