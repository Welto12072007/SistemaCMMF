import { useCallback, useEffect, useState } from 'react'
import { History, Loader2, Lock, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  COR_CHIP, areasOrdenadas, descreverHistorico, fmtData, fmtDataHora, hojeSP, rotuloArea, situacaoPrazo, statusExigeMotivo,
  type GestaoAcao, type GestaoContexto, type GestaoHistorico,
} from '@/lib/gestao'
import { PrazoChip } from '@/components/gestao/ui'

const campo = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-gray-50 disabled:text-gray-500'

type CamposEditaveis = Pick<GestaoAcao,
  'titulo' | 'descricao' | 'motivo' | 'criterio_conclusao' | 'progresso'
  | 'responsavel_id' | 'prazo' | 'prioridade_id' | 'area_id' | 'exige_validacao' | 'revisar_proxima_reuniao'>

function editaveis(a: GestaoAcao): CamposEditaveis {
  return {
    titulo: a.titulo, descricao: a.descricao, motivo: a.motivo, criterio_conclusao: a.criterio_conclusao,
    progresso: a.progresso, responsavel_id: a.responsavel_id, prazo: a.prazo, prioridade_id: a.prioridade_id,
    area_id: a.area_id, exige_validacao: a.exige_validacao, revisar_proxima_reuniao: a.revisar_proxima_reuniao,
  }
}

