import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarClock, Loader2, Plus, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  ModuloNaoInstaladoError, STATUS_REUNIAO, carregarContexto, carregarProjetosETipos, fmtData, hojeSP,
  type GestaoContexto, type GestaoProjeto, type GestaoReuniao, type GestaoTipoReuniao,
} from '@/lib/gestao'
import { Toast } from '@/components/gestao/ui'
import NovaReuniaoModal from './NovaReuniaoModal'
import ReuniaoDetalheModal from './ReuniaoDetalheModal'

type Erro = 'nao_instalado' | 'sem_vinculo' | string | null

export default function Reunioes() {
  const [ctx, setCtx] = useState<GestaoContexto | null>(null)
  const [tipos, setTipos] = useState<GestaoTipoReuniao[]>([])
  const [projetos, setProjetos] = useState<GestaoProjeto[]>([])
  const [reunioes, setReunioes] = useState<GestaoReuniao[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<Erro>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showNova, setShowNova] = useState(false)
  const [detalheId, setDetalheId] = useState<string | null>(null)

  const [params, setParams] = useSearchParams()
  const filtroStatus = params.get('status') ?? ''
  const filtroTipo = params.get('tipo') ?? ''
  const filtroMes = params.get('mes') ?? hojeSP().slice(0, 7)

  function setFiltro(chave: string, valor: string) {
    const novo = new URLSearchParams(params)
    if (valor) novo.set(chave, valor)
    else novo.delete(chave)
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
      const { projetos, tipos } = await carregarProjetosETipos()
      setTipos(tipos)
      setProjetos(projetos)
      const { data, error } = await supabase.from('gestao_v_reunioes').select('*').order('data', { ascending: false }).order('hora_inicio', { ascending: false })
      if (error) throw new Error(error.message)
      setReunioes((data ?? []) as GestaoReuniao[])
    } catch (e) {
      setErro(e instanceof ModuloNaoInstaladoError ? 'nao_instalado' : (e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  const hoje = hojeSP()

  const filtradas = useMemo(() => {
    return reunioes.filter((r) => {
      if (filtroStatus && r.status !== filtroStatus) return false
      if (filtroTipo && r.tipo_id !== filtroTipo) return false
      if (filtroMes && r.mes !== filtroMes) return false
      return true
    })
  }, [reunioes, filtroStatus, filtroTipo, filtroMes])

  const resumo = useMemo(() => ({
    agendadas: reunioes.filter((r) => r.status === 'agendada').length,
    aguardandoConfirmacao: reunioes.filter((r) => r.status === 'agendada' && r.data >= hoje).length,
    realizadasMes: reunioes.filter((r) => r.status === 'realizada' && r.mes === hoje.slice(0, 7)).length,
    pautasPendentes: reunioes.reduce((s, r) => s + r.pautas_pendentes, 0),
    acoesParaRevisar: reunioes.reduce((s, r) => s + r.acoes_para_revisar, 0),
  }), [reunioes, hoje])

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>

  if (erro === 'nao_instalado') {
    return <div className="p-6"><div className="bg-amber-50 text-amber-700 text-sm rounded-lg p-4">O módulo de reuniões ainda não foi instalado neste banco.</div></div>
  }
  if (erro === 'sem_vinculo') {
    return <div className="p-6"><div className="bg-amber-50 text-amber-700 text-sm rounded-lg p-4">Seu usuário ainda não está vinculado ao módulo Gestão. Peça para um admin te adicionar em Configurações → Pessoas.</div></div>
  }
  if (erro) {
    return <div className="p-6"><div className="bg-red-50 text-red-700 text-sm rounded-lg p-4">{erro}</div></div>
  }
  if (!ctx) return null

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2"><CalendarClock className="w-5 h-5" />Reuniões</h1>
          <p className="text-sm text-gray-500">Reunião → pautas → ações → revisão na próxima.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={carregar} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Atualizar"><RefreshCw className="w-4 h-4 text-gray-500" /></button>
          <button
            onClick={() => setShowNova(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg"
          >
            <Plus className="w-4 h-4" />Nova reunião
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Cartao label="Agendadas" valor={resumo.agendadas} />
        <Cartao label="Realizadas no mês" valor={resumo.realizadasMes} />
        <Cartao label="Pautas pendentes" valor={resumo.pautasPendentes} />
        <Cartao label="Ações p/ revisar" valor={resumo.acoesParaRevisar} />
        <Cartao label="Total no filtro" valor={filtradas.length} />
      </div>

      <div className="flex flex-wrap gap-2">
        <select value={filtroTipo} onChange={(e) => setFiltro('tipo', e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm bg-white">
          <option value="">Todos os tipos</option>
          {tipos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
        <select value={filtroStatus} onChange={(e) => setFiltro('status', e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm bg-white">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_REUNIAO).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input type="month" value={filtroMes} onChange={(e) => setFiltro('mes', e.target.value)} className="px-3 py-1.5 border rounded-lg text-sm" />
        {(filtroTipo || filtroStatus) && (
          <button onClick={() => setParams(new URLSearchParams({ mes: filtroMes }), { replace: true })} className="text-xs text-gray-400 hover:text-gray-600">Limpar filtros</button>
        )}
      </div>

      <div className="bg-white rounded-xl border divide-y">
        {filtradas.length === 0 && <p className="p-6 text-sm text-gray-400 text-center">Nenhuma reunião neste filtro.</p>}
        {filtradas.map((r) => (
          <button
            key={r.id}
            onClick={() => setDetalheId(r.id)}
            className="w-full text-left p-4 hover:bg-gray-50 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: r.tipo_cor ?? '#53d5fd' }} />
                <p className="font-medium text-gray-800 truncate">{r.titulo}</p>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {r.tipo_nome}{r.projeto_nome ? ` · ${r.projeto_nome}` : ''} · {fmtData(r.data)} às {r.hora_inicio?.slice(0, 5)}
                {r.pautas_pendentes > 0 && <span className="text-amber-700"> · {r.pautas_pendentes} pauta(s) pendente(s)</span>}
              </p>
            </div>
            <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_REUNIAO[r.status].classe}`}>
              {STATUS_REUNIAO[r.status].label}
            </span>
          </button>
        ))}
      </div>

      {showNova && (
        <NovaReuniaoModal
          ctx={ctx}
          tipos={tipos}
          projetos={projetos}
          onClose={() => setShowNova(false)}
          onCriada={(mensagem) => { setShowNova(false); setToast(mensagem); carregar() }}
        />
      )}

      {detalheId && (
        <ReuniaoDetalheModal
          reuniaoId={detalheId}
          ctx={ctx}
          onClose={() => setDetalheId(null)}
          onMudou={(mensagem) => { setToast(mensagem); carregar() }}
        />
      )}

      {toast && <Toast mensagem={toast} onClose={() => setToast(null)} />}
    </div>
  )
}

function Cartao({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="bg-white rounded-xl border p-3">
      <p className="text-2xl font-bold text-gray-800">{valor}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}
