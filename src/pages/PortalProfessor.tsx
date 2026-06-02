import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  DollarSign,
  CalendarCheck,
  Loader2,
  AlertCircle,
  ClipboardCheck,
  MinusCircle,
} from 'lucide-react'

// ─── types ─────────────────────────────────────────────────────────────────

interface AulaItem {
  id: string            // unique key: horario_id + '_' + aluno_nome
  horario_id: string
  aluno_nome: string
  instrumento: string
  hora_inicio: string
  hora_fim: string
  presente: boolean | null
  tipo_falta: string
  observacoes: string
  presenca_id?: string
}

interface RegistroMes {
  data: string
  aluno_nome: string
  instrumento: string
  presente: boolean
  tipo_falta: string | null
  observacoes: string | null
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

const TIPOS_FALTA = [
  { value: 'falta_injustificada', label: 'Faltou sem avisar' },
  { value: 'falta_justificada', label: 'Faltou com aviso' },
  { value: 'cancelou_avisou', label: 'Aula cancelada (avisou)' },
  { value: 'cancelou_professor', label: 'Cancelado pelo professor' },
]

// ─── helpers ───────────────────────────────────────────────────────────────

function fmtData(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function splitNomesGrupo(nome: string): string[] {
  const rawNomes = nome.split(/[,\n]/).map((n) => n.trim()).filter(Boolean)
  return rawNomes.flatMap((n) => {
    if (n.includes(' e ')) {
      const parts = n.split(/\s+e\s+/).map((p) => p.trim()).filter(Boolean)
      if (parts.length >= 2 && parts.every((p) => p.split(/\s+/).length >= 2)) return parts
    }
    return [n]
  })
}

// ─── component ─────────────────────────────────────────────────────────────

export default function PortalProfessor() {
  const { perfil } = useAuth()
  const professor_id = perfil?.professor_id ?? null

  const [tab, setTab] = useState<'chamada' | 'mes'>('chamada')

  // chamada
  const [dataAtual, setDataAtual] = useState(new Date().toISOString().slice(0, 10))
  const [aulas, setAulas] = useState<AulaItem[]>([])
  const [loadingChamada, setLoadingChamada] = useState(false)

  // modal
  const [modal, setModal] = useState<{ item: AulaItem; presente: boolean; tipoFalta: string } | null>(null)
  const [obsTexto, setObsTexto] = useState('')
  const [salvando, setSalvando] = useState(false)

  // meu mês
  const [mesSel, setMesSel] = useState(new Date().getMonth() + 1)
  const [anoSel, setAnoSel] = useState(new Date().getFullYear())
  const [registrosMes, setRegistrosMes] = useState<RegistroMes[]>([])
  const [valorHoraAula, setValorHoraAula] = useState(0)
  const [nomeProfessor, setNomeProfessor] = useState('')
  const [loadingMes, setLoadingMes] = useState(false)

  // ── carrega dados do professor ──────────────────────────────────────────
  useEffect(() => {
    if (!professor_id) return
    supabase
      .from('professores')
      .select('nome, valor_hora_aula')
      .eq('id', professor_id)
      .single()
      .then(({ data }) => {
        if (data) {
          setNomeProfessor(data.nome || '')
          setValorHoraAula(Number(data.valor_hora_aula) || 0)
        }
      })
  }, [professor_id])

  // ── chamada ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'chamada' && professor_id) loadChamada()
  }, [dataAtual, tab, professor_id])

