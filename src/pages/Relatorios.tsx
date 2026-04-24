import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Users, GraduationCap, BookOpen, DollarSign, TrendingUp, Download, FileSpreadsheet, FileText } from 'lucide-react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  FunnelChart,
  Funnel,
  Cell,
  LabelList,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts'

const COLORS = ['#2183a8', '#7ed9ed', '#10b981']

export default function Relatorios() {
  const [dataInicio, setDataInicio] = useState('2025-01-01')
  const [dataFim, setDataFim] = useState('2026-12-31')
  const [stats, setStats] = useState({
    contatos: 0,
    experimentais: 0,
    matriculas: 0,
    faturamento: 0,
    taxas: 0,
    planos: 0,
    conversaoExp: 0,
    conversaoMat: 0,
  })
  const [porCanal, setPorCanal] = useState<{ canal: string; contatos: number; matriculas: number }[]>([])
  const [porInstrumento, setPorInstrumento] = useState<{ instrumento: string; contatos: number; matriculas: number }[]>([])
  const [faturamentoCanal, setFaturamentoCanal] = useState<{ canal: string; contatos: number; matriculas: number; conversao: string; faturamento: number }[]>([])
  const [crescimento, setCrescimento] = useState<{ mes_label: string; entradas: number; saidas: number; saldo: number }[]>([])
  const [evasaoMotivos, setEvasaoMotivos] = useState<{ motivo: string; total: number; ult_30d: number; ult_90d: number; ult_ano: number }[]>([])
  const [profEvolucao, setProfEvolucao] = useState<{ professor_nome: string; alunos_ativos: number; saidas_30d: number; saidas_90d: number; saidas_ano: number; saidas_motivo_professor_ano: number }[]>([])

  useEffect(() => {
    loadRelatorios()
    loadCrescimento()
  }, [])

  async function loadCrescimento() {
    const [{ data: cresc }, { data: motivos }, { data: profs }] = await Promise.all([
      supabase.from('vw_crescimento_evasao_mensal').select('*'),
      supabase.from('vw_evasao_motivos').select('*'),
      supabase.from('vw_professor_alunos_evolucao').select('*'),
    ])
    if (cresc) setCrescimento(cresc as any)
    if (motivos) setEvasaoMotivos(motivos as any)
    if (profs) setProfEvolucao(profs as any)
  }

  function exportarCSV() {
    const linhas: string[] = []

    linhas.push('Resumo')
    linhas.push('Indicador,Valor')
    linhas.push(`Contatos,${stats.contatos}`)
    linhas.push(`Aulas Experimentais,${stats.experimentais}`)
    linhas.push(`Matriculas,${stats.matriculas}`)
    linhas.push(`Conversao para Experimental (%),${stats.conversaoExp.toFixed(2)}`)
    linhas.push(`Conversao para Matricula (%),${stats.conversaoMat.toFixed(2)}`)
    linhas.push(`Faturamento Total,${stats.faturamento.toFixed(2)}`)
    linhas.push(`Taxas de Matricula,${stats.taxas.toFixed(2)}`)
    linhas.push(`Planos,${stats.planos.toFixed(2)}`)
    linhas.push('')

    linhas.push('Canal de Origem')
    linhas.push('Canal,Contatos,Matriculas')
    porCanal.forEach((c) => {
      linhas.push(`${c.canal},${c.contatos},${c.matriculas}`)
    })
    linhas.push('')

    linhas.push('Instrumento')
    linhas.push('Instrumento,Contatos,Matriculas')
    porInstrumento.forEach((i) => {
      linhas.push(`${i.instrumento},${i.contatos},${i.matriculas}`)
    })
    linhas.push('')

    linhas.push('Faturamento por Canal')
    linhas.push('Canal,Contatos,Matriculas,Conversao,Faturamento')
    faturamentoCanal.forEach((f) => {
      linhas.push(`${f.canal},${f.contatos},${f.matriculas},${f.conversao},${f.faturamento.toFixed(2)}`)
    })

    const csv = '\ufeff' + linhas.join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relatorio-cmmf-${dataInicio}-${dataFim}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function exportarExcel() {
    const wb = XLSX.utils.book_new()

    const resumo = [
      ['Indicador', 'Valor'],
      ['Contatos', stats.contatos],
      ['Aulas Experimentais', stats.experimentais],
      ['Matriculas', stats.matriculas],
      ['Conversao para Experimental (%)', Number(stats.conversaoExp.toFixed(2))],
      ['Conversao para Matricula (%)', Number(stats.conversaoMat.toFixed(2))],
      ['Faturamento Total', Number(stats.faturamento.toFixed(2))],
      ['Taxas de Matricula', Number(stats.taxas.toFixed(2))],
      ['Planos', Number(stats.planos.toFixed(2))],
    ]

    const canais = [
      ['Canal', 'Contatos', 'Matriculas'],
      ...porCanal.map((c) => [c.canal, c.contatos, c.matriculas]),
    ]

    const instrumentos = [
      ['Instrumento', 'Contatos', 'Matriculas'],
      ...porInstrumento.map((i) => [i.instrumento, i.contatos, i.matriculas]),
    ]

    const faturamento = [
      ['Canal', 'Contatos', 'Matriculas', 'Conversao', 'Faturamento'],
      ...faturamentoCanal.map((f) => [f.canal, f.contatos, f.matriculas, f.conversao, Number(f.faturamento.toFixed(2))]),
    ]

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumo), 'Resumo')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(canais), 'Canal')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instrumentos), 'Instrumento')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(faturamento), 'Faturamento')

    XLSX.writeFile(wb, `relatorio-cmmf-${dataInicio}-${dataFim}.xlsx`)
  }

  function exportarPDF() {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    const titulo = `Relatorio CMMF ${dataInicio} a ${dataFim}`

    doc.setFontSize(14)
    doc.text(titulo, 40, 40)

    autoTable(doc, {
      startY: 60,
      head: [['Indicador', 'Valor']],
      body: [
        ['Contatos', String(stats.contatos)],
        ['Aulas Experimentais', String(stats.experimentais)],
        ['Matriculas', String(stats.matriculas)],
        ['Conversao para Experimental (%)', stats.conversaoExp.toFixed(2)],
        ['Conversao para Matricula (%)', stats.conversaoMat.toFixed(2)],
        ['Faturamento Total', `R$ ${stats.faturamento.toLocaleString('pt-BR')}`],
        ['Taxas de Matricula', `R$ ${stats.taxas.toLocaleString('pt-BR')}`],
        ['Planos', `R$ ${stats.planos.toLocaleString('pt-BR')}`],
      ],
      theme: 'striped',
      styles: { fontSize: 9 },
    })

    autoTable(doc, {
      startY: ((doc as any).lastAutoTable?.finalY || 80) + 16,
      head: [['Canal', 'Contatos', 'Matriculas']],
      body: porCanal.map((c) => [c.canal, String(c.contatos), String(c.matriculas)]),
      theme: 'grid',
      styles: { fontSize: 9 },
    })

    autoTable(doc, {
      startY: ((doc as any).lastAutoTable?.finalY || 120) + 16,
      head: [['Instrumento', 'Contatos', 'Matriculas']],
      body: porInstrumento.map((i) => [i.instrumento, String(i.contatos), String(i.matriculas)]),
      theme: 'grid',
      styles: { fontSize: 9 },
    })

    autoTable(doc, {
      startY: ((doc as any).lastAutoTable?.finalY || 160) + 16,
      head: [['Canal', 'Contatos', 'Matriculas', 'Conversao', 'Faturamento']],
      body: faturamentoCanal.map((f) => [
        f.canal,
        String(f.contatos),
        String(f.matriculas),
        f.conversao,
        `R$ ${f.faturamento.toLocaleString('pt-BR')}`,
      ]),
      theme: 'grid',
      styles: { fontSize: 9 },
    })

    doc.save(`relatorio-cmmf-${dataInicio}-${dataFim}.pdf`)
  }

  async function loadRelatorios() {
    const { data: contatos } = await supabase
      .from('alunos')
      .select('*')
      .gte('created_at', dataInicio)
      .lte('created_at', dataFim)

    const { data: experimentais } = await supabase
      .from('aulas_experimentais')
      .select('*')
      .gte('data_aula', dataInicio)
      .lte('data_aula', dataFim)

    const { data: matriculas } = await supabase
      .from('matriculas')
      .select('*, aluno:alunos(*)')
      .gte('data_matricula', dataInicio)
      .lte('data_matricula', dataFim)

    const c = contatos ?? []
    const e = experimentais ?? []
    const m = matriculas ?? []

    const taxas = m.reduce((s, x) => s + (x.taxa_matricula || 0), 0)
    const planos = m.reduce((s, x) => s + (x.valor_plano || 0), 0)

    setStats({
      contatos: c.length,
      experimentais: e.length,
      matriculas: m.length,
      faturamento: taxas + planos,
      taxas,
      planos,
      conversaoExp: c.length > 0 ? (e.length / c.length) * 100 : 0,
      conversaoMat: e.length > 0 ? (m.length / e.length) * 100 : 0,
    })

    // Group by canal
    const canais: Record<string, { contatos: number; matriculas: number; faturamento: number }> = {}
    c.forEach((x) => {
      const canal = x.origem || 'Outro'
      if (!canais[canal]) canais[canal] = { contatos: 0, matriculas: 0, faturamento: 0 }
      canais[canal]!.contatos++
    })
    m.forEach((x) => {
      const canal = x.aluno?.origem ?? 'Outro'
      if (!canais[canal]) canais[canal] = { contatos: 0, matriculas: 0, faturamento: 0 }
      canais[canal]!.matriculas++
      canais[canal]!.faturamento += (x.taxa_matricula || 0) + (x.valor_plano || 0)
    })
    setPorCanal(Object.entries(canais).map(([canal, v]) => ({ canal, ...v })))
    setFaturamentoCanal(
      Object.entries(canais).map(([canal, v]) => ({
        canal,
        contatos: v.contatos,
        matriculas: v.matriculas,
        conversao: v.contatos > 0 ? `${((v.matriculas / v.contatos) * 100).toFixed(1)}%` : '0.0%',
        faturamento: v.faturamento,
      }))
    )

    // Group by instrumento
    const inst: Record<string, { contatos: number; matriculas: number }> = {}
    c.forEach((x) => {
      const instr = x.instrumento_interesse || 'Não definido'
      if (!inst[instr]) inst[instr] = { contatos: 0, matriculas: 0 }
      inst[instr]!.contatos++
    })
    m.forEach((x) => {
      const instr = x.instrumento || 'Não definido'
      if (!inst[instr]) inst[instr] = { contatos: 0, matriculas: 0 }
      inst[instr]!.matriculas++
    })
    setPorInstrumento(Object.entries(inst).map(([instrumento, v]) => ({ instrumento, ...v })))
  }

  const funnelData = [
    { name: 'Contatos', value: stats.contatos },
    { name: 'Aulas Experimentais', value: stats.experimentais },
    { name: 'Matrículas', value: stats.matriculas },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
        <p className="text-gray-500">Análise de desempenho comercial e financeiro</p>
      </div>

      {/* Date Filter */}
      <div className="flex gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Data Inicial</label>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Data Final</label>
          <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} className="border rounded-lg px-3 py-2 text-sm" />
        </div>
        <button onClick={loadRelatorios} className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-600">
          Aplicar Filtro
        </button>
        <button
          onClick={exportarCSV}
          className="bg-gray-900 text-white px-4 py-2 rounded-lg text-sm hover:bg-black flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Exportar CSV
        </button>
        <button
          onClick={exportarExcel}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-emerald-700 flex items-center gap-2"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Exportar Excel
        </button>
        <button
          onClick={exportarPDF}
          className="bg-rose-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-rose-700 flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          Exportar PDF
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2"><Users className="w-4 h-4 text-blue-600" /><span className="text-sm text-gray-500">Contatos</span></div>
          <p className="text-2xl font-bold">{stats.contatos}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2"><GraduationCap className="w-4 h-4 text-brand-600" /><span className="text-sm text-gray-500">Aulas Experimentais</span></div>
          <p className="text-2xl font-bold">{stats.experimentais}</p>
          <p className="text-xs text-gray-400">{stats.conversaoExp.toFixed(1)}% conversão</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2"><BookOpen className="w-4 h-4 text-green-600" /><span className="text-sm text-gray-500">Matrículas</span></div>
          <p className="text-2xl font-bold">{stats.matriculas}</p>
          <p className="text-xs text-gray-400">{stats.conversaoMat.toFixed(1)}% conversão</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center gap-2 mb-2"><DollarSign className="w-4 h-4 text-brand-600" /><span className="text-sm text-gray-500">Faturamento</span></div>
          <p className="text-2xl font-bold">R$ {stats.faturamento.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-gray-400">Taxa: R$ {stats.taxas.toLocaleString('pt-BR')} | Plano: R$ {stats.planos.toLocaleString('pt-BR')}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Funnel */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-500" />
            Funil de Conversão
          </h3>
          <p className="text-sm text-gray-500 mb-4">Evolução do contato até a matrícula</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {funnelData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Por Canal */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 mb-1">Por Canal de Origem</h3>
          <p className="text-sm text-gray-500 mb-4">Contatos e matrículas por canal</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={porCanal}>
                <XAxis dataKey="canal" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="contatos" fill="#3b82f6" name="Contatos" radius={[4, 4, 0, 0]} />
                <Bar dataKey="matriculas" fill="#10b981" name="Matrículas" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Por Instrumento */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-1">Por Instrumento</h3>
        <p className="text-sm text-gray-500 mb-4">Contatos e matrículas por curso</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={porInstrumento} layout="vertical">
              <XAxis type="number" />
              <YAxis type="category" dataKey="instrumento" width={80} />
              <Tooltip />
              <Bar dataKey="contatos" fill="#3b82f6" name="Contatos" radius={[0, 4, 4, 0]} />
              <Bar dataKey="matriculas" fill="#10b981" name="Matrículas" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Faturamento por Canal */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-900">Faturamento por Canal</h3>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Canal</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Contatos</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Matrículas</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Conversão</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Faturamento</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {faturamentoCanal.map((f) => (
              <tr key={f.canal} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium">{f.canal}</td>
                <td className="px-4 py-3 text-sm">{f.contatos}</td>
                <td className="px-4 py-3 text-sm">{f.matriculas}</td>
                <td className="px-4 py-3 text-sm">{f.conversao}</td>
                <td className="px-4 py-3 text-sm font-medium">R$ {f.faturamento.toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Crescimento e Evasão (Item 1) */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Crescimento e Evasão (últimos 12 meses)</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={crescimento}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="mes_label" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="entradas" stroke="#10b981" name="Entradas" strokeWidth={2} />
              <Line type="monotone" dataKey="saidas" stroke="#ef4444" name="Saídas" strokeWidth={2} />
              <Line type="monotone" dataKey="saldo" stroke="#2183a8" name="Saldo" strokeWidth={2} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Motivos de evasão */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-900">Motivos de Evasão</h3>
        </div>
        {evasaoMotivos.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">Sem evasões registradas ainda.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-4 py-3">Motivo</th>
                <th className="text-right px-4 py-3">Total</th>
                <th className="text-right px-4 py-3">Últimos 30d</th>
                <th className="text-right px-4 py-3">Últimos 90d</th>
                <th className="text-right px-4 py-3">Último ano</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {evasaoMotivos.map((m) => (
                <tr key={m.motivo} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium capitalize">{m.motivo.replace(/_/g, ' ')}</td>
                  <td className="px-4 py-3 text-right">{m.total}</td>
                  <td className="px-4 py-3 text-right">{m.ult_30d}</td>
                  <td className="px-4 py-3 text-right">{m.ult_90d}</td>
                  <td className="px-4 py-3 text-right">{m.ult_ano}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Por professor */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-3 border-b bg-gray-50">
          <h3 className="font-semibold text-gray-900">Crescimento e Evasão por Professor</h3>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-3">Professor</th>
              <th className="text-right px-4 py-3">Alunos ativos</th>
              <th className="text-right px-4 py-3">Saídas 30d</th>
              <th className="text-right px-4 py-3">Saídas 90d</th>
              <th className="text-right px-4 py-3">Saídas ano</th>
              <th className="text-right px-4 py-3 text-red-600">Saídas por insat. com prof. (ano)</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {profEvolucao.map((p) => (
              <tr key={p.professor_nome} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium">{p.professor_nome}</td>
                <td className="px-4 py-3 text-right">{p.alunos_ativos}</td>
                <td className="px-4 py-3 text-right">{p.saidas_30d}</td>
                <td className="px-4 py-3 text-right">{p.saidas_90d}</td>
                <td className="px-4 py-3 text-right">{p.saidas_ano}</td>
                <td className={`px-4 py-3 text-right font-medium ${p.saidas_motivo_professor_ano > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                  {p.saidas_motivo_professor_ano}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
