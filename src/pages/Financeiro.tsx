import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  ArrowDownCircle,
  ArrowUpCircle,
  Plus,
  Trash2,
  CalendarDays,
  Users,
  CheckCircle2,
  Clock,
  Download,
  Receipt,
  Printer,
  Copy,
  X,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

interface FluxoItem {
  id: string
  tipo: 'entrada' | 'saida'
  mes: number
  ano: number
  aluno_nome: string
  professor_nome?: string
  vendedor?: string
  tipo_aula?: string
  matricula_confirmada?: boolean
  data_evento?: string
  observacoes?: string
}

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

const TIPOS_AULA = [
  'Individual Mensal', 'Individual Semestral', 'Grupo', 'Avulsa',
]

interface ProfPagamento {
  professor_id: string
  professor_nome: string
  tipo: string
  valor_hora: number
  aulas_mes: number
  presencas: number
  faltas_justificadas: number
  total_aulas_pagas: number
  valor_aulas: number
  extras: number
  total: number
  chave_pix?: string | null
  pix_tipo?: string | null
}

interface TrabalhoExtra {
  id: string
  professor_id: string
  professor_nome?: string
  descricao: string
  valor: number
  data: string
  aprovado: boolean
}

export default function Financeiro() {
  const [tab, setTab] = useState<'fluxo' | 'professores'>('fluxo')
  const [mesAtual, setMesAtual] = useState(new Date().getMonth() + 1)
  const [anoAtual, setAnoAtual] = useState(new Date().getFullYear())
  const [entradas, setEntradas] = useState<FluxoItem[]>([])
  const [saidas, setSaidas] = useState<FluxoItem[]>([])
  const [resumoAnual, setResumoAnual] = useState<{ mes: string; entradas: number; saidas: number; saldo: number }[]>([])
  const [showForm, setShowForm] = useState<'entrada' | 'saida' | null>(null)
  const [totalMatriculas, setTotalMatriculas] = useState(0)
  const [faturamentoMes, setFaturamentoMes] = useState(0)

  // Professor payment state
  const [profPagamentos, setProfPagamentos] = useState<ProfPagamento[]>([])
  const [extras, setExtras] = useState<TrabalhoExtra[]>([])
  const [showExtraForm, setShowExtraForm] = useState(false)
  const [professores, setProfessores] = useState<{ id: string; nome: string; tipo_professor: string; valor_hora_aula: number }[]>([])
  const [reciboProf, setReciboProf] = useState<ProfPagamento | null>(null)

  useEffect(() => {
    loadFluxo()
    loadResumoAnual()
    loadFaturamento()
    loadProfPagamentos()
    loadExtras()
    loadProfessores()
  }, [mesAtual, anoAtual])

  async function loadProfessores() {
    const { data } = await supabase.from('professores').select('id, nome, tipo_professor, valor_hora_aula').eq('ativo', true).order('nome')
    if (data) setProfessores(data.map(p => ({ ...p, tipo_professor: p.tipo_professor || 'B', valor_hora_aula: Number(p.valor_hora_aula) || 20 })))
  }

  async function loadFluxo() {
    const { data } = await supabase
      .from('fluxo_alunos')
      .select('*')
      .eq('mes', mesAtual)
      .eq('ano', anoAtual)
      .order('data_evento', { ascending: true })

    if (data) {
      setEntradas(data.filter(d => d.tipo === 'entrada'))
      setSaidas(data.filter(d => d.tipo === 'saida'))
    }
  }

  async function loadResumoAnual() {
    const { data } = await supabase
      .from('fluxo_alunos')
      .select('*')
      .eq('ano', anoAtual)

    if (data) {
      const resumo = MESES.map((nome, i) => {
        const mes = i + 1
        const ent = data.filter(d => d.mes === mes && d.tipo === 'entrada').length
        const sai = data.filter(d => d.mes === mes && d.tipo === 'saida').length
        return { mes: nome.slice(0, 3), entradas: ent, saidas: sai, saldo: ent - sai }
      })
      setResumoAnual(resumo)
    }
  }

  async function loadFaturamento() {
    const primeiroDia = new Date(anoAtual, mesAtual - 1, 1).toISOString()
    const ultimoDia = new Date(anoAtual, mesAtual, 0).toISOString()

    const { data: alunosAtivos } = await supabase
      .from('alunos')
      .select('taxa_matricula, valor_plano')
      .eq('status', 'ativo')

    if (alunosAtivos) {
      setTotalMatriculas(alunosAtivos.length)
      setFaturamentoMes(alunosAtivos.reduce((sum, m) => sum + (m.taxa_matricula || 0) + (m.valor_plano || 0), 0))
    }
  }

  async function loadProfPagamentos() {
    const primeiroDia = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`
    const ultimoDia = new Date(anoAtual, mesAtual, 0).toISOString().slice(0, 10)

    // Buscar professores
    const { data: profs } = await supabase.from('professores').select('id, nome, tipo_professor, valor_hora_aula, chave_pix, pix_tipo').eq('ativo', true)
    if (!profs) return

    // Buscar presenças do mês
    const { data: presencasMes } = await supabase
      .from('presencas')
      .select('*')
      .gte('data', primeiroDia)
      .lte('data', ultimoDia)

    // Buscar extras do mês
    const { data: extrasMes } = await supabase
      .from('trabalhos_extras')
      .select('*')
      .gte('data', primeiroDia)
      .lte('data', ultimoDia)
      .eq('aprovado', true)

    const pagamentos: ProfPagamento[] = profs.map(prof => {
      const presProf = (presencasMes || []).filter(p => p.professor_id === prof.id)
      const presentes = presProf.filter(p => p.presente === true).length
      const fj = presProf.filter(p => !p.presente && p.tipo_falta === 'falta_justificada').length
      const totalAulasPagas = presentes // FJ não paga, injustificada também não
      const valorHora = Number(prof.valor_hora_aula) || (prof.tipo_professor === 'A' ? 26.66 : 20.00)
      const valorAulas = totalAulasPagas * valorHora
      const extrasProf = (extrasMes || []).filter(e => e.professor_id === prof.id).reduce((s, e) => s + Number(e.valor), 0)

      return {
        professor_id: prof.id,
        professor_nome: prof.nome,
        tipo: prof.tipo_professor || 'B',
        valor_hora: valorHora,
        aulas_mes: presProf.length,
        presencas: presentes,
        faltas_justificadas: fj,
        total_aulas_pagas: totalAulasPagas,
        valor_aulas: valorAulas,
        extras: extrasProf,
        total: valorAulas + extrasProf,
        chave_pix: (prof as any).chave_pix ?? null,
        pix_tipo: (prof as any).pix_tipo ?? null,
      }
    }).filter(p => p.aulas_mes > 0 || p.extras > 0)

    setProfPagamentos(pagamentos)
  }

  async function loadExtras() {
    const primeiroDia = `${anoAtual}-${String(mesAtual).padStart(2, '0')}-01`
    const ultimoDia = new Date(anoAtual, mesAtual, 0).toISOString().slice(0, 10)

    const { data } = await supabase
      .from('trabalhos_extras')
      .select('*, professor:professores(nome)')
      .gte('data', primeiroDia)
      .lte('data', ultimoDia)
      .order('data', { ascending: false })

    if (data) {
      setExtras(data.map((e: any) => ({
        ...e,
        professor_nome: (e.professor as any)?.nome || '—',
        valor: Number(e.valor),
      })))
    }
  }

  async function handleApproveExtra(id: string, approve: boolean) {
    await supabase.from('trabalhos_extras').update({ aprovado: approve }).eq('id', id)
    loadExtras()
    loadProfPagamentos()
  }

  async function handleAddExtra(form: { professor_id: string; descricao: string; valor: number; data: string }) {
    await supabase.from('trabalhos_extras').insert(form)
    setShowExtraForm(false)
    loadExtras()
    loadProfPagamentos()
  }

  async function handleDeleteExtra(id: string) {
    if (!confirm('Excluir este trabalho extra?')) return
    await supabase.from('trabalhos_extras').delete().eq('id', id)
    loadExtras()
    loadProfPagamentos()
  }

  function exportarCSV() {
    if (profPagamentos.length === 0) {
      alert('Nada para exportar neste mês.')
      return
    }
    const header = ['Professor','Tipo','R$/Aula','Aulas','Presenças','FJ','Aulas R$','Extras R$','Total R$','Chave PIX','Tipo PIX']
    const rows = profPagamentos.map(p => [
      p.professor_nome,
      p.tipo,
      p.valor_hora.toFixed(2).replace('.', ','),
      String(p.aulas_mes),
      String(p.presencas),
      String(p.faltas_justificadas),
      p.valor_aulas.toFixed(2).replace('.', ','),
      p.extras.toFixed(2).replace('.', ','),
      p.total.toFixed(2).replace('.', ','),
      p.chave_pix || '',
      p.pix_tipo || '',
    ])
    const totalRow = ['TOTAL','','','','','',
      profPagamentos.reduce((s,p)=>s+p.valor_aulas,0).toFixed(2).replace('.',','),
      profPagamentos.reduce((s,p)=>s+p.extras,0).toFixed(2).replace('.',','),
      profPagamentos.reduce((s,p)=>s+p.total,0).toFixed(2).replace('.',','),
      '','']
    const csv = [header, ...rows, totalRow]
      .map(r => r.map(c => `"${(c ?? '').replace(/"/g,'""')}"`).join(';'))
      .join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `honorarios_${anoAtual}_${String(mesAtual).padStart(2,'0')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleAddFluxo(form: Partial<FluxoItem>) {
    await supabase.from('fluxo_alunos').insert({
      ...form,
      mes: mesAtual,
      ano: anoAtual,
    })
    setShowForm(null)
    loadFluxo()
    loadResumoAnual()
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este registro?')) return
    await supabase.from('fluxo_alunos').delete().eq('id', id)
    loadFluxo()
    loadResumoAnual()
  }

  const saldoMes = entradas.length - saidas.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-gray-500">Controle financeiro e fluxo de alunos</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mr-3">
            <button
              onClick={() => setTab('fluxo')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'fluxo' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-600'}`}
            >
              Fluxo de Alunos
            </button>
            <button
              onClick={() => setTab('professores')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tab === 'professores' ? 'bg-white text-brand-600 shadow-sm' : 'text-gray-600'}`}
            >
              Pagamentos Professores
            </button>
          </div>
          <select
            value={mesAtual}
            onChange={(e) => setMesAtual(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium"
          >
            {MESES.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={anoAtual}
            onChange={(e) => setAnoAtual(Number(e.target.value))}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm font-medium"
          >
            {[2024, 2025, 2026, 2027].map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPIs */}
      {tab === 'fluxo' && (
      <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <ArrowDownCircle className="w-5 h-5 text-green-500" />
            <span className="text-sm text-gray-500">Entradas no Mês</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{entradas.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <ArrowUpCircle className="w-5 h-5 text-red-500" />
            <span className="text-sm text-gray-500">Saídas no Mês</span>
          </div>
          <p className="text-2xl font-bold text-red-600">{saidas.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            {saldoMes >= 0 ? (
              <TrendingUp className="w-5 h-5 text-green-500" />
            ) : (
              <TrendingDown className="w-5 h-5 text-red-500" />
            )}
            <span className="text-sm text-gray-500">Saldo do Mês</span>
          </div>
          <p className={`text-2xl font-bold ${saldoMes >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {saldoMes >= 0 ? '+' : ''}{saldoMes}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-5 h-5 text-brand-500" />
            <span className="text-sm text-gray-500">Faturamento Total</span>
          </div>
          <p className="text-2xl font-bold text-brand-600">
            R$ {faturamentoMes.toLocaleString('pt-BR')}
          </p>
          <p className="text-xs text-gray-400 mt-1">{totalMatriculas} matrículas ativas</p>
        </div>
      </div>

      {/* Gráfico Anual */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-1">Fluxo de Alunos — {anoAtual}</h3>
        <p className="text-sm text-gray-500 mb-4">Entradas vs Saídas por mês</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={resumoAnual}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="entradas" fill="#22c55e" name="Entradas" radius={[4, 4, 0, 0]} />
              <Bar dataKey="saidas" fill="#ef4444" name="Saídas" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tabelas Entradas e Saídas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ENTRADAS */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="bg-green-600 text-white px-4 py-3 flex items-center justify-between">
            <h3 className="font-bold text-sm uppercase tracking-wider">
              Entrada {MESES[mesAtual - 1]}
            </h3>
            <button
              onClick={() => setShowForm('entrada')}
              className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3 h-3" /> Adicionar
            </button>
          </div>
          <table className="w-full">
            <thead className="bg-green-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Nº</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Aluno</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Professor</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Aula</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Data</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entradas.map((e, i) => (
                <tr key={e.id} className="hover:bg-green-50/50 transition-colors">
                  <td className="px-3 py-2.5 text-sm text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2.5 text-sm font-medium">{e.aluno_nome}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-700">{e.professor_nome || '—'}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-700">{e.tipo_aula || '—'}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-700">
                    {e.data_evento ? new Date(e.data_evento + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => handleDelete(e.id)} className="text-red-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {entradas.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400 text-sm">
                    Nenhuma entrada registrada
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {entradas.length > 0 && (
            <div className="bg-green-50 px-4 py-3 border-t flex justify-between items-center">
              <span className="text-sm font-medium text-green-700">Total Entradas</span>
              <span className="text-sm font-bold text-green-700">{entradas.length}</span>
            </div>
          )}
        </div>

        {/* SAÍDAS */}
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="bg-red-600 text-white px-4 py-3 flex items-center justify-between">
            <h3 className="font-bold text-sm uppercase tracking-wider">
              Saída {MESES[mesAtual - 1]}
            </h3>
            <button
              onClick={() => setShowForm('saida')}
              className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Plus className="w-3 h-3" /> Adicionar
            </button>
          </div>
          <table className="w-full">
            <thead className="bg-red-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Nº</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Aluno</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Professor</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Aula</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Data</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {saidas.map((s, i) => (
                <tr key={s.id} className="hover:bg-red-50/50 transition-colors">
                  <td className="px-3 py-2.5 text-sm text-gray-500">{i + 1}</td>
                  <td className="px-3 py-2.5 text-sm font-medium">{s.aluno_nome}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-700">{s.professor_nome || '—'}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-700">{s.tipo_aula || '—'}</td>
                  <td className="px-3 py-2.5 text-sm text-gray-700">
                    {s.data_evento ? new Date(s.data_evento + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => handleDelete(s.id)} className="text-red-400 hover:text-red-600">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {saidas.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-400 text-sm">
                    Nenhuma saída registrada
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {saidas.length > 0 && (
            <div className="bg-red-50 px-4 py-3 border-t flex justify-between items-center">
              <span className="text-sm font-medium text-red-700">Total Saídas</span>
              <span className="text-sm font-bold text-red-700">{saidas.length}</span>
            </div>
          )}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <FluxoForm
          tipo={showForm}
          onSave={handleAddFluxo}
          onClose={() => setShowForm(null)}
        />
      )}
      </>
      )}

      {/* PROFESSOR PAYMENT TAB */}
      {tab === 'professores' && (
        <>
          {/* Professor Payment KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-5 h-5 text-blue-500" />
                <span className="text-sm text-gray-500">Professores Ativos</span>
              </div>
              <p className="text-2xl font-bold">{profPagamentos.length}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <span className="text-sm text-gray-500">Total Aulas</span>
              </div>
              <p className="text-2xl font-bold text-green-600">{profPagamentos.reduce((s, p) => s + p.presencas, 0)}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-5 h-5 text-orange-500" />
                <span className="text-sm text-gray-500">Extras Pendentes</span>
              </div>
              <p className="text-2xl font-bold text-orange-600">{extras.filter(e => !e.aprovado).length}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm border p-5">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-5 h-5 text-brand-500" />
                <span className="text-sm text-gray-500">Total a Pagar</span>
              </div>
              <p className="text-2xl font-bold text-brand-600">
                R$ {profPagamentos.reduce((s, p) => s + p.total, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Professor Payment Table */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="bg-brand-600 text-white px-4 py-3 flex items-center justify-between">
              <h3 className="font-bold text-sm uppercase tracking-wider">
                Honorários {MESES[mesAtual - 1]} / {anoAtual}
              </h3>
              <button
                onClick={exportarCSV}
                className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Exportar CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Professor</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">R$/Aula</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Aulas</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Presenças</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">FJ</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">Aulas R$</th>
                    <th className="text-right px-3 py-3 text-xs font-medium text-gray-500 uppercase">Extras R$</th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Total R$</th>
                    <th className="text-center px-3 py-3 text-xs font-medium text-gray-500 uppercase">Recibo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {profPagamentos.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-8 text-gray-400 text-sm">
                        Nenhum pagamento registrado para este mês
                      </td>
                    </tr>
                  ) : (
                    profPagamentos.map((p) => (
                      <tr key={p.professor_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium">{p.professor_nome}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.tipo === 'A' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            Tipo {p.tipo}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-sm text-center">R$ {p.valor_hora.toFixed(2)}</td>
                        <td className="px-3 py-3 text-sm text-center">{p.aulas_mes}</td>
                        <td className="px-3 py-3 text-sm text-center text-green-600 font-medium">{p.presencas}</td>
                        <td className="px-3 py-3 text-sm text-center text-orange-600">{p.faltas_justificadas}</td>
                        <td className="px-3 py-3 text-sm text-right">R$ {p.valor_aulas.toFixed(2)}</td>
                        <td className="px-3 py-3 text-sm text-right">{p.extras > 0 ? `R$ ${p.extras.toFixed(2)}` : '—'}</td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-brand-700">R$ {p.total.toFixed(2)}</td>
                        <td className="px-3 py-3 text-center">
                          <button
                            onClick={() => setReciboProf(p)}
                            className="inline-flex items-center gap-1 text-xs bg-brand-50 text-brand-700 hover:bg-brand-100 px-2.5 py-1 rounded-md"
                            title="Ver recibo / PIX"
                          >
                            <Receipt className="w-3.5 h-3.5" /> Recibo
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {profPagamentos.length > 0 && (
                  <tfoot className="bg-gray-50 border-t-2">
                    <tr>
                      <td colSpan={6} className="px-4 py-3 text-sm font-bold text-gray-700">TOTAL</td>
                      <td className="px-3 py-3 text-sm text-right font-bold">
                        R$ {profPagamentos.reduce((s, p) => s + p.valor_aulas, 0).toFixed(2)}
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-bold">
                        R$ {profPagamentos.reduce((s, p) => s + p.extras, 0).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-bold text-brand-700">
                        R$ {profPagamentos.reduce((s, p) => s + p.total, 0).toFixed(2)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Trabalhos Extras */}
          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            <div className="bg-orange-600 text-white px-4 py-3 flex items-center justify-between">
              <h3 className="font-bold text-sm uppercase tracking-wider">Trabalhos Extras</h3>
              <button
                onClick={() => setShowExtraForm(true)}
                className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="w-3 h-3" /> Adicionar
              </button>
            </div>
            <table className="w-full">
              <thead className="bg-orange-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Professor</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Descrição</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-gray-500">Data</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-gray-500">Valor</th>
                  <th className="text-center px-4 py-2 text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {extras.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-6 text-gray-400 text-sm">Nenhum trabalho extra</td>
                  </tr>
                ) : (
                  extras.map((e) => (
                    <tr key={e.id} className="hover:bg-orange-50/50">
                      <td className="px-4 py-2.5 text-sm font-medium">{e.professor_nome}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">{e.descricao}</td>
                      <td className="px-4 py-2.5 text-sm text-gray-700">
                        {new Date(e.data + 'T12:00:00').toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-right font-medium">R$ {Number(e.valor).toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-center">
                        {e.aprovado ? (
                          <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full">Aprovado</span>
                        ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleApproveExtra(e.id, true)}
                              className="text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 px-2 py-0.5 rounded-full"
                            >
                              Aprovar
                            </button>
                            <button
                              onClick={() => handleApproveExtra(e.id, false)}
                              className="text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 px-2 py-0.5 rounded-full"
                            >
                              Rejeitar
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => handleDeleteExtra(e.id)} className="text-red-400 hover:text-red-600">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Extra Form Modal */}
          {showExtraForm && (
            <ExtraForm
              professores={professores}
              onSave={handleAddExtra}
              onClose={() => setShowExtraForm(false)}
            />
          )}

          {/* Recibo Modal */}
          {reciboProf && (
            <ReciboModal
              prof={reciboProf}
              mes={mesAtual}
              ano={anoAtual}
              onClose={() => setReciboProf(null)}
              onUpdated={() => loadProfPagamentos()}
            />
          )}
        </>
      )}
    </div>
  )
}

function FluxoForm({
  tipo,
  onSave,
  onClose,
}: {
  tipo: 'entrada' | 'saida'
  onSave: (data: Partial<FluxoItem>) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    aluno_nome: '',
    professor_nome: '',
    vendedor: '',
    tipo_aula: '',
    matricula_confirmada: false,
    data_evento: new Date().toISOString().slice(0, 10),
  })

  const isEntrada = tipo === 'entrada'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          {isEntrada ? (
            <ArrowDownCircle className="w-5 h-5 text-green-500" />
          ) : (
            <ArrowUpCircle className="w-5 h-5 text-red-500" />
          )}
          Nova {isEntrada ? 'Entrada' : 'Saída'}
        </h2>
        <div className="space-y-3">
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Nome do aluno"
            value={form.aluno_nome}
            onChange={(e) => setForm({ ...form, aluno_nome: e.target.value })}
          />
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Professor"
            value={form.professor_nome}
            onChange={(e) => setForm({ ...form, professor_nome: e.target.value })}
          />
          {isEntrada && (
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Vendedor"
              value={form.vendedor}
              onChange={(e) => setForm({ ...form, vendedor: e.target.value })}
            />
          )}
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.tipo_aula}
            onChange={(e) => setForm({ ...form, tipo_aula: e.target.value })}
          >
            <option value="">Tipo de aula</option>
            {TIPOS_AULA.map(t => <option key={t}>{t}</option>)}
          </select>
          <input
            type="date"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.data_evento}
            onChange={(e) => setForm({ ...form, data_evento: e.target.value })}
          />
          {isEntrada && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.matricula_confirmada}
                onChange={(e) => setForm({ ...form, matricula_confirmada: e.target.checked })}
                className="rounded"
              />
              Matrícula confirmada
            </label>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button
            onClick={() => onSave({ ...form, tipo })}
            className={`px-4 py-2 text-sm text-white rounded-lg ${isEntrada ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

function ExtraForm({
  professores,
  onSave,
  onClose,
}: {
  professores: { id: string; nome: string }[]
  onSave: (data: { professor_id: string; descricao: string; valor: number; data: string }) => void
  onClose: () => void
}) {
  const [form, setForm] = useState({
    professor_id: '',
    descricao: '',
    valor: '',
    data: new Date().toISOString().slice(0, 10),
  })

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Plus className="w-5 h-5 text-orange-500" />
          Novo Trabalho Extra
        </h2>
        <div className="space-y-3">
          <select
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.professor_id}
            onChange={(e) => setForm({ ...form, professor_id: e.target.value })}
          >
            <option value="">Selecionar professor</option>
            {professores.map(p => (
              <option key={p.id} value={p.id}>{p.nome}</option>
            ))}
          </select>
          <input
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Descrição do trabalho"
            value={form.descricao}
            onChange={(e) => setForm({ ...form, descricao: e.target.value })}
          />
          <input
            type="number"
            step="0.01"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="Valor (R$)"
            value={form.valor}
            onChange={(e) => setForm({ ...form, valor: e.target.value })}
          />
          <input
            type="date"
            className="w-full border rounded-lg px-3 py-2 text-sm"
            value={form.data}
            onChange={(e) => setForm({ ...form, data: e.target.value })}
          />
        </div>
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button
            onClick={() => {
              if (!form.professor_id || !form.descricao || !form.valor) return
              onSave({ ...form, valor: parseFloat(form.valor) })
            }}
            className="px-4 py-2 text-sm text-white rounded-lg bg-orange-600 hover:bg-orange-700"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ReciboModal — recibo imprimível + chave PIX
// ---------------------------------------------------------------------------
const MESES_NOMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

function ReciboModal({ prof, mes, ano, onClose, onUpdated }: {
  prof: ProfPagamento
  mes: number
  ano: number
  onClose: () => void
  onUpdated: () => void
}) {
  const [chavePix, setChavePix] = useState(prof.chave_pix || '')
  const [pixTipo, setPixTipo] = useState(prof.pix_tipo || 'cpf')
  const [editPix, setEditPix] = useState(!prof.chave_pix)
  const [savingPix, setSavingPix] = useState(false)
  const [copied, setCopied] = useState(false)

  async function salvarPix() {
    setSavingPix(true)
    const { error } = await supabase
      .from('professores')
      .update({ chave_pix: chavePix || null, pix_tipo: chavePix ? pixTipo : null })
      .eq('id', prof.professor_id)
    setSavingPix(false)
    if (error) {
      alert('Erro ao salvar PIX:\n' + error.message)
      return
    }
    setEditPix(false)
    onUpdated()
  }

  async function copiarPix() {
    if (!chavePix) return
    try {
      await navigator.clipboard.writeText(chavePix)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      alert('Não foi possível copiar. Chave: ' + chavePix)
    }
  }

  function imprimir() {
    const w = window.open('', '_blank', 'width=700,height=900')
    if (!w) { alert('Permita pop-ups para imprimir.'); return }
    const linhas = [
      ['Aulas dadas', String(prof.presencas)],
      ['Faltas justificadas', String(prof.faltas_justificadas)],
      ['Valor por aula', `R$ ${prof.valor_hora.toFixed(2)}`],
      ['Subtotal aulas', `R$ ${prof.valor_aulas.toFixed(2)}`],
      ['Trabalhos extras', `R$ ${prof.extras.toFixed(2)}`],
    ].map(([k,v]) => `<tr><td>${k}</td><td style="text-align:right">${v}</td></tr>`).join('')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Recibo - ${prof.professor_nome}</title>
      <style>
        body{font-family:Arial,sans-serif;max-width:600px;margin:40px auto;padding:0 20px;color:#222}
        h1{font-size:18px;margin:0 0 4px;text-align:center}
        h2{font-size:13px;color:#666;margin:0 0 24px;text-align:center;font-weight:normal}
        .box{border:1px solid #ddd;border-radius:8px;padding:18px;margin-bottom:18px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        td{padding:6px 0;border-bottom:1px solid #f0f0f0}
        .total{font-size:18px;font-weight:bold;background:#f7f7f7;padding:14px;border-radius:8px;display:flex;justify-content:space-between;margin-bottom:18px}
        .pix{font-family:monospace;background:#f7f7f7;padding:10px;border-radius:6px;font-size:12px;word-break:break-all}
        .footer{margin-top:40px;border-top:1px solid #ddd;padding-top:30px;text-align:center;font-size:12px;color:#666}
        .sign{margin-top:50px;border-top:1px solid #333;padding-top:6px;width:300px;margin-left:auto;margin-right:auto;text-align:center;font-size:12px}
      </style></head><body>
      <h1>RECIBO DE PAGAMENTO</h1>
      <h2>Centro de Música Murilo Finger — CMMF</h2>
      <div class="box">
        <p><strong>Recebi de:</strong> Centro de Música Murilo Finger</p>
        <p><strong>A quantia de:</strong> R$ ${prof.total.toFixed(2)}</p>
        <p><strong>Referente a:</strong> Honorários de aulas — ${MESES_NOMES[mes-1]}/${ano}</p>
        <p><strong>Beneficiário:</strong> ${prof.professor_nome} (Tipo ${prof.tipo})</p>
      </div>
      <div class="box">
        <table>${linhas}</table>
      </div>
      <div class="total"><span>TOTAL</span><span>R$ ${prof.total.toFixed(2)}</span></div>
      ${chavePix ? `<div class="box"><p style="margin:0 0 6px"><strong>Chave PIX (${pixTipo}):</strong></p><div class="pix">${chavePix}</div></div>` : ''}
      <div class="sign">${prof.professor_nome}</div>
      <div class="footer">Emitido em ${new Date().toLocaleDateString('pt-BR')} via Sistema CMMF</div>
      <script>window.onload=()=>{window.print()}</script>
      </body></html>`)
    w.document.close()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><Receipt className="w-5 h-5" /> Recibo</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 mb-4">
          <p className="font-semibold">{prof.professor_nome}</p>
          <p className="text-xs text-gray-500">Tipo {prof.tipo} · {MESES_NOMES[mes-1]}/{ano}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Aulas</span><span>{prof.presencas}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">FJ</span><span>{prof.faltas_justificadas}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">R$/aula</span><span>R$ {prof.valor_hora.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>R$ {prof.valor_aulas.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Extras</span><span>R$ {prof.extras.toFixed(2)}</span></div>
            <div className="flex justify-between font-bold text-brand-700"><span>TOTAL</span><span>R$ {prof.total.toFixed(2)}</span></div>
          </div>
        </div>

        {/* PIX */}
        <div className="border rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold">Chave PIX para pagamento</p>
            {!editPix && chavePix && (
              <button onClick={() => setEditPix(true)} className="text-xs text-brand-600 hover:underline">Editar</button>
            )}
          </div>

          {editPix ? (
            <div className="space-y-2">
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={pixTipo} onChange={e => setPixTipo(e.target.value)}>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">E-mail</option>
                <option value="telefone">Telefone</option>
                <option value="aleatoria">Aleatória</option>
              </select>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
                placeholder="Chave PIX"
                value={chavePix}
                onChange={e => setChavePix(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                {prof.chave_pix && (
                  <button onClick={() => { setChavePix(prof.chave_pix || ''); setPixTipo(prof.pix_tipo || 'cpf'); setEditPix(false) }} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                )}
                <button onClick={salvarPix} disabled={savingPix} className="px-3 py-1.5 text-xs bg-brand-500 text-white rounded-lg disabled:opacity-50">
                  {savingPix ? 'Salvando...' : 'Salvar PIX'}
                </button>
              </div>
            </div>
          ) : chavePix ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-gray-50 px-3 py-2 rounded text-xs break-all">{chavePix}</code>
              <button onClick={copiarPix} className="flex items-center gap-1 text-xs px-3 py-2 bg-brand-50 text-brand-700 hover:bg-brand-100 rounded-lg">
                <Copy className="w-3.5 h-3.5" /> {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">Nenhuma chave PIX cadastrada para este professor.</p>
          )}
          {!editPix && chavePix && (
            <p className="text-[11px] text-gray-500 mt-1">Tipo: {pixTipo}</p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Fechar</button>
          <button onClick={imprimir} className="flex items-center gap-1 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600">
            <Printer className="w-4 h-4" /> Imprimir Recibo
          </button>
        </div>
      </div>
    </div>
  )
}