  async function loadChamada() {
    if (!professor_id) return
    setLoadingChamada(true)

    const date = new Date(dataAtual + 'T12:00:00')
    const diaSemana = DIAS_SEMANA[date.getDay()]

    const { data: horarios } = await supabase
      .from('horarios')
      .select('id, dia_semana, hora_inicio, hora_fim, status, aluno_nome, tipo, instrumento')
      .eq('professor_id', professor_id)
      .eq('dia_semana', diaSemana)
      .eq('status', 'ocupado')
      .order('hora_inicio')

    const { data: presencasExistentes } = await supabase
      .from('presencas')
      .select('*')
      .eq('professor_id', professor_id)
      .eq('data', dataAtual)

    const lista: AulaItem[] = []

    for (const h of (horarios || [])) {
      if (!h.aluno_nome) continue

      const isGrupo =
        h.tipo === 'grupo' ||
        (!h.tipo && (
          h.aluno_nome.includes(',') ||
          h.aluno_nome.includes('\n') ||
          /\w{2,}\s+e\s+\w{2,}/.test(h.aluno_nome)
        ))

      if (isGrupo) {
        for (const nome of splitNomesGrupo(h.aluno_nome)) {
          const px = (presencasExistentes || []).find(
            (p: any) => p.horario_id === h.id && p.aluno_nome === nome
          )
          lista.push({
            id: h.id + '_' + nome,
            horario_id: h.id,
            aluno_nome: nome,
            instrumento: h.instrumento || '',
            hora_inicio: h.hora_inicio || '',
            hora_fim: h.hora_fim || '',
            presente: px ? px.presente : null,
            tipo_falta: px?.tipo_falta || '',
            observacoes: px?.observacoes || '',
            presenca_id: px?.id,
          })
        }
      } else {
        const px = (presencasExistentes || []).find(
          (p: any) => p.horario_id === h.id
        )
        lista.push({
          id: h.id,
          horario_id: h.id,
          aluno_nome: h.aluno_nome || '',
          instrumento: h.instrumento || '',
          hora_inicio: h.hora_inicio || '',
          hora_fim: h.hora_fim || '',
          presente: px ? px.presente : null,
          tipo_falta: px?.tipo_falta || '',
          observacoes: px?.observacoes || '',
          presenca_id: px?.id,
        })
      }
    }

    setAulas(lista)
    setLoadingChamada(false)
  }

  function abrirModal(item: AulaItem, presente: boolean) {
    setObsTexto(item.observacoes || '')
    setModal({ item, presente, tipoFalta: item.tipo_falta || (presente ? '' : 'falta_injustificada') })
  }

  async function salvarPresenca() {
    if (!modal || !professor_id) return
    const obs = obsTexto.trim()
    if (!obs) {
      alert('A observação pedagógica é obrigatória. Descreva o que foi trabalhado, dificuldades ou motivo da falta.')
      return
    }
    setSalvando(true)

    const { item, presente, tipoFalta } = modal

    // tenta buscar aluno_id pelo nome
    const { data: alunoData } = await supabase
      .from('alunos')
      .select('id')
      .ilike('nome', item.aluno_nome)
      .limit(1)
      .single()

    const alunoId = alunoData?.id || null

    if (item.presenca_id) {
      await supabase.from('presencas').update({
        presente,
        tipo_falta: presente ? null : (tipoFalta || 'falta_injustificada'),
        observacoes: obs,
      }).eq('id', item.presenca_id)
    } else {
      await supabase.from('presencas').insert({
        aluno_id: alunoId,
        professor_id,
        horario_id: item.horario_id,
        data: dataAtual,
        hora_inicio: item.hora_inicio,
        hora_fim: item.hora_fim,
        instrumento: item.instrumento,
        presente,
        tipo_falta: presente ? null : (tipoFalta || 'falta_injustificada'),
        aluno_nome: item.aluno_nome,
        observacoes: obs,
      })
    }

    setSalvando(false)
    setModal(null)
    setObsTexto('')
    loadChamada()
  }

