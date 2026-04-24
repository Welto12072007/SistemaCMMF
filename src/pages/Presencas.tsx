import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import {
  CheckCircle2,
  XCircle,
  Calendar,
  Users,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Clock,
} from 'lucide-react'

interface Professor {
  id: string
  nome: string
  instrumentos?: string[]
}

interface AlunoPresenca {
  id: string
  aluno_id: string
  aluno_nome: string
  professor_id: string
  professor_nome: string
  instrumento: string
  hora_inicio: string
  hora_fim: string
  presente: boolean | null // null = não registrado ainda
  tipo_falta?: string
  observacoes?: string
  presenca_id?: string // existing presenca record id
}

interface AlertaFalta {
  aluno_nome: string
  aluno_id: string
  professor_nome: string
  faltas_consecutivas: number
  faltas_mes: number
  telefone?: string
}

interface AlertaFila {
  id: string
  aluno_nome: string
  professor_nome: string
  faltas_consecutivas: number
  faltas_mes: number
  status: 'pendente' | 'aprovado' | 'cancelado' | 'enviado'
  created_at: string
}

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

export default function Presencas({ embedded = false }: { embedded?: boolean } = {}) {
  const [dataAtual, setDataAtual] = useState(new Date().toISOString().slice(0, 10))
  const [professores, setProfessores] = useState<Professor[]>([])
  const [filtroProfessor, setFiltroProfessor] = useState('todos')
  const [presencas, setPresencas] = useState<AlunoPresenca[]>([])
  const [alertas, setAlertas] = useState<AlertaFalta[]>([])
  const [filaAlertas, setFilaAlertas] = useState<AlertaFila[]>([])
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [tab, setTab] = useState<'chamada' | 'historico'>('chamada')
  const [histData, setHistData] = useState<{ aluno_nome: string; data: string; presente: boolean; tipo_falta: string; professor_nome: string; instrumento: string }[]>([])
  const [histFiltro, setHistFiltro] = useState({ mes: new Date().getMonth() + 1, ano: new Date().getFullYear() })

  useEffect(() => {
    loadProfessores()
  }, [])

  useEffect(() => {
    if (tab === 'chamada') loadPresencasDia()
    if (tab === 'historico') loadHistorico()
  }, [dataAtual, filtroProfessor, tab, histFiltro])

  useEffect(() => {
    loadAlertas()
    loadFilaAlertas()
  }, [])

  async function loadProfessores() {
    const { data } = await supabase.from('professores').select('id, nome, instrumentos').eq('ativo', true).order('nome')
    if (data) setProfessores(data)
  }

  async function loadPresencasDia() {
    setLoading(true)
    const date = new Date(dataAtual + 'T12:00:00')
    const diaSemana = DIAS_SEMANA[date.getDay()]

    // Buscar horarios ocupados para este dia da semana
    let query = supabase
      .from('horarios')
      .select('id, professor_id, dia_semana, hora_inicio, hora_fim, status, aluno_nome, instrumento, professor:professores(nome)')
      .eq('dia_semana', diaSemana)
      .eq('status', 'ocupado')

    if (filtroProfessor !== 'todos') {
      query = query.eq('professor_id', filtroProfessor)
    }

    const { data: horariosOcupados } = await query.order('hora_inicio')

    // Buscar presenças já registradas para esta data
    const { data: presencasExistentes } = await supabase
      .from('presencas')
      .select('*')
      .eq('data', dataAtual)

    const lista: AlunoPresenca[] = (horariosOcupados || [])
      .filter((h: any) => h.aluno_nome)
      .map((h: any) => {
        const presExistente = (presencasExistentes || []).find(
          (p: any) => p.horario_id === h.id && p.data === dataAtual
        )
        return {
          id: h.id,
          aluno_id: '',
          aluno_nome: h.aluno_nome || '',
          professor_id: h.professor_id,
          professor_nome: (h.professor as any)?.nome || '',
          instrumento: h.instrumento || '',
          hora_inicio: h.hora_inicio || '',
          hora_fim: h.hora_fim || '',
          presente: presExistente ? presExistente.presente : null,
          tipo_falta: presExistente?.tipo_falta || '',
          observacoes: presExistente?.observacoes || '',
          presenca_id: presExistente?.id,
        }
      })

    setPresencas(lista)
    setLoading(false)
  }

  async function loadHistorico() {
    const primeiroDia = `${histFiltro.ano}-${String(histFiltro.mes).padStart(2, '0')}-01`
    const ultimoDia = new Date(histFiltro.ano, histFiltro.mes, 0).toISOString().slice(0, 10)

    let query = supabase
      .from('presencas')
      .select('*, professor:professores(nome)')
      .gte('data', primeiroDia)
      .lte('data', ultimoDia)
      .order('data', { ascending: false })

    if (filtroProfessor !== 'todos') {
      query = query.eq('professor_id', filtroProfessor)
    }

    const { data } = await query

    setHistData((data || []).map((p: any) => ({
      aluno_nome: p.aluno_nome || '—',
      data: p.data,
      presente: p.presente,
      tipo_falta: p.tipo_falta || '',
      professor_nome: (p.professor as any)?.nome || '—',
      instrumento: p.instrumento || '',
    })))
  }

  async function loadAlertas() {
    // buscar presenças do último mês para calcular alertas
    const umMesAtras = new Date()
    umMesAtras.setMonth(umMesAtras.getMonth() - 1)

    const { data: presRecentes } = await supabase
      .from('presencas')
      .select('*, professor:professores(nome)')
      .gte('data', umMesAtras.toISOString().slice(0, 10))
      .eq('presente', false)
      .order('data', { ascending: false })

    if (!presRecentes) return

    // Agrupar por aluno
    const porAluno: Record<string, { faltas: any[]; professor_nome: string }> = {}
    presRecentes.forEach((p: any) => {
      const key = p.aluno_nome || p.aluno_id
      if (!porAluno[key]) porAluno[key] = { faltas: [], professor_nome: (p.professor as any)?.nome || '' }
      porAluno[key].faltas.push(p)
    })

    const alertasList: AlertaFalta[] = []
    Object.entries(porAluno).forEach(([nome, info]) => {
      // Calcular faltas consecutivas (últimas presenças)
      const faltasOrdenadas = info.faltas.sort((a: any, b: any) => b.data.localeCompare(a.data))
      let consecutivas = 0
      for (const f of faltasOrdenadas) {
        if (!f.presente) consecutivas++
        else break
      }

      // Faltas no mês atual
      const mesAtual = new Date().getMonth()
      const anoAtual = new Date().getFullYear()
      const faltasMes = info.faltas.filter((f: any) => {
        const d = new Date(f.data + 'T12:00:00')
        return d.getMonth() === mesAtual && d.getFullYear() === anoAtual
      }).length

      if (consecutivas >= 2 || faltasMes >= 2) {
        alertasList.push({
          aluno_nome: nome,
          aluno_id: info.faltas[0]?.aluno_id || '',
          professor_nome: info.professor_nome,
          faltas_consecutivas: consecutivas,
          faltas_mes: faltasMes,
          telefone: info.faltas[0]?.telefone || '',
        })
      }
    })

    setAlertas(alertasList)
  }

  async function loadFilaAlertas() {
    const { data } = await supabase
      .from('alertas_faltas_fila')
      .select('id, aluno_nome, professor_nome, faltas_consecutivas, faltas_mes, status, created_at')
      .in('status', ['pendente', 'aprovado'])
      .order('created_at', { ascending: false })
      .limit(30)

    setFilaAlertas((data as AlertaFila[]) || [])
  }

  function montarMensagemAlerta(alunoNome: string, faltasConsecutivas: number, faltasMes: number) {
    return `Olá, ${alunoNome}! Notamos ${faltasConsecutivas} falta(s) consecutiva(s) e ${faltasMes} no mês. Queremos te ajudar a manter a rotina das aulas. Podemos te apoiar em reagendamento e organização dos horários.`
  }

  async function enfileirarAlertas() {
    if (alertas.length === 0) return

    const alunoIds = alertas.map((a) => a.aluno_id).filter(Boolean)
    const { data: existentes } = await supabase
      .from('alertas_faltas_fila')
      .select('aluno_id')
      .eq('status', 'pendente')
      .in('aluno_id', alunoIds)

    const alunoComPendente = new Set((existentes || []).map((e: any) => e.aluno_id))
    const paraInserir = alertas
      .filter((a) => a.aluno_id && !alunoComPendente.has(a.aluno_id))
      .map((a) => ({
        aluno_id: a.aluno_id,
        aluno_nome: a.aluno_nome,
        professor_nome: a.professor_nome,
        faltas_consecutivas: a.faltas_consecutivas,
        faltas_mes: a.faltas_mes,
        telefone: a.telefone || null,
        mensagem_sugerida: montarMensagemAlerta(a.aluno_nome, a.faltas_consecutivas, a.faltas_mes),
        status: 'pendente',
      }))

    if (paraInserir.length > 0) {
      await supabase.from('alertas_faltas_fila').insert(paraInserir)
    }

    await loadFilaAlertas()
  }

  async function atualizarStatusFila(id: string, status: 'aprovado' | 'cancelado' | 'enviado') {
    await supabase
      .from('alertas_faltas_fila')
      .update({
        status,
        aprovado_em: status === 'aprovado' ? new Date().toISOString() : null,
        enviado_em: status === 'enviado' ? new Date().toISOString() : null,
      })
      .eq('id', id)

    await loadFilaAlertas()
  }

  async function registrarPresenca(item: AlunoPresenca, presente: boolean, tipoFalta?: string) {
    // Buscar aluno_id pelo nome
    const { data: alunoData } = await supabase
      .from('alunos')
      .select('id')
      .ilike('nome', item.aluno_nome)
      .limit(1)
      .single()

    const alunoId = alunoData?.id || null

    if (item.presenca_id) {
      // Update existing
      await supabase.from('presencas').update({
        presente,
        tipo_falta: presente ? null : (tipoFalta || 'falta_injustificada'),
      }).eq('id', item.presenca_id)
    } else {
      // Insert new
      await supabase.from('presencas').insert({
        aluno_id: alunoId,
        professor_id: item.professor_id,
        horario_id: item.id,
        data: dataAtual,
        hora_inicio: item.hora_inicio,
        hora_fim: item.hora_fim,
        instrumento: item.instrumento,
        presente,
        tipo_falta: presente ? null : (tipoFalta || 'falta_injustificada'),
        aluno_nome: item.aluno_nome,
      })
    }

    loadPresencasDia()
    loadAlertas()
  }

  async function marcarTodosPresentes() {
    const naoRegistrados = presencas.filter(p => p.presente === null)
    for (const item of naoRegistrados) {
      const { data: alunoData } = await supabase
        .from('alunos')
        .select('id')
        .ilike('nome', item.aluno_nome)
        .limit(1)
        .single()

      await supabase.from('presencas').insert({
        aluno_id: alunoData?.id || null,
        professor_id: item.professor_id,
        horario_id: item.id,
        data: dataAtual,
        hora_inicio: item.hora_inicio,
        hora_fim: item.hora_fim,
        instrumento: item.instrumento,
        presente: true,
        aluno_nome: item.aluno_nome,
      })
    }
    loadPresencasDia()
  }

  function navegarDia(delta: number) {
    const d = new Date(dataAtual + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    setDataAtual(d.toISOString().slice(0, 10))
  }

  const filtrados = useMemo(() => {
    if (!busca) return presencas
    return presencas.filter(p =>
      p.aluno_nome.toLowerCase().includes(busca.toLowerCase()) ||
      p.professor_nome.toLowerCase().includes(busca.toLowerCase())
    )
  }, [presencas, busca])

  const stats = useMemo(() => {
    const total = presencas.length
    const presentes = presencas.filter(p => p.presente === true).length
    const ausentes = presencas.filter(p => p.presente === false).length
    const pendentes = presencas.filter(p => p.presente === null).length
    return { total, presentes, ausentes, pendentes }
  }, [presencas])

  const diaSemanaLabel = DIAS_SEMANA[new Date(dataAtual + 'T12:00:00').getDay()]

  const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

  return (
    <div className="space-y-6">
      {/* Header */}
      {!embedded && (
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Controle de Presenças</h1>
          <p className="text-gray-500">Registro de presença e acompanhamento de faltas</p>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setTab('chamada')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'chamada' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            Chamada
          </button>
          <button
            onClick={() => setTab('historico')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'historico' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-600 hover:text-gray-800'}`}
          >
            Histórico
          </button>
        </div>
      </div>
      )}

      {/* Alertas de Faltas */}
      {alertas.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="font-semibold text-amber-800">Alertas de Faltas ({alertas.length})</h3>
            </div>
            <button
              onClick={enfileirarAlertas}
              className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
            >
              Adicionar à fila
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {alertas.map((a, i) => (
              <div key={i} className="bg-white rounded-lg p-3 border border-amber-100">
                <p className="font-medium text-sm text-gray-900">{a.aluno_nome}</p>
                <p className="text-xs text-gray-500">Prof. {a.professor_nome}</p>
                <div className="flex gap-3 mt-1">
                  {a.faltas_consecutivas >= 2 && (
                    <span className="text-xs text-red-600 font-medium">{a.faltas_consecutivas} consecutivas</span>
                  )}
                  {a.faltas_mes >= 2 && (
                    <span className="text-xs text-orange-600 font-medium">{a.faltas_mes} no mês</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {filaAlertas.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Fila de Alertas (aprovação manual)</h3>
            <button
              onClick={loadFilaAlertas}
              className="text-xs px-2.5 py-1 rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
            >
              Atualizar
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {filaAlertas.map((f) => (
              <div key={f.id} className="px-4 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{f.aluno_nome}</p>
                  <p className="text-xs text-gray-500">Prof. {f.professor_nome || '—'} | {f.faltas_consecutivas} consecutivas | {f.faltas_mes} no mês</p>
                  <p className="text-xs text-gray-400">Status: {f.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  {f.status === 'pendente' && (
                    <>
                      <button onClick={() => atualizarStatusFila(f.id, 'aprovado')} className="text-xs px-2.5 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200">Aprovar</button>
                      <button onClick={() => atualizarStatusFila(f.id, 'cancelado')} className="text-xs px-2.5 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200">Cancelar</button>
                    </>
                  )}
                  {f.status === 'aprovado' && (
                    <button onClick={() => atualizarStatusFila(f.id, 'enviado')} className="text-xs px-2.5 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200">Marcar enviado</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'chamada' && (
        <>
          {/* Date Navigation + Filters */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2 bg-white rounded-xl shadow-sm border px-4 py-2">
              <button onClick={() => navegarDia(-1)} className="text-gray-400 hover:text-gray-600">
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-brand-500" />
                <input
                  type="date"
                  value={dataAtual}
                  onChange={(e) => setDataAtual(e.target.value)}
                  className="border-0 text-sm font-medium focus:ring-0 p-0"
                />
                <span className="text-sm text-gray-500">({diaSemanaLabel})</span>
              </div>
              <button onClick={() => navegarDia(1)} className="text-gray-400 hover:text-gray-600">
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => setDataAtual(new Date().toISOString().slice(0, 10))}
              className="text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              Hoje
            </button>

            <select
              value={filtroProfessor}
              onChange={(e) => setFiltroProfessor(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="todos">Todos professores</option>
              {professores.map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>

            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar aluno..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-9 pr-4 py-2 border rounded-lg text-sm w-full"
              />
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-gray-500">Total Alunos</span>
              </div>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <span className="text-xs text-gray-500">Presentes</span>
              </div>
              <p className="text-xl font-bold text-green-600">{stats.presentes}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-xs text-gray-500">Ausentes</span>
              </div>
              <p className="text-xl font-bold text-red-600">{stats.ausentes}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-gray-400" />
                <span className="text-xs text-gray-500">Pendentes</span>
              </div>
              <p className="text-xl font-bold text-gray-500">{stats.pendentes}</p>
            </div>
          </div>

          {/* Action Bar */}
          {stats.pendentes > 0 && (
            <div className="flex justify-end">
              <button
                onClick={marcarTodosPresentes}
                className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors text-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                Marcar todos presentes
              </button>
            </div>
          )}

          {/* Attendance Table */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Horário</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Aluno</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Professor</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Instrumento</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Presença</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400 text-sm">Carregando...</td>
                  </tr>
                ) : filtrados.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400 text-sm">
                      Nenhuma aula agendada para {diaSemanaLabel}, {new Date(dataAtual + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                ) : (
                  filtrados.map((item) => (
                    <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${item.presente === false ? 'bg-red-50/50' : ''}`}>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {item.hora_inicio?.slice(0, 5)} - {item.hora_fim?.slice(0, 5)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.aluno_nome}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{item.professor_nome}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{item.instrumento || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => registrarPresenca(item, true)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              item.presente === true
                                ? 'bg-green-100 text-green-600 ring-2 ring-green-300'
                                : 'text-gray-300 hover:text-green-500 hover:bg-green-50'
                            }`}
                            title="Presente"
                          >
                            <CheckCircle2 className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => registrarPresenca(item, false, 'falta_injustificada')}
                            className={`p-1.5 rounded-lg transition-colors ${
                              item.presente === false
                                ? 'bg-red-100 text-red-600 ring-2 ring-red-300'
                                : 'text-gray-300 hover:text-red-500 hover:bg-red-50'
                            }`}
                            title="Faltou"
                          >
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {item.presente === false && (
                          <select
                            value={item.tipo_falta || 'falta_injustificada'}
                            onChange={(e) => registrarPresenca(item, false, e.target.value)}
                            className="text-xs border rounded px-2 py-1"
                          >
                            <option value="falta_injustificada">Injustificada</option>
                            <option value="falta_justificada">Justificada</option>
                            <option value="remarcada">Remarcada</option>
                          </select>
                        )}
                        {item.presente === true && (
                          <span className="text-xs text-green-600 font-medium">Presente</span>
                        )}
                        {item.presente === null && (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'historico' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-4">
            <select
              value={histFiltro.mes}
              onChange={(e) => setHistFiltro(f => ({ ...f, mes: Number(e.target.value) }))}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              {MESES.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              value={histFiltro.ano}
              onChange={(e) => setHistFiltro(f => ({ ...f, ano: Number(e.target.value) }))}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              {[2024, 2025, 2026].map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
            <select
              value={filtroProfessor}
              onChange={(e) => setFiltroProfessor(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="todos">Todos professores</option>
              {professores.map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>

          {/* History Table */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Data</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Aluno</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Professor</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Instrumento</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {histData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-gray-400 text-sm">Nenhum registro encontrado</td>
                  </tr>
                ) : (
                  histData.map((h, i) => (
                    <tr key={i} className={`hover:bg-gray-50 ${!h.presente ? 'bg-red-50/50' : ''}`}>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {new Date(h.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">{h.aluno_nome}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{h.professor_nome}</td>
                      <td className="px-4 py-3 text-sm text-gray-700">{h.instrumento || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        {h.presente ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                            <CheckCircle2 className="w-3 h-3" /> Presente
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" /> Faltou
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {h.tipo_falta === 'falta_justificada' ? 'Justificada' :
                         h.tipo_falta === 'falta_injustificada' ? 'Injustificada' :
                         h.tipo_falta === 'remarcada' ? 'Remarcada' : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
