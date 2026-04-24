import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Wallet,
  RefreshCw,
  Calendar,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

interface ResumoMes {
  referencia: string
  total: number
  pagas: number
  pendentes: number
  atrasadas: number
  isentas: number
  valor_recebido: number
  valor_a_receber: number
}

interface MensalidadeRow {
  id: string
  aluno_id: string
  referencia: string
  valor: number
  desconto: number
  valor_pago: number | null
  data_vencimento: string
  data_pagamento: string | null
  status: string
  metodo_pagamento: string | null
}

interface AlunoRow {
  id: string
  nome: string
  telefone: string | null
  instrumento_interesse: string | null
}

interface InadimplenteAgg {
  aluno_id: string
  nome: string
  telefone: string | null
  qtd: number
  valor_total: number
  vencimento_mais_antigo: string
}

const COLORS = {
  pago: '#10b981',
  pendente: '#f59e0b',
  atrasado: '#ef4444',
  isento: '#6b7280',
}

const METODO_LABELS: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Crédito',
  cartao_debito: 'Débito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  outro: 'Outro',
}

const METODO_COLORS = ['#2183a8', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#6b7280']

function formatBRL(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatMes(ref: string) {
  const d = new Date(ref + 'T12:00')
  return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
}

function formatBR(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00').toLocaleDateString('pt-BR')
}

export default function DashboardFinanceiro() {
  const [resumos, setResumos] = useState<ResumoMes[]>([])
  const [mensAll, setMensAll] = useState<MensalidadeRow[]>([])
  const [alunos, setAlunos] = useState<Map<string, AlunoRow>>(new Map())
  const [loading, setLoading] = useState(true)
  const [refMes, setRefMes] = useState<string>(() => new Date().toISOString().slice(0, 7) + '-01')

  useEffect(() => {
    void loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    const hoje = new Date()
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth() - 11, 1).toISOString().slice(0, 10)
    const fim = new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0).toISOString().slice(0, 10)

    const [resumosResp, mensResp, alunosResp] = await Promise.all([
      supabase.from('vw_mensalidades_resumo').select('*').gte('referencia', inicio).order('referencia'),
      supabase.from('mensalidades').select('*').gte('data_vencimento', inicio).lte('data_vencimento', fim),
      supabase.from('alunos').select('id, nome, telefone, instrumento_interesse'),
    ])

    setResumos(((resumosResp.data as any[]) || []).map((r) => ({
      ...r,
      total: Number(r.total || 0),
      pagas: Number(r.pagas || 0),
      pendentes: Number(r.pendentes || 0),
      atrasadas: Number(r.atrasadas || 0),
      isentas: Number(r.isentas || 0),
      valor_recebido: Number(r.valor_recebido || 0),
      valor_a_receber: Number(r.valor_a_receber || 0),
    })))

    setMensAll((mensResp.data as MensalidadeRow[]) || [])

    const m = new Map<string, AlunoRow>()
    for (const a of (alunosResp.data as AlunoRow[]) || []) m.set(a.id, a)
    setAlunos(m)

    setLoading(false)
  }

  // KPIs do mês selecionado
  const kpis = useMemo(() => {
    const mes = resumos.find((r) => r.referencia === refMes)
    const recebido = mes?.valor_recebido || 0
    const aReceber = mes?.valor_a_receber || 0
    const pagas = mes?.pagas || 0
    const ticketMedio = pagas > 0 ? recebido / pagas : 0

    // Atrasados gerais (independente do mês)
    const atrasadosGerais = mensAll.filter((m) => m.status === 'atrasado')
    const valorAtrasado = atrasadosGerais.reduce((acc, m) => acc + (Number(m.valor) - Number(m.desconto)), 0)

    return { recebido, aReceber, ticketMedio, valorAtrasado, qtdAtrasados: atrasadosGerais.length }
  }, [resumos, mensAll, refMes])

  // Linha — receita 12 meses
  const serie12m = useMemo(() => {
    return resumos.map((r) => ({
      mes: formatMes(r.referencia),
      Recebido: r.valor_recebido,
      'A Receber': r.valor_a_receber,
    }))
  }, [resumos])

  // Bar empilhada — quantidade por status nos últimos 12 meses
  const serieStatus = useMemo(() => {
    return resumos.map((r) => ({
      mes: formatMes(r.referencia),
      Pagas: r.pagas,
      Pendentes: r.pendentes,
      Atrasadas: r.atrasadas,
      Isentas: r.isentas,
    }))
  }, [resumos])

  // Pie — métodos de pagamento (mês selecionado, status=pago)
  const pieMetodos = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of mensAll) {
      if (m.referencia !== refMes) continue
      if (m.status !== 'pago') continue
      const k = m.metodo_pagamento || 'outro'
      const v = Number(m.valor_pago || m.valor || 0) - Number(m.desconto || 0)
      map.set(k, (map.get(k) || 0) + v)
    }
    return Array.from(map.entries())
      .map(([metodo, valor]) => ({ name: METODO_LABELS[metodo] || metodo, value: valor }))
      .sort((a, b) => b.value - a.value)
  }, [mensAll, refMes])

  // Bar — receita por instrumento (mês selecionado)
  const barInstrumento = useMemo(() => {
    const map = new Map<string, number>()
    for (const m of mensAll) {
      if (m.referencia !== refMes) continue
      if (m.status !== 'pago') continue
      const a = alunos.get(m.aluno_id)
      const inst = (a?.instrumento_interesse || 'Sem instrumento').split(/[,/]/)[0]?.trim() || 'Outros'
      const v = Number(m.valor_pago || m.valor || 0) - Number(m.desconto || 0)
      map.set(inst, (map.get(inst) || 0) + v)
    }
    return Array.from(map.entries())
      .map(([instrumento, valor]) => ({ instrumento, valor }))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 10)
  }, [mensAll, alunos, refMes])

  // Top inadimplentes (todas as mensalidades atrasadas)
  const topInadimplentes = useMemo<InadimplenteAgg[]>(() => {
    const map = new Map<string, InadimplenteAgg>()
    for (const m of mensAll) {
      if (m.status !== 'atrasado') continue
      const a = alunos.get(m.aluno_id)
      const agg = map.get(m.aluno_id) || {
        aluno_id: m.aluno_id,
        nome: a?.nome || '—',
        telefone: a?.telefone || null,
        qtd: 0,
        valor_total: 0,
        vencimento_mais_antigo: m.data_vencimento,
      }
      agg.qtd += 1
      agg.valor_total += Number(m.valor || 0) - Number(m.desconto || 0)
      if (m.data_vencimento < agg.vencimento_mais_antigo) agg.vencimento_mais_antigo = m.data_vencimento
      map.set(m.aluno_id, agg)
    }
    return Array.from(map.values()).sort((a, b) => b.valor_total - a.valor_total).slice(0, 10)
  }, [mensAll, alunos])

  const mesesDisponiveis = useMemo(() => resumos.map((r) => r.referencia).reverse(), [resumos])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard Financeiro</h1>
          <p className="text-gray-500">Receita, inadimplência e performance de mensalidades</p>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-gray-400" />
          <select
            value={refMes}
            onChange={(e) => setRefMes(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
          >
            {mesesDisponiveis.map((r) => (
              <option key={r} value={r}>{formatMes(r)}</option>
            ))}
          </select>
          <button
            onClick={loadAll}
            className="p-2 rounded-lg border border-gray-200 hover:bg-gray-50"
            title="Recarregar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi
          label="Recebido no mês"
          value={formatBRL(kpis.recebido)}
          icon={<Wallet className="w-5 h-5" />}
          tone="green"
        />
        <Kpi
          label="A receber"
          value={formatBRL(kpis.aReceber)}
          icon={<TrendingUp className="w-5 h-5" />}
          tone="blue"
        />
        <Kpi
          label={`Atrasado (${kpis.qtdAtrasados})`}
          value={formatBRL(kpis.valorAtrasado)}
          icon={<AlertTriangle className="w-5 h-5" />}
          tone="red"
        />
        <Kpi
          label="Ticket médio"
          value={formatBRL(kpis.ticketMedio)}
          icon={<DollarSign className="w-5 h-5" />}
          tone="purple"
        />
      </div>

      {/* Gráfico linha 12m */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Receita — últimos 12 meses</h2>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={serie12m}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" stroke="#6b7280" fontSize={12} />
            <YAxis stroke="#6b7280" fontSize={12} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => formatBRL(v)} />
            <Legend />
            <Line type="monotone" dataKey="Recebido" stroke={COLORS.pago} strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="A Receber" stroke={COLORS.pendente} strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Bar empilhada status */}
      <div className="bg-white rounded-xl shadow-sm border p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Mensalidades por status (qtd) — 12 meses</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={serieStatus}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" stroke="#6b7280" fontSize={12} />
            <YAxis stroke="#6b7280" fontSize={12} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Pagas" stackId="a" fill={COLORS.pago} />
            <Bar dataKey="Pendentes" stackId="a" fill={COLORS.pendente} />
            <Bar dataKey="Atrasadas" stackId="a" fill={COLORS.atrasado} />
            <Bar dataKey="Isentas" stackId="a" fill={COLORS.isento} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pie métodos */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Métodos de pagamento — {formatMes(refMes)}</h2>
          {pieMetodos.length === 0 ? (
            <div className="text-center text-gray-400 py-12">Nenhum pagamento registrado neste mês.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieMetodos}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  label={(e: any) => `${e.name}: ${formatBRL(e.value)}`}
                >
                  {pieMetodos.map((_, i) => (
                    <Cell key={i} fill={METODO_COLORS[i % METODO_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => formatBRL(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bar instrumentos */}
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Receita por instrumento — {formatMes(refMes)}</h2>
          {barInstrumento.length === 0 ? (
            <div className="text-center text-gray-400 py-12">Sem dados.</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={barInstrumento} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" stroke="#6b7280" fontSize={12} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} />
                <YAxis type="category" dataKey="instrumento" stroke="#6b7280" fontSize={12} width={110} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Bar dataKey="valor" fill="#2183a8" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Top inadimplentes */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold text-gray-900">Top 10 inadimplentes</h2>
          <p className="text-xs text-gray-500">Alunos com mensalidades em atraso (todas as referências)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3">Aluno</th>
                <th className="px-4 py-3 text-center">Mensalidades</th>
                <th className="px-4 py-3">Mais antiga</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {topInadimplentes.map((a) => (
                <tr key={a.aluno_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{a.nome}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-medium">
                      {a.qtd}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{formatBR(a.vencimento_mais_antigo)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">{formatBRL(a.valor_total)}</td>
                  <td className="px-4 py-3 text-right">
                    {a.telefone && (
                      <a
                        href={`https://wa.me/${a.telefone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                      >
                        WhatsApp
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {topInadimplentes.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                    Sem inadimplentes registrados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function Kpi({
  label,
  value,
  icon,
  tone,
}: {
  label: string
  value: string
  icon: React.ReactNode
  tone: 'green' | 'red' | 'blue' | 'purple'
}) {
  const cls = {
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
  }[tone]
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500 uppercase">{label}</p>
        <div className={`p-2 rounded-lg ${cls}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