  // ── meu mês ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'mes' && professor_id) loadMes()
  }, [tab, mesSel, anoSel, professor_id])

  async function loadMes() {
    if (!professor_id) return
    setLoadingMes(true)
    const primeiroDia = `${anoSel}-${String(mesSel).padStart(2, '0')}-01`
    const ultimoDia = new Date(anoSel, mesSel, 0).toISOString().slice(0, 10)

    const { data } = await supabase
      .from('presencas')
      .select('data, aluno_nome, instrumento, presente, tipo_falta, observacoes')
      .eq('professor_id', professor_id)
      .gte('data', primeiroDia)
      .lte('data', ultimoDia)
      .order('data', { ascending: false })

    setRegistrosMes((data || []) as RegistroMes[])
    setLoadingMes(false)
  }

  function navegarDia(delta: number) {
    const d = new Date(dataAtual + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    setDataAtual(d.toISOString().slice(0, 10))
  }

  function navegarMes(delta: number) {
    let m = mesSel + delta
    let a = anoSel
    if (m > 12) { m = 1; a++ }
    if (m < 1) { m = 12; a-- }
    setMesSel(m)
    setAnoSel(a)
  }

  // ── stats ──────────────────────────────────────────────────────────────
  const statsChamada = useMemo(() => ({
    total: aulas.length,
    presentes: aulas.filter(a => a.presente === true).length,
    ausentes: aulas.filter(a => a.presente === false).length,
    pendentes: aulas.filter(a => a.presente === null).length,
  }), [aulas])

  const statsMes = useMemo(() => {
    const aulasRealizadas = registrosMes.filter(r => r.presente).length
    const aulasFaltadas = registrosMes.filter(r => !r.presente).length
    const total = registrosMes.length
    const estimativa = aulasRealizadas * valorHoraAula
    return { aulasRealizadas, aulasFaltadas, total, estimativa }
  }, [registrosMes, valorHoraAula])

  const diaSemanaLabel = DIAS_SEMANA[new Date(dataAtual + 'T12:00:00').getDay()]

  // ── sem vínculo ────────────────────────────────────────────────────────
  if (!professor_id) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
        <AlertCircle className="w-12 h-12 text-amber-400" />
        <h2 className="text-xl font-semibold text-gray-700">Conta não vinculada</h2>
        <p className="text-gray-500 max-w-sm">
          Este usuário não está vinculado a um professor. Solicite ao administrador para associar sua conta.
        </p>
      </div>
    )
  }

  // ── render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Olá{nomeProfessor ? `, ${nomeProfessor.split(' ')[0]}` : ''}! 👋
          </h1>
          <p className="text-gray-500">Portal do Professor — CMMF</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab('chamada')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'chamada' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" />
            Chamada
          </button>
          <button
            onClick={() => setTab('mes')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'mes' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            Meu Mês
          </button>
        </div>
      </div>

      {/* ── TAB CHAMADA ─────────────────────────────────────────────────── */}
      {tab === 'chamada' && (
        <div className="space-y-4">
          {/* Navegação de data */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <button
              onClick={() => navegarDia(-1)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900">{diaSemanaLabel}</p>
              <p className="text-sm text-gray-500">{fmtData(dataAtual)}</p>
            </div>
            <button
              onClick={() => navegarDia(1)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              disabled={dataAtual >= new Date().toISOString().slice(0, 10)}
            >
              <ChevronRight className="w-5 h-5 disabled:opacity-30" />
            </button>
          </div>

          {/* Stats */}
          {aulas.length > 0 && (
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{statsChamada.presentes}</p>
                <p className="text-xs text-gray-500 mt-1">Presentes</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-red-500">{statsChamada.ausentes}</p>
                <p className="text-xs text-gray-500 mt-1">Ausentes</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                <p className="text-2xl font-bold text-amber-500">{statsChamada.pendentes}</p>
                <p className="text-xs text-gray-500 mt-1">Pendentes</p>
              </div>
            </div>
          )}

          {/* Lista de aulas */}
          {loadingChamada ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            </div>
          ) : aulas.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <CalendarCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Nenhuma aula neste dia</p>
              <p className="text-sm text-gray-400 mt-1">Navegue para outro dia ou verifique a grade de horários.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {aulas.map(item => (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl border-2 p-4 transition-colors ${
                    item.presente === true
                      ? 'border-green-200 bg-green-50'
                      : item.presente === false
                      ? 'border-red-100 bg-red-50'
                      : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Status icon */}
                      {item.presente === true ? (
                        <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
                      ) : item.presente === false ? (
                        <XCircle className="w-6 h-6 text-red-400 shrink-0" />
                      ) : (
                        <MinusCircle className="w-6 h-6 text-gray-300 shrink-0" />
                      )}

                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{item.aluno_nome}</p>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            {item.hora_inicio} – {item.hora_fim}
                          </span>
                          {item.instrumento && (
                            <span className="flex items-center gap-1">
                              <BookOpen className="w-3.5 h-3.5" />
                              {item.instrumento}
                            </span>
                          )}
                        </div>
                        {item.presente !== null && item.observacoes && (
                          <p className="text-xs text-gray-400 mt-1 italic truncate">{item.observacoes}</p>
                        )}
                        {item.presente === false && item.tipo_falta && (
                          <p className="text-xs text-red-400 mt-0.5">
                            {TIPOS_FALTA.find(t => t.value === item.tipo_falta)?.label || item.tipo_falta}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Botões */}
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => abrirModal(item, true)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          item.presente === true
                            ? 'bg-green-100 text-green-700 border border-green-200'
                            : 'bg-gray-100 hover:bg-green-100 hover:text-green-700 text-gray-600'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Presente
                      </button>
                      <button
                        onClick={() => abrirModal(item, false)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                          item.presente === false
                            ? 'bg-red-100 text-red-600 border border-red-200'
                            : 'bg-gray-100 hover:bg-red-100 hover:text-red-600 text-gray-600'
                        }`}
                      >
                        <XCircle className="w-4 h-4" />
                        Faltou
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB MEU MÊS ─────────────────────────────────────────────────── */}
      {tab === 'mes' && (
        <div className="space-y-4">
          {/* Navegação de mês */}
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
            <button
              onClick={() => navegarMes(-1)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <p className="text-lg font-semibold text-gray-900">
                {MESES[mesSel - 1]} {anoSel}
              </p>
            </div>
            <button
              onClick={() => navegarMes(1)}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              disabled={mesSel === new Date().getMonth() + 1 && anoSel === new Date().getFullYear()}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Cards resumo */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-brand-600">{statsMes.total}</p>
              <p className="text-xs text-gray-500 mt-1">Registros</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{statsMes.aulasRealizadas}</p>
              <p className="text-xs text-gray-500 mt-1">Aulas Realizadas</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-red-500">{statsMes.aulasFaltadas}</p>
              <p className="text-xs text-gray-500 mt-1">Alunos Faltaram</p>
            </div>
            <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{fmtMoeda(statsMes.estimativa)}</p>
              <p className="text-xs text-green-600 mt-1">Estimativa ({fmtMoeda(valorHoraAula)}/aula)</p>
            </div>
          </div>

          {/* Tabela */}
          {loadingMes ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            </div>
          ) : registrosMes.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <ClipboardCheck className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">Nenhum registro neste mês</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Data</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Aluno</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Instrumento</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">Observação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {registrosMes.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtData(r.data)}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{r.aluno_nome}</td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{r.instrumento || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {r.presente ? (
                          <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                            <CheckCircle2 className="w-4 h-4" />
                            Presente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-red-500 font-medium">
                            <XCircle className="w-4 h-4" />
                            Faltou
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell max-w-xs truncate">
                        {r.observacoes || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL REGISTRO ──────────────────────────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className={`p-5 rounded-t-2xl ${modal.presente ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex items-center gap-3">
                {modal.presente ? (
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                ) : (
                  <XCircle className="w-6 h-6 text-red-500" />
                )}
                <div>
                  <p className="font-semibold text-gray-900">{modal.item.aluno_nome}</p>
                  <p className="text-sm text-gray-500">
                    {modal.item.hora_inicio} – {modal.item.hora_fim}
                    {modal.item.instrumento ? ` · ${modal.item.instrumento}` : ''}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-5 space-y-4">
              {/* Tipo de falta (só quando ausente) */}
              {!modal.presente && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de falta</label>
                  <select
                    value={modal.tipoFalta}
                    onChange={e => setModal(m => m ? { ...m, tipoFalta: e.target.value } : null)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {TIPOS_FALTA.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Observação pedagógica */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observação pedagógica <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={obsTexto}
                  onChange={e => setObsTexto(e.target.value)}
                  rows={3}
                  placeholder={
                    modal.presente
                      ? 'O que foi trabalhado na aula? Progresso do aluno...'
                      : 'Motivo da falta, observações...'
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">Obrigatório conforme Documento de Orientações §9</p>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setModal(null); setObsTexto('') }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={salvarPresenca}
                  disabled={salvando}
                  className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-colors flex items-center justify-center gap-2 ${
                    modal.presente
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-500 hover:bg-red-600'
                  } disabled:opacity-60`}
                >
                  {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {modal.presente ? 'Confirmar Presença' : 'Registrar Falta'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
