import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Users,
  GraduationCap,
  BookOpen,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  PhoneForwarded,
  Target,
  UserCheck,
  Bot,
  ArrowRight,
  MessageSquare,
  Building2,
  BarChart2,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  CartesianGrid,
} from 'recharts'
import type { Contato, AulaExperimental } from '@/types'

const COLORS = ['#2183a8', '#7ed9ed', '#10b981', '#f43f5e', '#155a76', '#06b6d4']

interface FunnelKPIs {
  // Topo do funil
  leadsRecebidos: number
  leadsMesAnterior: number
  // Qualificação
  leadsQualificados: number
  taxaQualificacao: number
  // Agendamento
  aulasAgendadas: number
  taxaAgendamento: number
  // Comparecimento
  aulasRealizadas: number
  taxaComparecimento: number
  // Conversão
  matriculasNovas: number
  taxaConversao: number
  // Retenção / Faturamento
  faturamentoTotal: number
  ticketMedio: number
  // AI
  totalConversas: number
  intencoesPrincipais: { name: string; value: number }[]
}

const defaultKPIs: FunnelKPIs = {
  leadsRecebidos: 0,
  leadsMesAnterior: 0,
  leadsQualificados: 0,
  taxaQualificacao: 0,
  aulasAgendadas: 0,
  taxaAgendamento: 0,
  aulasRealizadas: 0,
  taxaComparecimento: 0,
  matriculasNovas: 0,
  taxaConversao: 0,
  faturamentoTotal: 0,
  ticketMedio: 0,
  totalConversas: 0,
  intencoesPrincipais: [],
}

