import { useEffect, useState, useCallback } from 'react'
import { Loader2, CalendarOff, CalendarClock, Grid3x3, X, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const PERIODOS: Record<string, string> = { dia: 'Dia todo', manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }

interface Ausencia { id: string; data_ausencia: string; periodo: string; motivo: string | null; created_at: string }
interface Agend { id: string; data_aula: string; hora_inicio: string; instrumento: string | null; aluno: { nome: string } | null }
interface Slot { horario_id: string; data_slot: string; hora_inicio: string; hora_fim: string; vagas: number }
interface Horario { id: string; dia_semana: string; hora_inicio: string; hora_fim: string | null; status: string; aluno_nome: string | null }

const fmtData = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
const fmtHora = (t: string) => t?.slice(0, 5) ?? ''
const hoje = () => new Date().toLocaleDateString('en-CA')

export default function AutogestaoProfessor({ professorId }: { professorId: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)
  const avisar = (ok: boolean, texto: string) => { setMsg({ ok, texto }); setTimeout(() => setMsg(null), 5000) }

  // ── Ausência ──
  const [ausencias, setAusencias] = useState<Ausencia[]>([])
  const [formAus, setFormAus] = useState({ data: '', periodo: 'dia', motivo: '' })
  const [salvandoAus, setSalvandoAus] = useState(false)

  const loadAusencias = useCallback(async () => {
    const { data } = await supabase.from('ausencias_professor')
      .select('id,data_ausencia,periodo,motivo,created_at')
      .eq('professor_id', professorId).gte('data_ausencia', hoje())
      .order('data_ausencia')
    setAusencias((data ?? []) as Ausencia[])
  }, [professorId])

  async function registrarAusencia() {
    if (!formAus.data) return
    if (!confirm(`Confirmar ausência em ${fmtData(formAus.data)} (${PERIODOS[formAus.periodo]})? A recepção será avisada e as aulas desse período serão canceladas.`)) return
    setSalvandoAus(true)
    const { data, error } = await supabase.rpc('professor_registrar_ausencia', {
      p_data: formAus.data, p_periodo: formAus.periodo, p_motivo: formAus.motivo.trim() || null,
    })
    setSalvandoAus(false)
    if (error) { avisar(false, error.message); return }
    const r = data as { ok: boolean; mensagem: string }
    avisar(!!r?.ok, r?.mensagem ?? 'Não foi possível registrar.')
    if (r?.ok) { setFormAus({ data: '', periodo: 'dia', motivo: '' }); loadAusencias() }
  }

  // ── Remarcar aulas ──
  const [aulas, setAulas] = useState<Agend[]>([])
  const [remarcando, setRemarcando] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [carregandoSlots, setCarregandoSlots] = useState(false)

  const loadAulas = useCallback(async () => {
    const { data } = await supabase.from('agendamentos')
      .select('id,data_aula,hora_inicio,instrumento,aluno:alunos(nome)')
      .eq('professor_id', professorId).gte('data_aula', hoje()).neq('status', 'cancelado')
      .order('data_aula').order('hora_inicio').limit(200)
    setAulas((data ?? []) as unknown as Agend[])
  }, [professorId])

  async function abrirRemarcar(a: Agend) {
    setRemarcando(a.id); setSlots([]); setCarregandoSlots(true)
    const { data, error } = await supabase.rpc('horarios_remarcacao', { p_agendamento_id: a.id })
    setCarregandoSlots(false)
    if (error) { avisar(false, error.message); setRemarcando(null); return }
    setSlots((data ?? []) as Slot[])
  }

  async function remarcar(a: Agend, s: Slot) {
    const { data, error } = await supabase.rpc('remarcar_aula', {
      p_agendamento_id: a.id, p_horario_id_novo: s.horario_id, p_data_nova: s.data_slot,
      p_solicitado_por: 'professor', p_motivo: null,
    })
    if (error) { avisar(false, error.message); return }
    const r = data as { ok: boolean; mensagem: string }
    avisar(!!r?.ok, r?.mensagem ?? 'Não foi possível remarcar.')
    if (r?.ok) { setRemarcando(null); loadAulas() }
  }

  // ── Grade ──
  const [grade, setGrade] = useState<Horario[]>([])
  const [salvandoSlot, setSalvandoSlot] = useState<string | null>(null)

  const loadGrade = useCallback(async () => {
    const { data } = await supabase.from('horarios')
      .select('id,dia_semana,hora_inicio,hora_fim,status,aluno_nome')
      .eq('professor_id', professorId).order('hora_inicio')
    setGrade((data ?? []) as Horario[])
  }, [professorId])

  async function alternarSlot(h: Horario) {
    if (h.status === 'ocupado') return
    const novo = h.status === 'disponivel' ? 'indisponivel' : 'disponivel'
    setSalvandoSlot(h.id)
    const { error } = await supabase.from('horarios').update({ status: novo }).eq('id', h.id)
    setSalvandoSlot(null)
    if (error) { avisar(false, error.message); return }
    setGrade(g => g.map(x => x.id === h.id ? { ...x, status: novo } : x))
  }

  useEffect(() => { loadAusencias(); loadAulas(); loadGrade() }, [loadAusencias, loadAulas, loadGrade])

  const aulaAberta = aulas.find(a => a.id === remarcando)

  return (
    <div className="space-y-6">
      {msg && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${msg.ok ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {msg.texto}
        </div>
      )}

      {/* Avisar ausência */}
      <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><CalendarOff className="w-4 h-4 text-orange-500" /> Avisar ausência</h3>
        <p className="text-xs text-gray-500">O registro fica com data/hora e o seu nome. A recepção é notificada e as aulas do período são canceladas para reposição.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <input type="date" min={hoje()} value={formAus.data} onChange={e => setFormAus(f => ({ ...f, data: e.target.value }))} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
          <select value={formAus.periodo} onChange={e => setFormAus(f => ({ ...f, periodo: e.target.value }))} className="border border-gray-200 rounded-lg px-3 py-2 text-sm">
            {Object.entries(PERIODOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input type="text" placeholder="Motivo" value={formAus.motivo} onChange={e => setFormAus(f => ({ ...f, motivo: e.target.value }))} className="border border-gray-200 rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={registrarAusencia} disabled={!formAus.data || salvandoAus} className="px-4 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50">
          {salvandoAus ? 'Registrando...' : 'Registrar ausência'}
        </button>
        {ausencias.length > 0 && (
          <ul className="divide-y divide-gray-100 text-sm">
            {ausencias.map(a => (
              <li key={a.id} className="py-2 flex justify-between gap-3 flex-wrap">
                <span><strong>{fmtData(a.data_ausencia)}</strong> — {PERIODOS[a.periodo] ?? a.periodo}{a.motivo ? ` (${a.motivo})` : ''}</span>
                <span className="text-xs text-gray-400">registrada em {new Date(a.created_at).toLocaleString('pt-BR')}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Remarcar aulas */}
      <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-blue-500" /> Remarcar aula de aluno</h3>
        <p className="text-xs text-gray-500">Escolha um novo horário livre da sua grade. O aluno e a recepção são avisados.</p>
        {aulas.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma aula agendada à frente.</p>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {aulas.map(a => (
              <li key={a.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <strong>{fmtData(a.data_aula)}</strong> {fmtHora(a.hora_inicio)} — {a.aluno?.nome ?? 'Aluno'}{a.instrumento ? ` • ${a.instrumento}` : ''}
                </span>
                <button onClick={() => abrirRemarcar(a)} className="text-xs px-3 py-1.5 rounded bg-blue-100 text-blue-800 hover:bg-blue-200 shrink-0">Remarcar</button>
              </li>
            ))}
          </ul>
        )}
        {aulaAberta && (
          <div className="border border-blue-200 bg-blue-50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between items-center">
              <p className="text-sm font-medium text-blue-900">Novo horário para {aulaAberta.aluno?.nome}</p>
              <button onClick={() => setRemarcando(null)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            {carregandoSlots ? <Loader2 className="w-5 h-5 animate-spin text-blue-500" /> : slots.length === 0 ? (
              <p className="text-sm text-gray-500">Sem horários livres nas próximas 4 semanas. Libere horários na grade abaixo.</p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto">
                {slots.map(s => (
                  <button key={`${s.horario_id}_${s.data_slot}`} onClick={() => remarcar(aulaAberta, s)} className="text-xs px-2.5 py-1.5 rounded border border-blue-200 bg-white hover:bg-blue-100">
                    {fmtData(s.data_slot).slice(0, 5)} {fmtHora(s.hora_inicio)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Grade */}
      <section className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Grid3x3 className="w-4 h-4 text-green-600" /> Minha disponibilidade</h3>
        <p className="text-xs text-gray-500">Toque num horário para alternar entre disponível (verde) e indisponível (cinza). Horários com aluno fixo não podem ser alterados aqui.</p>
        <div className="space-y-3">
          {DIAS.map(dia => {
            const hs = grade.filter(h => h.dia_semana === dia)
            if (!hs.length) return null
            return (
              <div key={dia}>
                <p className="text-xs font-semibold text-gray-500 mb-1">{dia}</p>
                <div className="flex flex-wrap gap-1.5">
                  {hs.map(h => (
                    <button
                      key={h.id}
                      onClick={() => alternarSlot(h)}
                      disabled={h.status === 'ocupado' || salvandoSlot === h.id}
                      title={h.status === 'ocupado' ? (h.aluno_nome ?? 'Ocupado') : ''}
                      className={`text-xs px-2.5 py-1.5 rounded border inline-flex items-center gap-1 ${
                        h.status === 'disponivel' ? 'bg-green-50 border-green-300 text-green-800'
                        : h.status === 'ocupado' ? 'bg-blue-50 border-blue-200 text-blue-700 cursor-default'
                        : 'bg-gray-50 border-gray-200 text-gray-400'}`}
                    >
                      {h.status === 'disponivel' && <CheckCircle2 className="w-3 h-3" />}
                      {fmtHora(h.hora_inicio)}{h.status === 'ocupado' && h.aluno_nome ? ` ${h.aluno_nome.split(' ')[0]}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
