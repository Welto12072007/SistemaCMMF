import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Users,
  GraduationCap,
  BookOpen,
  DollarSign,
  TrendingUp,
  Calendar,
  PhoneForwarded,
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
} from 'recharts'
import type { Contato, AulaExperimental, Matricula } from '@/types'

const COLORS = ['#ef9a10', '#3b82f6', '#10b981', '#f43f5e', '#8b5cf6', '#06b6d4']

interface KPI {
  totalContatos: number
  totalExperimentais: number
  totalMatriculas: number
  faturamento: number
  conversaoExperimental: number
  conversaoMatricula: number
}

export default function Dashboard() {
  const [kpi, setKpi] = useState<KPI>({
    totalContatos: 0,
    totalExperimentais: 0,
    totalMatriculas: 0,
    faturamento: 0,
    conversaoExperimental: 0,
    conversaoMatricula: 0,
  })
  const [contatosPorCanal, setContatosPorCanal] = useState<{ name: string; value: number }[]>([])
  const [contatosPorInstrumento, setContatosPorInstrumento] = useState<{ name: string; value: number }[]>([])
  const [contatosRecentes, setContatosRecentes] = useState<Contato[]>([])
  const [proximasAulas, setProximasAulas] = useState<AulaExperimental[]>([])
  const [followups, setFollowups] = useState<Contato[]>([])

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    const { data: contatos } = await supabase
      .from('contatos')
      .select('*')
      .order('created_at', { ascending: false })

    const { data: experimentais } = await supabase
      .from('aulas_experimentais')
      .select('*, contato:contatos(*), professor:professores(*)')
      .order('data', { ascending: true })

    const { data: matriculas } = await supabase
      .from('matriculas')
      .select('*')

    if (contatos) {
      setKpi({
        totalContatos: contatos.length,
        totalExperimentais: experimentais?.length ?? 0,
        totalMatriculas: matriculas?.length ?? 0,
        faturamento: matriculas?.reduce((acc, m) => acc + (m.taxa_matricula || 0) + (m.valor_plano || 0), 0) ?? 0,
        conversaoExperimental: contatos.length > 0 ? ((experimentais?.length ?? 0) / contatos.length) * 100 : 0,
        conversaoMatricula: (experimentais?.length ?? 0) > 0 ? ((matriculas?.length ?? 0) / (experimentais?.length ?? 1)) * 100 : 0,
      })

      // Por canal
      const canais: Record<string, number> = {}
      contatos.forEach((c) => {
        canais[c.canal_origem] = (canais[c.canal_origem] || 0) + 1
      })
      setContatosPorCanal(Object.entries(canais).map(([name, value]) => ({ name, value })))

      // Por instrumento
      const instrumentos: Record<string, number> = {}
      contatos.forEach((c) => {
        instrumentos[c.instrumento] = (instrumentos[c.instrumento] || 0) + 1
      })
      setContatosPorInstrumento(Object.entries(instrumentos).map(([name, value]) => ({ name, value })))

      // Recentes
      setContatosRecentes(contatos.slice(0, 5))

      // Follow-ups
      setFollowups(contatos.filter((c) => ['Em Follow-up', 'Primeiro Contato', 'Aguardando Experimental'].includes(c.status)))
    }

    if (experimentais) {
      setProximasAulas(
        experimentais.filter((a) => a.status === 'Agendada').slice(0, 5)
      )
    }
  }

  const statusColor: Record<string, string> = {
    'Primeiro Contato': 'bg-blue-100 text-blue-800',
    'Aguardando Experimental': 'bg-yellow-100 text-yellow-800',
    'Aula Experimental Marcada': 'bg-orange-100 text-orange-800',
    'Em Follow-up': 'bg-purple-100 text-purple-800',
    'Matriculado': 'bg-green-100 text-green-800',
    'Perdido': 'bg-red-100 text-red-800',
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Visão geral do fluxo comercial do CMMF</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          icon={<Users className="w-5 h-5" />}
          label="Total de Contatos"
          value={kpi.totalContatos.toString()}
          sub="Este mês"
          color="text-blue-600 bg-blue-50"
        />
        <KPICard
          icon={<GraduationCap className="w-5 h-5" />}
          label="Aulas Experimentais"
          value={kpi.totalExperimentais.toString()}
          sub={`${kpi.conversaoExperimental.toFixed(1)}% de conversão`}
          color="text-orange-600 bg-orange-50"
        />
        <KPICard
          icon={<BookOpen className="w-5 h-5" />}
          label="Matrículas"
          value={kpi.totalMatriculas.toString()}
          sub={`${kpi.conversaoMatricula.toFixed(1)}% de conversão`}
          color="text-green-600 bg-green-50"
        />
        <KPICard
          icon={<DollarSign className="w-5 h-5" />}
          label="Faturamento"
          value={`R$ ${kpi.faturamento.toLocaleString('pt-BR')}`}
          sub="Taxa + primeiro mês"
          color="text-brand-600 bg-brand-50"
        />
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
                <Pie data={contatosPorCanal} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
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
          <h3 className="font-semibold text-gray-900 mb-1">Contatos por Instrumento</h3>
          <p className="text-sm text-gray-500 mb-4">Interesse por curso</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={contatosPorInstrumento} layout="vertical">
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={80} />
                <Tooltip />
                <Bar dataKey="value" fill="#ef9a10" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
                  <p className="text-xs text-gray-500">{c.instrumento}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${statusColor[c.status] ?? 'bg-gray-100 text-gray-800'}`}>
                  {c.status}
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
                  <p className="text-sm font-medium">{a.contato?.nome ?? '—'}</p>
                  <p className="text-xs text-gray-500">{a.instrumento}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">
                    {new Date(a.data).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </p>
                  <p className="text-xs text-gray-500">{a.horario}</p>
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
                  <p className="text-xs text-gray-500">{c.instrumento}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${statusColor[c.status] ?? 'bg-gray-100 text-gray-800'}`}>
                  {c.status}
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

function KPICard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
        <TrendingUp className="w-3 h-3" />
        {sub}
      </p>
    </div>
  )
}
