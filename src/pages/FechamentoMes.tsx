import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import {
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Wallet,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Users,
  DollarSign,
  ArrowRight,
  Zap,
  Info,
} from 'lucide-react'

// ─── tipos ────────────────────────────────────────────────────────────────────

interface ResumoMes {
  ano: number
  mes: number
  referencia: string
  total_mensalidades: number
  valor_bruto_mensalidades: number
  receitas_recebidas: number
  receitas_a_receber: number
  mensalidades_pagas: number
  mensalidades_pendentes: number
  mensalidades_atrasadas: number
  mensalidades_isentas: number
  despesas_professores_fechadas: number
  despesas_professores_pagas: number
}

interface PreviewMes {
  referencia: string
  total_alunos: number
  sem_valor_plano: number
  a_gerar: number
  ja_geradas: number
  valor_bruto: number
  total_desconto: number
  valor_liquido: number
}

interface ProfLinha {
  id: string
  nome: string
  valor_hora_aula: number
  chave_pix: string | null
  pix_tipo: string | null
  presencas: number
  extras: number
  total: number
  fechado: boolean
  pago: boolean
}

interface LancamentoCaixa {
  id: string
  tipo: 'receita' | 'despesa'
  categoria: string
  descricao: string
  valor: number
  data_lancamento: string
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const MESES_LABEL = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon, color = 'text-gray-900', bg = 'bg-white',
}: {
  label: string; value: string; sub?: string
  icon: React.ReactNode; color?: string; bg?: string
}) {
  return (
    <div className={`${bg} rounded-xl border shadow-sm p-4 flex items-start gap-3`}>
      <div className="mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className={`text-xl font-bold ${color}`}>{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── componente principal ──────────────────────────────────────────────────────

export default function FechamentoMes() {
  const navigate = useNavigate()
  const hoje = new Date()
  const [mes, setMes] = useState(hoje.getMonth() + 1)
  const [ano, setAno] = useState(hoje.getFullYear())
  const [loading, setLoading] = useState(false)

  const [resumo, setResumo] = useState<ResumoMes | null>(null)
  const [preview, setPreview] = useState<PreviewMes | null>(null)
  const [professores, setProfessores] = useState<ProfLinha[]>([])
  const [lancamentos, setLancamentos] = useState<LancamentoCaixa[]>([])

  const [gerando, setGerando] = useState(false)
  const [mostraPreview, setMostraPreview] = useState(false)

  const ref = `${ano}-${String(mes).padStart(2, '0')}`
  const refDate = `${ano}-${String(mes).padStart(2, '0')}-01`

  useEffect(() => {
    carregar()
  }, [mes, ano])

  async function carregar() {
    setLoading(true)
    const fim = new Date(ano, mes, 0).getDate()
    const dataFim = `${ano}-${String(mes).padStart(2, '0')}-${String(fim).padStart(2, '0')}`

    const [
      { data: rData },
      { data: profs },
      { data: pres },
      { data: extras },
      { data: fechamentos },
      { data: lancs },
    ] = await Promise.all([
      // resumo da view
      supabase
        .from('vw_resumo_financeiro_mes')
        .select('*')
        .eq('referencia', ref)
        .maybeSingle(),

      // professores ativos
      supabase
        .from('professores')
        .select('id,nome,valor_hora_aula,chave_pix,pix_tipo')
        .eq('ativo', true)
        .order('nome'),

      // presenças do mês
      supabase
        .from('presencas')
        .select('professor_id')
        .eq('presente', true)
        .gte('data', refDate)
        .lte('data', dataFim),

      // extras aprovados
      supabase
        .from('extras_professor')
        .select('professor_id,valor')
        .eq('mes', mes)
        .eq('ano', ano)
        .eq('aprovado', true),

      // fechamentos registrados
      supabase
        .from('pagamentos_professor_mensal')
        .select('professor_id,valor_total,status')
        .eq('mes', mes)
        .eq('ano', ano),

      // lançamentos de caixa do mês
      supabase
        .from('lancamentos_caixa')
        .select('id,tipo,categoria,descricao,valor,data_lancamento')
        .gte('data_lancamento', refDate)
        .lte('data_lancamento', dataFim)
        .order('data_lancamento', { ascending: false }),
    ])

    setResumo(rData as ResumoMes | null)
    setLancamentos((lancs ?? []) as LancamentoCaixa[])

    // montar linhas de professores
    const presMap = new Map<string, number>()
    ;(pres ?? []).forEach(({ professor_id }) => {
      presMap.set(professor_id, (presMap.get(professor_id) ?? 0) + 1)
    })
    const extrasMap = new Map<string, number>()
    ;(extras ?? []).forEach(({ professor_id, valor }) => {
      extrasMap.set(professor_id, (extrasMap.get(professor_id) ?? 0) + valor)
    })
    const fechMap = new Map<string, { valor: number; status: string }>()
    ;(fechamentos ?? []).forEach(f => fechMap.set(f.professor_id, { valor: f.valor_total, status: f.status }))

    const linhas: ProfLinha[] = (profs ?? []).map(p => {
      const presQtd = presMap.get(p.id) ?? 0
      const extrasVal = extrasMap.get(p.id) ?? 0
      const fech = fechMap.get(p.id)
      return {
        id: p.id,
        nome: p.nome,
        valor_hora_aula: p.valor_hora_aula,
        chave_pix: p.chave_pix,
        pix_tipo: p.pix_tipo,
        presencas: presQtd,
        extras: extrasVal,
        total: presQtd * p.valor_hora_aula + extrasVal,
        fechado: !!fech,
        pago: fech?.status === 'pago',
      }
    })
    setProfessores(linhas)
    setLoading(false)
  }

  async function carregarPreview() {
    const { data } = await supabase.rpc('preview_mensalidades_mes', { p_referencia: refDate })
    setPreview(data as PreviewMes)
    setMostraPreview(true)
  }

  async function gerarMensalidades() {
    setGerando(true)
    const { data, error } = await supabase.rpc('gerar_mensalidades_mes', {
      p_referencia: refDate,
      p_dia_vencimento: 10,
    })
    setGerando(false)
    setMostraPreview(false)
    if (error) { alert('Erro ao gerar mensalidades:\n' + error.message); return }
    const r = data as { criadas: number; ja_existiam: number; sem_valor_plano: number }
    alert(`Mensalidades geradas!\n✓ Criadas: ${r.criadas}\n• Já existiam: ${r.ja_existiam}\n• Sem valor: ${r.sem_valor_plano}`)
    carregar()
  }

  // ─── derivados ────────────────────────────────────────────────────────────

  const totalProfessores = useMemo(() => professores.reduce((s, p) => s + p.total, 0), [professores])
  const totalProfPago    = useMemo(() => professores.filter(p => p.pago).reduce((s, p) => s + p.total, 0), [professores])
  const totalProfPendente = totalProfessores - totalProfPago

  const receitasRecebidas   = resumo?.receitas_recebidas ?? 0
  const receitasAReceber    = resumo?.receitas_a_receber ?? 0
  const totalMensalidades   = resumo?.valor_bruto_mensalidades ?? 0
  const mensalidadesGeradas = resumo?.total_mensalidades ?? 0

  const saldoReal     = receitasRecebidas - totalProfPago
  const saldoPrevisto = (receitasRecebidas + receitasAReceber) - totalProfessores

  const lancReceitas  = lancamentos.filter(l => l.tipo === 'receita').reduce((s, l) => s + l.valor, 0)
  const lancDespesas  = lancamentos.filter(l => l.tipo === 'despesa').reduce((s, l) => s + l.valor, 0)

  const navMes = (d: number) => {
    const data = new Date(ano, mes - 1 + d, 1)
    setMes(data.getMonth() + 1)
    setAno(data.getFullYear())
  }

  const labelMes = `${MESES_LABEL[mes - 1]} ${ano}`

  return (
    <div className="space-y-6">

      {/* Cabeçalho + navegação de mês */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Fechamento do Mês</h2>
          <p className="text-sm text-gray-500">Receitas e despesas consolidadas</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => navMes(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-gray-700 w-36 text-center">{labelMes}</span>
          <button onClick={() => navMes(1)} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={carregar} disabled={loading} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Receitas recebidas"
          value={brl(receitasRecebidas + lancReceitas)}
          sub={`mensalidades + lançamentos`}
          icon={<TrendingUp className="w-5 h-5 text-green-500" />}
          color="text-green-700"
          bg="bg-green-50"
        />
        <KpiCard
          label="A receber ainda"
          value={brl(receitasAReceber)}
          sub={`${resumo?.mensalidades_pendentes ?? 0} pendentes · ${resumo?.mensalidades_atrasadas ?? 0} atrasadas`}
          icon={<Clock className="w-5 h-5 text-yellow-500" />}
          color="text-yellow-700"
          bg="bg-yellow-50"
        />
        <KpiCard
          label="A pagar professores"
          value={brl(totalProfessores + lancDespesas)}
          sub={`${brl(totalProfPago)} já pago · ${brl(totalProfPendente)} pendente`}
          icon={<TrendingDown className="w-5 h-5 text-red-500" />}
          color="text-red-700"
          bg="bg-red-50"
        />
        <KpiCard
          label={saldoReal >= 0 ? 'Saldo real (caixa)' : 'Déficit real'}
          value={brl(Math.abs(saldoReal + lancReceitas - lancDespesas))}
          sub={`previsto: ${brl(saldoPrevisto)}`}
          icon={<Wallet className="w-5 h-5 text-blue-500" />}
          color={saldoReal >= 0 ? 'text-blue-700' : 'text-red-700'}
          bg={saldoReal >= 0 ? 'bg-blue-50' : 'bg-red-50'}
        />
      </div>

      {/* Duas colunas: Mensalidades | Professores */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── MENSALIDADES ────────────────────────────────────── */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" />
              <h3 className="font-semibold text-gray-800">Mensalidades — {labelMes}</h3>
            </div>
            <button
              onClick={() => navigate('/mensalidades')}
              className="text-xs text-brand-600 hover:underline flex items-center gap-1"
            >
              Abrir completo <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {mensalidadesGeradas === 0 ? (
            /* Não gerado ainda */
            <div className="p-6 text-center space-y-4">
              <div className="text-gray-400">
                <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-yellow-400" />
                <p className="text-sm font-medium text-gray-700">Mensalidades não geradas para {labelMes}</p>
                <p className="text-xs text-gray-500 mt-1">Clique para gerar as cobranças de todos os alunos ativos</p>
              </div>
              {!mostraPreview ? (
                <button
                  onClick={carregarPreview}
                  className="inline-flex items-center gap-2 bg-brand-500 text-white px-5 py-2.5 rounded-lg hover:bg-brand-600 text-sm font-medium"
                >
                  <Zap className="w-4 h-4" />
                  Ver preview e gerar
                </button>
              ) : preview && (
                <div className="bg-blue-50 rounded-xl p-4 text-left space-y-2 text-sm">
                  <div className="flex items-center gap-2 mb-2 text-blue-700 font-semibold">
                    <Info className="w-4 h-4" /> Preview — {MESES_LABEL[mes - 1]} {ano}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-700">
                    <span>Alunos ativos:</span>          <span className="font-medium">{preview.total_alunos}</span>
                    <span>A gerar:</span>                 <span className="font-medium">{preview.a_gerar}</span>
                    <span>Já existem:</span>              <span className="font-medium">{preview.ja_geradas}</span>
                    <span>Sem valor configurado:</span>   <span className="font-medium text-red-600">{preview.sem_valor_plano}</span>
                    <span>Valor bruto total:</span>       <span className="font-medium">{brl(preview.valor_bruto)}</span>
                    <span>Total de descontos:</span>      <span className="font-medium text-orange-600">- {brl(preview.total_desconto)}</span>
                    <span className="font-semibold">Valor líquido:</span> <span className="font-bold text-green-700">{brl(preview.valor_liquido)}</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => setMostraPreview(false)}
                      className="flex-1 px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={gerarMensalidades}
                      disabled={gerando}
                      className="flex-1 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      {gerando ? 'Gerando...' : `Confirmar — gerar ${preview.a_gerar} mensalidades`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Já gerado — mostra resumo */
            <div className="p-5 space-y-4">
              {/* barra de progresso */}
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>{resumo?.mensalidades_pagas ?? 0} pagas de {mensalidadesGeradas}</span>
                  <span>{mensalidadesGeradas > 0 ? Math.round(((resumo?.mensalidades_pagas ?? 0) / mensalidadesGeradas) * 100) : 0}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${mensalidadesGeradas > 0 ? ((resumo?.mensalidades_pagas ?? 0) / mensalidadesGeradas) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* grid status */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-green-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-green-700">{resumo?.mensalidades_pagas ?? 0}</p>
                  <p className="text-xs text-green-600">Pagas</p>
                  <p className="text-xs font-medium text-green-700 mt-0.5">{brl(receitasRecebidas)}</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-yellow-700">{resumo?.mensalidades_pendentes ?? 0}</p>
                  <p className="text-xs text-yellow-600">Pendentes</p>
                  <p className="text-xs font-medium text-yellow-700 mt-0.5">{brl(receitasAReceber)}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-red-700">{resumo?.mensalidades_atrasadas ?? 0}</p>
                  <p className="text-xs text-red-600">Atrasadas</p>
                  <p className="text-xs font-medium text-red-700 mt-0.5">em atraso</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-gray-700">{resumo?.mensalidades_isentas ?? 0}</p>
                  <p className="text-xs text-gray-500">Isentas</p>
                  <p className="text-xs text-gray-400 mt-0.5">desconto 100%</p>
                </div>
              </div>

              {/* total */}
              <div className="border-t pt-3 flex justify-between items-center">
                <span className="text-sm text-gray-500">Total gerado (líquido)</span>
                <span className="font-bold text-gray-900">{brl(totalMensalidades)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── PROFESSORES ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b bg-gray-50">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <h3 className="font-semibold text-gray-800">Professores — {labelMes}</h3>
            </div>
            <span className="text-xs text-gray-500">{professores.length} professor{professores.length !== 1 ? 'es' : ''}</span>
          </div>

          {professores.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              Nenhum professor ativo encontrado.
            </div>
          ) : (
            <div className="divide-y">
              {professores.map(p => (
                <div key={p.id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.nome}</p>
                    <p className="text-xs text-gray-500">
                      {p.presencas} aula{p.presencas !== 1 ? 's' : ''} × {brl(p.valor_hora_aula)}
                      {p.extras > 0 && <> + {brl(p.extras)} extras</>}
                    </p>
                    {p.chave_pix && (
                      <p className="text-xs text-blue-500 mt-0.5">
                        PIX{p.pix_tipo ? ` (${p.pix_tipo})` : ''}: {p.chave_pix}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{brl(p.total)}</p>
                    {p.pago ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> Pago
                      </span>
                    ) : p.fechado ? (
                      <span className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        <Clock className="w-3 h-3" /> Fechado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                        <Clock className="w-3 h-3" /> Pendente
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Totais professores */}
          {professores.length > 0 && (
            <div className="bg-gray-50 border-t px-5 py-3 space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Total a pagar:</span>
                <span className="font-semibold text-gray-900">{brl(totalProfessores)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Já pago:</span>
                <span className="font-medium text-green-700">{brl(totalProfPago)}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-500">
                <span>Pendente:</span>
                <span className="font-medium text-yellow-700">{brl(totalProfPendente)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lançamentos do mês */}
      {lancamentos.length > 0 && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b bg-gray-50">
            <h3 className="font-semibold text-gray-800">Lançamentos de Caixa — {labelMes}</h3>
          </div>
          <div className="divide-y max-h-60 overflow-y-auto">
            {lancamentos.map(l => (
              <div key={l.id} className="flex items-center justify-between px-5 py-2.5">
                <div>
                  <p className="text-sm text-gray-800">{l.descricao}</p>
                  <p className="text-xs text-gray-400">{l.categoria} · {l.data_lancamento}</p>
                </div>
                <span className={`text-sm font-medium ${l.tipo === 'receita' ? 'text-green-700' : 'text-red-700'}`}>
                  {l.tipo === 'receita' ? '+' : '-'}{brl(l.valor)}
                </span>
              </div>
            ))}
          </div>
          <div className="bg-gray-50 border-t px-5 py-3 flex justify-between text-sm">
            <span className="text-gray-500">Saldo lançamentos:</span>
            <span className={`font-bold ${lancReceitas - lancDespesas >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {brl(lancReceitas - lancDespesas)}
            </span>
          </div>
        </div>
      )}

      {/* Resumo final */}
      <div className="bg-gray-900 text-white rounded-xl p-5">
        <h3 className="font-semibold mb-4">Resumo Financeiro — {labelMes}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/10 rounded-lg p-4">
            <p className="text-xs text-gray-300">Total receitas (recebido)</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{brl(receitasRecebidas + lancReceitas)}</p>
            <p className="text-xs text-gray-400 mt-1">+ {brl(receitasAReceber)} ainda a receber</p>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <p className="text-xs text-gray-300">Total despesas (pagas)</p>
            <p className="text-2xl font-bold text-red-400 mt-1">{brl(totalProfPago + lancDespesas)}</p>
            <p className="text-xs text-gray-400 mt-1">+ {brl(totalProfPendente)} ainda pendente</p>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <p className="text-xs text-gray-300">Saldo real</p>
            <p className={`text-2xl font-bold mt-1 ${(receitasRecebidas + lancReceitas - totalProfPago - lancDespesas) >= 0 ? 'text-blue-300' : 'text-red-400'}`}>
              {brl(receitasRecebidas + lancReceitas - totalProfPago - lancDespesas)}
            </p>
            <p className="text-xs text-gray-400 mt-1">previsto: {brl(saldoPrevisto + lancReceitas - lancDespesas)}</p>
          </div>
        </div>
      </div>

    </div>
  )
}
