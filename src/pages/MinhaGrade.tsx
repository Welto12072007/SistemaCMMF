import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  CalendarClock, Plus, Trash2, Loader2, AlertCircle,
  CheckCircle2, Ban, BookOpen, Users, Clock, X,
} from 'lucide-react'

interface Horario {
  id: string
  dia_semana: string
  hora_inicio: string
  hora_fim: string | null
  status: 'disponivel' | 'ocupado' | 'indisponivel'
  aluno_nome: string | null
  tipo: string | null
  instrumento: string | null
}

const DIAS_ORDEM = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const HORAS = Array.from({ length: 15 }, (_, i) => {
  const h = i + 7
  return `${String(h).padStart(2, '0')}:00`
})
const INSTRUMENTOS = [
  'Bateria', 'Canto', 'Cavaquinho', 'Contrabaixo', 'Flauta', 'Guitarra',
  'Piano', 'Teclado', 'Ukulele', 'Violão', 'Violino',
]

function fmtHora(t: string) { return t?.slice(0, 5) ?? '' }

const STATUS_COLORS = {
  disponivel: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  ocupado: 'bg-sky-50 border-sky-200 text-sky-800',
  indisponivel: 'bg-gray-50 border-gray-200 text-gray-400',
}

const STATUS_LABEL = {
  disponivel: 'Disponível',
  ocupado: 'Ocupado',
  indisponivel: 'Bloqueado',
}

