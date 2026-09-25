import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { DollarSign, CheckCircle2, Clock, AlertTriangle, Plus, Search, Download, ExternalLink, Copy, Zap, CreditCard, QrCode, UserPlus, Send, MessageSquare, RefreshCw, XCircle, Trash2 } from 'lucide-react'

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
  aluno?: { id: string; nome: string; instrumento_interesse: string | null } | null
}

interface Mensalidade {
  id: string
  aluno_id: string
  aluno_nome: string
  aluno_telefone: string | null
  aluno_email: string | null
  aluno_instrumento: string | null
  aluno_contato_invalido: boolean | null
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
  notificado_vencimento_em: string | null
  notificado_cobranca_em: string | null
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
  const [aba, setAba] = useState<'mensalidades' | 'inadimplentes' | 'assinaturas'>('mensalidades')
  const [enviandoLembretes, setEnviandoLembretes] = useState(false)
  const [enviandoCobrancas, setEnviandoCobrancas] = useState(false)
  const [criandoPix, setCriandoPix] = useState(false)
  const [pixCnpj] = useState('29.247.149/0001-51')
  const [recorrenteModal, setRecorrenteModal] = useState<Mensalidade | null>(null)
  const [subs, setSubs] = useState<AsaasSubscription[]>([])
  const [subsLoading, setSubsLoading] = useState(false)
  const [subsBusca, setSubsBusca] = useState('')

  useEffect(() => {
    loadMensalidades()
  }, [filtroMes])

  useEffect(() => {
    if (aba === 'assinaturas' && subs.length === 0) loadSubscriptions()
  }, [aba])

