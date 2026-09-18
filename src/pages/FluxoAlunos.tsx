import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Users, TrendingUp, TrendingDown, UserMinus, UserPlus,
  RefreshCw, Download, Calendar, Search, ChevronDown, X,
  BarChart3, AlertTriangle,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts'
import CancelamentoModal from '@/components/CancelamentoModal'

// ─── tipos ─────────────────────────────────────────────────────────────────

interface AlunoFluxo {
  id: string
  nome: string
  instrumento_interesse: string | null
  status: string
  data_matricula: string | null
  data_saida: string | null
  motivo_saida: string | null
  motivo_saida_detalhe: string | null
  taxa_matricula: number
  desconto_matricula: number
  valor_plano: number
  plano_frequencia: number
  professor_nome?: string
  asaas_subscription_id: string | null
}

interface ProfessorFluxo {
  professor_nome: string | null
  alunos_ativos: number
  entradas_mes: number
  saidas_mes: number
  entradas_ano: number
  saidas_ano: number
}

interface MesFluxo {
  mes: string
  entradas: number
  saidas: number
  saldo: number
}

// ─── constantes ────────────────────────────────────────────────────────────

const MOTIVOS_SAIDA = [
  'evasao',
  'termino',
  'trancamento',
  'problema_financeiro',
  'insatisfacao',
  'mudanca_cidade',
  'outro',
]

const MOTIVO_LABELS: Record<string, string> = {
  evasao: 'Evasão',
  termino: 'Término',
  trancamento: 'Trancamento',
  problema_financeiro: 'Prob. Financeiro',
  insatisfacao: 'Insatisfação',
  mudanca_cidade: 'Mudança de Cidade',
  outro: 'Outro',
}

const STATUS_LABELS: Record<string, string> = {
  ativo: 'Ativo',
  inativo: 'Inativo',
  lead: 'Lead',
  agendado: 'Agendado',
  perdido: 'Perdido',
}

// ─── helpers ───────────────────────────────────────────────────────────────