export default function AcaoDetalheModal({ acao, ctx, gerencia, onClose, onSalva }: {
  acao: GestaoAcao
  ctx: GestaoContexto
  gerencia: boolean
  onClose: () => void
  onSalva: (acao: GestaoAcao, mensagem: string) => void
}) {
  const souResponsavel = acao.responsavel_id === ctx.meuMembroId
  const podeEditar = gerencia || souResponsavel
  const statusAtual = ctx.status.find((s) => s.id === acao.status_id)
  const situacao = situacaoPrazo(acao, statusAtual?.categoria, hojeSP())

  const [form, setForm] = useState<CamposEditaveis>(() => editaveis(acao))
  const [salvando, setSalvando] = useState(false)
  const [statusPendente, setStatusPendente] = useState<string | null>(null)
  const [motivoStatus, setMotivoStatus] = useState('')
  const [historico, setHistorico] = useState<GestaoHistorico[] | null>(null)

  useEffect(() => { setForm(editaveis(acao)) }, [acao])

  const carregarHistorico = useCallback(async () => {
    const { data } = await supabase
      .from('gestao_historico')
      .select('id, operacao, alteracoes, membro_id, created_at')
      .eq('tabela', 'gestao_acoes')
      .eq('registro_id', acao.id)
      .order('created_at', { ascending: false })
    setHistorico((data ?? []) as GestaoHistorico[])
  }, [acao.id])

  useEffect(() => { void carregarHistorico() }, [carregarHistorico, acao.updated_at])

  const original = editaveis(acao)
  const alterados = (Object.keys(form) as (keyof CamposEditaveis)[]).filter((k) => form[k] !== original[k])

  async function atualizar(mudancas: Partial<GestaoAcao>, mensagem: string) {
    setSalvando(true)
    const { data, error } = await supabase.from('gestao_acoes').update(mudancas).eq('id', acao.id).select('*').single()
    setSalvando(false)
    if (error) { alert('Erro:\n' + error.message); return false }
    onSalva(data as GestaoAcao, mensagem)
    return true
  }

  async function salvarCampos() {
    if (!form.titulo.trim()) { alert('O título não pode ficar vazio.'); return }
    const mudancas: Record<string, unknown> = {}
    for (const k of alterados) {
      const v = form[k]
      mudancas[k] = typeof v === 'string' ? (v.trim() || (k === 'titulo' ? v : null)) : v
    }
    await atualizar(mudancas as Partial<GestaoAcao>, 'Alterações salvas.')
  }

  async function mudarStatus(statusId: string) {
    const destino = ctx.status.find((s) => s.id === statusId)
    const campoMotivo = statusExigeMotivo(destino)
    if (campoMotivo && statusPendente !== statusId) {
      setStatusPendente(statusId)
      setMotivoStatus('')
      return
    }
    const mudancas: Partial<GestaoAcao> = { status_id: statusId }
    if (campoMotivo) {
      if (!motivoStatus.trim()) return
      mudancas[campoMotivo] = motivoStatus.trim()
    }
    if (await atualizar(mudancas, `Status: ${destino?.nome}.`)) setStatusPendente(null)
  }

  const bloqueiaConclusao = acao.exige_validacao && !gerencia
  const nome = (id: string | null) => ctx.membros.find((m) => m.id === id)?.nome ?? '—'

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 p-6 pb-4 border-b">
          <div className="min-w-0">
            <p className="text-xs text-gray-500">{rotuloArea(acao.area_id, ctx.areas)}</p>
            <h3 className="text-lg font-bold text-gray-800 break-words">{acao.titulo}</h3>
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-gray-500">
              <PrazoChip situacao={situacao} prazo={acao.prazo} />
              <span>Responsável: <strong className="text-gray-700">{nome(acao.responsavel_id)}</strong></span>
              {acao.gerente_frente_id && <span>· Gerente da frente: {nome(acao.gerente_frente_id)}</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg flex-shrink-0" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Status */}
          <section>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Status</h4>
            <div className="flex flex-wrap gap-1.5">
              {ctx.status.map((s) => {
                const ativo = s.id === acao.status_id
                const desabilitado = !podeEditar || salvando || ativo || (s.categoria === 'concluida' && bloqueiaConclusao)
                return (
                  <button
                    key={s.id}
                    disabled={desabilitado}
                    onClick={() => mudarStatus(s.id)}
                    title={s.categoria === 'concluida' && bloqueiaConclusao ? 'Exige validação: mova para "Em revisão" e o gerente conclui.' : undefined}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      ativo ? `${COR_CHIP[s.cor ?? 'gray']} border-transparent ring-2 ring-offset-1 ring-brand-500/40`
                        : statusPendente === s.id ? 'border-brand-500 text-brand-700 bg-brand-50'
                        : 'text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent'
                    }`}
                  >
                    {s.nome}
                  </button>
                )
              })}
            </div>
            {bloqueiaConclusao && (
              <p className="text-xs text-gray-400 mt-2 flex items-center gap-1"><Lock className="w-3 h-3" /> Esta ação exige validação do gerente para ser concluída.</p>
            )}
            {statusPendente && (
              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                <input
                  autoFocus
                  value={motivoStatus}
                  onChange={(e) => setMotivoStatus(e.target.value)}
                  placeholder={statusExigeMotivo(ctx.status.find((s) => s.id === statusPendente)) === 'motivo_bloqueio'
                    ? 'O que está travando? Quem pode destravar?' : 'Por que esta ação foi cancelada?'}
                  className={campo}
                />
                <div className="flex gap-2">
                  <button onClick={() => setStatusPendente(null)} className="px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                  <button
                    onClick={() => mudarStatus(statusPendente)}
                    disabled={!motivoStatus.trim() || salvando}
                    className="px-3 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            )}
            {statusAtual?.chave === 'bloqueada' && acao.motivo_bloqueio && (
              <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-3">Bloqueio: {acao.motivo_bloqueio}</p>
            )}
            {statusAtual?.categoria === 'cancelada' && acao.motivo_cancelamento && (
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mt-3">Cancelada: {acao.motivo_cancelamento}</p>
            )}
          </section>

          {/* Execução */}
          <section className="space-y-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Execução</h4>
            <div>
              <label className="flex justify-between text-sm font-medium text-gray-700 mb-1">
                Progresso <span className="tabular-nums text-gray-500">{form.progresso}%</span>
              </label>
              <input
                type="range" min={0} max={100} step={10}
                disabled={!podeEditar}
                value={form.progresso}
                onChange={(e) => setForm({ ...form, progresso: Number(e.target.value) })}
                className="w-full accent-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
              <input disabled={!podeEditar} value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className={campo} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição e andamento</label>
              <textarea rows={3} disabled={!podeEditar} value={form.descricao ?? ''}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })} className={`${campo} resize-y`}
                placeholder="Detalhes, próximos passos, links..." />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Por quê?</label>
                <textarea rows={2} disabled={!podeEditar} value={form.motivo ?? ''}
                  onChange={(e) => setForm({ ...form, motivo: e.target.value })} className={`${campo} resize-none`} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Como saberemos que foi concluída?</label>
                <textarea rows={2} disabled={!podeEditar} value={form.criterio_conclusao ?? ''}
                  onChange={(e) => setForm({ ...form, criterio_conclusao: e.target.value })} className={`${campo} resize-none`} />
              </div>
            </div>
          </section>

          {/* Responsável e prazo */}
          <section className="space-y-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Responsável e prazo</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Responsável</label>
                <select disabled={!gerencia} value={form.responsavel_id ?? ''}
                  onChange={(e) => setForm({ ...form, responsavel_id: e.target.value || null })} className={`${campo} bg-white`}>
                  <option value="">Sem responsável</option>
                  {ctx.membros.filter((m) => m.ativo || m.id === acao.responsavel_id).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prazo</label>
                <input type="date" disabled={!gerencia} value={form.prazo ?? ''}
                  onChange={(e) => setForm({ ...form, prazo: e.target.value || null })} className={campo} />
                {acao.prazo_original && acao.prazo_original !== acao.prazo && (
                  <p className="text-xs text-gray-400 mt-1">Prazo original: {fmtData(acao.prazo_original)}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
                <select disabled={!gerencia} value={form.prioridade_id}
                  onChange={(e) => setForm({ ...form, prioridade_id: e.target.value })} className={`${campo} bg-white`}>
                  {ctx.prioridades.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Área</label>
                <select disabled={!gerencia} value={form.area_id ?? ''}
                  onChange={(e) => setForm({ ...form, area_id: e.target.value || null })} className={`${campo} bg-white`}>
                  <option value="">Sem área</option>
                  {areasOrdenadas(ctx.areas).map((a) => <option key={a.id} value={a.id}>{a.parent_id ? `   ${a.nome}` : a.nome}</option>)}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" disabled={!podeEditar} checked={form.revisar_proxima_reuniao}
                  onChange={(e) => setForm({ ...form, revisar_proxima_reuniao: e.target.checked })} className="rounded border-gray-300" />
                Revisar na próxima reunião
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" disabled={!gerencia} checked={form.exige_validacao}
                  onChange={(e) => setForm({ ...form, exige_validacao: e.target.checked })} className="rounded border-gray-300" />
                Exige validação do gerente
              </label>
            </div>
            {!gerencia && (
              <p className="text-xs text-gray-400 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Responsável, prazo, prioridade e área são alterados pelo gerente da área.
              </p>
            )}
          </section>

          {podeEditar && (
            <div className="flex justify-end gap-2">
              {alterados.length > 0 && (
                <button onClick={() => setForm(editaveis(acao))} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
                  Descartar
                </button>
              )}
              <button
                onClick={salvarCampos}
                disabled={salvando || alterados.length === 0}
                className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2"
              >
                {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
                Salvar alterações
              </button>
            </div>
          )}

          {/* Histórico */}
          <section>
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1">
              <History className="w-3.5 h-3.5" /> Histórico
            </h4>
            {historico === null ? (
              <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
            ) : historico.length === 0 ? (
              <p className="text-sm text-gray-400">Sem registros.</p>
            ) : (
              <ol className="space-y-2">
                {historico.map((h) => (
                  <li key={h.id} className="text-sm border-l-2 border-gray-200 pl-3">
                    <p className="text-xs text-gray-400">
                      <strong className="text-gray-600">{h.membro_id ? nome(h.membro_id) : 'Sistema'}</strong> · {fmtDataHora(h.created_at)}
                    </p>
                    {descreverHistorico(h, ctx).map((linha, i) => <p key={i} className="text-gray-700">{linha}</p>)}
                  </li>
                ))}
              </ol>
            )}
            <p className="text-xs text-gray-400 mt-3">
              Criada em {fmtDataHora(acao.created_at)}{acao.criado_por ? ` por ${nome(acao.criado_por)}` : ''}.
            </p>
          </section>
        </div>
      </div>
    </div>
  )
}
