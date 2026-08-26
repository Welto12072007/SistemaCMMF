import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Scale, AlertTriangle, FileText, Send, Search, RefreshCw, CheckCircle2, Clock, Download, Settings, CreditCard, Pencil, Check, X, Users, Trash2, Save } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

interface MensalidadeAtualizada {
  id: string
  aluno_id: string
  aluno_nome: string
  cpf: string | null
  telefone: string | null
  referencia: string
  data_vencimento: string
  status: string
  status_cobranca: 'cobranca_interna' | 'encaminhado_juridico' | 'acordo' | 'quitado'
  dias_atraso: number
  valor_base: number
  multa: number
  juros: number
  total_atualizado: number
  disparos_enviados: number
  ultimo_disparo_em: string | null
}

interface Encaminhamento {
  id: string
  aluno_id: string
  encaminhado_em: string
  status: string
  valor_devido_total: number
  qtd_mensalidades: number
  dossie: any
  enviado_advogada_em: string | null
}

interface Config {
  multa_pct: number
  juros_mes_pct: number
  dias_disparo_1: number
  dias_disparo_2: number
  dias_juridico: number
  max_mensalidades_juridico: number
  advogada_nome: string
  advogada_telefone: string
  notificar_advogada_ativo: boolean
}

interface AsaasCustomer {
  customerId: string
  name: string
  cpfCnpj: string
  phone: string
  total: number
  count: number
  oldest: string
  subscription: boolean
  charges: { id: string; value: number; dueDate: string; description: string }[]
}

interface AsaasResponse {
  total: number
  customers: number
  totalValue: number
  date: string
  data: AsaasCustomer[]
}

interface AsaasSub {
  id: string
  customer: string
  name: string
  cpfCnpj: string
  phone: string
  value: number
  cycle: string
  nextDueDate: string
  billingType: string
  status: string
  description: string
}

const STATUS_COBRANCA_BADGE: Record<string, string> = {
  cobranca_interna: 'bg-yellow-100 text-yellow-800',
  encaminhado_juridico: 'bg-red-100 text-red-800',
  acordo: 'bg-blue-100 text-blue-800',
  quitado: 'bg-green-100 text-green-800',
}

const STATUS_COBRANCA_LABEL: Record<string, string> = {
  cobranca_interna: 'Cobrança Interna',
  encaminhado_juridico: 'Jurídico',
  acordo: 'Acordo',
  quitado: 'Quitado',
}

function brl(v: number) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatBR(date: string | null) {
  if (!date) return '—'
  const [y, m, d] = date.split('-')
  return `${d}/${m}/${y}`
}

