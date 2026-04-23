import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { DollarSign, CheckCircle2, Clock, AlertTriangle, Plus, Search, Download } from 'lucide-react'

interface Mensalidade {
  id: string
  aluno_id: string
  aluno_nome: string
  aluno_telefone: string | null
  aluno_email: string | null
  aluno_instrumento: string | null
  referencia: string
  valor: number
  desconto: number
  valor_pago: number | null
  data_vencimento: string
  data_pagamento: string | null
  status: 'pendente' | 'pago' | 'atrasado' | 'isento' | 'cancelado'
  metodo_pagamento: string | null
  observacoes: string | null
}

const STATUS_OPTIONS = ['pendente', 'pago', 'atrasado', 'isento', 'cancelado'] as const
const METODOS = ['pix', 'dinheiro', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro'] as const

const STATUS_BADGE: Record<string, string> = {
  pago: 'bg-green-100 text-green-800',
  pendente: 'bg-yellow-100 text-yellow-800',
  atrasado: 'bg-red-100 text-red-800',
  isento: 'bg-blue-100 text-blue-800',
  cancelado: 'bg-gray-100 text-gray-800',
}

function mesAtualISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatBR(date: string | null) {
  if (!date) return '-'
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function Mensalidades() {
  const [items, setItems] = useState<Mensalidade[]>([])
  const [loading, setLoading] = useState(false)
  const [filtroMes, setFiltroMes] = useState<string>(mesAtualISO())
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [busca, setBusca] = useState('')
  const [editando, setEditando] = useState<Mensalidade | null>(null)
  const [gerandoMes, setGerandoMes] = useState(false)

  useEffect(() => {
    loadMensalidades()
  }, [filtroMes])

  async function loadMensalidades() {
    setLoading(true)
    const ref = `${filtroMes}-01`
    const { data, error } = await supabase
      .from('vw_mensalidades_aluno')
      .select('*')
      .eq('referencia', ref)
      .order('aluno_nome', { ascending: true })
    if (error) {
      console.error('[Mensalidades] load error:', error)
      alert(`Erro ao carregar mensalidades:\n${error.message}`)
    }
    setItems((data as Mensalidade[]) || [])
    setLoading(false)
  }

  async function gerarMensalidadesDoMes() {
    if (!confirm(`Gerar mensalidades pendentes para ${filtroMes} (todos os alunos ativos)?`)) return
    setGerandoMes(true)
    const ref = `${filtroMes}-01`
    const { data, error } = await supabase.rpc('gerar_mensalidades_mes', {
      p_referencia: ref,
      p_dia_vencimento: 10,
    })
    setGerandoMes(false)
    if (error) {
      console.error('[Mensalidades] gerar error:', error)
      alert(`Erro ao gerar mensalidades:\n${error.message}`)
      return
    }
    const r = (data as { criadas: number; ja_existiam: number; sem_valor_plano: number }) || {
      criadas: 0,
      ja_existiam: 0,
      sem_valor_plano: 0,
    }
    alert(
      `Geração concluída:\n\n✓ Criadas: ${r.criadas}\n• Já existiam: ${r.ja_existiam}\n• Sem valor_plano (puladas): ${r.sem_valor_plano}`,
    )
    loadMensalidades()
  }

  async function marcarPago(m: Mensalidade) {
    const hoje = new Date().toISOString().slice(0, 10)
    const { error } = await supabase
      .from('mensalidades')
      .update({
        status: 'pago',
        data_pagamento: hoje,
        valor_pago: m.valor - m.desconto,
        metodo_pagamento: m.metodo_pagamento || 'pix',
      })
      .eq('id', m.id)
    if (error) {
      alert(`Erro ao marcar pago:\n${error.message}`)
      return
    }
    loadMensalidades()
  }

  async function salvarEdicao(form: Partial<Mensalidade>) {
    if (!editando) return
    const { error } = await supabase
      .from('mensalidades')
      .update({
        valor: form.valor,
        desconto: form.desconto,
        valor_pago: form.valor_pago,
        data_vencimento: form.data_vencimento,
        data_pagamento: form.data_pagamento || null,
        status: form.status,
        metodo_pagamento: form.metodo_pagamento || null,
        observacoes: form.observacoes || null,
      })
      .eq('id', editando.id)
    if (error) {
      alert(`Erro ao salvar:\n${error.message}`)
      return
    }
    setEditando(null)
    loadMensalidades()
  }

  const filtered = useMemo(() => {
    return items.filter((m) => {
      if (filtroStatus !== 'todos' && m.status !== filtroStatus) return false
      if (busca) {
        const t = busca.toLowerCase()
        if (
          !m.aluno_nome?.toLowerCase().includes(t) &&
          !m.aluno_telefone?.includes(t) &&
          !m.aluno_email?.toLowerCase().includes(t)
        )
          return false
      }
      return true
    })
  }, [items, filtroStatus, busca])

  const kpis = useMemo(() => {
    const total = items.length
    const pagas = items.filter((m) => m.status === 'pago').length
    const pendentes = items.filter((m) => m.status === 'pendente').length
    const atrasadas = items.filter((m) => m.status === 'atrasado').length
    const recebido = items
      .filter((m) => m.status === 'pago')
      .reduce((s, m) => s + (m.valor - m.desconto), 0)
    const aReceber = items
      .filter((m) => m.status === 'pendente' || m.status === 'atrasado')
      .reduce((s, m) => s + (m.valor - m.desconto), 0)
    return { total, pagas, pendentes, atrasadas, recebido, aReceber }
  }, [items])

  function exportarCSV() {
    const header = ['Aluno', 'Telefone', 'Instrumento', 'Referência', 'Vencimento', 'Valor', 'Desconto', 'Pago', 'Status', 'Método', 'Pagamento']
    const rows = filtered.map((m) => [
      m.aluno_nome,
      m.aluno_telefone || '',
      m.aluno_instrumento || '',
      m.referencia,
      m.data_vencimento,
      m.valor.toFixed(2),
      m.desconto.toFixed(2),
      m.valor_pago?.toFixed(2) || '',
      m.status,
      m.metodo_pagamento || '',
      m.data_pagamento || '',
    ])
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mensalidades-${filtroMes}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mensalidades</h1>
          <p className="text-gray-500">Cobrança recorrente dos alunos ativos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportarCSV}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Exportar CSV
          </button>
          <button
            onClick={gerarMensalidadesDoMes}
            disabled={gerandoMes}
            className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {gerandoMes ? 'Gerando...' : `Gerar mês ${filtroMes}`}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Total" value={String(kpis.total)} icon={<DollarSign className="w-4 h-4" />} />
        <KpiCard label="Pagas" value={String(kpis.pagas)} icon={<CheckCircle2 className="w-4 h-4 text-green-600" />} color="text-green-700" />
        <KpiCard label="Pendentes" value={String(kpis.pendentes)} icon={<Clock className="w-4 h-4 text-yellow-600" />} color="text-yellow-700" />
        <KpiCard label="Atrasadas" value={String(kpis.atrasadas)} icon={<AlertTriangle className="w-4 h-4 text-red-600" />} color="text-red-700" />
        <KpiCard label="Recebido" value={brl(kpis.recebido)} icon={<DollarSign className="w-4 h-4 text-green-600" />} color="text-green-700" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="month"
          value={filtroMes}
          onChange={(e) => setFiltroMes(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm"
        />
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm"
        >
          <option value="todos">Todos os status</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar aluno, telefone, e-mail..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm"
          />
        </div>
        <span className="text-sm text-gray-500">
          A receber: <strong>{brl(kpis.aReceber)}</strong>
        </span>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Nenhuma mensalidade para este filtro. Use o botão "Gerar mês" para criar.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3">Aluno</th>
                <th className="px-4 py-3">Instrumento</th>
                <th className="px-4 py-3">Vencimento</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Pagamento</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((m) => {
                const liquido = m.valor - m.desconto
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{m.aluno_nome}</div>
                      <div className="text-xs text-gray-500">{m.aluno_telefone || ''}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{m.aluno_instrumento || '-'}</td>
                    <td className="px-4 py-3 text-gray-700">{formatBR(m.data_vencimento)}</td>
                    <td className="px-4 py-3 text-gray-900">
                      {brl(liquido)}
                      {m.desconto > 0 && (
                        <div className="text-xs text-gray-500">desc. {brl(m.desconto)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[m.status]}`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {m.data_pagamento ? (
                        <>
                          {formatBR(m.data_pagamento)}
                          <div className="text-xs text-gray-500">{m.metodo_pagamento}</div>
                        </>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {m.status !== 'pago' && (
                          <button
                            onClick={() => marcarPago(m)}
                            className="text-xs px-3 py-1.5 rounded bg-green-100 text-green-800 hover:bg-green-200"
                          >
                            Marcar pago
                          </button>
                        )}
                        <button
                          onClick={() => setEditando(m)}
                          className="text-xs px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                        >
                          Editar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {editando && (
        <EditarMensalidadeModal
          m={editando}
          onClose={() => setEditando(null)}
          onSave={salvarEdicao}
        />
      )}
    </div>
  )
}

function KpiCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color?: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border p-5">
      <div className="flex items-center gap-2 mb-2 text-gray-500">
        {icon}
        <span className="text-sm">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color || 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function EditarMensalidadeModal({
  m,
  onClose,
  onSave,
}: {
  m: Mensalidade
  onClose: () => void
  onSave: (form: Partial<Mensalidade>) => void
}) {
  const [form, setForm] = useState<Partial<Mensalidade>>({
    valor: m.valor,
    desconto: m.desconto,
    valor_pago: m.valor_pago ?? undefined,
    data_vencimento: m.data_vencimento,
    data_pagamento: m.data_pagamento ?? '',
    status: m.status,
    metodo_pagamento: m.metodo_pagamento ?? '',
    observacoes: m.observacoes ?? '',
  })

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b">
          <h2 className="text-lg font-semibold">Editar mensalidade</h2>
          <p className="text-sm text-gray-500">{m.aluno_nome} — referência {m.referencia}</p>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (R$)">
              <input
                type="number"
                step="0.01"
                value={form.valor ?? ''}
                onChange={(e) => setForm({ ...form, valor: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded"
              />
            </Field>
            <Field label="Desconto (R$)">
              <input
                type="number"
                step="0.01"
                value={form.desconto ?? 0}
                onChange={(e) => setForm({ ...form, desconto: parseFloat(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded"
              />
            </Field>
          </div>
          <Field label="Vencimento">
            <input
              type="date"
              value={form.data_vencimento ?? ''}
              onChange={(e) => setForm({ ...form, data_vencimento: e.target.value })}
              className="w-full px-3 py-2 border rounded"
            />
          </Field>
          <Field label="Status">
            <select
              value={form.status ?? 'pendente'}
              onChange={(e) => setForm({ ...form, status: e.target.value as Mensalidade['status'] })}
              className="w-full px-3 py-2 border rounded"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          {(form.status === 'pago') && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Data pagamento">
                  <input
                    type="date"
                    value={form.data_pagamento ?? ''}
                    onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })}
                    className="w-full px-3 py-2 border rounded"
                  />
                </Field>
                <Field label="Valor pago (R$)">
                  <input
                    type="number"
                    step="0.01"
                    value={form.valor_pago ?? ''}
                    onChange={(e) => setForm({ ...form, valor_pago: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-2 border rounded"
                  />
                </Field>
              </div>
              <Field label="Método">
                <select
                  value={form.metodo_pagamento ?? ''}
                  onChange={(e) => setForm({ ...form, metodo_pagamento: e.target.value })}
                  className="w-full px-3 py-2 border rounded"
                >
                  <option value="">—</option>
                  {METODOS.map((mt) => (
                    <option key={mt} value={mt}>
                      {mt}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          <Field label="Observações">
            <textarea
              value={form.observacoes ?? ''}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border rounded"
            />
          </Field>
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">
            Cancelar
          </button>
          <button
            onClick={() => onSave(form)}
            className="px-4 py-2 bg-brand-500 text-white rounded hover:bg-brand-600"
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  )
}