function fmtData(d: string | null) {
  if (!d) return '—'
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

function fmtMoeda(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Calcula valor proporcional quando aluno entra no meio do mês */
function calcProporacional(valorMensal: number, diaInicio: number): number {
  const diasNoMes = new Date(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    0,
  ).getDate()
  const diasRestantes = diasNoMes - diaInicio + 1
  const valorPorAula = valorMensal / 4
  // Aulas proporcionais: semanas restantes × 1
  const semanas = Math.round(diasRestantes / 7)
  return Math.max(valorPorAula * semanas, 0)
}

// ─── componente principal ──────────────────────────────────────────────────

export default function FluxoAlunos() {
  const hoje = new Date()
  const primeiroDiaMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
  const ultimoDiaMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()}`

  const [dataInicio, setDataInicio] = useState(primeiroDiaMes)
  const [dataFim, setDataFim] = useState(ultimoDiaMes)
  const [aba, setAba] = useState<'entradas' | 'saidas' | 'cancelamentos' | 'professores' | 'grafico'>('entradas')
  const [busca, setBusca] = useState('')
  const [loading, setLoading] = useState(true)

  const [alunos, setAlunos] = useState<AlunoFluxo[]>([])
  const [professores, setProfessores] = useState<ProfessorFluxo[]>([])
  const [grafico, setGrafico] = useState<MesFluxo[]>([])
  const [totalAtivos, setTotalAtivos] = useState(0)

  // modal registrar saída
  const [modalSaida, setModalSaida] = useState<AlunoFluxo | null>(null)
  const [formSaida, setFormSaida] = useState({ data_saida: '', motivo_saida: '', motivo_saida_detalhe: '' })
  const [salvando, setSalvando] = useState(false)

  // modal cancelamento programado
  const [modalCancelamento, setModalCancelamento] = useState<AlunoFluxo | null>(null)
  const [cancelamentos, setCancelamentos] = useState<any[]>([])

  useEffect(() => { carregar() }, [dataInicio, dataFim])

  async function carregar() {
    setLoading(true)
    await Promise.all([carregarAlunos(), carregarProfessores(), carregarGrafico(), carregarCancelamentos()])
    setLoading(false)
  }

  async function carregarCancelamentos() {
    const { data } = await supabase
      .from('vw_cancelamentos_matricula')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    setCancelamentos(data ?? [])
  }

  async function carregarAlunos() {
    // Entradas no período
    const { data: entradas } = await supabase
      .from('alunos')
      .select('id,nome,instrumento_interesse,status,data_matricula,data_saida,motivo_saida,motivo_saida_detalhe,taxa_matricula,desconto_matricula,valor_plano,plano_frequencia,asaas_subscription_id')
      .gte('data_matricula', dataInicio)
      .lte('data_matricula', dataFim)
      .order('data_matricula', { ascending: false })

    // Saídas no período
    const { data: saidas } = await supabase
      .from('alunos')
      .select('id,nome,instrumento_interesse,status,data_matricula,data_saida,motivo_saida,motivo_saida_detalhe,taxa_matricula,desconto_matricula,valor_plano,plano_frequencia,asaas_subscription_id')
      .gte('data_saida', dataInicio)
      .lte('data_saida', dataFim)
      .order('data_saida', { ascending: false })

    // Total ativos
    const { count } = await supabase
      .from('alunos')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'ativo')
    setTotalAtivos(count ?? 0)

    // Mesclar dedupando por id
    const mapa = new Map<string, AlunoFluxo>()
    ;(entradas ?? []).forEach(a => mapa.set(a.id, a as AlunoFluxo))
    ;(saidas ?? []).forEach(a => { if (!mapa.has(a.id)) mapa.set(a.id, a as AlunoFluxo) })

    // Buscar professor mais recente de cada aluno via presencas
    const ids = [...mapa.keys()]
    if (ids.length > 0) {
      const { data: profs } = await supabase
        .from('presencas')
        .select('aluno_id, professores(nome)')
        .in('aluno_id', ids)
        .order('data', { ascending: false })

      const profMap = new Map<string, string>()
      ;(profs ?? []).forEach((p: any) => {
        if (!profMap.has(p.aluno_id) && p.professores?.nome) {
          profMap.set(p.aluno_id, p.professores.nome)
        }
      })
      mapa.forEach((a, id) => {
        if (profMap.has(id)) a.professor_nome = profMap.get(id)
      })
    }

    setAlunos([...mapa.values()])
  }

  async function carregarProfessores() {
    const { data } = await supabase.from('vw_professor_fluxo').select('*')
    setProfessores((data ?? []) as ProfessorFluxo[])
  }

  async function carregarGrafico() {
    // Últimos 12 meses
    const { data: ent } = await supabase
      .from('alunos')
      .select('data_matricula')
      .gte('data_matricula', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .not('data_matricula', 'is', null)

    const { data: sai } = await supabase
      .from('alunos')
      .select('data_saida')
      .gte('data_saida', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .not('data_saida', 'is', null)

    const mesMap = new Map<string, { entradas: number; saidas: number }>()

    ;(ent ?? []).forEach(({ data_matricula }) => {
      if (!data_matricula) return
      const mes = data_matricula.slice(0, 7)
      const prev = mesMap.get(mes) ?? { entradas: 0, saidas: 0 }
      mesMap.set(mes, { ...prev, entradas: prev.entradas + 1 })
    })
    ;(sai ?? []).forEach(({ data_saida }) => {
      if (!data_saida) return
      const mes = data_saida.slice(0, 7)
      const prev = mesMap.get(mes) ?? { entradas: 0, saidas: 0 }
      mesMap.set(mes, { ...prev, saidas: prev.saidas + 1 })
    })

    const sorted = [...mesMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, v]) => ({
        mes: mes.slice(5) + '/' + mes.slice(0, 4),
        entradas: v.entradas,
        saidas: v.saidas,
        saldo: v.entradas - v.saidas,
      }))

    setGrafico(sorted)
  }

  // ─── dados derivados ───────────────────────────────────────────────────

  const entradas = useMemo(
    () => alunos.filter(a => a.data_matricula && a.data_matricula >= dataInicio && a.data_matricula <= dataFim),
    [alunos, dataInicio, dataFim],
  )

  const saidas = useMemo(
    () => alunos.filter(a => a.data_saida && a.data_saida >= dataInicio && a.data_saida <= dataFim),
    [alunos, dataInicio, dataFim],
  )

  const taxaEvasao = totalAtivos > 0 ? ((saidas.length / totalAtivos) * 100).toFixed(1) : '0.0'

  const filtrar = (lista: AlunoFluxo[]) =>
    busca.trim()
      ? lista.filter(a => a.nome.toLowerCase().includes(busca.toLowerCase()))
      : lista

  // ─── ações ────────────────────────────────────────────────────────────

  async function salvarSaida() {
    if (!modalSaida) return
    if (!formSaida.data_saida || !formSaida.motivo_saida) return
    setSalvando(true)
    await supabase
      .from('alunos')
      .update({
        data_saida: formSaida.data_saida,
        motivo_saida: formSaida.motivo_saida,
        motivo_saida_detalhe: formSaida.motivo_saida_detalhe || null,
        status: 'inativo',
      })
      .eq('id', modalSaida.id)

    // Cancela a assinatura recorrente no Asaas junto com a saída — senão o Asaas
    // continua gerando cobrança mensal pra aluno que já não estuda mais aqui
    if (modalSaida.asaas_subscription_id) {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-subscriptions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            action: 'cancel',
            subscription_id: modalSaida.asaas_subscription_id,
            aluno_id: modalSaida.id,
          }),
        })
      } catch (e) {
        console.warn('[FluxoAlunos] Erro ao cancelar assinatura Asaas:', e)
        alert('Saída registrada, mas houve erro ao cancelar a cobrança no Asaas. Cancele manualmente na aba Assinaturas.')
      }
    }

    setSalvando(false)
    setModalSaida(null)
    setFormSaida({ data_saida: '', motivo_saida: '', motivo_saida_detalhe: '' })
    carregar()
  }

  function exportarExcel() {
    const wb = XLSX.utils.book_new()

    const sheetEntradas = [
      ['Nome', 'Data Entrada', 'Instrumento', 'Plano (R$)', 'Frequência', 'Matrícula', 'Desconto', 'Professor'],
      ...entradas.map(a => [
        a.nome,
        fmtData(a.data_matricula),
        a.instrumento_interesse ?? '',
        a.valor_plano,
        `${a.plano_frequencia ?? 1}x/semana`,
        a.taxa_matricula,
        a.desconto_matricula,
        a.professor_nome ?? '',
      ]),
    ]
    const sheetSaidas = [
      ['Nome', 'Data Saída', 'Instrumento', 'Motivo', 'Detalhe', 'Professor'],
      ...saidas.map(a => [
        a.nome,
        fmtData(a.data_saida),
        a.instrumento_interesse ?? '',
        MOTIVO_LABELS[a.motivo_saida ?? ''] ?? (a.motivo_saida ?? ''),
        a.motivo_saida_detalhe ?? '',
        a.professor_nome ?? '',
      ]),
    ]
    const sheetProfs = [
      ['Professor', 'Ativos', 'Entradas (mês)', 'Saídas (mês)', 'Entradas (ano)', 'Saídas (ano)'],
      ...professores.map(p => [
        p.professor_nome ?? '(sem professor)',
        p.alunos_ativos,
        p.entradas_mes,
        p.saidas_mes,
        p.entradas_ano,
        p.saidas_ano,
      ]),
    ]

    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetEntradas), 'Entradas')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetSaidas), 'Saídas')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetProfs), 'Por Professor')
    XLSX.writeFile(wb, `fluxo-alunos-${dataInicio}-${dataFim}.xlsx`)
  }

  // ─── render ────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={carregar}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={exportarExcel}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
          >
            <Download size={14} /> Excel
          </button>
        </div>
      </div>

      {/* Filtro de período */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500 mb-1 block">De</label>
          <input
            type="date"
            value={dataInicio}
            onChange={e => setDataInicio(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Até</label>
          <input
            type="date"
            value={dataFim}
            onChange={e => setDataFim(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* Atalhos */}
        {[
          { label: 'Este mês', d1: primeiroDiaMes, d2: ultimoDiaMes },
          {
            label: 'Este ano',
            d1: `${hoje.getFullYear()}-01-01`,
            d2: `${hoje.getFullYear()}-12-31`,
          },
          {
            label: 'Últimos 90d',
            d1: new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0],
            d2: hoje.toISOString().split('T')[0],
          },
        ].map(p => (
          <button
            key={p.label}
            onClick={() => { setDataInicio(p.d1 ?? ''); setDataFim(p.d2 ?? '') }}
            className="px-3 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition"
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon={<UserPlus size={20} />} label="Entradas" value={entradas.length} color="green" />
        <KPICard icon={<UserMinus size={20} />} label="Saídas" value={saidas.length} color="red" />
        <KPICard
          icon={<TrendingUp size={20} />}
          label="Saldo líquido"
          value={entradas.length - saidas.length}
          color={entradas.length >= saidas.length ? 'green' : 'red'}
          prefix={entradas.length >= saidas.length ? '+' : ''}
        />
        <KPICard
          icon={<Users size={20} />}
          label="Total ativos"
          value={totalAtivos}
          color="blue"
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KPICard
          icon={<AlertTriangle size={20} />}
          label="Taxa de evasão"
          value={`${taxaEvasao}%`}
          color="yellow"
          isText
        />
        <KPICard
          icon={<BarChart3 size={20} />}
          label="Receita entradas"
          value={fmtMoeda(entradas.reduce((s, a) => s + (a.valor_plano ?? 0), 0))}
          color="blue"
          isText
        />
        <KPICard
          icon={<TrendingDown size={20} />}
          label="Matrículas geradas"
          value={fmtMoeda(
            entradas.reduce((s, a) => s + Math.max((a.taxa_matricula ?? 0) - (a.desconto_matricula ?? 0), 0), 0),
          )}
          color="purple"
          isText
        />
      </div>

      {/* Abas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex border-b border-gray-200">
          {([
            ['entradas', `Entradas (${entradas.length})`],
            ['saidas', `Saídas (${saidas.length})`],
            ['cancelamentos', `Cancelamentos (${cancelamentos.filter(c => c.status === 'programado').length})`],
            ['professores', 'Por Professor'],
            ['grafico', 'Gráfico'],
          ] as [typeof aba, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setAba(key)}
              className={`px-4 py-3 text-sm font-medium transition border-b-2 ${
                aba === key
                  ? 'border-blue-600 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {/* Busca */}
          {(aba === 'entradas' || aba === 'saidas') && (
            <div className="relative mb-4">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                placeholder="Buscar aluno..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Aba Entradas */}
          {aba === 'entradas' && (
            <TabelaEntradas alunos={filtrar(entradas)} onRegistrarSaida={setModalSaida} onProgramarCancelamento={setModalCancelamento} />
          )}

          {/* Aba Saídas */}
          {aba === 'saidas' && (
            <TabelaSaidas alunos={filtrar(saidas)} />
          )}

          {/* Aba Cancelamentos */}
          {aba === 'cancelamentos' && (
            <TabelaCancelamentos cancelamentos={cancelamentos} onCancelarProgramacao={async (id) => {
              if (!confirm('Cancelar esta programação de cancelamento? O aluno volta ao status ativo normal.')) return
              const { data, error } = await supabase.rpc('cancelar_programacao_cancelamento', { p_cancelamento_id: id })
              if (error || !data?.ok) { alert(data?.error ?? error?.message ?? 'Erro ao cancelar'); return }
              carregarCancelamentos()
            }} />
          )}

          {/* Aba Professores */}
          {aba === 'professores' && (
            <TabelaProfessores professores={professores} />
          )}

          {/* Aba Gráfico */}
          {aba === 'grafico' && (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={grafico} margin={{ left: 0, right: 10, top: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="entradas" name="Entradas" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="saidas" name="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="saldo" name="Saldo" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Modal Registrar Saída */}
      {modalSaida && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-gray-900">Registrar Saída — {modalSaida.nome}</h2>
              <button onClick={() => setModalSaida(null)} className="p-1 hover:bg-gray-100 rounded">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Data de saída *</label>
                <input
                  type="date"
                  value={formSaida.data_saida}
                  onChange={e => setFormSaida(f => ({ ...f, data_saida: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Motivo *</label>
                <select
                  value={formSaida.motivo_saida}
                  onChange={e => setFormSaida(f => ({ ...f, motivo_saida: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Selecione...</option>
                  {MOTIVOS_SAIDA.map(m => (
                    <option key={m} value={m}>{MOTIVO_LABELS[m] ?? m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Observação (opcional)</label>
                <textarea
                  value={formSaida.motivo_saida_detalhe}
                  onChange={e => setFormSaida(f => ({ ...f, motivo_saida_detalhe: e.target.value }))}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Detalhe opcional..."
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <button
                onClick={() => setModalSaida(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={salvarSaida}
                disabled={salvando || !formSaida.data_saida || !formSaida.motivo_saida}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {salvando ? 'Salvando...' : 'Registrar Saída'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Programar Cancelamento de Matrícula */}
      {modalCancelamento && (
        <CancelamentoModal
          alunoId={modalCancelamento.id}
          onClose={() => setModalCancelamento(null)}
          onSaved={carregarCancelamentos}
        />
      )}
    </div>
  )
}

// ─── sub-componentes ────────────────────────────────────────────────────────

function KPICard({
  icon, label, value, color, prefix = '', isText = false,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  color: 'green' | 'red' | 'blue' | 'yellow' | 'purple'
  prefix?: string
  isText?: boolean
}) {
  const colors = {
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    blue: 'bg-blue-50 text-blue-600',
    yellow: 'bg-yellow-50 text-yellow-600',
    purple: 'bg-purple-50 text-purple-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className={`p-2.5 rounded-lg ${colors[color]}`}>{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-lg font-bold text-gray-900">
          {isText ? value : `${prefix}${value}`}
        </p>
      </div>
    </div>
  )
}

function TabelaEntradas({
  alunos,
  onRegistrarSaida,
  onProgramarCancelamento,
}: {
  alunos: AlunoFluxo[]
  onRegistrarSaida: (a: AlunoFluxo) => void
  onProgramarCancelamento: (a: AlunoFluxo) => void
}) {
  if (alunos.length === 0)
    return <p className="text-center text-gray-400 py-8">Nenhuma entrada no período</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="pb-2 font-medium">Nome</th>
            <th className="pb-2 font-medium">Entrada</th>
            <th className="pb-2 font-medium">Instrumento</th>
            <th className="pb-2 font-medium">Plano</th>
            <th className="pb-2 font-medium">Freq.</th>
            <th className="pb-2 font-medium">Matrícula</th>
            <th className="pb-2 font-medium">Professor</th>
            <th className="pb-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {alunos.map(a => {
            const valorMatricula = Math.max((a.taxa_matricula ?? 0) - (a.desconto_matricula ?? 0), 0)
            const diaInicio = a.data_matricula ? new Date(a.data_matricula + 'T12:00:00').getDate() : 1
            const valorProp = diaInicio > 5 ? calcProporacional(a.valor_plano ?? 0, diaInicio) : null
            return (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="py-2.5 font-medium text-gray-900">{a.nome}</td>
                <td className="py-2.5 text-gray-600">{fmtData(a.data_matricula)}</td>
                <td className="py-2.5 text-gray-600">{a.instrumento_interesse ?? '—'}</td>
                <td className="py-2.5 text-gray-600">
                  {a.valor_plano ? fmtMoeda(a.valor_plano) : '—'}
                  {valorProp !== null && (
                    <span className="ml-1 text-xs text-orange-500" title="Valor proporcional 1º mês">
                      (prop. {fmtMoeda(valorProp)})
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-gray-600">{a.plano_frequencia ?? 1}×/sem</td>
                <td className="py-2.5 text-gray-600">
                  {valorMatricula > 0 ? (
                    <span>
                      {fmtMoeda(valorMatricula)}
                      {(a.desconto_matricula ?? 0) > 0 && (
                        <span className="ml-1 text-xs text-green-600">
                          (-{fmtMoeda(a.desconto_matricula)})
                        </span>
                      )}
                    </span>
                  ) : '—'}
                </td>
                <td className="py-2.5 text-gray-600">{a.professor_nome ?? '—'}</td>
                <td className="py-2.5">
                  {!a.data_saida && a.status === 'ativo' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => onRegistrarSaida(a)}
                        className="text-xs text-red-500 hover:text-red-700 hover:underline"
                      >
                        Registrar saída
                      </button>
                      <button
                        onClick={() => onProgramarCancelamento(a)}
                        className="text-xs text-orange-500 hover:text-orange-700 hover:underline"
                      >
                        Programar cancelamento
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TabelaSaidas({ alunos }: { alunos: AlunoFluxo[] }) {
  if (alunos.length === 0)
    return <p className="text-center text-gray-400 py-8">Nenhuma saída no período</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="pb-2 font-medium">Nome</th>
            <th className="pb-2 font-medium">Saída</th>
            <th className="pb-2 font-medium">Instrumento</th>
            <th className="pb-2 font-medium">Motivo</th>
            <th className="pb-2 font-medium">Detalhe</th>
            <th className="pb-2 font-medium">Entrada</th>
            <th className="pb-2 font-medium">Tempo</th>
            <th className="pb-2 font-medium">Professor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {alunos.map(a => {
            const meses = a.data_matricula && a.data_saida
              ? Math.round(
                  (new Date(a.data_saida).getTime() - new Date(a.data_matricula).getTime()) /
                  (1000 * 60 * 60 * 24 * 30),
                )
              : null
            return (
              <tr key={a.id} className="hover:bg-gray-50">
                <td className="py-2.5 font-medium text-gray-900">{a.nome}</td>
                <td className="py-2.5 text-gray-600">{fmtData(a.data_saida)}</td>
                <td className="py-2.5 text-gray-600">{a.instrumento_interesse ?? '—'}</td>
                <td className="py-2.5">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-700">
                    {MOTIVO_LABELS[a.motivo_saida ?? ''] ?? (a.motivo_saida ?? '—')}
                  </span>
                </td>
                <td className="py-2.5 text-gray-500 text-xs max-w-[120px] truncate">
                  {a.motivo_saida_detalhe ?? '—'}
                </td>
                <td className="py-2.5 text-gray-600">{fmtData(a.data_matricula)}</td>
                <td className="py-2.5 text-gray-600">
                  {meses !== null ? `${meses} mês${meses !== 1 ? 'es' : ''}` : '—'}
                </td>
                <td className="py-2.5 text-gray-600">{a.professor_nome ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TabelaCancelamentos({
  cancelamentos,
  onCancelarProgramacao,
}: {
  cancelamentos: any[]
  onCancelarProgramacao: (id: string) => void
}) {
  if (cancelamentos.length === 0)
    return <p className="text-center text-gray-400 py-8">Nenhum cancelamento programado</p>

  const statusLabel: Record<string, string> = {
    programado: 'Programado', efetivado: 'Efetivado', cancelado: 'Cancelado',
  }
  const statusColor: Record<string, string> = {
    programado: 'bg-orange-50 text-orange-700',
    efetivado: 'bg-gray-100 text-gray-600',
    cancelado: 'bg-red-50 text-red-500',
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="pb-2 font-medium">Aluno</th>
            <th className="pb-2 font-medium">Solicitação</th>
            <th className="pb-2 font-medium">Efetiva</th>
            <th className="pb-2 font-medium">Motivo</th>
            <th className="pb-2 font-medium">Saldo</th>
            <th className="pb-2 font-medium">Status</th>
            <th className="pb-2 font-medium">Cobrança</th>
            <th className="pb-2 font-medium">PDF</th>
            <th className="pb-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {cancelamentos.map(c => (
            <tr key={c.id} className="hover:bg-gray-50">
              <td className="py-2.5 font-medium text-gray-900">{c.aluno_nome}</td>
              <td className="py-2.5 text-gray-600">{fmtData(c.data_solicitacao)}</td>
              <td className="py-2.5 text-gray-600">{fmtData(c.data_efetiva)}</td>
              <td className="py-2.5 text-gray-600">{MOTIVO_LABELS[c.motivo] ?? c.motivo}</td>
              <td className="py-2.5 text-gray-600">{fmtMoeda(c.saldo_final)}</td>
              <td className="py-2.5">
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${statusColor[c.status] ?? ''}`}>
                  {statusLabel[c.status] ?? c.status}
                </span>
              </td>
              <td className="py-2.5 text-gray-600">{c.cobranca_status ?? '—'}</td>
              <td className="py-2.5">
                {c.pdf_url ? (
                  <a href={c.pdf_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline text-xs">
                    Abrir
                  </a>
                ) : '—'}
              </td>
              <td className="py-2.5">
                {c.status === 'programado' && (
                  <button
                    onClick={() => onCancelarProgramacao(c.id)}
                    className="text-xs text-red-500 hover:text-red-700 hover:underline"
                  >
                    Cancelar programação
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TabelaProfessores({ professores }: { professores: ProfessorFluxo[] }) {
  if (professores.length === 0)
    return <p className="text-center text-gray-400 py-8">Nenhum dado disponível</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="pb-2 font-medium">Professor</th>
            <th className="pb-2 font-medium text-right">Ativos</th>
            <th className="pb-2 font-medium text-right">Entradas (mês)</th>
            <th className="pb-2 font-medium text-right">Saídas (mês)</th>
            <th className="pb-2 font-medium text-right">Entradas (ano)</th>
            <th className="pb-2 font-medium text-right">Saídas (ano)</th>
            <th className="pb-2 font-medium text-right">Saldo (ano)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {professores.map((p, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="py-2.5 font-medium text-gray-900">{p.professor_nome ?? '(sem professor)'}</td>
              <td className="py-2.5 text-right">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
                  {p.alunos_ativos}
                </span>
              </td>
              <td className="py-2.5 text-right text-green-600 font-medium">+{p.entradas_mes}</td>
              <td className="py-2.5 text-right text-red-500 font-medium">-{p.saidas_mes}</td>
              <td className="py-2.5 text-right text-green-600">+{p.entradas_ano}</td>
              <td className="py-2.5 text-right text-red-500">-{p.saidas_ano}</td>
              <td className="py-2.5 text-right">
                <span className={`font-bold ${p.entradas_ano - p.saidas_ano >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {p.entradas_ano - p.saidas_ano >= 0 ? '+' : ''}
                  {p.entradas_ano - p.saidas_ano}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
