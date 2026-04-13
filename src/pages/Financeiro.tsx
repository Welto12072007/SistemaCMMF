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

export default function Financeiro() {
  const [mesAtual, setMesAtual] = useState(new Date().getMonth() + 1)
  const [anoAtual, setAnoAtual] = useState(new Date().getFullYear())
  const [entradas, setEntradas] = useState<FluxoItem[]>([])
  const [saidas, setSaidas] = useState<FluxoItem[]>([])
  const [resumoAnual, setResumoAnual] = useState<{ mes: string; entradas: number; saidas: number; saldo: number }[]>([])
  const [showForm, setShowForm] = useState<'entrada' | 'saida' | null>(null)
  const [totalMatriculas, setTotalMatriculas] = useState(0)
  const [faturamentoMes, setFaturamentoMes] = useState(0)

  useEffect(() => {
    loadFluxo()
    loadResumoAnual()
    loadFaturamento()
  }, [mesAtual, anoAtual])

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