  async function loadSubscriptions() {
    setSubsLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-subscriptions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ action: 'list', status: 'ACTIVE' }),
        }
      )
      const result = await resp.json()
      if (result.ok) setSubs(result.subscriptions ?? [])
    } catch (err) {
      console.error('Erro ao carregar assinaturas:', err)
    } finally {
      setSubsLoading(false)
    }
  }

  async function cancelarAssinatura(subId: string, nome: string) {
    if (!confirm(`Cancelar assinatura de ${nome}?\n\nNão será gerada nova cobrança a partir do próximo mês.`)) return
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-subscriptions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body: JSON.stringify({ action: 'cancel', subscription_id: subId }),
        }
      )
      const result = await resp.json()
      if (result.ok) {
        alert('Assinatura cancelada com sucesso.')
        loadSubscriptions()
      } else {
        alert('Erro: ' + (result.error ?? 'Desconhecido'))
      }
    } catch (err) {
      alert('Erro: ' + String(err))
    }
  }

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
    const valorLiquido = m.valor - m.desconto
    const { error } = await supabase
      .from('mensalidades')
      .update({
        status: 'pago',
        data_pagamento: hoje,
        valor_pago: valorLiquido,
        metodo_pagamento: m.metodo_pagamento || 'pix',
      })
      .eq('id', m.id)
    if (error) {
      alert(`Erro ao marcar pago:\n${error.message}`)
      return
    }
    // Sincronizar baixa no Asaas (para cobranças normais pay_xxx)
    if (m.asaas_charge_id?.startsWith('pay_')) {
      await supabase.functions.invoke('asaas-create-charge', {
        body: { mode: 'mark_paid', mensalidade_id: m.id, data_pagamento: hoje, valor_pago: valorLiquido },
      })
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

  async function excluirMensalidade(m: Mensalidade) {
    const temCobranca = !!m.asaas_charge_id
    const msg = temCobranca
      ? `Excluir mensalidade de ${m.aluno_nome} (${m.referencia?.substring(0, 7)})?\n\n⚠️ A cobrança também será CANCELADA no Asaas.\n\nEsta ação não pode ser desfeita.`
      : `Excluir mensalidade de ${m.aluno_nome} (${m.referencia?.substring(0, 7)})?\n\nEsta ação não pode ser desfeita.`
    if (!confirm(msg)) return

    if (temCobranca) {
      try {
        const resp = await fetch('/api/asaas-cancelar-cobranca', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chargeId: m.asaas_charge_id }),
        })
        const data = await resp.json()
        if (!resp.ok) {
          if (!confirm(`Não foi possível cancelar no Asaas:\n${data.error}\n\nExcluir mesmo assim do sistema?`)) return
        }
      } catch (err: any) {
        if (!confirm(`Erro ao contatar o Asaas:\n${err.message}\n\nExcluir mesmo assim do sistema?`)) return
      }
    }

    const { error } = await supabase.from('mensalidades').delete().eq('id', m.id)
    if (error) { alert(`Erro ao excluir:\n${error.message}`); return }
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

  // ── Gerar mensagem WhatsApp de cobrança individual ──────────────────────────
  function msgCobranca(m: Mensalidade, tipo: 'lembrete' | 'cobranca') {
    const nome = (m.aluno_nome || '').split(' ')[0]
    const instr = m.aluno_instrumento || 'música'
    const valor = brl(m.valor - m.desconto)
    const venc = formatBR(m.data_vencimento)
    const ref = m.referencia ? new Date(m.referencia + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : ''

    // Lógica de pagamento:
    // 1) Tem PIX copia e cola → mostra o PIX + link para cartão separado
    // 2) Tem payment link mas sem PIX copia e cola → mostra só o link (já aceita PIX e cartão)
    //    (NÃO mostrar PIX CNPJ pois pagamento por CNPJ não dispara webhook/baixa automática)
    // 3) Sem nada do Asaas → PIX CNPJ genérico como fallback
    let linhasPix: string
    let linhaLink: string
    if (m.asaas_pix_copy_paste) {
      linhasPix = `📲 *PIX Copia e Cola:*\n\`${m.asaas_pix_copy_paste}\``
      linhaLink = m.asaas_payment_url ? `\n💳 *Pagar com cartão:* ${m.asaas_payment_url}` : ''
    } else if (m.asaas_payment_url) {
      linhasPix = `📱 *Pagar por PIX ou cartão:*\n${m.asaas_payment_url}`
      linhaLink = ''
    } else {
      linhasPix = `🏦 *PIX CNPJ:* ${pixCnpj}`
      linhaLink = ''
    }

    if (tipo === 'lembrete') {
      return (
        `Oi ${nome}! 👋\n\n` +
        `Lembrete: sua mensalidade de ${instr} vence em breve.\n\n` +
        `💰 *Valor:* ${valor}\n📅 *Vencimento:* ${venc}\n\n` +
        `${linhasPix}${linhaLink}\n\n` +
        `Após o pagamento, é só responder esta mensagem! 😊\n— Centro de Música Murilo Finger`
      )
    }
    return (
      `Oi ${nome}! 👋\n\n` +
      `Sua mensalidade de ${instr} referente a ${ref} ainda está em aberto.\n\n` +
      `💰 *Valor:* ${valor}\n📅 *Venceu em:* ${venc}\n\n` +
      `Para regularizar:\n${linhasPix}${linhaLink}\n\n` +
      `Qualquer dúvida estamos aqui! — Centro de Música Murilo Finger`
    )
  }

  function abrirWhatsApp(m: Mensalidade, tipo: 'lembrete' | 'cobranca') {
    const tel = m.aluno_telefone?.replace(/\D/g, '')
    if (!tel) { alert('Aluno sem telefone cadastrado.'); return }
    const num = tel.startsWith('55') ? tel : `55${tel}`
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msgCobranca(m, tipo))}`, '_blank')
  }

  async function enviarLembretesEmMassa() {    const pendentes = filtered.filter(m => m.status === 'pendente')
    if (pendentes.length === 0) { alert('Nenhum aluno pendente para lembrete.'); return }
    if (!confirm(`Enviar lembrete de vencimento para ${pendentes.length} aluno(s) via WhatsApp?`)) return
    setEnviandoLembretes(true)
    const inserts = pendentes
      .filter(m => m.aluno_telefone && !m.aluno_telefone.startsWith('INVALIDO') && !m.aluno_contato_invalido)
      .map(m => ({
        aluno_id: m.aluno_id,
        tipo: 'lembrete_mensalidade',
        canal: 'whatsapp',
        mensagem: msgCobranca(m, 'lembrete'),
        telefone_destinatario: m.aluno_telefone,
        status: 'pendente',
      }))
    const { error } = await supabase.from('disparos_pendentes').insert(inserts)
    setEnviandoLembretes(false)
    if (error) { alert('Erro ao criar lembretes:\n' + error.message); return }
    alert(`✓ ${inserts.length} lembretes criados! Serão enviados nos próximos 30 minutos.`)
  }

  async function cobrarInadimplentesEmMassa() {
    if (inadimplentes.length === 0) { alert('Nenhum inadimplente encontrado.'); return }
    if (!confirm(`Enviar cobrança para ${inadimplentes.length} inadimplente(s) via WhatsApp?`)) return
    setEnviandoCobrancas(true)
    const inserts = inadimplentes
      .filter(m => m.aluno_telefone && !m.aluno_telefone.startsWith('INVALIDO') && !m.aluno_contato_invalido)
      .map(m => ({
        aluno_id: m.aluno_id,
        tipo: 'cobranca_atraso',
        canal: 'whatsapp',
        mensagem: msgCobranca(m, 'cobranca'),
        telefone_destinatario: m.aluno_telefone,
        status: 'pendente',
      }))
    const { error } = await supabase.from('disparos_pendentes').insert(inserts)
    setEnviandoCobrancas(false)
    if (error) { alert('Erro ao criar cobranças:\n' + error.message); return }
    alert(`✓ ${inserts.length} cobranças criadas! Serão enviadas nos próximos 30 minutos.`)
  }

  function exportarCSV() {    const header = ['Aluno', 'Telefone', 'Instrumento', 'Referência', 'Vencimento', 'Valor', 'Desconto', 'Pago', 'Status', 'Método', 'Pagamento']
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

  async function criarPixEmMassa() {
    if (!confirm(`Criar cobranças PIX no Asaas para todas as mensalidades pendentes de ${filtroMes} sem PIX gerado?`)) return
    setCriandoPix(true)
    try {
      const refData = filtroMes + '-01'
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-bulk-pix`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ p_referencia: refData }),
        }
      )
      const result = await resp.json()
      if (!resp.ok) { alert('Erro: ' + (result.error || 'Falha desconhecida')); return }
      alert(`✓ ${result.criadas} cobranças PIX criadas no Asaas!${result.erros > 0 ? `\n⚠️ ${result.erros} erros (ver console).` : ''}`)
      await loadMensalidades()
    } catch (err) {
      alert('Erro ao criar cobranças PIX: ' + String(err))
    } finally {
      setCriandoPix(false)
    }
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
            onClick={criarPixEmMassa}
            disabled={criandoPix}
            className="flex items-center gap-2 bg-white border border-orange-200 text-orange-700 px-4 py-2.5 rounded-lg hover:bg-orange-50 disabled:opacity-50"
            title="Cria cobranças no Asaas: aluno pode pagar via PIX ou cartão de crédito. Baixa automática após pagamento."
          >
            <Zap className="w-4 h-4 text-orange-500" />
            {criandoPix ? 'Gerando cobranças...' : 'Cobranças no Asaas'}
          </button>
          <button
            onClick={enviarLembretesEmMassa}
            disabled={enviandoLembretes}
            className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <Send className="w-4 h-4 text-green-600" />
            {enviandoLembretes ? 'Criando...' : 'Lembrete em massa'}
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
        <button onClick={() => setAba('assinaturas')} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${ aba === 'assinaturas' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700' }`}>
          <RefreshCw className="w-3.5 h-3.5" /> Assinaturas
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
            <>
            <div className="flex items-center justify-between px-4 py-3 bg-red-50 border-b">
              <span className="text-sm font-medium text-red-700">{inadimplentes.length} inadimplente(s)</span>
              <button
                onClick={cobrarInadimplentesEmMassa}
                disabled={enviandoCobrancas}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                <MessageSquare className="w-3 h-3" />
                {enviandoCobrancas ? 'Enviando...' : 'Cobrar todos por WhatsApp'}
              </button>
            </div>
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
                            <button
                              onClick={() => abrirWhatsApp(m, 'cobranca')}
                              className="text-xs px-3 py-1.5 rounded bg-green-100 text-green-800 hover:bg-green-200"
                            >WhatsApp</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </>
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
                <th className="px-3 py-3">Aluno</th>
                <th className="px-3 py-3">Vencimento</th>
                <th className="px-3 py-3">Valor</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Pagamento</th>
                <th className="px-3 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((m) => {
                const liquido = m.valor - m.desconto
                return (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-900">{m.aluno_nome}</div>
                      <div className="text-xs text-gray-500">{m.aluno_instrumento || ''} · {m.aluno_telefone || ''}</div>
                    </td>
                    <td className="px-3 py-3 text-gray-700">{formatBR(m.data_vencimento)}</td>
                    <td className="px-3 py-3 text-gray-900 whitespace-nowrap">
                      {brl(liquido)}
                      {m.desconto > 0 && (
                        <div className="text-xs text-gray-500">desc. {brl(m.desconto)}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_BADGE[m.status]}`}>
                        {m.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-gray-700">
                      {m.data_pagamento ? (
                        <div>
                          {formatBR(m.data_pagamento)}
                          <div className="text-xs text-gray-500">{m.metodo_pagamento}</div>
                        </div>
                      ) : m.asaas_payment_url ? (
                        <a href={m.asaas_payment_url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-blue-600 hover:underline">
                          <ExternalLink className="w-3 h-3" /> Link pagamento
                        </a>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex gap-1 justify-end flex-nowrap">
                        {m.status !== 'pago' && (
                          <button onClick={() => marcarPago(m)}
                            className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 whitespace-nowrap">
                            ✓ Pago
                          </button>
                        )}
                        <button onClick={() => setEditando(m)}
                          className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-100">
                          Editar
                        </button>
                        <button onClick={() => excluirMensalidade(m)}
                          className="text-xs px-1.5 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50"
                          title="Excluir">
                          <Trash2 className="w-3 h-3" />
                        </button>
                        {m.status !== 'pago' && m.aluno_telefone && !m.aluno_telefone.startsWith('INVALIDO') && (
                          <button onClick={() => abrirWhatsApp(m, m.status === 'atrasado' ? 'cobranca' : 'lembrete')}
                            className="text-xs px-1.5 py-1 rounded text-green-700 hover:bg-green-50"
                            title="WhatsApp">
                            <MessageSquare className="w-3 h-3" />
                          </button>
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

      </>
      )}

      {aba === 'assinaturas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={subsBusca} onChange={e => setSubsBusca(e.target.value)} placeholder="Buscar aluno..." className="pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm w-64" />
              </div>
              <span className="text-sm text-gray-500">{subs.length} assinaturas ativas</span>
              <span className="text-sm font-medium text-green-700">MRR: {brl(subs.reduce((s, sub) => s + sub.value, 0))}</span>
            </div>
            <button onClick={loadSubscriptions} disabled={subsLoading} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm disabled:opacity-50">
              <RefreshCw className={`w-4 h-4 ${subsLoading ? 'animate-spin' : ''}`} /> Atualizar
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
            {subsLoading ? (
              <div className="p-8 text-center text-gray-500">Carregando assinaturas do Asaas...</div>
            ) : subs.length === 0 ? (
              <div className="p-8 text-center text-gray-500">Nenhuma assinatura ativa.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-blue-50 text-left text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3">Aluno</th>
                    <th className="px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Próx. Cobrança</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {subs
                    .filter(s => !subsBusca || (s.aluno?.nome ?? s.description ?? '').toLowerCase().includes(subsBusca.toLowerCase()))
                    .map(s => (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{s.aluno?.nome ?? '—'}</div>
                        <div className="text-xs text-gray-500">{s.aluno?.instrumento_interesse ?? s.description}</div>
                      </td>
                      <td className="px-4 py-3 font-medium">{brl(s.value)}</td>
                      <td className="px-4 py-3 text-gray-700">{formatBR(s.nextDueDate)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100">
                          {s.billingType === 'UNDEFINED' ? 'PIX/Cartão' : s.billingType === 'CREDIT_CARD' ? 'Cartão' : s.billingType}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded bg-green-100 text-green-800">Ativa</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => cancelarAssinatura(s.id, s.aluno?.nome ?? 'aluno')}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-red-100 text-red-700 hover:bg-red-200"
                        >
                          <XCircle className="w-3 h-3" /> Cancelar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
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
        <AvulsaModal onClose={() => setAvulsaModal(false)} onSaved={loadMensalidades} />
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

      {recorrenteModal && (
        <RecorrenteModal
          m={recorrenteModal}
          onClose={() => setRecorrenteModal(null)}
          onSaved={() => { setRecorrenteModal(null); loadMensalidades() }}
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

function AvulsaModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ nome: '', telefone: '', email: '', valor: '', vencimento: new Date().toISOString().slice(0,10), billing_type: 'UNDEFINED' as 'PIX' | 'CREDIT_CARD' | 'UNDEFINED', descricao: '' })
  const [alunoId, setAlunoId] = useState<string | null>(null)
  const [sugestoes, setSugestoes] = useState<{ id: string; nome: string; telefone: string | null; email: string | null }[]>([])
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{payment_url?: string; pix_copy_paste?: string; vinculada?: boolean} | null>(null)

  useEffect(() => {
    if (alunoId || form.nome.trim().length < 2) { setSugestoes([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('alunos')
        .select('id, nome, telefone, email')
        .ilike('nome', `%${form.nome.trim()}%`)
        .order('nome')
        .limit(8)
      setSugestoes(data ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [form.nome, alunoId])

  function selecionarAluno(a: { id: string; nome: string; telefone: string | null; email: string | null }) {
    setForm({ ...form, nome: a.nome, telefone: a.telefone ?? '', email: a.email ?? '' })
    setAlunoId(a.id)
    setSugestoes([])
    setMostrarSugestoes(false)
  }

  function onNomeChange(v: string) {
    setForm({ ...form, nome: v })
    if (alunoId) setAlunoId(null) // digitou de novo, desfaz o vínculo até escolher outro
    setMostrarSugestoes(true)
  }

  async function enviar() {
    if (!form.nome || !form.telefone || !form.valor) { alert('Preencha nome, telefone e valor'); return }
    setLoading(true)
    const { data, error } = await supabase.functions.invoke('asaas-create-charge', {
      body: { avulsa: true, aluno_id: alunoId ?? undefined, nome: form.nome, telefone: form.telefone, email: form.email || undefined, valor: parseFloat(form.valor), vencimento: form.vencimento, billing_type: form.billing_type, descricao: form.descricao || undefined },
    })
    setLoading(false)
    if (error || !data?.ok) { alert(`Erro: ${error?.message ?? data?.error}`); return }
    setResult({ payment_url: data.payment_url, pix_copy_paste: data.pix_copy_paste, vinculada: !!data.mensalidade_id })
    if (data.mensalidade_id) onSaved()
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
            {result.vinculada ? (
              <p className="text-xs text-gray-500 -mt-2">Salva na lista de Mensalidades do mês — editar ou excluir por lá já reflete no Asaas.</p>
            ) : (
              <p className="text-xs text-amber-600 -mt-2">Nome não vinculado a um aluno cadastrado — essa cobrança existe só no Asaas, não aparece na lista do sistema.</p>
            )}
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
              <div>
                <p className="text-xs text-gray-500 mb-1">Link de pagamento (copie e mande pro cliente)</p>
                <div className="flex gap-2">
                  <input readOnly value={result.payment_url} className="flex-1 text-xs border rounded px-2 py-1.5 bg-gray-50 font-mono" />
                  <button onClick={() => { navigator.clipboard.writeText(result.payment_url!); alert('Copiado!') }} className="px-3 py-1.5 rounded border hover:bg-gray-50" title="Copiar link"><Copy className="w-4 h-4" /></button>
                  <a href={result.payment_url} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded border hover:bg-gray-50" title="Abrir"><ExternalLink className="w-4 h-4" /></a>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <Field label="Nome">
              <div className="relative">
                <input
                  value={form.nome}
                  onChange={e => onNomeChange(e.target.value)}
                  onFocus={() => setMostrarSugestoes(true)}
                  onBlur={() => setTimeout(() => setMostrarSugestoes(false), 150)}
                  className="w-full px-3 py-2 border rounded"
                  placeholder="Nome completo"
                  autoComplete="off"
                />
                {alunoId && (
                  <span className="absolute right-2 top-2.5 text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                    <UserPlus className="w-3 h-3" /> vinculado
                  </span>
                )}
                {mostrarSugestoes && sugestoes.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border rounded shadow-lg max-h-48 overflow-y-auto">
                    {sugestoes.map(a => (
                      <button
                        type="button"
                        key={a.id}
                        onMouseDown={() => selecionarAluno(a)}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm border-b last:border-b-0"
                      >
                        <div className="font-medium">{a.nome}</div>
                        {a.telefone && <div className="text-xs text-gray-500">{a.telefone}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Telefone"><input value={form.telefone} onChange={e => setForm({...form, telefone: e.target.value})} className="w-full px-3 py-2 border rounded" placeholder="51999999999" /></Field>
            <Field label="E-mail (opcional)"><input value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-3 py-2 border rounded" placeholder="email@exemplo.com" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor (R$)"><input type="number" step="0.01" value={form.valor} onChange={e => setForm({...form, valor: e.target.value})} className="w-full px-3 py-2 border rounded" /></Field>
              <Field label="Vencimento"><input type="date" value={form.vencimento} onChange={e => setForm({...form, vencimento: e.target.value})} className="w-full px-3 py-2 border rounded" /></Field>
            </div>
            <Field label="Tipo">
              <select value={form.billing_type} onChange={e => setForm({...form, billing_type: e.target.value as 'PIX'|'CREDIT_CARD'|'UNDEFINED'})} className="w-full px-3 py-2 border rounded">
                <option value="UNDEFINED">Pergunte ao cliente (PIX + Cartão)</option>
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

function RecorrenteModal({ m, onClose, onSaved }: { m: Mensalidade; onClose: () => void; onSaved: () => void }) {
  const [billingType, setBillingType] = useState<'UNDEFINED' | 'CREDIT_CARD' | 'PIX'>('UNDEFINED')
  const [nextDueDate, setNextDueDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 1)
    d.setDate(10)
    return d.toISOString().slice(0, 10)
  })
  const [salvando, setSalvando] = useState(false)

  async function criar() {
    if (!confirm(`Criar assinatura recorrente para ${m.aluno_nome}?\n\nValor: R$ ${(m.valor - m.desconto).toFixed(2)}/mês\nInício: ${nextDueDate}\n\nA partir dessa data, o Asaas cobrará automaticamente todo mês.`)) return
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
            aluno_id: m.aluno_id,
            valor: m.valor - m.desconto,
            billing_type: billingType,
            next_due_date: nextDueDate,
          }),
        }
      )
      const result = await resp.json()
      if (result.ok) {
        alert(`✓ Assinatura recorrente criada!\n\nID: ${result.subscription_id}\nPróxima cobrança: ${nextDueDate}\n\nA partir de agora o Asaas cobra automaticamente todo mês.`)
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
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-blue-600" />
          <div>
            <h2 className="text-lg font-semibold">Assinatura Recorrente</h2>
            <p className="text-sm text-gray-500">{m.aluno_nome}</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
            O Asaas vai cobrar <strong>R$ {(m.valor - m.desconto).toFixed(2)}</strong> automaticamente todo mês.
            O aluno recebe o link de pagamento (PIX ou cartão) e a baixa é automática.
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Forma de pagamento</label>
            <select
              value={billingType}
              onChange={(e) => setBillingType(e.target.value as any)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            >
              <option value="UNDEFINED">PIX + Cartão (aluno escolhe)</option>
              <option value="CREDIT_CARD">Cartão de crédito (débito automático)</option>
              <option value="PIX">Somente PIX</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Primeira cobrança recorrente em</label>
            <input
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">A cobrança deste mês já foi gerada separadamente.</p>
          </div>
        </div>
        <div className="px-5 py-3 border-t flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button onClick={criar} disabled={salvando} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {salvando ? 'Criando...' : 'Criar Assinatura'}
          </button>
        </div>
      </div>
    </div>
  )
}