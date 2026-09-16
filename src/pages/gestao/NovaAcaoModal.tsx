import { useMemo, useState } from 'react'
import { Lightbulb, Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  areasOrdenadas, gerenteDaArea, hojeSP, proximaSexta, somarDias,
  type GestaoAcao, type GestaoContexto,
} from '@/lib/gestao'

const campo = 'w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30'

export default function NovaAcaoModal({ ctx, ehAdmin, gerenciadas, onClose, onCriada }: {
  ctx: GestaoContexto
  ehAdmin: boolean
  gerenciadas: Set<string>
  onClose: () => void
  onCriada: (acao: GestaoAcao) => void
}) {
  const eu = ctx.meuMembroId
  const podeAtribuir = gerenciadas.size > 0
  const hoje = hojeSP()

  const [form, setForm] = useState({
    titulo: '',
    responsavel_id: podeAtribuir ? '' : eu ?? '',
    prazo: '',
    area_id: '',
    prioridade_id: ctx.prioridades.find((p) => p.chave === 'media')?.id ?? '',
    motivo: '',
    criterio_conclusao: '',
    revisar_proxima_reuniao: false,
    exige_validacao: false,
  })
  const [salvando, setSalvando] = useState(false)

  const paraOutraPessoa = Boolean(form.responsavel_id) && form.responsavel_id !== eu

  // Para outra pessoa, o banco só aceita áreas que você gerencia (admin: todas).
  const opcoesArea = useMemo(
    () => areasOrdenadas(ctx.areas).filter((a) => ehAdmin || !paraOutraPessoa || gerenciadas.has(a.id)),
    [ctx.areas, ehAdmin, paraOutraPessoa, gerenciadas],
  )

  const gerente = gerenteDaArea(form.area_id || null, ctx)
  const sugestaoResponsavel = !form.responsavel_id && gerente ? gerente : undefined

  const atalhosPrazo: [string, string][] = [
    ['Sexta', proximaSexta(hoje)],
    ['1 semana', somarDias(hoje, 7)],
    ['15 dias', somarDias(hoje, 15)],
    ['30 dias', somarDias(hoje, 30)],
  ]

  const faltando = [
    !form.titulo.trim() && 'o quê',
    !form.responsavel_id && 'quem',
    !form.prazo && 'quando',
    paraOutraPessoa && !ehAdmin && !form.area_id && 'a área',
  ].filter(Boolean) as string[]

  async function salvar() {
    if (faltando.length) return
    setSalvando(true)
    const { data, error } = await supabase
      .from('gestao_acoes')
      .insert({
        titulo: form.titulo.trim(),
        responsavel_id: form.responsavel_id || null,
        prazo: form.prazo || null,
        area_id: form.area_id || null,
        prioridade_id: form.prioridade_id || null,
        motivo: form.motivo.trim() || null,
        criterio_conclusao: form.criterio_conclusao.trim() || null,
        revisar_proxima_reuniao: form.revisar_proxima_reuniao,
        exige_validacao: form.exige_validacao,
        gerente_frente_id: gerente?.id ?? null,
      })
      .select('*')
      .single()
    setSalvando(false)
    if (error) { alert('Erro:\n' + error.message); return }
    onCriada(data as GestaoAcao)
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-800">Nova ação</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg" aria-label="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">O quê? *</label>
            <input
              autoFocus
              value={form.titulo}
              onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              className={campo}
              placeholder="Ex: Revisar apostila de violão nível 2"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quem? *</label>
              <select
                value={form.responsavel_id}
                disabled={!podeAtribuir}
                onChange={(e) => setForm({ ...form, responsavel_id: e.target.value })}
                className={`${campo} bg-white disabled:bg-gray-50`}
              >
                <option value="">Escolha o responsável</option>
                {ctx.membros.filter((m) => m.ativo || m.id === eu).map((m) => (
                  <option key={m.id} value={m.id}>{m.id === eu ? `${m.nome} (eu)` : m.nome}</option>
                ))}
              </select>
              {sugestaoResponsavel && (
                <button
                  type="button"
                  onClick={() => setForm({ ...form, responsavel_id: sugestaoResponsavel.id })}
                  className="text-xs text-brand-600 hover:underline mt-1"
                >
                  Sugestão: {sugestaoResponsavel.nome} (gerente da área)
                </button>
              )}
              {!podeAtribuir && <p className="text-xs text-gray-400 mt-1">Você cria ações para si. Gerentes atribuem a outras pessoas.</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Quando? *</label>
              <input
                type="date"
                min={hoje}
                value={form.prazo}
                onChange={(e) => setForm({ ...form, prazo: e.target.value })}
                className={campo}
              />
              <div className="flex flex-wrap gap-1 mt-1.5">
                {atalhosPrazo.map(([rotulo, data]) => (
                  <button
                    key={rotulo}
                    type="button"
                    onClick={() => setForm({ ...form, prazo: data })}
                    className={`text-xs px-2 py-0.5 rounded-full border ${form.prazo === data ? 'bg-brand-500 text-white border-brand-500' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Área{paraOutraPessoa && !ehAdmin ? ' *' : ''}</label>
              <select
                value={form.area_id}
                onChange={(e) => setForm({ ...form, area_id: e.target.value })}
                className={`${campo} bg-white`}
              >
                <option value="">Sem área</option>
                {opcoesArea.map((a) => (
                  <option key={a.id} value={a.id}>{a.parent_id ? `   ${a.nome}` : a.nome}</option>
                ))}
              </select>
              {gerente && <p className="text-xs text-gray-400 mt-1">Gerente da frente: {gerente.nome}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Prioridade</label>
              <select
                value={form.prioridade_id}
                onChange={(e) => setForm({ ...form, prioridade_id: e.target.value })}
                className={`${campo} bg-white`}
              >
                {ctx.prioridades.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Por quê?</label>
            <textarea
              rows={2}
              value={form.motivo}
              onChange={(e) => setForm({ ...form, motivo: e.target.value })}
              className={`${campo} resize-none`}
              placeholder="O problema ou a decisão que originou esta ação"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Como saberemos que foi concluída?</label>
            <textarea
              rows={2}
              value={form.criterio_conclusao}
              onChange={(e) => setForm({ ...form, criterio_conclusao: e.target.value })}
              className={`${campo} resize-none`}
              placeholder="Ex: apostila revisada enviada ao grupo de professores"
            />
          </div>

          {(!form.motivo.trim() || !form.criterio_conclusao.trim()) && form.titulo.trim() && (
            <p className="flex gap-2 text-xs text-gray-500 bg-brand-50 rounded-lg px-3 py-2">
              <Lightbulb className="w-4 h-4 text-brand-500 flex-shrink-0" />
              Com o "por quê" e o critério de conclusão preenchidos, fica fácil revisar na reunião se a ação resolveu o que devia.
            </p>
          )}

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.revisar_proxima_reuniao}
                onChange={(e) => setForm({ ...form, revisar_proxima_reuniao: e.target.checked })}
                className="rounded border-gray-300"
              />
              Revisar na próxima reunião
            </label>
            {podeAtribuir && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={form.exige_validacao}
                  onChange={(e) => setForm({ ...form, exige_validacao: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Exige validação do gerente para concluir
              </label>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-6">
          <p className="text-xs text-gray-400">{faltando.length > 0 && `Falta: ${faltando.join(', ')}`}</p>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
            <button
              onClick={salvar}
              disabled={salvando || faltando.length > 0}
              className="px-4 py-2 text-sm bg-brand-500 text-white rounded-lg hover:bg-brand-600 disabled:opacity-50 flex items-center gap-2"
            >
              {salvando && <Loader2 className="w-4 h-4 animate-spin" />}
              Criar ação
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
