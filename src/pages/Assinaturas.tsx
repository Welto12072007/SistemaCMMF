import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { RefreshCw, Plus, Search, Trash2, Edit3, CreditCard, QrCode, Calendar, DollarSign, CheckCircle2, XCircle, Pause, ExternalLink, UserPlus } from 'lucide-react'

interface AsaasSubscription {
  id: string
  customer: string
  billingType: string
  value: number
  nextDueDate: string
  cycle: string
  status: string
  description: string
  externalReference: string
  dateCreated: string
  // Enriquecido pelo backend
  aluno?: {
    id: string
    nome: string
    telefone: string | null
    instrumento_interesse: string | null
    valor_plano: number | null
    status: string | null
  } | null
}

interface AlunoSimples {
  id: string
  nome: string
  telefone: string | null
  instrumento_interesse: string | null
  valor_plano: number | null
  cpf: string | null
  asaas_subscription_id: string | null
}

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  INACTIVE: 'bg-gray-100 text-gray-800',
  EXPIRED: 'bg-red-100 text-red-800',
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Ativa',
  INACTIVE: 'Inativa',
  EXPIRED: 'Expirada',
}

const BILLING_ICON: Record<string, React.ReactNode> = {
  CREDIT_CARD: <CreditCard className="w-4 h-4 text-purple-600" />,
  PIX: <QrCode className="w-4 h-4 text-green-600" />,
  UNDEFINED: <DollarSign className="w-4 h-4 text-gray-600" />,
  BOLETO: <DollarSign className="w-4 h-4 text-blue-600" />,
}