export default function Cobranca() {
  const [tab, setTab] = useState<'inadimplentes' | 'asaas' | 'assinaturas' | 'juridico' | 'config'>('inadimplentes')
  const [items, setItems] = useState<MensalidadeAtualizada[]>([])
  const [enc, setEnc] = useState<Encaminhamento[]>([])
  const [cfg, setCfg] = useState<Config | null>(null)
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [rodando, setRodando] = useState(false)
  const [dossie, setDossie] = useState<Encaminhamento | null>(null)
  const [asaasData, setAsaasData] = useState<AsaasResponse | null>(null)
  const [asaasLoading, setAsaasLoading] = useState(false)
  const [asaasBusca, setAsaasBusca] = useState('')
  const [subs, setSubs] = useState<AsaasSub[]>([])
  const [subsLoading, setSubsLoading] = useState(false)
  const [subsBusca, setSubsBusca] = useState('')
  const [editingSub, setEditingSub] = useState<string | null>(null)
  const [editValues, setEditValues] = useState<{ value: string; nextDueDate: string; billingType: string }>({ value: '', nextDueDate: '', billingType: '' })
  const [savingSub, setSavingSub] = useState(false)
  const [generatingSub, setGeneratingSub] = useState<string | null>(null)
  const [editingInad, setEditingInad] = useState<string | null>(null)
  const [editInad, setEditInad] = useState<{ valor_base: string; referencia: string; data_vencimento: string }>({ valor_base: '', referencia: '', data_vencimento: '' })
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [excluindoLote, setExcluindoLote] = useState(false)

  useEffect(() => {
    if (tab === 'inadimplentes') loadInadimplentes()
    else if (tab === 'asaas') loadAsaas()
    else if (tab === 'assinaturas') loadSubs()
    else if (tab === 'juridico') loadJuridico()
    else loadConfig()
  }, [tab])

  async function loadSubs() {
    setSubsLoading(true)
    try {
      const resp = await fetch('/api/asaas-assinaturas')
      if (!resp.ok) throw new Error('Erro ao buscar assinaturas')
      const data = await resp.json()
      setSubs(data.data || [])
    } catch (err: any) {
      console.error(err)
      alert('Erro ao carregar assinaturas: ' + err.message)
    }
    setSubsLoading(false)
  }

  function startEditSub(sub: AsaasSub) {
    setEditingSub(sub.id)
    setEditValues({
      value: sub.value.toString(),
      nextDueDate: sub.nextDueDate,
      billingType: sub.billingType,
    })
  }

  async function saveSubEdit() {
    if (!editingSub) return
    const val = parseFloat(editValues.value)
    if (isNaN(val) || val <= 0) { alert('Valor inválido'); return }
    setSavingSub(true)
    try {
      const resp = await fetch('/api/asaas-assinaturas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingSub,
          value: val,
          nextDueDate: editValues.nextDueDate,
          billingType: editValues.billingType,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Erro ao salvar')
      setSubs(prev => prev.map(s => s.id === editingSub ? { ...s, value: val, nextDueDate: editValues.nextDueDate, billingType: editValues.billingType } : s))
      setEditingSub(null)
    } catch (err: any) {
      alert('Erro: ' + err.message)
    }
    setSavingSub(false)
  }

  async function gerarCobranca(sub: AsaasSub) {
    const dueDate = prompt('Data de vencimento (AAAA-MM-DD):', sub.nextDueDate)
    if (!dueDate) return
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) { alert('Data inválida. Use formato AAAA-MM-DD'); return }
    setGeneratingSub(sub.id)
    try {
      const resp = await fetch('/api/asaas-assinaturas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: sub.customer,
          value: sub.value,
          dueDate,
          billingType: sub.billingType === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'BOLETO',
          description: `Mensalidade mensal — CMMF`,
        }),
      })
      const data = await resp.json()
      if (!resp.ok) throw new Error(data.error || 'Erro ao gerar cobrança')
      alert(`Cobrança de ${brl(sub.value)} gerada para ${sub.name} com vencimento ${formatBR(dueDate)}`)
    } catch (err: any) {
      alert('Erro: ' + err.message)
    }
    setGeneratingSub(null)
  }

  async function loadAsaas() {
    setAsaasLoading(true)
    try {
      const resp = await fetch('/api/asaas-inadimplentes')
      if (!resp.ok) throw new Error('Erro ao buscar inadimplentes do Asaas')
      const data: AsaasResponse = await resp.json()
      setAsaasData(data)
    } catch (err: any) {
      console.error(err)
      alert('Erro ao carregar inadimplentes Asaas: ' + err.message)
    }
    setAsaasLoading(false)
  }

  async function loadInadimplentes() {
    setLoading(true)
    const { data, error } = await supabase
      .from('vw_mensalidades_atualizado')
      .select('*')
      .gt('dias_atraso', 0)
      .neq('status', 'pago')
      .order('dias_atraso', { ascending: false })
    if (error) console.error(error)
    setItems((data || []) as MensalidadeAtualizada[])
    setLoading(false)
  }

  async function loadJuridico() {
    setLoading(true)
    const { data, error } = await supabase
      .from('juridico_encaminhamentos')
      .select('*')
      .order('encaminhado_em', { ascending: false })
    if (error) console.error(error)
    setEnc((data || []) as Encaminhamento[])
    setLoading(false)
  }

  async function loadConfig() {
    const { data, error } = await supabase.from('cobranca_config').select('*').eq('id', 1).maybeSingle()
    if (error) console.error(error)
    setCfg(data as Config | null)
  }

  async function saveConfig() {
    if (!cfg) return
    const { error } = await supabase.from('cobranca_config').update(cfg).eq('id', 1)
    if (error) alert('Erro ao salvar: ' + error.message)
    else alert('Configurações salvas!')
  }

  async function rodarCobranca() {
    if (!confirm('Rodar cobrança automática agora? Isso enfileirará disparos para todos os inadimplentes que atingem os critérios.')) return
    setRodando(true)
    const { data, error } = await supabase.rpc('rodar_cobranca_inadimplentes')
    setRodando(false)
    if (error) {
      alert('Erro: ' + error.message)
      return
    }
    alert(`✅ ${data?.disparos_enfileirados || 0} disparos enfileirados\n⚖️ ${data?.encaminhados_juridico || 0} casos encaminhados ao jurídico`)
    loadInadimplentes()
  }

  async function encaminharAluno(aluno_id: string, nome: string) {
    if (!confirm(`Encaminhar ${nome} ao jurídico agora? Será gerado um dossiê com todas as mensalidades em aberto.`)) return
    const { data, error } = await supabase.rpc('encaminhar_juridico', { p_aluno_id: aluno_id, p_encaminhado_por: 'manual (admin)' })
    if (error) { alert('Erro: ' + error.message); return }
    if ((data as any)?.sucesso === false) { alert('Erro: ' + (data as any).erro); return }
    alert(`✅ Encaminhado! Dossiê gerado.\nValor total: ${brl((data as any).valor_total)}\nMensalidades: ${(data as any).qtd_mensalidades}`)
    loadInadimplentes()
  }

  async function alterarStatus(id: string, novoStatus: string) {
    const { error } = await supabase.rpc('marcar_mensalidade_status_cobranca', { p_id: id, p_status: novoStatus })
    if (error) { alert('Erro: ' + error.message); return }
    loadInadimplentes()
  }

  function startEditInad(m: MensalidadeAtualizada) {
    setEditingInad(m.id)
    setEditInad({ valor_base: m.valor_base.toString(), referencia: m.referencia, data_vencimento: m.data_vencimento })
  }

  async function saveEditInad(id: string) {
    const val = parseFloat(editInad.valor_base)
    if (isNaN(val) || val <= 0) { alert('Valor inválido'); return }
    const { error } = await supabase.from('mensalidades').update({
      valor: val,
      referencia: editInad.referencia,
      data_vencimento: editInad.data_vencimento,
    }).eq('id', id)
    if (error) { alert('Erro: ' + error.message); return }
    setEditingInad(null)
    loadInadimplentes()
  }

  async function excluirInad(m: MensalidadeAtualizada) {
    const { data: row } = await supabase.from('mensalidades').select('asaas_charge_id').eq('id', m.id).maybeSingle()
    const chargeId = (row as any)?.asaas_charge_id as string | null

    const msg = chargeId
      ? `Excluir mensalidade de ${m.aluno_nome} ref. ${formatBR(m.referencia)}?\n\n⚠️ A cobrança também será CANCELADA no Asaas.\n\nEssa ação não pode ser desfeita.`
      : `Excluir mensalidade de ${m.aluno_nome} ref. ${formatBR(m.referencia)}?\nEssa ação não pode ser desfeita.`
    if (!confirm(msg)) return

    if (chargeId) {
      try {
        const resp = await fetch('/api/asaas-cancelar-cobranca', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chargeId }),
        })
        const data = await resp.json()
        if (!resp.ok && !confirm(`Não foi possível cancelar no Asaas:\n${data.error}\n\nExcluir mesmo assim do sistema?`)) return
      } catch (err: any) {
        if (!confirm(`Erro ao contatar o Asaas:\n${err.message}\n\nExcluir mesmo assim do sistema?`)) return
      }
    }

    const { error } = await supabase.from('mensalidades').delete().eq('id', m.id)
    if (error) { alert('Erro: ' + error.message); return }
    loadInadimplentes()
  }

  function toggleSelecionado(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleTodos() {
    setSelecionados(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(m => m.id)))
  }

  async function excluirSelecionados() {
    const ids = [...selecionados]
    if (ids.length === 0) return
    if (!confirm(`Excluir ${ids.length} mensalidade(s)?\n\n⚠️ As cobranças com link do Asaas também serão CANCELADAS lá.\n\nEssa ação não pode ser desfeita.`)) return

    setExcluindoLote(true)
    const { data: rows } = await supabase.from('mensalidades').select('id, asaas_charge_id').in('id', ids)
    const comCobranca = (rows || []).filter((r: any) => r.asaas_charge_id)

    let falhasAsaas = 0
    for (const r of comCobranca as any[]) {
      try {
        const resp = await fetch('/api/asaas-cancelar-cobranca', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chargeId: r.asaas_charge_id }),
        })
        if (!resp.ok) falhasAsaas++
      } catch { falhasAsaas++ }
    }

    const { error } = await supabase.from('mensalidades').delete().in('id', ids)
    setExcluindoLote(false)
    if (error) { alert('Erro ao excluir: ' + error.message); return }

    setSelecionados(new Set())
    alert(`✅ ${ids.length} mensalidade(s) excluída(s).${falhasAsaas > 0 ? `\n⚠️ ${falhasAsaas} cobrança(s) não puderam ser canceladas no Asaas (provavelmente já pagas).` : ''}`)
    loadInadimplentes()
  }

  function exportarDossiePDF(e: Encaminhamento) {
    const d = e.dossie
    const aluno = d.aluno || {}
    const plano = d.plano || {}
    const mensalidades: any[] = d.mensalidades_pendentes || []
    const aulas: any[] = d.aulas_regulares || []

    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    let y = 16

    // Cabeçalho
    doc.setFillColor(30, 64, 175)
    doc.rect(0, 0, pageWidth, 28, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('DOSSIÊ DE COBRANÇA JURÍDICA', 14, 12)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(`Centro de Música Murilo Finger  |  Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 20)
    doc.text(`Encaminhado em: ${new Date(e.encaminhado_em).toLocaleString('pt-BR')}`, 14, 26)

    doc.setTextColor(30, 30, 30)
    y = 36

    // Advogada
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Advogada responsável:', 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text('Ana Clara Pinheiro Silva  |  +55 51 99850-0205', 60, y)
    y += 10

    // Dados do aluno
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('1. Dados do Aluno', 14, y)
    y += 2
    doc.setDrawColor(30, 64, 175)
    doc.line(14, y, pageWidth - 14, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)

    const dadosAluno: [string, string][] = [
      ['Nome completo', aluno.nome || '—'],
      ['CPF', aluno.cpf || '—'],
      ['Telefone / WhatsApp', aluno.telefone || '—'],
      ['E-mail', aluno.email || '—'],
      ['Endereço', aluno.endereco || '—'],
      ['Data de matrícula', aluno.data_matricula ? formatBR(aluno.data_matricula) : '—'],
    ]
    dadosAluno.forEach(([label, val]) => {
      doc.setFont('helvetica', 'bold')
      doc.text(label + ':', 14, y)
      doc.setFont('helvetica', 'normal')
      doc.text(val, 60, y)
      y += 5.5
    })
    y += 2

    // Plano / aulas
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('2. Plano Contratado & Horários', 14, y)
    y += 2
    doc.setDrawColor(30, 64, 175)
    doc.line(14, y, pageWidth - 14, y)
    y += 5

    doc.setFontSize(9)
    const dadosPlano: [string, string][] = [
      ['Instrumento', plano.instrumento || aluno.instrumento_interesse || '—'],
      ['Valor mensalidade', brl(plano.valor_mensalidade || 0)],
      ['Forma de pagamento', plano.forma_pagamento || '—'],
    ]
    dadosPlano.forEach(([label, val]) => {
      doc.setFont('helvetica', 'bold')
      doc.text(label + ':', 14, y)
      doc.setFont('helvetica', 'normal')
      doc.text(val, 60, y)
      y += 5.5
    })
    y += 2

    if (aulas.length > 0) {
      autoTable(doc, {
        startY: y,
        head: [['Dia', 'Horário', 'Instrumento', 'Professor']],
        body: aulas.map((a: any) => [a.dia_semana || '—', a.hora_inicio || '—', a.instrumento || '—', a.professor || '—']),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [55, 65, 81] },
        margin: { left: 14, right: 14 },
      })
      y = (doc as any).lastAutoTable.finalY + 6
    }

    // Mensalidades pendentes
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(`3. Mensalidades em Aberto (${mensalidades.length})`, 14, y)
    y += 2
    doc.setDrawColor(30, 64, 175)
    doc.line(14, y, pageWidth - 14, y)
    y += 4

    autoTable(doc, {
      startY: y,
      head: [['Referência', 'Vencimento', 'Dias atraso', 'Valor original', 'Multa (2%)', 'Juros', 'Total']],
      body: mensalidades.map((m: any) => [
        m.referencia ? formatBR(m.referencia) : '—',
        m.data_vencimento ? formatBR(m.data_vencimento) : '—',
        String(m.dias_atraso || 0),
        brl(m.valor_original || 0),
        brl(m.multa || 0),
        brl(m.juros || 0),
        brl(m.total || 0),
      ]),
      foot: [['', '', '', '', '', 'TOTAL DEVIDO', brl(d.valor_devido_total || 0)]],
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 38, 38] },
      footStyles: { fontStyle: 'bold', fillColor: [254, 226, 226], textColor: [153, 27, 27] },
      margin: { left: 14, right: 14 },
    })

    y = (doc as any).lastAutoTable.finalY + 10

    // Rodapé
    doc.setFontSize(8)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(100)
    doc.text('Este documento é confidencial e destinado exclusivamente para fins de cobrança judicial.', 14, y)

    const safeName = (aluno.nome || 'desconhecido').replace(/\s+/g, '-').toLowerCase()
    doc.save(`dossie-juridico-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filtroStatus !== 'todos' && i.status_cobranca !== filtroStatus) return false
      if (busca && !i.aluno_nome.toLowerCase().includes(busca.toLowerCase())) return false
      return true
    })
  }, [items, filtroStatus, busca])

  const kpis = useMemo(() => ({
    total: items.length,
    valor: items.reduce((s, i) => s + (i.total_atualizado || 0), 0),
    juridico: items.filter(i => i.status_cobranca === 'encaminhado_juridico').length,
    interna: items.filter(i => i.status_cobranca === 'cobranca_interna').length,
  }), [items])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cobrança & Jurídico</h1>
          <p className="text-gray-500">Inadimplência com multa, juros e encaminhamento à advogada</p>
        </div>
        <button
          onClick={rodarCobranca}
          disabled={rodando}
          className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded-lg hover:bg-brand-600 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${rodando ? 'animate-spin' : ''}`} />
          {rodando ? 'Rodando...' : 'Rodar cobrança automática'}
        </button>
      </div>

      <div className="flex gap-1 border-b">
        {[
          { k: 'inadimplentes', label: 'Inadimplentes', icon: AlertTriangle },
          { k: 'asaas', label: 'Asaas', icon: CreditCard },
          { k: 'assinaturas', label: 'Assinaturas', icon: Users },
          { k: 'juridico', label: 'Jurídico', icon: Scale },
          { k: 'config', label: 'Configurações', icon: Settings },
        ].map(t => (
          <button key={t.k} onClick={() => setTab(t.k as any)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t.k ? 'border-brand-500 text-brand-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'inadimplentes' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">Inadimplentes</div><div className="text-2xl font-bold">{kpis.total}</div></div>
            <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">Valor a receber</div><div className="text-2xl font-bold text-red-600">{brl(kpis.valor)}</div></div>
            <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">Em cobrança interna</div><div className="text-2xl font-bold text-yellow-700">{kpis.interna}</div></div>
            <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">No jurídico</div><div className="text-2xl font-bold text-red-700">{kpis.juridico}</div></div>
          </div>

          <div className="flex gap-3 flex-wrap">
            <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
              <option value="todos">Todos os status</option>
              <option value="cobranca_interna">Cobrança interna</option>
              <option value="encaminhado_juridico">Jurídico</option>
              <option value="acordo">Acordo</option>
              <option value="quitado">Quitado</option>
            </select>
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar aluno..." className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm" />
            </div>
          </div>

          {selecionados.size > 0 && (
            <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <span className="text-sm text-red-800 font-medium">{selecionados.size} selecionada(s)</span>
              <div className="flex gap-2">
                <button onClick={() => setSelecionados(new Set())}
                  className="text-sm px-3 py-1.5 border rounded-lg hover:bg-white">
                  Limpar seleção
                </button>
                <button onClick={excluirSelecionados} disabled={excluindoLote}
                  className="flex items-center gap-2 text-sm px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                  <Trash2 className="w-4 h-4" />
                  {excluindoLote ? 'Excluindo...' : 'Excluir selecionadas'}
                </button>
              </div>
            </div>
          )}

          <div className="bg-white border rounded-xl overflow-x-auto">
            {loading ? <div className="p-8 text-center text-gray-500">Carregando...</div> : filtered.length === 0 ? <div className="p-8 text-center text-gray-500">Nenhum inadimplente.</div> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="p-3 w-10">
                      <input type="checkbox"
                        checked={filtered.length > 0 && selecionados.size === filtered.length}
                        onChange={toggleTodos}
                        className="w-4 h-4 cursor-pointer"
                        title="Selecionar todos" />
                    </th>
                    <th className="text-left p-3">Aluno</th>
                    <th className="text-left p-3">Referência</th>
                    <th className="text-left p-3">Vencimento</th>
                    <th className="text-right p-3">Dias atraso</th>
                    <th className="text-right p-3">Original</th>
                    <th className="text-right p-3">Multa</th>
                    <th className="text-right p-3">Juros</th>
                    <th className="text-right p-3">Total</th>
                    <th className="text-center p-3">Disparos</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-center p-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(m => (
                    <tr key={m.id} className={`border-t hover:bg-gray-50 ${selecionados.has(m.id) ? 'bg-red-50' : ''}`}>
                      <td className="p-3">
                        <input type="checkbox"
                          checked={selecionados.has(m.id)}
                          onChange={() => toggleSelecionado(m.id)}
                          className="w-4 h-4 cursor-pointer" />
                      </td>
                      <td className="p-3 font-medium">{m.aluno_nome}<div className="text-xs text-gray-500">{m.telefone || '—'}</div></td>
                      {editingInad === m.id ? (
                        <>
                          <td className="p-3"><input type="month" value={editInad.referencia} onChange={e => setEditInad({ ...editInad, referencia: e.target.value })} className="border rounded px-2 py-1 text-xs w-32" /></td>
                          <td className="p-3"><input type="date" value={editInad.data_vencimento} onChange={e => setEditInad({ ...editInad, data_vencimento: e.target.value })} className="border rounded px-2 py-1 text-xs w-32" /></td>
                          <td className="p-3 text-right font-bold text-red-600">{m.dias_atraso}</td>
                          <td className="p-3"><input type="number" step="0.01" value={editInad.valor_base} onChange={e => setEditInad({ ...editInad, valor_base: e.target.value })} className="border rounded px-2 py-1 text-xs w-20 text-right" /></td>
                          <td className="p-3 text-right text-orange-700">{brl(m.multa)}</td>
                          <td className="p-3 text-right text-orange-700">{brl(m.juros)}</td>
                          <td className="p-3 text-right font-bold">{brl(m.total_atualizado)}</td>
                          <td className="p-3 text-center">{m.disparos_enviados}</td>
                          <td className="p-3">
                            <select value={m.status_cobranca} onChange={e => alterarStatus(m.id, e.target.value)}
                              className={`text-xs px-2 py-1 rounded ${STATUS_COBRANCA_BADGE[m.status_cobranca]}`}>
                              {Object.entries(STATUS_COBRANCA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => saveEditInad(m.id)} className="text-xs px-2 py-1 bg-green-600 text-white rounded hover:bg-green-700" title="Salvar"><Save className="w-3 h-3 inline" /></button>
                              <button onClick={() => setEditingInad(null)} className="text-xs px-2 py-1 border rounded hover:bg-gray-100" title="Cancelar"><X className="w-3 h-3 inline" /></button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-3">{formatBR(m.referencia)}</td>
                          <td className="p-3">{formatBR(m.data_vencimento)}</td>
                          <td className="p-3 text-right font-bold text-red-600">{m.dias_atraso}</td>
                          <td className="p-3 text-right">{brl(m.valor_base)}</td>
                          <td className="p-3 text-right text-orange-700">{brl(m.multa)}</td>
                          <td className="p-3 text-right text-orange-700">{brl(m.juros)}</td>
                          <td className="p-3 text-right font-bold">{brl(m.total_atualizado)}</td>
                          <td className="p-3 text-center">{m.disparos_enviados}</td>
                          <td className="p-3">
                            <select value={m.status_cobranca} onChange={e => alterarStatus(m.id, e.target.value)}
                              className={`text-xs px-2 py-1 rounded ${STATUS_COBRANCA_BADGE[m.status_cobranca]}`}>
                              {Object.entries(STATUS_COBRANCA_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                          </td>
                          <td className="p-3 text-center">
                            <div className="flex gap-1 justify-center">
                              <button onClick={() => startEditInad(m)} className="text-xs px-2 py-1 border rounded hover:bg-gray-100" title="Editar"><Pencil className="w-3 h-3 inline" /></button>
                              <button onClick={() => excluirInad(m)} className="text-xs px-2 py-1 border border-red-300 text-red-600 rounded hover:bg-red-50" title="Excluir"><Trash2 className="w-3 h-3 inline" /></button>
                              {m.status_cobranca !== 'encaminhado_juridico' && m.status_cobranca !== 'quitado' && (
                                <button onClick={() => encaminharAluno(m.aluno_id, m.aluno_nome)}
                                  className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                                  title="Encaminhar ao jurídico">
                                  <Scale className="w-3 h-3 inline" />
                                </button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'asaas' && (
        <>
          {asaasLoading ? (
            <div className="p-8 text-center text-gray-500">Carregando dados do Asaas...</div>
          ) : !asaasData ? (
            <div className="p-8 text-center text-gray-500">Nenhum dado carregado.</div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">Clientes inadimplentes</div><div className="text-2xl font-bold">{asaasData.customers}</div></div>
                <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">Total cobranças vencidas</div><div className="text-2xl font-bold">{asaasData.total}</div></div>
                <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">Valor total em aberto</div><div className="text-2xl font-bold text-red-600">{brl(asaasData.totalValue)}</div></div>
              </div>

              <div className="flex gap-3 flex-wrap items-center">
                <div className="relative flex-1 min-w-[240px]">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                  <input value={asaasBusca} onChange={e => setAsaasBusca(e.target.value)} placeholder="Buscar cliente..." className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm" />
                </div>
                <button onClick={loadAsaas} className="flex items-center gap-2 text-sm px-3 py-2 border rounded-lg hover:bg-gray-50">
                  <RefreshCw className={`w-4 h-4 ${asaasLoading ? 'animate-spin' : ''}`} /> Atualizar
                </button>
              </div>

              <div className="bg-white border rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                    <tr>
                      <th className="text-left p-3">Cliente</th>
                      <th className="text-left p-3">CPF/CNPJ</th>
                      <th className="text-left p-3">Telefone</th>
                      <th className="text-center p-3">Cobranças</th>
                      <th className="text-right p-3">Total</th>
                      <th className="text-left p-3">Desde</th>
                      <th className="text-center p-3">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {asaasData.data
                      .filter(c => !asaasBusca || c.name?.toLowerCase().includes(asaasBusca.toLowerCase()))
                      .map(c => {
                        const diasAtraso = Math.floor((Date.now() - new Date(c.oldest + 'T12:00:00').getTime()) / 86400000)
                        return (
                          <tr key={c.customerId} className="border-t hover:bg-gray-50">
                            <td className="p-3 font-medium">{c.name || c.customerId}</td>
                            <td className="p-3 text-gray-600">{c.cpfCnpj || '—'}</td>
                            <td className="p-3 text-gray-600">{c.phone || '—'}</td>
                            <td className="p-3 text-center">
                              <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-bold">{c.count}</span>
                            </td>
                            <td className="p-3 text-right font-bold text-red-600">{brl(c.total)}</td>
                            <td className="p-3">
                              <span>{formatBR(c.oldest)}</span>
                              <span className="text-xs text-red-500 ml-1">({diasAtraso}d)</span>
                            </td>
                            <td className="p-3 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded ${c.subscription ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                {c.subscription ? 'Assinatura' : 'Avulsa'}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-gray-400">Dados atualizados em {asaasData.date} — fonte: Asaas API (cobranças com status OVERDUE)</p>
            </>
          )}
        </>
      )}

      {tab === 'assinaturas' && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">Total assinaturas</div><div className="text-2xl font-bold">{subs.length}</div></div>
            <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">Receita mensal</div><div className="text-2xl font-bold text-green-600">{brl(subs.reduce((s, x) => s + x.value, 0))}</div></div>
            <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">Cartão de crédito</div><div className="text-2xl font-bold">{subs.filter(s => s.billingType === 'CREDIT_CARD').length}</div></div>
            <div className="bg-white border rounded-xl p-4"><div className="text-xs text-gray-500">PIX / Boleto</div><div className="text-2xl font-bold">{subs.filter(s => s.billingType !== 'CREDIT_CARD').length}</div></div>
          </div>

          <div className="flex gap-3 flex-wrap items-center">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
              <input value={subsBusca} onChange={e => setSubsBusca(e.target.value)} placeholder="Buscar aluno..." className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm" />
            </div>
            <button onClick={loadSubs} className="flex items-center gap-2 text-sm px-3 py-2 border rounded-lg hover:bg-gray-50">
              <RefreshCw className={`w-4 h-4 ${subsLoading ? 'animate-spin' : ''}`} /> Atualizar
            </button>
          </div>

          <div className="bg-white border rounded-xl overflow-x-auto">
            {subsLoading ? <div className="p-8 text-center text-gray-500">Carregando assinaturas...</div> : subs.length === 0 ? <div className="p-8 text-center text-gray-500">Nenhuma assinatura encontrada.</div> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                  <tr>
                    <th className="text-left p-3">Aluno</th>
                    <th className="text-left p-3">CPF/CNPJ</th>
                    <th className="text-right p-3">Valor</th>
                    <th className="text-center p-3">Tipo</th>
                    <th className="text-left p-3">Próx. vencimento</th>
                    <th className="text-center p-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {subs
                    .filter(s => !subsBusca || s.name?.toLowerCase().includes(subsBusca.toLowerCase()))
                    .map(s => (
                      <tr key={s.id} className="border-t hover:bg-gray-50">
                        <td className="p-3 font-medium">
                          {s.name || s.customer}
                          <div className="text-xs text-gray-500">{s.phone || '—'}</div>
                        </td>
                        <td className="p-3 text-gray-600 text-xs">{s.cpfCnpj || '—'}</td>
                        {editingSub === s.id ? (
                          <>
                            <td className="p-3">
                              <input type="number" step="0.01" value={editValues.value}
                                onChange={e => setEditValues({ ...editValues, value: e.target.value })}
                                className="w-24 border rounded px-2 py-1 text-sm text-right" />
                            </td>
                            <td className="p-3">
                              <select value={editValues.billingType}
                                onChange={e => setEditValues({ ...editValues, billingType: e.target.value })}
                                className="border rounded px-2 py-1 text-xs">
                                <option value="UNDEFINED">Boleto/PIX</option>
                                <option value="CREDIT_CARD">Cartão</option>
                                <option value="PIX">PIX</option>
                                <option value="BOLETO">Boleto</option>
                              </select>
                            </td>
                            <td className="p-3">
                              <input type="date" value={editValues.nextDueDate}
                                onChange={e => setEditValues({ ...editValues, nextDueDate: e.target.value })}
                                className="border rounded px-2 py-1 text-xs" />
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex gap-1 justify-center">
                                <button onClick={saveSubEdit} disabled={savingSub}
                                  className="text-green-600 hover:text-green-800 p-1" title="Salvar">
                                  <Check className="w-4 h-4" />
                                </button>
                                <button onClick={() => setEditingSub(null)}
                                  className="text-gray-400 hover:text-gray-600 p-1" title="Cancelar">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="p-3 text-right font-bold">{brl(s.value)}</td>
                            <td className="p-3 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded ${s.billingType === 'CREDIT_CARD' ? 'bg-purple-100 text-purple-700' : s.billingType === 'PIX' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                {s.billingType === 'CREDIT_CARD' ? 'Cartão' : s.billingType === 'PIX' ? 'PIX' : 'Boleto/PIX'}
                              </span>
                            </td>
                            <td className="p-3">{formatBR(s.nextDueDate)}</td>
                            <td className="p-3 text-center">
                              <div className="flex gap-1 justify-center">
                                <button onClick={() => startEditSub(s)}
                                  className="text-xs px-2 py-1 border rounded hover:bg-gray-100 flex items-center gap-1">
                                  <Pencil className="w-3 h-3" /> Editar
                                </button>
                                <button onClick={() => gerarCobranca(s)} disabled={generatingSub === s.id}
                                  className="text-xs px-2 py-1 border rounded hover:bg-blue-50 text-blue-600 flex items-center gap-1">
                                  <CreditCard className="w-3 h-3" /> {generatingSub === s.id ? '...' : 'Gerar'}
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>

          <p className="text-xs text-gray-400">Alterações de valor e vencimento são sincronizadas diretamente com o Asaas.</p>
        </>
      )}

      {tab === 'juridico' && (
        <div className="bg-white border rounded-xl overflow-x-auto">
          {loading ? <div className="p-8 text-center text-gray-500">Carregando...</div> : enc.length === 0 ? <div className="p-8 text-center text-gray-500">Nenhum caso encaminhado.</div> : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="text-left p-3">Aluno</th>
                  <th className="text-left p-3">CPF</th>
                  <th className="text-left p-3">Encaminhado em</th>
                  <th className="text-right p-3">Mensalidades</th>
                  <th className="text-right p-3">Valor total</th>
                  <th className="text-left p-3">Status</th>
                  <th className="text-center p-3">Dossiê</th>
                </tr>
              </thead>
              <tbody>
                {enc.map(e => (
                  <tr key={e.id} className="border-t hover:bg-gray-50">
                    <td className="p-3 font-medium">{e.dossie?.aluno?.nome || '—'}</td>
                    <td className="p-3">{e.dossie?.aluno?.cpf || '—'}</td>
                    <td className="p-3">{new Date(e.encaminhado_em).toLocaleString('pt-BR')}</td>
                    <td className="p-3 text-right">{e.qtd_mensalidades}</td>
                    <td className="p-3 text-right font-bold text-red-600">{brl(e.valor_devido_total)}</td>
                    <td className="p-3"><span className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-800">{e.status}</span></td>
                    <td className="p-3 text-center">
                      <div className="flex gap-1 justify-center">
                        <button onClick={() => setDossie(e)} className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300" title="Ver dossiê"><FileText className="w-3 h-3 inline" /> Ver</button>
                        <button onClick={() => exportarDossiePDF(e)} className="text-xs px-2 py-1 bg-brand-500 text-white rounded hover:bg-brand-600" title="Imprimir/PDF"><Download className="w-3 h-3 inline" /> PDF</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'config' && cfg && (
        <div className="bg-white border rounded-xl p-6 max-w-2xl space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <label className="block text-sm">Multa (%)<input type="number" step="0.01" value={cfg.multa_pct} onChange={e => setCfg({ ...cfg, multa_pct: parseFloat(e.target.value) })} className="mt-1 w-full border rounded px-3 py-2" /></label>
            <label className="block text-sm">Juros ao mês (%)<input type="number" step="0.01" value={cfg.juros_mes_pct} onChange={e => setCfg({ ...cfg, juros_mes_pct: parseFloat(e.target.value) })} className="mt-1 w-full border rounded px-3 py-2" /></label>
            <label className="block text-sm">1º disparo após (dias)<input type="number" value={cfg.dias_disparo_1} onChange={e => setCfg({ ...cfg, dias_disparo_1: parseInt(e.target.value) })} className="mt-1 w-full border rounded px-3 py-2" /></label>
            <label className="block text-sm">2º disparo após (dias)<input type="number" value={cfg.dias_disparo_2} onChange={e => setCfg({ ...cfg, dias_disparo_2: parseInt(e.target.value) })} className="mt-1 w-full border rounded px-3 py-2" /></label>
            <label className="block text-sm">Encaminhar ao jurídico após (dias)<input type="number" value={cfg.dias_juridico} onChange={e => setCfg({ ...cfg, dias_juridico: parseInt(e.target.value) })} className="mt-1 w-full border rounded px-3 py-2" /></label>
            <label className="block text-sm">Ou após N mensalidades em atraso<input type="number" value={cfg.max_mensalidades_juridico} onChange={e => setCfg({ ...cfg, max_mensalidades_juridico: parseInt(e.target.value) })} className="mt-1 w-full border rounded px-3 py-2" /></label>
            <label className="block text-sm col-span-2">Advogada (nome)<input value={cfg.advogada_nome} onChange={e => setCfg({ ...cfg, advogada_nome: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" /></label>
            <label className="block text-sm">Telefone<input value={cfg.advogada_telefone} onChange={e => setCfg({ ...cfg, advogada_telefone: e.target.value })} className="mt-1 w-full border rounded px-3 py-2" /></label>
          </div>
          <label className="flex items-center gap-2 text-sm bg-gray-50 border rounded-lg px-3 py-2">
            <input type="checkbox" checked={cfg.notificar_advogada_ativo} onChange={e => setCfg({ ...cfg, notificar_advogada_ativo: e.target.checked })} />
            Avisar a advogada automaticamente por WhatsApp ao encaminhar um caso (desligado por padrão)
          </label>
          <button onClick={saveConfig} className="bg-brand-500 text-white px-4 py-2 rounded hover:bg-brand-600">Salvar configurações</button>
        </div>
      )}

      {dossie && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setDossie(null)}>
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">Dossiê - {dossie.dossie?.aluno?.nome}</h2>
              <button onClick={() => setDossie(null)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <pre className="text-xs bg-gray-50 p-4 rounded overflow-x-auto">{JSON.stringify(dossie.dossie, null, 2)}</pre>
            <div className="mt-4 flex gap-2">
              <button onClick={() => exportarDossiePDF(dossie)} className="bg-brand-500 text-white px-4 py-2 rounded hover:bg-brand-600 flex items-center gap-2"><Download className="w-4 h-4" /> Imprimir / PDF</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