export default function MinhaGrade() {
  const { perfil } = useAuth()
  const professor_id = perfil?.professor_id ?? null

  const [horarios, setHorarios] = useState<Horario[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)

  // Modal novo slot
  const [showNovo, setShowNovo] = useState(false)
  const [novoDia, setNovoDia] = useState('Segunda')
  const [novaHora, setNovaHora] = useState('08:00')
  const [novaHoraFim, setNovaHoraFim] = useState('09:00')
  const [novoInstrumento, setNovoInstrumento] = useState('')
  const [novoStatus, setNovoStatus] = useState<'disponivel' | 'indisponivel'>('disponivel')
  const [salvandoNovo, setSalvandoNovo] = useState(false)
  const [erroNovo, setErroNovo] = useState('')

  // Confirmação de exclusão
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  async function load() {
    if (!professor_id) return
    setLoading(true)
    const { data } = await supabase
      .from('horarios')
      .select('id,dia_semana,hora_inicio,hora_fim,status,aluno_nome,tipo,instrumento')
      .eq('professor_id', professor_id)
      .order('hora_inicio')
    setHorarios((data ?? []) as Horario[])
    setLoading(false)
  }

  useEffect(() => { load() }, [professor_id])

  async function toggleStatus(h: Horario) {
    if (h.status === 'ocupado') return // não pode mexer em slot com aluno
    const novoStatus = h.status === 'disponivel' ? 'indisponivel' : 'disponivel'
    setSaving(h.id)
    await supabase.from('horarios').update({ status: novoStatus }).eq('id', h.id)
    setHorarios(prev => prev.map(x => x.id === h.id ? { ...x, status: novoStatus } : x))
    setSaving(null)
  }

  async function deletarSlot(id: string) {
    setSaving(id)
    await supabase.from('horarios').delete().eq('id', id)
    setHorarios(prev => prev.filter(x => x.id !== id))
    setConfirmDelete(null)
    setSaving(null)
  }

  async function adicionarSlot() {
    setErroNovo('')
    if (!professor_id) return
    if (novaHora >= novaHoraFim) {
      setErroNovo('Hora início deve ser anterior à hora fim.')
      return
    }
    setSalvandoNovo(true)
    const { error } = await supabase.from('horarios').insert({
      professor_id,
      dia_semana: novoDia,
      hora_inicio: novaHora + ':00',
      hora_fim: novaHoraFim + ':00',
      status: novoStatus,
      instrumento: novoInstrumento || null,
      tipo: 'individual',
    })
    setSalvandoNovo(false)
    if (error) { setErroNovo(error.message); return }
    setShowNovo(false)
    setNovoInstrumento('')
    load()
  }

  const porDia = useMemo(() => {
    const g: Record<string, Horario[]> = {}
    DIAS_ORDEM.forEach(d => { g[d] = [] })
    horarios.forEach(h => { if (g[h.dia_semana]) g[h.dia_semana]!.push(h) })
    return g
  }, [horarios])

  const stats = useMemo(() => ({
    total: horarios.length,
    ocupados: horarios.filter(h => h.status === 'ocupado').length,
    disponiveis: horarios.filter(h => h.status === 'disponivel').length,
    bloqueados: horarios.filter(h => h.status === 'indisponivel').length,
  }), [horarios])

  const hojeStr = DIAS_ORDEM[
    // Segunda=0 ... Sábado=5 (ajuste do índice JS: dom=0,seg=1,...sab=6)
    [1, 2, 3, 4, 5, 6].indexOf(new Date().getDay())
  ] ?? ''

  if (!professor_id) return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
      <AlertCircle className="w-12 h-12 text-amber-400" />
      <p className="text-gray-500">Conta não vinculada a um professor.</p>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CalendarClock className="w-7 h-7 text-brand-500" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Minha Grade</h1>
            <p className="text-sm text-gray-500">Sua programação semanal</p>
          </div>
        </div>
        <button
          onClick={() => { setShowNovo(true); setErroNovo('') }}
          className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Horário
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { v: stats.total, l: 'Total', c: 'text-gray-700' },
          { v: stats.ocupados, l: 'Com Aluno', c: 'text-sky-600' },
          { v: stats.disponiveis, l: 'Disponível', c: 'text-emerald-600' },
          { v: stats.bloqueados, l: 'Bloqueado', c: 'text-gray-400' },
        ].map(s => (
          <div key={s.l} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className={`text-2xl font-bold ${s.c}`}>{s.v}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.l}</p>
          </div>
        ))}
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap gap-3 text-xs">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-sky-400 inline-block" />Ocupado (com aluno — só leitura)</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />Disponível — clique para bloquear</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-gray-300 inline-block" />Bloqueado — clique para liberar</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-brand-500" /></div>
      ) : (
        <div className="space-y-3">
          {DIAS_ORDEM.map(dia => {
            const slots = porDia[dia] ?? []
            if (slots.length === 0) return null
            const isHoje = dia === hojeStr

            return (
              <div key={dia} className={`bg-white rounded-xl border-2 overflow-hidden ${isHoje ? 'border-brand-300' : 'border-gray-200'}`}>
                <div className={`px-4 py-2.5 flex items-center justify-between ${isHoje ? 'bg-brand-50' : 'bg-gray-50'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-sm ${isHoje ? 'text-brand-700' : 'text-gray-700'}`}>{dia}</span>
                    {isHoje && <span className="text-xs bg-brand-500 text-white px-1.5 py-0.5 rounded-full">Hoje</span>}
                  </div>
                  <span className="text-xs text-gray-400">{slots.length} slot{slots.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="divide-y divide-gray-100">
                  {slots.map(h => {
                    const isSaving = saving === h.id
                    const podeEditar = h.status !== 'ocupado'

                    return (
                      <div key={h.id} className={`flex items-center gap-3 px-4 py-2.5 ${podeEditar ? 'hover:bg-gray-50' : ''}`}>
                        {/* Status badge */}
                        <button
                          onClick={() => !isSaving && toggleStatus(h)}
                          disabled={!podeEditar || isSaving}
                          title={podeEditar ? 'Clique para alternar disponível/bloqueado' : 'Ocupado com aluno — não editável'}
                          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${STATUS_COLORS[h.status]} ${podeEditar ? 'cursor-pointer hover:scale-110' : 'cursor-default opacity-70'}`}
                        >
                          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : h.status === 'ocupado' ? <BookOpen className="w-3.5 h-3.5" />
                            : h.status === 'disponivel' ? <CheckCircle2 className="w-3.5 h-3.5" />
                            : <Ban className="w-3.5 h-3.5" />}
                        </button>

                        {/* Horário */}
                        <span className="text-sm font-mono text-gray-500 w-20 shrink-0">
                          {fmtHora(h.hora_inicio)}{h.hora_fim ? `–${fmtHora(h.hora_fim)}` : ''}
                        </span>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          {h.status === 'ocupado' ? (
                            <div>
                              <p className="text-sm font-medium text-gray-900 truncate">{h.aluno_nome ?? '—'}</p>
                              <div className="flex items-center gap-2 text-xs text-gray-400">
                                {h.instrumento && <span className="flex items-center gap-1"><BookOpen className="w-3 h-3" />{h.instrumento}</span>}
                                {h.tipo === 'grupo' && <span className="flex items-center gap-1"><Users className="w-3 h-3" />Grupo</span>}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className={`text-xs font-medium ${h.status === 'disponivel' ? 'text-emerald-600' : 'text-gray-400'}`}>
                                {STATUS_LABEL[h.status]}
                              </span>
                              {h.instrumento && <span className="text-xs text-gray-400 ml-2">· {h.instrumento}</span>}
                            </div>
                          )}
                        </div>

                        {/* Excluir (só slots sem aluno) */}
                        {podeEditar && (
                          confirmDelete === h.id ? (
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs text-red-600">Confirmar?</span>
                              <button onClick={() => deletarSlot(h.id)} className="text-xs px-2 py-1 bg-red-500 text-white rounded-lg hover:bg-red-600">Sim</button>
                              <button onClick={() => setConfirmDelete(null)} className="text-xs px-2 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200">Não</button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDelete(h.id)}
                              className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
                              title="Remover slot"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {horarios.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Clock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Nenhum horário cadastrado</p>
              <p className="text-sm text-gray-400 mt-1">Adicione seus horários disponíveis.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal novo slot */}
      {showNovo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Adicionar Horário</h3>
              <button onClick={() => setShowNovo(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Dia da semana</label>
                <select value={novoDia} onChange={e => setNovoDia(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  {DIAS_ORDEM.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Início</label>
                <select value={novaHora} onChange={e => setNovaHora(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fim</label>
                <select value={novaHoraFim} onChange={e => setNovaHoraFim(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  {HORAS.filter(h => h > novaHora).map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Instrumento (opcional)</label>
                <select value={novoInstrumento} onChange={e => setNovoInstrumento(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
                  <option value="">— Qualquer —</option>
                  {INSTRUMENTOS.map(i => <option key={i} value={i}>{i}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                <div className="flex gap-2">
                  {(['disponivel', 'indisponivel'] as const).map(s => (
                    <button key={s} onClick={() => setNovoStatus(s)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors ${novoStatus === s ? (s === 'disponivel' ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-gray-100 border-gray-400 text-gray-600') : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                      {s === 'disponivel' ? '✓ Disponível' : '✗ Bloqueado'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {erroNovo && <p className="text-sm text-red-500">{erroNovo}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowNovo(false)}
                className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button onClick={adicionarSlot} disabled={salvandoNovo}
                className="flex-1 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2">
                {salvandoNovo && <Loader2 className="w-4 h-4 animate-spin" />}
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
