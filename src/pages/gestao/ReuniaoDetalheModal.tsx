import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarClock, Check, Loader2, Play, Plus, Square, X, XCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import {
  STATUS_REUNIAO, fmtData,
  type GestaoContexto, type GestaoParticipante, type GestaoPauta, type GestaoReuniaoCompleta,
} from '@/lib/gestao'

const campo = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30'
const botao = 'inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-50'

export default function ReuniaoDetalheModal({ reuniaoId, ctx, onClose, onMudou }: {
  reuniaoId: string
  ctx: GestaoContexto
  onClose: () => void
  onMudou: (mensagem: string) => void
}) {
  const { hasRole } = useAuth()
  const ehAdmin = hasRole('admin')

  const [reuniao, setReuniao] = useState<GestaoReuniaoCompleta | null>(null)
  const [participantes, setParticipantes] = useState<GestaoParticipante[]>([])
  const [pautas, setPautas] = useState<GestaoPauta[]>([])
  const [loading, setLoading] = useState(true)
  const [acoesPorPauta, setAcoesPorPauta] = useState<Record<string, { id: string; titulo: string; responsavel_id: string | null; prazo: string | null }[]>>({})
  const [acoesRevisao, setAcoesRevisao] = useState<{ id: string; titulo: string; responsavel_id: string | null }[]>([])
  const [processando, setProcessando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    const [r, p, pt, acRev] = await Promise.all([
      supabase.from('gestao_reunioes').select('*').eq('id', reuniaoId).single(),
      supabase.from('gestao_pautas').select('*').eq('reuniao_id', reuniaoId).order('posicao'),
      supabase.from('gestao_reuniao_participantes').select('*').eq('reuniao_id', reuniaoId),
      supabase.from('gestao_acoes').select('id, titulo, responsavel_id').eq('reuniao_revisao_id', reuniaoId),
    ])
    if (r.data) setReuniao(r.data as GestaoReuniaoCompleta)
    const listaPautas = (p.data ?? []) as GestaoPauta[]
    setPautas(listaPautas)
    setParticipantes((pt.data ?? []) as GestaoParticipante[])
    setAcoesRevisao((acRev.data ?? []) as typeof acoesRevisao)

    if (listaPautas.length) {
      const { data: ac } = await supabase.from('gestao_acoes')
        .select('id, titulo, responsavel_id, prazo, item_origem_id')
        .in('item_origem_id', listaPautas.map((x) => x.id))
      const mapa: typeof acoesPorPauta = {}
      for (const a of ac ?? []) {
        const key = (a as { item_origem_id: string }).item_origem_id
        mapa[key] = [...(mapa[key] ?? []), a]
      }
      setAcoesPorPauta(mapa)
    }
    setLoading(false)
  }, [reuniaoId])

  useEffect(() => { void carregar() }, [carregar])

  const organizador = ctx.membros.find((m) => m.id === reuniao?.organizador_id)
  const souOrganizador = reuniao?.organizador_id === ctx.meuMembroId
  const podeGerir = ehAdmin || souOrganizador

  async function chamarRpc(fn: string, args: Record<string, unknown>, mensagem: string) {
    setProcessando(true)
    const { error } = await supabase.rpc(fn, args)
    setProcessando(false)
    if (error) { alert('Erro:\n' + error.message); return }
    onMudou(mensagem)
    void carregar()
  }

  async function confirmar() {
    await chamarRpc('gestao_confirmar_reuniao', { p_reuniao_id: reuniaoId }, 'Reunião confirmada — participantes avisados.')
  }

  async function remarcar() {
    const novaData = prompt('Nova data (AAAA-MM-DD):', reuniao?.data ?? '')
    if (!novaData) return
    const novaHora = prompt('Nova hora (HH:MM, opcional):', reuniao?.hora_inicio?.slice(0, 5) ?? '')
    await chamarRpc('gestao_remarcar_reuniao', { p_reuniao_id: reuniaoId, p_nova_data: novaData, p_nova_hora: novaHora || null }, 'Reunião remarcada.')
  }

  async function cancelar() {
    const motivo = prompt('Motivo do cancelamento:')
    if (!motivo) return
    await chamarRpc('gestao_cancelar_reuniao', { p_reuniao_id: reuniaoId, p_motivo: motivo }, 'Reunião cancelada.')
  }

  async function iniciar() {
    await chamarRpc('gestao_iniciar_reuniao', { p_reuniao_id: reuniaoId }, 'Reunião iniciada — condução liberada.')
  }

  async function encerrar() {
    let duracao: number | null = null
    if (ehAdmin) {
      const resp = prompt('Duração real (minutos, opcional):', String(reuniao?.duracao_prevista_min ?? ''))
      if (resp) duracao = Number(resp)
    }
    await chamarRpc('gestao_encerrar_reuniao', { p_reuniao_id: reuniaoId, p_duracao_real_min: duracao }, 'Reunião encerrada — ata gerada.')
  }

  async function marcarPresenca(membroId: string, presente: boolean) {
    const { error } = await supabase.from('gestao_reuniao_participantes')
      .update({ presente }).eq('reuniao_id', reuniaoId).eq('membro_id', membroId)
    if (error) { alert('Erro:\n' + error.message); return }
    void carregar()
  }

  async function fecharPresenca(duracaoReal: number, presentes: string[]) {
    await chamarRpc('gestao_fechar_presenca', { p_reuniao_id: reuniaoId, p_duracao_real_min: duracaoReal, p_presentes: presentes }, 'Presença e duração atualizadas — honorário recalculado.')
  }

  if (loading || !reuniao) {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
        <Loader2 className="w-7 h-7 text-white animate-spin" />
      </div>
    )
  }

  const statusCfg = STATUS_REUNIAO[reuniao.status]

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{reuniao.titulo}</h3>
            <p className="text-sm text-gray-500">
              {fmtData(reuniao.data)} às {reuniao.hora_inicio?.slice(0, 5)} · {reuniao.duracao_real_min ?? reuniao.duracao_prevista_min} min
              {organizador && <> · organiza {organizador.nome}</>}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Fechar"><X className="w-5 h-5" /></button>
        </div>

        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium mt-2 ${statusCfg.classe}`}>{statusCfg.label}</span>
        {reuniao.remarcada_de && <span className="ml-2 text-xs text-gray-400">(remarcada de {fmtData(reuniao.remarcada_de)})</span>}

        {podeGerir && reuniao.status !== 'realizada' && reuniao.status !== 'cancelada' && (
          <div className="flex flex-wrap gap-2 mt-4">
            {reuniao.status === 'agendada' && (
              <button disabled={processando} onClick={confirmar} className={`${botao} bg-brand-600 text-white`}><Check className="w-4 h-4" />Confirmar</button>
            )}
            {(reuniao.status === 'agendada' || reuniao.status === 'confirmada') && (
              <>
                <button disabled={processando} onClick={iniciar} className={`${botao} bg-amber-500 text-white`}><Play className="w-4 h-4" />Iniciar reunião</button>
                <button disabled={processando} onClick={remarcar} className={`${botao} bg-gray-100 text-gray-700`}><CalendarClock className="w-4 h-4" />Remarcar</button>
                <button disabled={processando} onClick={cancelar} className={`${botao} bg-red-50 text-red-700`}><XCircle className="w-4 h-4" />Cancelar</button>
              </>
            )}
            {reuniao.status === 'em_andamento' && (
              <button disabled={processando} onClick={encerrar} className={`${botao} bg-emerald-600 text-white`}><Square className="w-4 h-4" />Encerrar reunião</button>
            )}
          </div>
        )}

        <Secao titulo="Participantes">
          <ul className="flex flex-wrap gap-1.5">
            {participantes.map((p) => {
              const m = ctx.membros.find((x) => x.id === p.membro_id)
              const cor = p.presente === true ? 'bg-emerald-100 text-emerald-700' : p.presente === false ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
              return (
                <li key={p.membro_id} className={`px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${cor}`}>
                  {m?.nome ?? '—'}
                  {ehAdmin && reuniao.status === 'realizada' && (
                    <button onClick={() => marcarPresenca(p.membro_id, !(p.presente ?? false))} className="opacity-70 hover:opacity-100">
                      {p.presente ? '✓' : '○'}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </Secao>

        <Secao titulo={`Pautas (${pautas.length})`}>
          {reuniao.status === 'em_andamento' ? (
            <Conducao reuniaoId={reuniaoId} pautas={pautas} ctx={ctx} acoesPorPauta={acoesPorPauta} recarregar={carregar} />
          ) : (
            <ul className="space-y-2">
              {pautas.map((p) => (
                <li key={p.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm text-gray-800">{p.titulo}</p>
                    <span className="text-xs text-gray-400">{p.status}</span>
                  </div>
                  {p.anotacoes && <p className="text-xs text-gray-600 mt-1">Discutido: {p.anotacoes}</p>}
                  {p.decisoes && <p className="text-xs text-gray-600">Decidido: {p.decisoes}</p>}
                  {p.verificar_na_proxima && <p className="text-xs text-amber-700 mt-1">Verificar na próxima: {p.verificar_na_proxima}</p>}
                  {acoesPorPauta[p.id]?.map((a) => (
                    <p key={a.id} className="text-xs text-gray-500 mt-1">
                      · Ação: {a.titulo} ({ctx.membros.find((m) => m.id === a.responsavel_id)?.nome ?? 'sem responsável'}{a.prazo ? `, prazo ${fmtData(a.prazo)}` : ''})
                    </p>
                  ))}
                </li>
              ))}
              {reuniao.status === 'agendada' || reuniao.status === 'confirmada' ? (
                <AdicionarPauta reuniaoId={reuniaoId} posicaoBase={pautas.length} recarregar={carregar} />
              ) : null}
            </ul>
          )}
        </Secao>

        {acoesRevisao.length > 0 && (
          <Secao titulo="Ações para revisar">
            <ul className="space-y-1">
              {acoesRevisao.map((a) => (
                <li key={a.id} className="text-sm text-gray-700 bg-amber-50 rounded-lg px-3 py-1.5">
                  {a.titulo} — {ctx.membros.find((m) => m.id === a.responsavel_id)?.nome ?? 'sem responsável'}
                </li>
              ))}
            </ul>
          </Secao>
        )}

        {ehAdmin && reuniao.status === 'realizada' && (
          <FechamentoAdmin reuniao={reuniao} participantes={participantes} ctx={ctx} onFechar={fecharPresenca} />
        )}

        {reuniao.ata && (
          <Secao titulo="Ata">
            <pre className="whitespace-pre-wrap text-xs text-gray-700 bg-gray-50 rounded-lg p-3 font-sans">{reuniao.ata}</pre>
          </Secao>
        )}

        {reuniao.status === 'cancelada' && reuniao.motivo_cancelamento && (
          <Secao titulo="Motivo do cancelamento">
            <p className="text-sm text-gray-700">{reuniao.motivo_cancelamento}</p>
          </Secao>
        )}
      </div>
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-4">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{titulo}</h4>
      {children}
    </div>
  )
}

function AdicionarPauta({ reuniaoId, posicaoBase, recarregar }: { reuniaoId: string; posicaoBase: number; recarregar: () => void }) {
  const [titulo, setTitulo] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function adicionar() {
    if (!titulo.trim()) return
    setSalvando(true)
    const { error } = await supabase.from('gestao_pautas').insert({ reuniao_id: reuniaoId, titulo: titulo.trim(), posicao: posicaoBase })
    setSalvando(false)
    if (error) { alert('Erro:\n' + error.message); return }
    setTitulo('')
    recarregar()
  }

  return (
    <li className="flex gap-2">
      <input
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && adicionar()}
        placeholder="Adicionar tema de pauta"
        className={campo}
      />
      <button disabled={salvando} onClick={adicionar} className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-medium text-gray-700 shrink-0">
        <Plus className="w-4 h-4" />
      </button>
    </li>
  )
}

function Conducao({ reuniaoId, pautas, ctx, acoesPorPauta, recarregar }: {
  reuniaoId: string
  pautas: GestaoPauta[]
  ctx: GestaoContexto
  acoesPorPauta: Record<string, { id: string; titulo: string; responsavel_id: string | null; prazo: string | null }[]>
  recarregar: () => void
}) {
  const abertas = pautas.filter((p) => p.status === 'aberta')
  const [idx, setIdx] = useState(0)
  const atual = abertas[idx]
  const [anotacoes, setAnotacoes] = useState(atual?.anotacoes ?? '')
  const [decisoes, setDecisoes] = useState(atual?.decisoes ?? '')
  const [mostrarAcao, setMostrarAcao] = useState(false)
  const [mostrarLevar, setMostrarLevar] = useState(false)
  const [verificar, setVerificar] = useState('')

  useEffect(() => {
    setAnotacoes(atual?.anotacoes ?? '')
    setDecisoes(atual?.decisoes ?? '')
    setMostrarAcao(false)
    setMostrarLevar(false)
    setVerificar('')
  }, [atual?.id])

  async function salvarCampos() {
    if (!atual) return
    await supabase.from('gestao_pautas').update({ anotacoes, decisoes }).eq('id', atual.id)
  }

  async function encerrarTema() {
    if (!atual) return
    await salvarCampos()
    await supabase.from('gestao_pautas').update({ status: 'encerrada' }).eq('id', atual.id)
    recarregar()
    setIdx(0)
  }

  async function levarParaProxima() {
    if (!atual) return
    await salvarCampos()
    await supabase.from('gestao_pautas').update({ status: 'levar', verificar_na_proxima: verificar || null }).eq('id', atual.id)
    recarregar()
    setIdx(0)
  }

  if (!pautas.length) {
    return <p className="text-sm text-gray-400">Nenhuma pauta cadastrada.</p>
  }
  if (!atual) {
    return <p className="text-sm text-emerald-700">Todas as pautas foram encerradas ou levadas para a próxima reunião.</p>
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-gray-800">{atual.titulo}</p>
        <span className="text-xs text-gray-400">{idx + 1} de {abertas.length}</span>
      </div>
      {atual.descricao && <p className="text-xs text-gray-500">{atual.descricao}</p>}

      <textarea value={anotacoes} onChange={(e) => setAnotacoes(e.target.value)} onBlur={salvarCampos} placeholder="O que foi falado" className={`${campo} min-h-[60px]`} />
      <textarea value={decisoes} onChange={(e) => setDecisoes(e.target.value)} onBlur={salvarCampos} placeholder="O que ficou decidido" className={`${campo} min-h-[50px]`} />

      {acoesPorPauta[atual.id]?.map((a) => (
        <p key={a.id} className="text-xs text-gray-500">
          · Ação: {a.titulo} ({ctx.membros.find((m) => m.id === a.responsavel_id)?.nome ?? 'sem responsável'})
        </p>
      ))}

      {mostrarAcao ? (
        <NovaAcaoDaPauta reuniaoId={reuniaoId} pautaId={atual.id} ctx={ctx} onCriada={() => { setMostrarAcao(false); recarregar() }} onCancelar={() => setMostrarAcao(false)} />
      ) : (
        <button onClick={() => setMostrarAcao(true)} className="text-xs font-medium text-brand-700 flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Ação</button>
      )}

      {mostrarLevar ? (
        <div className="flex gap-2">
          <input value={verificar} onChange={(e) => setVerificar(e.target.value)} placeholder="O que verificar na próxima reunião" className={campo} />
          <button onClick={levarParaProxima} className="px-3 py-2 bg-amber-500 text-white text-sm font-medium rounded-lg shrink-0">Confirmar</button>
        </div>
      ) : (
        <div className="flex items-center gap-2 pt-1">
          <button onClick={encerrarTema} className="px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg">Encerrar tema</button>
          <button onClick={() => setMostrarLevar(true)} className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg">Levar para a próxima</button>
          {idx < abertas.length - 1 && (
            <button onClick={() => setIdx((i) => i + 1)} className="ml-auto text-xs text-gray-400 hover:text-gray-600">Pular →</button>
          )}
        </div>
      )}
    </div>
  )
}

function NovaAcaoDaPauta({ reuniaoId, pautaId, ctx, onCriada, onCancelar }: {
  reuniaoId: string
  pautaId: string
  ctx: GestaoContexto
  onCriada: () => void
  onCancelar: () => void
}) {
  const [titulo, setTitulo] = useState('')
  const [responsavelId, setResponsavelId] = useState('')
  const [prazo, setPrazo] = useState('')
  const [revisar, setRevisar] = useState(true)
  const [salvando, setSalvando] = useState(false)

  async function salvar() {
    if (!titulo.trim()) return
    setSalvando(true)
    const { error } = await supabase.from('gestao_acoes').insert({
      titulo: titulo.trim(),
      responsavel_id: responsavelId || null,
      prazo: prazo || null,
      reuniao_origem_id: reuniaoId,
      item_origem_id: pautaId,
      origem_tipo: 'reuniao',
      revisar_proxima_reuniao: revisar,
    })
    setSalvando(false)
    if (error) { alert('Erro:\n' + error.message); return }
    onCriada()
  }

  return (
    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
      <input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="O quê" className={campo} />
      <div className="grid grid-cols-2 gap-2">
        <select value={responsavelId} onChange={(e) => setResponsavelId(e.target.value)} className={`${campo} bg-white`}>
          <option value="">Responsável</option>
          {ctx.membros.filter((m) => m.ativo).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} className={campo} />
      </div>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={revisar} onChange={(e) => setRevisar(e.target.checked)} />
        Revisar na próxima reunião
      </label>
      <div className="flex gap-2">
        <button disabled={salvando} onClick={salvar} className="px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">Salvar ação</button>
        <button onClick={onCancelar} className="px-3 py-1.5 text-sm font-medium text-gray-500">Cancelar</button>
      </div>
    </div>
  )
}

function FechamentoAdmin({ reuniao, participantes, ctx, onFechar }: {
  reuniao: GestaoReuniaoCompleta
  participantes: GestaoParticipante[]
  ctx: GestaoContexto
  onFechar: (duracaoReal: number, presentes: string[]) => void
}) {
  const [duracao, setDuracao] = useState(reuniao.duracao_real_min ?? reuniao.duracao_prevista_min)
  const [presentes, setPresentes] = useState<Set<string>>(
    () => new Set(participantes.filter((p) => p.presente).map((p) => p.membro_id)),
  )

  function alternar(id: string) {
    setPresentes((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  return (
    <Secao titulo="Fechamento (ADM) — duração e presença">
      <div className="flex items-center gap-2 mb-2">
        <label className="text-xs text-gray-500">Duração real (min)</label>
        <input type="number" min={1} value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} className={`${campo} w-24`} />
      </div>
      <ul className="flex flex-wrap gap-1.5 mb-3">
        {participantes.map((p) => {
          const m = ctx.membros.find((x) => x.id === p.membro_id)
          const marcado = presentes.has(p.membro_id)
          return (
            <li key={p.membro_id}>
              <button
                onClick={() => alternar(p.membro_id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium ${marcado ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}
              >
                {m?.nome ?? '—'} {marcado ? '✓' : ''}
              </button>
            </li>
          )
        })}
      </ul>
      <button onClick={() => onFechar(duracao, [...presentes])} className="px-3 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg">
        Salvar presença e gerar honorário
      </button>
    </Secao>
  )
}