function brl(v: number) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatBR(date: string | null) {
  if (!date) return '—'
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

export default function Assinaturas() {
  const [subs, setSubs] = useState<AsaasSubscription[]>([])
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('ACTIVE')
  const [criarModal, setCriarModal] = useState(false)
  const [editModal, setEditModal] = useState<AsaasSubscription | null>(null)

  useEffect(() => { loadSubscriptions() }, [])

  async function loadSubscriptions() {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-subscriptions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ action: 'list', limit: 100 }),
        }
      )
      const result = await resp.json()
      if (result.ok) {
        setSubs(result.data ?? [])
      } else {
        alert('Erro ao carregar assinaturas: ' + (result.error ?? 'Desconhecido'))
      }
    } catch (err) {
      alert('Erro de conexão: ' + String(err))
    } finally {
      setLoading(false)
    }
  }

  async function cancelarAssinatura(sub: AsaasSubscription) {
    const nome = sub.aluno?.nome ?? sub.description
    if (!confirm(`Cancelar assinatura de ${nome}?\n\nIsso NÃO cancela cobranças já geradas.`)) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-subscriptions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'cancel',
            subscription_id: sub.id,
            aluno_id: sub.aluno?.id,
          }),
        }
      )
      const result = await resp.json()
      if (result.ok) {
        alert('Assinatura cancelada!')
        loadSubscriptions()
      } else {
        alert('Erro: ' + (result.error ?? 'Desconhecido'))
      }
    } catch (err) {
      alert('Erro: ' + String(err))
    }
  }

  const filtered = useMemo(() => {
    return subs.filter((s) => {
      if (filtroStatus !== 'todos' && s.status !== filtroStatus) return false
      if (busca) {
        const t = busca.toLowerCase()
        const nome = s.aluno?.nome?.toLowerCase() ?? ''
        const desc = s.description?.toLowerCase() ?? ''
        if (!nome.includes(t) && !desc.includes(t) && !s.id.includes(t)) return false
      }
      return true
    })
  }, [subs, filtroStatus, busca])

  const kpis = useMemo(() => {
    const ativas = subs.filter((s) => s.status === 'ACTIVE')
    const mrr = ativas.reduce((sum, s) => sum + s.value, 0)
    return {
      total: subs.length,
      ativas: ativas.length,
      inativas: subs.filter((s) => s.status !== 'ACTIVE').length,
      mrr,
    }
  }, [subs])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Assinaturas Recorrentes</h1>
          <p className="text-gray-500">Gerenciar cobranças recorrentes via Asaas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadSubscriptions}
            disabled={loading}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
          <button
            onClick={() => setCriarModal(true)}
            className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600"
          >
            <Plus className="w-4 h-4" />
            Nova Assinatura
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total" value={String(kpis.total)} icon={<Calendar className="w-4 h-4" />} />
        <KpiCard label="Ativas" value={String(kpis.ativas)} icon={<CheckCircle2 className="w-4 h-4 text-green-600" />} color="text-green-700" />
        <KpiCard label="Inativas" value={String(kpis.inativas)} icon={<XCircle className="w-4 h-4 text-gray-500" />} color="text-gray-600" />
        <KpiCard label="MRR" value={brl(kpis.mrr)} icon={<DollarSign className="w-4 h-4 text-green-600" />} color="text-green-700" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="px-3 py-2.5 rounded-lg border border-gray-200 text-sm"
        >
          <option value="todos">Todos</option>
          <option value="ACTIVE">Ativas</option>
          <option value="INACTIVE">Inativas</option>
          <option value="EXPIRED">Expiradas</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, descrição..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-200 text-sm"
          />
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Carregando assinaturas do Asaas...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Nenhuma assinatura encontrada.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3">Aluno</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Forma</th>
                <th className="px-4 py-3">Próx. Vencimento</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Criada em</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">
                      {sub.aluno?.nome ?? sub.description}
                    </div>
                    <div className="text-xs text-gray-500">
                      {sub.aluno?.instrumento_interesse ?? sub.externalReference}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{brl(sub.value)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {BILLING_ICON[sub.billingType] ?? BILLING_ICON.UNDEFINED}
                      <span className="text-xs text-gray-600">
                        {sub.billingType === 'CREDIT_CARD' ? 'Cartão' : sub.billingType === 'PIX' ? 'PIX' : sub.billingType === 'BOLETO' ? 'Boleto' : 'Flex'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{formatBR(sub.nextDueDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[sub.status] ?? 'bg-gray-100 text-gray-800'}`}>
                      {STATUS_LABEL[sub.status] ?? sub.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatBR(sub.dateCreated)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => setEditModal(sub)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
                        title="Editar valor"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {sub.status === 'ACTIVE' && (
                        <button
                          onClick={() => cancelarAssinatura(sub)}
                          className="p-1.5 rounded hover:bg-red-100 text-red-500"
                          title="Cancelar assinatura"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {criarModal && (
        <CriarAssinaturaModal
          onClose={() => setCriarModal(false)}
          onSaved={() => { setCriarModal(false); loadSubscriptions() }}
        />
      )}

      {editModal && (
        <EditarAssinaturaModal
          sub={editModal}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); loadSubscriptions() }}
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

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: Criar Assinatura
// ═══════════════════════════════════════════════════════════════════════════════
function CriarAssinaturaModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [alunos, setAlunos] = useState<AlunoSimples[]>([])
  const [buscaAluno, setBuscaAluno] = useState('')
  const [selectedAluno, setSelectedAluno] = useState<AlunoSimples | null>(null)
  const [valor, setValor] = useState('')
  const [billingType, setBillingType] = useState<'CREDIT_CARD' | 'PIX' | 'UNDEFINED'>('UNDEFINED')
  const [nextDueDate, setNextDueDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    d.setDate(5)
    return d.toISOString().slice(0, 10)
  })
  const [descricao, setDescricao] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    loadAlunos()
  }, [])

  async function loadAlunos() {
    const { data } = await supabase
      .from('alunos')
      .select('id, nome, telefone, instrumento_interesse, valor_plano, cpf, asaas_subscription_id')
      .eq('status', 'ativo')
      .order('nome')
    setAlunos(data ?? [])
  }

  const alunosFiltrados = useMemo(() => {
    if (!buscaAluno) return alunos.slice(0, 20)
    const t = buscaAluno.toLowerCase()
    return alunos.filter((a) => a.nome.toLowerCase().includes(t)).slice(0, 20)
  }, [alunos, buscaAluno])

  function selecionarAluno(a: AlunoSimples) {
    setSelectedAluno(a)
    setBuscaAluno(a.nome)
    if (a.valor_plano) setValor(String(a.valor_plano))
  }

  async function criar() {
    if (!selectedAluno) { alert('Selecione um aluno'); return }
    if (!valor || parseFloat(valor) <= 0) { alert('Informe um valor válido'); return }
    if (!selectedAluno.cpf) { alert('Aluno sem CPF cadastrado — necessário para assinatura Asaas'); return }

    setSalvando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-subscriptions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'create',
            aluno_id: selectedAluno.id,
            valor: parseFloat(valor),
            billing_type: billingType,
            next_due_date: nextDueDate,
            descricao: descricao || undefined,
          }),
        }
      )
      const result = await resp.json()
      if (result.ok) {
        alert(`Assinatura criada!\nID: ${result.subscription_id}\nPróx. cobrança: ${result.next_due_date}`)
        onSaved()
      } else {
        alert('Erro: ' + (result.error ?? 'Desconhecido'))
      }
    } catch (err) {
      alert('Erro: ' + String(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-brand-600" />
          <h2 className="text-lg font-semibold">Nova Assinatura Recorrente</h2>
        </div>
        <div className="p-5 space-y-4">
          {/* Seletor de aluno */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">Aluno</label>
            <input
              value={buscaAluno}
              onChange={(e) => { setBuscaAluno(e.target.value); setSelectedAluno(null) }}
              placeholder="Buscar aluno pelo nome..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            {buscaAluno && !selectedAluno && (
              <div className="border rounded-lg mt-1 max-h-40 overflow-auto bg-white shadow-lg">
                {alunosFiltrados.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => selecionarAluno(a)}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-sm"
                  >
                    <div className="font-medium">{a.nome}</div>
                    <div className="text-xs text-gray-500">
                      {a.instrumento_interesse ?? '—'} • {a.valor_plano ? `R$ ${a.valor_plano}` : 'sem plano'}
                      {a.asaas_subscription_id && <span className="text-yellow-600 ml-2">⚠️ já tem assinatura</span>}
                      {!a.cpf && <span className="text-red-500 ml-2">❌ sem CPF</span>}
                    </div>
                  </button>
                ))}
                {alunosFiltrados.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500">Nenhum aluno encontrado</div>
                )}
              </div>
            )}
            {selectedAluno && (
              <div className="mt-1 text-xs text-green-700 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> {selectedAluno.nome}
                {selectedAluno.asaas_subscription_id && (
                  <span className="text-yellow-600 ml-2">⚠️ já tem assinatura — será substituída</span>
                )}
              </div>
            )}
          </div>

          {/* Valor e Forma */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Valor mensal (R$)</label>
              <input
                type="number"
                step="0.01"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="320.00"
                className="w-full px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Forma de pagamento</label>
              <select
                value={billingType}
                onChange={(e) => setBillingType(e.target.value as any)}
                className="w-full px-3 py-2 border rounded-lg text-sm"
              >
                <option value="UNDEFINED">PIX + Cartão (aluno escolhe)</option>
                <option value="PIX">Somente PIX</option>
                <option value="CREDIT_CARD">Somente Cartão</option>
              </select>
            </div>
          </div>

          {/* Data início */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">Primeira cobrança em</label>
            <input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-xs text-gray-600 mb-1">Descrição (opcional)</label>
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Mensalidade Piano — CMMF"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
            Cancelar
          </button>
          <button
            onClick={criar}
            disabled={salvando || !selectedAluno}
            className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
          >
            {salvando ? 'Criando...' : 'Criar Assinatura'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MODAL: Editar Assinatura
// ═══════════════════════════════════════════════════════════════════════════════
function EditarAssinaturaModal({ sub, onClose, onSaved }: { sub: AsaasSubscription; onClose: () => void; onSaved: () => void }) {
  const [valor, setValor] = useState(String(sub.value))
  const [billingType, setBillingType] = useState(sub.billingType)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    setSalvando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-subscriptions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'update',
            subscription_id: sub.id,
            valor: parseFloat(valor),
            billing_type: billingType,
          }),
        }
      )
      const result = await resp.json()
      if (result.ok) {
        alert('Assinatura atualizada!')
        onSaved()
      } else {
        alert('Erro: ' + (result.error ?? 'Desconhecido'))
      }
    } catch (err) {
      alert('Erro: ' + String(err))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b">
          <h2 className="text-lg font-semibold">Editar Assinatura</h2>
          <p className="text-sm text-gray-500">{sub.aluno?.nome ?? sub.description}</p>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">Valor mensal (R$)</label>
            <input
              type="number"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Forma de pagamento</label>
            <select
              value={billingType}
              onChange={(e) => setBillingType(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="UNDEFINED">PIX + Cartão</option>
              <option value="PIX">Somente PIX</option>
              <option value="CREDIT_CARD">Somente Cartão</option>
            </select>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 space-y-1">
            <div><strong>ID:</strong> {sub.id}</div>
            <div><strong>Próx. cobrança:</strong> {formatBR(sub.nextDueDate)}</div>
            <div><strong>Ciclo:</strong> {sub.cycle === 'MONTHLY' ? 'Mensal' : sub.cycle}</div>
          </div>
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="px-4 py-2 bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
