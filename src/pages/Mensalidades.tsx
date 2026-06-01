import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { DollarSign, CheckCircle2, Clock, AlertTriangle, Plus, Search, Download, ExternalLink, Copy, Zap, CreditCard, QrCode, UserPlus } from 'lucide-react'

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
  asaas_charge_id: string | null
  asaas_payment_url: string | null
  asaas_billing_type: string | null
  asaas_pix_copy_paste: string | null
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
  const [paymentLoading, setPaymentLoading] = useState<string | null>(null)
  const [paymentModal, setPaymentModal] = useState<Mensalidade | null>(null)
  const [billingModal, setBillingModal] = useState<Mensalidade | null>(null)
  const [avulsaModal, setAvulsaModal] = useState(false)
  const [aba, setAba] = useState<'mensalidades' | 'inadimplentes'>('mensalidades')

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

  async function criarCobrancaAsaas(m: Mensalidade, billing_type: 'CREDIT_CARD' | 'PIX') {
    setBillingModal(null)
    setPaymentLoading(m.id)
    const { data, error } = await supabase.functions.invoke('asaas-create-charge', {
      body: { mensalidade_id: m.id, billing_type },
    })
    setPaymentLoading(null)
    if (error || !data?.ok) {
      alert(`Erro ao criar cobrança:\n${error?.message ?? data?.error}`)
      return
    }
    await loadMensalidades()
    setPaymentModal({
      ...m,
      asaas_charge_id: data.charge_id,
      asaas_payment_url: data.payment_url,
      asaas_billing_type: billing_type,
    })
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

  const inadimplentes = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10)
    return items.filter((m) => m.status !== 'pago' && m.status !== 'isento' && m.status !== 'cancelado' && m.data_vencimento < hoje)
  }, [items])

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
            onClick={() => setAvulsaModal(true)}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50"
          >
            <UserPlus className="w-4 h-4" />
            Cobrança Avulsa
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

      {/* Abas */}
      <div className="flex gap-1 border-b">
        <button onClick={() => setAba('mensalidades')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${ aba === 'mensalidades' ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700' }`}>Mensalidades</button>
        <button onClick={() => setAba('inadimplentes')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${ aba === 'inadimplentes' ? 'border-red-500 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-700' }`}>
          Inadimplentes
          {inadimplentes.length > 0 && <span className="bg-red-100 text-red-700 text-xs font-bold px-1.5 py-0.5 rounded-full">{inadimplentes.length}</span>}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Total" value={String(kpis.total)} icon={<DollarSign className="w-4 h-4" />} />
        <KpiCard label="Pagas" value={String(kpis.pagas)} icon={<CheckCircle2 className="w-4 h-4 text-green-600" />} color="text-green-700" />
        <KpiCard label="Pendentes" value={String(kpis.pendentes)} icon={<Clock className="w-4 h-4 text-yellow-600" />} color="text-yellow-700" />
        <KpiCard label="Atrasadas" value={String(kpis.atrasadas)} icon={<AlertTriangle className="w-4 h-4 text-red-600" />} color="text-red-700" />
        <KpiCard label="Recebido" value={brl(kpis.recebido)} icon={<DollarSign className="w-4 h-4 text-green-600" />} color="text-green-700" />
      </div>

      {aba === 'inadimplentes' && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          {inadimplentes.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Nenhum inadimplente neste mês. 🎉</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-red-50 text-left text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3">Aluno</th>
                  <th className="px-4 py-3">Vencimento</th>
                  <th className="px-4 py-3">Valor</th>
                  <th className="px-4 py-3">Dias em atraso</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inadimplentes.map((m) => {
                  const dias = Math.floor((Date.now() - new Date(m.data_vencimento).getTime()) / 86400000)
                  return (
                    <tr key={m.id} className="hover:bg-red-50">
                      <td className="px-4 py-3"><div className="font-medium">{m.aluno_nome}</div><div className="text-xs text-gray-500">{m.aluno_telefone || ''}</div></td>
                      <td className="px-4 py-3 text-gray-700">{formatBR(m.data_vencimento)}</td>
                      <td className="px-4 py-3 font-medium text-red-700">{brl(m.valor - m.desconto)}</td>
                      <td className="px-4 py-3"><span className="bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full">{dias}d</span></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {!m.asaas_charge_id
                            ? <button onClick={() => setBillingModal(m)} disabled={paymentLoading === m.id} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-purple-100 text-purple-800 hover:bg-purple-200"><Zap className="w-3 h-3" /> Cobrar</button>
                            : <button onClick={() => setPaymentModal(m)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-purple-100 text-purple-800 hover:bg-purple-200"><Zap className="w-3 h-3" /> Link</button>
                          }
                          {m.aluno_telefone && (
                            <a href={`https://wa.me/55${m.aluno_telefone.replace(/\D/g,'')}?text=${encodeURIComponent(`Olá ${m.aluno_nome.split(' ')[0]}! Sua mensalidade de ${brl(m.valor-m.desconto)} venceu em ${formatBR(m.data_vencimento)}. Entre em contato para regularizar.`)}`} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded bg-green-100 text-green-800 hover:bg-green-200">WhatsApp</a>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {aba === 'mensalidades' && (
      <>
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
                    <td className="px-4 py-3">
                      {m.asaas_charge_id && m.asaas_payment_url ? (
                        <a
                          href={m.asaas_payment_url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                        >
                          <CreditCard className="w-3 h-3" /> Link cartão
                        </a>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        {m.status !== 'pago' && !m.asaas_charge_id && (
                          <button
                            onClick={() => setBillingModal(m)}
                            disabled={paymentLoading === m.id}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-purple-100 text-purple-800 hover:bg-purple-200 disabled:opacity-50"
                          >
                            <Zap className="w-3 h-3" />
                            {paymentLoading === m.id ? '...' : 'Cobrar'}
                          </button>
                        )}
                        {m.asaas_charge_id && (
                          <button
                            onClick={() => setPaymentModal(m)}
                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-purple-100 text-purple-800 hover:bg-purple-200"
                          >
                            <Zap className="w-3 h-3" /> Pagamento
                          </button>
                        )}
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

      </>
      )}

      {editando && (
        <EditarMensalidadeModal
          m={editando}
          onClose={() => setEditando(null)}
          onSave={salvarEdicao}
        />
      )}

      {billingModal && (
        <BillingTypeModal
          nome={billingModal.aluno_nome}
          loading={paymentLoading === billingModal.id}
          onClose={() => setBillingModal(null)}
          onSelect={(type) => criarCobrancaAsaas(billingModal, type)}
        />
      )}

      {avulsaModal && (
        <AvulsaModal onClose={() => setAvulsaModal(false)} />
      )}

      {paymentModal && (
        <PaymentModal
          m={paymentModal}
          onClose={() => setPaymentModal(null)}
          onResetar={async () => {
            const { error } = await supabase.rpc('resetar_cobranca', { p_mensalidade_id: paymentModal.id })
            if (error) { alert('Erro: ' + error.message); return }
            setPaymentModal(null)
            loadMensalidades()
          }}
        />
      )}
    </div>
  )
}

function PaymentModal({
  m,
  onClose,
  onResetar,
}: {
  m: Mensalidade
  onClose: () => void
  onResetar: () => void
}) {
  const whatsappUrl = m.aluno_telefone && m.asaas_payment_url
    ? `https://wa.me/55${m.aluno_telefone.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${m.aluno_nome.split(' ')[0]}! Seu link de pagamento da mensalidade (${m.referencia?.substring(0, 7)}): ${m.asaas_payment_url}`)}`
    : null

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <Zap className="w-5 h-5 text-purple-600" />
          <div>
            <h2 className="text-lg font-semibold">Cobrança Asaas</h2>
            <p className="text-sm text-gray-500">{m.aluno_nome} — {m.referencia?.substring(0, 7)}</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-purple-50 p-4 text-sm space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Charge ID</span>
              <span className="font-mono text-xs text-gray-800">{m.asaas_charge_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Tipo</span>
              <span>{m.asaas_billing_type ?? '—'}</span>
            </div>
          </div>

          {m.asaas_payment_url && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Link de pagamento</p>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={m.asaas_payment_url}
                  className="flex-1 text-xs border rounded px-2 py-1.5 bg-gray-50"
                />
                <button
                  onClick={() => { navigator.clipboard.writeText(m.asaas_payment_url!); alert('Link copiado!') }}
                  className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <a
                  href={m.asaas_payment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          )}



          {m.asaas_billing_type === 'PIX' && m.asaas_pix_copy_paste && (
            <div>
              <p className="text-xs text-gray-500 mb-1">PIX Copia e Cola</p>
              <div className="flex gap-2">
                <input readOnly value={m.asaas_pix_copy_paste} className="flex-1 text-xs border rounded px-2 py-1.5 bg-gray-50 font-mono" />
                <button onClick={() => { navigator.clipboard.writeText(m.asaas_pix_copy_paste!); alert('Código PIX copiado!') }} className="px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50">
                  <QrCode className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {whatsappUrl && (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-green-500 text-white hover:bg-green-600 text-sm font-medium"
            >
              Enviar link via WhatsApp
            </a>
          )}
        </div>
        <div className="px-5 py-3 border-t flex justify-between items-center">
          <button
            onClick={onResetar}
            className="text-xs text-red-600 hover:underline"
          >
            Resetar cobrança
          </button>
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">
            Fechar
          </button>
        </div>
      </div>
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

function BillingTypeModal({
  nome,
  loading,
  onClose,
  onSelect,
}: {
  nome: string
  loading: boolean
  onClose: () => void
  onSelect: (type: 'CREDIT_CARD' | 'PIX') => void
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-5 py-4 border-b">
          <h2 className="text-lg font-semibold">Tipo de cobrança</h2>
          <p className="text-sm text-gray-500">{nome}</p>
        </div>
        <div className="p-5 grid grid-cols-2 gap-3">
          <button
            disabled={loading}
            onClick={() => onSelect('CREDIT_CARD')}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-200 hover:border-purple-400 hover:bg-purple-50 disabled:opacity-50"
          >
            <CreditCard className="w-8 h-8 text-purple-600" />
            <span className="text-sm font-medium">Cartão de crédito</span>
          </button>
          <button
            disabled={loading}
            onClick={() => onSelect('PIX')}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-gray-200 hover:border-green-400 hover:bg-green-50 disabled:opacity-50"
          >
            <QrCode className="w-8 h-8 text-green-600" />
            <span className="text-sm font-medium">PIX</span>
          </button>
        </div>
        <div className="px-5 py-3 border-t flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">Cancelar</button>
        </div>
      </div>
    </div>
  )
}

function AvulsaModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({ nome: '', telefone: '', email: '', valor: '', vencimento: new Date().toISOString().slice(0,10), billing_type: 'PIX' as 'PIX' | 'CREDIT_CARD', descricao: '' })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{payment_url?: string; pix_copy_paste?: string} | null>(null)

  async function enviar() {
    if (!form.nome || !form.telefone || !form.valor) { alert('Preencha nome, telefone e valor'); return }
    setLoading(true)
    const { data, error } = await supabase.functions.invoke('asaas-create-charge', {
      body: { avulsa: true, nome: form.nome, telefone: form.telefone, email: form.email || undefined, valor: parseFloat(form.valor), vencimento: form.vencimento, billing_type: form.billing_type, descricao: form.descricao || undefined },
    })
    setLoading(false)
    if (error || !data?.ok) { alert(`Erro: ${error?.message ?? data?.error}`); return }
    setResult({ payment_url: data.payment_url, pix_copy_paste: data.pix_copy_paste })
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold">Cobrança Avulsa</h2>
        </div>
        {result ? (
          <div className="p-5 space-y-4">
            <p className="text-green-700 font-medium">Cobrança criada com sucesso!</p>
            {result.pix_copy_paste && (
              <div>
                <p className="text-xs text-gray-500 mb-1">PIX Copia e Cola</p>
                <div className="flex gap-2">
                  <input readOnly value={result.pix_copy_paste} className="flex-1 text-xs border rounded px-2 py-1.5 bg-gray-50 font-mono" />
                  <button onClick={() => { navigator.clipboard.writeText(result.pix_copy_paste!); alert('Copiado!') }} className="px-3 py-1.5 rounded border hover:bg-gray-50"><QrCode className="w-4 h-4" /></button>
                </div>
              </div>
            )}
            {result.payment_url && (
              <a href={result.payment_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:underline"><ExternalLink className="w-4 h-4" /> Abrir link de pagamento</a>
            )}
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <Field label="Nome"><input value={form.nome} onChange={e => setForm({...form, nome: e.target.value})} className="w-full px-3 py-2 border rounded" placeholder="Nome completo" /></Field>
            <Field label="Telefone"><input value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})} className="w-full px-3 py-2 border rounded" placeholder="51999999999" /></Field>
            <Field label="E-mail (opcional)"><input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-3 py-2 border rounded" placeholder="email@exemplo.com" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor (R$)"><input type="number" step="0.01" value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} className="w-full px-3 py-2 border rounded" /></Field>
              <Field label="Vencimento"><input type="date" value={form.vencimento} onChange={e => setForm({...form, vencimento: e.target.value})} className="w-full px-3 py-2 border rounded" /></Field>
            </div>
            <Field label="Tipo">
              <select value={form.billing_type} onChange={e => setForm({...form, billing_type: e.target.value as 'PIX'|'CREDIT_CARD'})} className="w-full px-3 py-2 border rounded">
                <option value="PIX">PIX</option>
                <option value="CREDIT_CARD">Cartão de crédito</option>
              </select>
            </Field>
            <Field label="Descrição (opcional)"><input value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} className="w-full px-3 py-2 border rounded" /></Field>
          </div>
        )}
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">Fechar</button>
          {!result && <button onClick={enviar} disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">{loading ? 'Gerando...' : 'Gerar cobrança'}</button>}
        </div>
      </div>
    </div>
  )
}