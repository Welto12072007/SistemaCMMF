import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, ListChecks, Loader2, Plus, RefreshCw, Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  ModuloNaoInstaladoError, SITUACAO, areasGerenciadas, areasOrdenadas, carregarContexto, comDescendentes,
  hojeSP, diaSP, diasEntre, normalizarBusca, rotuloArea, situacaoPrazo,
  type GestaoAcao, type GestaoContexto, type SituacaoPrazo,
} from '@/lib/gestao'
import { BarraProgresso, PrazoChip, PrioridadeChip, StatusChip, Toast } from '@/components/gestao/ui'
import NovaAcaoModal from './NovaAcaoModal'
import AcaoDetalheModal from './AcaoDetalheModal'

type Erro = 'nao_instalado' | 'sem_vinculo' | string | null

const FILTROS = ['escopo', 'q', 'responsavel', 'area', 'status', 'prioridade', 'prazo'] as const

export default function Acoes() {
  const { hasRole } = useAuth()
  const ehAdmin = hasRole('admin')

  const [ctx, setCtx] = useState<GestaoContexto | null>(null)
  const [acoes, setAcoes] = useState<GestaoAcao[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<Erro>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showNova, setShowNova] = useState(false)
  const [detalheId, setDetalheId] = useState<string | null>(null)

  const [params, setParams] = useSearchParams()
  const escopo = params.get('escopo') ?? (ehAdmin ? 'todas' : 'minhas')
  const filtroStatus = params.get('status') ?? 'abertas'
  const q = params.get('q') ?? ''
  const filtroResp = params.get('responsavel') ?? ''
  const filtroArea = params.get('area') ?? ''
  const filtroPrioridade = params.get('prioridade') ?? ''
  const filtroPrazo = (params.get('prazo') ?? '') as SituacaoPrazo | 'vencendo' | ''

  function setFiltro(chave: (typeof FILTROS)[number], valor: string) {
    const novo = new URLSearchParams(params)
    if (valor) novo.set(chave, valor)
    else novo.delete(chave)
    setParams(novo, { replace: true })
  }

  function limparFiltros() {
    const novo = new URLSearchParams()
    if (params.get('escopo')) novo.set('escopo', escopo)
    setParams(novo, { replace: true })
  }

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const contexto = await carregarContexto()
      setCtx(contexto)
      if (!contexto.meuMembroId) {
        setErro('sem_vinculo')
        return
      }
      const { data, error } = await supabase.from('gestao_acoes').select('*')
      if (error) throw new Error(error.message)
      setAcoes((data ?? []) as GestaoAcao[])
    } catch (e) {
      setErro(e instanceof ModuloNaoInstaladoError ? 'nao_instalado' : (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  const hoje = hojeSP()
  const gerenciadas = useMemo(() => (ctx ? areasGerenciadas(ctx, ehAdmin) : new Set<string>()), [ctx, ehAdmin])

  // Cada ação com categoria, situação do prazo e peso da prioridade já resolvidos.
  const linhas = useMemo(() => {
    if (!ctx) return []
    return acoes.map((a) => {
      const status = ctx.status.find((s) => s.id === a.status_id)
      const prioridade = ctx.prioridades.find((p) => p.id === a.prioridade_id)
      return {
        acao: a,
        status,
        prioridade,
        categoria: status?.categoria,
        situacao: situacaoPrazo(a, status?.categoria, hoje),
        responsavel: ctx.membros.find((m) => m.id === a.responsavel_id),
      }
    })
  }, [acoes, ctx, hoje])

  const doEscopo = useMemo(
    () => (escopo === 'minhas' && ctx ? linhas.filter((l) => l.acao.responsavel_id === ctx.meuMembroId) : linhas),
    [linhas, escopo, ctx],
  )

  const resumo = useMemo(() => {
    const abertas = doEscopo.filter((l) => l.categoria === 'aberta')
    return {
      abertas: abertas.length,
      atrasadas: abertas.filter((l) => l.situacao === 'atrasada').length,
      vencendo: abertas.filter((l) => ['vence_hoje', 'vence_amanha', 'vence_7_dias'].includes(l.situacao)).length,
      semResponsavel: abertas.filter((l) => !l.acao.responsavel_id).length,
      semPrazo: abertas.filter((l) => !l.acao.prazo).length,
      concluidas30: doEscopo.filter((l) => l.categoria === 'concluida' && l.acao.concluida_em
        && diasEntre(diaSP(l.acao.concluida_em), hoje) <= 30).length,
    }
  }, [doEscopo, hoje])

  const filtradas = useMemo(() => {
    if (!ctx) return []
    const busca = normalizarBusca(q.trim())
    const areasFiltro = filtroArea ? comDescendentes(filtroArea, ctx.areas) : null
    return doEscopo
      .filter((l) => {
        if (filtroStatus === 'abertas' && l.categoria !== 'aberta') return false
        if (filtroStatus === 'concluidas' && l.categoria !== 'concluida') return false
        if (!['abertas', 'concluidas', 'todas'].includes(filtroStatus) && l.acao.status_id !== filtroStatus) return false
        if (filtroResp === 'sem' ? l.acao.responsavel_id : filtroResp && l.acao.responsavel_id !== filtroResp) return false
        if (areasFiltro && !(l.acao.area_id && areasFiltro.has(l.acao.area_id))) return false
        if (filtroPrioridade && l.acao.prioridade_id !== filtroPrioridade) return false
        if (filtroPrazo === 'vencendo' && !['vence_hoje', 'vence_amanha', 'vence_7_dias'].includes(l.situacao)) return false
        if (filtroPrazo && filtroPrazo !== 'vencendo' && l.situacao !== filtroPrazo) return false
        if (busca && !normalizarBusca(`${l.acao.titulo} ${l.acao.descricao ?? ''}`).includes(busca)) return false
        return true
      })
      .sort((x, y) => {
        const ordemCat = (c?: string) => (c === 'aberta' ? 0 : c === 'concluida' ? 1 : 2)
        return ordemCat(x.categoria) - ordemCat(y.categoria)
          || SITUACAO[x.situacao].ordem - SITUACAO[y.situacao].ordem
          || (x.acao.prazo ?? '9999').localeCompare(y.acao.prazo ?? '9999')
          || (y.prioridade?.peso ?? 0) - (x.prioridade?.peso ?? 0)
      })
  }, [doEscopo, ctx, q, filtroStatus, filtroResp, filtroArea, filtroPrioridade, filtroPrazo])

  const temFiltro = Boolean(q || filtroResp || filtroArea || filtroPrioridade || filtroPrazo || filtroStatus !== 'abertas')
  const detalhe = acoes.find((a) => a.id === detalheId) ?? null

  function aoSalvar(acao: GestaoAcao, mensagem: string) {
    setAcoes((lista) => (lista.some((a) => a.id === acao.id) ? lista.map((a) => (a.id === acao.id ? acao : a)) : [acao, ...lista]))
    setToast(mensagem)
  }

  // ── Estados de carregamento e erro ──────────────────────────────────────────
  if (loading && !ctx) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
      </div>
    )
  }

  if (erro === 'nao_instalado') {
    return (
      <Aviso titulo="O módulo Gestão ainda não está instalado no banco">
        Falta aplicar <code className="text-xs bg-amber-100 px-1 rounded">supabase/gestao/migration-gestao-01-fundacao.sql</code> no Supabase.
        Depois disso, recarregue esta página.
      </Aviso>
    )
  }

  if (erro === 'sem_vinculo') {
    return (
      <Aviso titulo="Seu usuário ainda não está ligado ao módulo Gestão">
        O módulo usa o cadastro de professores e da equipe. Peça ao administrador para conferir se o seu e-mail
        está no cadastro de Professores ou em Usuários com o papel de admin ou recepção.
      </Aviso>
    )
  }

  if (erro || !ctx) {
    return (
      <Aviso titulo="Não foi possível carregar as ações" tom="erro" onTentar={carregar}>
        {erro}
      </Aviso>
    )
  }

  const podeGerenciarAlgo = gerenciadas.size > 0

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <ListChecks className="w-6 h-6 text-brand-500" /> Ações
          </h1>
          <p className="text-sm text-gray-500">O que foi decidido, quem faz e até quando.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregar} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Atualizar">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowNova(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600"
          >
            <Plus className="w-4 h-4" /> Nova ação
          </button>
        </div>
      </div>

      {/* Escopo */}
      <div className="inline-flex bg-white border rounded-lg p-0.5">
        {[['minhas', 'Minhas ações'], ['todas', podeGerenciarAlgo ? 'Todas que acompanho' : 'Todas que vejo']].map(([valor, label]) => (
          <button
            key={valor}
            onClick={() => setFiltro('escopo', valor!)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${escopo === valor ? 'bg-brand-500 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Resumo — cada número filtra a lista que o gerou */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Resumo label="Abertas" valor={resumo.abertas} ativo={filtroStatus === 'abertas' && !filtroPrazo && !filtroResp}
          onClick={() => { limparFiltros() }} />
        <Resumo label="Atrasadas" valor={resumo.atrasadas} tom="crit" ativo={filtroPrazo === 'atrasada'}
          onClick={() => { limparFiltros(); setFiltro('prazo', 'atrasada') }} />
        <Resumo label="Vencem em 7 dias" valor={resumo.vencendo} tom="warn" ativo={filtroPrazo === 'vencendo'}
          onClick={() => { limparFiltros(); setFiltro('prazo', 'vencendo') }} />
        <Resumo label="Sem responsável" valor={resumo.semResponsavel} tom="warn" ativo={filtroResp === 'sem'}
          onClick={() => { limparFiltros(); setFiltro('responsavel', 'sem') }} />
        <Resumo label="Sem prazo" valor={resumo.semPrazo} tom="warn" ativo={filtroPrazo === 'sem_prazo'}
          onClick={() => { limparFiltros(); setFiltro('prazo', 'sem_prazo') }} />
        <Resumo label="Concluídas (30 dias)" valor={resumo.concluidas30} tom="good" ativo={filtroStatus === 'concluidas'}
          onClick={() => { limparFiltros(); setFiltro('status', 'concluidas') }} />
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={q}
            onChange={(e) => setFiltro('q', e.target.value)}
            placeholder="Buscar ação..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          />
        </div>
        <Seletor valor={filtroStatus} onChange={(v) => setFiltro('status', v === 'abertas' ? '' : v)} rotulo="Status">
          <option value="abertas">Abertas</option>
          <option value="concluidas">Concluídas</option>
          <option value="todas">Todos os status</option>
          {ctx.status.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </Seletor>
        {escopo === 'todas' && (
          <Seletor valor={filtroResp} onChange={(v) => setFiltro('responsavel', v)} rotulo="Responsável">
            <option value="">Todos os responsáveis</option>
            <option value="sem">Sem responsável</option>
            {ctx.membros.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </Seletor>
        )}
        <Seletor valor={filtroArea} onChange={(v) => setFiltro('area', v)} rotulo="Área">
          <option value="">Todas as áreas</option>
          {areasOrdenadas(ctx.areas).map((a) => (
            <option key={a.id} value={a.id}>{a.parent_id ? `   ${a.nome}` : a.nome}</option>
          ))}
        </Seletor>
        <Seletor valor={filtroPrioridade} onChange={(v) => setFiltro('prioridade', v)} rotulo="Prioridade">
          <option value="">Todas as prioridades</option>
          {ctx.prioridades.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </Seletor>
        <Seletor valor={filtroPrazo} onChange={(v) => setFiltro('prazo', v)} rotulo="Prazo">
          <option value="">Qualquer prazo</option>
          <option value="vencendo">Vence em até 7 dias</option>
          {(Object.keys(SITUACAO) as SituacaoPrazo[]).map((s) => <option key={s} value={s}>{SITUACAO[s].label}</option>)}
        </Seletor>
        {temFiltro && (
          <button onClick={limparFiltros} className="flex items-center gap-1 px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 rounded-lg">
            <X className="w-4 h-4" /> Limpar
          </button>
        )}
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {filtradas.length === 0 ? (
          <div className="text-center py-14 px-4">
            {acoes.length === 0 ? (
              <>
                <p className="text-gray-600 font-medium">Nenhuma ação ainda.</p>
                <p className="text-sm text-gray-400 mt-1">Crie a primeira com <strong>Nova ação</strong>: o quê, quem e até quando.</p>
              </>
            ) : (
              <>
                <p className="text-gray-500">Nenhuma ação com esses filtros.</p>
                {temFiltro && <button onClick={limparFiltros} className="text-sm text-brand-600 hover:underline mt-2">Limpar filtros</button>}
              </>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtradas.map(({ acao, status, prioridade, situacao, responsavel }) => (
              <li key={acao.id}>
                <button
                  onClick={() => setDetalheId(acao.id)}
                  className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors flex flex-col md:flex-row md:items-center gap-2 md:gap-4 border-l-4 ${
                    situacao === 'atrasada' ? 'border-red-400' : situacao === 'vence_hoje' ? 'border-amber-400' : 'border-transparent'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${status?.categoria === 'cancelada' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                      {acao.titulo}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {rotuloArea(acao.area_id, ctx.areas)} · {responsavel?.nome ?? <span className="text-amber-700">Sem responsável</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 md:justify-end">
                    <PrioridadeChip prioridade={prioridade} />
                    <StatusChip status={status} />
                    <PrazoChip situacao={situacao} prazo={acao.prazo} />
                    <BarraProgresso valor={acao.progresso} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showNova && (
        <NovaAcaoModal
          ctx={ctx}
          ehAdmin={ehAdmin}
          gerenciadas={gerenciadas}
          onClose={() => setShowNova(false)}
          onCriada={(acao) => { setShowNova(false); aoSalvar(acao, 'Ação criada.') }}
        />
      )}

      {detalhe && (
        <AcaoDetalheModal
          acao={detalhe}
          ctx={ctx}
          gerencia={ehAdmin || (detalhe.area_id ? gerenciadas.has(detalhe.area_id) : false)}
          onClose={() => setDetalheId(null)}
          onSalva={aoSalvar}
        />
      )}

      {toast && <Toast mensagem={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

function Resumo({ label, valor, tom, ativo, onClick }: {
  label: string; valor: number; tom?: 'crit' | 'warn' | 'good'; ativo: boolean; onClick: () => void
}) {
  const cor = valor === 0 ? 'text-gray-800'
    : tom === 'crit' ? 'text-red-600' : tom === 'warn' ? 'text-amber-600' : tom === 'good' ? 'text-emerald-600' : 'text-gray-800'
  return (
    <button
      onClick={onClick}
      className={`text-left bg-white rounded-xl shadow-sm border p-3 hover:border-brand-300 transition-colors ${ativo ? 'ring-2 ring-brand-500/40 border-brand-300' : ''}`}
    >
      <p className={`text-2xl font-bold tabular-nums ${cor}`}>{valor}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </button>
  )
}

function Seletor({ valor, onChange, rotulo, children }: {
  valor: string; onChange: (v: string) => void; rotulo: string; children: React.ReactNode
}) {
  return (
    <select
      aria-label={rotulo}
      value={valor}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-2 border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500/30"
    >
      {children}
    </select>
  )
}

function Aviso({ titulo, children, tom = 'aviso', onTentar }: {
  titulo: string; children: React.ReactNode; tom?: 'aviso' | 'erro'; onTentar?: () => void
}) {
  const cores = tom === 'erro' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-900'
  return (
    <div className={`max-w-2xl border rounded-xl p-5 ${cores}`}>
      <p className="font-semibold flex items-center gap-2"><AlertTriangle className="w-5 h-5" /> {titulo}</p>
      <p className="text-sm mt-2 leading-relaxed">{children}</p>
      {onTentar && (
        <button onClick={onTentar} className="mt-3 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50">Tentar de novo</button>
      )}
    </div>
  )
}
