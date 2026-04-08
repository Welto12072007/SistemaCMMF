import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Users, GraduationCap, BookOpen, DollarSign, TrendingUp } from 'lucide-react'
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

  useEffect(() => {
    loadRelatorios()
  }, [])

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
    </div>
  )
}