export default function Dashboard() {
  const [kpi, setKpi] = useState<FunnelKPIs>(defaultKPIs)
  const [contatosPorCanal, setContatosPorCanal] = useState<{ name: string; value: number }[]>([])
  const [contatosPorInstrumento, setContatosPorInstrumento] = useState<{ name: string; value: number }[]>([])
  const [leadsTimeline, setLeadsTimeline] = useState<{ date: string; leads: number; agendadas: number }[]>([])
  const [contatosRecentes, setContatosRecentes] = useState<Contato[]>([])
  const [proximasAulas, setProximasAulas] = useState<AulaExperimental[]>([])
  const [followups, setFollowups] = useState<Contato[]>([])
  const [funnelData, setFunnelData] = useState<{ stage: string; value: number; color: string }[]>([])
  const [ocupacao, setOcupacao] = useState({ total: 0, ocupados: 0, disponiveis: 0, taxa: 0 })
  const [ocupacaoPorProf, setOcupacaoPorProf] = useState<{ name: string; ocupados: number; total: number; taxa: number }[]>([])
  const [totalAlunosAtivos, setTotalAlunosAtivos] = useState(0)

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    const now = new Date()
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()

    const [
      { data: contatos },
      { data: experimentais },
      { data: conversas },
      { data: contatosMesAnterior },
      { data: horarios },
      { data: professores },
    ] = await Promise.all([
      supabase.from('alunos').select('*').order('created_at', { ascending: false }),
      supabase.from('aulas_experimentais').select('*, professor:professores(*)').order('data_aula', { ascending: true }),
      supabase.from('conversas').select('intencao, created_at').gte('created_at', firstOfMonth),
      supabase.from('alunos').select('id').gte('created_at', firstOfLastMonth).lt('created_at', firstOfMonth),
      supabase.from('horarios').select('*, professor:professores(nome)'),
      supabase.from('professores').select('id, nome').eq('ativo', true),
    ])

    if (!contatos) return

    // Alunos ativos
    const ativos = contatos.filter(c => c.status === 'ativo').length
    setTotalAlunosAtivos(ativos)

    // Taxa de ocupação
    if (horarios) {
      const slotsUteis = horarios.filter((h: { status: string }) => h.status !== 'indisponivel')
      const ocupados = slotsUteis.filter((h: { status: string }) => h.status === 'ocupado')
      const taxa = slotsUteis.length > 0 ? (ocupados.length / slotsUteis.length) * 100 : 0
      setOcupacao({ total: slotsUteis.length, ocupados: ocupados.length, disponiveis: slotsUteis.length - ocupados.length, taxa })

      // Por professor
      const profMap: Record<string, { ocupados: number; total: number }> = {}
      slotsUteis.forEach((h: { professor: { nome: string } | null; status: string }) => {
        const nome = h.professor?.nome || 'Desconhecido'
        if (!profMap[nome]) profMap[nome] = { ocupados: 0, total: 0 }
        profMap[nome].total++
        if (h.status === 'ocupado') profMap[nome].ocupados++
      })
      setOcupacaoPorProf(
        Object.entries(profMap)
          .map(([name, v]) => ({ name, ...v, taxa: v.total > 0 ? (v.ocupados / v.total) * 100 : 0 }))
          .sort((a, b) => b.taxa - a.taxa)
      )
    }

    const leadsEste = contatos.filter(c => c.created_at && c.created_at >= firstOfMonth).length
    const leadsMesAnt = contatosMesAnterior?.length ?? 0
    const qualificados = contatos.filter(c => c.status && !['lead', 'perdido'].includes(c.status)).length
    const agendadas = experimentais?.length ?? 0
    const realizadas = experimentais?.filter(a => ['concluido', 'pago'].includes(a.status)).length ?? 0
    const matriculados = contatos.filter(c => c.status === 'ativo')
    const matriculasCount = matriculados.length
    const totalFat = matriculados.reduce((acc, m) => acc + (m.taxa_matricula || 0) + (m.valor_plano || 0), 0)

    // Intenções da IA
    const intencoes: Record<string, number> = {}
    conversas?.forEach(c => {
      if (c.intencao) {
        intencoes[c.intencao] = (intencoes[c.intencao] || 0) + 1
      }
    })
    const intencoesSorted = Object.entries(intencoes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value }))

    setKpi({
      leadsRecebidos: leadsEste,
      leadsMesAnterior: leadsMesAnt,
      leadsQualificados: qualificados,
      taxaQualificacao: contatos.length > 0 ? (qualificados / contatos.length) * 100 : 0,
      aulasAgendadas: agendadas,
      taxaAgendamento: contatos.length > 0 ? (agendadas / contatos.length) * 100 : 0,
      aulasRealizadas: realizadas,
      taxaComparecimento: agendadas > 0 ? (realizadas / agendadas) * 100 : 0,
      matriculasNovas: matriculasCount,
      taxaConversao: realizadas > 0 ? (matriculasCount / realizadas) * 100 : 0,
      faturamentoTotal: totalFat,
      ticketMedio: matriculasCount > 0 ? totalFat / matriculasCount : 0,
      totalConversas: conversas?.length ?? 0,
      intencoesPrincipais: intencoesSorted,
    })

    // Funnel data
    setFunnelData([
      { stage: 'Leads', value: contatos.length, color: '#D8F4FF' },
      { stage: 'Qualificados', value: qualificados, color: '#7ED9ED' },
      { stage: 'Agendados', value: agendadas, color: '#2183A8' },
      { stage: 'Compareceram', value: realizadas, color: '#155A76' },
      { stage: 'Matriculados', value: matriculasCount, color: '#0C3549' },
    ])

    // Por canal
    const canais: Record<string, number> = {}
    contatos.forEach((c) => {
      const canal = c.origem || 'WhatsApp'
      canais[canal] = (canais[canal] || 0) + 1
    })
    setContatosPorCanal(Object.entries(canais).map(([name, value]) => ({ name, value })))

    // Por instrumento
    const instrumentos: Record<string, number> = {}
    contatos.forEach((c) => {
      const inst = c.instrumento_interesse || 'Não definido'
      instrumentos[inst] = (instrumentos[inst] || 0) + 1
    })
    setContatosPorInstrumento(
      Object.entries(instrumentos)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value }))
    )

    // Timeline (últimos 30 dias)
    const timeline: Record<string, { leads: number; agendadas: number }> = {}
    for (let d = 29; d >= 0; d--) {
      const date = new Date(now)
      date.setDate(date.getDate() - d)
      const key = date.toISOString().slice(0, 10)
      timeline[key] = { leads: 0, agendadas: 0 }
    }
    contatos.forEach(c => {
      const day = c.created_at?.slice(0, 10)
      if (day && timeline[day]) timeline[day].leads++
    })
    experimentais?.forEach(a => {
      const day = a.created_at?.slice(0, 10)
      if (day && timeline[day]) timeline[day].agendadas++
    })
    setLeadsTimeline(
      Object.entries(timeline).map(([date, vals]) => ({
        date: new Date(date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        ...vals,
      }))
    )

    // Recentes
    setContatosRecentes(contatos.slice(0, 5))

    // Follow-ups
    setFollowups(
      contatos.filter(c =>
        ['Em Follow-up', 'Primeiro Contato', 'Aguardando Experimental', 'lead', 'qualificado'].includes(c.status || '')
      )
    )

    // Próximas aulas
    if (experimentais) {
      setProximasAulas(
        experimentais
          .filter(a => ['aguardando_professor', 'confirmado_professor', 'aguardando_pagamento', 'pago'].includes(a.status))
          .slice(0, 5)
      )
    }
  }

  const statusColor: Record<string, string> = {
    lead: 'bg-blue-100 text-blue-800',
    qualificado: 'bg-cyan-100 text-cyan-800',
    experimental_agendada: 'bg-brand-50 text-brand-800',
    matriculado: 'bg-green-100 text-green-800',
    perdido: 'bg-red-100 text-red-800',
  }

  const leadDelta = kpi.leadsMesAnterior > 0
    ? ((kpi.leadsRecebidos - kpi.leadsMesAnterior) / kpi.leadsMesAnterior) * 100
    : 0
  const leadUp = leadDelta >= 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500">Funil comercial do Centro de Música Murilo Finger</p>
        </div>
        <button
          onClick={loadDashboard}
          className="text-sm bg-brand-500 text-white px-4 py-2 rounded-lg hover:bg-brand-600 transition-colors"
        >
          Atualizar
        </button>
      </div>

      {/* Top 5 KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard
          icon={<Users className="w-5 h-5" />}
          label="Leads Recebidos"
          value={kpi.leadsRecebidos.toString()}
          sub={
            leadUp
              ? `+${leadDelta.toFixed(0)}% vs mês anterior`
              : `${leadDelta.toFixed(0)}% vs mês anterior`
          }
          trend={leadUp}
          color="text-brand-600 bg-brand-50"
        />
        <KPICard
          icon={<Target className="w-5 h-5" />}
          label="Taxa Agendamento"
          value={`${kpi.taxaAgendamento.toFixed(1)}%`}
          sub={`${kpi.aulasAgendadas} aulas agendadas`}
          trend={kpi.taxaAgendamento > 30}
          color="text-cyan-600 bg-cyan-50"
        />
        <KPICard
          icon={<UserCheck className="w-5 h-5" />}
          label="Taxa Comparecimento"
          value={`${kpi.taxaComparecimento.toFixed(1)}%`}
          sub={`${kpi.aulasRealizadas} aulas realizadas`}
          trend={kpi.taxaComparecimento > 60}
          color="text-teal-600 bg-teal-50"
        />
        <KPICard
          icon={<BookOpen className="w-5 h-5" />}
          label="Taxa Conversão"
          value={`${kpi.taxaConversao.toFixed(1)}%`}
          sub={`${kpi.matriculasNovas} matrículas`}
          trend={kpi.taxaConversao > 40}
          color="text-green-600 bg-green-50"
        />
        <KPICard
          icon={<DollarSign className="w-5 h-5" />}
          label="Ticket Médio"
          value={`R$ ${kpi.ticketMedio.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`}
          sub={`Fat. total: R$ ${kpi.faturamentoTotal.toLocaleString('pt-BR')}`}
          trend={true}
          color="text-brand-700 bg-brand-50"
        />
      </div>

      {/* Ocupação e Alunos Ativos */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Alunos Ativos</span>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-green-600 bg-green-50"><Users className="w-5 h-5" /></div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{totalAlunosAtivos}</p>
          <p className="text-xs text-gray-500 mt-1">Matriculados no centro</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Taxa de Ocupação</span>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-brand-600 bg-brand-50"><Building2 className="w-5 h-5" /></div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{ocupacao.taxa.toFixed(1)}%</p>
          <p className="text-xs text-gray-500 mt-1">{ocupacao.ocupados} de {ocupacao.total} horários</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Horários Ocupados</span>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-blue-600 bg-blue-50"><BarChart2 className="w-5 h-5" /></div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{ocupacao.ocupados}</p>
          <p className="text-xs text-gray-500 mt-1">Slots com aluno</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">Horários Disponíveis</span>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center text-emerald-600 bg-emerald-50"><Calendar className="w-5 h-5" /></div>
          </div>
          <p className="text-2xl font-bold text-gray-900">{ocupacao.disponiveis}</p>
          <p className="text-xs text-gray-500 mt-1">Vagas abertas</p>
        </div>
      </div>

      {/* Funnel Visualization */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-1">Funil de Conversão</h3>
        <p className="text-sm text-gray-500 mb-5">Lead → Qualificação → Agendamento → Comparecimento → Matrícula</p>
        <div className="flex items-end gap-2 justify-center h-40">
          {funnelData.map((stage, i) => {
            const maxVal = funnelData[0]?.value || 1
            const height = Math.max(20, (stage.value / maxVal) * 100)
            return (
              <div key={stage.stage} className="flex flex-col items-center gap-2 flex-1">
                <span className="text-sm font-bold text-gray-900">{stage.value}</span>
                <div
                  className="w-full rounded-t-lg transition-all duration-500"
                  style={{ height: `${height}%`, backgroundColor: stage.color }}
                />
                <span className="text-xs text-gray-600 text-center">{stage.stage}</span>
                {i < funnelData.length - 1 && funnelData[i + 1] && (
                  <span className="text-[10px] text-gray-400">
                    {stage.value > 0
                      ? `${((funnelData[i + 1]!.value / stage.value) * 100).toFixed(0)}%`
                      : '—'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Timeline + AI Metrics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leads Over Time */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 mb-1">Leads & Agendamentos</h3>
          <p className="text-sm text-gray-500 mb-4">Últimos 30 dias</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={leadsTimeline}>
                <defs>
                  <linearGradient id="gradLeads" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2183a8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2183a8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradAgend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7ed9ed" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7ed9ed" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="leads"
                  stroke="#2183a8"
                  fill="url(#gradLeads)"
                  strokeWidth={2}
                  name="Leads"
                />
                <Area
                  type="monotone"
                  dataKey="agendadas"
                  stroke="#7ed9ed"
                  fill="url(#gradAgend)"
                  strokeWidth={2}
                  name="Agendadas"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* AI Metrics */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
            <Bot className="w-4 h-4 text-brand-500" />
            Métricas da IA (Antonia)
          </h3>
          <p className="text-sm text-gray-500 mb-4">Este mês</p>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Conversas processadas</span>
              <span className="text-sm font-bold text-brand-700">{kpi.totalConversas}</span>
            </div>

            {kpi.intencoesPrincipais.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider">Intenções detectadas</p>
                <div className="space-y-2">
                  {kpi.intencoesPrincipais.map((int, i) => (
                    <div key={int.name} className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-gray-700 capitalize">{int.name}</span>
                          <span className="text-gray-500">{int.value}</span>
                        </div>
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${(int.value / (kpi.intencoesPrincipais[0]?.value || 1)) * 100}%`,
                              backgroundColor: COLORS[i % COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {kpi.intencoesPrincipais.length === 0 && (
              <p className="text-sm text-gray-400 italic">Sem dados de intenção ainda</p>
            )}
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Por Canal */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 mb-1">Contatos por Canal</h3>
          <p className="text-sm text-gray-500 mb-4">Origem dos leads</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={contatosPorCanal}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {contatosPorCanal.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Por Instrumento */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 mb-1">Demanda por Instrumento</h3>
          <p className="text-sm text-gray-500 mb-4">Interesse dos leads</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={contatosPorInstrumento} layout="vertical">
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#2183a8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Ocupação por Professor */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Building2 className="w-4 h-4 text-brand-500" />
          Ocupação por Professor
        </h3>
        <p className="text-sm text-gray-500 mb-4">Taxa de preenchimento dos horários</p>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={ocupacaoPorProf} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
              <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(value: number) => `${value.toFixed(1)}%`} />
              <Bar dataKey="taxa" fill="#2183a8" radius={[0, 4, 4, 0]} name="Ocupação" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contatos Recentes */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-500" />
            Contatos Recentes
          </h3>
          <div className="space-y-3">
            {contatosRecentes.map((c) => (
              <div key={c.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{c.nome}</p>
                  <p className="text-xs text-gray-500">{c.instrumento_interesse || '—'}</p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${statusColor[c.status ?? ''] ?? 'bg-gray-100 text-gray-800'}`}
                >
                  {c.status || '—'}
                </span>
              </div>
            ))}
            {contatosRecentes.length === 0 && (
              <p className="text-sm text-gray-400">Nenhum contato ainda</p>
            )}
          </div>
        </div>

        {/* Próximas Aulas */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand-500" />
            Próximas Aulas Experimentais
          </h3>
          <div className="space-y-3">
            {proximasAulas.map((a) => (
              <div key={a.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{a.nome ?? '—'}</p>
                  <p className="text-xs text-gray-500">{a.instrumento}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">
                    {new Date(a.data_aula + 'T12:00:00').toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                    })}
                  </p>
                  <p className="text-xs text-gray-500">{a.hora_inicio}</p>
                </div>
              </div>
            ))}
            {proximasAulas.length === 0 && (
              <p className="text-sm text-gray-400">Nenhuma aula agendada</p>
            )}
          </div>
        </div>

        {/* Follow-ups */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <PhoneForwarded className="w-4 h-4 text-brand-500" />
            Aguardando Follow-up
          </h3>
          <div className="space-y-3">
            {followups.slice(0, 5).map((c) => (
              <div key={c.id} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{c.nome}</p>
                  <p className="text-xs text-gray-500">{c.instrumento_interesse || '—'}</p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full ${statusColor[c.status ?? ''] ?? 'bg-gray-100 text-gray-800'}`}
                >
                  {c.status || '—'}
                </span>
              </div>
            ))}
            {followups.length === 0 && (
              <p className="text-sm text-gray-400">Nenhum follow-up pendente</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function KPICard({
  icon,
  label,
  value,
  sub,
  trend,
  color,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub: string
  trend: boolean
  color: string
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>{icon}</div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
        {trend ? (
          <TrendingUp className="w-3 h-3 text-green-500" />
        ) : (
          <TrendingDown className="w-3 h-3 text-red-400" />
        )}
        {sub}
      </p>
    </div>
  )
}
