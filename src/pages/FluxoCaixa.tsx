import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  TrendingUp, TrendingDown, Wallet, Plus, RefreshCw, Download,
  DollarSign, X, Pencil, Trash2, ChevronDown,
} from 'lucide-react'

// ─── types ────────────────────────────────────────────────────────────────────

interface Lancamento {
  id: string
  tipo: 'receita' | 'despesa'
  categoria: string
  subcategoria?: string
  descricao: string
  valor: number
  data_lancamento: string
  referencia?: string
  recorrente: boolean
  created_at: string
}

interface ResumoMes {
  referencia: string     // YYYY-MM
  label: string          // Mai/2026
  receitas_mensalidades: number
  receitas_outros: number
  salarios: number
  despesas_fixas: number
  despesas_variaveis: number
  total_receitas: number
  total_despesas: number
  saldo: number
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function refToLabel(ref: string) {
  const parts = ref.split('-')
  const ano = parts[0] ?? ''
  const mes = parts[1] ?? '01'
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${meses[parseInt(mes) - 1]}/${ano}`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

const CATEGORIA_LABELS: Record<string, string> = {
  custo_fixo: 'Custo Fixo',
  custo_variavel: 'Custo Variável',
  outras_receitas: 'Outras Receitas',
  salario_professor: 'Salário Professor',
  evento: 'Evento',
  outro: 'Outro',
}

const SUBCATEGORIAS: Record<string, string[]> = {
  custo_fixo: ['Aluguel', 'Água', 'Luz', 'Internet', 'Telefone', 'Contabilidade', 'Seguro', 'Outros fixos'],
  custo_variavel: ['Marketing', 'Materiais', 'Equipamentos', 'Manutenção', 'Limpeza', 'Outros variáveis'],
  outras_receitas: ['Evento', 'Venda de material', 'Taxa de matrícula', 'Outros'],
  salario_professor: [],
  evento: ['Recital', 'Workshop', 'Masterclass', 'Outros'],
  outro: [],
}

// ─── component ────────────────────────────────────────────────────────────────

export default function FluxoCaixa() {
  const { perfil } = useAuth()

  const [loading, setLoading] = useState(true)
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [resumo, setResumo] = useState<ResumoMes[]>([])

  // Mês selecionado para detalhe
  const [mesSelecionado, setMesSelecionado] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // Período de meses para tabela (últimos 6)
  const [mesesVisiveis, setMesesVisiveis] = useState(6)

  // Modal lançamento
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Lancamento | null>(null)
  const [form, setForm] = useState({
    tipo: 'despesa' as 'receita' | 'despesa',
    categoria: 'custo_fixo',
    subcategoria: '',
    descricao: '',
    valor: '',
    data_lancamento: today(),
    recorrente: false,
  })

  const [saving, setSaving] = useState(false)
  const [viewDetalhes, setViewDetalhes] = useState(false)

  // ─── load ──────────────────────────────────────────────────────────────────

  async function load() {
    setLoading(true)

    // Últimos 12 meses
    const meses: string[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      meses.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    const inicioStr = meses[0] + '-01'
    const fimStr = meses[meses.length - 1] + '-31'

    // Busca dados em paralelo
    const [mensRes, profRes, lancRes] = await Promise.all([
      // Mensalidades pagas no período
      supabase
        .from('mensalidades')
        .select('referencia, valor, desconto, valor_pago, status, data_pagamento')
        .eq('status', 'pago')
        .gte('data_pagamento', inicioStr)
        .lte('data_pagamento', fimStr),
      // Professores com tipo (para calcular salários)
      supabase
        .from('professores')
        .select('id, nome, tipo_professor, valor_hora_aula')
        .eq('ativo', true),
      // Lançamentos manuais
      supabase
        .from('lancamentos_caixa')
        .select('*')
        .gte('data_lancamento', inicioStr)
        .lte('data_lancamento', fimStr)
        .order('data_lancamento', { ascending: false }),
    ])

    if (lancRes.data) setLancamentos(lancRes.data)

    // Monta resumo por mês
    const profMap: Record<string, { tipo?: string; valor?: number }> = {}
    ;(profRes.data ?? []).forEach(p => { profMap[p.id] = { tipo: p.tipo_professor, valor: p.valor_hora_aula } })

    // Valor por aula por professor
    const valorAula = (profId: string) => {
      const p = profMap[profId]
      if (p?.valor) return p.valor
      return p?.tipo === 'A' ? 26.66 : 20.00
    }

    const resumoMeses: ResumoMes[] = await Promise.all(
      meses.map(async (ref) => {
        const parts = ref.split('-')
        const ano = parts[0] ?? ''
        const mes = parts[1] ?? '01'
        const inicioMes = `${ref}-01`
        const fimMes = `${ref}-31`

        // Receita mensalidades
        const mensalidades = (mensRes.data ?? []).filter(m => {
          const dp = m.data_pagamento ?? ''
          return dp >= inicioMes && dp <= fimMes
        })
        const receitaMensalidades = mensalidades.reduce((s, m) => s + (m.valor_pago ?? (m.valor - (m.desconto ?? 0))), 0)

        // Salários professores no mês (baseado em presenças)
        const presRes = await supabase
          .from('presencas')
          .select('professor_id, status')
          .eq('status', 'presente')
          .gte('data_aula', inicioMes)
          .lte('data_aula', fimMes)

        const presencasPorProf: Record<string, number> = {}
        ;(presRes.data ?? []).forEach(p => {
          presencasPorProf[p.professor_id] = (presencasPorProf[p.professor_id] ?? 0) + 1
        })
        const totalSalarios = Object.entries(presencasPorProf)
          .reduce((s, [profId, aulas]) => s + aulas * valorAula(profId), 0)

        // Lançamentos manuais do mês
        const lancMes = (lancRes.data ?? []).filter(l => {
          const ref2 = l.referencia ?? l.data_lancamento.slice(0, 7)
          return ref2 === ref
        })
        const outrasReceitas = lancMes.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0)
        const despesasFixas = lancMes.filter(l => l.tipo === 'despesa' && l.categoria === 'custo_fixo').reduce((s, l) => s + l.valor, 0)
        const despesasVar = lancMes.filter(l => l.tipo === 'despesa' && l.categoria !== 'custo_fixo' && l.categoria !== 'salario_professor').reduce((s, l) => s + l.valor, 0)

        const totalReceitas = receitaMensalidades + outrasReceitas
        const totalDespesas = totalSalarios + despesasFixas + despesasVar
        const saldo = totalReceitas - totalDespesas

        return {
          referencia: ref,
          label: refToLabel(ref),
          receitas_mensalidades: receitaMensalidades,
          receitas_outros: outrasReceitas,
          salarios: totalSalarios,
          despesas_fixas: despesasFixas,
          despesas_variaveis: despesasVar,
          total_receitas: totalReceitas,
          total_despesas: totalDespesas,
          saldo,
        }
      })
    )

    setResumo(resumoMeses)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // ─── modal ────────────────────────────────────────────────────────────────

  function abrirNovo() {
    setEditando(null)
    setForm({
      tipo: 'despesa',
      categoria: 'custo_fixo',
      subcategoria: '',
      descricao: '',
      valor: '',
      data_lancamento: `${mesSelecionado}-01`,
      recorrente: false,
    })
    setShowModal(true)
  }

  function abrirEditar(l: Lancamento) {
    setEditando(l)
    setForm({
      tipo: l.tipo,
      categoria: l.categoria,
      subcategoria: l.subcategoria ?? '',
      descricao: l.descricao,
      valor: String(l.valor),
      data_lancamento: l.data_lancamento,
      recorrente: l.recorrente,
    })
    setShowModal(true)
  }

  async function salvarLancamento() {
    if (!form.descricao || !form.valor || !form.data_lancamento) return
    setSaving(true)
    const payload = {
      tipo: form.tipo,
      categoria: form.categoria,
      subcategoria: form.subcategoria || null,
      descricao: form.descricao,
      valor: parseFloat(form.valor),
      data_lancamento: form.data_lancamento,
      referencia: form.data_lancamento.slice(0, 7),
      recorrente: form.recorrente,
      created_by: perfil?.user_id ?? null,
    }
    if (editando) {
      await supabase.from('lancamentos_caixa').update(payload).eq('id', editando.id)
    } else {
      await supabase.from('lancamentos_caixa').insert(payload)
    }
    setSaving(false)
    setShowModal(false)
    load()
  }

  async function excluirLancamento(id: string) {
    if (!confirm('Excluir este lançamento?')) return
    await supabase.from('lancamentos_caixa').delete().eq('id', id)
    load()
  }

  // ─── export CSV ───────────────────────────────────────────────────────────

  function exportarCSV() {
    const mes = resumo.find(r => r.referencia === mesSelecionado)
    if (!mes) return
    const linhas = [
      ['Tipo', 'Categoria', 'Descrição', 'Valor'],
      ['receita', 'Mensalidades', 'Mensalidades pagas', fmtMoeda(mes.receitas_mensalidades)],
      ['receita', 'Outras receitas', 'Outras receitas', fmtMoeda(mes.receitas_outros)],
      ['despesa', 'Salários', 'Salários professores', fmtMoeda(mes.salarios)],
      ['despesa', 'Custos fixos', 'Custos fixos', fmtMoeda(mes.despesas_fixas)],
      ['despesa', 'Custos variáveis', 'Custos variáveis', fmtMoeda(mes.despesas_variaveis)],
      [],
      ['', '', 'Total receitas', fmtMoeda(mes.total_receitas)],
      ['', '', 'Total despesas', fmtMoeda(mes.total_despesas)],
      ['', '', 'Saldo', fmtMoeda(mes.saldo)],
    ]
    const csv = linhas.map(l => l.join(';')).join('\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fluxo-caixa-${mesSelecionado}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── dados do mês selecionado ─────────────────────────────────────────────

  const mesDados = resumo.find(r => r.referencia === mesSelecionado)
  const lancMesSelecionado = lancamentos.filter(l =>
    (l.referencia ?? l.data_lancamento.slice(0, 7)) === mesSelecionado
  )

  // ─── render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    )
  }

  const mesesMostrar = resumo.slice(-mesesVisiveis)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Wallet className="w-6 h-6 text-emerald-600" />
          <h1 className="text-2xl font-bold text-gray-900">Fluxo de Caixa</h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportarCSV}
            className="flex items-center gap-2 border border-gray-200 text-gray-600 hover:bg-gray-50 px-4 py-2 rounded-lg text-sm"
          >
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
          <button
            onClick={abrirNovo}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Novo Lançamento
          </button>
          <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabela mensal */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">Resumo Mensal</h2>
          <select
            value={mesesVisiveis}
            onChange={e => setMesesVisiveis(parseInt(e.target.value))}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          >
            <option value={3}>Últimos 3 meses</option>
            <option value={6}>Últimos 6 meses</option>
            <option value={12}>Últimos 12 meses</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Mês</th>
                <th className="px-4 py-3 text-right font-medium text-emerald-600">Mensalidades</th>
                <th className="px-4 py-3 text-right font-medium text-emerald-500">Outros Recebidos</th>
                <th className="px-4 py-3 text-right font-medium text-red-500">Salários</th>
                <th className="px-4 py-3 text-right font-medium text-red-400">Fixos</th>
                <th className="px-4 py-3 text-right font-medium text-orange-400">Variáveis</th>
                <th className="px-4 py-3 text-right font-medium text-emerald-700 border-l border-gray-200">Total Rec.</th>
                <th className="px-4 py-3 text-right font-medium text-red-700">Total Desp.</th>
                <th className="px-4 py-3 text-right font-medium border-l border-gray-200">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {mesesMostrar.map(m => (
                <tr
                  key={m.referencia}
                  onClick={() => setMesSelecionado(m.referencia)}
                  className={`cursor-pointer hover:bg-gray-50 transition-colors ${m.referencia === mesSelecionado ? 'bg-emerald-50' : ''}`}
                >
                  <td className="px-4 py-3 font-semibold text-gray-800">
                    {m.label}
                    {m.referencia === mesSelecionado && <span className="ml-2 text-xs text-emerald-600">↓</span>}
                  </td>
                  <td className="px-4 py-3 text-right text-emerald-700">{fmtMoeda(m.receitas_mensalidades)}</td>
                  <td className="px-4 py-3 text-right text-emerald-500">{fmtMoeda(m.receitas_outros)}</td>
                  <td className="px-4 py-3 text-right text-red-500">{fmtMoeda(m.salarios)}</td>
                  <td className="px-4 py-3 text-right text-red-400">{fmtMoeda(m.despesas_fixas)}</td>
                  <td className="px-4 py-3 text-right text-orange-500">{fmtMoeda(m.despesas_variaveis)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-emerald-700 border-l border-gray-100">{fmtMoeda(m.total_receitas)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">{fmtMoeda(m.total_despesas)}</td>
                  <td className={`px-4 py-3 text-right font-bold border-l border-gray-100 ${m.saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmtMoeda(m.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Totais */}
            {mesesMostrar.length > 1 && (() => {
              const totRec = mesesMostrar.reduce((s, m) => s + m.total_receitas, 0)
              const totDesp = mesesMostrar.reduce((s, m) => s + m.total_despesas, 0)
              const totSaldo = totRec - totDesp
              return (
                <tfoot className="bg-gray-100 font-semibold text-xs border-t-2 border-gray-300">
                  <tr>
                    <td className="px-4 py-3 text-gray-600">TOTAL PERÍODO</td>
                    <td className="px-4 py-3 text-right text-emerald-700">{fmtMoeda(mesesMostrar.reduce((s, m) => s + m.receitas_mensalidades, 0))}</td>
                    <td className="px-4 py-3 text-right text-emerald-500">{fmtMoeda(mesesMostrar.reduce((s, m) => s + m.receitas_outros, 0))}</td>
                    <td className="px-4 py-3 text-right text-red-500">{fmtMoeda(mesesMostrar.reduce((s, m) => s + m.salarios, 0))}</td>
                    <td className="px-4 py-3 text-right text-red-400">{fmtMoeda(mesesMostrar.reduce((s, m) => s + m.despesas_fixas, 0))}</td>
                    <td className="px-4 py-3 text-right text-orange-500">{fmtMoeda(mesesMostrar.reduce((s, m) => s + m.despesas_variaveis, 0))}</td>
                    <td className="px-4 py-3 text-right text-emerald-700 border-l border-gray-300">{fmtMoeda(totRec)}</td>
                    <td className="px-4 py-3 text-right text-red-600">{fmtMoeda(totDesp)}</td>
                    <td className={`px-4 py-3 text-right border-l border-gray-300 ${totSaldo >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>{fmtMoeda(totSaldo)}</td>
                  </tr>
                </tfoot>
              )
            })()}
          </table>
        </div>
      </div>

      {/* Detalhe do mês selecionado */}
      {mesDados && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-800">Detalhes — {mesDados.label}</h2>
            <button
              onClick={() => setViewDetalhes(v => !v)}
              className="flex items-center gap-1 text-sm text-brand-600"
            >
              {viewDetalhes ? 'Ocultar lançamentos' : 'Ver lançamentos'} <ChevronDown className={`w-4 h-4 transition-transform ${viewDetalhes ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* KPI cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-gray-500">Total Receitas</span>
              </div>
              <p className="text-xl font-bold text-emerald-600">{fmtMoeda(mesDados.total_receitas)}</p>
              <p className="text-xs text-gray-400 mt-1">Mensalidades + outros</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <span className="text-xs text-gray-500">Total Despesas</span>
              </div>
              <p className="text-xl font-bold text-red-600">{fmtMoeda(mesDados.total_despesas)}</p>
              <p className="text-xs text-gray-400 mt-1">Salários + fixos + variáveis</p>
            </div>
            <div className={`rounded-xl border p-4 ${mesDados.saldo >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Wallet className={`w-4 h-4 ${mesDados.saldo >= 0 ? 'text-emerald-600' : 'text-red-600'}`} />
                <span className="text-xs text-gray-500">Saldo</span>
              </div>
              <p className={`text-xl font-bold ${mesDados.saldo >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {fmtMoeda(mesDados.saldo)}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                {mesDados.saldo >= 0 ? '✅ Positivo' : '⚠️ Negativo'}
              </p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-purple-400" />
                <span className="text-xs text-gray-500">Margem Operacional</span>
              </div>
              <p className="text-xl font-bold text-purple-600">
                {mesDados.total_receitas > 0
                  ? `${((mesDados.saldo / mesDados.total_receitas) * 100).toFixed(1)}%`
                  : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Saldo / receitas totais</p>
            </div>
          </div>

          {/* Lançamentos manuais do mês */}
          {viewDetalhes && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Lançamentos manuais — {mesDados.label}</p>
                <span className="text-xs text-gray-400">{lancMesSelecionado.length} registros</span>
              </div>
              {lancMesSelecionado.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                  <DollarSign className="w-8 h-8 mb-2" />
                  <p className="text-sm">Nenhum lançamento manual neste mês.</p>
                  <button onClick={abrirNovo} className="mt-3 text-sm text-emerald-600 hover:underline">
                    + Adicionar lançamento
                  </button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                    <tr>
                      <th className="px-4 py-3 text-left">Descrição</th>
                      <th className="px-4 py-3 text-left">Categoria</th>
                      <th className="px-4 py-3 text-left">Data</th>
                      <th className="px-4 py-3 text-right">Valor</th>
                      <th className="px-4 py-3 text-center">Tipo</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {lancMesSelecionado.map(l => (
                      <tr key={l.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-900">
                          {l.descricao}
                          {l.subcategoria && <span className="ml-1 text-xs text-gray-400">({l.subcategoria})</span>}
                          {l.recorrente && <span className="ml-1 text-xs bg-gray-100 text-gray-500 px-1 rounded">recorrente</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">{CATEGORIA_LABELS[l.categoria] ?? l.categoria}</td>
                        <td className="px-4 py-3 text-gray-500">
                          {new Date(l.data_lancamento + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold ${l.tipo === 'receita' ? 'text-emerald-600' : 'text-red-600'}`}>
                          {l.tipo === 'receita' ? '+' : '-'} {fmtMoeda(l.valor)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${l.tipo === 'receita' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {l.tipo === 'receita' ? 'Receita' : 'Despesa'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => abrirEditar(l)} className="text-gray-300 hover:text-brand-500">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => excluirLancamento(l.id)} className="text-gray-300 hover:text-red-500">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal Novo/Editar Lançamento */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-500" />
                {editando ? 'Editar Lançamento' : 'Novo Lançamento'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
                  <select
                    value={form.tipo}
                    onChange={e => setForm(f => ({ ...f, tipo: e.target.value as 'receita' | 'despesa' }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="receita">Receita</option>
                    <option value="despesa">Despesa</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Categoria *</label>
                  <select
                    value={form.categoria}
                    onChange={e => setForm(f => ({ ...f, categoria: e.target.value, subcategoria: '' }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    {Object.entries(CATEGORIA_LABELS)
                      .filter(([k]) => form.tipo === 'receita' ? ['outras_receitas', 'evento', 'outro'].includes(k) : ['custo_fixo', 'custo_variavel', 'salario_professor', 'outro'].includes(k))
                      .map(([k, v]) => <option key={k} value={k}>{v ?? k}</option>)
                    }
                  </select>
                </div>
              </div>
              {(SUBCATEGORIAS[form.categoria] ?? []).length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subcategoria</label>
                  <select
                    value={form.subcategoria}
                    onChange={e => setForm(f => ({ ...f, subcategoria: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Selecione...</option>
                    {(SUBCATEGORIAS[form.categoria] ?? []).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
                <input
                  type="text"
                  value={form.descricao}
                  onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Conta de luz março/2026"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.valor}
                    onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
                  <input
                    type="date"
                    value={form.data_lancamento}
                    onChange={e => setForm(f => ({ ...f, data_lancamento: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.recorrente}
                  onChange={e => setForm(f => ({ ...f, recorrente: e.target.checked }))}
                  className="rounded"
                />
                Lançamento recorrente (mensal)
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                Cancelar
              </button>
              <button
                onClick={salvarLancamento}
                disabled={saving || !form.descricao || !form.valor || !form.data_lancamento}
                className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? 'Salvando...' : editando ? 'Salvar' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
